import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	LYNX_BACKGROUND_LAYER,
	LYNX_BACKGROUND_RUNTIME,
	LYNX_MAIN_THREAD_LAYER,
	LYNX_MAIN_THREAD_RUNTIME,
	pluginOctane,
} from '../src/index.js';

const temporaryRoots: string[] = [];

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
	return root;
}

function createChain() {
	const initial = {
		app: ['./src/setup.js', { filename: 'background.js', import: ['./src/App.lynx.tsrx'] }],
	};
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

function applyPlugin(options: Parameters<typeof pluginOctane>[0], environment = 'lynx') {
	const root = createToolchainRoot();
	const callbacks: Array<(chain: unknown, context: unknown) => void> = [];
	const plugin = pluginOctane(options);
	plugin.setup({
		context: { rootPath: root },
		modifyBundlerChain(callback: (chain: unknown, context: unknown) => void) {
			callbacks.push(callback);
		},
	} as never);
	const state = createChain();
	for (const callback of callbacks) {
		callback(state.chain, { environment: { name: environment } });
	}
	return state;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('@octanejs/rspeedy-plugin', () => {
	it('installs one background compiler graph and preserves entry metadata', () => {
		const state = applyPlugin(undefined);

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
		expect(
			(
				state.plugins.get('@octanejs/rspeedy-plugin:compiler')?.options[0] as {
					universalRuntime: unknown;
				}
			).universalRuntime,
		).toBe(LYNX_MAIN_THREAD_RUNTIME);
	});

	it('preserves existing JavaScript extension aliases while adding TypeScript source', () => {
		const root = createToolchainRoot();
		const callbacks: Array<(chain: unknown, context: unknown) => void> = [];
		pluginOctane().setup({
			context: { rootPath: root },
			modifyBundlerChain(callback: (chain: unknown, context: unknown) => void) {
				callbacks.push(callback);
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
