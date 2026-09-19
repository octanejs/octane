import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { build, preview, type InlineConfig } from 'vite';
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

describe.sequential('writable text controls preserve native editing history', () => {
	for (const dev of [false, true]) {
		describe(`dev=${dev}`, () => {
			let close: () => Promise<void>;
			let scratch: string;
			let origin: string;

			beforeAll(async () => {
				scratch = await mkdtemp(join(tmpdir(), 'octane-native-text-history-'));
				const config: InlineConfig = {
					root: HERE,
					configFile: false,
					logLevel: 'error',
					plugins: [octane({ hmr: dev })],
					define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
					build: { outDir: join(scratch, 'dist'), emptyOutDir: false },
					preview: { host: '127.0.0.1', port: 0 },
				};
				await build(config);
				const server = await preview(config);
				close = () =>
					new Promise((resolve, reject) =>
						server.httpServer.close((error) => (error ? reject(error) : resolve())),
					);
				const address = server.httpServer.address();
				if (!address || typeof address === 'string') throw new Error('Missing preview port');
				origin = `http://127.0.0.1:${address.port}`;
			});
			afterAll(async () => {
				await close?.();
				if (scratch) await rm(scratch, { recursive: true, force: true });
			});

			it.each(
				(['input', 'textarea'] as const).flatMap((tag) =>
					[false, true].map((spread) => ({ tag, spread })),
				),
			)('undoes and redoes accepted typing ($tag, spread=$spread)', async ({ tag, spread }) => {
				const page = await browser.newPage();
				const failures: string[] = [];
				page.on('pageerror', (error) => failures.push(error.message));
				try {
					await page.goto(origin);
					await page.waitForFunction(() => Boolean(window.__nativeTextHistory));
					await page.evaluate(({ tag, spread }) => window.__nativeTextHistory.mount(tag, spread), {
						tag,
						spread,
					});
					const input = page.getByRole('textbox', { name: 'Draft' });
					await input.focus();
					await page.keyboard.press('End');
					await page.keyboard.type(' cold edit');
					expect(await input.inputValue()).toBe('Native baseline cold edit');
					expect(await page.evaluate(() => window.__nativeTextHistory.read$())).toBe(
						'Native baseline cold edit',
					);
					await page.keyboard.press('ControlOrMeta+z');
					expect(await input.inputValue()).toBe('Native baseline');
					expect(await page.evaluate(() => window.__nativeTextHistory.read$())).toBe(
						'Native baseline',
					);
					await page.keyboard.press('ControlOrMeta+Shift+z');
					expect(await input.inputValue()).toBe('Native baseline cold edit');
					await page.evaluate(() => window.__nativeTextHistory.set('Programmatic replacement'));
					expect(await input.inputValue()).toBe('Programmatic replacement');
					expect(await input.evaluate((el) => (el as HTMLInputElement).defaultValue)).toBe(
						'Programmatic replacement',
					);
					expect(failures).toEqual([]);
				} finally {
					await page.close();
				}
			});
		});
	}
});
