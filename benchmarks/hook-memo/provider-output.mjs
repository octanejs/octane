// Same-source compiler/runtime comparison for retained Provider child bodies.
// Clean bundles establish semantics and size; a separately parsed observed
// bundle counts reached work after compilation and tree shaking. No timings.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO = path.resolve(
	process.env.OCTANE_PROVIDER_ROOT || path.join(import.meta.dirname, '../..'),
);
const DEPENDENCIES = path.resolve(process.env.OCTANE_PROVIDER_EXTERNAL_ROOT || REPO);
const SOURCE = path.join(REPO, 'packages/octane/src');
const requireDependencies = createRequire(path.join(DEPENDENCIES, 'packages/octane/package.json'));
const { build, transformSync, version: esbuildVersion } = requireDependencies('esbuild');
const { parseModule, builders: b } = requireDependencies('@tsrx/core');
const { print } = requireDependencies('esrap');
const language = requireDependencies('esrap/languages/tsx').default;
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const { compile } = await import(pathToFileURL(path.join(SOURCE, 'compiler/index.js')).href);
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(REPO, 'packages/octane/package.json'), 'utf8'),
).exports;
const REPEATS = 128;
const COUNTERS = '__octaneProviderOutputWork';
const FUNCTIONS = new Map([
	['componentSlot', 'component_slots'],
	['componentSlotLite', 'component_slots'],
	['componentSlotVoid', 'component_slots'],
	['markChildrenBlock', 'children_bodies'],
	['childSlot', 'snapshot_slots'],
	['Label', 'label_renders'],
	['Counter', 'counter_renders'],
]);
const fixture = `
	import { createContext, createElement, useMemo, useState } from 'octane';
	export const Theme = createContext('default');
	function Label({ text }: { text: string }) @{
		<span data-label>{text}</span>
	}
	function Counter() @{
		const [count, setCount] = useState(0);
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
	}
	export function First() @{
		const memo = useMemo(() => ({ text: 'first' }), []);
		<section><input defaultValue="draft" /><Label text={memo.text} /><Counter /></section>
	}
	export function Second() @{
		const memo = useMemo(() => ({ text: 'second' }), []);
		<section><input defaultValue="draft" /><Label text={memo.text} /><Counter /></section>
	}
	export function Inline({ tick, label }: { tick: number; label: string }) @{
		<main data-tick={tick}>
			<Theme.Provider value="constant">
				<section><input defaultValue="draft" /><Label text={label} /><Counter /></section>
			</Theme.Provider>
		</main>
	}
	function buildRows(label: string) {
		return [createElement(Label, { key: 'label', text: label })];
	}
	export function InlineMemo({ tick, label }: { tick: number; label: string }) @{
		const rows = buildRows(label);
		<main data-tick={tick}>
			<Theme.Provider value="constant">
				<section><input defaultValue="draft" /><div>{rows}</div><Counter /></section>
			</Theme.Provider>
		</main>
	}
`;

const hash = (source) => createHash('sha256').update(source).digest('hex');
const val = (score) => ({ score, median: score, min: score, samples: 1 });
const empty = () => ({
	component_slots: 0,
	children_bodies: 0,
	snapshot_slots: 0,
	label_renders: 0,
	counter_renders: 0,
});

function packageVersion(name) {
	let directory = path.dirname(requireDependencies.resolve(name));
	while (directory !== path.dirname(directory)) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const value = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (value.name === name) return value.version;
		}
		directory = path.dirname(directory);
	}
	return null;
}

