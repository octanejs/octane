import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { chromium } from 'playwright';
import { octane } from '../../../octane/src/compiler/vite.js';

const root = resolve(import.meta.dirname, '../../../..');
const fromOctane = createRequire(resolve(root, 'packages/octane/package.json'));

// @parity-case browser:ai-production-ui
it('ships React-free chat widgets with native input, stable identity, and complete teardown', async () => {
	const result = await build({
		configFile: false,
		root,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			{
				name: 'ai-browser-runtime',
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
				entry: resolve(root, 'packages/tanstack-ai/tests/_fixtures/browser-ui.tsrx'),
				formats: ['iife'],
				name: 'AI_BROWSER',
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
			/\/node_modules\/(?:react|react-dom|@mcp-ui\/client)(?:\/|$)/.test(id),
		),
	).toEqual([]);
	expect(gzipSync(chunk.code, { level: 9 }).length).toBeLessThan(750_000);
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setContent('<main id="target"></main>');
		await page.addScriptTag({ content: chunk.code });
		for (let round = 0; round < 3; round++) {
			await page.evaluate(() => {
				const scope = window as any;
				scope.root = scope.AI_BROWSER.mount(document.querySelector('#target'));
			});
			await expect.poll(() => page.locator('strong').textContent()).toBe('Welcome');
			const input = page.getByPlaceholder('Message');
			await input.focus();
			await page.evaluate(() => {
				(window as any).savedInput = document.activeElement;
			});
			await input.fill('Hello');
			expect(await page.evaluate(() => document.activeElement === (window as any).savedInput)).toBe(
				true,
			);
			await input.press('Enter');
			await expect.poll(() => input.isDisabled()).toBe(true);
			await page.evaluate(() => (window as any).releaseReply());
			await expect.poll(() => page.locator('#target').textContent()).toContain('Received');
			await expect.poll(() => input.isDisabled()).toBe(false);
			expect(await input.inputValue()).toBe('');
			// The upstream widget disables while sending, so Chromium blurs it.
			// Its existing DOM node must survive and become focusable again.
			expect(
				await page.evaluate(
					() => document.querySelector('[data-chat-textarea]') === (window as any).savedInput,
				),
			).toBe(true);
			await input.focus();
			expect(await page.evaluate(() => document.activeElement === (window as any).savedInput)).toBe(
				true,
			);
			expect(await page.locator('#target').textContent()).toContain('Hello');
			await page.evaluate(() => (window as any).root.unmount());
			expect(await page.locator('#target').textContent()).toBe('');
			expect(await page.evaluate(() => (window as any).savedInput.isConnected)).toBe(false);
		}
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);
