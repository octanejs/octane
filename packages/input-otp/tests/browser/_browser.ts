import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
const bindingSource = resolve(testRoot, '../../src/index.ts');
const octaneSource = resolve(testRoot, '../../../octane/src/index.ts');
let viteServer: ViteDevServer;
let browser: import('playwright').Browser;
let context: import('playwright').BrowserContext;
let pageErrors: string[] = [];
let origin = '';
export let page: import('playwright').Page;

export async function goto(path: string): Promise<void> {
	await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
	await page.locator('[data-ready="true"]').waitFor({ state: 'attached', timeout: 5_000 });
}

export async function expectSelection(
	input: Locator,
	expected: readonly [number, number],
): Promise<void> {
	const activeSlots =
		expected[0] === expected[1]
			? [expected[0]]
			: Array.from({ length: expected[1] - expected[0] }, (_, index) => expected[0] + index);
	await expect
		.poll(async () => {
			const [selection, renderedActiveSlots] = await Promise.all([
				input.evaluate((node) => [node.selectionStart, node.selectionEnd]),
				page
					.locator('[data-testid^="slot-"]')
					.evaluateAll((slots) =>
						slots.flatMap((slot, index) =>
							slot.getAttribute('data-test-is-active') === 'true' ? [index] : [],
						),
					),
			]);
			return [...selection, renderedActiveSlots];
		})
		.toEqual([...expected, activeSlots]);
}

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

export function setupBrowser(path = '/base'): void {
	beforeAll(async () => {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
		const port = await getFreePort();
		viteServer = await createServer({
			root: harnessRoot,
			logLevel: 'error',
			server: { host: '127.0.0.1', port, strictPort: true },
			plugins: [octane()],
			resolve: {
				alias: [
					{ find: /^@octanejs\/input-otp$/, replacement: bindingSource },
					{ find: /^octane$/, replacement: octaneSource },
				],
			},
		});
		await viteServer.listen();
		origin = `http://127.0.0.1:${port}`;
	}, 60_000);
	beforeEach(async () => {
		pageErrors = [];
		context = await browser.newContext({ viewport: { width: 900, height: 700 } });
		page = await context.newPage();
		page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
		await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
		await page.locator('[data-ready="true"]').waitFor({ state: 'attached', timeout: 5_000 });
	});
	afterEach(async () => {
		try {
			expect(pageErrors).toEqual([]);
		} finally {
			await context.close();
		}
	});
	afterAll(async () => {
		await browser?.close().catch(() => {});
		await viteServer?.close().catch(() => {});
	});
}