function observe(source) {
	const found = new Set();
	function visit(node) {
		if (Array.isArray(node)) return node.map(visit);
		if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
		let rewritten = node;
		for (const key of Object.keys(node)) {
			if (['loc', 'start', 'end', 'metadata', 'comments', 'tokens'].includes(key)) continue;
			const value = node[key];
			if (value === null || typeof value !== 'object') continue;
			const next = visit(value);
			if (next === value) continue;
			if (rewritten === node) rewritten = { ...node };
			rewritten[key] = next;
		}
		if (node.type !== 'FunctionDeclaration' && node.type !== 'FunctionExpression') return rewritten;
		const name = node.id?.name?.replace(/^(Label|Counter)\d+$/, '$1');
		const counter = FUNCTIONS.get(name);
		if (counter === undefined) return rewritten;
		found.add(name);
		return {
			...rewritten,
			body: {
				...rewritten.body,
				body: [
					b.stmt(b.update('++', b.member(b.member(b.id('globalThis'), COUNTERS), counter))),
					...rewritten.body.body,
				],
			},
		};
	}
	const code = print(visit(parseModule(source, 'provider-output-clean.mjs')), language()).code;
	for (const required of ['Label', 'Counter', 'markChildrenBlock'])
		assert.ok(found.has(required), `missing observed ${required}`);
	assert.ok(
		found.has('componentSlot') || found.has('componentSlotLite'),
		'missing component slot observer',
	);
	return { code, functions: [...found] };
}

// Optional broken optimization control: remove only the compiler-generated
// stable body token. Output remains correct, but fresh children closures make
// the runtime clear automatic regions on every ordinary inline update.
function withoutBodyTokens(source) {
	const program = parseModule(source, 'provider-output-compiled.js');
	const names = new Set();
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.imported?.name === 'markChildrenBlock') names.add(specifier.local.name);
		}
	}
	let removed = 0;
	function visit(node) {
		if (Array.isArray(node)) return node.map(visit);
		if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
		let rewritten = node;
		for (const key of Object.keys(node)) {
			if (['loc', 'start', 'end', 'metadata', 'comments', 'tokens'].includes(key)) continue;
			const value = node[key];
			if (value === null || typeof value !== 'object') continue;
			const next = visit(value);
			if (next === value) continue;
			if (rewritten === node) rewritten = { ...node };
			rewritten[key] = next;
		}
		if (
			node.type === 'CallExpression' &&
			names.has(node.callee?.name) &&
			node.arguments.length === 2
		) {
			removed++;
			return { ...rewritten, arguments: rewritten.arguments.slice(0, 1) };
		}
		return rewritten;
	}
	const code = print(visit(program), language()).code;
	assert.ok(removed > 0, 'body-token negative control found no generated tokens');
	return code;
}

async function bundle(filename) {
	const compiled = compile(fixture, 'provider-output-benchmark.tsrx', {
		mode: 'client',
		hmr: false,
		dev: false,
		autoMemo: true,
		inlineHookMemo: true,
	});
	assert.equal(compiled.diagnostics.length, 0, JSON.stringify(compiled.diagnostics));
	const application =
		process.env.OCTANE_PROVIDER_DROP_BODY_TOKENS === '1'
			? withoutBodyTokens(compiled.code)
			: compiled.code;
	const result = await build({
		stdin: {
			contents: `export { createContext, createRoot, flushSync } from 'octane';\nexport * from 'provider-fixture';`,
			resolveDir: REPO,
			sourcefile: 'provider-output-entry.mjs',
		},
		outfile: filename,
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [
			path.join(DEPENDENCIES, 'packages/octane/node_modules'),
			path.join(DEPENDENCIES, 'node_modules'),
		],
		plugins: [
			{
				name: 'provider-output',
				setup(plugin) {
					plugin.onResolve({ filter: /^provider-fixture$/ }, () => ({
						path: 'provider-fixture',
						namespace: 'fixture',
					}));
					plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
						contents: application,
						loader: 'js',
						resolveDir: REPO,
					}));
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const key = request === 'octane' ? '.' : './' + request.slice('octane/'.length);
						const entry = exportsMap[key];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						assert.equal(typeof target, 'string', `unknown runtime request ${request}`);
						return { path: path.resolve(REPO, 'packages/octane', target) };
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1);
	return { code: result.outputFiles[0].text, compiled: application };
}

function setupDom() {
	const window = new Window({ url: 'http://localhost/' });
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
		if (value !== undefined)
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
	}
	return window;
}

