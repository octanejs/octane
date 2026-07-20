import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { mergeRsbuildConfig } from '@rsbuild/core';
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

import {
	LYNX_BACKGROUND_LAYER,
	LYNX_BACKGROUND_RUNTIME,
	LYNX_MAIN_THREAD_LAYER,
	LYNX_MAIN_THREAD_RUNTIME,
	pluginOctane,
} from '../src/index.js';

const temporaryRoots: string[] = [];
const testRequire = createRequire(import.meta.url);

type BundlerChainCallback = (chain: unknown, context: unknown) => void;
type EnvironmentConfigCallback = (
	config: Record<string, unknown>,
	context: { name: string; mergeEnvironmentConfig: typeof mergeRsbuildConfig },
) => Record<string, unknown> | undefined;

function bundlerChainCallback(
	value: BundlerChainCallback | { handler: BundlerChainCallback },
): BundlerChainCallback {
	return typeof value === 'function' ? value : value.handler;
}

function packageDirectory(root: string, name: string): string {
	return join(root, 'node_modules', ...name.split('/'));
}

function writePackage(root: string, name: string, version: string): string {
	const directory = packageDirectory(root, name);
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, 'package.json'),
		JSON.stringify({ name, version, type: 'module' }),
		'utf8',
	);
	return directory;
}

function createToolchainRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'octane-rspeedy-plugin-'));
	temporaryRoots.push(root);
	writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }), 'utf8');
	writePackage(root, '@lynx-js/rspeedy', '0.16.0');
	writePackage(root, '@rsbuild/core', '2.1.4');
	writePackage(root, '@rspack/core', '2.1.3');
	const devTransport = dirname(
		dirname(dirname(testRequire.resolve('@lynx-js/webpack-dev-transport/client'))),
	);
	const devTransportLink = packageDirectory(root, '@lynx-js/webpack-dev-transport');
	mkdirSync(dirname(devTransportLink), { recursive: true });
	symlinkSync(devTransport, devTransportLink, 'dir');
	return root;
}

function createChain(
	initial: Record<string, unknown[]> = {
		app: ['./src/setup.js', { filename: 'background.js', import: ['./src/App.lynx.tsrx'] }],
	},
) {
	const entries = new Map<string, unknown[]>(Object.entries(initial));
	const plugins = new Map<string, { implementation: unknown; options: unknown[] }>();
	const extensionAliases = new Map<string, string[]>();
	return {
		entries,
		extensionAliases,
		plugins,
		chain: {
			resolve: {
				extensionAlias: {
					has(extension: string) {
						return extensionAliases.has(extension);
					},
					get(extension: string) {
						return extensionAliases.get(extension);
					},
					set(extension: string, aliases: string[]) {
						extensionAliases.set(extension, aliases);
					},
				},
			},
			entryPoints: {
				entries() {
					return Object.fromEntries(
						[...entries].map(([name, values]) => [name, { values: () => values }]),
					);
				},
				clear() {
					entries.clear();
				},
			},
			entry(name: string) {
				return {
					add(value: unknown) {
						const values = entries.get(name) ?? [];
						values.push(value);
						entries.set(name, values);
					},
					prepend(value: unknown) {
						const values = entries.get(name) ?? [];
						values.unshift(value);
						entries.set(name, values);
					},
				};
			},
			plugin(name: string) {
				return {
					use(implementation: unknown, options: unknown[]) {
						plugins.set(name, { implementation, options });
					},
				};
			},
		},
	};
}

function compilerOptions(state: ReturnType<typeof createChain>) {
	return state.plugins.get('@octanejs/rspeedy-plugin:compiler')?.options[0] as {
		universalRuntime: unknown;
		renderers: {
			default: string;
			registry: {
				lynx: {
					validation: {
						forbiddenGlobals: readonly string[];
						forbiddenImports: readonly string[];
					};
				};
			};
		};
	};
}

