/// <reference types="node" />
// @vitest-environment node

import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');

describe('@octanejs/lynx package boundary', () => {
	it('preserves built-in worklet registrations when a production consumer imports their setup module', async () => {
		const workletsEntry = resolve(packageDirectory, 'src/core/worklets.ts');
		const result = await build({
			stdin: {
				contents: `import ${JSON.stringify(workletsEntry)};`,
				resolveDir: repositoryRoot,
				sourcefile: 'lynx-worklet-bootstrap.js',
			},
			absWorkingDir: repositoryRoot,
			bundle: true,
			format: 'iife',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
		});
		const registeredWorklets: string[] = [];
		class ObservableWorkletRegistry<Key, Value> extends Map<Key, Value> {
			override set(key: Key, value: Value): this {
				if (typeof key === 'string' && key.startsWith('octane:')) {
					registeredWorklets.push(key);
				}
				return super.set(key, value);
			}
		}

		runInNewContext(result.outputFiles[0].text, { Map: ObservableWorkletRegistry });

		expect(registeredWorklets).toEqual([
			'octane:retain-main-thread-ref-owner',
			'octane:release-main-thread-ref-owner',
		]);
	});

	it('continues tree-shaking an unused package-root import from production consumer bundles', async () => {
		const packageEntry = resolve(packageDirectory, 'src/index.ts');
		const result = await build({
			stdin: {
				contents: `import '@octanejs/lynx'; globalThis.consumerExecuted = true;`,
				resolveDir: packageDirectory,
				sourcefile: 'lynx-consumer-unused-import.js',
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
