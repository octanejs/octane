import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import type { Browser } from 'playwright';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: fileURLToPath(new URL('../../../../', import.meta.url)),
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0 },
	});
	server.middlewares.use((request, response, next) => {
		if (request.url !== '/') return next();
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html><body></body></html>');
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
	await server?.close();
});
it('accepts iframe cancellation signals and rejects signal lookalikes before dispatch', async () => {
	const page = await browser.newPage();
	let requests = 0;
	try {
		await page.route('**/_$_ripple_rpc_$_/test', async (route) => {
			requests++;
			await route.fulfill({ contentType: 'application/json', body: '[{"value":1},42]' });
		});
		await page.goto(baseUrl);
		// A page-side import() inside evaluate() would be rewritten by Vitest's SSR transform.
		await page.addScriptTag({
			type: 'module',
			content:
				"import { __serverRpc } from '/packages/octane/src/server-rpc-client.ts';" +
				'globalThis.__serverRpc = __serverRpc;',
		});
		await page.waitForFunction(() => '__serverRpc' in globalThis);
		const result = await page.evaluate(async () => {
			const { __serverRpc } = globalThis as unknown as {
				__serverRpc: typeof import('../../src/server-rpc-client.js').__serverRpc;
			};
			const iframe = document.createElement('iframe');
			document.body.append(iframe);
			try {
				const foreignWindow = iframe.contentWindow as Window & typeof globalThis;
				const controller = new foreignWindow.AbortController();
				const localInstance = controller.signal instanceof AbortSignal;
				const value = await __serverRpc('test', [], { signal: controller.signal });
				controller.abort('cancelled in iframe');
				let cancellation: unknown;
				try {
					await __serverRpc('test', [], { signal: controller.signal });
				} catch (error) {
					cancellation = error;
				}
				let rejectedLookalike = false;
				try {
					await __serverRpc('test', [], { signal: Object.create(AbortSignal.prototype) });
				} catch (error) {
					rejectedLookalike = error instanceof TypeError;
				}
				return { localInstance, value, cancellation, rejectedLookalike };
			} finally {
				iframe.remove();
			}
		});
		expect(result).toEqual({
			localInstance: false,
			value: 42,
			cancellation: 'cancelled in iframe',
			rejectedLookalike: true,
		});
		expect(requests).toBe(1);
	} finally {
		await page.close();
	}
});