function applyPlugin(
	options: Parameters<typeof pluginOctane>[0],
	environment = 'lynx',
	context: Record<string, unknown> = {},
	entries?: Record<string, unknown[]>,
) {
	const root = createToolchainRoot();
	const callbacks: BundlerChainCallback[] = [];
	const plugin = pluginOctane(options);
	plugin.setup({
		context: { rootPath: root },
		modifyBundlerChain(callback: BundlerChainCallback | { handler: BundlerChainCallback }) {
			callbacks.push(bundlerChainCallback(callback));
		},
	} as never);
	const state = createChain(entries);
	for (const callback of callbacks) {
		callback(state.chain, {
			...context,
			environment: {
				config: {},
				...((context.environment as Record<string, unknown> | undefined) ?? {}),
				name: environment,
			},
		});
	}
	return { ...state, root };
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('@octanejs/rspeedy-plugin', () => {
	it('enforces application output invariants without discarding user configuration', () => {
		const root = createToolchainRoot();
		const callbacks: EnvironmentConfigCallback[] = [];
		pluginOctane().setup({
			context: { rootPath: root },
			modifyEnvironmentConfig(callback: EnvironmentConfigCallback) {
				callbacks.push(callback);
			},
			modifyBundlerChain() {},
		} as never);
		const userConfig = {
			output: { distPath: { root: 'dist/native' }, injectStyles: true },
			splitChunks: { chunks: 'all', minSize: 4096 },
			tools: {
				rspack: {
					experiments: { css: true },
					output: { iife: true, uniqueName: 'consumer-app' },
				},
			},
		};
		const config = callbacks.reduce<Record<string, unknown>>(
			(current, callback) =>
				callback(current, { mergeEnvironmentConfig: mergeRsbuildConfig, name: 'lynx' }) ?? current,
			userConfig,
		);

		expect(config).toMatchObject({
			output: { distPath: { root: 'dist/native' }, injectStyles: false },
			splitChunks: { chunks: 'all', minSize: 4096 },
			tools: {
				rspack: {
					experiments: { css: true },
					output: { iife: false, uniqueName: 'consumer-app' },
				},
			},
		});
	});

	it('installs one background compiler graph and preserves entry metadata', () => {
		const state = applyPlugin({ thread: 'background' });

		expect(state.entries.get('app')).toEqual([
			{ import: ['./src/setup.js'], layer: LYNX_BACKGROUND_LAYER },
			{
				filename: 'background.js',
				import: ['./src/App.lynx.tsrx'],
				layer: LYNX_BACKGROUND_LAYER,
			},
		]);
		const installed = state.plugins.get('@octanejs/rspeedy-plugin:compiler');
		expect(installed?.options).toEqual([
			expect.objectContaining({
				environment: 'client',
				runtime: '@octanejs/lynx/renderer',
				universalRuntime: LYNX_BACKGROUND_RUNTIME,
				renderers: expect.objectContaining({ default: 'lynx' }),
			}),
		]);
		expect(
			compilerOptions(state).renderers.registry.lynx.validation.forbiddenGlobals,
		).not.toContain('NativeModules');
		expect(
			compilerOptions(state).renderers.registry.lynx.validation.forbiddenImports,
		).not.toContain('@octanejs/lynx/platform');
		expect(state.extensionAliases.get('.js')).toEqual(['.ts', '.js']);
	});

	it('keeps main-thread compile metadata and cache identity distinct', () => {
		const state = applyPlugin({ thread: 'main-thread' });

		expect(state.entries.get('app')).toEqual([
			{ import: ['./src/setup.js'], layer: LYNX_MAIN_THREAD_LAYER },
			{
				filename: 'background.js',
				import: ['./src/App.lynx.tsrx'],
				layer: LYNX_MAIN_THREAD_LAYER,
			},
		]);
		const compiler = compilerOptions(state);
		expect(compiler.universalRuntime).toBe(LYNX_MAIN_THREAD_RUNTIME);
		expect(compiler.renderers.registry.lynx.validation.forbiddenGlobals).toContain('NativeModules');
		expect(compiler.renderers.registry.lynx.validation.forbiddenImports).toContain(
			'@octanejs/lynx/platform',
		);
	});

	it('wires development transport around the generated receiver without React refresh', () => {
		const state = applyPlugin(
			undefined,
			'lynx',
			{
				environment: { config: { dev: { hmr: true, liveReload: true } } },
				isDev: true,
				isProd: false,
			},
			{ app: ['./src/setup.js', './src/App.lynx.tsrx'] },
		);

		expect(state.entries.get('app')).toEqual([
			{ import: ['@lynx-js/webpack-dev-transport/client'], layer: LYNX_BACKGROUND_LAYER },
			{ import: ['@rspack/core/hot/dev-server'], layer: LYNX_BACKGROUND_LAYER },
			{
				filename: '.rspeedy/app/background.js',
				import: ['./src/setup.js', './src/App.lynx.tsrx'],
				layer: LYNX_BACKGROUND_LAYER,
			},
		]);
		const receiver = state.entries.get('app__octane_main_thread');
		expect(receiver).toHaveLength(2);
		expect(receiver?.[0]).toEqual(
			expect.objectContaining({
				import: [expect.stringMatching(/hotModuleReplacement\.lepus\.cjs$/)],
				layer: LYNX_MAIN_THREAD_LAYER,
			}),
		);
		expect(receiver?.[1]).toEqual(
			expect.objectContaining({
				filename: '.rspeedy/app/main-thread.js',
				import: [expect.stringMatching(/main-thread-entry\.js$/)],
				layer: LYNX_MAIN_THREAD_LAYER,
			}),
		);
		const appRequire = createRequire(join(state.root, 'package.json'));
		expect(realpathSync(appRequire.resolve('@lynx-js/webpack-dev-transport/client'))).toBe(
			realpathSync(testRequire.resolve('@lynx-js/webpack-dev-transport/client')),
		);
		expect(JSON.stringify([...state.entries.values()])).not.toMatch(
			/@lynx-js\/react|react-refresh/i,
		);
	});

	it('preserves public entry loading metadata on the background graph', () => {
		const library = { type: 'commonjs2' };
		const state = applyPlugin(
			undefined,
			'lynx',
			{},
			{
				app: [
					{
						asyncChunks: false,
						baseUri: 'lynx://octane/',
						chunkLoading: false,
						import: ['./src/App.tsrx'],
						layer: LYNX_BACKGROUND_LAYER,
						library,
						publicPath: '/assets/',
						runtime: false,
						wasmLoading: false,
					},
				],
			},
		);

		expect(state.entries.get('app')).toEqual([
			{
				asyncChunks: false,
				baseUri: 'lynx://octane/',
				chunkLoading: false,
				filename: '.rspeedy/app/background.js',
				import: ['./src/App.tsrx'],
				layer: LYNX_BACKGROUND_LAYER,
				library,
				publicPath: '/assets/',
				runtime: false,
				wasmLoading: false,
			},
		]);
	});

	it('rejects conflicting entry loading metadata instead of discarding it', () => {
		expect(() =>
			applyPlugin(
				undefined,
				'lynx',
				{},
				{
					app: [
						{ import: ['./src/one.ts'], publicPath: '/one/' },
						{ import: ['./src/two.ts'], publicPath: '/two/' },
					],
				},
			),
		).toThrow(/entry "app".*conflicting "publicPath" options/);
	});

	it('rejects dependOn because every native bundle must be self-contained', () => {
		expect(() =>
			applyPlugin(
				undefined,
				'lynx',
				{},
				{
					app: [{ dependOn: 'shared', import: ['./src/App.tsrx'] }],
					shared: ['./src/shared.ts'],
				},
			),
		).toThrow(/cannot use dependOn.*complete background graph/);
	});

	it('diagnoses entry filenames and layers owned by application mode', () => {
		expect(() =>
			applyPlugin(
				undefined,
				'lynx',
				{},
				{
					app: [{ filename: 'custom.js', import: ['./src/App.tsrx'] }],
				},
			),
		).toThrow(/cannot set filename.*output\.filename\.js/);
		expect(() =>
			applyPlugin(
				undefined,
				'lynx',
				{},
				{
					app: [{ import: ['./src/App.tsrx'], layer: 'custom-layer' }],
				},
			),
		).toThrow(/cannot use layer "custom-layer".*octane:background/);
	});

	it('follows structured filename-hash enablement for generated background assets', () => {
		const entries = { app: ['./src/App.tsrx'] };
		const production = applyPlugin(
			undefined,
			'lynx',
			{
				environment: { config: { output: { filenameHash: { enable: false } } } },
				isDev: false,
				isProd: true,
			},
			entries,
		);
		const development = applyPlugin(
			undefined,
			'lynx',
			{
				environment: {
					config: { output: { filenameHash: { enable: 'always', format: 'fullhash:6' } } },
				},
				isDev: true,
				isProd: false,
			},
			entries,
		);

		expect(production.entries.get('app')?.at(-1)).toEqual(
			expect.objectContaining({ filename: '.rspeedy/app/background.js' }),
		);
		expect(development.entries.get('app')?.at(-1)).toEqual(
			expect.objectContaining({ filename: '.rspeedy/app/background.[fullhash:6].js' }),
		);
	});

	it('preserves JavaScript filename policies for the background layout', () => {
		const functional = applyPlugin(
			undefined,
			'lynx',
			{
				environment: {
					config: {
						output: {
							filename: {
								js: (pathData: { hashed?: boolean }) =>
									pathData.hashed ? 'assets/custom.[fullhash:7].js' : 'assets/custom.js',
							},
						},
					},
				},
				isDev: false,
				isProd: true,
			},
			{ app: ['./src/App.tsrx'] },
		);
		const string = applyPlugin(
			undefined,
			'lynx',
			{
				environment: {
					config: { output: { filename: { js: 'assets/[name].[contenthash:6].js' } } },
				},
				isDev: false,
				isProd: true,
			},
			{ app: ['./src/App.tsrx'] },
		);
		const explicitNoHash = applyPlugin(
			undefined,
			'lynx',
			{
				environment: {
					config: { output: { filename: { js: '[name].js' }, filenameHash: true } },
				},
				isDev: false,
				isProd: true,
			},
			{ app: ['./src/App.tsrx'] },
		);
		const filename = (
			functional.entries.get('app')?.at(-1) as {
				filename: (pathData: unknown, assetInfo: unknown) => string;
			}
		).filename;

		expect(filename({}, {})).toBe('.rspeedy/assets/custom/background.js');
		expect(filename({ hashed: true }, {})).toBe(
			'.rspeedy/assets/custom/background.[fullhash:7].js',
		);
		expect(string.entries.get('app')?.at(-1)).toEqual(
			expect.objectContaining({
				filename: '.rspeedy/assets/app/background.[contenthash:6].js',
			}),
		);
		expect(explicitNoHash.entries.get('app')?.at(-1)).toEqual(
			expect.objectContaining({ filename: '.rspeedy/app/background.js' }),
		);
	});

	it('rejects an authored entry that collides with its generated receiver', () => {
		expect(() =>
			applyPlugin(
				undefined,
				'lynx',
				{},
				{
					app: ['./src/App.tsrx'],
					app__octane_main_thread: ['./src/collision.ts'],
				},
			),
		).toThrow(/app__octane_main_thread.*collides.*generated main-thread receiver/);
	});

	it('diagnoses background-only APIs at main-thread authored locations', () => {
		const background = compilerOptions(applyPlugin({ thread: 'background' }));
		const mainThread = compilerOptions(applyPlugin({ thread: 'main-thread' }));
		const renderer = (compiler: ReturnType<typeof compilerOptions>) =>
			({ id: 'lynx', ...compiler.renderers.registry.lynx }) as never;

		const backgroundSource = `import { lynxPlatformAvailability } from '@octanejs/lynx/platform';
export const nativeModule = NativeModules.Settings;
export function App() @{ <view data-platform={lynxPlatformAvailability.available} /> }
`;
		expect(() =>
			compile(backgroundSource, '/src/Background.lynx.tsrx', {
				hmr: false,
				renderer: renderer(background),
			}),
		).not.toThrow();

		const nativeModulesSource = `export const nativeModule = NativeModules.Settings;
export function App() @{ <view /> }
`;
		expect(() =>
			compile(nativeModulesSource, '/src/MainNative.lynx.tsrx', {
				hmr: false,
				renderer: renderer(mainThread),
			}),
		).toThrow(/renderer "lynx" forbids unbound global "NativeModules".*MainNative\.lynx\.tsrx:1:/);

		const platformSource = `import { lynxPlatformAvailability } from '@octanejs/lynx/platform';
export function App() @{ <view data-platform={lynxPlatformAvailability.available} /> }
`;
		expect(() =>
			compile(platformSource, '/src/MainPlatform.lynx.tsrx', {
				hmr: false,
				renderer: renderer(mainThread),
			}),
		).toThrow(
			/renderer "lynx" forbids static import "@octanejs\/lynx\/platform".*MainPlatform\.lynx\.tsrx:1:/,
		);

		const shadowedSource = `export function readModule(NativeModules) {
  return NativeModules.Settings;
}
export function App() @{ <view /> }
`;
		expect(() =>
			compile(shadowedSource, '/src/ShadowedNative.lynx.tsrx', {
				hmr: false,
				renderer: renderer(mainThread),
			}),
		).not.toThrow();
	});

	it('preserves existing JavaScript extension aliases while adding TypeScript source', () => {
		const root = createToolchainRoot();
		const callbacks: BundlerChainCallback[] = [];
		pluginOctane({ thread: 'background' }).setup({
			context: { rootPath: root },
			modifyBundlerChain(callback: BundlerChainCallback | { handler: BundlerChainCallback }) {
				callbacks.push(bundlerChainCallback(callback));
			},
		} as never);
		const state = createChain();
		state.extensionAliases.set('.js', ['.mjs', '.js']);
		for (const callback of callbacks) {
			callback(state.chain, { environment: { name: 'lynx' } });
		}

		expect(state.extensionAliases.get('.js')).toEqual(['.ts', '.mjs', '.js']);
	});

	it('can target named Rspeedy environments without mutating other graphs', () => {
		const state = applyPlugin({ environments: ['lynx'] }, 'web');

		expect(state.entries.get('app')).toEqual([
			'./src/setup.js',
			{ filename: 'background.js', import: ['./src/App.lynx.tsrx'] },
		]);
		expect(state.plugins.size).toBe(0);
	});

	it('rejects unknown options and thread names at configuration time', () => {
		expect(() => pluginOctane({ thread: 'worker' as never })).toThrow(/thread.*background/);
		expect(() => pluginOctane({ synthetic: true } as never)).toThrow(/unknown option/);
	});
});
