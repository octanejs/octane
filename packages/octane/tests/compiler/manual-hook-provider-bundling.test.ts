// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build, transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { loadPlainHookFixtureSource } from '../_server-fixture.js';
import * as Client from '../../src/index.js';
import * as Server from '../../src/runtime.server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sentinel = 'UNUSED_MANUAL_PROVIDER_DEPENDENCY';
const runNode = promisify(execFile);
const paths = [
	{ name: 'surgical', mode: 'server', inline: false, prefix: '' },
	{ name: 'memo AST', mode: 'client', inline: true, prefix: '' },
	{
		name: 'native TypeScript fallback',
		mode: 'client',
		inline: true,
		prefix: 'export type ConstGeneric = <const T>(value: T) => T;',
	},
] as const;

function adapted(source: string, variant: (typeof paths)[number]) {
	return slotHooks(variant.prefix + source, 'providers.ts', {
		manualSlots: true,
		environment: variant.mode,
		inlineHookMemo: variant.inline,
	})!.code;
}

describe('manual provider definition boundaries', () => {
	for (const variant of paths) {
		it.each(['declaration', 'expression'])(
			`removes unused %s providers and their dependency through ${variant.name}`,
			async (kind) => {
				const source = `import { useMemo } from 'octane';
					import { unusedFeature } from './unused';
					${
						kind === 'declaration'
							? `export function useUsed(value, slot) { return value + ':' + typeof slot; }
							   export function useUnused(value, slot) { return useMemo(() => unusedFeature(value), [value], slot); }`
							: `export const useUsed = (value, slot) => value + ':' + typeof slot;
							   export const useUnused = (value, slot) => useMemo(() => unusedFeature(value), [value], slot);`
					}`;
				const provider = adapted(source, variant);
				const directory = await mkdtemp(join(tmpdir(), 'octane-manual-bundle-'));
				try {
					for (const retainUnused of [false, true]) {
						const result = await build({
							stdin: {
								contents: `import { withSlot } from 'octane'; import { useUsed } from './providers';
									export const result = withSlot(Symbol.for('manual-provider'), useUsed, 'visible');
									${retainUnused ? "export { useUnused } from './providers';" : ''}`,
								resolveDir: root,
							},
							bundle: true,
							write: false,
							format: 'esm',
							platform: 'node',
							minify: true,
							define: { 'process.env.NODE_ENV': '"production"' },
							plugins: [
								{
									name: 'authored-manual-providers',
									setup(plugin) {
										plugin.onResolve({ filter: /^\.\/(providers|unused)$/ }, ({ path }) => ({
											path,
											namespace: 'fixture',
										}));
										plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
											contents:
												path === './providers'
													? provider
													: `export function unusedFeature(value) { return '${sentinel}:' + value; }`,
											loader: 'ts',
											resolveDir: root,
										}));
										plugin.onResolve({ filter: /^octane(?:\/server)?$/ }, () => ({
											path: join(
												root,
												`packages/octane/src/runtime${variant.mode === 'server' ? '.server' : ''}.ts`,
											),
										}));
										plugin.onResolve({ filter: /^octane\/internal\/client$/ }, () => ({
											path: join(root, 'packages/octane/src/internal/client.ts'),
										}));
									},
								},
							],
						});
						const output = result.outputFiles[0].text;
						// The positive control proves the dependency is reachable when its
						// provider is retained, rather than omitted by fixture resolution.
						expect(output.includes(sentinel)).toBe(retainUnused);
						const file = join(directory, `${retainUnused}.mjs`);
						await writeFile(file, output);
						const built = await import(/* @vite-ignore */ pathToFileURL(file).href);
						expect(built.result).toBe('visible:symbol');
					}
				} finally {
					await rm(directory, { recursive: true, force: true });
				}
			},
		);

		it(`preserves hoisting, receiver, names, arity and parameter evaluation through ${variant.name}`, () => {
			const module = loadPlainHookFixtureSource(
				variant.prefix +
					`
				import { withSlot, useMemo } from 'octane';
				const _$manual_useBefore = 'collision control';
				export const early = withSlot(Symbol.for('early'), useBefore, 'before');
				export const earlyBound = useBefore.bind(null);
				export function useBefore(value, slot) { return [value, slot, _$manual_useBefore]; }
				let defaults = 0;
				export function readDefaults() { return defaults; }
				export function useDefaults(this: { marker: string }, {value}: {value: string}, fallback = (++defaults, 'default'), slot?: symbol) {
					return { value, fallback, slot, receiver: this.marker, argc: arguments.length };
				}
				export function useRest(value, ...remaining) { return [value, remaining, arguments.length]; }
				export const useNamed = function implementation(value, slot) { return [value, slot]; };
				export function useMemoControl(value, slot) { return useMemo(() => value, [value], slot); }
			`,
				{
					id: 'manual-definition-semantics.ts',
					mode: variant.mode,
					manualSlots: true,
					inlineHookMemo: variant.inline,
				},
			);
			const runtime = variant.mode === 'client' ? Client : Server;
			const slot = Symbol('authored call site');
			expect(module.early).toEqual(['before', Symbol.for('early'), 'collision control']);
			expect([
				module.useBefore.name,
				module.useBefore.length,
				module.earlyBound.name,
				module.earlyBound.length,
			]).toEqual(['useBefore', 2, 'bound useBefore', 2]);
			expect([
				module.useDefaults.name,
				module.useDefaults.length,
				module.useRest.length,
				module.useNamed.name,
				module.useNamed.length,
			]).toEqual(['useDefaults', 1, 1, 'implementation', 2]);
			let reads = 0;
			const value = {
				get value() {
					reads++;
					return 'value';
				},
			};
			const result = runtime.withSlot(
				slot,
				module.useDefaults.bind({ marker: 'receiver' }),
				value,
				undefined,
			);
			expect(result).toEqual({
				value: 'value',
				fallback: 'default',
				slot,
				receiver: 'receiver',
				argc: 3,
			});
			expect([reads, module.readDefaults()]).toEqual([1, 1]);
			expect(runtime.withSlot(slot, module.useRest, 'rest')).toEqual(['rest', [slot], 2]);
			expect(runtime.withSlot(slot, module.earlyBound, 'bound')).toEqual([
				'bound',
				slot,
				'collision control',
			]);
		});

		it(`adapts a cyclic import before the provider module evaluates through ${variant.name}`, async () => {
			const directory = await mkdtemp(join(tmpdir(), 'octane-manual-cycle-'));
			try {
				const packageDir = join(directory, 'node_modules/octane');
				await mkdir(packageDir, { recursive: true });
				await writeFile(
					join(packageDir, 'package.json'),
					JSON.stringify({
						type: 'module',
						exports: {
							'.': './runtime.mjs',
							'./server': './runtime.mjs',
							'./internal/client': './runtime.mjs',
						},
					}),
				);
				await build({
					entryPoints: [
						join(
							root,
							`packages/octane/src/runtime${variant.mode === 'server' ? '.server' : ''}.ts`,
						),
					],
					bundle: true,
					format: 'esm',
					platform: 'node',
					outfile: join(packageDir, 'runtime.mjs'),
					define: { 'process.env.NODE_ENV': '"production"' },
				});
				const provider = adapted(
					`
					import { useMemo } from 'octane';
					import { observed } from './cycle.mjs';
					export const result = observed;
					export default function useProvider(value, slot) { return [value, typeof slot, arguments.length]; }
					export function useUnused(value, slot) { return useMemo(() => value, [value], slot); }
				`,
					variant,
				);
				const compiled = await transform(provider, { loader: 'ts', format: 'esm' });
				await writeFile(join(directory, 'providers.mjs'), compiled.code);
				await writeFile(
					join(directory, 'cycle.mjs'),
					`import useProvider from './providers.mjs'; import {withSlot} from 'octane'; export const observed = withSlot(Symbol.for('cycle'), useProvider, 'early');`,
				);
				// Run actual ESM linking in Node: the test runner's module transform
				// must not reorder the cycle or compile generated provider output again.
				await writeFile(
					join(directory, 'entry.mjs'),
					`import provider, {result} from './providers.mjs'; console.log(JSON.stringify({result, name: provider.name, length: provider.length}));`,
				);
				const { stdout } = await runNode(process.execPath, [join(directory, 'entry.mjs')]);
				expect(JSON.parse(stdout)).toEqual({
					result: ['early', 'symbol', 2],
					name: 'useProvider',
					length: 2,
				});
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		});
	}
});
