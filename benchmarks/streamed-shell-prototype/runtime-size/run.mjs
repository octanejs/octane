import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, keep, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const source = path.join(repo, 'examples/signal-chat');
const outputArgument = process.argv.find((item) => item.startsWith('--output-dir='))?.slice(13);
const output = outputArgument
	? path.resolve(outputArgument)
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-runtime-size-'));
if (outputArgument) {
	assert.ok(!fs.existsSync(output), 'Use a new output directory');
	fs.mkdirSync(output, { recursive: true });
}
assert.ok(
	path.relative(repo, output).startsWith('..' + path.sep),
	'Output must be outside checkout',
);
const snapshot = path.join(output, 'source');
const sourceBefore = tree(source);
const toolchainBefore = toolchain(repo);
const experiment = () =>
	Object.fromEntries(Object.entries(tree(here)).filter(([name]) => name.endsWith('.mjs')));
const experimentBefore = experiment();
fs.cpSync(source, snapshot, { recursive: true, filter: keep });
assert.deepEqual(tree(snapshot), sourceBefore, 'Snapshot does not match the source');
assert.deepEqual(tree(source), sourceBefore, 'Source changed while snapshotting');
const provenance = {
	node: process.version,
	source: sourceBefore,
	sourceSha256: digest(JSON.stringify(sourceBefore)),
	toolchain: toolchainBefore,
	toolchainSha256: digest(JSON.stringify(toolchainBefore)),
	limitations:
		'Selected source and toolchain hashes do not cover installed dependencies or the operating system.',
};
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
fs.writeFileSync(
	path.join(output, 'runtime-size-provenance.json'),
	JSON.stringify(
		{ experiment: experimentBefore, experimentSha256: digest(JSON.stringify(experimentBefore)) },
		null,
		2,
	) + '\n',
);
function linkDependencies(root) {
	fs.mkdirSync(path.join(root, 'node_modules/@octanejs'), { recursive: true });
	const installed = path.join(source, 'node_modules');
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
	const root = path.join(dir, 'project');
	fs.mkdirSync(dir);
	fs.cpSync(snapshot, root, { recursive: true, filter: keep });
	linkDependencies(root);
	const log = fs.createWriteStream(path.join(dir, 'build.log'));
	const child = spawn(process.execPath, [path.join(here, 'worker.mjs'), root, dir, variant], {
		cwd: repo,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	const exit = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve({ code, signal }));
	});
	await new Promise((resolve) => log.end(resolve));
	assert.equal(
		exit.code,
		0,
		`${variant} failed (${exit.signal ?? exit.code}); see ${dir}/build.log`,
	);
	assert.deepEqual(tree(root), sourceBefore, `${variant} source changed`);
	return dir;
}
function buildStats(dir) {
	const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'client-manifest.json'), 'utf8'));
	const client = path.join(dir, 'project/dist/client');
	const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
	assert.equal(entries.length, 1, 'Expected one application hydration entry');
	function reach(includeDynamic) {
		const seen = new Set();
		function visit(key) {
			if (seen.has(key)) return;
			seen.add(key);
			const item = manifest[key];
			assert.ok(item, `Missing manifest dependency ${key}`);
			for (const imported of item.imports ?? []) visit(imported);
			if (includeDynamic) for (const imported of item.dynamicImports ?? []) visit(imported);
		}
		entries.forEach(visit);
		return seen;
	}
	function assets(keys) {
		const js = new Set();
		const css = new Set();
		for (const key of keys) {
			const item = manifest[key];
			if (item.file.endsWith('.js')) js.add(item.file);
			for (const file of item.css ?? []) css.add(file);
		}
		return { js: [...js].sort(), css: [...css].sort() };
	}
	const startup = assets(reach(false));
	const all = assets(reach(true));
	const emitted = fs
		.readdirSync(path.join(client, 'assets'))
		.filter((file) => file.endsWith('.js'))
		.map((file) => 'assets/' + file)
		.sort();
	assert.deepEqual(all.js, emitted, 'Every emitted client JS file must be counted');
	function size(files) {
		const byFile = Object.fromEntries(
			files.map((file) => {
				const bytes = fs.readFileSync(path.join(client, file));
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
			bytes: Object.values(byFile).reduce((sum, item) => sum + item.bytes, 0),
			gzip9: Object.values(byFile).reduce((sum, item) => sum + item.gzip9, 0),
		};
	}
	const independent = JSON.parse(
		fs.readFileSync(
			path.join(dir, 'project/dist/server/octane-independent-hydration.json'),
			'utf8',
		),
	);
	const widgets = Object.values(independent.widgets);
	assert.equal(widgets.length, 5, 'Expected the real route’s five independent widgets');
	for (const widget of widgets)
		assert.ok(all.js.includes(widget.moduleId), `Missing widget ${widget.moduleId}`);
	return {
		entry: entries[0],
		startupStaticJs: size(startup.js),
		dynamicReachableJs: size(all.js.filter((file) => !startup.js.includes(file))),
		allReachableJs: size(all.js),
		css: size(all.css),
		independent: { count: widgets.length, widgets },
		build: JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')),
		artifactFiles: tree(path.join(dir, 'project/dist'), new Set()),
		clientManifestSha256: digest(fs.readFileSync(path.join(dir, 'client-manifest.json'))),
		buildMetadataSha256: digest(fs.readFileSync(path.join(dir, 'build.json'))),
		chunkModulesSha256: digest(fs.readFileSync(path.join(dir, 'chunk-modules.json'))),
	};
}
const stats = {};
for (const variant of ['baseline', 'control', 'fallback']) {
	process.stderr.write(`Building ${variant}...\n`);
	stats[variant] = buildStats(await build(variant));
}
assert.deepEqual(tree(snapshot), sourceBefore, 'Snapshot changed during builds');
assert.deepEqual(tree(source), sourceBefore, 'Example changed during builds');
assert.deepEqual(toolchain(repo), toolchainBefore, 'Toolchain changed during builds');
assert.deepEqual(experiment(), experimentBefore, 'Experiment changed during builds');
const report = {
	output,
	sourceSha256: provenance.sourceSha256,
	toolchainSha256: provenance.toolchainSha256,
	stats,
	limitations:
		'Offline gzip-9 sums physical files in the Vite graph. Browser startup must be measured separately. The fallback slot is a Terser minifier control, not a shell fallback.',
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			sourceSha256: report.sourceSha256,
			toolchainSha256: report.toolchainSha256,
			experimentSha256: digest(JSON.stringify(experimentBefore)),
			variants: Object.fromEntries(
				Object.entries(stats)
					.map(([variant, s]) => [
						variant,
						{
							minifier: s.build.minifier,
							reachable: s.allReachableJs,
							static: { bytes: s.startupStaticJs.bytes, gzip9: s.startupStaticJs.gzip9 },
							dynamic: { bytes: s.dynamicReachableJs.bytes, gzip9: s.dynamicReachableJs.gzip9 },
							css: { bytes: s.css.bytes, gzip9: s.css.gzip9 },
							widgets: s.independent.count,
						},
					])
					.map(([name, data]) => [
						name,
						{ ...data, reachable: { bytes: data.reachable.bytes, gzip9: data.reachable.gzip9 } },
					]),
			),
		},
		null,
		2,
	),
);
