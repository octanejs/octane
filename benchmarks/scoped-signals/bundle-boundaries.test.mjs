import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { slotHooks } from '../../packages/octane/src/compiler/slot-hooks.js';
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
