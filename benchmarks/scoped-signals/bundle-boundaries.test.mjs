import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { slotHooks } from '../../packages/octane/src/compiler/slot-hooks.js';
import {
	createOctaneCompiler,
	findVoidRootImports,
} from '../../packages/octane/src/compiler/bundler.js';
import { knownAttributeSpreads } from '../../packages/stylex/src/compiler-contract.js';
import { generateStylexCSS, transformStylex } from '../../packages/stylex/src/transform.js';
import {
	BUNDLE_CASES,
	baselineUnavailableReason,
	entrySource,
	gitBlobHash,
	verifyBundleInputs,
	verifyTransitionBoundary,
} from './bundle-boundaries.mjs';

test('opaque scalar rows do not activate signal owner allocations', async (t) => {
	const directory = path.resolve('packages/octane');
	const app = `import {createRoot, flushSync} from 'octane';
function Row(props) @{
 <article data-row={props.item.id}><span title={props.item.label}>{props.item.label as string}</span><input /></article>
}
function List(props) @{
 <main>@for (const item of props.items; key item.id) { <Row item={item} /> }</main>
}
export function mount(parent, items) {
 const root = createRoot(parent); root.render(List, {items});
 return {update(items) { flushSync(() => root.render(List, {items})); }, dispose() {root.unmount();}};
}`;
	const contents = compile(app, path.join(directory, 'SignalFreeOwners.tsrx'), {
		mode: 'client',
		dev: false,
		hmr: false,
	}).code;
	const bundle = await build({
		stdin: { contents, resolveDir: directory },
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	const api = await import(
		'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
	);
	const host = window.document.createElement('div');
	window.document.body.append(host);
	const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), label: 'Row ' + i }));
	const stringify = JSON.stringify;
	const freeze = Object.freeze;
	let serializedIdentities = 0;
	let frozenOwners = 0;
	// Count the public renderer-owner shape without changing framework source.
	// Serialization is observed only during this compiled scalar view's work.
	JSON.stringify = function (...args) {
		serializedIdentities++;
		return Reflect.apply(stringify, this, args);
	};
	Object.freeze = function (value) {
		if (value && typeof value === 'object' && 'documentOwner' in value && 'instanceKey' in value)
			frozenOwners++;
		return freeze(value);
	};
	let root;
	try {
		root = api.mount(host, items);
		assert.equal(host.querySelectorAll('article').length, items.length);
		const first = host.querySelector('article[data-row="0"]');
		const input = first.querySelector('input');
		input.value = 'typed before reorder';
		for (let i = 0; i < 4; i++) {
			const updated = items.map((item) => ({ ...item, label: 'Update ' + i + ' ' + item.id }));
			root.update(i % 2 === 0 ? updated.toReversed() : updated);
			assert.equal(host.querySelector('article[data-row="0"]'), first);
			assert.equal(first.querySelector('input'), input);
			assert.equal(input.value, 'typed before reorder');
			assert.equal(first.querySelector('span').title, 'Update ' + i + ' 0');
			assert.equal(first.querySelector('span').textContent, 'Update ' + i + ' 0');
		}
		root.dispose();
		root = undefined;
		assert.equal(host.childNodes.length, 0);
	} finally {
		JSON.stringify = stringify;
		Object.freeze = freeze;
		root?.dispose();
		host.remove();
	}
	assert.equal(frozenOwners, 0, 'Scalar values must not allocate renderer signal owners.');
	assert.equal(serializedIdentities, 0, 'Scalar values must not serialize signal instance paths.');
});

const scenario = (id) => BUNDLE_CASES.find((entry) => entry.id === id);
const source = (name) => ({ path: `packages/octane/src/${name}` });
const alien = (version = '3.2.0') => ({
	path: 'node_modules/alien-signals/esm/system.mjs',
	package: { name: 'alien-signals', version },
});

test('entry fixtures retain precisely the named public functions', () => {
	assert.equal(entrySource(scenario('ordinary-client')), 'export { createRoot } from "octane";\n');
	assert.equal(
		entrySource(scenario('ordinary-server')),
		'export { renderToString } from "octane/server";\n',
	);
	assert.equal(
		entrySource(scenario('engine')),
		'export { createScope, query } from "octane/signals";\n',
	);
	assert.equal(BUNDLE_CASES.filter((entry) => entry.baseline).length, 10);
	for (const id of [
		'binding-scalar',
		'binding-structural',
		'engine',
		'native-client',
		'native-server',
		'compiled-plain-signals',
		'streamed-signals-bootstrap',
		'streamed-signal-results-bootstrap',
	]) {
		assert.equal(scenario(id).baseline, 'if-exported');
		assert.equal(
			baselineUnavailableReason(scenario(id), { '.': './src/index.ts' }),
			`Archived baseline does not export ${scenario(id).request}.`,
		);
		assert.equal(
			baselineUnavailableReason(scenario(id), {
				[`.${scenario(id).request.slice('octane'.length)}`]: './src/bindings.ts',
			}),
			null,
		);
	}
	for (const id of ['ordinary-client', 'ordinary-server']) {
		// A malformed ordinary baseline must still fail, not silently skip its comparison.
		assert.equal(scenario(id).baseline, true);
		assert.equal(baselineUnavailableReason(scenario(id), {}), null);
	}
	assert.equal(
		entrySource(scenario('binding-scalar-controls-style')),
		'export { __adoptBindings } from "octane/dom-bindings";\n' +
			'export { __createBindingControls } from "octane/dom-binding-controls";\n' +
			'export { __createBindingStyles } from "octane/dom-binding-styles";\n',
	);
});

test('baseline blob evidence agrees with Git for exact UTF-8 source bytes', () => {
	const contents = Buffer.from('const sign = "α";\n');
	const git = execFileSync('git', ['hash-object', '--stdin'], {
		input: contents,
		encoding: 'utf8',
	}).trim();
	assert.equal(gitBlobHash(contents), git);
	assert.notEqual(gitBlobHash(contents), gitBlobHash(Buffer.from('const sign = "α";\r\n')));
});

test('ordinary entries allow protocol seams but reject both scoped and raw engines', () => {
	const ordinary = [source('runtime.ts'), source('signals/read-protocol.ts')];
	verifyBundleInputs(scenario('ordinary-client'), ordinary);
	assert.throws(
		() => verifyBundleInputs(scenario('ordinary-client'), [...ordinary, alien()]),
		/ordinary imports reached Alien Signals/,
	);
	assert.throws(
		() =>
			verifyBundleInputs(scenario('ordinary-client'), [...ordinary, source('signals/engine.ts')]),
		/ordinary imports reached the scoped engine/,
	);
});

test('ordinary client roots tree-shake native transitions and require emitted-byte evidence', () => {
	const ordinary = [source('runtime.ts'), source('signals/read-protocol.ts')];
	verifyTransitionBoundary(scenario('ordinary-client'), ordinary);
	for (const name of ['signals/transition-candidate.ts', 'signals/transition-action.ts']) {
		verifyTransitionBoundary(scenario('ordinary-client'), [
			...ordinary,
			{ ...source(name), bytesInOutput: 0 },
		]);
		assert.throws(
			() =>
				verifyTransitionBoundary(scenario('ordinary-client'), [
					...ordinary,
					{ ...source(name), bytesInOutput: 1 },
				]),
			/ordinary client retained transition orchestration/,
		);
		assert.throws(
			() => verifyTransitionBoundary(scenario('ordinary-client'), [...ordinary, source(name)]),
			/missing emitted-byte evidence/,
		);
	}
});

