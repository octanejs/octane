// Measure the best-case benefit of removing the legacy lone-Symbol check from
// the real state entry. The stripped variant is an experiment, not a valid
// replacement: it intentionally cannot preserve manual useState(slot) calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const repo = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(process.argv[2] || repo);
const sourceFile = join(sourceRoot, 'packages/octane/src/runtime.ts');
const source = await readFile(sourceFile, 'utf8');
const output = join(repo, 'node_modules/.cache/compiler-state-arity');
await mkdir(output, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function bundle(stripped) {
	const built = await build({
		stdin: {
			contents:
				"export {createRoot, createElement, flushSync, useState} from './packages/octane/src/runtime.ts';",
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
		plugins: stripped
			? [
					{
						name: 'idealized-compiled-state-entry',
						setup(builder) {
							builder.onLoad({ filter: /\/runtime\.ts$/ }, async ({ path }) => {
								if (path !== sourceFile) return;
								const marker = 'readStateHook(initial, slot, arguments.length === 1)';
								assert.equal(source.split(marker).length - 1, 2);
								return {
									contents: source.replaceAll(marker, 'readStateHook(initial, slot, false)'),
									loader: 'ts',
								};
							});
						},
					},
				]
			: [],
	});
	const code = built.outputFiles[0].text;
	const path = join(output, hash(code) + '.mjs');
	await writeFile(path, code);
	return { path, minified: Buffer.byteLength(code), gzip: gzipSync(code).length };
}

async function exercise(artifact, id, legacy = false) {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
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
		globalThis[name] = window[name];
	globalThis.window = window;
	const runtime = await import(pathToFileURL(artifact.path).href + '?run=' + id);
	const slots = Array.from({ length: 128 }, (_, index) => Symbol('state-' + index));
	const container = window.document.createElement('div');
	window.document.body.appendChild(container);
	const root = runtime.createRoot(container);
	let update;
	function App(props) {
		let sum = 0;
		for (let index = 0; index < slots.length; index++) {
			const pair = runtime.useState(index, slots[index]);
			sum += pair[0];
			if (index === 0) update = pair[1];
		}
		return runtime.createElement('output', null, sum + ':' + props.tick);
	}
	if (legacy) {
		let result;
		function Manual() {
			result = runtime.useState(slots[0])[0];
			return runtime.createElement('output', null, String(result));
		}
		root.render(Manual, {});
		const value = String(result);
		root.unmount();
		await window.happyDOM.close();
		return value;
	}
	root.render(App, { tick: 0 });
	assert.equal(container.textContent, '8128:0');
	const element = container.firstChild;
	let tick = 0;
	function render() {
		runtime.flushSync(() => root.render(App, { tick: ++tick }));
	}
	for (let warmup = 0; warmup < 256; warmup++) render();
	const samples = [];
	for (let sample = 0; sample < 20; sample++) {
		const start = performance.now();
		for (let iteration = 0; iteration < 128; iteration++) render();
		samples.push((performance.now() - start) / 128);
	}
	assert.equal(container.textContent, '8128:' + tick);
	assert.equal(container.firstChild, element);
	runtime.flushSync(() => update((value) => value + 7));
	assert.equal(container.textContent, '8135:' + tick);
	const semanticHash = hash(container.textContent);
	root.unmount();
	assert.equal(container.childNodes.length, 0);
	await window.happyDOM.close();
	samples.sort((a, b) => a - b);
	return { medianMs: samples[10], minMs: samples[0], maxMs: samples.at(-1), semanticHash };
}

const baseline = await bundle(false);
const stripped = await bundle(true);
const runs = [];
for (const [index, variant] of ['baseline', 'stripped', 'stripped', 'baseline'].entries()) {
	const result = await exercise(variant === 'baseline' ? baseline : stripped, index);
	runs.push({ variant, ...result });
}
assert.equal(new Set(runs.map((row) => row.semanticHash)).size, 1);
const legacy = await exercise(baseline, 'legacy', true);
assert.equal(legacy, 'undefined');
let strippedLegacy;
try {
	strippedLegacy = await exercise(stripped, 'legacy-stripped', true);
} catch (error) {
	strippedLegacy = String(error);
}
assert.notEqual(strippedLegacy, legacy);
console.log(
	JSON.stringify(
		{
			sourceRoot,
			sourceHash: hash(source),
			node: process.version,
			execArgv: process.execArgv,
			baseline,
			stripped,
			runs,
			legacy,
			strippedLegacy,
		},
		null,
		2,
	),
);
