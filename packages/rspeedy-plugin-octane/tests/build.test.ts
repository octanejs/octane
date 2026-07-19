import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createRspeedy } from '@lynx-js/rspeedy';
import { getOctaneRspackBuildInfo } from '@octanejs/rspack-plugin';
import { describe, expect, it } from 'vitest';

import { pluginOctane } from '../src/index.js';

const FIXTURE = resolve(import.meta.dirname, '_fixtures/background');
const FORBIDDEN_MODULE =
	/(?:^|[\\/])(?:runtime(?:\.server)?|universal-dom-boundary|dom-tables)\.[cm]?[jt]sx?$|(?:^|[\\/])hydration(?:[\\/]|\.[cm]?[jt]sx?$)|(?:^|[\\/])(?:react|react-dom|preact)(?:[\\/]|$)|@lynx-js[\\/]react/i;

const BUILD_CASES = [
	{
		entry: './src/background.ts',
		expectedModules: [
			'/packages/rspeedy-plugin-octane/tests/_fixtures/background/src/background.ts',
			'/packages/rspeedy-plugin-octane/tests/_fixtures/background/src/App.tsrx',
			'/packages/lynx/src/root.ts',
			'/packages/lynx/src/core/client-driver.ts',
			'/packages/lynx/src/core/protocol.ts',
			'/packages/lynx/src/core/transport.ts',
			'/packages/octane/src/universal-native.ts',
			'/packages/octane/src/universal-core.ts',
		],
		forbiddenModules: [
			'/packages/lynx/src/main-thread.ts',
			'/packages/lynx/src/core/host-driver.ts',
			'/packages/lynx/src/core/papi.ts',
		],
		thread: 'background',
	},
	{
		entry: './src/main-thread.ts',
		expectedModules: [
			'/packages/rspeedy-plugin-octane/tests/_fixtures/background/src/main-thread.ts',
			'/packages/lynx/src/main-thread.ts',
			'/packages/lynx/src/core/host-driver.ts',
			'/packages/lynx/src/core/papi.ts',
			'/packages/lynx/src/core/protocol.ts',
		],
		forbiddenModules: [
			'/packages/lynx/src/root.ts',
			'/packages/lynx/src/core/client-driver.ts',
			'/packages/lynx/src/core/transport.ts',
			'/packages/octane/src/universal-native.ts',
			'/packages/octane/src/universal-core.ts',
		],
		thread: 'main-thread',
	},
] as const;

function readJavaScript(directory: string): string {
	let output = '';
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filename = join(directory, entry.name);
		if (entry.isDirectory()) output += readJavaScript(filename);
		else if (/\.(?:c|m)?js$/.test(entry.name)) output += readFileSync(filename, 'utf8');
	}
	return output;
}

class MetadataProbePlugin {
	constructor(
		private readonly observed: unknown[],
		private readonly moduleIdentifiers: string[],
	) {}

	apply(compiler: any): void {
		compiler.hooks.compilation.tap(this.constructor.name, (compilation: any) => {
			compilation.hooks.finishModules.tap(this.constructor.name, (modules: Iterable<unknown>) => {
				for (const module of modules) {
					const record = module as {
						identifier?: () => string;
						nameForCondition?: () => string | null;
					};
					for (const identifier of [record.identifier?.(), record.nameForCondition?.()]) {
						if (typeof identifier === 'string') this.moduleIdentifiers.push(identifier);
					}
					const metadata = getOctaneRspackBuildInfo(module);
					if (metadata !== null) this.observed.push(metadata);
				}
			});
		});
	}
}

function metadataProbe(observed: unknown[], moduleIdentifiers: string[]) {
	return {
		name: 'octane:lynx-runtime-graph-probe',
		setup(api: any) {
			api.modifyBundlerChain((chain: any) => {
				chain
					.plugin('octane:lynx-runtime-graph-probe')
					.use(MetadataProbePlugin, [observed, moduleIdentifiers]);
			});
		},
	};
}

describe('@octanejs/rspeedy-plugin native production entries', () => {
	it.each(BUILD_CASES)(
		'bundles the $thread entry as its isolated DOM-free graph',
		async ({ entry, expectedModules, forbiddenModules, thread }) => {
			const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-build-'));
			const outputRoot = join(temporaryRoot, 'dist');
			const observed: unknown[] = [];
			const moduleIdentifiers: string[] = [];
			const rspeedy = await createRspeedy({
				cwd: FIXTURE,
				loadEnv: false,
				environment: ['lynx'],
				rspeedyConfig: {
					mode: 'production',
					environments: { lynx: {} },
					dev: { hmr: false, liveReload: false },
					output: {
						cleanDistPath: true,
						distPath: { root: outputRoot },
						filenameHash: false,
						sourceMap: false,
					},
					source: { entry: { main: entry } },
					splitChunks: false,
					plugins: [
						pluginOctane({ thread, hmr: false, dev: false }),
						metadataProbe(observed, moduleIdentifiers),
					],
				},
			});
			let result: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
			try {
				result = await rspeedy.build();
				const canonicalModules = new Set(
					moduleIdentifiers.map((identifier) =>
						identifier.split(/[?!]/, 1)[0].replaceAll('\\', '/'),
					),
				);

				for (const suffix of expectedModules) {
					expect(
						[...canonicalModules].some((identifier) => identifier.endsWith(suffix)),
						`expected ${thread} graph to contain ${suffix}`,
					).toBe(true);
				}
				for (const suffix of forbiddenModules) {
					expect(
						[...canonicalModules].some((identifier) => identifier.endsWith(suffix)),
						`expected ${thread} graph to exclude ${suffix}`,
					).toBe(false);
				}
				expect([...canonicalModules].some((identifier) => FORBIDDEN_MODULE.test(identifier))).toBe(
					false,
				);
				if (thread === 'background') {
					expect(observed).toEqual(
						expect.arrayContaining([
							expect.objectContaining({
								transformKind: 'compile',
								universalRuntime: { runtime: 'lynx', thread },
							}),
						]),
					);
				} else {
					expect(observed).toEqual([]);
				}

				const output = readJavaScript(outputRoot);
				if (thread === 'background') expect(output).toContain('octane-phase1-es2017');
				expect(output).not.toMatch(/\?\.|\?\?/);
				expect(output).not.toMatch(/\b(?:document|window|HTMLElement|MutationObserver)\b/);
			} finally {
				await result?.close();
				rmSync(temporaryRoot, { recursive: true, force: true });
			}
		},
		60_000,
	);
});
