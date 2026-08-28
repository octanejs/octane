import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
const bindingSource = resolve(testRoot, '../../src/index.tsrx');
const octaneSource = resolve(testRoot, '../../../octane/src/index.ts');

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
let context: import('playwright').BrowserContext;
let page: import('playwright').Page;
let origin = '';
let pageErrors: string[] = [];

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
				{ find: /^@octanejs\/resizable-panels$/, replacement: bindingSource },
				{ find: /^octane$/, replacement: octaneSource },
			],
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
	context = await browser.newContext({ viewport: { width: 900, height: 700 } });
	page = await context.newPage();
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.locator('[data-ready="true"]').waitFor();
});

afterEach(async () => {
	try {
		expect(pageErrors).toEqual([]);
	} finally {
		await context.close();
	}
});

async function widths(groupId = 'primary') {
	return page.evaluate((id) => {
		const group = document.querySelector(`#${id}`)!;
		const panels = [...group.querySelectorAll<HTMLElement>('[data-panel]')];
		return panels.map((panel) => panel.getBoundingClientRect().width);
	}, groupId);
}

describe('@octanejs/resizable-panels real Chromium behavior', () => {
	it('drags a geometry-derived pointer hit region', async () => {
		const separator = await page.locator('#primary-separator').boundingBox();
		if (!separator) throw new Error('separator has no bounds');
		const before = await widths();
		await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2);
		await page.mouse.down();
		await page.mouse.move(separator.x + 90, separator.y + separator.height / 2, { steps: 6 });
		await page.mouse.up();
		const after = await widths();
		expect(after[0]).toBeGreaterThan(before[0] + 60);
		expect(after[1]).toBeLessThan(before[1] - 60);
	});

	it('supports keyboard focus and updates splitter ARIA', async () => {
		const separator = page.locator('#primary-separator');
		await separator.focus();
		const before = Number(await separator.getAttribute('aria-valuenow'));
		await page.keyboard.press('ArrowRight');
		const after = Number(await separator.getAttribute('aria-valuenow'));
		expect(await separator.evaluate((element) => element === document.activeElement)).toBe(true);
		expect(await separator.getAttribute('role')).toBe('separator');
		expect(after).toBeGreaterThan(before);
	});

	it('revalidates percentages through a real ResizeObserver', async () => {
		await page.locator('#primary').evaluate((element) => {
			(element as HTMLElement).style.width = '400px';
		});
		await expect
			.poll(async () => {
				const [left, right] = await widths();
				const availableWidth = left + right;
				return (
					Math.abs(availableWidth - 392) < 0.01 && Math.abs(left / availableWidth - 0.4) < 0.001
				);
			})
			.toBe(true);
	});

	it('installs and cleans up document cursor state', async () => {
		const separator = await page.locator('#primary-separator').boundingBox();
		if (!separator) throw new Error('separator has no bounds');
		await page.mouse.move(separator.x + 2, separator.y + separator.height / 2);
		expect(
			await page.locator('body').evaluate((element) => getComputedStyle(element).cursor),
		).toContain('resize');
		await page.mouse.move(850, 650);
		expect(await page.locator('body').evaluate((element) => getComputedStyle(element).cursor)).toBe(
			'auto',
		);
	});

	it('isolates sibling group layout state', async () => {
		const siblingBefore = await widths('sibling');
		const separator = await page.locator('#primary-separator').boundingBox();
		if (!separator) throw new Error('separator has no bounds');
		await page.mouse.move(separator.x + 2, separator.y + separator.height / 2);
		await page.mouse.down();
		await page.mouse.move(separator.x + 70, separator.y + separator.height / 2);
		await page.mouse.up();
		expect(await widths('sibling')).toEqual(siblingBefore);
	});

	it('restores a user layout after a full page reload', async () => {
		const separator = await page.locator('#primary-separator').boundingBox();
		if (!separator) throw new Error('separator has no bounds');
		await page.mouse.move(separator.x + 2, separator.y + separator.height / 2);
		await page.mouse.down();
		await page.mouse.move(separator.x + 110, separator.y + separator.height / 2);
		await page.mouse.up();
		const saved = await widths();
		await page.reload({ waitUntil: 'networkidle' });
		await page.locator('[data-ready="true"]').waitFor();
		await expect.poll(() => widths()).toEqual(saved);
	});
});
