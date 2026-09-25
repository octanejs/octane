import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));

function getFreePort(): Promise<number> {
	const { promise, resolve: resolvePort, reject } = Promise.withResolvers<number>();
	const server = createNetServer();
	server.once('error', reject);
	server.listen(0, '127.0.0.1', () => {
		const { port } = server.address() as AddressInfo;
		server.close(() => resolvePort(port));
	});
	return promise;
}

// The harness exposes its editor on `window` for document assertions.
type HarnessWindow = {
	editor: {
		document: { type: string }[];
		focus(): void;
		removeBlocks(blocks: unknown[]): void;
		setTextCursorPosition(block: unknown, placement: 'end'): void;
	};
};

// Keyboard End is platform-dependent in headless Chromium, so place the caret through the editor.
const caretAtEndOf = (index: number) =>
	page.evaluate((blockIndex) => {
		const { editor } = window as unknown as HarnessWindow;
		editor.setTextCursorPosition(editor.document[blockIndex], 'end');
		editor.focus();
	}, index);

let viteServer: ViteDevServer;
let browser: Browser;
let page: Page;
let origin = '';
let pageErrors: string[] = [];

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
	const port = await getFreePort();
	viteServer = await createServer({
		root: resolve(testRoot, 'harness'),
		logLevel: 'error',
		server: { host: '127.0.0.1', port, strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/blocknote$/, replacement: resolve(testRoot, '../../src/index.ts') },
				{ find: /^octane$/, replacement: resolve(testRoot, '../../../octane/src/index.ts') },
			],
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
	pageErrors = [];
	page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
	page.on('pageerror', (error) => pageErrors.push(String(error)));
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.locator('[data-ready="true"] .bn-editor').waitFor();
});

afterEach(async () => {
	try {
		expect(pageErrors, 'browser page errors').toEqual([]);
	} finally {
		await page.close();
	}
});

const blockTypes = () =>
	page.evaluate(() =>
		(window as unknown as HarnessWindow).editor.document.map((block) => block.type),
	);

it('accepts typed text in the mounted editor', async () => {
	await caretAtEndOf(0);
	await page.keyboard.type(' typed');
	await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('Start typed');
});

it('runs the README slash menu recipe', async () => {
	await caretAtEndOf(0);
	await page.keyboard.press('Enter');
	await page.keyboard.type('/head');

	const menu = page.locator('.slash-menu');
	await menu.waitFor();
	await expect.poll(() => menu.locator('li').allTextContents()).toContain('Heading 1');

	await menu.getByText('Heading 1', { exact: true }).click();
	await expect.poll(() => menu.count()).toBe(0);
	await expect.poll(blockTypes).toEqual(['paragraph', 'heading', 'callout']);

	await page.keyboard.type('Title');
	await expect.poll(() => page.locator('h1').textContent()).toBe('Title');
});

it('runs the README custom block recipe', async () => {
	await expect.poll(() => page.locator('.callout .callout-icon').textContent()).toBe('🔥');

	await caretAtEndOf(1);
	await page.keyboard.type('!');
	await expect.poll(() => page.locator('.callout').textContent()).toContain('Callout text!');

	await page.evaluate(() => {
		const { editor } = window as unknown as HarnessWindow;
		editor.removeBlocks([editor.document[1]]);
	});
	await expect.poll(() => page.locator('.callout').count()).toBe(0);
});