test('production public roots omit concrete native transitions while native reads retain them', async (t) => {
	const bundle = async (id) => {
		const entry = scenario(id);
		const directory = path.resolve('packages/octane');
		const native = `import {createRoot, startTransition} from 'octane';
import {useSignal$} from 'octane/signals/client';
function View() @{
 const count$ = useSignal$(0);
 <button onClick={() => startTransition(() => count$.set(count$.get() + 1))}>
  {String(count$.get()) as string}
 </button>
}
export function mount(parent) { const root = createRoot(parent); root.render(View); return root; }`;
		const contents =
			id === 'native-client'
				? compile(native, path.join(directory, 'NativeTransitionControl.tsrx'), {
						mode: 'client',
						dev: false,
						hmr: false,
						nativeReads: true,
					}).code
				: entrySource(entry);
		const result = await build({
			stdin: { contents, resolveDir: directory },
			bundle: true,
			write: false,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		});
		const outputs = Object.values(result.metafile.outputs);
		assert.equal(outputs.length, 1, `${id}: expected one production bundle`);
		const inputs = Object.keys(result.metafile.inputs).map((name) => ({
			path: path.resolve(name),
			bytesInOutput: outputs[0].inputs[name]?.bytesInOutput ?? 0,
			package: /\/node_modules\/alien-signals\//.test(name)
				? { name: 'alien-signals' }
				: /\/node_modules\/react(?:-dom)?\//.test(name)
					? { name: 'react' }
					: undefined,
		}));
		return { inputs, code: result.outputFiles[0].text };
	};
	const [ordinary, engine, native] = await Promise.all([
		bundle('ordinary-client'),
		bundle('engine'),
		bundle('native-client'),
	]);
	assert.ok(
		ordinary.inputs.some(
			(input) => input.path.endsWith('/src/runtime.ts') && input.bytesInOutput > 0,
		),
		'The public createRoot control must retain its actual renderer.',
	);
	assert.match(ordinary.code, /createRoot/);
	verifyBundleInputs(scenario('ordinary-client'), ordinary.inputs);
	assert.ok(
		engine.inputs.some(
			(input) => input.path.endsWith('/src/signals/graph.ts') && input.bytesInOutput > 0,
		),
		'The independent engine control must retain its actual graph.',
	);
	verifyTransitionBoundary(scenario('engine'), engine.inputs);
	assert.ok(
		native.inputs.some(
			(input) =>
				input.path.endsWith('/src/signals/transition-candidate.ts') && input.bytesInOutput > 0,
		),
		'The compiled native-read control must retain the concrete transition implementation.',
	);
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	const api = await import(
		'data:text/javascript;base64,' + Buffer.from(native.code).toString('base64')
	);
	const host = window.document.createElement('div');
	window.document.body.append(host);
	const root = api.mount(host);
	try {
		const button = host.querySelector('button');
		assert.equal(button.textContent, '0');
		button.click();
		const deadline = performance.now() + 2_000;
		while (button.textContent !== '1' && performance.now() < deadline)
			await new Promise((resolve) => setTimeout(resolve, 1));
		assert.equal(host.querySelector('button'), button);
		assert.equal(button.textContent, '1');
	} finally {
		root.unmount();
		host.remove();
	}
	verifyTransitionBoundary(scenario('ordinary-client'), ordinary.inputs);
});

for (const id of ['ordinary-client', 'ordinary-server']) {
	test(`${id} tree-shakes concrete native adapters and requires emitted-byte evidence`, () => {
		const ordinary = [source(id === 'ordinary-client' ? 'runtime.ts' : 'runtime.server.ts')];
		const adapters = ['client', 'server', 'collector', 'inspection', 'retry'].map((name) => ({
			...source(`signals/native-read-${name}.ts`),
			bytesInOutput: 0,
		}));
		verifyBundleInputs(scenario(id), [...ordinary, ...adapters]);
		for (const adapter of adapters) {
			assert.throws(
				() => verifyBundleInputs(scenario(id), [...ordinary, { ...adapter, bytesInOutput: 1 }]),
				/ordinary entry retained native adapter/,
			);
		}
		assert.throws(
			() =>
				verifyBundleInputs(scenario(id), [...ordinary, source('signals/native-read-client.ts')]),
			/missing emitted-byte evidence/,
		);
		// The event/read protocol and the server's empty seed-map seam are not
		// the optional driver factory. A mount-only client must not pull in hydration.
		verifyBundleInputs(scenario(id), [
			...ordinary,
			{ ...source('signals/read-protocol.ts'), bytesInOutput: 1 },
			{ ...source('signals/native-read-events.ts'), bytesInOutput: 1 },
			{
				...source('signals/native-read-seeds.ts'),
				bytesInOutput: id === 'ordinary-client' ? 0 : 36,
			},
		]);
		if (id === 'ordinary-client')
			assert.throws(
				() =>
					verifyBundleInputs(scenario(id), [
						...ordinary,
						{ ...source('signals/native-read-seeds.ts'), bytesInOutput: 1 },
					]),
				/mount-only root retained seed hydration/,
			);
	});
}

test('independent engine rejects rendering, compiler, DevTools, and the old Alien version', () => {
	const independent = [source('signals/index.ts'), source('signals/graph.ts'), alien()];
	verifyBundleInputs(scenario('engine'), independent);
	for (const entry of BUNDLE_CASES.filter((entry) => entry.id === 'engine' || entry.rendererFree)) {
		verifyTransitionBoundary(entry, [source('signals/transition-state.ts')]);
		for (const bytesInOutput of [0, 1]) {
			assert.throws(
				() =>
					verifyTransitionBoundary(entry, [
						{ ...source('signals/transition-candidate.ts'), bytesInOutput },
					]),
				/early entry reached transition orchestration/,
			);
		}
	}
	for (const filename of [
		'runtime.ts',
		'runtime.server.ts',
		'server/index.ts',
		'devtools-hook.ts',
	]) {
		assert.throws(
			() => verifyBundleInputs(scenario('engine'), [...independent, source(filename)]),
			/renderer or DevTools/,
		);
	}
	assert.throws(
		() => verifyBundleInputs(scenario('engine'), [...independent, source('compiler/compile.js')]),
		/compiler reached/,
	);
	assert.throws(() => verifyBundleInputs(scenario('engine'), [alien('1.0.4')]), /wrong Alien/);
	assert.throws(() => verifyBundleInputs(scenario('engine'), []), /dependency is missing/);
});

test('native entries require their actual runtime and pinned engine', () => {
	verifyBundleInputs(scenario('native-client'), [source('runtime.ts'), alien()]);
	verifyBundleInputs(scenario('native-server'), [source('runtime.server.ts'), alien()]);
	assert.throws(
		() => verifyBundleInputs(scenario('native-client'), [alien()]),
		/native runtime missing/,
	);
	assert.throws(
		() => verifyBundleInputs(scenario('native-server'), [source('runtime.server.ts')]),
		/dependency is missing/,
	);
});

test('scalar and result-only entries do not retain their optional implementations', () => {
	for (const binding of BUNDLE_CASES.filter((entry) => entry.graphFree)) {
		const selected = binding.bindingCapabilities.map((name) => source(`dom-binding-${name}.ts`));
		verifyBundleInputs(binding, selected);
		for (const filename of ['signals/engine.ts', 'signals/graph.ts', 'signals/facade.ts']) {
			assert.throws(
				() => verifyBundleInputs(binding, [...selected, source(filename)]),
				/binding entry reached the signal graph/,
			);
		}
		assert.throws(
			() => verifyBundleInputs(binding, [...selected, alien()]),
			/reached Alien Signals/,
		);
		for (const filename of ['runtime.ts', 'signals/native-read-client.ts', 'internal/client.ts']) {
			assert.throws(
				() => verifyBundleInputs(binding, [...selected, source(filename)]),
				/renderer or DevTools/,
			);
		}
		for (const capability of ['program', 'controls', 'styles', 'classes', 'signals']) {
			if (binding.bindingCapabilities.includes(capability)) continue;
			assert.throws(
				() => verifyBundleInputs(binding, [...selected, source(`dom-binding-${capability}.ts`)]),
				/unselected binding capability/,
			);
		}
		if (!binding.bindingCapabilities.includes('controls')) {
			assert.throws(
				() => verifyBundleInputs(binding, [...selected, source('signals/control-binding.ts')]),
				/unselected canonical control implementation/,
			);
		}
	}
	const inputs = [source('signals/engine.ts'), source('signals/graph.ts'), alien()];
	verifyBundleInputs(scenario('compiled-plain-signals'), inputs);
	verifyBundleInputs(scenario('compiled-plain-signals'), [
		...inputs,
		{ ...source('signals/computations.ts'), bytesInOutput: 0 },
	]);
	for (const bytesInOutput of [undefined, 1]) {
		assert.throws(
			() =>
				verifyBundleInputs(scenario('compiled-plain-signals'), [
					...inputs,
					{ ...source('signals/computations.ts'), bytesInOutput },
				]),
			/scalar caller retained general derived computation/,
		);
	}
	verifyBundleInputs(scenario('streamed-signal-results-bootstrap'), inputs);
	verifyBundleInputs(scenario('streamed-signal-results-bootstrap'), [
		...inputs,
		{ ...source('hydration/stream-receiver.ts'), bytesInOutput: 0 },
	]);
	for (const bytesInOutput of [undefined, 1]) {
		assert.throws(
			() =>
				verifyBundleInputs(scenario('streamed-signal-results-bootstrap'), [
					...inputs,
					{ ...source('hydration/stream-receiver.ts'), bytesInOutput },
				]),
			/result-only bootstrap retained DOM placement/,
		);
	}
});

