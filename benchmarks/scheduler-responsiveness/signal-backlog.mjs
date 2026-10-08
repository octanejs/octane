// Production native-reader/producer work. This is task-order and throughput
// evidence; browser input/paint latency belongs in the browser harness.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const repository = path.resolve(import.meta.dirname, '../..');
const source = path.resolve(
	process.argv.find((arg, i) => i > 1 && !arg.startsWith('--')) ?? repository,
);
const report = process.argv.includes('--report');
const dependencies = createRequire(path.join(repository, 'packages/octane/package.json'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-signal-backlog-'));
const outfile = path.join(scratch, 'runtime.mjs');
await build({
	stdin: {
		contents: `export { createRoot, createElement, act, useLayoutEffect } from ${JSON.stringify(path.join(source, 'packages/octane/src/index.ts'))}; export { enableNativeReadCollection } from ${JSON.stringify(path.join(source, 'packages/octane/src/runtime.ts'))}; export { createScope, createResource, query, derived$, runWithSignalOwner } from ${JSON.stringify(path.join(source, 'packages/octane/src/signals/index.ts'))};`,
		resolveDir: source,
		loader: 'ts',
	},
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	alias: {
		devalue: dependencies.resolve('devalue'),
		'alien-signals': dependencies.resolve('alien-signals'),
		'alien-signals/system': dependencies.resolve('alien-signals/system'),
	},
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	url: 'https://example.test',
	pretendToBeVisual: true,
});
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
	'MutationObserver',
]) {
	globalThis[name] = name === 'window' ? dom.window : dom.window[name];
}
const runtime = await import(pathToFileURL(outfile).href);
runtime.enableNativeReadCollection();
function task(callback) {
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		channel.port2.close();
		callback();
	};
	channel.port2.postMessage(null);
}
function burn(ms) {
	const start = performance.now();
	while (performance.now() - start < ms) {}
}

async function measure(kind, producers, count, subscriberMs) {
	const owner = runtime.createScope({ scopeKey: 'signal-backlog' });
	const observed = Array.from({ length: producers }, () => []);
	const handles = [];
	const completions = [];
	const commits = [];
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	for (let i = 0; i < producers; i++) {
		const iterable = {
			[Symbol.asyncIterator]() {
				let next = 0;
				return {
					next: () =>
						gate.then(() => (next < count ? { done: false, value: next++ } : { done: true })),
					return: () => Promise.resolve({ done: true }),
				};
			},
		};
		const key = `${kind}-${i}`;
		const handle =
			kind === 'query'
				? runtime.createResource(owner, key, () =>
						runtime.query(key, () => iterable, { kind: 'stream' })(undefined),
					)
				: runtime.derived$(() => iterable, { key });
		handles.push(handle);
		runtime.runWithSignalOwner(owner, () => {
			completions.push(
				new Promise((resolve) => {
					const stop = handle.subscribe(() => {
						const snapshot = handle.snapshot();
						if (snapshot.status === 'ready' && !snapshot.complete) {
							observed[i].push(snapshot.value);
							burn(subscriberMs);
						}
						if (snapshot.complete) {
							stop();
							resolve();
						}
					});
				}),
			);
		});
	}
	const effectSlot = Symbol('commit');
	function Readers() {
		const values = runtime.runWithSignalOwner(owner, () =>
			handles.map((handle) => handle.latest(-1)),
		);
		runtime.useLayoutEffect(
			() => {
				commits.push(values);
			},
			null,
			effectSlot,
		);
		return runtime.createElement('output', null, values.join(','));
	}
	const container = document.createElement('div');
	document.body.append(container);
	const root = runtime.createRoot(container);
	try {
		root.render(Readers, {});
		await runtime.act(() => {});
		commits.length = 0;
		const start = performance.now();
		const marker = new Promise((resolve) =>
			task(() =>
				resolve({
					commits: commits.length,
					values: observed.reduce((total, values) => total + values.length, 0),
					afterMs: +(performance.now() - start).toFixed(2),
				}),
			),
		);
		release();
		await Promise.all(completions);
		await runtime.act(() => {});
		const completionMs = +(performance.now() - start).toFixed(2);
		const beforeMarker = await marker;
		assert.deepEqual(
			observed,
			Array.from({ length: producers }, () => Array.from({ length: count }, (_, i) => i)),
		);
		assert.equal(
			container.textContent,
			Array.from({ length: producers }, () => count - 1).join(','),
		);
		if (!report) {
			assert.ok(beforeMarker.commits <= 1, 'ready publications must share render admission');
			if (subscriberMs > 0)
				assert.ok(
					beforeMarker.values < producers * count,
					'producer budget must allow the marker before exhaustion',
				);
		}
		return {
			kind,
			producers,
			count,
			subscriberMs,
			beforeMarker,
			totalCommits: commits.length,
			completionMs,
		};
	} finally {
		root.unmount();
		owner.dispose();
		container.remove();
		await runtime.act(() => {});
	}
}
try {
	for (const kind of ['query', 'derived']) {
		for (const subscriberMs of [0, 2])
			console.log(JSON.stringify(await measure(kind, 1, 100, subscriberMs)));
	}
	console.log(JSON.stringify(await measure('query', 12, 10, 2)));
} finally {
	dom.window.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
