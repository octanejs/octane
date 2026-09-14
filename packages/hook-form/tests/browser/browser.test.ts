import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../test-utils/playwright-browser';
import type {} from './main';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;
let failures: string[];

beforeAll(async () => {
	const root = resolve(import.meta.dirname, '../../../..');
	server = await createServer({
		configFile: false,
		root: import.meta.dirname,
		cacheDir: resolve(root, 'node_modules/.vite/hook-form-browser'),
		logLevel: 'error',
		plugins: [octane()],
		resolve: {
			alias: [
				{
					find: /^@octanejs\/hook-form$/,
					replacement: resolve(root, 'packages/hook-form/src/index.ts'),
				},
			],
		},
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Missing browser server address');
	origin = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
}, 30_000);

afterEach(async () => {
	await page?.close();
	expect(failures).toEqual([]);
});
afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openForm() {
	failures = [];
	page = await browser.newPage();
	page.setDefaultTimeout(5_000);
	page.on('pageerror', (error) => failures.push(error.message));
	await page.goto(origin);
	await page.waitForFunction(() => window.hookFormBrowser?.ready());
}

// @parity-case native:hook-form-browser-focus-keyed-cleanup
it('validates native edits, preserves surviving array inputs, focuses appended fields, and cleans up', async () => {
	await openForm();
	const name = page.getByRole('textbox', { name: 'Name', exact: true });
	expect(await name.inputValue()).toBe('Ada');
	await name.fill('');
	await expect.poll(() => page.getByRole('alert').textContent()).toBe('Name is required');
	await name.fill('Grace');
	await expect.poll(() => page.getByRole('alert').textContent()).toBe('');
	const row = await page.getByRole('textbox', { name: 'Item 0', exact: true }).elementHandle();
	await row!.fill('edited');
	await page.locator('#release-swap').click();
	expect(
		await row!.evaluate((input) => input === document.querySelector('input[aria-label="Item 1"]')),
	).toBe(true);
	expect(await page.getByRole('textbox', { name: 'Item 1', exact: true }).inputValue()).toBe(
		'edited',
	);
	await page.locator('#release-append').click();
	await expect
		.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
		.toBe('Item 2');
	await page.locator('#release-remove').click();
	expect(
		await row!.evaluate((input) => input === document.querySelector('input[aria-label="Item 0"]')),
	).toBe(true);
	await page.evaluate(() => window.hookFormBrowser.unmount());
	const delivered = await page.evaluate(() => window.hookFormBrowser.snapshot().values);
	await page.evaluate(() => window.hookFormBrowser.setAfterUnmount());
	expect(await page.evaluate(() => window.hookFormBrowser.snapshot().values)).toEqual(delivered);
}, 30_000);

// @parity-case native:hook-form-browser-form-action-files
it('submits native files once and reports rejected function actions through form state', async () => {
	await openForm();
	await page.evaluate(() => window.hookFormBrowser.attach());
	await page.locator('#release-submit').click();
	await expect
		.poll(() => page.evaluate(() => window.hookFormBrowser.snapshot().submissions))
		.toEqual([
			{ name: 'Ada', fileName: 'evidence.txt', fileText: 'retained bytes', nativeFile: true },
		]);
	expect(await page.evaluate(() => window.hookFormBrowser.snapshot().payloads)).toBe(1);
	await expect
		.poll(() => page.locator('#release-state').textContent())
		.toContain('"isSubmitSuccessful":true');
	await page.evaluate(() => window.hookFormBrowser.reject());
	await page.locator('#release-submit').click();
	await expect
		.poll(() => page.evaluate(() => window.hookFormBrowser.snapshot().serverError))
		.toBe('');
	await expect
		.poll(() => page.locator('#release-state').textContent())
		.toContain('"isSubmitSuccessful":false');
	expect(await page.evaluate(() => window.hookFormBrowser.snapshot().payloads)).toBe(2);
	expect(await page.evaluate(() => window.hookFormBrowser.snapshot().submissions.length)).toBe(1);
}, 30_000);
