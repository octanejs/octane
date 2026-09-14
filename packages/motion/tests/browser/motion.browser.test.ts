// @vitest-environment node
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser } from 'playwright';
import { octane } from '../../../octane/src/compiler/vite';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';

let browser: Browser;
let server: ViteDevServer;
let origin: string;
beforeAll(async () => {
	const rendered = await renderHydrationFixture(
		'motion',
		'packages/motion/tests/_fixtures/server-values.tsrx',
		'ServerValues',
	);
	const template = await readFile(resolve(import.meta.dirname, 'harness/index.html'), 'utf8');
	const hydrationHtml = template.replace(
		'<div id="root"></div>',
		`<div id="root">${rendered.html}</div>`,
	);
	browser = await chromium.launch({ headless: true });
	server = await createServer({
		configFile: false,
		root: resolve(import.meta.dirname, 'harness'),
		logLevel: 'error',
		plugins: [
			{
				name: 'motion-hook-hydration-fixture',
				configureServer(vite) {
					vite.middlewares.use(async (request, response, next) => {
						if (request.url !== '/hydrate') return next();
						try {
							response.setHeader('Content-Type', 'text/html');
							response.end(await vite.transformIndexHtml('/hydrate', hydrationHtml));
						} catch (error) {
							next(error);
						}
					});
				},
			},
			octane(),
		],
		server: { host: '127.0.0.1', port: 0 },
		resolve: {
			alias: [
				{
					find: /^octane$/,
					replacement: resolve(import.meta.dirname, '../../../octane/src/index.ts'),
				},
			],
		},
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Missing server address');
	origin = `http://127.0.0.1:${address.port}`;
}, 30_000);
afterAll(async () => {
	await browser?.close();
	await server?.close();
});

// @parity-case browser:motion-chromium-0
it('hydrates deterministic hook values by adopting the server output and cleans up', async () => {
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.goto(origin + '/hydrate', { waitUntil: 'networkidle' });
		await page.locator('#root[data-ready="true"]').waitFor();
		expect(await page.locator('#root').getAttribute('data-adopted')).toBe('true');
		expect(await page.locator('#root output').textContent()).toBe('10:20:5:0:false:true');
		await page.locator('#unmount').click();
		expect(await page.locator('#root').innerHTML()).toBe('');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}, 30_000);

// @parity-case browser:motion-chromium-1
it('preserves scoped filters, native clicks, focus, and live MotionValue animation in Chromium', async () => {
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.goto(origin, { waitUntil: 'networkidle' });
		await page.locator('#root[data-ready="true"]').waitFor();
		expect(await page.locator('#svg').evaluate((element) => element.namespaceURI)).toBe(
			'http://www.w3.org/2000/svg',
		);
		expect(
			await page
				.locator('#svg rect')
				.evaluate((element: SVGGraphicsElement) => element.getBBox().width),
		).toBe(10);
		expect(await page.locator('#filtered').getAttribute('data-private')).toBeNull();
		expect(await page.locator('#inherited').getAttribute('data-private')).toBeNull();
		expect(await page.locator('#overridden').getAttribute('data-private')).toBe('private');
		expect(await page.locator('#outside').getAttribute('data-private')).toBe('private');
		expect(
			await page.locator('#portal-target #portal-button').getAttribute('data-private'),
		).toBeNull();
		await page.locator('#portal-button').click();
		await expect.poll(() => page.locator('#portal-clicks').textContent()).toBe('1');
		await page
			.locator('#filtered')
			.evaluate((element) => Object.assign(window, { motionButton: element }));
		await page.locator('#filtered').click();
		await expect.poll(() => page.locator('output').textContent()).toBe('1');
		await page.locator('#change-filter').evaluate((button: HTMLButtonElement) => button.click());
		await expect.poll(() => page.locator('#filtered').getAttribute('data-public')).toBeNull();
		expect(
			await page
				.locator('#filtered')
				.evaluate(
					(element) =>
						element === document.activeElement &&
						element === (window as Window & { motionButton: Element }).motionButton,
				),
		).toBe(true);
		await page.locator('#filtered').click();
		await expect.poll(() => page.locator('output').textContent()).toBe('2');
		expect(
			await page.locator('#filtered').evaluate((element: HTMLElement) => element.style.opacity),
		).toBe('0.5');
		await page.locator('#animate').click();
		await expect
			.poll(() =>
				page.locator('#animated').evaluate((element: HTMLElement) => element.style.opacity),
			)
			.toBe('1');
		await page.locator('#unmount').click();
		await expect.poll(() => page.locator('#root').textContent()).toBe('');
		expect(await page.locator('#portal-target').innerHTML()).toBe('');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}, 30_000);
