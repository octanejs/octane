// @vitest-environment node

import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import rspack, { type Compiler, type Configuration, type RuleSetRule } from '@rspack/core';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { OctaneRspackPlugin } from '../src/index.js';
import type { OctaneRspackPluginOptions } from '../types/index.js';
import { compile, createFixture, snapshotBuild, write } from './_css-module-build.js';

const roots: string[] = [];
let buildNumber = 0;

const EXPECTED_HTML = '<main><p>Hello</p><b>value</b></main>';

// Greeting is a void `@{}` export; Loud and Value return JSX, so a void call
// would drop their output. App is both an importer and a proven provider.
function voidFixture() {
	const root = createFixture({
		'Greeting.tsrx': `export function Greeting() @{ <p>Hello</p>; }
export function Loud() { return <p>loud</p>; }`,
		'Value.tsrx': `export function Value() { return <b>value</b>; }`,
		'App.tsrx': `import { Greeting } from './Greeting.tsrx';
import { Value } from './Value.tsrx';
export function App() @{ <main><Greeting /><Value /></main>; }`,
		'entry.ts': `/** @jsxImportSource octane */
import { createRoot } from 'octane';
import { App } from './App.tsrx';
import { Value } from './Value.tsrx';
export function render(container: HTMLElement) {
	const root = createRoot(container);
	root.render(App);
	return () => root.unmount();
}
export function renderValue(container: HTMLElement) {
	const root = createRoot(container);
	root.render(Value);
	return () => root.unmount();
}`,
	});
	roots.push(root);
	return root;
}

type Sources = Map<string, string>;

/** Record each fixture module's final loader output once the graph is sealed. */
function captureSources(root: string, sources: Sources) {
	return {
		apply(compiler: Compiler) {
			compiler.hooks.thisCompilation.tap('VoidFixtureSources', (compilation) => {
				compilation.hooks.seal.tap('VoidFixtureSources', () => {
					sources.clear();
					for (const module of compilation.modules) {
						const resource = (module as { resource?: string }).resource;
						if (typeof resource !== 'string' || !resource.startsWith(root + '/')) continue;
						if (resource.includes('/node_modules/')) continue;
						const source = module.originalSource()?.source();
						if (source != null) sources.set(resource.slice(root.length + 1), String(source));
					}
				});
			});
		},
	};
}

interface VoidBuildOptions {
	parallel?: OctaneRspackPluginOptions['parallel'];
	rules?: RuleSetRule[];
	plugins?: NonNullable<Configuration['plugins']>;
	configuration?: Configuration;
}

function voidConfiguration(
	root: string,
	sources: Sources,
	{ parallel = false, rules = [], plugins = [], configuration = {} }: VoidBuildOptions = {},
) {
	const directory = join(root, `dist-${++buildNumber}`);
	const result: Configuration = {
		context: root,
		mode: 'production',
		target: 'web',
		entry: './entry.ts',
		devtool: false,
		// The fixture consumes the authored workspace runtime, whose TypeScript
		// modules use their published JavaScript import spelling.
		resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		module: { rules },
		output: {
			path: directory,
			filename: 'main.js',
			globalObject: 'globalThis',
			library: { name: 'voidFixture', type: 'var' },
		},
		plugins: [
			new OctaneRspackPlugin({ hmr: false, parallel }),
			captureSources(root, sources),
			...plugins,
		],
		...configuration,
	};
	return { directory, configuration: result };
}

async function build(root: string, options: VoidBuildOptions = {}) {
	const sources: Sources = new Map();
	const { directory, configuration } = voidConfiguration(root, sources, options);
	await compile(configuration);
	return { directory, sources };
}

function render(directory: string, entry: 'render' | 'renderValue' = 'render', markers = false) {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		runScripts: 'outside-only',
		url: 'https://fixture.test/',
	});
	try {
		dom.window.eval(readFileSync(join(directory, 'main.js'), 'utf8'));
		const api = (dom.window as unknown as { voidFixture: Record<string, any> }).voidFixture;
		const container = dom.window.document.getElementById('root')!;
		const unmount = api[entry](container);
		// Marker comments vary with how each call is lowered, not with the output.
		const html = markers ? container.innerHTML : container.innerHTML.replace(/<!--.*?-->/g, '');
		unmount();
		return html;
	} finally {
		dom.window.close();
	}
}

