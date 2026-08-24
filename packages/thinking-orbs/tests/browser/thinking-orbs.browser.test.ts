import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

const browserTestRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(browserTestRoot, 'harness');
const thinkingOrbsSource = resolve(browserTestRoot, '../../src/index.ts');
const octaneSource = resolve(browserTestRoot, '../../../octane/src/index.ts');

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

async function snapshot(page: Page): Promise<string> {
	return page
		.locator('[data-testid="orb"]')
		.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

let viteServer: ViteDevServer;
let origin = '';

beforeAll(async () => {
	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { host: '127.0.0.1', port, strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/thinking-orbs$/, replacement: thinkingOrbsSource },
				{ find: /^octane$/, replacement: octaneSource },
			],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await viteServer?.close().catch(() => {});
});

describe('@octanejs/thinking-orbs real-browser behavior', () => {
	// @parity-case browser:thinking-orbs-animation-theme
	it('chromium: animates, pauses, and follows live ancestor theme changes', async () => {
		const browser = await launchBrowser({ headless: true });
		const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			const canvas = page.locator('[data-testid="orb"]');
			await expect.poll(() => canvas.count()).toBe(1);
			expect(await canvas.getAttribute('role')).toBe('img');
			expect(await canvas.getAttribute('aria-label')).toBe('Connecting…');
			expect(
				await canvas.evaluate((element) => ({
					width: (element as HTMLCanvasElement).width,
					height: (element as HTMLCanvasElement).height,
				})),
			).toEqual({ width: 64, height: 64 });

			const movingFrame = await snapshot(page);
			await expect.poll(() => snapshot(page)).not.toBe(movingFrame);

			await page.click('#toggle-paused');
			await expect.poll(() => page.locator('#paused').textContent()).toBe('true');
			await page.waitForTimeout(80);
			const pausedFrame = await snapshot(page);
			await page.waitForTimeout(80);
			expect(await snapshot(page)).toBe(pausedFrame);

			await page.click('#toggle-theme');
			await expect.poll(() => page.locator('#dark').textContent()).toBe('true');
			await expect.poll(() => snapshot(page)).not.toBe(pausedFrame);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
