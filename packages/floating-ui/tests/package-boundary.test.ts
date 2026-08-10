// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');

describe('@octanejs/floating-ui production package boundary', () => {
	it('classifies its authored positioning and interaction modules as side-effect-free', () => {
		const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'));

		expect(manifest.sideEffects).toBe(false);
	});

	it('executes public positioning without retaining unrelated interaction providers', async () => {
		const result = await build({
			stdin: {
				contents: `
import { computePosition } from '@octanejs/floating-ui';

globalThis.position = computePosition({}, {}, {
	placement: 'bottom',
	platform: {
		getElementRects: async () => ({
			reference: { x: 10, y: 20, width: 40, height: 10 },
			floating: { x: 0, y: 0, width: 20, height: 5 },
		}),
		isRTL: async () => false,
	},
});
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-floating-position-consumer.ts',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
		});
		const context: {
			position?: Promise<{ x: number; y: number; placement: string }>;
		} = {};

		runInNewContext(result.outputFiles[0].text, context);

		await expect(context.position).resolves.toMatchObject({ x: 20, y: 30, placement: 'bottom' });

		const includedModules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs).map(
			(module) => module.split(sep).join('/'),
		);

		expect(
			includedModules.filter((module) =>
				[
					'packages/floating-ui/src/context.ts',
					'packages/floating-ui/src/tree.ts',
					'packages/floating-ui/src/FloatingPortal.ts',
				].some((unrelated) => module.endsWith(unrelated)),
			),
		).toEqual([]);
	});
});