// Evaluated declaration effects, diagnostics, and Promise/stream semantics stay
// in compiler/signal-declarations.test.ts; helper activation is a codegen metric.
test('scalar declarations select the bounded implementation only with a static proof', () => {
	for (const [callback, options, scalar] of [
		['() => null', '', true],
		['() => /pattern/', '', false],
		['() => -value()', '', true],
		['() => value() === other()', '', true],
		['() => `value:${value()}`', '', true],
		['() => value() ? 1 : 2', '', true],
		['() => value() ? 1 : other()', '', false],
		['() => value() + other()', '', false],
		['() => String(value())', '', false],
		['() => (value() as string)', '', false],
		['async () => 1', '', false],
		['() => { "use strong"; return value(); }', '', false],
		['(context = undefined) => 1', '', false],
		['() => value()', ', {sync: true}', true],
		['() => value()', ', {key: "value", sync: true}', true],
		['() => 1', ', {key: "value"}', true],
		['async () => 1', ', {key: "value"}', false],
		['() => 1', ', {get key() { return "value"; }}', false],
		['() => 1', ', options', false],
		['() => 1', ', {get sync() { return true; }}', false],
		['({signal}) => 1', ', {sync: true}', false],
		['function* () { return 1; }', '', false],
	]) {
		for (const factory of ['derive$', 'signals.derived$']) {
			const candidate = `import {derived$ as derive$} from 'octane/signals';
import * as signals from 'octane/signals';
export const result$ = ${factory}(${callback}${options});`;
			for (const environment of ['client', 'server']) {
				for (const [extension, code] of [
					['tsrx', compile(candidate, '/src/proof.tsrx', { mode: environment }).code],
					['ts', slotHooks(candidate, '/src/proof.ts', { environment }).code],
				]) {
					const label = `${extension}/${environment}: ${factory}(${callback}${options})`;
					assert.match(code, /__derived(?:Scalar)?At/, label);
					assert.equal(code.includes('__derivedScalarAt'), scalar, label);
				}
			}
		}
	}
});

test('compiled structural adoption costs only its selected implementation', async (t) => {
	const directory = import.meta.dirname;
	const filename = path.join(directory, 'structural-boundary.tsrx');
	const request = './structural-boundary.tsrx?octane-bindings=View';
	const view = `export function View(props) @{ 'use dom bindings';
 <section title={props.title}>
  <button type="button" onClick={props.onClick}>{props.label as string}</button>
  @if (props.expanded) { <p>{props.detail as string}</p> } @else { <span>Closed</span> }
 </section>
}`;
	const options = { dev: false, hmr: false };
	const descriptor = compile(view, filename + '?octane-bindings=View', {
		...options,
		mode: 'client',
	}).code;
	const bundle = async (entry, mode = 'client') => {
		const result = await build({
			stdin: {
				contents: compile(entry, path.join(directory, 'structural-entry.tsrx'), {
					...options,
					mode,
				}).code,
				resolveDir: directory,
			},
			bundle: true,
			metafile: true,
			write: false,
			minify: true,
			treeShaking: true,
			format: 'esm',
			platform: mode === 'server' ? 'node' : 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'structural-boundary-fixture',
					setup(plugin) {
						plugin.onResolve({ filter: /structural-boundary\.tsrx(?:\?.*)?$/ }, (args) => ({
							path: path.resolve(args.resolveDir, args.path),
							namespace: 'structural-boundary',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'structural-boundary' }, ({ path: id }) => ({
							contents: id.includes('?')
								? descriptor
								: compile(view, filename, { ...options, mode }).code,
							loader: 'js',
							resolveDir: directory,
						}));
					},
				},
			],
		});
		if (mode === 'client') {
			assert.ok(
				!Object.keys(result.metafile.inputs).some((name) =>
					/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|signals\/(?:engine|graph|facade)\.ts)$/.test(
						name,
					),
				),
				'An early binding artifact resolved the renderer or signal graph.',
			);
		}
		const code = result.outputFiles[0].text;
		return {
			api: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
			gzip: gzipSync(code, { level: 9 }).length,
		};
	};
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	const server = await bundle(
		`import {View} from './structural-boundary.tsrx';
import {renderToString} from 'octane/server';
export function render(props) { return renderToString(View, props).html; }`,
		'server',
	);
	const selected = await bundle(
		`import view from '${request}';
export function activate(root, source, options) { return view.adopt(root, view, source, options); }`,
	);
	const publicEntry = await bundle(
		`import {adoptBindings} from 'octane/behavior';
import {View} from './structural-boundary.tsrx';
export function activate(root, source, options) { return adoptBindings(root, View, source, options); }`,
	);
	for (const { api } of [selected, publicEntry]) {
		let clicks = 0;
		let snapshot = {
			title: 'Initial',
			label: 'Send',
			detail: 'Details',
			expanded: false,
			onClick: () => clicks++,
		};
		const listeners = new Set();
		const source = {
			getSnapshot: () => snapshot,
			subscribe(notify) {
				listeners.add(notify);
				return () => listeners.delete(notify);
			},
		};
		const host = window.document.createElement('div');
		host.innerHTML = server.api.render(snapshot);
		window.document.body.append(host);
		const section = host.querySelector('section');
		const button = host.querySelector('button');
		const binding = api.activate(section, source);
		try {
			assert.equal(host.querySelector('section'), section);
			assert.equal(host.querySelector('button'), button);
			assert.equal(section.title, 'Initial');
			assert.equal(button.textContent, 'Send');
			assert.equal(host.querySelector('span').textContent, 'Closed');
			button.click();
			assert.equal(clicks, 1);
			snapshot = { ...snapshot, title: 'Updated', label: 'Stop', expanded: true };
			for (const notify of listeners) notify();
			assert.equal(host.querySelector('section'), section);
			assert.equal(host.querySelector('button'), button);
			assert.equal(section.title, 'Updated');
			assert.equal(button.textContent, 'Stop');
			assert.equal(host.querySelector('p').textContent, 'Details');
			assert.equal(host.querySelector('span'), null);
		} finally {
			binding.dispose();
		}
		assert.equal(listeners.size, 0);
		assert.equal(host.querySelector('button'), button);
		button.click();
		assert.equal(clicks, 1);
		host.remove();
	}
	// Compare the same compiled descriptor and runtime closure. Leave room for
	// minor lowering overhead, but not an additional unrelated adopter implementation.
	t.diagnostic(JSON.stringify({ selectedGzip: selected.gzip, publicGzip: publicEntry.gzip }));
	assert.ok(
		publicEntry.gzip / selected.gzip < 1.01,
		`Public structural adoption retained excess code: ${publicEntry.gzip}/${selected.gzip} gzip bytes`,
	);
});

