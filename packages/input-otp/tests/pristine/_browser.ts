import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'harness');
let server: ViteDevServer;
let browser: import('playwright').Browser;
let context: import('playwright').BrowserContext;
let origin = '';
let errors: string[] = [];
export let page: import('playwright').Page;

function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const socket = createNetServer();
		socket.once('error', reject);
		socket.listen(0, '127.0.0.1', () => {
			const { port } = socket.address() as import('node:net').AddressInfo;
			socket.close(() => resolvePort(port));
		});
	});
}
export async function goto(path: string): Promise<void> {
	await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
	await page.locator('[data-ready="true"]').waitFor({ state: 'attached' });
}
export function setupPristineBrowser(): void {
	beforeAll(async () => {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
		const port = await freePort();
		server = await createServer({
			root: harnessRoot,
			logLevel: 'error',
			server: { host: '127.0.0.1', port, strictPort: true },
		});
		await server.listen();
		origin = `http://127.0.0.1:${port}`;
	}, 60_000);
	beforeEach(async () => {
		errors = [];
		context = await browser.newContext({ viewport: { width: 900, height: 700 } });
		page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		await goto('/base');
	});
	afterEach(async () => {
		try {
			expect(errors).toEqual([]);
		} finally {
			await context.close();
		}
	});
	afterAll(async () => {
		await browser?.close().catch(() => {});
		await server?.close().catch(() => {});
	});
}
