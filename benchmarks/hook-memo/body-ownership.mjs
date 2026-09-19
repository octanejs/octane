// Same-source production controls for context and independently compiled bodies.
// Authored counters measure recomputation, not runtime allocations or duration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

process.env.NODE_ENV = 'production';
const repo = path.resolve(
	process.env.OCTANE_OWNERSHIP_ROOT || path.join(import.meta.dirname, '../..'),
);
const dependencies = path.resolve(process.env.OCTANE_OWNERSHIP_EXTERNAL_ROOT || repo);
const require = createRequire(path.join(dependencies, 'packages/octane/package.json'));
const { build, version: esbuild } = require('esbuild');
const { Window } = await import(pathToFileURL(require.resolve('happy-dom')).href);
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js')).href
);
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(repo, 'packages/octane/package.json')),
).exports;
const repeats = 128;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const score = (value) => ({ score: value, median: value, min: value, samples: 1 });
const body = `
import { useMemo } from 'octane';
import { compute } from 'ownership-work';
export function Body() @{
  const value = useMemo(() => compute('first'), []);
  <span>{value.text as string}</span>
}`;
const lazyBodies = `
import { useMemo } from 'octane';
import { compute } from 'ownership-work';
function Label({ text }) @{ <span>{text as string}</span> }
export function First() @{
  const value = useMemo(() => compute('first'), []);
  <section><input defaultValue="draft" /><Label text={value.text} /></section>
}
export function Second() @{
  const value = useMemo(() => compute('second'), []);
  <section><input defaultValue="draft" /><Label text={value.text} /></section>
}`;
const modules = new Map();
for (const inline of [false, true]) {
	for (const name of ['first', 'second']) {
		const id = `${name}-${inline}`;
		modules.set(id, { source: body.replace("compute('first')", `compute('${name}')`), inline });
	}
}
modules.set('lazy-bodies', { source: lazyBodies, inline: true });
const entry = `
export { createContext, createElement, createRoot, createScopedValue, createScopedElement, flushSync, lazy, useContext } from 'octane';
export { Body as FirstMap } from 'first-false';
export { Body as SecondMap } from 'second-false';
export { Body as FirstInline } from 'first-true';
export { Body as SecondInline } from 'second-true';
export { First, Second } from 'lazy-bodies';
export { observe } from 'ownership-work';`;
const compiled = new Map();
for (const [id, { source, inline }] of modules) {
	const output = compile(source, `${id}.tsrx`, {
		mode: 'client',
		hmr: false,
		dev: false,
		autoMemo: true,
		inlineHookMemo: inline,
	});
	assert.equal(output.diagnostics.length, 0, JSON.stringify(output.diagnostics));
	compiled.set(id, output.code);
}

async function bundle(observed, outfile) {
	const result = await build({
		stdin: { contents: entry, resolveDir: repo, sourcefile: 'body-ownership-entry.mjs' },
		outfile,
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OWNERSHIP_OBSERVED__: String(observed) },
		nodePaths: [
			path.join(dependencies, 'packages/octane/node_modules'),
			path.join(dependencies, 'node_modules'),
		],
		plugins: [
			{
				name: 'ownership-fixtures',
				setup(plugin) {
					plugin.onResolve(
						{ filter: /^(?:first|second)-(?:true|false)$|^lazy-bodies$|^ownership-work$/ },
						({ path: id }) => ({ path: id, namespace: 'fixture' }),
					);
					plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: id }) => ({
						contents:
							id === 'ownership-work'
								? `
          export function observe() { if (__OWNERSHIP_OBSERVED__) globalThis.__ownershipWork++; }
          export function compute(text) { observe(); return {text}; }
        `
								: compiled.get(id),
						loader: 'js',
						resolveDir: repo,
					}));
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = exportsMap[request === 'octane' ? '.' : './' + request.slice(7)];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						assert.equal(typeof target, 'string', request);
						return { path: path.resolve(repo, 'packages/octane', target) };
					});
				},
			},
		],
	});
	return result.outputFiles[0].contents;
}