test('list-free programs omit list costs while imported legacy lists remain live', async (t) => {
	const directory = path.resolve('packages/octane');
	const sources = {
		'OptionalList.tsrx': `import {ListChild} from './ListChild.tsrx';
export function OptionalList(props) @{ 'use dom bindings';
 <main title={props.label}>@if (props.shown) {
  <ListChild items={props.items} onClick={props.onClick}><strong>{props.label as string}</strong></ListChild>
 } @else { <i>Hidden</i> }</main>
}`,
		'ListChild.tsrx': `export function ListChild(props) @{ 'use dom bindings';
 <article>{props.children}@for (const item of props.items; key item.id) {
  <button data-row={item.id} onClick={() => props.onClick(item.id)}>{item.label as string}<input /></button>
 } @empty { <em>Empty</em> }</article>
}`,
		'ButtonChild.tsrx': `export function ButtonChild(props) @{ 'use dom bindings';
 <button onClick={props.onClick}>{props.label as string}</button>
}`,
		'ListFree.tsrx': `import {ButtonChild} from './ButtonChild.tsrx';
export function ListFree(props) @{ 'use dom bindings';
 <main title={props.label}><ButtonChild onClick={props.onClick} label={props.label} />
 @if (props.shown) { <strong>Shown</strong> } @else { <i>Hidden</i> }</main>
}`,
	};
	const legacy = (request) => `import current from ${JSON.stringify(request)};
import {__adoptBindingProgram, __mountBindingProgram} from 'octane/dom-binding-program';
export default {...current, list: undefined, adopt: __adoptBindingProgram, mount: __mountBindingProgram};`;
	const bundle = async (view, mode, dev, oldRoot = false, oldChild = false) => {
		const entry =
			mode === 'server'
				? `import {${view}} from './${view}.tsrx'; import {renderToString} from 'octane/server';
export function render(props) { return renderToString(${view}, props).html; }`
				: `import view from './${view}.tsrx?octane-bindings=${view}&octane-mount=1';
export function adopt(root, source, options) { return view.adopt(root, view, source, options); }
export function mount(root, source, options) { return view.mount(root, view, source, options); }`;
		const result = await build({
			stdin: { contents: entry, resolveDir: directory },
			bundle: true,
			write: false,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: mode === 'server' ? 'node' : 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'optional-list-artifacts',
					setup(plugin) {
						plugin.onResolve(
							{ filter: /(?:OptionalList|ListChild|ListFree|ButtonChild)\.tsrx(?:\?.*)?$/ },
							({ path: id }) => ({ path: id, namespace: 'optional-list' }),
						);
						plugin.onLoad({ filter: /.*/, namespace: 'optional-list' }, ({ path: id }) => {
							const current = id.startsWith('current:');
							const request = current ? id.slice('current:'.length) : id;
							const name = path.basename(request.split('?')[0]);
							// A previous descriptor carried only its legacy entry, not a list field.
							// The compiler-created native plans themselves remain unchanged.
							const old = name === `${view}.tsrx` ? oldRoot : oldChild;
							return {
								contents:
									!current && old && request.includes('?')
										? legacy('current:' + request)
										: compile(sources[name], path.join(directory, request), {
												mode,
												dev,
												hmr: false,
											}).code,
								loader: 'js',
								resolveDir: directory,
							};
						});
					},
				},
			],
		});
		if (mode === 'client')
			assert.ok(
				!Object.keys(result.metafile.inputs).some((name) =>
					/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|signals\/(?:engine|graph|facade)\.ts)$/.test(
						name,
					),
				),
				'A binding program reached the renderer or signal graph.',
			);
		const code = result.outputFiles[0].text;
		return {
			api: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
			gzip: gzipSync(code, { level: 9 }).length,
		};
	};
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	for (const view of ['ListFree', 'OptionalList'])
		for (const dev of [false, true]) {
			const server = await bundle(view, 'server', dev);
			const variants =
				view === 'ListFree'
					? [
							[false, false],
							[true, false],
						]
					: [
							[false, false],
							[false, true],
							[true, false],
							[true, true],
						];
			const sizes = [];
			for (const [oldRoot, oldChild] of variants) {
				const client = await bundle(view, 'client', dev, oldRoot, oldChild);
				sizes.push(client.gzip);
				for (const adopt of [false, true])
					for (const shown of [false, true]) {
						const clicked = [];
						let snapshot = {
							label: 'First',
							shown,
							items: [
								{ id: 'a', label: 'A' },
								{ id: 'b', label: 'B' },
							],
							onClick: (id) => clicked.push(id),
						};
						const subscriptions = new Set();
						const source = {
							getSnapshot: () => snapshot,
							subscribe(notify) {
								subscriptions.add(notify);
								return () => subscriptions.delete(notify);
							},
						};
						const publish = (props) => {
							snapshot = { ...snapshot, ...props };
							for (const notify of subscriptions) notify();
						};
						const host = window.document.createElement('div');
						window.document.body.append(host);
						if (adopt) host.innerHTML = server.api.render(snapshot);
						const serverMain = host.querySelector('main');
						const controller = new AbortController();
						const handle = adopt
							? client.api.adopt(serverMain, source, { signal: controller.signal })
							: client.api.mount({ parent: host }, source, { signal: controller.signal });
						try {
							const main = host.querySelector('main');
							if (adopt) assert.equal(main, serverMain);
							publish({ shown: true, label: 'Next' });
							assert.equal(host.querySelector('main'), main);
							assert.equal(main.title, 'Next');
							if (view === 'ListFree') {
								assert.equal(host.querySelector('button').textContent, 'Next');
								assert.equal(host.querySelector('strong').textContent, 'Shown');
							} else {
								assert.equal(host.querySelector('strong').textContent, 'Next');
								const first = host.querySelector('[data-row="a"]');
								const input = first.querySelector('input');
								input.value = 'Native edit';
								publish({
									items: [
										{ id: 'b', label: 'Updated B' },
										{ id: 'c', label: 'C' },
										{ id: 'a', label: 'Updated A' },
									],
								});
								assert.equal(host.querySelectorAll('button')[2], first);
								assert.equal(first.querySelector('input'), input);
								assert.equal(input.value, 'Native edit');
								assert.deepEqual(
									[...host.querySelectorAll('button')].map((node) => node.textContent),
									['Updated B', 'C', 'Updated A'],
								);
								first.click();
								assert.deepEqual(clicked, ['a']);
								publish({ items: [] });
								assert.equal(host.querySelector('em').textContent, 'Empty');
								first.click();
								assert.deepEqual(clicked, ['a']);
								publish({ items: [{ id: 'a', label: 'Returned' }] });
								assert.notEqual(host.querySelector('button'), first);
								const before = host.innerHTML;
								assert.throws(
									() =>
										publish({
											items: [
												{ id: 'a', label: 'Wrong' },
												{ id: 'a', label: 'Duplicate' },
											],
										}),
									/duplicate keys/,
								);
								assert.equal(host.innerHTML, before);
								assert.equal(subscriptions.size, 0);
							}
							const button = host.querySelector('button');
							const count = clicked.length;
							controller.abort();
							assert.equal(subscriptions.size, 0);
							button.click();
							assert.equal(clicked.length, count);
						} finally {
							handle.dispose();
							host.remove();
						}
					}
			}
			if (!dev) {
				t.diagnostic(JSON.stringify({ view, selectedGzip: sizes[0], legacyGzip: sizes.at(-1) }));
				assert.ok(
					sizes[0] / sizes.at(-1) < (view === 'ListFree' ? 0.985 : 1.02),
					`${view} selected/legacy gzip ratio: ${sizes[0]}/${sizes.at(-1)}`,
				);
			}
		}
});

