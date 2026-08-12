import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'harness');
const packageSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/index.ts');
const octaneSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../../octane/src/index.ts');

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

let viteServer: ViteDevServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { port, host: '127.0.0.1', strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/day-picker$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
	});
	await viteServer.listen();
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
}, 60_000);

afterAll(async () => {
	await page?.close().catch(() => {});
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

describe('react-day-picker real-browser evidence', () => {
	it('preserves styled layout, selection, focus movement, navigation, and animation cleanup', async () => {
		const day = (label: string) =>
			page.getByRole('button', { name: new RegExp(` ${label}(st|nd|rd|th),`) });
		await page.getByRole('grid').waitFor();
		expect(
			await page
				.locator('.rdp-root')
				.evaluate((node) => getComputedStyle(node).getPropertyValue('--rdp-day-width')),
		).not.toBe('');

		await day('15').click();
		expect(await page.locator('#selected-date').textContent()).toBe('2026-08-15');

		await day('15').focus();
		await page.locator('[data-day="2026-08-15"][data-focused]').waitFor();
		await page.keyboard.press('ArrowRight');
		await page.locator('[data-day="2026-08-16"][data-focused]').waitFor();
		await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('16');

		await page.getByRole('button', { name: /Next Month/i }).click();
		await page.getByText('September 2026').waitFor();
		expect(await page.locator('[data-animated-month]').count()).toBeGreaterThan(0);
		await page.locator('[data-animated-caption]').last().dispatchEvent('animationend');
		await page.waitForTimeout(0);
		expect(await page.getByText('September 2026').count()).toBe(1);
	});
});
