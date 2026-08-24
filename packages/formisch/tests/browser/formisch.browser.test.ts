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
				{ find: /^@octanejs\/formisch$/, replacement: bindingSource },
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

describe('@octanejs/formisch real-browser behavior', () => {
	// @parity-case browser:formisch-native-lifecycle
	it('chromium: handles native input, validation, and submission', async () => {
		const browser = await launchBrowser({ headless: true });
		const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			const input = page.getByLabel('Email');
			await input.fill('person@example.com');
			await expect.poll(() => page.locator('#dirty').textContent()).toBe('dirty');
			await page.getByRole('button', { name: 'Submit' }).click();
			await expect.poll(() => page.locator('#submitted').textContent()).toBe('person@example.com');
			expect(await page.locator('#error').textContent()).toBe('ok');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
