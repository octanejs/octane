import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, '../browser/harness');
const packageSrc = resolve(testRoot, '../../src/index.tsrx');
const octaneSrc = resolve(testRoot, '../../../octane/src/index.ts');

function getFreePort(): Promise<number> {
	return new Promise(function resolvePort(resolvePortCb, reject) {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', function onListen() {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(function onClose() {
				resolvePortCb(port);
			});
		});
	});
}

let viteServer: ViteDevServer;
let browser: import('playwright').Browser;
let page: import('playwright').Page;

beforeAll(async function setupSnapDragConformance() {
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
				{ find: /^@octanejs\/vaul$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
	});
	await viteServer.listen();
	page = await browser.newPage({ viewport: { width: 800, height: 800 } });
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
}, 60_000);

afterAll(async function teardownSnapDragConformance() {
	await page?.close().catch(function ignore() {});
	await browser?.close().catch(function ignore() {});
	await viteServer?.close().catch(function ignore() {});
});

describe('vaul browser conformance', function vaulBrowserConformance() {
	// Octane-only snap-point contract: after cycling to the upper snap, a mid-drag
	// release stays open. Not paired to upstream base.spec.ts:49 (drag-down close).
	it('keeps a snap-point drawer open after a mid-drag release', async function midDragReleaseStaysOpen() {
		await page.getByRole('button', { name: 'Open drawer' }).click();
		const drawer = page.locator('[data-vaul-drawer]');
		await drawer.waitFor();
		await page.locator('[data-vaul-handle]').click();
		await page.waitForFunction(function advancedSnap() {
			return document.querySelector('#snap-point')?.textContent === '0.75';
		});
		await page.waitForTimeout(550);
		const box = await drawer.boundingBox();
		if (!box) throw new Error('drawer has no browser box');
		await page.mouse.move(box.x + box.width / 2, box.y + 30);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2, box.y + 140, { steps: 4 });
		expect(
			await drawer.evaluate(function isDragging(node) {
				return node.classList.contains('vaul-dragging');
			}),
		).toBe(true);
		await page.mouse.up();
		await expect
			.poll(function drawerState() {
				return page.locator('#drawer-state').textContent();
			})
			.toBe('open');
		expect(await page.locator('[data-vaul-drawer]').count()).toBe(1);
	});
});
