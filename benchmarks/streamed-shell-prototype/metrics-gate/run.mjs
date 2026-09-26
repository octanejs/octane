import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { digest, keep, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const source = path.join(repo, 'examples/signal-chat');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-metrics-gate-'));
const sourceBefore = tree(source);
const toolchainBefore = toolchain(repo);
const scripts = () =>
	Object.fromEntries(
		['run.mjs', 'worker.mjs'].map((name) => [name, digest(fs.readFileSync(path.join(here, name)))]),
	);
const scriptsBefore = scripts();
const snapshot = path.join(output, 'source');
fs.cpSync(source, snapshot, { recursive: true, filter: keep });
assert.deepEqual(tree(snapshot), sourceBefore, 'Snapshot differs from source');
assert.deepEqual(tree(source), sourceBefore, 'Source changed during snapshot');

function linkDependencies(root) {
	fs.mkdirSync(path.join(root, 'node_modules/@octanejs'), { recursive: true });
	for (const name of ['octane', '@octanejs/app-core', '@octanejs/vite-plugin']) {
		fs.symlinkSync(
			fs.realpathSync(path.join(source, 'node_modules', name)),
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

async function build(name, variant) {
	const dir = path.join(output, name);
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
	assert.equal(exit.code, 0, `${name} failed (${exit.signal ?? exit.code}); see ${dir}/build.log`);
	assert.deepEqual(tree(root), sourceBefore, `${name} copied app source changed`);
	return dir;
}

async function inspect(dir) {
	const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'client-manifest.json')));
	const chunks = JSON.parse(fs.readFileSync(path.join(dir, 'chunk-modules.json')));
	const client = path.join(dir, 'project/dist/client');
	const keys = Object.keys(manifest);
	function one(predicate, label) {
		const found = keys.filter(predicate);
		assert.equal(found.length, 1, `Expected one ${label}, got ${found.join(', ')}`);
		return found[0];
	}
	const entry = one((key) => manifest[key].isEntry, 'hydration entry');
	const app = one((key) => key === 'src/App.tsrx', 'route');
	const metrics = one((key) => key === 'src/App.tsrx?octane-hydrate=4', 'Metrics island');
	const pre = one((key) => key === 'src/pre-hydrate.ts', 'preHydrate hook');
	const hydration = one((key) => key.startsWith('_hydration-'), 'island bootstrap');
	const signals = one((key) => key.endsWith('/hydration/streamed-signals.ts'), 'stream owner');
	const runtimeFiles = Object.entries(chunks)
		.filter(([, chunk]) =>
			chunk.modules.some((name) => name.endsWith('/packages/octane/src/runtime.ts')),
		)
		.map(([file]) => file);
	assert.equal(runtimeFiles.length, 1, 'Expected one emitted runtime chunk');
	const runtime = one((key) => manifest[key].file === runtimeFiles[0], 'runtime chunk');
	assert.ok(
		manifest[entry].imports?.includes(runtime),
		'Root bootstrap must statically import runtime',
	);
	const metricsChunk = chunks[manifest[metrics].file];
	assert.ok(metricsChunk, 'Metrics chunk missing');
	const diagnostic = JSON.parse(fs.readFileSync(path.join(dir, 'build.json')));
	assert.equal(
		metricsChunk.modules.some((name) => name.endsWith('/src/Metrics.tsrx')),
		diagnostic.variant === 'baseline',
		'Metrics substitution must affect only the client activation',
	);
	function reach(roots, { dynamic = false, cutRootRuntime = false } = {}) {
		const seen = new Set();
		function visit(key) {
			if (seen.has(key)) return;
			const item = manifest[key];
			assert.ok(item, `Missing graph node ${key}`);
			seen.add(key);
			for (const next of item.imports ?? []) {
				if (cutRootRuntime && key === entry && next === runtime) continue;
				visit(next);
			}
			if (dynamic) for (const next of item.dynamicImports ?? []) visit(next);
		}
		roots.forEach(visit);
		return seen;
	}
	function assets(seen, field = 'js') {
		const files = new Set();
		for (const key of seen) {
			const item = manifest[key];
			if (field === 'js' && item.file.endsWith('.js')) files.add(item.file);
			if (field === 'css') for (const file of item.css ?? []) files.add(file);
		}
		return [...files].sort();
	}
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
	const staticKeys = reach([entry]);
	// Model the known default-route bootstrap requests; this is not a browser measurement.
	const defaultKeys = reach([entry, app, pre, hydration, signals, metrics]);
	// This is an analytical edge cut, not a changed executable: the actual entry
	// still imports runtime and SSR still preloads App in every emitted variant.
	const rootDeferredKeys = reach([entry, pre, hydration, signals, metrics], {
		cutRootRuntime: true,
	});
	assert.ok(defaultKeys.has(runtime), 'Real root must still reach the renderer');
	assert.equal(
		rootDeferredKeys.has(runtime),
		diagnostic.variant === 'baseline',
		'The Metrics-only control must distinguish the root and island gates',
	);
	const allKeys = reach([entry], { dynamic: true });
	const allFiles = assets(allKeys);
	const emitted = fs
		.readdirSync(path.join(client, 'assets'))
		.filter((file) => file.endsWith('.js'))
		.map((file) => 'assets/' + file)
		.sort();
	assert.deepEqual(allFiles, emitted, 'All emitted JS must be accounted for');
	const independent = JSON.parse(
		fs.readFileSync(path.join(dir, 'project/dist/server/octane-independent-hydration.json')),
	);
	assert.equal(Object.keys(independent.widgets).length, 5, 'Expected five real island records');
	assert.ok(
		Object.values(independent.widgets).some((widget) => widget.moduleId === manifest[metrics].file),
		'Metrics record missing',
	);
	const { handler } = await import(
		pathToFileURL(path.join(dir, 'project/dist/server/entry.js')).href
	);
	const response = await handler(
		new Request(
			'http://localhost/?auth=0&answer=0&history=0&interval=0&waves=1&turns=1&historyRows=1&run=metrics-graph',
		),
	);
	assert.equal(response.status, 200);
	const html = await response.text();
	for (const marker of [
		'data-lab-shell',
		'data-history',
		'data-answer',
		'data-tools',
		'Capture measurements',
		'__octaneStreamedRenderer.receive(',
	])
		assert.ok(html.includes(marker), `Missing real SSR content ${marker}`);
	assert.equal((html.match(/data-octane-independent/g) ?? []).length, 5);
	assert.equal((html.match(/data-octane-hydrate-when="load"/g) ?? []).length, 1);
	assert.ok(html.includes(manifest[metrics].file), 'SSR must reference the emitted Metrics island');
	assert.ok(
		html.includes(`rel="modulepreload" href="/${manifest[app].file}"`),
		'SSR must preload the route',
	);
	const metricsMarkup = html.match(
		/<section class="metrics" aria-label="Capture measurements">[\s\S]*?<\/section>/,
	)?.[0];
	assert.ok(metricsMarkup, 'Expected the real Metrics server markup');
	const metricsText = metricsMarkup
		.replace(/<!--[\s\S]*?-->|<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	fs.writeFileSync(path.join(dir, 'server.html'), html);
	return {
		entry,
		entryFile: manifest[entry].file,
		app,
		metrics,
		pre,
		hydration,
		signals,
		runtime,
		staticEntry: size(assets(staticKeys)),
		defaultRouteModel: size(assets(defaultKeys)),
		rootDeferredCounterfactual: size(assets(rootDeferredKeys)),
		allReachable: size(allFiles),
		lazyFromDefaultModel: size(allFiles.filter((file) => !assets(defaultKeys).includes(file))),
		css: size(assets(allKeys, 'css')),
		runtimeInDefaultModel: defaultKeys.has(runtime),
		runtimeInRootDeferredCounterfactual: rootDeferredKeys.has(runtime),
		independentCount: Object.keys(independent.widgets).length,
		ssr: {
			bytes: Buffer.byteLength(html),
			sha256: digest(html),
			metricsText,
			appPreload: manifest[app].file,
			metricsModule: manifest[metrics].file,
		},
		artifactFiles: tree(path.join(dir, 'project/dist'), new Set()),
		manifestSha256: digest(fs.readFileSync(path.join(dir, 'client-manifest.json'))),
		chunkModulesSha256: digest(fs.readFileSync(path.join(dir, 'chunk-modules.json'))),
		buildSha256: digest(fs.readFileSync(path.join(dir, 'build.json'))),
		diagnostic,
	};
}

const stats = {};
for (const [name, variant] of [
	['baseline', 'baseline'],
	['repeat', 'baseline'],
	['stub', 'stub'],
]) {
	process.stderr.write(`Building ${name}...\n`);
	stats[name] = await inspect(await build(name, variant));
}
assert.deepEqual(tree(snapshot), sourceBefore, 'Snapshot changed during builds');
assert.deepEqual(tree(source), sourceBefore, 'App source changed during builds');
assert.deepEqual(toolchain(repo), toolchainBefore, 'Selected toolchain changed during builds');
assert.deepEqual(scripts(), scriptsBefore, 'Experiment scripts changed during builds');
const cssHashes = (report) =>
	Object.values(report.css.files)
		.map((item) => item.sha256)
		.sort();
assert.deepEqual(cssHashes(stats.baseline), cssHashes(stats.repeat), 'Baseline CSS changed');
assert.deepEqual(cssHashes(stats.baseline), cssHashes(stats.stub), 'Candidate CSS changed');
assert.equal(
	stats.baseline.ssr.metricsText,
	stats.repeat.ssr.metricsText,
	'Baseline Metrics SSR differs',
);
assert.equal(
	stats.baseline.ssr.metricsText,
	stats.stub.ssr.metricsText,
	'Stub changed Metrics SSR text',
);
const withoutEntry = (value) =>
	Object.fromEntries(
		Object.entries(value.allReachable.files).filter(([file]) => file !== value.entryFile),
	);
assert.deepEqual(
	withoutEntry(stats.baseline),
	withoutEntry(stats.repeat),
	'Repeated build differs outside its bootstrap',
);
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const normalizeEntry = (name) => {
	const bytes = fs.readFileSync(
		path.join(output, name, 'project/dist/client', stats[name].entryFile),
		'utf8',
	);
	assert.equal((bytes.match(uuid) ?? []).length, 1, `${name}: expected one build UUID`);
	return bytes.replace(uuid, '<build-id>');
};
const normalizedEntry = normalizeEntry('baseline');
assert.equal(
	normalizedEntry,
	normalizeEntry('repeat'),
	'Baseline bootstrap differs beyond build identity',
);
const report = {
	output,
	node: process.version,
	source: sourceBefore,
	sourceSha256: digest(JSON.stringify(sourceBefore)),
	toolchain: toolchainBefore,
	toolchainSha256: digest(JSON.stringify(toolchainBefore)),
	scripts: scriptsBefore,
	baselineNormalizedEntrySha256: digest(normalizedEntry),
	stats,
	limitations:
		'The stub is nonfunctional and has no Metrics fallback. Default-route roots are a static graph model, not observed browser requests. The root-deferred numbers cut edges analytically; no emitted bootstrap implements them. Hashes exclude installed dependencies and OS.',
};
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			variants: Object.fromEntries(
				Object.entries(stats).map(([name, value]) => [
					name,
					{
						staticGzip: value.staticEntry.gzip9,
						defaultModelGzip: value.defaultRouteModel.gzip9,
						rootDeferredCounterfactualGzip: value.rootDeferredCounterfactual.gzip9,
						allGzip: value.allReachable.gzip9,
						lazyFromDefaultModelGzip: value.lazyFromDefaultModel.gzip9,
						cssGzip: value.css.gzip9,
						runtimeInDefaultModel: value.runtimeInDefaultModel,
						runtimeInRootDeferredCounterfactual: value.runtimeInRootDeferredCounterfactual,
					},
				]),
			),
		},
		null,
		2,
	),
);
