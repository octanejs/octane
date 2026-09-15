import { createServer as createNetServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';

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
		plugins: [
			{
				name: 'resizable-layout-hydration',
				configureServer(server) {
					server.middlewares.use(async (request, response, next) => {
						if (request.url?.split('?')[0] !== '/layout') return next();
						try {
							const cookie = request.headers.cookie
								?.split('; ')
								.find((value) => value.startsWith('rrp-layout='));
							const storedLayout = cookie
								? JSON.parse(decodeURIComponent(cookie.slice('rrp-layout='.length)))
								: { 'layout-left': 40, 'layout-right': 60 };
							const left = storedLayout['layout-left'];
							const right = storedLayout['layout-right'];
							if (
								typeof left !== 'number' ||
								typeof right !== 'number' ||
								!Number.isFinite(left) ||
								!Number.isFinite(right) ||
								left < 0 ||
								right < 0 ||
								Math.abs(left + right - 100) > 0.01
							)
								throw new Error('Invalid persisted layout');
							const initialLayout = { 'layout-left': left, 'layout-right': right };
							const props = { initialLayout };
							const ssr = request.url?.includes('ssr=1');
							const rendered = ssr
								? await renderHydrationFixture(
										'react-resizable-panels',
										'packages/resizable-panels/tests/_fixtures/layout-hydration.tsrx',
										'LayoutHydrationFixture',
										props,
									)
								: { html: '' };
							const template = await readFile(resolve(harnessRoot, 'index.html'), 'utf8');
							const html = template
								.replace(
									'<div id="root"></div>',
									`<div id="root" data-props='${JSON.stringify(props)}'>${rendered.html}</div>`,
								)
								.replace('/main.tsrx', '/layout.tsrx');
							response.setHeader('Content-Type', 'text/html');
							response.end(await server.transformIndexHtml('/layout', html));
						} catch (error) {
							next(error);
						}
					});
				},
			},
			octane(),
		],
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
	for (const ssr of [false, true]) {
		it(`preserves saved layout without shifting on ${ssr ? 'SSR hydration' : 'client startup'}`, async () => {
			await context.addInitScript(() => {
				const observations = { shift: 0 };
				Object.assign(window, { layoutObservations: observations });
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
						if (!shift.hadRecentInput) observations.shift += shift.value;
					}
				}).observe({ type: 'layout-shift', buffered: true });
			});
			await page.goto(`${origin}/layout?ssr=${ssr ? 1 : 0}`, { waitUntil: 'networkidle' });
			await page.locator('#root[data-ready="true"]').waitFor();
			if (ssr) expect(await page.locator('#root').getAttribute('data-adopted')).toBe('true');
			const before = await widths('layout-group');
			await page.locator('#layout-separator').focus();
			await page.keyboard.press('ArrowRight');
			await expect.poll(() => widths('layout-group')).not.toEqual(before);
			await expect
				.poll(() =>
					context
						.cookies()
						.then((cookies) => cookies.some((cookie) => cookie.name === 'rrp-layout')),
				)
				.toBe(true);
			const saved = await widths('layout-group');
			await page.reload({ waitUntil: 'networkidle' });
			await page.locator('#root[data-ready="true"]').waitFor();
			await expect.poll(() => widths('layout-group')).toEqual(saved);
			if (ssr) expect(await page.locator('#root').getAttribute('data-adopted')).toBe('true');
			expect(
				await page.evaluate(
					() =>
						(window as Window & { layoutObservations: { shift: number } }).layoutObservations.shift,
				),
			).toBe(0);
		});
	}

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