test('simple programs omit advanced host costs while imported older hosts remain live', async (t) => {
	const directory = path.resolve('packages/octane');
	const sources = {
		'SimpleHost.tsrx': `export function SimpleHost(props) @{ 'use dom bindings';
 <main class={props.classes} style={props.style}><button onClick={props.onClick}>{props.label as string}</button>
 @if (props.shown) { <strong>Shown</strong> } @else { <i>Hidden</i> }</main>
}`,
		'HostParent.tsrx': `import {HostChild} from './HostChild.tsrx';
export function HostParent(props) @{ 'use dom bindings'; <main>
 <HostChild value={props.label} height$={props.height} classes={props.classes} onClick={props.onClick} />
 <HostChild value="Second" height$={8} classes="second" onClick={props.onClick} />
 @if (props.shown) { <HostChild value="Third" height$={props.height} classes={props.classes} onClick={props.onClick} /> }
 @else { <i>Hidden</i> }</main>
}`,
		'HostChild.tsrx': `import {unbound} from 'octane/behavior'; import * as stylex from 'binding-styles';
const styles = stylex.create({size: height => ({className: height == null ? 'empty' : 'sized', style: {height}})});
export function HostChild(props) @{ 'use dom bindings'; <article>
 <input value={props.value}/><select defaultValue="b"><option value="a">A</option><option value="b">B</option></select>
 <span class={[unbound('external'), props.classes]}>Class</span>
 <div sx={styles.size(props.height$)}><input /></div><button onClick={props.onClick}>Go</button>
</article> }`,
	};
	const bundle = async (view, mode, dev, oldRoot = false, oldChild = false) => {
		const entry =
			mode === 'server'
				? `import {${view}} from './${view}.tsrx'; import {renderToString} from 'octane/server';
export function render(props) { return renderToString(${view}, props).html; }`
				: `import view from './${view}.tsrx?octane-bindings=${view}&octane-mount=1';
export function adopt(root, source, options) { return view.adopt(root, view, source, options); }
export function mount(root, source, options) { return view.mount(root, view, source, options); }`;
		const result = await build({
			stdin: { contents: entry, resolveDir: directory },
			bundle: true,
			write: false,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: mode === 'server' ? 'node' : 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'optional-host-artifacts',
					setup(plugin) {
						plugin.onResolve(
							{ filter: /(?:SimpleHost|HostParent|HostChild)\.tsrx(?:\?.*)?$/ },
							({ path: id }) => ({ path: id, namespace: 'optional-host' }),
						);
						plugin.onResolve({ filter: /^binding-styles$/ }, () => ({
							path: 'binding-styles',
							namespace: 'host-styles',
						}));
						// The adapter's compiled object contract; no CSS generation is measured here.
						plugin.onLoad({ filter: /.*/, namespace: 'host-styles' }, () => ({
							contents:
								'export const create = value => value; export const props = value => value;',
							loader: 'js',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'optional-host' }, ({ path: id }) => {
							const current = id.startsWith('current:');
							const request = current ? id.slice('current:'.length) : id;
							const name = path.basename(request.split('?')[0]);
							const old = name === `${view}.tsrx` ? oldRoot : oldChild;
							return {
								contents:
									!current && old && request.includes('?')
										? `import current from ${JSON.stringify('current:' + request)};
import {__adoptSelectedBindingProgram, __mountSelectedBindingProgram} from 'octane/dom-binding-program';
export default {...current, hostOperations: undefined, adopt: __adoptSelectedBindingProgram, mount: __mountSelectedBindingProgram};`
										: compile(sources[name], path.join(directory, request), {
												mode,
												dev,
												hmr: false,
												knownAttributeSpreads: [
													{
														source: 'binding-styles',
														imported: '*',
														members: ['props'],
														fields: ['className', 'style'],
														style: 'object',
														jsxAttribute: 'sx',
													},
												],
											}).code,
								loader: 'js',
								resolveDir: directory,
							};
						});
					},
				},
			],
		});
		if (mode === 'client')
			assert.ok(
				!Object.keys(result.metafile.inputs).some((id) =>
					/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|signals\/(?:engine|graph|facade)\.ts)$/.test(
						id,
					),
				),
				'Host bindings reached the renderer or signal graph.',
			);
		const code = result.outputFiles[0].text;
		return {
			api: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
			gzip: gzipSync(code, { level: 9 }).length,
		};
	};
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	for (const view of ['SimpleHost', 'HostParent'])
		for (const dev of [false, true]) {
			const server = await bundle(view, 'server', dev);
			const variants =
				view === 'SimpleHost'
					? [
							[false, false],
							[true, false],
						]
					: [
							[false, false],
							[false, true],
							[true, false],
							[true, true],
						];
			const sizes = [];
			for (const [oldRoot, oldChild] of variants) {
				const client = await bundle(view, 'client', dev, oldRoot, oldChild);
				sizes.push(client.gzip);
				for (const adopt of [false, true])
					for (const shown of [false, true]) {
						let clicks = 0;
						let snapshot = {
							label: 'First',
							classes: 'primary',
							style: { height: 2 },
							height: 2,
							shown,
							onClick: () => clicks++,
						};
						const listeners = new Set();
						const source = {
							getSnapshot: () => snapshot,
							subscribe(notify) {
								listeners.add(notify);
								return () => listeners.delete(notify);
							},
						};
						const publish = (props) => {
							snapshot = { ...snapshot, ...props };
							for (const notify of listeners) notify();
						};
						const host = window.document.createElement('div');
						window.document.body.append(host);
						if (adopt) host.innerHTML = server.api.render(snapshot);
						const serverMain = host.querySelector('main');
						const controller = new AbortController();
						const handle = adopt
							? client.api.adopt(serverMain, source, { signal: controller.signal })
							: client.api.mount({ parent: host }, source, { signal: controller.signal });
						try {
							const main = host.querySelector('main');
							const first = host.querySelector('article');
							if (adopt) assert.equal(main, serverMain);
							if (first) {
								assert.equal(first.querySelector('input').value, 'First');
								assert.equal(first.querySelector('select').value, 'b');
								assert.equal(first.querySelector('span').className, 'external primary');
								assert.equal(first.querySelector('div').style.height, '2px');
							}
							host.querySelector('button').click();
							assert.equal(clicks, 1);
							publish({
								label: 'Updated',
								height: 3,
								style: { height: 3 },
								classes: 'changed',
								shown: true,
							});
							assert.equal(host.querySelector('main'), main);
							if (view === 'SimpleHost') {
								assert.equal(main.className, 'changed');
								assert.equal(main.style.height, '3px');
								assert.equal(host.querySelector('button').textContent, 'Updated');
								assert.equal(host.querySelector('strong').textContent, 'Shown');
							} else {
								assert.equal(host.querySelector('article'), first);
								assert.deepEqual(
									[...host.querySelectorAll('article > input')].map((node) => node.value),
									['Updated', 'Second', 'Third'],
								);
								assert.deepEqual(
									[...host.querySelectorAll('article > div')].map((node) => node.style.height),
									['3px', '8px', '3px'],
								);
								assert.equal(first.querySelector('span').className, 'external changed');
								const retired = host.querySelectorAll('article')[2];
								publish({ shown: false });
								retired.querySelector('button').click();
								assert.equal(clicks, 1);
								publish({ shown: true });
								assert.notEqual(host.querySelectorAll('article')[2], retired);
							}
							controller.abort();
							assert.equal(listeners.size, 0);
							host.querySelector('button').click();
							assert.equal(clicks, 1);
							const html = host.innerHTML;
							publish({ label: 'Disposed' });
							assert.equal(host.innerHTML, html);
						} finally {
							handle.dispose();
							host.remove();
						}
					}
			}
			if (!dev) {
				t.diagnostic(
					JSON.stringify({ view, selectedGzip: sizes[0], compatibilityGzip: sizes.at(-1) }),
				);
				assert.ok(sizes[0] / sizes.at(-1) < (view === 'SimpleHost' ? 0.95 : 1.02));
			}
		}
});

