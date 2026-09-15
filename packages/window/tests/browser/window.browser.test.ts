import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser } from 'playwright';
import { octane } from '../../../octane/src/compiler/vite.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';

const directory = dirname(fileURLToPath(import.meta.url));
let server: ViteDevServer;
let browser: Browser;
let origin: string;
beforeAll(async () => {
	browser = await chromium.launch({ headless: true });
	server = await createServer({
		configFile: false,
		root: resolve(directory, 'harness'),
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0 },
		plugins: [
			{
				name: 'window-hydration-fixture',
				configureServer(vite) {
					vite.middlewares.use(async (request, response, next) => {
						if (request.url?.split('?')[0] !== '/fixture') return next();
						try {
							const url = new URL(request.url, 'http://localhost');
							const kind = url.searchParams.get('kind');
							if (kind !== 'list' && kind !== 'grid') throw new Error('Invalid virtualizer kind');
							const ssr = url.searchParams.get('ssr') === '1';
							const rendered = ssr
								? await renderHydrationFixture(
										'window',
										'packages/window/tests/browser/harness/fixture.tsx',
										'WindowBrowserFixture',
										{ kind },
									)
								: { html: '' };
							const html = (
								await readFile(resolve(directory, 'harness/index.html'), 'utf8')
							).replace(
								'<div id="root"></div>',
								`<div id="root" data-kind="${kind}">${rendered.html}</div>`,
							);
							response.setHeader('Content-Type', 'text/html');
							response.end(await vite.transformIndexHtml('/fixture', html));
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
				{ find: /^octane$/, replacement: resolve(directory, '../../../octane/src/index.ts') },
			],
		},
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
	origin = `http://127.0.0.1:${address.port}`;
}, 60_000);
afterAll(async () => {
	await browser?.close();
	await server?.close();
});

describe('React Window browser conformance', () => {
	for (const kind of ['list', 'grid'] as const)
		for (const ssr of [false, true]) {
			it(`${kind} ${ssr ? 'SSR hydration' : 'client startup'} preserves initial layout and bounded item count`, async () => {
				const context = await browser.newContext();
				const errors: string[] = [];
				try {
					await context.addInitScript(() => {
						const state = { value: 0 };
						Object.assign(window, { windowLayoutShift: state });
						new PerformanceObserver((list) => {
							for (const entry of list.getEntries()) {
								const shift = entry as PerformanceEntry & {
									value: number;
									hadRecentInput: boolean;
								};
								if (!shift.hadRecentInput) state.value += shift.value;
							}
						}).observe({ type: 'layout-shift', buffered: true });
					});
					const page = await context.newPage();
					page.on('pageerror', (error) => errors.push(error.message));
					await page.goto(`${origin}/fixture?kind=${kind}&ssr=${ssr ? 1 : 0}`, {
						waitUntil: 'networkidle',
					});
					const root = page.locator('#root');
					await page.locator('#root[data-ready="true"]').waitFor();
					expect(await root.getAttribute('data-first-frame-items')).toBe(
						kind === 'list' ? '10' : '30',
					);
					expect(await page.locator('[data-item]').count()).toBe(kind === 'list' ? 10 : 30);
					if (ssr) expect(await root.getAttribute('data-adopted')).toBe('true');
					expect(
						await page.locator('#after').evaluate((element) => element.getBoundingClientRect().top),
					).toBe(Number(await root.getAttribute('data-first-frame-bottom')));
					expect(
						await page.evaluate(
							() =>
								(window as Window & { windowLayoutShift: { value: number } }).windowLayoutShift
									.value,
						),
					).toBe(0);
					await page.locator('#virtualizer').evaluate((element) => {
						element.scrollTop = 1500;
					});
					await expect
						.poll(() => page.locator('[data-item="50"], [data-item="50:0"]').count())
						.toBe(1);
					expect(await page.locator('[data-item]').count()).toBeLessThanOrEqual(
						kind === 'list' ? 11 : 33,
					);
					expect(errors).toEqual([]);
				} finally {
					await context.close();
				}
			});
		}
	it('Grid changes scroll direction on the same mounted element', async () => {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		try {
			await page.goto(`${origin}/fixture?kind=grid&ssr=0`, { waitUntil: 'networkidle' });
			await page.locator('#root[data-ready="true"]').waitFor();
			const virtualizer = page.locator('#virtualizer');
			await virtualizer.evaluate((element) => Object.assign(window, { mountedGrid: element }));
			await page.locator('#scroll').click();
			await expect.poll(() => virtualizer.evaluate((element) => element.scrollLeft)).toBe(500);
			await page.locator('#direction').click();
			await page.locator('#scroll').click();
			await expect.poll(() => virtualizer.evaluate((element) => element.scrollLeft)).toBe(-500);
			await page.locator('#direction').click();
			await page.locator('#scroll').click();
			await expect.poll(() => virtualizer.evaluate((element) => element.scrollLeft)).toBe(500);
			expect(
				await virtualizer.evaluate(
					(element) => element === (window as Window & { mountedGrid: Element }).mountedGrid,
				),
			).toBe(true);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
