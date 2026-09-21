import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));

for (const compileMode of ['dev', 'prod'] as const) {
	describe.sequential(`${compileMode}: measured drawer layout`, () => {
		let server: ViteDevServer;
		let browser: Browser;
		let baseUrl: string;

		beforeAll(async () => {
			server = await createServer({
				configFile: false,
				root: HERE,
				logLevel: 'error',
				cacheDir: resolve(
					HERE,
					`../../../../../node_modules/.vite/base-ui-resize-observer-${compileMode}`,
				),
				plugins: [octane({ hmr: compileMode === 'dev' })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/base-ui\/drawer$/,
							replacement: resolve(HERE, '../../../src/drawer/index.ts'),
						},
						{
							find: /^octane$/,
							replacement: resolve(HERE, '../../../../octane/src/index.ts'),
						},
					],
				},
				server: { host: '127.0.0.1', port: 0 },
			});
			await server.listen();
			const address = server.httpServer!.address();
			if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
			baseUrl = `http://127.0.0.1:${address.port}`;
			browser = await launchBrowser({ headless: true });
		});

		afterAll(async () => {
			await browser?.close();
			await server?.close();
		});

		it('settles geometry based on its reported height without observer delivery errors', async () => {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
			});
			try {
				await page.goto(baseUrl);
				const popup = page.locator('#popup');
				await expect
					.poll(() => popup.evaluate((element) => (element as HTMLElement).offsetHeight))
					.toBe(100);
				await expect
					.poll(() =>
						popup.evaluate((element) =>
							getComputedStyle(element).getPropertyValue('--drawer-frontmost-height'),
						),
					)
					.toBe('100px');
				await page.evaluate(() => {
					document.body.dataset.grow = '';
				});
				await expect
					.poll(() =>
						popup.evaluate((element) =>
							getComputedStyle(element).getPropertyValue('--drawer-frontmost-height'),
						),
					)
					.toBe('140px');
				await page.evaluate(
					() =>
						new Promise<void>((resolve) => {
							requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
						}),
				);
				expect(await popup.evaluate((element) => (element as HTMLElement).offsetHeight)).toBe(140);
				expect(await page.evaluate(() => window.drawerLayoutErrors)).toEqual([]);
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		});
	});
}
