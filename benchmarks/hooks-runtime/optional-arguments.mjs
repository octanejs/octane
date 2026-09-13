// Untimed production hook work: the same public-root drive runs clean and with
// narrow source observers. `rest_sites_reached` is a source-path count, not a
// claim that V8 materialized every rest array as a heap object.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO = path.resolve(import.meta.dirname, '../..');
const SOURCE_REPO = path.resolve(process.argv[2] ?? REPO);
const SOURCE = path.join(SOURCE_REPO, 'packages/octane/src');
const requireDependencies = createRequire(path.join(REPO, 'packages/octane/package.json'));
const { build } = requireDependencies('esbuild');
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const CYCLES = 128;
const WORK_KEY = '__octaneHookArgumentWork';
const stamp = (score) => ({ score, median: score, min: score, samples: 1 });

function implementationRestParameter(source, name) {
	const needle = `export function ${name}`;
	let offset = 0;
	while ((offset = source.indexOf(needle, offset)) !== -1) {
		const open = source.indexOf('(', offset + needle.length);
		let depth = 1;
		let close = open + 1;
		while (depth > 0 && close < source.length) {
			if (source[close] === '(') depth++;
			else if (source[close] === ')') depth--;
			close++;
		}
		assert.equal(depth, 0, `${name}: unbalanced source signature`);
		const trailing = source.slice(close).match(/^\s*:\s*[^;{\n]+([;{])/);
		assert.ok(trailing, `${name}: unexpected source signature`);
		if (trailing[1] === '{') return source.slice(open + 1, close - 1).includes('...');
		offset = close;
	}
	throw new Error(`Missing ${name} implementation`);
}

const restParameters = {};
for (const [filename, label] of [
	['runtime.ts', 'client'],
	['runtime.server.ts', 'server'],
	['universal-core.ts', 'universal'],
]) {
	const source = fs.readFileSync(path.join(SOURCE, filename), 'utf8');
	for (const name of ['useSyncExternalStore', 'useDeferredValue']) {
		restParameters[`${label}.${name}`] = Number(implementationRestParameter(source, name));
	}
}

function observeHookCreations(source) {
	let arrays = 0;
	const lines = source.split('\n').map((line) => {
		if (line.trimStart().startsWith('//') || !line.includes('[inst, subscribe]')) return line;
		arrays++;
		return line.replace(
			'[inst, subscribe]',
			`((globalThis.${WORK_KEY}.depsCreated++), [inst, subscribe])`,
		);
	});
	assert.ok(arrays > 0, 'source must retain the uSES subscribe dependency creation site');
	const marked = lines.join('\n');
	assert.ok(
		marked.includes('enqueueEffectEventUpdate({'),
		'Effect Event publication must retain a queued versioned payload',
	);
	return marked.replace(
		'\t\tenqueueEffectEventUpdate({',
		`\t\tglobalThis.${WORK_KEY}.eventEntries++;\n\t\tenqueueEffectEventUpdate({`,
	);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hook-arguments-'));
async function bundleRuntime(filename, observed) {
	const outfile = path.join(scratch, filename);
	await build({
		entryPoints: [path.join(SOURCE, 'runtime.ts')],
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		minify: true,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(REPO, 'packages/octane/node_modules'), path.join(REPO, 'node_modules')],
		...(observed
			? {
					plugins: [
						{
							name: 'observe-hook-source-work',
							setup(plugin) {
								plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: sourceFile }) => ({
									contents: observeHookCreations(fs.readFileSync(sourceFile, 'utf8')),
									loader: 'ts',
								}));
							},
						},
					],
				}
			: {}),
	});
	return pathToFileURL(outfile).href;
}

const window = new Window({ url: 'http://localhost/' });
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MouseEvent',
	'MutationObserver',
]) {
	globalThis[name] = name === 'window' ? window : window[name];
}