function exercise(app) {
	const ops = {},
		snapshots = [];
	let stale = 0;
	function view(component, props) {
		const container = document.createElement('div');
		document.body.append(container);
		const root = app.createRoot(container);
		root.render(component, props);
		return {
			container,
			update: (next, values) => app.flushSync(() => root.render(next, values)),
			close() {
				snapshots.push(container.innerHTML);
				root.unmount();
				assert.equal(container.innerHTML, '');
				container.remove();
			},
		};
	}
	function label(v, expected) {
		const actual = v.container.querySelector('span')?.textContent;
		stale += Number(actual !== expected);
		snapshots.push({ expected, actual });
	}
	for (const kind of ['Map', 'Inline']) {
		const Context = app.createContext('default');
		const first = app['First' + kind],
			second = app['Second' + kind];
		globalThis.__ownershipWork = 0;
		const v = view(Context, { value: 0, children: first });
		const mountWork = globalThis.__ownershipWork;
		globalThis.__ownershipWork = 0;
		for (let tick = 1; tick <= repeats; tick++) {
			v.update(Context, { value: tick, children: first });
			label(v, 'first');
		}
		ops[kind.toLowerCase() + '_memo_hits'] = globalThis.__ownershipWork;
		globalThis.__ownershipWork = 0;
		for (const [children, text] of [
			[second, 'second'],
			[first, 'first'],
			[second, 'second'],
			[first, 'first'],
		]) {
			v.update(Context, { value: text, children });
			label(v, text);
		}
		ops[kind.toLowerCase() + '_body_computations'] = mountWork + globalThis.__ownershipWork;
		v.close();
	}
	let current = app.First;
	const Lazy = app.lazy(() => ({
		then(resolve) {
			resolve({
				get default() {
					return current;
				},
			});
		},
	}));
	const lazyView = view(Lazy, { tick: 0 });
	const input = lazyView.container.querySelector('input');
	input.value = 'typed';
	globalThis.__ownershipWork = 0;
	for (let tick = 1; tick <= repeats; tick++) {
		lazyView.update(Lazy, { tick });
		label(lazyView, 'first');
	}
	ops.lazy_memo_hits = globalThis.__ownershipWork;
	for (const [component, text] of [
		[app.Second, 'second'],
		[app.First, 'first'],
		[app.Second, 'second'],
		[app.First, 'first'],
	]) {
		current = component;
		lazyView.update(Lazy, { tick: text });
		label(lazyView, text);
		assert.equal(lazyView.container.querySelector('input'), input);
		assert.equal(input.value, 'typed');
	}
	lazyView.close();

	const Mode = app.createContext(false);
	const nested = app.createScopedValue(() => {
		app.observe();
		const active = app.useContext(Mode);
		return app.createElement(active ? 'strong' : 'span', null, active ? 'next' : 'first');
	});
	const Counter = () => app.createElement('button', null, 'counter');
	const children = [nested, app.createElement(Counter)];
	const shared = app.createScopedElement('section', null, () => children);
	const v = view(Mode, { value: false, children: shared });
	globalThis.__ownershipWork = 0;
	for (let tick = 0; tick < repeats; tick++) v.update(Mode, { value: false, children: shared });
	ops.context_unchanged_resolutions = globalThis.__ownershipWork;
	globalThis.__ownershipWork = 0;
	for (let tick = 0; tick < repeats; tick++) {
		const active = tick % 2 === 0;
		v.update(Mode, { value: active, children: shared });
		const actual = v.container.querySelector(active ? 'strong' : 'span')?.textContent;
		const expected = active ? 'next' : 'first';
		stale += Number(actual !== expected);
		snapshots.push({ expected, actual });
		assert.equal(v.container.querySelectorAll('button').length, 1);
	}
	ops.context_changed_resolutions = globalThis.__ownershipWork;
	v.close();
	return { ops, snapshots, stale };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-body-ownership-'));
const runs = [];
let cleanBytes;
try {
	for (const observed of [false, true]) {
		const window = new Window();
		for (const key of [
			'window',
			'document',
			'navigator',
			'Node',
			'Element',
			'HTMLElement',
			'SVGElement',
			'Text',
			'Comment',
			'DocumentFragment',
			'Event',
			'EventTarget',
			'MutationObserver',
			'HTMLInputElement',
			'HTMLSelectElement',
			'HTMLTextAreaElement',
			'getComputedStyle',
			'requestAnimationFrame',
			'cancelAnimationFrame',
		]) {
			const value = key === 'window' ? window : window[key];
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
		}
		try {
			const outfile = path.join(temporary, `${observed}.mjs`);
			const bytes = await bundle(observed, outfile);
			if (!observed) cleanBytes = bytes;
			fs.writeFileSync(outfile, bytes);
			runs.push(exercise(await import(pathToFileURL(outfile).href)));
		} finally {
			await window.happyDOM.close();
		}
	}
	assert.deepEqual(runs[0].snapshots, runs[1].snapshots, 'observation changes semantics');
	const values = {
		...runs[1].ops,
		stale_output_count: runs[1].stale,
		bundle_minified: cleanBytes.length,
		bundle_gzip: gzipSync(cleanBytes, { level: 9 }).length,
	};
	const meta = {
		node: process.version,
		esbuild,
		source: hash(fs.readFileSync(path.join(repo, 'packages/octane/src/runtime.ts'))),
		compiler: hash(fs.readFileSync(path.join(repo, 'packages/octane/src/compiler/compile.js'))),
		runner: hash(fs.readFileSync(import.meta.filename)),
		compiled: hash(JSON.stringify([...compiled])),
		semantics: hash(JSON.stringify(runs[0].snapshots)),
		measurement: 'authored memo computations and scoped resolutions; no timing or heap claim',
	};
	const payload = {
		suite: 'body-ownership',
		iterations: 1,
		targets: [
			{
				name: 'octane',
				ops: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, score(v)])),
				meta,
			},
			{
				name: 'reference',
				ops: Object.fromEntries(
					Object.keys(values).map((k) => [
						k,
						score(k === 'stale_output_count' ? 1 : k.endsWith('_body_computations') ? 2 : repeats),
					]),
				),
			},
		],
	};
	console.log(JSON.stringify({ values, meta }, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	if (process.env.OCTANE_OWNERSHIP_ALLOW_STALE !== '1')
		assert.equal(runs[0].stale, 0, 'stale output');
} finally {
	delete globalThis.__ownershipWork;
	fs.rmSync(temporary, { recursive: true, force: true });
}
