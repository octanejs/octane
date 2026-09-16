import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { slotHooks } from '../../packages/octane/src/compiler/slot-hooks.js';
import { knownAttributeSpreads } from '../../packages/stylex/src/compiler-contract.js';
import { generateStylexCSS, transformStylex } from '../../packages/stylex/src/transform.js';
import {
	BUNDLE_CASES,
	baselineUnavailableReason,
	entrySource,
	gitBlobHash,
	verifyBundleInputs,
} from './bundle-boundaries.mjs';

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
	assert.equal(BUNDLE_CASES.filter((entry) => entry.baseline).length, 4);
	for (const id of ['binding-scalar', 'binding-structural']) {
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
		// the optional driver factory; their costs remain visible in the report.
		verifyBundleInputs(scenario(id), [
			...ordinary,
			{ ...source('signals/read-protocol.ts'), bytesInOutput: 1 },
			{ ...source('signals/native-read-events.ts'), bytesInOutput: 1 },
			{ ...source('signals/native-read-seeds.ts'), bytesInOutput: 36 },
		]);
	});
}

test('independent engine rejects rendering, compiler, DevTools, and the old Alien version', () => {
	const independent = [source('signals/index.ts'), source('signals/graph.ts'), alien()];
	verifyBundleInputs(scenario('engine'), independent);
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
