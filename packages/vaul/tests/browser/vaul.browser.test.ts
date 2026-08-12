import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
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
let baseUrl: string;

beforeAll(async function setupBrowserLane() {
	const { chromium } = await import('playwright');
	browser = await chromium.launch({ headless: true });
	const port = await getFreePort();
	baseUrl = `http://127.0.0.1:${port}`;
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
}, 60_000);

afterAll(async function teardownBrowserLane() {
	await page?.close().catch(function ignore() {});
	await browser?.close().catch(function ignore() {});
	await viteServer?.close().catch(function ignore() {});
});

describe('vaul real-browser evidence', function vaulRealBrowserEvidence() {
	// Per upstream/test/tests/base.spec.ts:10 (should open drawer).
	// Per upstream/test/tests/base.spec.ts:27 (should close when `Drawer.Close` is clicked).
	it('preserves open/close, focus semantics, styling, and cleanup', async function openCloseFocusStylesCleanup() {
		await page.goto(baseUrl, { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Open drawer' }).click();
		const drawer = page.locator('[data-vaul-drawer]');
		await drawer.waitFor();
		await expect
			.poll(function focusInsideDrawer() {
				return drawer.evaluate(function containsActive(node) {
					return node.contains(document.activeElement);
				});
			})
			.toBe(true);
		await page.waitForFunction(function hasOpenHeight() {
			return document.querySelector('[data-vaul-drawer]')?.getAttribute('style')?.includes('600px');
		});
		expect(await page.locator('#drawer-state').textContent()).toBe('open');
		expect(await drawer.getAttribute('data-vaul-drawer-direction')).toBe('bottom');
		expect(await drawer.getAttribute('data-vaul-snap-points')).toBe('true');
		expect(await drawer.getAttribute('role')).toBe('dialog');
		expect(
			await drawer.evaluate(function position(node) {
				return getComputedStyle(node).position;
			}),
		).toBe('fixed');
		expect(
			await drawer.evaluate(function snapHeight(node) {
				return getComputedStyle(node).getPropertyValue('--snap-point-height');
			}),
		).toBe('600px');

		await page.getByRole('button', { name: 'Close drawer' }).click();
		await page.waitForFunction(function isClosed() {
			return document.querySelector('#drawer-state')?.textContent === 'closed';
		});
		expect(await page.locator('[data-vaul-drawer]').count()).toBe(1);
		await page.waitForTimeout(550);
		expect(await page.locator('[data-vaul-drawer]').count()).toBe(0);
		await expect
			.poll(function triggerFocused() {
				return page.getByRole('button', { name: 'Open drawer' }).evaluate(function isActive(node) {
					return node === document.activeElement;
				});
			})
			.toBe(true);
	});

	// Per upstream/test/tests/initial-snap.spec.ts:24 (should be open and snapped on initial load).
	it('is open and snapped on initial load at the pinned active snap index', async function initialSnapLoad() {
		await page.goto(`${baseUrl}/?fixture=initial-snap`, { waitUntil: 'networkidle' });
		const drawer = page.locator('[data-vaul-drawer]');
		await drawer.waitFor();
		await page.waitForFunction(function hasInitialSnapIndex() {
			return document.querySelector('#active-snap-index')?.textContent === '1';
		});
		expect(await page.locator('#drawer-state').textContent()).toBe('open');
		expect(await page.locator('#snap-point').textContent()).toBe('148px');
		expect(await page.locator('#active-snap-index').textContent()).toBe('1');
		expect(
			await drawer.evaluate(function snapHeight(node) {
				return getComputedStyle(node).getPropertyValue('--snap-point-height');
			}),
		).toBe('652px');
	});

	// Per upstream/test/tests/with-handle.spec.ts:9 (click should cycle to the next snap point).
	it('cycles to the next snap point when the handle is clicked', async function handleCyclesSnap() {
		await page.goto(`${baseUrl}/?fixture=with-handle`, { waitUntil: 'networkidle' });
		const drawer = page.locator('[data-vaul-drawer]');
		await drawer.waitFor();
		await page.waitForFunction(function hasHandleSnapIndex() {
			return document.querySelector('#active-snap-index')?.textContent === '0';
		});
		expect(await page.locator('#drawer-state').textContent()).toBe('open');
		expect(await page.locator('#snap-point').textContent()).toBe('148px');
		expect(await page.locator('#active-snap-index').textContent()).toBe('0');

		await page.locator('[data-vaul-handle]').click();
		await page.waitForFunction(function advancedSnap() {
			return document.querySelector('#active-snap-index')?.textContent === '1';
		});
		expect(await page.locator('#snap-point').textContent()).toBe('355px');
		expect(
			await drawer.evaluate(function snapHeight(node) {
				return getComputedStyle(node).getPropertyValue('--snap-point-height');
			}),
		).toBe('445px');
	});
});
