import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
assert.ok(process.argv[2], 'Pass the output directory from build.mjs');
const output = path.resolve(process.argv[2]);
const buildPath = path.join(output, 'build-report.json');
const buildBytes = fs.readFileSync(buildPath);
const report = JSON.parse(buildBytes);
assert.deepEqual(tree(path.join(repo, 'examples/signal-chat')), report.source);
assert.deepEqual(tree(path.join(output, 'project')), report.projectSource);
assert.deepEqual(toolchain(repo), report.toolchain);
assert.deepEqual(tree(path.join(output, 'project/dist'), new Set()), report.artifactFiles);
for (const [name, hash] of Object.entries(report.sharedInputs))
	assert.equal(digest(fs.readFileSync(path.join(here, '../metrics-shared-view', name))), hash);
for (const [name, hash] of Object.entries(report.candidateInputs))
	assert.equal(digest(fs.readFileSync(path.join(here, name))), hash);

const manifest = JSON.parse(report.clientManifest);
const entries = Object.keys(manifest);
const entry = entries.find((key) => key.endsWith('virtual:octane-hydrate'));
const candidate = entries.find((key) => key === 'src/candidate-activator.ts');
const metrics = 'src/App.tsrx?octane-hydrate=4';
assert.ok(entry && candidate && manifest[metrics]);
const runtime = manifest[metrics].imports.find((key) => key.includes('_runtime-'));
assert.ok(runtime, 'The ordinary Metrics fallback must retain the renderer');
function closure(root, includeDynamic) {
	const seen = new Set();
	function visit(key) {
		assert.ok(manifest[key], `Missing graph dependency: ${key}`);
		if (seen.has(key)) return;
		seen.add(key);
		for (const next of manifest[key].imports ?? []) visit(next);
		if (includeDynamic) for (const next of manifest[key].dynamicImports ?? []) visit(next);
	}
	visit(root);
	return [...seen];
}
const staticEntry = closure(entry, false);
const all = closure(entry, true);
const candidateStatic = closure(candidate, false);
const metricsStatic = closure(metrics, false);
assert.ok(!staticEntry.includes(runtime), 'The entry must not eagerly import the renderer');
assert.ok(
	!candidateStatic.includes(runtime),
	'The binding candidate must not eagerly import the renderer',
);
assert.ok(
	metricsStatic.includes(runtime),
	'The normal Metrics activation must still import the renderer',
);
assert.ok(all.includes(metrics) && all.includes(candidate), 'Both choices must be reachable');
assert.ok(
	manifest[candidate].dynamicImports?.includes(metrics),
	'The candidate must retain a lazy edge to the original Metrics activator',
);
const clientRoot = path.join(output, 'project/dist/client');
const files = (keys) =>
	[...new Set(keys.map((key) => manifest[key].file).filter((file) => file.endsWith('.js')))].sort();
const emittedJs = Object.keys(tree(clientRoot, new Set()))
	.filter((file) => file.endsWith('.js'))
	.sort();
assert.deepEqual(
	files(all),
	emittedJs,
	'The full reachable graph must include every emitted JS file',
);
function sizes(names) {
	const assets = Object.fromEntries(
		names.map((name) => {
			const bytes = fs.readFileSync(path.join(clientRoot, name));
			return [
				name,
				{ raw: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length, sha256: digest(bytes) },
			];
		}),
	);
	return {
		assets,
		raw: Object.values(assets).reduce((n, value) => n + value.raw, 0),
		gzip9: Object.values(assets).reduce((n, value) => n + value.gzip9, 0),
	};
}
const css = [...new Set(all.flatMap((key) => manifest[key].css ?? []))].sort();
const emittedCss = Object.keys(tree(clientRoot, new Set()))
	.filter((file) => file.endsWith('.css'))
	.sort();
assert.deepEqual(css, emittedCss, 'All emitted CSS must be accounted for');
const emittedEntry = fs.readFileSync(path.join(clientRoot, manifest[entry].file), 'utf8');
assert.ok(emittedEntry.includes('__bindingMetrics'));
assert.ok(emittedEntry.includes(path.basename(report.metricsEmittedFile)));
const graph = {
	buildSha256: digest(buildBytes),
	entry,
	candidate,
	metrics,
	runtime,
	staticEntry: sizes(files(staticEntry)),
	candidateStatic: sizes(files(candidateStatic)),
	ordinaryMetricsStatic: sizes(files(metricsStatic)),
	allReachable: sizes(files(all)),
	css: sizes(css),
	limitation:
		'These are offline gzip sums of static graph closures, not startup requests, functional validation, or an application saving.',
};
const graphPath = path.join(output, 'graph-report.json');
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', { flag: 'wx' });
console.log(
	JSON.stringify(
		{
			output,
			graph: graphPath,
			staticEntry: graph.staticEntry.gzip9,
			candidateStatic: graph.candidateStatic.gzip9,
			ordinaryMetricsStatic: graph.ordinaryMetricsStatic.gzip9,
			allReachable: graph.allReachable.gzip9,
			css: graph.css.gzip9,
		},
		null,
		2,
	),
);