async function drive(runtime, observed) {
	const calls = { renders: 0, reads: 0, starts: 0, stops: 0, wrappers: [] };
	let value = 'same';
	let notify;
	const getSnapshot = () => {
		calls.reads++;
		return value;
	};
	const subscribe = (handler) => {
		calls.starts++;
		notify = handler;
		return () => {
			calls.stops++;
			notify = undefined;
		};
	};
	const replacementSubscribe = (handler) => {
		calls.starts++;
		notify = handler;
		return () => {
			calls.stops++;
			notify = undefined;
		};
	};
	const storeSlot = Symbol('store');
	const deferredSlot = Symbol('deferred');
	const eventSlot = Symbol('event');
	function App(props) {
		calls.renders++;
		const store = runtime.useSyncExternalStore(props.subscribe, getSnapshot, undefined, storeSlot);
		const deferred = runtime.useDeferredValue(props.value, deferredSlot);
		const event = runtime.useEffectEvent(() => props.tick, eventSlot);
		calls.wrappers.push(event);
		return runtime.createElement('output', null, store + '/' + deferred);
	}
	const container = document.createElement('div');
	const root = runtime.createRoot(container);
	try {
		root.render(App, { value: 'same', tick: 0, subscribe });
		runtime.flushSync(() => {});
		runtime.drainPassiveEffects();
		assert.equal(container.textContent, 'same/same');
		assert.equal(calls.starts, 1);
		globalThis[WORK_KEY] = { depsCreated: 0, eventEntries: 0 };
		let mapGets = 0;
		const originalMapGet = Map.prototype.get;
		if (process.env.OCTANE_HOOK_ARGUMENT_MAPS === '1') {
			Map.prototype.get = function (key) {
				mapGets++;
				return originalMapGet.call(this, key);
			};
		}
		try {
			for (let tick = 1; tick <= CYCLES; tick++) {
				runtime.flushSync(() => root.render(App, { value: 'same', tick, subscribe }));
				assert.equal(container.textContent, 'same/same');
			}
		} finally {
			Map.prototype.get = originalMapGet;
		}
		const work = { ...globalThis[WORK_KEY] };
		assert.equal(calls.renders, CYCLES + 1);
		assert.equal(new Set(calls.wrappers).size, calls.renders);
		assert.equal(calls.wrappers[0](), CYCLES, 'a prior wrapper reads the committed callback');
		assert.equal(calls.starts, 1, 'stable subscribe stays connected');
		runtime.flushSync(() =>
			root.render(App, { value: 'same', tick: CYCLES + 1, subscribe: replacementSubscribe }),
		);
		runtime.drainPassiveEffects();
		assert.equal(calls.starts, 2, 'a changed subscribe connects the new store');
		assert.equal(calls.stops, 1, 'a changed subscribe disconnects the old store');
		value = 'next';
		notify();
		runtime.flushSync(() => {});
		assert.equal(container.textContent, 'next/same');
		assert.equal(calls.starts, 2);
		const finalText = container.textContent;
		root.unmount();
		assert.equal(calls.stops, 2);
		return {
			stableRenders: CYCLES,
			callbackWrappers: CYCLES,
			mapGets,
			...work,
			finalText,
			connections: calls.starts,
			disconnections: calls.stops,
			observed,
		};
	} finally {
		root.unmount();
	}
}

try {
	const cleanPath = await bundleRuntime('clean.mjs', false);
	const observedPath = await bundleRuntime('observed.mjs', true);
	const clean = await drive(await import(cleanPath), false);
	const observed = await drive(await import(observedPath), true);
	for (const name of [
		'stableRenders',
		'callbackWrappers',
		'finalText',
		'connections',
		'disconnections',
	]) {
		assert.deepEqual(observed[name], clean[name], `${name}: observer changed semantics`);
	}
	assert.equal(observed.eventEntries, CYCLES, 'one versioned event entry per update');
	const sourceRestCalls =
		CYCLES *
		(restParameters['client.useSyncExternalStore'] + restParameters['client.useDeferredValue']);
	const cleanBytes = fs.readFileSync(path.join(scratch, 'clean.mjs'));
	if (process.env.OCTANE_HOOK_ARGUMENT_SAVE_BUNDLE) {
		fs.copyFileSync(path.join(scratch, 'clean.mjs'), process.env.OCTANE_HOOK_ARGUMENT_SAVE_BUNDLE);
	}
	const report = {
		suite: 'hooks-runtime',
		targets: [
			{
				name: 'argument-client',
				ops: {
					rest_sites_reached: stamp(sourceRestCalls),
					subscribe_deps_arrays: stamp(observed.depsCreated),
					effect_event_entries: stamp(observed.eventEntries),
					effect_event_wrappers: stamp(observed.callbackWrappers),
				},
				meta: {
					restParameters,
					clean,
					observed,
					bytes: {
						raw: cleanBytes.length,
						gzip: gzipSync(cleanBytes, { level: 9 }).length,
						sha256: createHash('sha256').update(cleanBytes).digest('hex'),
					},
				},
			},
			{
				name: 'argument-work-budget',
				ops: {
					rest_sites_reached: stamp(1),
					subscribe_deps_arrays: stamp(1),
					effect_event_entries: stamp(CYCLES),
					effect_event_wrappers: stamp(CYCLES),
				},
			},
		],
	};
	const output = JSON.stringify(report, null, 2) + '\n';
	if (process.env.BENCH_JSON) fs.writeFileSync(path.resolve(process.env.BENCH_JSON), output);
	await new Promise((done) => process.stdout.write(output, done));
} finally {
	delete globalThis[WORK_KEY];
	fs.rmSync(scratch, { recursive: true, force: true });
	await window.happyDOM.close();
}
// Each independently bundled runtime owns a MessageChannel scheduler. After
// both roots and the DOM are closed, release those otherwise live Node ports.
process.exit(0);
