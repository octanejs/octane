import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { browserName, launchBrowser } from '../../../../test-utils/playwright-browser.js';
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
				{ find: /^@octanejs\/popper$/, replacement: bindingSource },
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

async function runBrowserCase() {
	const browser = await launchBrowser({ headless: true });
	const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	try {
		await page.goto(origin, { waitUntil: 'networkidle' });
		await expect.poll(() => page.locator('#popper').getAttribute('data-placement')).toBe('top');
		await expect
			.poll(() =>
				page.locator('#popper').evaluate((element) => (element as HTMLElement).style.transform),
			)
			.toContain('translate');
		await expect
			.poll(() =>
				page.locator('#arrow').evaluate((element) => (element as HTMLElement).style.position),
			)
			.toBe('absolute');
		await expect.poll(() => page.locator('#virtual').getAttribute('data-placement')).toBe('right');
		await expect
			.poll(() =>
				page.locator('#virtual').evaluate((element) => (element as HTMLElement).style.transform),
			)
			.toContain('translate');

		await page.click('#toggle');
		await expect.poll(() => page.locator('#popper').getAttribute('data-placement')).toBe('bottom');
		await page.click('#update');
		await expect.poll(() => page.locator('#updates').textContent()).toBe('1');

		await page.click('#visible');
		await expect.poll(() => page.locator('#popper').count()).toBe(0);
		await page.click('#visible');
		await expect.poll(() => page.locator('#popper').getAttribute('data-placement')).toBe('bottom');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
		await browser.close();
	}
}

describe('@octanejs/popper real-browser parity', () => {
	// @parity-case browser:popper-selected
	it(
		`${browserName}: positions, updates, wires arrows/virtual refs, and cleans up`,
		() => runBrowserCase(),
		60_000,
	);
});
