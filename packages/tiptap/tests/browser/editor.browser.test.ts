import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import { octane } from '../../../octane/src/compiler/vite.js';

const browserTestRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(browserTestRoot, 'harness');
const tiptapSource = resolve(browserTestRoot, '../../src/index.ts');
const tiptapMenusSource = resolve(browserTestRoot, '../../src/menus/index.ts');
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
let browser: import('playwright').Browser;
let page: import('playwright').Page;
let origin = '';
let pageErrors: string[] = [];

beforeAll(async () => {
	try {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/tiptap browser] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}

	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: {
			host: '127.0.0.1',
			port,
			strictPort: true,
		},
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/tiptap\/menus$/, replacement: tiptapMenusSource },
				{ find: /^@octanejs\/tiptap$/, replacement: tiptapSource },
				{ find: /^octane$/, replacement: octaneSource },
			],
		},
		optimizeDeps: {
			exclude: ['@tiptap/core', '@tiptap/pm'],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await page?.close().catch(() => {});
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

beforeEach(async () => {
	pageErrors = [];
	page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
	page.on('pageerror', (error) => pageErrors.push(String(error)));
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.locator('[data-editor-ready="true"] .ProseMirror').waitFor();
});

afterEach(async () => {
	try {
		expect(pageErrors, 'browser page errors').toEqual([]);
	} finally {
		await page.close();
	}
});

async function readSelection() {
	return page.evaluate(() => {
		const editor = document.querySelector('.ProseMirror');
		const selection = window.getSelection();
		const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		return {
			activeInsideEditor:
				editor?.contains(document.activeElement) || document.activeElement === editor,
			collapsed: selection?.isCollapsed ?? false,
			insideEditor:
				!!range &&
				!!editor &&
				editor.contains(range.startContainer) &&
				editor.contains(range.endContainer),
			text: selection?.toString() ?? '',
		};
	});
}

async function readMenuGeometry(kind: 'bubble' | 'floating') {
	return page.locator(`[data-browser-menu="${kind}"]`).evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			left: style.left,
			top: style.top,
			position: style.position,
			visibility: style.visibility,
		};
	});
}

describe('@octanejs/tiptap real-browser behavior', () => {
	it('keeps a live caret while typing updates editor content', async () => {
		const paragraph = page.locator('.ProseMirror > p').first();
		await paragraph.click();
		await page.keyboard.press('End');
		await page.keyboard.type('!');

		await expect.poll(() => paragraph.textContent()).toBe('Select this text and keep typing!');
		expect(await readSelection()).toEqual({
			activeInsideEditor: true,
			collapsed: true,
			insideEditor: true,
			text: '',
		});

		await page.keyboard.type('?');
		await expect.poll(() => paragraph.textContent()).toBe('Select this text and keep typing!?');
	});

	it('shows and positions BubbleMenu from a real text selection', async () => {
		const paragraph = page.locator('.ProseMirror > p').first();
		const bounds = await paragraph.boundingBox();
		if (!bounds) {
			throw new Error('The selectable paragraph has no browser bounds.');
		}

		await page.mouse.move(bounds.x + 8, bounds.y + bounds.height / 2);
		await page.mouse.down();
		await page.mouse.move(bounds.x + 145, bounds.y + bounds.height / 2, { steps: 8 });
		await page.mouse.up();

		await expect.poll(async () => (await readSelection()).text.length).toBeGreaterThan(0);
		const bubbleMenu = page.locator('[data-browser-menu="bubble"]');
		await bubbleMenu.waitFor({ state: 'visible' });

		const geometry = await readMenuGeometry('bubble');
		expect(geometry.visibility).toBe('visible');
		expect(geometry.position).toBe('absolute');
		expect(geometry.left).not.toBe('auto');
		expect(geometry.top).not.toBe('auto');
		expect(geometry.x).toBeGreaterThan(0);
		expect(geometry.y).toBeGreaterThan(0);
		expect(geometry.width).toBeGreaterThan(0);
		expect(geometry.height).toBeGreaterThan(0);

		const selectionRect = await page.evaluate(() =>
			window.getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON(),
		);
		expect(selectionRect.width).toBeGreaterThan(0);
		expect(
			Math.abs(geometry.x + geometry.width / 2 - (selectionRect.x + selectionRect.width / 2)),
		).toBeLessThan(160);
		expect(Math.abs(geometry.y - selectionRect.y)).toBeLessThan(100);
	});

	it('shows and positions FloatingMenu beside an empty paragraph', async () => {
		const emptyParagraph = page.locator('.ProseMirror > p').nth(1);
		await emptyParagraph.click();

		await expect.poll(async () => (await readSelection()).collapsed).toBe(true);
		await expect.poll(() => emptyParagraph.textContent()).toBe('');
		const floatingMenu = page.locator('[data-browser-menu="floating"]');
		await floatingMenu.waitFor({ state: 'visible' });

		const geometry = await readMenuGeometry('floating');
		expect(geometry.visibility).toBe('visible');
		expect(geometry.position).toBe('absolute');
		expect(geometry.left).not.toBe('auto');
		expect(geometry.top).not.toBe('auto');
		expect(geometry.x).toBeGreaterThan(0);
		expect(geometry.y).toBeGreaterThan(0);
		expect(geometry.width).toBeGreaterThan(0);
		expect(geometry.height).toBeGreaterThan(0);

		const paragraphRect = await emptyParagraph.evaluate((element) =>
			element.getBoundingClientRect().toJSON(),
		);
		expect(Math.abs(geometry.y - paragraphRect.y)).toBeLessThan(100);
		// The collapsed selection sits at the paragraph's leading edge. Floating UI
		// positions from that caret rectangle, rather than the text block's far edge.
		expect(Math.abs(geometry.x - paragraphRect.x)).toBeLessThan(160);
	});

	it('delivers a NodeView drag handle payload through the native browser drag flow', async () => {
		const source = page.locator('[data-card-label="first card"] [data-drag-handle]');
		const dropTarget = page.locator('#drop-target');

		await source.dragTo(dropTarget);

		await expect
			.poll(() => page.locator('#drop-result').textContent())
			.toBe('First draggable card');
		const transferTypes = (await page.locator('#drop-result').getAttribute('data-transfer-types'))
			?.split(',')
			.filter(Boolean);
		expect(transferTypes).toEqual(expect.arrayContaining(['text/html', 'text/plain']));
		expect(await page.locator('[data-card-label="first card"] .card-content').textContent()).toBe(
			'First draggable card',
		);
	});
});
