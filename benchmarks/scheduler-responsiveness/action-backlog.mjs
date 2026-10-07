// Deterministic Action/render work, separate from browser latency measurements.
// Pass a source checkout to compare the same workload with another revision.
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
const dependencies = createRequire(path.join(repository, 'packages/octane/package.json'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-action-backlog-'));
const outfile = path.join(scratch, 'runtime.mjs');
await build({
	stdin: {
		contents: `export { createRoot, createElement, flushSync, act, startTransition, useActionState, useLayoutEffect } from ${JSON.stringify(path.join(source, 'packages/octane/src/index.ts'))};`,
		resolveDir: source,
		loader: 'ts',
	},
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	alias: { devalue: dependencies.resolve('devalue') },
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

function task(callback) {
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		channel.port2.close();
		callback();
	};
	channel.port2.postMessage(null);
}

async function measure(gated) {
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const previousStates = [];
	const commits = [];
	const stateSlot = Symbol('action');
	const effectSlot = Symbol('commit');
	let dispatch;
	function Form() {
		const [state, run, pending] = runtime.useActionState(
			(previous) => {
				previousStates.push(previous);
				return gated && previous === 0 ? gate.then(() => previous + 1) : previous + 1;
			},
			0,
			stateSlot,
		);
		dispatch = run;
		runtime.useLayoutEffect(
			() => {
				commits.push(`${state}${pending ? 'P' : ''}`);
			},
			null,
			effectSlot,
		);
		return runtime.createElement('output', null, `${state}${pending ? 'P' : ''}`);
	}
	const container = document.createElement('div');
	document.body.append(container);
	const root = runtime.createRoot(container);
	try {
		runtime.flushSync(() => root.render(Form, {}));
		commits.length = 0;
		let marker;
		if (!gated) marker = new Promise((resolve) => task(() => resolve(commits.length)));
		runtime.startTransition(() => {
			for (let i = 0; i < 100; i++) dispatch();
		});
		if (gated) {
			await runtime.act(async () => {});
			assert.equal(container.textContent, '0P');
			assert.deepEqual(previousStates, [0]);
			commits.length = 0;
			marker = new Promise((resolve) => task(() => resolve(commits.length)));
			release();
		}
		const beforeMarker = await marker;
		await runtime.act(async () => {});
		assert.equal(container.textContent, '100');
		assert.deepEqual(
			previousStates,
			Array.from({ length: 100 }, (_, i) => i),
		);
		const result = {
			scenario: gated ? 'gated backlog' : 'ready backlog',
			actions: previousStates.length,
			beforeMarker,
			commits,
		};
		console.log(JSON.stringify(result));
		if (!process.argv.includes('--report')) {
			assert.ok(beforeMarker <= (gated ? 0 : 1), 'result rendering must yield to the marker task');
			assert.ok(commits.length <= (gated ? 1 : 2), 'ready results must coalesce');
		}
	} finally {
		release();
		root.unmount();
		container.remove();
		await runtime.act(async () => {});
	}
}

try {
	await measure(false);
	await measure(true);
} finally {
	dom.window.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