test('early whole-style bindings exclude later renderer attribute tables', async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), 'octane-style-boundary-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const entries = {
		early: `export { __createBindingStyles, __normalizeBindingStyle } from 'octane/dom-binding-styles';`,
		renderer: `export { createRoot, createElement, flushSync } from 'octane';`,
	};
	const bundle = async (broad) => {
		const outdir = path.join(directory, broad ? 'broad' : 'selected');
		const result = await build({
			entryPoints: Object.fromEntries(
				Object.keys(entries).map((name) => [name, `style-boundary:${name}`]),
			),
			outdir,
			outExtension: { '.js': '.mjs' },
			bundle: true,
			splitting: true,
			write: true,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'style-boundary',
					setup(plugin) {
						plugin.onResolve({ filter: /^style-boundary:/ }, ({ path: id }) => ({
							path: id.slice('style-boundary:'.length),
							namespace: 'style-boundary',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'style-boundary' }, ({ path: name }) => ({
							contents: entries[name],
							loader: 'js',
							resolveDir: path.resolve('packages/octane'),
						}));
						// The control restores the broad import edge without copying or
						// changing either helper implementation or any DOM semantics.
						if (broad)
							plugin.onResolve({ filter: /style-values\.js$/ }, (args) => {
								if (args.importer.endsWith('/dom-binding-styles.ts'))
									return { path: path.resolve('packages/octane/src/dom-tables.js') };
							});
					},
				},
			],
		});
		const earlyFiles = new Set();
		const earlyInputs = new Set();
		const visit = (id) => {
			if (earlyFiles.has(id)) return;
			earlyFiles.add(id);
			const output = result.metafile.outputs[id];
			assert.ok(output, 'An emitted style dependency must resolve.');
			for (const [input, metadata] of Object.entries(output.inputs))
				if (metadata.bytesInOutput > 0) earlyInputs.add(input);
			for (const dependency of output.imports) {
				assert.equal(dependency.external, undefined);
				visit(dependency.path);
			}
		};
		for (const [id, output] of Object.entries(result.metafile.outputs))
			if (output.entryPoint === 'style-boundary:early') visit(id);
		assert.ok(earlyFiles.size > 0);
		let earlyGzip = 0;
		let combinedGzip = 0;
		for (const id of Object.keys(result.metafile.outputs)) {
			const bytes = gzipSync(await readFile(path.resolve(id)), { level: 9 }).length;
			combinedGzip += bytes;
			if (earlyFiles.has(id)) earlyGzip += bytes;
		}
		return { outdir, earlyInputs, earlyGzip, combinedGzip };
	};
	const baseline = await bundle(true);
	const selected = await bundle(false);
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	for (const result of [baseline, selected]) {
		const early = await import(pathToFileURL(path.join(result.outdir, 'early.mjs')).href);
		const renderer = await import(pathToFileURL(path.join(result.outdir, 'renderer.mjs')).href);
		const bound = window.document.createElement('div');
		const child = bound.appendChild(window.document.createElement('span'));
		const rendered = window.document.createElement('section');
		const root = renderer.createRoot(rendered);
		const binding = early.__createBindingStyles().connect(bound, () => {});
		try {
			for (const value of [
				{ width: 12, height: 0, opacity: 0.4, lineHeight: 1.5, '--tone': 13 },
				{ width: 0, marginLeft: -2, opacity: null, lineHeight: 2, '--tone': ' blue ' },
				null,
			]) {
				binding.write(binding.read(value));
				renderer.flushSync(() => root.render(renderer.createElement('div', { style: value })));
				assert.equal(bound.style.cssText, rendered.firstElementChild.style.cssText);
				assert.equal(bound.firstChild, child);
				if (value?.width === 12) {
					assert.equal(bound.style.width, '12px');
					assert.equal(bound.style.lineHeight, '1.5');
					assert.equal(bound.style.getPropertyValue('--tone'), '13');
				}
			}
			assert.deepEqual(
				{ ...early.__normalizeBindingStyle({ WebkitBoxFlex: 2, msFlex: 3, '--Tone': 4 }) },
				{ WebkitBoxFlex: '2', msFlex: '3', '--Tone': '4' },
			);
		} finally {
			binding.dispose();
			root.unmount();
		}
	}
	assert.ok([...baseline.earlyInputs].some((id) => id.endsWith('/dom-tables.js')));
	assert.ok(
		![...selected.earlyInputs].some((id) =>
			/(?:\/dom-tables\.js|\/runtime(?:\.server)?\.ts|\/signals\/(?:engine|graph|facade)\.ts)$/.test(
				id,
			),
		),
		'The early style closure retained unrelated renderer tables or implementations.',
	);
	t.diagnostic(
		JSON.stringify({
			baselineEarlyGzip: baseline.earlyGzip,
			selectedEarlyGzip: selected.earlyGzip,
			baselineCombinedGzip: baseline.combinedGzip,
			selectedCombinedGzip: selected.combinedGzip,
		}),
	);
	assert.ok(selected.earlyGzip / baseline.earlyGzip < 0.8);
	assert.ok(selected.combinedGzip / baseline.combinedGzip < 1.01);
});

