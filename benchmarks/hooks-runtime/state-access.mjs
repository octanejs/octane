import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Actual production runtime, with ordinary and observed executions kept apart.
// Map probes count the canonical state/reducer stores identified at insertion;
// they do not count unrelated scheduler, DOM, or user Maps.
const repo = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(process.env.OCTANE_HOOKS_ROOT || repo);
const output = join(repo, 'node_modules/.cache/octane-hooks-state');
await mkdir(output, { recursive: true });
const built = await build({
	stdin: {
		contents:
			"export {createRoot, createElement, flushSync, useState, __useStateWithGetter, useReducer, __useReducerWithGetter, withSlot} from './packages/octane/src/runtime.ts';",
		resolveDir: sourceRoot,
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	nodePaths: [join(repo, 'packages/octane/node_modules'), join(repo, 'node_modules')],
});
const code = built.outputFiles[0].text;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const bundleFile = join(output, digest(code) + '.mjs');
await writeFile(bundleFile, code);

async function exercise(observed, getter, nested) {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Comment',
		'Text',
		'Event',
		'MouseEvent',
		'CustomEvent',
		'MutationObserver',
	])
		globalThis[name] = name === 'window' ? window : window[name];
	const runtime = await import(
		pathToFileURL(bundleFile).href + `?observed=${observed}&getter=${getter}&nested=${nested}`
	);
	const stateKey = Symbol('state-access-state');
	const reducerKey = Symbol('state-access-reducer');
	const outerKey = Symbol('state-access-outer');
	const stores = new WeakSet();
	const nativeGet = Map.prototype.get;
	const nativeSet = Map.prototype.set;
	let reads = 0;
	let active = false;
	let controls;
	const results = [];
	function capture(run) {
		if (!observed) return run();
		Map.prototype.set = function (key, value) {
			if (value && (typeof value.setter === 'function' || typeof value.dispatch === 'function'))
				stores.add(this);
			return nativeSet.call(this, key, value);
		};
		Map.prototype.get = function (key) {
			if (active && stores.has(this)) reads++;
			return nativeGet.call(this, key);
		};
		active = true;
		try {
			return run();
		} finally {
			active = false;
			Map.prototype.get = nativeGet;
			Map.prototype.set = nativeSet;
		}
	}
	function useCounters(step) {
		const state = getter
			? runtime.__useStateWithGetter(1, stateKey)
			: runtime.useState(1, stateKey);
		const reducer = getter
			? runtime.__useReducerWithGetter(
					(value, amount) => value + amount * step,
					2,
					undefined,
					reducerKey,
				)
			: runtime.useReducer((value, amount) => value + amount * step, 2, undefined, reducerKey);
		return { state, reducer };
	}
	function App(props) {
		controls = nested
			? runtime.withSlot(outerKey, useCounters, props.step)
			: useCounters(props.step);
		return runtime.createElement(
			'output',
			null,
			`${controls.state[0]}:${controls.reducer[0]}:${props.tick}`,
		);
	}
	const container = window.document.createElement('div');
	window.document.body.appendChild(container);
	const root = runtime.createRoot(container);
	capture(() => root.render(App, { step: 1, tick: 0 }));
	assert.equal(container.textContent, '1:2:0');
	const element = container.firstChild;
	const first = controls;
	reads = 0;
	for (let tick = 1; tick <= 64; tick++) {
		capture(() => runtime.flushSync(() => root.render(App, { step: tick, tick })));
		assert.equal(container.textContent, `1:2:${tick}`);
		assert.equal(container.firstChild, element);
		assert.equal(controls.state[1], first.state[1]);
		assert.equal(controls.reducer[1], first.reducer[1]);
		if (getter) {
			assert.equal(controls.state[2], first.state[2]);
			assert.equal(controls.reducer[2], first.reducer[2]);
		}
	}
	const updateReads = reads;
	const state = controls.state;
	const reducer = controls.reducer;
	runtime.flushSync(() => {
		state[1]((value) => value + 3);
		reducer[1](2);
	});
	assert.equal(container.textContent, '4:130:64');
	if (getter) {
		assert.equal(first.state[2](), 4);
		assert.equal(first.reducer[2](), 130);
	}
	results.push(
		container.textContent,
		getter ? first.state[2]() : controls.state[0],
		getter ? first.reducer[2]() : controls.reducer[0],
	);
	root.unmount();
	assert.equal(container.childNodes.length, 0);
	await window.happyDOM.close();
	return { results, updateReads };
}

const cases = {};
for (const getter of [false, true]) {
	for (const nested of [false, true]) {
		const name = `${getter ? 'getter' : 'pair'}-${nested ? 'nested' : 'direct'}`;
		const clean = await exercise(false, getter, nested);
		const observed = await exercise(true, getter, nested);
		assert.deepEqual(observed.results, clean.results);
		cases[name] = {
			hook_map_reads: observed.updateReads,
			semanticHash: digest(JSON.stringify(clean.results)),
		};
	}
}
const source = await readFile(join(sourceRoot, 'packages/octane/src/runtime.ts'), 'utf8');
const report = {
	sourceRoot,
	node: process.version,
	sourceHash: digest(source),
	bundle: {
		hash: digest(code),
		minified: Buffer.byteLength(code),
		gzip: gzipSync(code, { level: 9 }).length,
	},
	cases,
};
console.log(JSON.stringify(report, null, 2));
if (process.env.BENCH_JSON) {
	const value = (score) => ({ score, median: score, min: score, samples: 1 });
	const targets = [];
	for (const [name, row] of Object.entries(cases)) {
		targets.push({
			name: `state-access-${name}`,
			ops: { hook_map_reads: value(row.hook_map_reads) },
			meta: { ...row, sourceHash: report.sourceHash, bundle: report.bundle },
		});
	}
	targets.push({ name: 'state-access-budget', ops: { hook_map_reads: value(128) } });
	await writeFile(
		process.env.BENCH_JSON,
		JSON.stringify({ suite: 'hooks-runtime', targets }, null, 2),
	);
}
