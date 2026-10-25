import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let failures: string[] = [];

beforeAll(async () => {
	server = await createServer({
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-move-state'),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	const errors = failures.slice();
	try {
		await page?.close();
	} finally {
		page = undefined;
		failures = [];
	}
	expect(errors).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openCase(withoutMoveBefore: boolean): Promise<Page> {
	page = await browser.newPage();
	page.on('pageerror', (error) => failures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning')
			failures.push(`${message.type()}: ${message.text()}`);
	});
	if (withoutMoveBefore) {
		await page.addInitScript(() => {
			Object.defineProperty(Element.prototype, 'moveBefore', {
				configurable: true,
				value: undefined,
			});
		});
	}
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__moveState));
	return page;
}

const kinds = ['compiled', 'descriptor', 'binding'] as const;

describe.sequential('real-browser keyed moves', () => {
	it.each(kinds)(
		'keeps frames loaded, animations running, and popovers open across a %s reorder',
		async (kind) => {
			const current = await openCase(false);
			await current.evaluate((kind) => window.__moveState.mount(kind), kind);
			const placed = await current.evaluate(() => window.__moveState.reverse());

			expect(placed.map((row) => row.id)).toEqual([4, 3, 2, 1]);
			for (const row of placed) {
				expect(row).toMatchObject({
					sameArticle: true,
					frameMarker: row.id,
					sameAnimation: true,
					popoverOpen: true,
				});
				expect(row.animationTime).toBeGreaterThanOrEqual(50_000);
			}
		},
	);

	// Safari has no state-preserving move yet. The reorder must still place the
	// same rows; their frames, animations, and popovers reset as they did before.
	it.each(kinds)('reorders the same %s rows without moveBefore', async (kind) => {
		const current = await openCase(true);
		await current.evaluate((kind) => window.__moveState.mount(kind), kind);
		const placed = await current.evaluate(() => window.__moveState.reverse());

		expect(placed.map((row) => [row.id, row.sameArticle])).toEqual([
			[4, true],
			[3, true],
			[2, true],
			[1, true],
		]);
		expect(placed.some((row) => !row.popoverOpen)).toBe(true);
	});
});
