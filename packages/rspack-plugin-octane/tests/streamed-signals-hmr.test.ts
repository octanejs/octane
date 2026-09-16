import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rspack, { type Compiler } from '@rspack/core';
import { afterEach, expect, it } from 'vitest';
import { createStreamedSignalHmrRuntimeModule } from '../src/streamed-signals-hmr.js';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	delete (globalThis as any).__octaneNativeHmrEffects;
	delete (globalThis as any).location;
});

// This exercises native Rspack compilation and hot application, independently
// of TSRX parsing. Compiler-result feature discovery has its own compiler tests.
it.each(['absent', 'initial', 'added', 'deferred', 'added-deferred'] as const)(
	'preserves feature-free HMR and fences %s signal feature execution',
	async (feature) => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-native-hmr-')));
		roots.push(root);
		const deferred = feature === 'deferred' || feature === 'added-deferred';
		writeFileSync(
			join(root, 'entry.cjs'),
			`
${deferred ? "require('./ordinary.cjs');" : "require('./feature.cjs');"}
module.hot.accept('./ordinary.cjs', function() { require('./ordinary.cjs'); });
module.hot.accept('./feature.cjs', function() { ${deferred ? '' : "require('./feature.cjs');"} });
exports.startFeature = function() { require('./feature.cjs'); };
exports.update = function() { return module.hot.check(true); };
`,
		);
		writeFileSync(join(root, 'feature.cjs'), 'globalThis.__octaneNativeHmrEffects.push("first");');
		writeFileSync(
			join(root, 'ordinary.cjs'),
			'globalThis.__octaneNativeHmrEffects.push("ordinary1");',
		);
		let enabled = feature === 'initial' || feature === 'deferred';
		const compiler = rspack({
			mode: 'development',
			target: 'node',
			context: root,
			entry: './entry.cjs',
			devtool: false,
			output: { path: join(root, 'dist'), filename: 'entry.cjs', library: { type: 'commonjs2' } },
			plugins: [
				new rspack.HotModuleReplacementPlugin(),
				{
					apply(compiler: Compiler) {
						expect(
							compiler.options.plugins.some(
								(plugin) => plugin instanceof compiler.webpack.HotModuleReplacementPlugin,
							),
						).toBe(true);
						compiler.hooks.thisCompilation.tap('signal-fence-test', (compilation) => {
							compilation.hooks.additionalTreeRuntimeRequirements.tap(
								'signal-fence-test',
								(chunk, requirements) => {
									if (!enabled || !chunk.hasRuntime()) return;
									const modules = [...compilation.modules]
										.filter((module: any) => module.resource === join(root, 'feature.cjs'))
										.map((module) => ({ module }));
									requirements.add(rspack.RuntimeGlobals.interceptModuleExecution);
									requirements.add(rspack.RuntimeGlobals.moduleCache);
									requirements.add(rspack.RuntimeGlobals.global);
									compilation.addRuntimeModule(
										chunk,
										createStreamedSignalHmrRuntimeModule(compiler, compilation, modules),
									);
								},
							);
						});
					},
				},
			],
		})!;
		let completed: (error?: Error | null) => void;
		const nextBuild = () =>
			new Promise<void>((resolve, reject) => {
				completed = (error) => (error ? reject(error) : resolve());
			});
		const firstBuild = nextBuild();
		const watching = compiler.watch({ aggregateTimeout: 0, poll: 20 }, (error, stats) => {
			completed(
				error ??
					(stats?.hasErrors() ? new Error(stats.toString({ all: false, errors: true })) : null),
			);
		});
		try {
			await firstBuild;
			(globalThis as any).__octaneNativeHmrEffects = [];
			let reloads = 0;
			(globalThis as any).location = {
				reload() {
					reloads++;
				},
			};
			const entry = createRequire(import.meta.url)(join(root, 'dist/entry.cjs'));
			expect((globalThis as any).__octaneNativeHmrEffects).toEqual([
				deferred ? 'ordinary1' : 'first',
			]);
			enabled ||= feature === 'added' || feature === 'added-deferred';
			const changedBuild = nextBuild();
			writeFileSync(
				join(root, deferred ? 'ordinary.cjs' : 'feature.cjs'),
				`globalThis.__octaneNativeHmrEffects.push("${deferred ? 'ordinary2' : 'second'}");`,
			);
			await changedBuild;
			if (deferred) {
				await entry.update();
				expect(reloads).toBe(0);
				expect((globalThis as any).__octaneNativeHmrEffects).toEqual(['ordinary1', 'ordinary2']);
				expect(() => entry.startFeature()).toThrow(/client build changed/);
				expect(reloads).toBeGreaterThan(0);
				expect((globalThis as any).__octaneNativeHmrEffects).toEqual(['ordinary1', 'ordinary2']);
			} else if (feature === 'absent') {
				await entry.update();
				expect(reloads).toBe(0);
				expect((globalThis as any).__octaneNativeHmrEffects).toEqual(['first', 'second']);
			} else {
				await expect(Promise.resolve().then(() => entry.update())).rejects.toThrow(
					/client build changed/,
				);
				expect(reloads).toBeGreaterThan(0);
				expect((globalThis as any).__octaneNativeHmrEffects).toEqual(['first']);
			}
		} finally {
			await new Promise<void>((resolve) => watching.close(resolve));
			await new Promise<void>((resolve, reject) =>
				compiler.close((error) => (error ? reject(error) : resolve())),
			);
		}
	},
);
