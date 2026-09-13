import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { chromium } from 'playwright';
import { octane } from '../../../octane/src/compiler/vite.js';

const root = resolve(import.meta.dirname, '../../../..');
const fromOctane = createRequire(resolve(root, 'packages/octane/package.json'));

// @parity-case browser:router-production-navigation
it('keeps native input, route loading, and portal context live through navigation and teardown', async () => {
	const result = await build({
		configFile: false,
		root,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			{
				name: 'router-browser-runtime',
				enforce: 'pre',
				resolveId(id) {
					if (id === 'octane' || id.startsWith('octane/')) return fromOctane.resolve(id);
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: {
			write: false,
			minify: 'esbuild',
			target: 'esnext',
			lib: {
				entry: resolve(root, 'packages/tanstack-router/tests/_fixtures/browser-navigation.tsrx'),
				formats: ['iife'],
				name: 'ROUTER_BROWSER',
			},
		},
	});
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
	const chunks = outputs.filter((entry) => entry.type === 'chunk');
	expect(chunks).toHaveLength(1);
	const chunk = chunks[0]!;
	expect(chunk.imports).toEqual([]);
	expect(chunk.code).not.toMatch(/\bimport\s*\(/);
	// Rollup reports inlined dynamic imports as a reference to this same chunk.
	expect(chunk.dynamicImports.filter((name) => name !== chunk.fileName)).toEqual([]);

	expect(
		Object.keys(chunk.modules).filter((id) =>
			/\/node_modules\/(?:react|react-dom|@tanstack\/react-router)(?:\/|$)/.test(id),
		),
	).toEqual([]);

	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setContent('<main id="target"></main><aside id="portal"></aside>');
		await page.addScriptTag({ content: chunk.code });
		for (let round = 0; round < 3; round++) {
			await page.evaluate(() => {
				const scope = window as any;
				scope.routerTest = scope.ROUTER_BROWSER.mount(
					document.querySelector('#target'),
					document.querySelector('#portal'),
				);
			});
			await expect.poll(() => page.locator('h1').textContent()).toBe('Home screen');
			const input = page.getByLabel('Persistent note');
			await input.fill('Keep this note');
			await page.evaluate(() => {
				(window as any).savedInput = document.activeElement;
			});
			await page.getByRole('link', { name: 'Details', exact: true }).click();
			await expect
				.poll(() => page.locator('#target').getByRole('status').textContent())
				.toBe('Loading details');
			await expect
				.poll(() => page.locator('[data-portal-location]').textContent())
				.toBe('/details');
			expect(await input.inputValue()).toBe('Keep this note');
			expect(
				await page.evaluate(() => document.querySelector('input') === (window as any).savedInput),
			).toBe(true);
			await page.evaluate(() => (window as any).routerTest.release());
			await expect.poll(() => page.locator('h1').textContent()).toBe('Details screen');
			expect(await page.locator('#target').getByRole('status').count()).toBe(0);
			await page.getByRole('link', { name: 'Home', exact: true }).click();
			await expect.poll(() => page.locator('h1').textContent()).toBe('Home screen');
			await expect.poll(() => page.locator('[data-portal-location]').textContent()).toBe('/');
			await input.focus();
			expect(await page.evaluate(() => document.activeElement === (window as any).savedInput)).toBe(
				true,
			);
			expect(await page.evaluate(() => (window as any).routerTest.visits())).toBe(1);
			await page.getByRole('link', { name: 'Failure', exact: true }).click();
			await expect.poll(() => page.getByRole('alert').textContent()).toBe('Portal failed');
			expect(await page.locator('#portal').textContent()).toBe('');
			expect(await page.evaluate(() => (window as any).savedInput.isConnected)).toBe(false);
			await page.evaluate(() => (window as any).routerTest.navigate({ to: '/' }));
			await expect.poll(() => page.locator('h1').textContent()).toBe('Home screen');
			await expect.poll(() => page.locator('[data-portal-location]').textContent()).toBe('/');
			await page.evaluate(() => (window as any).routerTest.unmount());
			expect(await page.locator('#target').textContent()).toBe('');
			expect(await page.locator('#portal').textContent()).toBe('');
			expect(await page.evaluate(() => (window as any).savedInput.isConnected)).toBe(false);
		}
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);
