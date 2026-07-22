import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createRspeedy } from '@lynx-js/rspeedy';
import {
	decode_napi as decodeNativeBundleWithNapi,
	decode_wasm as decodeNativeBundleWithWasm,
	supportNapi,
} from '@lynx-js/tasm';
import { getOctaneRspackBuildInfo } from '@octanejs/rspack-plugin';
import { describe, expect, it } from 'vitest';

import { pluginOctane } from '../src/index.js';

const FIXTURE = resolve(import.meta.dirname, '_fixtures/background');
const APPLICATION_FIXTURE = resolve(import.meta.dirname, '_fixtures/application');
const BACKGROUND_ONLY_MARKER = 'octane-milestone-six-background-only-callback';
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

function outputFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filename = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...outputFiles(filename));
		else files.push(filename);
	}
	return files;
}

function nativeScriptText(script: unknown): string {
	if (typeof script === 'string') return script;
	if (Array.isArray(script)) {
		if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Buffer.from(script).toString('latin1');
		}
		return script.map(nativeScriptText).join('\n');
	}
	if (script !== null && typeof script === 'object') {
		return Object.values(script).map(nativeScriptText).join('\n');
	}
	return '';
}

async function decodeNativeBundle(content: Buffer): Promise<Record<string, unknown>> {
	return supportNapi()
		? decodeNativeBundleWithNapi(content)
		: await decodeNativeBundleWithWasm(content);
}

function containsEncodedText(content: Buffer, value: string): boolean {
	return content.includes(Buffer.from(value)) || content.includes(Buffer.from(value, 'utf16le'));
}

function withoutKnownDiagnosticText(content: string): string {
	// The native decoder includes receiver string tables. This describes a
	// first-screen render phase; it is not a reference to the browser global.
	return content.replaceAll('render window has closed', 'render phase has closed');
}

class MetadataProbePlugin {
	constructor(
		private readonly observed: unknown[],
		private readonly moduleIdentifiers: string[],
		private readonly layeredModules: { identifier: string; layer?: string | null }[],
	) {}

