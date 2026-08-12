import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const browserRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(browserRoot, 'harness');
const packageSource = resolve(browserRoot, '../../src/index.ts');
const octaneSource = resolve(browserRoot, '../../../octane/src/index.ts');

let server: ViteDevServer;
let browser: import('playwright').Browser;
let origin: string;

beforeAll(async () => {
	try {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/embla-carousel browser] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
	server = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0 },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/embla-carousel$/, replacement: packageSource },
				{ find: /^octane$/, replacement: octaneSource },
			],
		},
		optimizeDeps: { include: ['embla-carousel', 'embla-carousel-reactive-utils'] },
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port');
	const { port } = address;
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await browser?.close().catch(() => {});
	await server?.close().catch(() => {});
});

describe('@octanejs/embla-carousel real-browser behavior', () => {
	// @parity-case embla:browser:layout-scroll-cleanup
	it('uses real layout to scroll and destroys the instance on root cleanup', async () => {
		const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			try {
				await page.locator('[data-carousel-ready]').waitFor({ timeout: 2_000 });
			} catch {
				throw new Error(`Harness failed: ${JSON.stringify(errors)} ${await page.content()}`);
			}
			try {
				await page.locator('[data-carousel-ready="true"]').waitFor({ timeout: 2_000 });
			} catch {
				throw new Error(
					`Carousel stayed pending: ${JSON.stringify(errors)} ${await page.content()}`,
				);
			}
			const viewportWidth = await page
				.locator('[data-carousel-viewport]')
				.evaluate((element) => element.getBoundingClientRect().width);
			const before = await page
				.locator('[data-carousel-container]')
				.evaluate((element) => getComputedStyle(element).transform);
			expect(viewportWidth).toBeGreaterThan(0);
			expect(await page.locator('[data-selected]').textContent()).toBe('0');

			await page.getByRole('button', { name: 'Next slide' }).click();
			await expect.poll(() => page.locator('[data-selected]').textContent()).toBe('1');
			const after = await page
				.locator('[data-carousel-container]')
				.evaluate((element) => getComputedStyle(element).transform);
			expect(after).not.toBe(before);

			await page.getByRole('button', { name: 'Unmount carousel' }).click();
			await expect.poll(() => page.locator('[data-carousel-destroyed]').textContent()).toBe('true');
			expect(await page.locator('#root').textContent()).toBe('');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
