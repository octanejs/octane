import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
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
let browser: import('playwright').Browser;
let page: import('playwright').Page;

beforeAll(async () => {
	const { chromium } = await import('playwright');
	browser = await chromium.launch({ headless: true });
	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { port, host: '127.0.0.1', strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/floating-ui$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
	});
	await viteServer.listen();
	page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
}, 60_000);

afterAll(async () => {
	await page?.close().catch(() => {});
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

describe('@octanejs/floating-ui real-browser positioning', () => {
	// @parity-case browser:floating-ui-real-layout
	it('uses real layout geometry and auto-updates after the reference moves', async () => {
		const floating = page.locator('#floating');
		await expect.poll(() => floating.getAttribute('data-positioned')).toBe('yes');
		const initial = await floating.boundingBox();
		expect(initial?.x).toBeCloseTo(40, 0);
		expect(initial?.y).toBeCloseTo(62, 0);
		await page.locator('#reference').evaluate((element) => {
			(element as HTMLElement).style.left = '180px';
			window.dispatchEvent(new Event('resize'));
		});
		await expect.poll(async () => (await floating.boundingBox())?.x).toBeCloseTo(180, 0);
	});
});