	apply(compiler: any): void {
		compiler.hooks.compilation.tap(this.constructor.name, (compilation: any) => {
			compilation.hooks.finishModules.tap(this.constructor.name, (modules: Iterable<unknown>) => {
				for (const module of modules) {
					const record = module as {
						identifier?: () => string;
						layer?: string | null;
						nameForCondition?: () => string | null;
					};
					const moduleIdentifier = record.identifier?.();
					if (typeof moduleIdentifier === 'string') {
						this.layeredModules.push({
							identifier: moduleIdentifier,
							...(record.layer === undefined ? null : { layer: record.layer }),
						});
					}
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

function metadataProbe(
	observed: unknown[],
	moduleIdentifiers: string[],
	layeredModules: { identifier: string; layer?: string | null }[] = [],
) {
	return {
		name: 'octane:lynx-runtime-graph-probe',
		setup(api: any) {
			api.modifyBundlerChain((chain: any) => {
				chain
					.plugin('octane:lynx-runtime-graph-probe')
					.use(MetadataProbePlugin, [observed, moduleIdentifiers, layeredModules]);
			});
		},
	};
}

class NativeArtifactProbePlugin {
	constructor(
		private readonly styleSheets: string[],
		private readonly debugMetadata: string[],
	) {}

	apply(compiler: any): void {
		compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation: any) => {
			compilation.hooks.processAssets.tap(
				{
					name: this.constructor.name,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
				},
				() => {
					for (const asset of compilation.getAssets()) {
						if (asset.name.endsWith('.css')) {
							this.styleSheets.push(asset.source.source().toString());
						} else if (asset.name.endsWith('/debug-metadata.json')) {
							this.debugMetadata.push(asset.source.source().toString());
						}
					}
				},
			);
		});
	}
}

function nativeArtifactProbe(styleSheets: string[], debugMetadata: string[]) {
	return {
		name: 'octane:lynx-native-artifact-probe',
		setup(api: any) {
			api.modifyBundlerChain((chain: any) => {
				chain
					.plugin('octane:lynx-native-artifact-probe')
					.use(NativeArtifactProbePlugin, [styleSheets, debugMetadata]);
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
				expect(withoutKnownDiagnosticText(output)).not.toMatch(
					/\b(?:document|window|HTMLElement|MutationObserver)\b/,
				);
			} finally {
				await result?.close();
				rmSync(temporaryRoot, { recursive: true, force: true });
			}
		},
		60_000,
	);

	it('assembles a normal Octane application and generated receiver into a native bundle', async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-application-'));
		const outputRoot = join(temporaryRoot, 'dist');
		const observed: unknown[] = [];
		const moduleIdentifiers: string[] = [];
		const layeredModules: { identifier: string; layer?: string | null }[] = [];
		const styleSheets: string[] = [];
		const debugMetadata: string[] = [];
		const rspeedy = await createRspeedy({
			cwd: APPLICATION_FIXTURE,
			loadEnv: false,
			environment: ['lynx'],
			rspeedyConfig: {
				mode: 'production',
				environments: { lynx: {} },
				dev: { hmr: false, liveReload: false },
				output: {
					cleanDistPath: true,
					dataUriLimit: 0,
					distPath: { root: outputRoot },
					filename: { js: '[name].[contenthash:6].js' },
					sourceMap: { css: true, js: 'source-map' },
				},
				source: { entry: { main: './src/background.ts' } },
				splitChunks: false,
				plugins: [
					pluginOctane({ hmr: false, dev: false }),
					metadataProbe(observed, moduleIdentifiers, layeredModules),
					nativeArtifactProbe(styleSheets, debugMetadata),
				],
			},
		});
		let result: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
		try {
			result = await rspeedy.build();
			const bundlePath = join(outputRoot, 'main.lynx.bundle');
			const bundle = readFileSync(bundlePath);
			const decoded = await decodeNativeBundle(bundle);
			const mainThread = nativeScriptText(decoded['main-thread-script']);
			const background = nativeScriptText(decoded['background-thread-script']);
			const completeBundleText = nativeScriptText(decoded);

			expect(decoded['engine-version']).toBe('3.9');
			expect(mainThread).toMatch(/getJSContext/);
			expect(mainThread).not.toMatch(/getCoreContext/);
			expect(background).toMatch(/getCoreContext/);
			expect(background).not.toMatch(/getJSContext/);
			expect(mainThread).toContain('milestone-five');
			expect(mainThread).toContain('Native bundle');
			expect(mainThread).toContain('octane-m7-main-thread-worklet');
			expect(mainThread).not.toContain('octane-m7-background-function');
			expect(mainThread).not.toContain(BACKGROUND_ONLY_MARKER);
			expect(background).toContain('milestone-five');
			expect(background).not.toContain('octane-m7-main-thread-worklet');
			expect(background).toContain('octane-m7-background-function');
			expect(background).toContain(BACKGROUND_ONLY_MARKER);
			expect(completeBundleText).not.toMatch(
				/@lynx-js[\\/]react|ReactLynx|\b(?:react-dom|preact)\b/i,
			);
			expect(withoutKnownDiagnosticText(completeBundleText)).not.toMatch(
				/\b(?:document|window|HTMLElement|MutationObserver)\b/,
			);

			const canonicalModules = new Set(
				moduleIdentifiers.map((identifier) => identifier.split(/[?!]/, 1)[0].replaceAll('\\', '/')),
			);
			for (const suffix of [
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/background.ts',
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/App.tsrx',
				'/packages/lynx/src/root.ts',
				'/packages/lynx/src/main-thread.ts',
			]) {
				expect(
					[...canonicalModules].some((identifier) => identifier.endsWith(suffix)),
					`expected native application graph to contain ${suffix}`,
				).toBe(true);
			}
			expect([...canonicalModules].some((identifier) => FORBIDDEN_MODULE.test(identifier))).toBe(
				false,
			);
			expect(observed).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						transformKind: 'compile',
						universalRuntime: { runtime: 'lynx', thread: 'background' },
					}),
					expect.objectContaining({
						transformKind: 'compile',
						universalRuntime: { runtime: 'lynx', thread: 'main-thread' },
					}),
				]),
			);
			const modulesForLayer = (layer: string) =>
				new Set(
					layeredModules
						.filter((module) => module.layer === layer)
						.map((module) =>
							module.identifier
								.slice(module.identifier.lastIndexOf('!') + 1)
								.replace(/\|octane:(?:background|main-thread)$/, '')
								.split('?', 1)[0]
								.replaceAll('\\', '/'),
						),
				);
			const hasSuffix = (modules: Set<string>, suffix: string) =>
				[...modules].some((identifier) => identifier.endsWith(suffix));
			const backgroundModules = modulesForLayer('octane:background');
			const mainModules = modulesForLayer('octane:main-thread');
			for (const suffix of [
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/background.ts',
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/App.tsrx',
				'/packages/lynx/src/root.ts',
			]) {
				expect(hasSuffix(backgroundModules, suffix), `missing ${suffix} from background`).toBe(
					true,
				);
			}
			for (const suffix of [
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/background.ts',
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/App.tsrx',
				'/packages/rspeedy-plugin-octane/src/main-thread-entry.js',
				'/packages/rspeedy-plugin-octane/src/main-thread-ready.js',
				'/packages/lynx/src/first-screen.ts',
				'/packages/lynx/src/main-renderer.ts',
			]) {
				expect(hasSuffix(mainModules, suffix), `missing ${suffix} from main thread`).toBe(true);
			}
			for (const suffix of [
				'/packages/rspeedy-plugin-octane/src/main-thread-entry.js',
				'/packages/rspeedy-plugin-octane/src/main-thread-ready.js',
				'/packages/lynx/src/first-screen.ts',
				'/packages/lynx/src/main-renderer.ts',
			]) {
				expect(hasSuffix(backgroundModules, suffix), `unexpected ${suffix} in background`).toBe(
					false,
				);
			}
			for (const suffix of [
				'/packages/lynx/src/root.ts',
				'/packages/lynx/src/core/client-driver.ts',
				'/packages/octane/src/universal-core.ts',
			]) {
				expect(hasSuffix(mainModules, suffix), `unexpected ${suffix} in main thread`).toBe(false);
			}

			const extractedCSS = styleSheets.join('\n');
			expect(extractedCSS).toContain('#123456');
			expect(extractedCSS).toContain('7px');
			expect(extractedCSS).toContain('.application-shell');
			expect(extractedCSS).toContain('17px');
			const moduleClass = [...extractedCSS.matchAll(/\.([_a-zA-Z][\w-]*)\s*\{/g)]
				.map((match) => match[1])
				.find((className) => className !== 'application-shell');
			expect(moduleClass).toBeDefined();
			expect(moduleClass).not.toBe('card');
			expect(background).toContain(moduleClass!);
			expect(mainThread).toContain(moduleClass!);
			expect(bundle.includes(Buffer.from('#123456'))).toBe(true);
			expect(bundle.includes(Buffer.from('application-shell'))).toBe(true);

			const emittedAsset = outputFiles(outputRoot).find((filename) => filename.endsWith('.svg'));
			expect(emittedAsset).toBeDefined();
			expect(readFileSync(emittedAsset!, 'utf8')).toContain('data-octane-asset="milestone-five"');
			expect(bundle.includes(Buffer.from(emittedAsset!.split(/[\\/]/).at(-1)!))).toBe(true);
			expect(mainThread).toContain(emittedAsset!.split(/[\\/]/).at(-1)!);

			expect(debugMetadata).toHaveLength(1);
			const metadata = JSON.parse(debugMetadata[0]);
			expect(metadata.buildInfo.rspeedy.entryFiles).toEqual(
				expect.arrayContaining([
					expect.stringMatching(
						/packages\/rspeedy-plugin-octane\/tests\/_fixtures\/application\/src\/background\.ts$/,
					),
				]),
			);
			expect(metadata.artifacts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: 'main-thread' }),
					expect.objectContaining({
						kind: 'background',
						path: expect.stringMatching(/^\.rspeedy\/main\/background\.[A-Fa-f0-9]{6}\.js$/),
					}),
					expect.objectContaining({ kind: 'css' }),
				]),
			);
			const sourceMaps = metadata.artifacts.flatMap((artifact: any) =>
				artifact.debugSources
					.filter((source: any) => source.kind === 'source-map')
					.map((source: any) => source.map),
			);
			expect(sourceMaps).not.toHaveLength(0);
			expect(JSON.stringify(sourceMaps)).toMatch(/App\.tsrx|background\.ts/);
		} finally {
			await result?.close();
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	}, 120_000);

	it('emits a production lazy bundle specialized for both native threads', async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-lazy-'));
		const outputRoot = join(temporaryRoot, 'dist');
		const moduleIdentifiers: string[] = [];
		const layeredModules: { identifier: string; layer?: string | null }[] = [];
		const debugMetadata: string[] = [];
		const rspeedy = await createRspeedy({
			cwd: APPLICATION_FIXTURE,
			loadEnv: false,
			environment: ['lynx'],
			rspeedyConfig: {
				mode: 'production',
				environments: { lynx: {} },
				dev: { hmr: false, liveReload: false },
				output: {
					cleanDistPath: true,
					distPath: { root: outputRoot },
					filenameHash: true,
					sourceMap: { css: false, js: 'source-map' },
				},
				source: { entry: { main: './src/lazy.ts' } },
				splitChunks: false,
				plugins: [
					pluginOctane({ hmr: false, dev: false }),
					metadataProbe([], moduleIdentifiers, layeredModules),
					nativeArtifactProbe([], debugMetadata),
				],
			},
		});
		let result: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
		try {
			result = await rspeedy.build();
			const decoded = await decodeNativeBundle(readFileSync(join(outputRoot, 'main.lynx.bundle')));
			const mainThread = nativeScriptText(decoded['main-thread-script']);
			const background = nativeScriptText(decoded['background-thread-script']);
			expect(mainThread).toContain('octane-m8-lazy-pending');
			expect(background).toContain('octane-m8-lazy-pending');

			const lazyBundlePath = outputFiles(outputRoot).find((filename) =>
				/[\\/]async[\\/]src[\\/]LazyCard\.tsrx\.[A-Fa-f0-9]+\.bundle$/.test(filename),
			);
			expect(lazyBundlePath).toBeDefined();
			const lazyBundle = readFileSync(lazyBundlePath!);
			expect(containsEncodedText(lazyBundle, 'octane-m8-lazy-chunk')).toBe(true);
			expect(lazyBundlePath).not.toBe(join(outputRoot, 'main.lynx.bundle'));

			const canonicalLayeredModules = layeredModules.map((module) => ({
				identifier: module.identifier
					.slice(module.identifier.lastIndexOf('!') + 1)
					.replace(/\|octane:(?:background|main-thread)$/, '')
					.split('?', 1)[0]
					.replaceAll('\\', '/'),
				layer: module.layer,
			}));
			const lazyModuleSuffix =
				'/packages/rspeedy-plugin-octane/tests/_fixtures/application/src/LazyCard.tsrx';
			for (const layer of ['octane:background', 'octane:main-thread']) {
				expect(
					canonicalLayeredModules.some(
						(module) => module.layer === layer && module.identifier.endsWith(lazyModuleSuffix),
					),
					`expected the lazy module in ${layer}`,
				).toBe(true);
			}
			const canonicalModules = moduleIdentifiers.map((identifier) =>
				identifier.split(/[?!]/, 1)[0].replaceAll('\\', '/'),
			);
			expect(canonicalModules.some((identifier) => identifier.endsWith(lazyModuleSuffix))).toBe(
				true,
			);
			expect(canonicalModules.some((identifier) => FORBIDDEN_MODULE.test(identifier))).toBe(false);

			const metadataRecords = debugMetadata.map((value) => JSON.parse(value));
			const lazyMetadata = metadataRecords.find((value) =>
				value.buildInfo?.rspeedy?.entryFiles?.some((filename: string) =>
					filename.endsWith('/src/LazyCard.tsrx'),
				),
			);
			expect(lazyMetadata?.artifacts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: 'background',
						path: expect.stringMatching(/^\.rspeedy\/async\/src\/LazyCard\.tsrx\/background\.js$/),
					}),
					expect.objectContaining({
						kind: 'main-thread',
						path: expect.stringMatching(/^\.rspeedy\/async\/src\/LazyCard\.tsrx\/main-thread\.js$/),
					}),
				]),
			);
			expect(JSON.stringify(lazyMetadata)).toContain('LazyCard.tsrx');
		} finally {
			await result?.close();
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	}, 120_000);

	it('emits one self-contained native bundle for each authored entry', async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-multiple-entries-'));
		const outputRoot = join(temporaryRoot, 'dist');
		const rspeedy = await createRspeedy({
			cwd: APPLICATION_FIXTURE,
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
				source: {
					entry: {
						main: './src/background.ts',
						secondary: './src/secondary.ts',
					},
				},
				splitChunks: false,
				plugins: [pluginOctane({ hmr: false, dev: false })],
			},
		});
		let result: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
		try {
			result = await rspeedy.build();
			const mainBundle = await decodeNativeBundle(
				readFileSync(join(outputRoot, 'main.lynx.bundle')),
			);
			const secondaryBundle = await decodeNativeBundle(
				readFileSync(join(outputRoot, 'secondary.lynx.bundle')),
			);
			const main = nativeScriptText(mainBundle['background-thread-script']);
			const mainFirstScreen = nativeScriptText(mainBundle['main-thread-script']);
			const secondary = nativeScriptText(secondaryBundle['background-thread-script']);
			const secondaryFirstScreen = nativeScriptText(secondaryBundle['main-thread-script']);

			expect(main).toContain('Native bundle');
			expect(main).not.toContain('Secondary bundle');
			expect(mainFirstScreen).toContain('Native bundle');
			expect(mainFirstScreen).not.toContain('Secondary bundle');
			expect(secondary).toContain('Secondary bundle');
			expect(secondary).not.toContain('Native bundle');
			expect(secondaryFirstScreen).toContain('Secondary bundle');
			expect(secondaryFirstScreen).not.toContain('Native bundle');
		} finally {
			await result?.close();
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	}, 120_000);

	it('emits a build-only Web bundle from the same application graphs', async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-web-'));
		const outputRoot = join(temporaryRoot, 'dist');
		const moduleIdentifiers: string[] = [];
		const rspeedy = await createRspeedy({
			cwd: APPLICATION_FIXTURE,
			loadEnv: false,
			environment: ['web'],
			rspeedyConfig: {
				mode: 'production',
				environments: { web: {} },
				dev: { hmr: false, liveReload: false },
				output: {
					cleanDistPath: true,
					distPath: { root: outputRoot },
					filenameHash: false,
					sourceMap: false,
				},
				source: { entry: { main: './src/background.ts' } },
				splitChunks: false,
				plugins: [pluginOctane({ hmr: false, dev: false }), metadataProbe([], moduleIdentifiers)],
			},
		});
		let result: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
		try {
			result = await rspeedy.build();
			const output = readFileSync(join(outputRoot, 'main.web.bundle'));
			expect(containsEncodedText(output, 'milestone-five')).toBe(true);
			expect(containsEncodedText(output, 'getJSContext')).toBe(true);
			expect(containsEncodedText(output, 'getCoreContext')).toBe(true);
			const canonicalModules = moduleIdentifiers.map((identifier) =>
				identifier.split(/[?!]/, 1)[0].replaceAll('\\', '/'),
			);
			for (const suffix of ['/packages/lynx/src/root.ts', '/packages/lynx/src/main-thread.ts']) {
				expect(canonicalModules.some((identifier) => identifier.endsWith(suffix))).toBe(true);
			}
			expect(canonicalModules.some((identifier) => FORBIDDEN_MODULE.test(identifier))).toBe(false);
		} finally {
			await result?.close();
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	}, 60_000);
});
