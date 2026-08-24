import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

const browserTestRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(browserTestRoot, 'harness');
const bindingSource = resolve(browserTestRoot, '../../src/index.ts');
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
				{ find: /^@octanejs\/boneyard$/, replacement: bindingSource },
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

describe('@octanejs/boneyard real-browser behavior', () => {
	// @parity-case browser:boneyard-responsive-theme
	it('chromium: responds to container size and ancestor dark mode', async () => {
		const browser = await launchBrowser({ headless: true });
		const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			const skeleton = page.locator('[data-boneyard]');
			const bone = page.locator('[data-boneyard-bone]');
			await expect.poll(() => skeleton.count()).toBe(1);
			await expect
				.poll(() => skeleton.evaluate((element) => getComputedStyle(element).height))
				.toBe('90px');

			await page.click('#toggle-width');
			await expect
				.poll(() => skeleton.evaluate((element) => getComputedStyle(element).height))
				.toBe('180px');

			await page.click('#toggle-theme');
			await expect
				.poll(() => bone.evaluate((element) => getComputedStyle(element).backgroundColor))
				.toBe('rgb(20, 20, 20)');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
