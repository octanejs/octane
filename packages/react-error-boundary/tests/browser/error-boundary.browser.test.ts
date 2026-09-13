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
				name: 'error-boundary-hydration-fixture',
				configureServer(vite) {
					vite.middlewares.use(async (request, response, next) => {
						if (request.url?.split('?')[0] !== '/fixture') return next();
						try {
							const url = new URL(request.url, 'http://localhost');
							const ssr = url.searchParams.get('ssr') === '1';
							const rendered = ssr
								? await renderHydrationFixture(
										'react-error-boundary',
										'packages/react-error-boundary/tests/browser/harness/fixture.tsx',
										'BoundaryFixture',
									)
								: { html: '' };
							const html = (
								await readFile(resolve(directory, 'harness/index.html'), 'utf8')
							).replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>`);
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

describe('Error Boundary browser compatibility', () => {
	for (const ssr of [false, true]) {
		it(`${ssr ? 'SSR hydration' : 'client startup'} preserves ref resets, callbacks, and unmount cleanup`, async () => {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await page.goto(`${origin}/fixture?ssr=${ssr ? 1 : 0}`, { waitUntil: 'networkidle' });
				await page.locator('#root[data-ready="true"]').waitFor();
				if (ssr) expect(await page.locator('#root').getAttribute('data-adopted')).toBe('true');
				const read = async () =>
					JSON.parse((await page.locator('#observations').textContent()) ?? '{}');
				expect((await read()).refAttached).toBe(true);
				await page
					.locator('#survivor')
					.evaluate((element) => Object.assign(window, { survivor: element }));
				await page.locator('#throw-null').click();
				await expect.poll(() => page.locator('#fallback').textContent()).toBe('null');
				await page.locator('#survivor').focus();
				await page.locator('#rerender').evaluate((element: HTMLButtonElement) => element.click());
				expect(
					await page.locator('#survivor').evaluate((element) => document.activeElement === element),
				).toBe(true);
				expect(
					await page
						.locator('#survivor')
						.evaluate((element) => element === (window as Window & { survivor: Element }).survivor),
				).toBe(true);
				expect((await read()).sameHandle).toBe(true);
				await page.locator('#reset').click();
				await page.locator('#healthy').waitFor();
				expect((await read()).resets).toEqual([
					{ epoch: 1, details: { reason: 'imperative-api', args: ['retry', 1] } },
				]);
				await page.locator('#throw-async').click();
				await expect.poll(() => page.locator('#fallback').textContent()).toBe('async failure');
				await page.locator('#keys').click();
				await page.locator('#healthy').waitFor();
				expect((await read()).resets[1]).toEqual({
					epoch: 1,
					details: { reason: 'keys', prev: [0], next: [1] },
				});
				expect((await read()).errors).toEqual([null, 'async failure']);
				await page.locator('#unmount').click();
				expect((await read()).refAttached).toBe(false);
				expect(await page.locator('#root').textContent()).toBe('');
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		});
	}
});
