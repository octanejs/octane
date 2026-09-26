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
const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-metrics-shared-')));
const baseline = tree(source);
const inputs = tree(here);
const tools = toolchain(repo);
const snapshot = path.join(output, 'source');
fs.cpSync(source, snapshot, { recursive: true, filter: keep });
assert.deepEqual(tree(snapshot), baseline, 'The source snapshot must match the example');
const projects = {};
for (const mode of ['original', 'shared']) {
	const directory = path.join(output, mode);
	const project = path.join(directory, 'project');
	fs.mkdirSync(directory);
	fs.cpSync(snapshot, project, { recursive: true, filter: keep });
	if (mode === 'shared') {
		for (const name of ['Metrics.tsrx', 'MetricsFrame.tsrx'])
			fs.copyFileSync(path.join(here, name), path.join(project, 'src', name));
	}
	const before = tree(project);
	const expected = { ...baseline };
	if (mode === 'shared') {
		expected['src/Metrics.tsrx'] = inputs['Metrics.tsrx'];
		expected['src/MetricsFrame.tsrx'] = inputs['MetricsFrame.tsrx'];
	}
	assert.deepEqual(before, expected, `${mode} must differ only in the Metrics presentation`);
	fs.mkdirSync(path.join(project, 'node_modules/@octanejs'), { recursive: true });
	for (const name of ['octane', '@octanejs/app-core', '@octanejs/vite-plugin'])
		fs.symlinkSync(
			fs.realpathSync(path.join(source, 'node_modules', name)),
			path.join(project, 'node_modules', name),
			'dir',
		);
	fs.symlinkSync(
		fs.realpathSync(path.join(repo, 'node_modules/vite')),
		path.join(project, 'node_modules/vite'),
		'dir',
	);
	process.stderr.write(`Building ${mode}...\n`);
	const log = fs.createWriteStream(path.join(directory, 'build.log'));
	const child = spawn(
		process.execPath,
		[
			path.join(repo, 'benchmarks/streamed-shell-prototype/signal-chat-route/build-worker.mjs'),
			project,
			directory,
			'baseline',
		],
		{ cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
	);
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	const code = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', resolve);
	});
	await new Promise((resolve) => log.end(resolve));
	assert.equal(code, 0, `Build failed: ${path.join(directory, 'build.log')}`);
	assert.deepEqual(tree(project), before, `${mode} source changed while building`);
	const manifest = JSON.parse(
		fs.readFileSync(path.join(directory, 'client-manifest.json'), 'utf8'),
	);
	const independent = JSON.parse(
		fs.readFileSync(path.join(project, 'dist/server/octane-independent-hydration.json'), 'utf8'),
	);
	const widgets = Object.values(independent.widgets);
	assert.equal(widgets.length, 5, `${mode} must retain five independent islands`);
	for (const widget of widgets)
		assert.ok(
			Object.values(manifest).some((entry) => entry.file === widget.moduleId),
			`${mode} missing independent island`,
		);
	const entry = Object.keys(manifest).filter((key) => manifest[key].isEntry);
	assert.equal(entry.length, 1, `${mode} must have one generated client entry`);
	function reachable(dynamic) {
		const visited = new Set();
		function visit(key) {
			if (visited.has(key)) return;
			const record = manifest[key];
			assert.ok(record, `Missing manifest dependency ${key}`);
			visited.add(key);
			for (const next of record.imports ?? []) visit(next);
			if (dynamic) for (const next of record.dynamicImports ?? []) visit(next);
		}
		entry.forEach(visit);
		return visited;
	}
	function files(keys) {
		const js = new Set();
		const css = new Set();
		for (const key of keys) {
			const record = manifest[key];
			if (record.file.endsWith('.js')) js.add(record.file);
			for (const file of record.css ?? []) css.add(file);
		}
		return { js: [...js].sort(), css: [...css].sort() };
	}
	const staticFiles = files(reachable(false));
	const allFiles = files(reachable(true));
	const clientRoot = path.join(project, 'dist/client');
	const emittedJs = Object.keys(tree(clientRoot, new Set())).filter((file) => file.endsWith('.js'));
	assert.deepEqual(allFiles.js, emittedJs.sort(), `${mode} graph must account for every JS file`);
	function sizes(names) {
		const assets = Object.fromEntries(
			names.map((file) => {
				const data = fs.readFileSync(path.join(clientRoot, file));
				return [
					file,
					{ bytes: data.length, gzip9: gzipSync(data, { level: 9 }).length, sha256: digest(data) },
				];
			}),
		);
		return {
			assets,
			bytes: Object.values(assets).reduce((total, asset) => total + asset.bytes, 0),
			gzip9: Object.values(assets).reduce((total, asset) => total + asset.gzip9, 0),
		};
	}
	const graph = {
		entry: entry[0],
		static: sizes(staticFiles.js),
		dynamic: sizes(allFiles.js.filter((file) => !staticFiles.js.includes(file))),
		all: sizes(allFiles.js),
		css: sizes(allFiles.css),
	};
	projects[mode] = {
		source: before,
		artifacts: tree(path.join(project, 'dist'), new Set()),
		manifestSha256: digest(fs.readFileSync(path.join(directory, 'client-manifest.json'))),
		buildSha256: digest(fs.readFileSync(path.join(directory, 'build.json'))),
		widgets,
		graph,
	};
}
const cssHashes = (project) =>
	Object.values(project.graph.css.assets)
		.map((asset) => asset.sha256)
		.sort();
assert.deepEqual(
	cssHashes(projects.original),
	cssHashes(projects.shared),
	'Stylesheet bytes must be identical',
);
const islandMetadata = (project) => project.widgets.map(({ moduleId, ...metadata }) => metadata);
assert.deepEqual(
	islandMetadata(projects.original),
	islandMetadata(projects.shared),
	'Independent island metadata changed beyond emitted module filenames',
);
assert.deepEqual(tree(source), baseline, 'The original example changed during the builds');
assert.deepEqual(tree(snapshot), baseline, 'The input snapshot changed during the builds');
assert.deepEqual(tree(here), inputs, 'The benchmark inputs changed during the builds');
assert.deepEqual(toolchain(repo), tools, 'The selected toolchain changed during the builds');
const report = {
	output,
	node: process.version,
	source: baseline,
	inputs,
	toolchain: tools,
	projects,
	limitations:
		'Selected source, lockfile, benchmark and emitted files are hashed; installed dependencies and OS are not fully captured.',
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{ output, sourceSha256: digest(JSON.stringify(baseline)), modes: Object.keys(projects) },
		null,
		2,
	),
);
