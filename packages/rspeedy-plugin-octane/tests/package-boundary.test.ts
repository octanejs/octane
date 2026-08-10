// @vitest-environment node

import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');

describe('@octanejs/rspeedy-plugin package boundary', () => {
	it('keeps main-thread installation and readiness around authored production application entries', async () => {
		const mainThreadEntry = resolve(packageDirectory, 'src/main-thread-entry.js');
		const mainThreadReady = resolve(packageDirectory, 'src/main-thread-ready.js');
		const result = await build({
			stdin: {
				contents: `
import ${JSON.stringify(mainThreadEntry)};
import 'rspeedy:authored-entry';
import ${JSON.stringify(mainThreadReady)};
`,
				resolveDir: repositoryRoot,
				sourcefile: 'rspeedy-main-thread-consumer.js',
			},
			absWorkingDir: repositoryRoot,
			bundle: true,
			format: 'iife',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'rspeedy-main-thread-consumer-dependencies',
					setup(builder) {
						builder.onResolve(
							{
								filter: /^@octanejs\/lynx\/(?:main-thread|first-screen)$|^rspeedy:authored-entry$/,
							},
							({ path }) => ({ path, namespace: 'rspeedy-main-thread-consumer' }),
						);
						builder.onLoad(
							{ filter: /.*/, namespace: 'rspeedy-main-thread-consumer' },
							({ path }) => ({
								contents:
									path === '@octanejs/lynx/main-thread'
										? `export function installLynxMainThread(options) {
	globalThis.bootstrap.install(options, globalThis.processData);
}`
										: path === '@octanejs/lynx/first-screen'
											? `export function markFirstScreenSyncReady() {
	globalThis.bootstrap.ready();
}`
											: 'globalThis.bootstrap.evaluate();',
								loader: 'js',
							}),
						);
					},
				},
			],
		});
		const phases: string[] = [];
		const installations: Array<{
			options: { firstScreen: boolean; firstScreenSync: string; firstScreenRender: string };
			processData: unknown;
		}> = [];
		const context: {
			processData?: (data: unknown) => unknown;
			bootstrap: {
				install: (
					options: { firstScreen: boolean; firstScreenSync: string; firstScreenRender: string },
					processData: unknown,
				) => void;
				evaluate: () => void;
				ready: () => void;
			};
		} = {
			bootstrap: {
				install(options, processData) {
					installations.push({ options, processData });
					phases.push('installed');
				},
				evaluate() {
					phases.push('authored');
				},
				ready() {
					phases.push('ready');
				},
			},
		};

		runInNewContext(result.outputFiles[0].text, context);

		const data = { accountId: 'account-a' };
		expect(phases).toEqual(['installed', 'authored', 'ready']);
		expect(context.processData?.(data)).toBe(data);
		expect(installations).toHaveLength(1);
		expect(installations[0].processData).toBe(context.processData);
		expect(installations[0].options).toEqual({
			firstScreen: true,
			firstScreenSync: 'manual',
			firstScreenRender: 'engine',
		});
	});

	it('continues tree-shaking an unused package-root import from production consumer bundles', async () => {
		const packageEntry = resolve(packageDirectory, 'src/index.js');
		const result = await build({
			stdin: {
				contents: `import '@octanejs/rspeedy-plugin'; globalThis.consumerExecuted = true;`,
				resolveDir: packageDirectory,
				sourcefile: 'rspeedy-consumer-unused-import.js',
			},
			absWorkingDir: repositoryRoot,
			bundle: true,
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'unused-rspeedy-package-dependencies',
					setup(builder) {
						builder.onResolve({ filter: /.*/ }, (args) =>
							args.importer === packageEntry ? { path: args.path, external: true } : undefined,
						);
					},
				},
			],
		});
		const context = { consumerExecuted: false };
		const includedModules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		runInNewContext(result.outputFiles[0].text, context);

		expect(context.consumerExecuted).toBe(true);
		expect(includedModules.some((entry) => resolve(repositoryRoot, entry) === packageEntry)).toBe(
			false,
		);
	});
});
