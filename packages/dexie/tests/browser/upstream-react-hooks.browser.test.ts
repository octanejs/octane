/**
 * Port of dexie-react-hooks@4.4.0 QUnit/Karma integration suite
 * (libs/dexie-react-hooks/test/index.ts) onto @octanejs/dexie.
 *
 * Runs in real Chromium via Playwright (real IndexedDB) — not jsdom/fake-indexeddb.
 */
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'harness');
const packageSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/index.ts');
const octaneSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../../octane/src/index.ts');

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

function compactText(value: string | null | undefined) {
	return value?.replace(/\s+/g, '') ?? value;
}

let viteServer: ViteDevServer;
let origin = '';
let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;
let page: import('playwright').Page;

async function waitTilEqual(
	read: () => Promise<string | null | undefined>,
	expected: string,
	label: string,
	timeoutMs = 10_000,
) {
	const compactExpected = compactText(expected)!;
	const deadline = Date.now() + timeoutMs;
	let last: string | null | undefined;
	while (Date.now() < deadline) {
		last = compactText(await read());
		if (Object.is(last, compactExpected)) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	expect(last, label).toEqual(compactExpected);
}

async function waitTilOk(read: () => Promise<boolean>, label: string, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await read()) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	expect(await read(), label).toBe(true);
}

async function dexieCall<T>(method: string, ...args: unknown[]): Promise<T> {
	return page.evaluate(
		([name, callArgs]) => {
			const api = (
				globalThis as typeof globalThis & {
					__dexieUpstream: Record<string, (...xs: unknown[]) => Promise<unknown>>;
				}
			).__dexieUpstream;
			return api[name]!(...callArgs) as Promise<T>;
		},
		[method, args] as const,
	);
}

beforeAll(async () => {
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/dexie browser] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}

	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { port, host: '127.0.0.1', strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/dexie$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
		optimizeDeps: {
			include: ['dexie'],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

beforeEach(async () => {
	page = await browser.newPage();
	page.on('pageerror', (error) => {
		// IndexedDB DataError for NaN keys is expected in the invalid-key scenario;
		// Octane's @catch boundary still renders. Ignore that specific noise.
		if (/Data provided to an operation does not meet requirements/.test(String(error))) return;
		console.error('[dexie-browser pageerror]', error);
	});
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!(globalThis as { __dexieUpstream?: unknown }).__dexieUpstream);
	await dexieCall('clear');
	// Reload so the suspending live-query module cache starts clean after clear.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!(globalThis as { __dexieUpstream?: unknown }).__dexieUpstream);
});

afterEach(async () => {
	await page.close().catch(() => {});
});

async function listText() {
	return page.evaluate(() => document.querySelector('ul#itemList')?.textContent ?? null);
}

async function currentText() {
	return page.evaluate(() => document.querySelector('div#current')?.textContent ?? null);
}

async function currentNotFoundText() {
	return page.evaluate(
		() => document.querySelector('div#current p.not-found-item')?.textContent ?? null,
	);
}

async function currentItemText(id: number) {
	return page.evaluate(
		(itemId) => document.querySelector(`div#current div#item-${itemId}`)?.textContent ?? null,
		id,
	);
}

async function currentHasItem(id: number) {
	return page.evaluate((itemId) => !!document.querySelector(`div#current div#item-${itemId}`), id);
}

describe('upstream dexie-react-hooks integration scenarios (Playwright)', () => {
	// Per dexie-react-hooks test/index.ts: List component is reacting to changes
	it('List component is reacting to changes', async () => {
		await waitTilEqual(listText, '', 'The list should be empty');

		await dexieCall('bulkPut', [
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);
		await waitTilEqual(
			listText,
			'ID: 1Name: HelloID: 2Name: World',
			'The list should be populated',
		);

		await dexieCall('delete', 2);
		await waitTilEqual(listText, 'ID: 1Name: Hello', 'The second item should have been removed');

		await dexieCall('update', 1, { name: 'Hola' });
		await waitTilEqual(listText, 'ID: 1Name: Hola', 'The first item should have been updated');
	});

	// Per dexie-react-hooks test/index.ts: ItemLoaderComponent is reacting to changes
	it('ItemLoaderComponent is reacting to changes', async () => {
		await waitTilEqual(
			currentNotFoundText,
			'NOT_FOUND: 1',
			'Before we add anything - the component should say NOT_FOUND: 1',
		);

		await dexieCall('put', { id: 1, name: 'Foo' });
		await waitTilEqual(
			() => currentItemText(1),
			'ID: 1Name: Foo',
			'Current item should have been rendered',
		);

		await dexieCall('update', 1, { name: 'Bar' });
		await waitTilEqual(
			() => currentItemText(1),
			'ID: 1Name: Bar',
			'Current item should have been updated',
		);

		await dexieCall('delete', 1);
		await waitTilOk(
			async () => !(await currentHasItem(1)),
			'Item 1 should not be in the DOM tree anymore',
		);
		expect(compactText(await currentNotFoundText())).toBe(compactText('NOT_FOUND: 1'));
	});

	// Per dexie-react-hooks test/index.ts: Clicking next button will update the currently viewed item
	it('Clicking next button will update the currently viewed item', async () => {
		await dexieCall('bulkPut', [
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);

		await waitTilEqual(currentText, 'Current itemID: 1Name: Hello', 'We are now viewing item 1');

		await page.locator('#btnNext').click();
		await waitTilEqual(currentText, 'Current itemID: 2Name: World', 'We are now viewing item 2');

		await page.locator('#btnFirst').click();
		await waitTilEqual(
			currentText,
			'Current itemID: 1Name: Hello',
			'We are now viewing item 1 again',
		);

		await dexieCall('update', 2, { name: 'Earth' });
		await page.locator('#btnNext').click();
		await waitTilEqual(
			currentText,
			'Current itemID: 2Name: Earth',
			'We are now viewing updated item 2',
		);
	});

	// Per dexie-react-hooks test/index.ts: Selecting invalid key trigger the err-boundrary
	it('Selecting invalid key triggers the error boundary', async () => {
		await dexieCall('bulkPut', [
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);

		await waitTilOk(async () => {
			const list = compactText(await listText());
			return list === compactText('ID: 1Name: HelloID: 2Name: World');
		}, "We have an initial setup with two items in the list: 'Hello' and 'World'");

		await page.locator('#btnInvalidKey').click();
		await waitTilOk(async () => {
			const text = await page.evaluate(() => document.body.textContent ?? '');
			return /Something went wrong/.test(text);
		}, 'The error boundary should be shown');

		await page.locator('#btnFirst').click();
		await page.locator('#btnRetry').click();
		await waitTilEqual(
			currentText,
			'Current itemID: 1Name: Hello',
			'We should be back to viewing item 1',
		);
	});
});