function exercise(app) {
	const phases = {};
	const snapshot = [];
	let stale = 0;
	function mount(component, props) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = app.createRoot(container);
		app.flushSync(() => root.render(component, props));
		const input = container.querySelector('input');
		const label = container.querySelector('[data-label]');
		const button = container.querySelector('button');
		assert.ok(input && label && button, 'complete application mounted');
		input.value = 'typed draft';
		input.focus();
		app.flushSync(() => button.dispatchEvent(new Event('click', { bubbles: true })));
		assert.equal(button.textContent, '1', 'native delegated counter');
		function verify(text, allowStale = false) {
			assert.equal(container.querySelector('input'), input, 'retained input');
			assert.equal(container.querySelector('[data-label]'), label, 'retained label');
			assert.equal(container.querySelector('button'), button, 'retained stateful child');
			assert.equal(input.value, 'typed draft', 'uncontrolled input draft');
			assert.equal(document.activeElement, input, 'retained focus');
			assert.equal(button.textContent, '1', 'retained local state');
			if (allowStale) stale += Number(label.textContent !== text);
			else assert.equal(label.textContent, text, 'current label');
		}
		function close() {
			app.flushSync(() => button.dispatchEvent(new Event('click', { bubbles: true })));
			assert.equal(button.textContent, '2', 'native event remains active');
			snapshot.push({ html: container.innerHTML, draft: input.value });
			root.unmount();
			assert.equal(container.innerHTML, '', 'complete teardown');
			container.remove();
		}
		return { root, container, label, verify, close };
	}
	function phase(name, work) {
		globalThis[COUNTERS] = empty();
		work();
		phases[name] = { ...globalThis[COUNTERS] };
	}
	const inline = mount(app.Inline, { tick: 0, label: 'stable' });
	phase('inline_body', () => {
		for (let tick = 1; tick <= REPEATS; tick++) {
			app.flushSync(() => inline.root.render(app.Inline, { tick, label: 'stable' }));
			assert.equal(inline.container.querySelector('main').getAttribute('data-tick'), String(tick));
			inline.verify('stable');
		}
	});
	phase('changed_capture', () => {
		for (let tick = 1; tick <= REPEATS; tick++) {
			app.flushSync(() => inline.root.render(app.Inline, { tick, label: 'changed:' + tick }));
			inline.verify('changed:' + tick);
		}
	});
	inline.close();
	const inlineMemo = mount(app.InlineMemo, { tick: 0, label: 'stable' });
	phase('inline_memo', () => {
		for (let tick = 1; tick <= REPEATS; tick++) {
			app.flushSync(() => inlineMemo.root.render(app.InlineMemo, { tick, label: 'stable' }));
			assert.equal(
				inlineMemo.container.querySelector('main').getAttribute('data-tick'),
				String(tick),
			);
			inlineMemo.verify('stable');
		}
	});
	phase('inline_memo_changed', () => {
		for (let tick = 1; tick <= REPEATS; tick++) {
			app.flushSync(() =>
				inlineMemo.root.render(app.InlineMemo, { tick, label: 'changed:' + tick }),
			);
			inlineMemo.verify('changed:' + tick);
		}
	});
	inlineMemo.close();
	const Context = app.createContext('default');
	const direct = mount(Context.Provider, { value: 'first', children: app.First });
	direct.verify('first');
	phase('same_body', () => {
		for (let tick = 1; tick <= REPEATS; tick++) {
			app.flushSync(() =>
				direct.root.render(Context.Provider, { value: tick, children: app.First }),
			);
			direct.verify('first');
		}
	});
	phase('different_body', () => {
		for (const [body, text] of [
			[app.Second, 'second'],
			[app.First, 'first'],
			[app.Second, 'second'],
			[app.First, 'first'],
		]) {
			app.flushSync(() => direct.root.render(Context.Provider, { value: text, children: body }));
			direct.verify(text, true);
			snapshot.push({ requested: text, rendered: direct.label.textContent });
		}
	});
	direct.close();
	return { phases, snapshot, stale };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-provider-output-'));
