import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, keep, toolchain, tree } from './evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const arg = (name) =>
	process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = path.resolve(arg('source-dir') ?? path.join(repo, 'examples/signal-chat'));
const outputArg = arg('output-dir');
const output = outputArg
	? path.resolve(outputArg)
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-signal-chat-route-'));
if (outputArg) {
	assert.ok(!fs.existsSync(output), 'Use a fresh output directory');
	fs.mkdirSync(output, { recursive: true });
}
const relativeOutput = path.relative(repo, output);
assert.ok(
	relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput),
	'Keep build artifacts outside the checkout',
);
const snapshot = path.join(output, 'source');
const sourceBefore = tree(source);
fs.cpSync(source, snapshot, { recursive: true, filter: keep });
assert.deepEqual(tree(snapshot), sourceBefore, 'Source changed while snapshotting');
assert.deepEqual(tree(source), sourceBefore, 'Source changed while snapshotting');
const toolchainBefore = toolchain(repo);
const provenance = {
	node: process.version,
	source: sourceBefore,
	sourceSha256: digest(JSON.stringify(sourceBefore)),
	toolchain: toolchainBefore,
	toolchainSha256: digest(JSON.stringify(toolchainBefore)),
	limitations:
		'Hashes cover the copied example, selected framework/benchmark source directories and lockfile, not every installed dependency or operating-system component.',
};
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
function linkDependencies(root) {
	fs.mkdirSync(path.join(root, 'node_modules/@octanejs'), { recursive: true });
	const installed = path.join(repo, 'examples/signal-chat/node_modules');
	for (const name of ['octane', '@octanejs/app-core', '@octanejs/vite-plugin']) {
		fs.symlinkSync(
			fs.realpathSync(path.join(installed, name)),
			path.join(root, 'node_modules', name),
			'dir',
		);
	}
	fs.symlinkSync(
		fs.realpathSync(path.join(repo, 'node_modules/vite')),
		path.join(root, 'node_modules/vite'),
		'dir',
	);
}
async function build(variant) {
	const dir = path.join(output, variant);
	fs.mkdirSync(dir);
	const root = path.join(dir, 'project');
	fs.cpSync(snapshot, root, { recursive: true, filter: keep });
	linkDependencies(root);
	const log = fs.createWriteStream(path.join(dir, 'build.log'));
	const child = spawn(
		process.execPath,
		[
			path.join(here, 'build-worker.mjs'),
			root,
			dir,
			variant === 'fallback' ? 'fallback' : 'baseline',
		],
		{
			cwd: repo,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: process.env,
		},
	);
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	const exit = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve({ code, signal }));
	});
	await new Promise((resolve) => log.end(resolve));
	assert.equal(exit.code, 0, `${variant} build failed; see ${path.join(dir, 'build.log')}`);
	assert.deepEqual(tree(root), sourceBefore, `${variant} copied source changed`);
	return dir;
}
function buildStats(dir) {
	const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'client-manifest.json'), 'utf8'));
	const clientDir = path.join(dir, 'project/dist/client');
	const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
	assert.equal(entries.length, 1, 'Expected one generated client entry');
	const reach = (includeDynamic) => {
		const seen = new Set();
		function visit(key) {
			if (seen.has(key)) return;
			seen.add(key);
			const value = manifest[key];
			assert.ok(value, `Missing manifest dependency ${key}`);
			for (const edge of value.imports ?? []) visit(edge);
			if (includeDynamic) for (const edge of value.dynamicImports ?? []) visit(edge);
		}
		entries.forEach(visit);
		return seen;
	};
	const startup = reach(false);
	const reachable = reach(true);
	function assets(keys) {
		const js = new Set();
		const css = new Set();
		for (const key of keys) {
			const value = manifest[key];
			if (value.file.endsWith('.js')) js.add(value.file);
			for (const file of value.css ?? []) css.add(file);
		}
		return { js: [...js].sort(), css: [...css].sort() };
	}
	const staticAssets = assets(startup);
	const allAssets = assets(reachable);
	const dynamicJs = allAssets.js.filter((file) => !staticAssets.js.includes(file));
	const allEmittedJs = fs
		.readdirSync(path.join(clientDir, 'assets'))
		.filter((file) => file.endsWith('.js'))
		.map((file) => `assets/${file}`)
		.sort();
	assert.deepEqual(allAssets.js, allEmittedJs, 'Account for every emitted client JS file');
	const size = (files) => {
		const byFile = Object.fromEntries(
			files.map((file) => {
				const bytes = fs.readFileSync(path.join(clientDir, file));
				return [
					file,
					{
						bytes: bytes.length,
						gzip9: gzipSync(bytes, { level: 9 }).length,
						sha256: digest(bytes),
					},
				];
			}),
		);
		return {
			files: byFile,
			bytes: Object.values(byFile).reduce((n, value) => n + value.bytes, 0),
			gzip9: Object.values(byFile).reduce((n, value) => n + value.gzip9, 0),
		};
	};
	const independent = JSON.parse(
		fs.readFileSync(
			path.join(dir, 'project/dist/server/octane-independent-hydration.json'),
			'utf8',
		),
	);
	const widgets = Object.values(independent.widgets);
	assert.equal(widgets.length, 5, 'Expected all five independent widgets');
	for (const widget of widgets)
		assert.ok(allAssets.js.includes(widget.moduleId), `Missing widget ${widget.moduleId}`);
	return {
		entry: entries[0],
		startupStaticJs: size(staticAssets.js),
		dynamicReachableJs: size(dynamicJs),
		allReachableJs: size(allAssets.js),
		css: size(allAssets.css),
		independent: { count: widgets.length, widgets },
		build: JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')),
		artifactFiles: tree(path.join(dir, 'project/dist'), new Set()),
		clientManifestSha256: digest(fs.readFileSync(path.join(dir, 'client-manifest.json'))),
		buildMetadataSha256: digest(fs.readFileSync(path.join(dir, 'build.json'))),
	};
}
const stats = {};
for (const variant of ['baseline', 'control', 'fallback']) {
	process.stderr.write(`Building ${variant}...\n`);
	stats[variant] = buildStats(await build(variant));
}
assert.deepEqual(tree(snapshot), sourceBefore, 'Snapshot changed during builds');
assert.deepEqual(toolchain(repo), toolchainBefore, 'Toolchain sources changed during builds');
const result = {
	output,
	sourceSha256: provenance.sourceSha256,
	toolchainSha256: provenance.toolchainSha256,
	stats,
	limitations:
		'Reachable sizes use the captured Vite module graph and per-file offline gzip-9; static entry dependencies are not a measurement of actual browser startup requests.',
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			sourceSha256: result.sourceSha256,
			toolchainSha256: result.toolchainSha256,
			variants: Object.fromEntries(
				Object.entries(stats).map(([name, data]) => [
					name,
					{
						reachableGzip9: data.allReachableJs.gzip9,
						staticGzip9: data.startupStaticJs.gzip9,
						dynamicGzip9: data.dynamicReachableJs.gzip9,
						cssGzip9: data.css.gzip9,
						widgets: data.independent.count,
						decisions: data.build.decisions,
					},
				]),
			),
		},
		null,
		2,
	),
);
