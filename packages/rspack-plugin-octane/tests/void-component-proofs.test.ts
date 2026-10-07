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

function render(directory: string, entry: 'render' | 'renderValue' = 'render') {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		runScripts: 'outside-only',
		url: 'https://fixture.test/',
	});
	try {
		dom.window.eval(readFileSync(join(directory, 'main.js'), 'utf8'));
		const api = (dom.window as unknown as { voidFixture: Record<string, any> }).voidFixture;
		const container = dom.window.document.getElementById('root')!;
		const unmount = api[entry](container);
		const html = container.innerHTML;
		unmount();
		return html;
	} finally {
		dom.window.close();
	}
}

function expectSpecialized(sources: Sources) {
	// The App root is proven; the Value root returns JSX and stays generic.
	expect(sources.get('entry.ts')).toContain('__createVoidRoot');
	expect(sources.get('entry.ts')).toMatch(/\bcreateRoot\b/);
	// Greeting's call drops its (absent) return; Value's keeps reconciliation.
	expect(sources.get('App.tsrx')).toContain('componentSlotVoid');
	expect(sources.get('App.tsrx')).toMatch(/\bcomponentSlot\b/);
}

function expectGeneric(sources: Sources) {
	expect(sources.get('entry.ts')).not.toContain('__createVoidRoot');
	expect(sources.get('App.tsrx')).not.toContain('componentSlotVoid');
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
		expectSpecialized(sources);
		expect(render(directory)).toBe(EXPECTED_HTML);
	}, 60_000);

	it('keeps an import generic when a later loader changes the provider export', async () => {
		const root = voidFixture();
		// The provider's final Greeting returns JSX; a void call would drop it.
		const rules = [postLoader(root, /Greeting\.tsrx$/, `return source + '\\nGreeting = Loud;';`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(render(directory)).toBe('<main><p>loud</p><b>value</b></main>');
		expect(sources.get('App.tsrx')).not.toContain('componentSlotVoid');
	}, 60_000);

	it('rebuilds a root generically when a later loader changes a provider rebuilt with it', async () => {
		const root = voidFixture();
		// App consumes proofs itself, so its export is proven on the code that
		// runs after its own rebuild. That code now returns Value's JSX.
		const rules = [postLoader(root, /App\.tsrx$/, `return source + '\\nApp = Value;';`)];
		const { directory, sources } = await build(root, { parallel, rules });
		expect(render(directory)).toBe('<b>value</b>');
		expect(sources.get('entry.ts')).not.toContain('__createVoidRoot');
		// App's own proven call is unaffected.
		expect(sources.get('App.tsrx')).toContain('componentSlotVoid');
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
		expect(sources.get('App.tsrx')).not.toContain('componentSlotVoid');
		// The unrelated entry root keeps its proof of App.
		expect(sources.get('entry.ts')).toContain('__createVoidRoot');
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