// A proven call to Greeting, a hookless void export, also runs through a lite
// edge while only Octane's own pipeline produced Greeting's final code.
function expectSpecialized(sources: Sources, greetingCall = 'componentSlotLite(') {
	// Both roots omit options; only App has the complete void-return proof.
	const entry = sources.get('entry.ts');
	expect(entry).toContain(
		"import { __createVoidRootDefaultOptions as _$createVoidRootDefaultOptions, __createRootDefaultOptions as _$createRootDefaultOptions } from 'octane/internal/client';",
	);
	expect(entry).toMatch(
		/function render\(container\) \{\s+var root = _\$createVoidRootDefaultOptions\(container\);/,
	);
	expect(entry).toMatch(
		/function renderValue\(container\) \{\s+var root = _\$createRootDefaultOptions\(container\);/,
	);
	// Greeting's call drops its (absent) return; Value's keeps reconciliation.
	expect(sources.get('App.tsrx')).toContain(greetingCall);
	expect(sources.get('App.tsrx')).toMatch(/\bcomponentSlot\b/);
}

const SPECIALIZED_CALL = /componentSlot(?:Void|Lite)\(/;

function expectGeneric(sources: Sources) {
	const entry = sources.get('entry.ts');
	expect(entry).toContain(
		"import { __createRootDefaultOptions as _$createRootDefaultOptions } from 'octane/internal/client';",
	);
	expect(entry).toContain('_$createRootDefaultOptions(container)');
	expect(entry).not.toContain('__createVoidRoot');
	expect(sources.get('App.tsrx')).not.toMatch(SPECIALIZED_CALL);
}

/** A post-order loader over the named fixture module, applied after SWC. */
function postLoader(root: string, test: RegExp, body: string): RuleSetRule {
	const loader = write(
		root,
		`post-${++buildNumber}.cjs`,
		`module.exports = function (source) { ${body} };`,
	);
	return { test, enforce: 'post', use: [loader] };
}

const parallelModes = [
	['main thread', false],
	['workers', { maxWorkers: 2 }],
] satisfies Array<[string, OctaneRspackPluginOptions['parallel']]>;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.each(parallelModes)('imported void components on %s', (_name, parallel) => {
	it('specializes proven roots and component calls only', async () => {
		const root = voidFixture();
		const { directory, sources } = await build(root, { parallel });
		expectSpecialized(sources);
		expect(render(directory)).toBe(EXPECTED_HTML);
		expect(render(directory, 'renderValue')).toBe('<b>value</b>');
	}, 60_000);

	it('re-proves a provider a later loader reprinted', async () => {
		const root = voidFixture();
		const rules = [postLoader(root, /Greeting\.tsrx$/, `return '// reprinted\\n' + source;`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(sources.get('Greeting.tsrx')).toMatch(/^\/\/ reprinted/);
		// The void proof re-proves the reprinted export, but a later loader could
		// also have added a hook, so the call keeps its Block.
		expectSpecialized(sources, 'componentSlotVoid(');
		expect(sources.get('App.tsrx')).not.toContain('componentSlotLite(');
		expect(render(directory)).toBe(EXPECTED_HTML);
	}, 60_000);

	it.each([
		['syntax lowering', { jsc: { target: 'es2015' } }, 'componentSlotLite('],
		// Globals substitution can put any call, a hook included, into a body.
		[
			'optimizer globals',
			{ jsc: { transform: { optimizer: { globals: { vars: { __OCTANE_FIXTURE__: 'true' } } } } } },
			'componentSlotVoid(',
		],
	])(
		'lets a later SWC pass with %s keep the provider lite or not',
		async (_kind, options, call) => {
			const root = voidFixture();
			const rules = [{ test: /Greeting\.tsrx$/, use: [{ loader: 'builtin:swc-loader', options }] }];
			const { directory, sources } = await build(root, { parallel, rules });
			expectSpecialized(sources, call);
			expect(render(directory)).toBe(EXPECTED_HTML);
		},
		60_000,
	);

	it('keeps an import generic when a later loader changes the provider export', async () => {
		const root = voidFixture();
		// The provider's final Greeting returns JSX; a void call would drop it.
		const rules = [postLoader(root, /Greeting\.tsrx$/, `return source + '\\nGreeting = Loud;';`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(render(directory)).toBe('<main><p>loud</p><b>value</b></main>');
		expect(sources.get('App.tsrx')).not.toMatch(SPECIALIZED_CALL);
	}, 60_000);

	it('rebuilds a root generically when a later loader changes a provider rebuilt with it', async () => {
		const root = voidFixture();
		// App consumes proofs itself, so its export is proven on the code that
		// runs after its own rebuild. That code now returns Value's JSX.
		const rules = [postLoader(root, /App\.tsrx$/, `return source + '\\nApp = Value;';`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(render(directory)).toBe('<b>value</b>');
		// Invalidating the component proof preserves returned-value handling;
		// the independently proven one-argument factory still omits options.
		const entry = sources.get('entry.ts');
		expect(entry).toContain(
			"import { __createRootDefaultOptions as _$createRootDefaultOptions } from 'octane/internal/client';",
		);
		expect(entry).toMatch(
			/function render\(container\) \{\s+var root = _\$createRootDefaultOptions\(container\);/,
		);
		expect(entry).not.toContain('__createVoidRoot');
		// App's own proven call is unaffected.
		expect(sources.get('App.tsrx')).toContain('componentSlotLite(');
	}, 60_000);

	it('rebuilds an importer generically when a later loader rebinds a proven import', async () => {
		const root = voidFixture();
		// App's final code reads Loud through the local Octane proved as Greeting.
		const rules = [
			postLoader(
				root,
				/App\.tsrx$/,
				`return source.replace(/\\{\\s*Greeting\\s*\\}/, '{ Loud as Greeting }');`,
			),
		];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(render(directory)).toBe('<main><p>loud</p><b>value</b></main>');
		expect(sources.get('App.tsrx')).toContain('Loud as Greeting');
		expect(sources.get('App.tsrx')).not.toMatch(SPECIALIZED_CALL);
		// The unrelated entry root keeps its proof of App.
		expect(sources.get('entry.ts')).toContain('__createVoidRoot');
	}, 60_000);
});

// An equal-prop tick, then a changed label through the cached edges.
const TICK_ENTRY = `/** @jsxImportSource octane */
import { createRoot, flushSync } from 'octane';
import { App } from './App.tsrx';
export function render(container: HTMLElement) {
	const root = createRoot(container);
	for (const props of [{ label: 'a', tick: 0 }, { label: 'a', tick: 1 }, { label: 'b', tick: 2 }]) {
		flushSync(() => root.render(App, props));
	}
	return () => root.unmount();
}`;

// Card renders an imported Leaf, so it publishes its memo proof only after a
// rebuild over Leaf's hint, and App admits a region at Card only a round later.
function memoFixture() {
	const root = createFixture({
		'Leaf.tsrx': `export function Leaf(props) @{ <b>{props.label as string}</b> }`,
		'Card.tsrx': `import { Leaf } from './Leaf.tsrx';
export function Card(props) @{ <span><Leaf label={props.label} /></span> }`,
		'Stateful.tsrx': `import { useState } from 'octane';
export function Stateful(props) @{
	const [count] = useState(0);
	<i>{(props.label + count) as string}</i>
}`,
		'App.tsrx': `import { Card } from './Card.tsrx';
import { Stateful } from './Stateful.tsrx';
export function App(props) @{
	<p data-tick={props.tick}><Card label={props.label} /><Stateful label={props.label} /></p>
}`,
		'entry.ts': TICK_ENTRY,
	});
	roots.push(root);
	return root;
}

const MEMO_HTML = '<p data-tick="2"><span><b>b</b></span><i>b0</i></p>';
const CARD_PROOF =
	/_\$markCompilerMemo\([\s\S]*return \[\s*Leaf,\s*_\$compilerMemoWitness\(Leaf\)\s*\]/;

describe.each(parallelModes)('imported compiler memo hints on %s', (_name, parallel) => {
	it('admits regions only at imports whose modules published a memo proof', async () => {
		const root = memoFixture();
		const { directory, sources } = await build(root, { parallel });
		expect(sources.get('Card.tsrx')).toMatch(CARD_PROOF);
		expect(sources.get('Stateful.tsrx')).not.toContain('markCompilerMemo');
		const app = sources.get('App.tsrx');
		expect(app).toContain('var __memoComponent = _$compilerMemoWitness(Card);');
		expect(app).not.toContain('compilerMemoWitness(Stateful)');
		expect(render(directory)).toBe(MEMO_HTML);
	}, 60_000);
});

// C, B and A form a hookless chain, so each publishes its lite export one
// rebuild round after the module below it. Ping and Pong render each other, so
// neither proof can rest on the other. Counter owns state and Label reads
// natively; neither is a lite export at all.
function liteFixture() {
	const cycle = (name: string, next: string) => `import { ${next} } from './${next}.tsrx';
export function ${name}(props) @{
	<em><span>{'${name}'}</span>@if (props.depth > 0) { <${next} depth={props.depth - 1} /> }</em>
}`;
	const root = createFixture({
		'C.tsrx': `export function C(props) @{ <b>{props.label as string}</b> }`,
		'B.tsrx': `import { C } from './C.tsrx';
export function B(props) @{ <span><C label={props.label} /></span> }`,
		'A.tsrx': `import { B } from './B.tsrx';
export function A(props) @{ <i><B label={props.label} /></i> }`,
		'Ping.tsrx': cycle('Ping', 'Pong'),
		'Pong.tsrx': cycle('Pong', 'Ping'),
		'Counter.tsrx': `import { useState } from 'octane';
export function Counter(props) @{
	const [count] = useState(0);
	<s>{(props.label + count) as string}</s>
}`,
		'Label.tsrx': `import 'octane/signals';
export function Label(props) @{ <u>{props.label as string}</u> }`,
		'App.tsrx': `import { A } from './A.tsrx';
import { Counter } from './Counter.tsrx';
import { Label } from './Label.tsrx';
import { Ping } from './Ping.tsrx';
export function App(props) @{
	<p data-tick={props.tick}>
		<A label={props.label} />
		<Ping depth={2} />
		<Counter label={props.label} />
		<Label label={props.label} />
	</p>
}`,
		'entry.ts': TICK_ENTRY,
	});
	roots.push(root);
	return root;
}

/** A call to `component` through the named slot helper. */
function call(helper: string, component: string) {
	return new RegExp(`\\b${helper}\\([^;]*, ${component},`);
}

describe.each(parallelModes)('imported lite components on %s', (_name, parallel) => {
	it('runs a hookless chain through lite edges and keeps other imports on Blocks', async () => {
		const root = liteFixture();
		const { directory, sources } = await build(root, { parallel });
		expect(sources.get('B.tsrx')).toMatch(call('componentSlotLite', 'C'));
		expect(sources.get('A.tsrx')).toMatch(call('componentSlotLite', 'B'));
		expect(sources.get('App.tsrx')).toMatch(call('componentSlotLite', 'A'));
		for (const [importer, component] of [
			['App', 'Ping'],
			['Ping', 'Pong'],
			['Pong', 'Ping'],
			['App', 'Counter'],
			['App', 'Label'],
		]) {
			const code = sources.get(`${importer}.tsrx`);
			expect(code).toMatch(call('componentSlotVoid', component));
			expect(code).not.toMatch(call('componentSlotLite', component));
		}
		expect(render(directory)).toBe(
			'<p data-tick="2"><i><span><b>b</b></span></i>' +
				'<em><span>Ping</span><em><span>Pong</span><em><span>Ping</span></em></em></em>' +
				'<s>b0</s><u>b</u></p>',
		);
	}, 60_000);

	it('drops the anchor of a lite call only when its module proves the root holds position', async () => {
		const root = createFixture({
			'Leaf.tsrx': `export function Leaf(props) @{ <b>{props.label as string}</b> }`,
			'Maybe.tsrx': `export function Maybe(props) @{ @if (props.tick > 0) { <q>{'on'}</q> } }`,
			'App.tsrx': `import { Leaf } from './Leaf.tsrx';
import { Maybe } from './Maybe.tsrx';
export function App(props) @{
	<main>
		<p><Leaf label={props.label} /><Leaf label="tail" /></p>
		<div><Maybe tick={props.tick} /><Leaf label="tail" /></div>
	</main>
}`,
			'entry.ts': TICK_ENTRY,
		});
		roots.push(root);
		const { directory, sources } = await build(root, { parallel });
		expect(sources.get('App.tsrx')).toMatch(call('componentSlotLite', 'Maybe'));
		const html = render(directory, 'render', true);
		const anchored = (selector: string) =>
			[...JSDOM.fragment(html).querySelector(selector)!.childNodes].some(
				(node) => node.nodeType === 8,
			);
		// Maybe mounts empty, so its later content needs its anchor to land first.
		expect(html.replace(/<!--.*?-->/g, '')).toBe(
			'<main><p><b>b</b><b>tail</b></p><div><q>on</q><b>tail</b></div></main>',
		);
		expect([anchored('p'), anchored('div')]).toEqual([false, true]);
	}, 60_000);

	it('rebuilds an importer generically when a lite export it consumed loses its proof', async () => {
		const root = createFixture({
			'Leaf.tsrx': `export function Leaf() @{ <b>{'leaf'}</b> }`,
			'Shell.tsrx': `import { Leaf } from './Leaf.tsrx';
export function Shell() @{ <s><Leaf /></s> }
export function Loud() { return <q>loud</q>; }`,
			'Mid.tsrx': `import { Leaf } from './Leaf.tsrx';
import { Shell } from './Shell.tsrx';
export function Mid() @{ <i><Leaf /></i> }
export function Box() @{ <u><Shell /></u> }`,
			'App.tsrx': `import { Mid } from './Mid.tsrx';
export function App() @{ <p><Mid /></p> }`,
			'entry.ts': TICK_ENTRY,
		});
		roots.push(root);
		// Mid proves Mid lite over Leaf, and App consumes that a round later. Shell
		// is proven only after its own rebuild, where it no longer holds, so Mid is
		// rebuilt without proofs and withdraws the lite export App consumed.
		const rules = [postLoader(root, /Shell\.tsrx$/, `return source + '\\nShell = Loud;';`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(sources.get('Mid.tsrx')).not.toMatch(SPECIALIZED_CALL);
		expect(sources.get('App.tsrx')).not.toMatch(SPECIALIZED_CALL);
		expect(render(directory)).toBe('<p><i><b>leaf</b></i></p>');
	}, 60_000);
});

describe('void component proof lifetime', () => {
	it.each([
		['provider', 'Greeting.tsrx'],
		['importer', 'App.tsrx'],
	])(
		'fails closed when a %s changes after specialization',
		async (_kind, file) => {
			const root = voidFixture();
			const flag = `__octaneVoidFixtureMutate${++buildNumber}`;
			const rules = [
				postLoader(
					root,
					new RegExp(`${file.replace('.', '\\.')}$`),
					`return globalThis[${JSON.stringify(flag)}] ? source + '\\n// mutated' : source;`,
				),
			];
			const mutate = {
				apply(compiler: Compiler) {
					compiler.hooks.thisCompilation.tap('VoidFixtureMutation', (compilation) => {
						compilation.hooks.finishModules.tapPromise('VoidFixtureMutation', async (modules) => {
							const module = [...modules].find(
								(candidate) => (candidate as { resource?: string }).resource === join(root, file),
							);
							(globalThis as Record<string, unknown>)[flag] = true;
							await new Promise<void>((resolve, reject) =>
								compilation.rebuildModule(module!, (error) => (error ? reject(error) : resolve())),
							);
						});
					});
				},
			};
			try {
				await expect(build(root, { rules, plugins: [mutate] })).rejects.toThrow(
					/void component proof changed/,
				);
			} finally {
				delete (globalThis as Record<string, unknown>)[flag];
			}
		},
		60_000,
	);

	it('keeps a production watch build generic', async () => {
		const root = voidFixture();
		const sources: Sources = new Map();
		const { directory, configuration } = voidConfiguration(root, sources);
		await watchOnce(configuration);
		expectGeneric(sources);
		expect(render(directory)).toBe(EXPECTED_HTML);
		expect(render(directory, 'renderValue')).toBe('<b>value</b>');
	}, 60_000);

	it('publishes no memo proof over an unhinted import in a production watch build', async () => {
		const root = memoFixture();
		const sources: Sources = new Map();
		const { directory, configuration } = voidConfiguration(root, sources);
		await watchOnce(configuration);
		expect(sources.get('Leaf.tsrx')).toContain('markCompilerMemo');
		expect(sources.get('Card.tsrx')).not.toContain('markCompilerMemo');
		expect(sources.get('App.tsrx')).not.toContain('compilerMemoWitness');
		expect(render(directory)).toBe(MEMO_HTML);
	}, 60_000);

	it('specializes again after a production watch shares its persistent cache', async () => {
		const root = voidFixture();
		const cache: Configuration['cache'] = {
			type: 'persistent',
			version: 'void-cache-fixture-v1',
			snapshot: {
				immutablePaths: ['Greeting.tsrx', 'Value.tsrx', 'App.tsrx', 'entry.ts', 'package.json'].map(
					(file) => join(root, file),
				),
			},
			storage: { type: 'filesystem', directory: join(root, '.rspack-cache') },
		};
		const built: string[][] = [];
		const observe = {
			apply(compiler: Compiler) {
				compiler.hooks.finishMake.tap(
					{ name: 'VoidCacheFixture', stage: Number.MIN_SAFE_INTEGER },
					(compilation) => {
						built.push(
							[...compilation.builtModules]
								.map((module) => (module as { resource?: string }).resource)
								.filter((resource): resource is string => resource?.startsWith(root + '/') === true)
								.map((resource) => resource.slice(root.length + 1))
								.sort(),
						);
					},
				);
			},
		};
		const options = { plugins: [observe], configuration: { name: 'void-cache-fixture', cache } };
		const run = async () => {
			const sources: Sources = new Map();
			const { directory, configuration } = voidConfiguration(root, sources, options);
			await compile(configuration);
			return { directory, sources };
		};

		const first = await run();
		expectSpecialized(first.sources);
		expect(render(first.directory)).toBe(EXPECTED_HTML);

		const watchSources: Sources = new Map();
		const watched = voidConfiguration(root, watchSources, options);
		await watchOnce(watched.configuration);
		expectGeneric(watchSources);
		expect(render(watched.directory)).toBe(EXPECTED_HTML);
		expect(render(watched.directory, 'renderValue')).toBe('<b>value</b>');

		const third = await run();
		expectSpecialized(third.sources);
		expect(render(third.directory)).toBe(EXPECTED_HTML);
		// The providers' cached builds carried their facts into the last proof:
		// a fresh compile of them would conceal lost cache metadata.
		expect(built.at(-1)).not.toContain('Greeting.tsrx');
		expect(built.at(-1)).not.toContain('Value.tsrx');
	}, 90_000);
});

/** Close the real watcher and compiler so its persistent cache is flushed. */
async function watchOnce(configuration: Configuration) {
	const compiler = rspack(configuration);
	return new Promise<void>((resolve, reject) => {
		let finishing = false;
		compiler.watch({ aggregateTimeout: 0 }, (error, stats) => {
			if (finishing) return;
			finishing = true;
			let failure: unknown = error;
			if (!failure) {
				try {
					if (!stats) throw new Error('Rspack watch completed without stats.');
					snapshotBuild(stats);
				} catch (error) {
					failure = error;
				}
			}
			const closeCompiler = (watchError?: Error | null) => {
				compiler.close((closeError) => {
					if (failure || watchError || closeError) {
						return reject(failure ?? watchError ?? closeError);
					}
					resolve();
				});
			};
			if (compiler.watching) compiler.watching.close(closeCompiler);
			else closeCompiler();
		});
	});
}
