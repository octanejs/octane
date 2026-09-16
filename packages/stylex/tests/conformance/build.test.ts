import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octane } from '../../../octane/src/compiler/vite.js';
import { stylex } from '../../src/vite';
import { knownAttributeSpreads } from '../../src/compiler-contract.js';
import { evaluateCompiledFixtureCode } from '../../../octane/tests/_server-fixture.js';

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
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [octane({ knownAttributeSpreads }), stylex()],
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
				sourcemap: true,
				cssCodeSplit: false,
				lib: { entry: resolve(APP, 'main.tsrx'), formats: ['iife'], name: 'StylexBuild' },
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

		const chunk = output.find((item) => item.type === 'chunk' && item.isEntry);
		const app = evaluateCompiledFixtureCode<any>(
			`${chunk.code}\nexport const fixture = StylexBuild;`,
			chunk.fileName,
			'client',
			undefined,
		).fixture;
		const parent = document.createElement('div');
		const reference = document.createElement('div');
		document.body.append(parent, reference);
		let snapshot = { compact: false, width: 12 as number | null };
		let notify = () => {};
		const binding = app.bound(parent, {
			getSnapshot: () => snapshot,
			subscribe(next: () => void) {
				notify = next;
				return () => {
					notify = () => {};
				};
			},
		});
		try {
			for (const value of [
				snapshot,
				{ compact: true, width: 24 },
				{ compact: false, width: null },
			]) {
				snapshot = value;
				notify();
				const normal = app.normal(reference, value);
				try {
					expect(parent.firstElementChild?.getAttribute('class')).toBe(
						reference.firstElementChild?.getAttribute('class'),
					);
					expect((parent.firstElementChild as HTMLElement).style.cssText).toBe(
						(reference.firstElementChild as HTMLElement).style.cssText,
					);
					const inline = (parent.firstElementChild as HTMLElement).style.cssText;
					if (value.width === null) expect(inline).toBe('');
					else expect(inline).toContain(`: ${value.width}px`);
				} finally {
					normal.unmount();
				}
			}
		} finally {
			binding.dispose();
			parent.remove();
			reference.remove();
		}
		const sources = chunk.map.sources;
		const boxSource = sources.findIndex((source: string) => source.endsWith('/Box.tsrx'));
		expect(boxSource).toBeGreaterThanOrEqual(0);
		expect(chunk.map.sourcesContent[boxSource]).toContain('width: (width: number | null)');
	}, 60_000);
});
