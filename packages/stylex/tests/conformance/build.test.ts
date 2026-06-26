import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octane } from '../../../octane/src/compiler/vite.js';
import { stylex } from '../../src/vite';

// End-to-end validation against a REAL `vite build`: octane() compiles the `.tsrx`
// components, stylex() compiles their StyleX away, and the generated sheet (filled in
// by generateBundle after all transforms) must contain EVERY rule — from both
// component modules — with no placeholder left behind.

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../_fixtures/build-app');

describe('production vite build', () => {
	it('emits all stylex rules from every module into the output CSS', async () => {
		const result: any = await build({
			root: APP,
			logLevel: 'silent',
			plugins: [octane(), stylex()],
			resolve: {
				// Resolve the workspace package to source so the build matches the test setup.
				alias: [
					{
						find: /^@octanejs\/stylex$/,
						replacement: resolve(here, '../../src/index.ts'),
					},
				],
			},
			build: {
				write: false,
				cssCodeSplit: false,
				rollupOptions: { input: resolve(APP, 'main.ts') },
			},
		});

		const output: any[] = Array.isArray(result) ? result[0].output : result.output;
		const cssAsset = output.find((o) => o.type === 'asset' && String(o.fileName).endsWith('.css'));
		const css = cssAsset ? String(cssAsset.source) : '';

		// Box (module 1)
		expect(css).toContain('padding:16px');
		expect(css).toContain('color:tomato');
		// Pill (module 2)
		expect(css).toContain('border-radius:999px');
		expect(css).toContain('background-color:navy');
		// the placeholder was swapped out
		expect(css).not.toContain('__stylex_sheet__');
	}, 60_000);
});
