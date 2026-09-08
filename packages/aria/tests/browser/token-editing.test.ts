import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

let server: ViteDevServer;
let cacheDir: string;
let baseUrl: string;

beforeAll(async () => {
	cacheDir = await mkdtemp(resolve(tmpdir(), 'octane-aria-token-'));
	server = await createServer({
		cacheDir,
		configFile: false,
		logLevel: 'error',
		root: new URL('.', import.meta.url).pathname,
		plugins: [octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Expected a local TCP server');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await server?.close();
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

it('inserts and deletes native text beside an intact token', async () => {
	const browser = await launchBrowser({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(baseUrl);
		const input = page.getByRole('textbox', { name: 'Message' });
		await input.click();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.insertText('!');
		await expect
			.poll(async () => (await input.textContent())?.replace(/\u200b/g, ''))
			.toBe('Hello Ada!');
		await page.keyboard.press('Backspace');
		await expect
			.poll(async () => (await input.textContent())?.replace(/\u200b/g, ''))
			.toBe('Hello Ada');
		expect(await input.locator('[contenteditable="false"]').textContent()).toBe('Ada');
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
});
