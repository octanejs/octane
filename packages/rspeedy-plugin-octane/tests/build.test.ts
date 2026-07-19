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
		name: 'octane:phase-one-metadata-probe',
		setup(api: any) {
			api.modifyBundlerChain((chain: any) => {
				chain
					.plugin('octane:phase-one-metadata-probe')
					.use(MetadataProbePlugin, [observed, moduleIdentifiers]);
			});
		},
	};
}

describe('@octanejs/rspeedy-plugin native compile builds', () => {
	it.each(['background', 'main-thread'] as const)(
		'bundles %s TSRX as one DOM-free native universal graph',
		async (thread) => {
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
					source: { entry: { main: './src/App.tsrx' } },
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

				expect([...canonicalModules].some((identifier) => identifier.endsWith('/App.tsrx'))).toBe(
					true,
				);
				expect(
					[...canonicalModules].filter((identifier) => identifier.endsWith('/universal-core.ts')),
				).toHaveLength(1);
				expect(
					[...canonicalModules].filter((identifier) => identifier.endsWith('/universal-native.ts')),
				).toHaveLength(1);
				expect([...canonicalModules].some((identifier) => FORBIDDEN_MODULE.test(identifier))).toBe(
					false,
				);
				expect(observed).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							transformKind: 'compile',
							universalRuntime: { runtime: 'lynx', thread },
						}),
					]),
				);

				const output = readJavaScript(outputRoot);
				expect(output).toContain('octane-phase1-es2017');
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
