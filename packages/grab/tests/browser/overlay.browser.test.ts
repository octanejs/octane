/**
 * Octane-authored browser evidence for @octanejs/grab: boots the real package
 * (compiled .tsrx source through the Octane Vite plugin) in headless Chromium
 * against a static harness and drives the activation/selection/dispose
 * lifecycle with real pointer and keyboard input.
 */
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';

declare global {
	// eslint-disable-next-line no-var
	var __grab: import('../../src/types.js').ReactGrabAPI | undefined;
}

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'harness');
const packageSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/index.ts');
const octaneSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../../octane/src/index.ts');

const isMac = process.platform === 'darwin';
const modifier = isMac ? 'Meta' : 'Control';

// Hold the chord past keyHoldDuration (100ms) so the browser's real `copy`
// event marks holdTimerFired, and past MIN_HOLD_FOR_ACTIVATION_AFTER_COPY_MS
// (200ms) so the keyup release activates.
const KEYBOARD_HOLD_SETTLE_MS = 600;

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const srv = createNetServer();
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address() as import('node:net').AddressInfo;
			srv.close(() => resolvePort(port));
		});
	});
}

let viteServer: ViteDevServer;
let origin = '';
let browser: Browser;
let context: BrowserContext;
let page: Page;

async function grabCall<T>(expression: string): Promise<T> {
	return page.evaluate(`(() => { const api = globalThis.__grab; return (${expression}); })()`);
}

async function hostPresent(): Promise<boolean> {
	return page.evaluate(() => document.querySelector('[data-react-grab]') !== null);
}

async function isActive(): Promise<boolean> {
	return grabCall<boolean>('api.isActive()');
}

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
				{ find: /^@octanejs\/grab$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
		define: {
			'process.env.NODE_ENV': JSON.stringify('development'),
			'process.env.VERSION': JSON.stringify('0.2.0'),
			'process.env.IS_DEMO': JSON.stringify(''),
			'process.env.REACT_GRAB_SOURCE_LOCATIONS': JSON.stringify(''),
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 90_000);

afterAll(async () => {
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

beforeEach(async () => {
	// Upstream's playwright config grants clipboard permissions; the selection
	// flow performs a real clipboard write.
	context = await browser.newContext({
		permissions: ['clipboard-read', 'clipboard-write'],
	});
	page = await context.newPage();
	page.on('pageerror', (error) => {
		console.error('[grab-browser pageerror]', error);
	});
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!globalThis.__grab);
});

afterEach(async () => {
	await context?.close().catch(() => {});
});

describe('overlay mount lifecycle', () => {
	it('mounts the overlay host on init', async () => {
		await expect.poll(hostPresent).toBe(true);
	});

	it('reports an inactive, enabled initial state', async () => {
		expect(await isActive()).toBe(false);
		expect(await grabCall<boolean>('api.isEnabled()')).toBe(true);
	});
});

describe('keyboard activation', () => {
	// Upstream hold semantics: the keydown only starts the hold timer. The
	// browser fires a real `copy` event for the chord, which defers activation
	// to the keyup (holdTimerFired path); releasing the platform modifier then
	// deactivates the non-toggle-activated overlay.
	it('activates on chord release and deactivates on modifier release', async () => {
		await page.locator('body').click();
		await page.keyboard.down(modifier);
		await page.keyboard.down('c');
		await page.waitForTimeout(KEYBOARD_HOLD_SETTLE_MS);

		await page.keyboard.up('c');
		await page.waitForFunction(() => globalThis.__grab!.isActive());

		await page.keyboard.up(modifier);
		await page.waitForFunction(() => !globalThis.__grab!.isActive());
	});

	it('activate()/deactivate() drive the same state programmatically', async () => {
		await grabCall('api.activate()');
		expect(await isActive()).toBe(true);
		await grabCall('api.deactivate()');
		expect(await isActive()).toBe(false);
	});
});

describe('selection interaction', () => {
	it('copies the hovered element and reports label instances', async () => {
		await grabCall('api.activate()');
		const box = await page.locator('#target-a').boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.waitForFunction(
			() => globalThis.__grab!.getState().targetElement !== null,
			undefined,
			{ timeout: 10_000 },
		);
		await page.mouse.down();
		await page.mouse.up();
		await page.waitForFunction(
			() => globalThis.__grab!.getState().labelInstances.length > 0,
			undefined,
			{ timeout: 10_000 },
		);
	});

	it('suppresses activation while disabled', async () => {
		await grabCall('api.setEnabled(false)');
		await page.keyboard.down(modifier);
		await page.keyboard.down('c');
		await page.waitForTimeout(KEYBOARD_HOLD_SETTLE_MS);
		await page.keyboard.up('c');
		await page.keyboard.up(modifier);
		expect(await isActive()).toBe(false);
		await grabCall('api.setEnabled(true)');
	});
});

describe('dispose', () => {
	it('dispose() unmounts the renderer and clears the global api', async () => {
		await expect.poll(hostPresent).toBe(true);
		await grabCall('api.activate()');
		await grabCall('api.dispose()');
		await page.waitForFunction(
			() => (globalThis as { __REACT_GRAB__?: unknown }).__REACT_GRAB__ === undefined,
		);
	});
});