test('production StyleX recipes are shared by renderer and extracted binding entries', async (t) => {
	const directory = path.resolve('packages/octane');
	const filename = path.join(directory, 'SharedRecipeView.tsrx');
	// A neutral design-system-sized recipe, not a copy of an application component.
	// Dynamic selection prevents either consumer from folding away the variant table.
	const variants = Array.from(
		{ length: 48 },
		(_, index) =>
			`variant${index}: { paddingTop: ${index + 1}, marginInline: ${index % 9},
 color: '#${(index * 193 + 0x123456).toString(16)}', borderRadius: ${index % 13} }`,
	);
	const dynamics = Array.from(
		{ length: 12 },
		(_, index) => `dynamic${index}: (value) => ({ width: value, opacity: ${1 - index / 24} })`,
	);
	const view = `import * as stylex from '@octanejs/stylex';
const styles = stylex.create({
 base: { padding: 8, borderWidth: 1, borderStyle: 'solid' },
 active: { paddingTop: 24, color: 'rebeccapurple' },
 reset: { width: null, paddingTop: null },
 ${[...variants, ...dynamics].join(',\n')}
});
export function SharedRecipeView(props) @{ 'use dom bindings';
 <button sx={[styles.base, styles[props.variant], props.active && styles.active,
  ${dynamics.map((_, index) => `props.dynamic === ${index} && styles.dynamic${index}(props.width)`).join(',\n')},
  props.reset && styles.reset]}
  disabled={props.disabled}>{props.label as string}</button>
}`;
	const entries = {
		normal: `import {createRoot, flushSync} from 'octane';
import {SharedRecipeView} from './SharedRecipeView.tsrx';
export function mount(parent, source) {
 const root = createRoot(parent);
 const render = () => flushSync(() => root.render(SharedRecipeView, source.getSnapshot()));
 render();
 const unsubscribe = source.subscribe(render);
 return {dispose() { unsubscribe(); root.unmount(); }};
}`,
		early: `import {mountBindings} from 'octane/behavior';
import {SharedRecipeView} from './SharedRecipeView.tsrx';
export function mount(parent, source) { return mountBindings({parent}, SharedRecipeView, source); }`,
	};
	const bundle = async (sharing, names) => {
		const shared = new Map();
		const transformed = new Map();
		const result = await build({
			entryPoints: Object.fromEntries(names.map((name) => [name, `recipe-entry:${name}`])),
			outdir: path.join(directory, 'recipe-benchmark-output'),
			bundle: true,
			splitting: names.length > 1,
			write: false,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'compiled-shared-stylex-recipes',
					setup(plugin) {
						plugin.onResolve({ filter: /^recipe-entry:/ }, ({ path: id }) => ({
							path: id.slice('recipe-entry:'.length),
							namespace: 'recipe-entry',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'recipe-entry' }, ({ path: name }) => ({
							contents: compile(entries[name], path.join(directory, `${name}.tsrx`), {
								mode: 'client',
								dev: false,
								hmr: false,
							}).code,
							loader: 'js',
							resolveDir: directory,
						}));
						plugin.onResolve({ filter: /SharedRecipeView\.tsrx(?:\?.*)?$/ }, ({ path: id }) => ({
							path: path.join(directory, id),
							namespace: 'recipe-view',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'recipe-view' }, ({ path: id }) => {
							const compiled = compile(view, id, {
								mode: 'client',
								dev: false,
								hmr: false,
								knownAttributeSpreads,
							});
							const output = transformStylex(compiled.code, {
								filename,
								dev: false,
								bindingConstants: sharing ? compiled.bindingConstants : undefined,
								inputSourceMap: compiled.map,
								stylexOptions: {
									styleResolution: 'application-order',
									sxPropName: 'sx',
									enableInlinedConditionalMerge: true,
								},
							});
							transformed.set(id, output);
							for (const record of output.sharedConstants) {
								if (shared.has(record.id)) assert.equal(shared.get(record.id), record.code);
								shared.set(record.id, record.code);
							}
							return { contents: output.code, loader: 'js', resolveDir: directory };
						});
						plugin.onResolve({ filter: /^virtual:octane-stylex-bindings\// }, ({ path: id }) => ({
							path: id,
							namespace: 'shared-recipe',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'shared-recipe' }, ({ path: id }) => {
							assert.ok(shared.has(id), 'Every shared import must resolve to its compiled module.');
							return { contents: shared.get(id), loader: 'js', resolveDir: directory };
						});
						plugin.onResolve({ filter: /^@octanejs\/stylex$/ }, () => ({
							path: path.resolve('packages/stylex/src/index.ts'),
						}));
					},
				},
			],
		});
		const earlyInputs = new Set();
		const earlyFiles = new Set();
		const visit = (id) => {
			if (earlyFiles.has(id)) return;
			earlyFiles.add(id);
			const output = result.metafile.outputs[id];
			assert.ok(output, 'Every emitted early-entry import must resolve.');
			for (const [input, metadata] of Object.entries(output.inputs))
				if (metadata.bytesInOutput > 0) earlyInputs.add(input);
			for (const imported of output.imports) {
				assert.equal(imported.external, undefined);
				visit(imported.path);
			}
		};
		for (const [id, output] of Object.entries(result.metafile.outputs))
			if (output.entryPoint === 'recipe-entry:early') visit(id);
		if (names.includes('early'))
			assert.ok(
				![...earlyInputs].some((name) =>
					/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|signals\/(?:engine|graph|facade)\.ts)$/.test(
						name,
					),
				),
				'The extracted StyleX entry or its shared chunks retained the renderer or signal graph.',
			);
		const gzip = (files) =>
			files.reduce((bytes, file) => bytes + gzipSync(file.contents, { level: 9 }).length, 0);
		return {
			...result,
			shared,
			transformed,
			// Each emitted chunk is a separate transfer; include ALL chunks, not just entries.
			gzip: gzip(result.outputFiles),
			earlyGzip: gzip(
				result.outputFiles.filter((file) =>
					earlyFiles.has(path.relative(process.cwd(), file.path)),
				),
			),
			css: generateStylexCSS([...transformed.values()].flatMap((output) => output.rules)),
		};
	};
	const baseline = await bundle(false, ['normal', 'early']);
	const selected = await bundle(true, ['normal', 'early']);
	assert.equal(selected.transformed.size, 2);
	const ids = [...selected.transformed.values()].map((output) =>
		output.sharedConstants.map((record) => record.id),
	);
	assert.ok(
		ids[0].length > 0,
		'The compiled recipe must be shared, not duplicated in both entries.',
	);
	assert.deepEqual(ids[0], ids[1], 'Both consumers must import the same compiled recipe.');
	for (const id of selected.shared.keys())
		assert.equal(
			Object.values(selected.metafile.outputs).filter(
				(output) => output.inputs[`shared-recipe:${id}`]?.bytesInOutput > 0,
			).length,
			1,
			'Each shared recipe must be emitted exactly once across the paired output graph.',
		);
	assert.ok(selected.css.length > 0);
	assert.equal(selected.css, baseline.css, 'Sharing must not change the extracted stylesheet.');
	t.diagnostic(
		JSON.stringify({
			fixtureGitBlob: gitBlobHash(Buffer.from(view)),
			combinedGzip: selected.gzip,
			unsharedCombinedGzip: baseline.gzip,
			earlyClosureGzip: selected.earlyGzip,
			unsharedEarlyClosureGzip: baseline.earlyGzip,
		}),
	);
	assert.ok(
		selected.gzip / baseline.gzip < 0.99,
		`Shared/unshared combined gzip ratio: ${selected.gzip}/${baseline.gzip}`,
	);
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	});
	const lanes = [];
	for (const sharing of [false, true])
		for (const name of ['normal', 'early']) {
			const result = await bundle(sharing, [name]);
			if (name === 'early') t.diagnostic(JSON.stringify({ sharing, earlyOnlyGzip: result.gzip }));
			const api = await import(
				'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
			);
			let snapshot = {
				variant: 'variant0',
				dynamic: 0,
				width: 12,
				active: false,
				reset: false,
				disabled: false,
				label: 'First',
			};
			const subscriptions = new Set();
			const host = window.document.createElement('div');
			window.document.body.append(host);
			const handle = api.mount(host, {
				getSnapshot: () => snapshot,
				subscribe(notify) {
					subscriptions.add(notify);
					return () => subscriptions.delete(notify);
				},
			});
			const button = host.querySelector('button');
			assert.ok(button);
			t.after(() => {
				handle.dispose();
				host.remove();
				assert.equal(subscriptions.size, 0);
			});
			lanes.push({
				button,
				update(props) {
					snapshot = { ...snapshot, ...props };
					for (const notify of subscriptions) notify();
					assert.equal(host.querySelector('button'), button);
					assert.equal(button.textContent, snapshot.label);
					assert.equal(button.disabled, snapshot.disabled);
					return [button.className, button.getAttribute('style')];
				},
			});
		}
	for (const props of [
		{},
		{ variant: 'variant47', dynamic: 11, width: 36, active: true, label: 'Changed' },
		{ width: null, disabled: true },
		{ width: '50%', reset: true },
		{ variant: 'variant12', width: 0, reset: false, active: false, disabled: false },
	]) {
		const results = lanes.map((lane) => lane.update(props));
		for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
	}
});

test('extracted primitive values omit signal binding work without trusting casts or opaque results', (t) => {
	const cases = [
		{ expression: 'String(props.value)', primitive: true },
		{ expression: 'Number(props.value)', primitive: true },
		{ expression: 'BigInt(props.value)', primitive: true },
		{ expression: 'Date()', primitive: true },
		{ expression: '`value:${props.value}`', primitive: true },
		{ expression: 'typeof props.value', primitive: true },
		{ expression: 'props.value + 1', primitive: true },
		{ expression: '!props.value', primitive: true },
		{ expression: 'props.value++', primitive: true },
		{ expression: 'props.active ? String(props.value) : "fallback"', primitive: true },
		{ expression: 'String(props.left) || String(props.right)', primitive: true },
		{ expression: '(props.touch(), typeof props.value)', primitive: true },
		{ expression: 'props.value = String(props.other)', primitive: true },
		{ expression: 'props.value += props.other', primitive: true },
		{ expression: 'props.value as string', primitive: false },
		{ expression: 'props.value!', primitive: false },
		{ expression: 'props.value', primitive: false },
		{ expression: 'props.read()', primitive: false },
		{ expression: 'props.api.get()', primitive: false },
		{ expression: 'props.active ? String(props.value) : props.other', primitive: false },
		{ expression: 'String(props.left) || props.right', primitive: false },
		{ expression: 'props.value ||= props.other', primitive: false },
		{
			prefix: 'function String(value) { return value; }',
			expression: 'String(props.value)',
			primitive: false,
		},
		{
			prefix: 'globalThis.String = (value) => value;',
			expression: 'String(props.value)',
			primitive: false,
		},
		{
			prefix: "import { passThrough } from './value-barrel';",
			expression: 'passThrough(props.value)',
			primitive: false,
		},
	];
	let checked = 0;
	for (const extension of ['tsx', 'tsrx'])
		for (const dev of [false, true])
			for (const { expression, prefix = '', primitive } of cases) {
				const source = `${prefix}
export function App(props) {
					return <span title={${expression}}>{${expression} as string}</span>;
				}`;
				const { code } = compile(source, `/project/primitive-binding.${extension}`, {
					mode: 'client',
					dev,
					hmr: false,
				});
				// This is a compiler-cost guard: behavior is covered by public hydration
				// and late writable-prop tests. Count the emitted runtime capabilities,
				// rather than treating smaller fixture bytes as a speed measurement.
				const bindings = [...code.matchAll(/\bbindSignal\w*\s+as\b/g)];
				const description = `${extension}, ${dev ? 'dev' : 'prod'}: ${prefix} ${expression}`;
				if (primitive) assert.equal(bindings.length, 0, description);
				else assert.ok(bindings.length > 0, description);
				checked++;
			}
	t.diagnostic(`${checked} fixed-source primitive and opaque compiler controls`);
});

