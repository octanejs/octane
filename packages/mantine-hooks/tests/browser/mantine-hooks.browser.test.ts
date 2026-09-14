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
				name: 'mantine-hooks-hydration-fixture',
				configureServer(vite) {
					vite.middlewares.use(async (request, response, next) => {
						if (request.url?.split('?')[0] !== '/fixture') return next();
						try {
							const url = new URL(request.url, 'http://localhost');
							const ssr = url.searchParams.get('ssr') === '1';
							const rendered = ssr
								? await renderHydrationFixture(
										'mantine-hooks',
										'packages/mantine-hooks/tests/browser/harness/fixture.tsx',
										'HooksFixture',
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
	// Prepare the cold Vite module graph within the setup budget. Each test still
	// starts in a fresh page and retains its five-second interaction deadlines.
	const warmup = await browser.newPage();
	try {
		await warmup.goto(`${origin}/fixture?ssr=0`, { waitUntil: 'networkidle', timeout: 45_000 });
		await warmup.locator('#root[data-ready="true"]').waitFor({ timeout: 5000 });
	} finally {
		await warmup.close();
	}
}, 60_000);
afterAll(async () => {
	await browser?.close();
	await server?.close();
});

describe('Mantine hooks browser compatibility', () => {
	for (const ssr of [false, true]) {
		it(`${ssr ? 'SSR hydration' : 'client startup'} preserves hook updates, refs, and cleanup`, async () => {
			const page = await browser.newPage();
			page.setDefaultTimeout(5000);
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await page.goto(`${origin}/fixture?ssr=${ssr ? 1 : 0}`, { waitUntil: 'networkidle' });
				await page.locator('#root[data-ready="true"]').waitFor();
				if (ssr) expect(await page.locator('#root').getAttribute('data-adopted')).toBe('true');
				const events = async (): Promise<Array<{ kind: string; value: string | number }>> =>
					JSON.parse((await page.locator('#observations').textContent()) ?? '[]');
				await page
					.locator('#survivor')
					.evaluate((element) => Object.assign(window, { survivor: element }));
				await page.locator('#survivor').focus();
				await page.locator('#toggle').evaluate((button: HTMLButtonElement) => button.click());
				await expect.poll(() => page.locator('#collapse-state').textContent()).toBe('entered');
				expect(
					await page
						.locator('#survivor')
						.evaluate(
							(element) =>
								document.activeElement === element &&
								element === (window as Window & { survivor: Element }).survivor,
						),
				).toBe(true);
				await page.locator('#toggle').click();
				await expect.poll(() => page.locator('#collapse-state').textContent()).toBe('exited');
				expect(
					(await events()).filter((event) => event.kind === 'collapse').map((event) => event.value),
				).toEqual(['entered', 'exited']);
				await page.locator('#value-a').click();
				await expect.poll(() => page.locator('#debounced').textContent()).toBe('a');
				await page.locator('#value-ab').click();
				await page.locator('#value-abc').click();
				expect(await page.locator('#debounced').textContent()).toBe('a');
				await expect.poll(() => page.locator('#debounced').textContent()).toBe('abc');
				expect(
					(await events()).filter((event) => event.kind === 'value').map((event) => event.value),
				).toEqual(['a', 'ab', 'abc']);
				await page.locator('#scroll-host').evaluate((element) => {
					element.scrollTop = 300;
					element.dispatchEvent(new Event('scroll'));
				});
				await expect.poll(() => page.locator('#active-heading').textContent()).toBe('1');
				await page.locator('#rapid').click();
				await expect
					.poll(async () =>
						(await events()).some((event) => event.kind === 'tick' && event.value === 10),
					)
					.toBe(true);
				expect(
					(await events()).some(
						(event) => event.kind === 'tick' && Number(event.value) > 0 && Number(event.value) < 10,
					),
				).toBe(true);
				await page.evaluate(() => {
					document.body.style.userSelect = 'text';
					document
						.querySelector('#drag')!
						.dispatchEvent(
							new MouseEvent('mousedown', { bubbles: true, clientX: 15, clientY: 15 }),
						);
					document.dispatchEvent(new Event('touchcancel'));
				});
				await expect
					.poll(async () =>
						(await events()).filter((event) => event.kind === 'drag').map((event) => event.value),
					)
					.toEqual(['start', 'end']);
				expect(await page.evaluate(() => document.body.style.userSelect)).toBe('text');
				await page.locator('#unmount').click();
				const ticks = (await events()).filter((event) => event.kind === 'tick').length;
				await new Promise((resolve) => setTimeout(resolve, 240));
				expect((await events()).filter((event) => event.kind === 'tick')).toHaveLength(ticks);
				expect(await page.locator('#root').textContent()).toBe('');
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		});
	}
});