const window = setupDom();
try {
	const cleanFile = path.join(temporary, 'clean.mjs');
	const observedFile = path.join(temporary, 'observed.mjs');
	const { code, compiled } = await bundle(cleanFile);
	fs.writeFileSync(cleanFile, code);
	if (process.env.OCTANE_PROVIDER_ARTIFACT)
		fs.writeFileSync(process.env.OCTANE_PROVIDER_ARTIFACT, code);
	globalThis[COUNTERS] = empty();
	const clean = exercise(await import(pathToFileURL(cleanFile).href));
	const observation = observe(code);
	fs.writeFileSync(observedFile, observation.code);
	globalThis[COUNTERS] = empty();
	const observed = exercise(await import(pathToFileURL(observedFile).href));
	assert.deepEqual(observed.snapshot, clean.snapshot, 'observation changed public output');
	assert.equal(observed.stale, clean.stale, 'observation changed stale-output behavior');
	assert.equal(observed.phases.changed_capture.label_renders, REPEATS, 'changed inline label work');
	assert.equal(
		observed.phases.inline_memo_changed.label_renders,
		REPEATS,
		'changed array label work',
	);
	assert.equal(
		observed.phases.inline_memo.children_bodies,
		REPEATS,
		'fresh inline children control',
	);
	const minified = transformSync(code, { minify: true, target: 'es2022', format: 'esm' }).code;
	const ops = {
		same_body_label_renders: val(observed.phases.same_body.label_renders),
		same_body_counter_renders: val(observed.phases.same_body.counter_renders),
		same_body_component_slots: val(observed.phases.same_body.component_slots),
		changed_capture_label_renders: val(observed.phases.changed_capture.label_renders),
		inline_body_label_renders: val(observed.phases.inline_body.label_renders),
		inline_body_children: val(observed.phases.inline_body.children_bodies),
		inline_body_component_slots: val(observed.phases.inline_body.component_slots),
		inline_memo_label_renders: val(observed.phases.inline_memo.label_renders),
		inline_memo_snapshot_slots: val(observed.phases.inline_memo.snapshot_slots),
		inline_memo_children: val(observed.phases.inline_memo.children_bodies),
		inline_memo_changed_renders: val(observed.phases.inline_memo_changed.label_renders),
		stale_output_count: val(observed.stale),
		bundle_minified: val(Buffer.byteLength(minified)),
		bundle_gzip: val(gzipSync(minified, { level: 9 }).length),
	};
	const payload = {
		suite: 'hook-memo',
		iterations: 1,
		targets: [
			{ name: 'provider-output', ops },
			{
				name: 'provider-output-reference',
				ops: {
					same_body_label_renders: val(REPEATS),
					same_body_counter_renders: val(REPEATS),
					same_body_component_slots: val(REPEATS),
					changed_capture_label_renders: val(REPEATS),
					inline_body_label_renders: val(REPEATS),
					inline_body_children: val(REPEATS),
					inline_body_component_slots: val(REPEATS),
					inline_memo_label_renders: val(REPEATS),
					inline_memo_snapshot_slots: val(REPEATS),
					inline_memo_children: val(REPEATS),
					inline_memo_changed_renders: val(REPEATS),
					stale_output_count: val(1),
				},
			},
		],
		meta: {
			node: process.version,
			esbuild: esbuildVersion,
			tsrxCore: packageVersion('@tsrx/core'),
			droppedBodyTokens: process.env.OCTANE_PROVIDER_DROP_BODY_TOKENS === '1',
			repeats: REPEATS,
			fixtureSha256: hash(fixture),
			runnerSha256: hash(fs.readFileSync(import.meta.filename)),
			runtimeSha256: hash(fs.readFileSync(path.join(SOURCE, 'runtime.ts'))),
			compilerSha256: hash(fs.readFileSync(path.join(SOURCE, 'compiler/compile.js'))),
			compiledSha256: hash(compiled),
			semanticsSha256: hash(JSON.stringify(clean.snapshot)),
			phases: observed.phases,
			snapshot: clean.snapshot,
			observedFunctions: observation.functions,
			measurement: 'reached function bodies after compilation; not heap allocations or timings',
		},
	};
	// The unified runner merges targets from each script, so keep provenance
	// with the measured target as well as on this standalone payload.
	payload.targets[0].meta = payload.meta;
	console.log(JSON.stringify({ ops, phases: observed.phases, snapshot: clean.snapshot }, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	if (process.env.OCTANE_PROVIDER_ALLOW_STALE !== '1')
		assert.equal(clean.stale, 0, 'Provider output is stale');
} finally {
	delete globalThis[COUNTERS];
	await window.happyDOM.close();
	fs.rmSync(temporary, { recursive: true, force: true });
}
