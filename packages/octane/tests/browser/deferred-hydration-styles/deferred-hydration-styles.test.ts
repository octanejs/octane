import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { build, createServer, preview, type InlineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

describe.sequential('scoped styles in production split hydration builds', () => {
	for (const dev of [false, true]) {
		it(`styles the adopted split child with mutable parser ASTs (dev=${dev})`, async () => {
			const scratch = await mkdtemp(join(tmpdir(), 'octane-deferred-styles-'));
			const config: InlineConfig = {
				root: HERE,
				configFile: false,
				logLevel: 'error',
				plugins: [octane({ hmr: dev })],
				define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
				build: { outDir: join(scratch, 'dist'), emptyOutDir: false },
				preview: { host: '127.0.0.1', port: 0 },
			};
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			process.env.OCTANE_COMPILE_FROZEN_AST = '0';
			let html: string;
			try {
				const server = await createServer({
					...config,
					server: { middlewareMode: true },
				});
				try {
					const serverModule = await server.ssrLoadModule('/server.ts');
					html = serverModule.render();
				} finally {
					await server.close();
				}
				await build(config);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
			const server = await preview(config);
			const page = await browser.newPage();
			const failures: string[] = [];
			page.on('pageerror', (error) => failures.push(error.message));
			try {
				const address = server.httpServer.address();
				if (!address || typeof address === 'string') throw new Error('Missing preview port');
				await page.goto(`http://127.0.0.1:${address.port}`);
				await page.waitForFunction(() => Boolean(window.__deferredStyle));
				await page.evaluate((markup) => window.__deferredStyle.hydrate(markup), html);
				const input = page.getByRole('textbox', { name: 'Draft' });
				const button = page.getByRole('button', { name: 'Styled deferred widget' });
				await input.fill('edited before activation');
				expect(await page.evaluate(() => window.__deferredStyle.read().hydrated)).toBe(0);
				await page.evaluate(() => window.__deferredStyle.activate());
				await page.waitForFunction(() => window.__deferredStyle.read().hydrated === 1);
				expect(await button.evaluate((element) => getComputedStyle(element).color)).toBe(
					'rgb(20, 120, 80)',
				);
				expect(
					await button.locator('span').evaluate((element) => getComputedStyle(element).fontWeight),
				).toBe('700');
				expect(
					await page
						.locator('[data-outside]')
						.evaluate((element) => getComputedStyle(element).color),
				).not.toBe('rgb(20, 120, 80)');
				expect(await input.inputValue()).toBe('edited before activation');
				await button.click();
				expect(await page.evaluate(() => window.__deferredStyle.read())).toEqual({
					hydrated: 1,
					clicked: 1,
					inputSurvived: true,
					buttonSurvived: true,
				});
				expect(failures).toEqual([]);
			} finally {
				await page.close();
				await new Promise<void>((resolve, reject) =>
					server.httpServer.close((error) => (error ? reject(error) : resolve())),
				);
				await rm(scratch, { recursive: true, force: true });
			}
		});
	}
});