test('local void root specialization needs every lexical use and the loaded export contract', async (t) => {
	const directory = path.resolve('packages/octane');
	const id = path.join(directory, 'LocalRoot.ts');
	const compiler = createOctaneCompiler({ root: directory, dev: false, hmr: false });
	const component = compiler.transform(
		'export default function View() @{ <main>Octane</main> }',
		path.join(directory, 'LocalView.tsrx'),
		{ collectVoidComponentExports: true },
	);
	assert.ok(component);
	assert.deepEqual(component.voidComponentExports, ['default']);
	const imports =
		"import {createRoot} from 'octane'; import View from './LocalView.tsrx'; import Other from './Other.tsrx';\n";
	const proves = (request, imported) =>
		request === './LocalView.tsrx' && component.voidComponentExports.includes(imported);
	const sources = [
		[
			'local',
			'export function run(el) { const root=createRoot(el); root.render(View); root.unmount(); }',
			true,
		],
		[
			'repeated void render',
			'export function run(el) { const root=createRoot(el); root.render(View); root.render(View, {}); root.unmount(); }',
			true,
		],
		[
			'unrelated root shadow',
			'export function run(el) { const root=createRoot(el); root.render(View); root.unmount(); } function unrelated(root) { root.render(Other); }',
			true,
		],
		['exported root', 'export const root=createRoot(document.body); root.render(View);', false],
		[
			'returned root',
			'export function run(el) { const root=createRoot(el); root.render(View); return root; }',
			false,
		],
		[
			'alias',
			'export function run(el) { const root=createRoot(el); root.render(View); const alias=root; }',
			false,
		],
		[
			'object escape',
			'export function run(el) { const root=createRoot(el); root.render(View); return {root}; }',
			false,
		],
		[
			'callback escape',
			'export function run(el) { const root=createRoot(el); root.render(View); return () => root.render(View); }',
			false,
		],
		[
			'argument escape',
			'export function run(el) { const root=createRoot(el); root.render(View); consume(root); }',
			false,
		],
		[
			'method extraction',
			'export function run(el) { const root=createRoot(el); root.render(View); return root.render; }',
			false,
		],
		[
			'computed render',
			'export function run(el) { const root=createRoot(el); root["render"](View); }',
			false,
		],
		[
			'optional render',
			'export function run(el) { const root=createRoot(el); root.render?.(View); }',
			false,
		],
		[
			'unknown render target',
			'export function run(el) { const root=createRoot(el); root.render(View); root.render(Other); }',
			false,
		],
		[
			'dynamic render target',
			'export function run(el, Component) { const root=createRoot(el); root.render(View); root.render(Component); }',
			false,
		],
		[
			'renderable text',
			'export function run(el) { const root=createRoot(el); root.render(View); root.render("text"); }',
			false,
		],
		[
			'factory shadow',
			'export function run(el, createRoot) { const root=createRoot(el); root.render(View); }',
			false,
		],
		[
			'component shadow',
			'export function run(el, View) { const root=createRoot(el); root.render(View); }',
			false,
		],
		[
			'hoisted factory shadow',
			'export function run(el) { const root=createRoot(el); root.render(View); var createRoot; }',
			false,
		],
		[
			'TDZ component shadow',
			'export function run(el) { const root=createRoot(el); root.render(View); let View; }',
			false,
		],
		[
			'block escape',
			'export function run(el) { const root=createRoot(el); root.render(View); { consume(root); } }',
			false,
		],
		[
			'catch escape',
			'export function run(el) { const root=createRoot(el); root.render(View); try {} catch (error) { consume(root); } }',
			false,
		],
		[
			'class field escape',
			'export function run(el) { const root=createRoot(el); root.render(View); return class { field = root; }; }',
			false,
		],
		[
			'direct eval',
			'export function run(el) { const root=createRoot(el); root.render(View); eval("root.render(\\\"text\\\")"); }',
			false,
		],
		[
			'typed direct eval',
			'export function run(el) { const root=createRoot(el); root.render(View); (eval as Function)("root.render(\\\"text\\\")"); }',
			false,
		],
	];
	let checked = 0;
	for (const extension of ['ts', 'js'])
		for (const [label, body, eligible] of sources) {
			const source = imports + body;
			const output = slotHooks(source, id.replace(/ts$/, extension), {
				dev: false,
				hmr: false,
				isVoidComponentImport: proves,
			});
			assert.equal(
				output?.code.includes('__createVoidRoot') === true,
				eligible,
				`${extension}: ${label}`,
			);
			if (eligible)
				assert.deepEqual(findVoidRootImports(source, id), [
					{ request: './LocalView.tsrx', imported: 'default' },
				]);
			for (const options of [
				{ hmr: 'vite' },
				{ hmr: 'webpack' },
				{ profile: true },
				{ dev: true },
			]) {
				const transformed = compiler.transform(source, id, {
					isVoidComponentImport: proves,
					...options,
				});
				assert.equal(
					transformed?.code.includes('__createVoidRoot') === true,
					false,
					`${label}: ${JSON.stringify(options)}`,
				);
			}
			checked++;
		}

	// JSX entries use the full compiler, so they remain a generic-root control.
	for (const [label, body] of sources) {
		const transformed = compiler.transform(imports + body, id.replace(/ts$/, 'tsx'), {
			isVoidComponentImport: proves,
		});
		assert.equal(
			transformed?.code.includes('__createVoidRoot') === true,
			false,
			`full JSX compiler: ${label}`,
		);
		checked++;
	}

	const entry =
		imports +
		`export function run(host) { const root=createRoot(host); root.render(View); const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`;
	const window = new Window();
	const previous = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	t.after(() => {
		for (const [name, descriptor] of previous)
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		window.close();
	});
	const bytes = [];
	for (const specialize of [false, true]) {
		const transformed = compiler.transform(entry, id, {
			isVoidComponentImport: specialize ? proves : () => false,
		});
		const bundled = await build({
			stdin: { contents: transformed.code, resolveDir: directory },
			bundle: true,
			write: false,
			minify: true,
			format: 'esm',
			platform: 'browser',
			target: 'esnext',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'loaded-compiled-contract',
					setup(plugin) {
						plugin.onResolve({ filter: /^\.\/(?:LocalView|Other)\.tsrx$/ }, () => ({
							path: 'view',
							namespace: 'local-void-view',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'local-void-view' }, () => ({
							contents: component.code,
							loader: 'js',
							resolveDir: directory,
						}));
					},
				},
			],
		});
		const code = bundled.outputFiles[0].text;
		const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
		const host = window.document.createElement('div');
		window.document.body.append(host);
		assert.deepEqual(api.run(host), { text: 'Octane', cleaned: true });
		host.remove();
		bytes.push(gzipSync(code, { level: 9 }).length);
	}
	assert.ok(
		bytes[1] <= bytes[0] * 0.6,
		`Loaded local void root must delete the generic return graph: ${bytes.join(' -> ')} gzip`,
	);
	t.diagnostic(
		`${checked} lexical/escape controls; actual compiled contract generic ${bytes[0]} -> local ${bytes[1]} gzip with matching text and cleanup`,
	);
});
