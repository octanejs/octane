import { AsyncLocalStorage } from 'node:async_hooks';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleRpcRequest, type RpcRequestOptions } from '@octanejs/app-core';
import { nodeRequestToWebRequest, sendWebResponse } from '@octanejs/app-core/node';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';

const RPC_PATH = '/_$_ripple_rpc_$_/deadbeef';
const HTML = new Response('<!doctype html><title>RPC CORS test</title>', {
	headers: { 'Content-Type': 'text/html' },
});

async function listen(handler: (request: Request) => Promise<Response>) {
	const server = createServer((request, response) => {
		void handler(nodeRequestToWebRequest(request, response))
			.then((result) => sendWebResponse(response, result))
			.catch((error) => response.destroy(error));
	}).listen(0, '127.0.0.1');
	await once(server, 'listening');
	return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function close(server: Server) {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
		server.closeAllConnections();
	});
}

async function fixture(expose?: string, trusted = true) {
	const ui = await listen(async () => HTML.clone());
	try {
		const storage = new AsyncLocalStorage<
			NonNullable<ReturnType<RpcRequestOptions['asyncContext']['getStore']>>
		>();
		const action = vi.fn();
		const execute = vi.fn(async () => '{}');
		const middleware = vi.fn(() => {
			const headers = new Headers({
				'Retry-After': '60',
				'X-Request-Id': 'request-123',
				'X-Private': 'hidden',
				'Octane-RPC-Outcome': 'completed',
				Vary: 'Accept-Encoding',
			});
			if (expose !== undefined) headers.set('Access-Control-Expose-Headers', expose);
			return new Response('Rate limited', { status: 429, headers });
		});
		const options: RpcRequestOptions = {
			resolveFunction: () => action,
			executeServerFunction: execute,
			asyncContext: {
				run: (store, callback) => storage.run(store, callback),
				getStore: () => storage.getStore(),
			},
			allowedOrigins: trusted ? [ui.origin] : [],
			middlewares: [middleware],
		};
		const api = await listen(async (request) => {
			if (new URL(request.url).pathname === '/') return HTML.clone();
			if (new URL(request.url).pathname === '/native') {
				// A native Fetch CORS response provides the visibility reference.
				const headers = new Headers({ 'Access-Control-Allow-Origin': ui.origin });
				if (request.method === 'OPTIONS') {
					headers.set('Access-Control-Allow-Methods', 'POST');
					headers.set('Access-Control-Allow-Headers', 'content-type');
					return new Response(null, { status: 204, headers });
				}
				const response = middleware();
				for (const [name, value] of headers) response.headers.set(name, value);
				response.headers.set('Octane-RPC-Outcome', 'rejected');
				response.headers.append('Access-Control-Expose-Headers', 'Octane-RPC-Outcome');
				return response;
			}
			return handleRpcRequest(request, options);
		});
		return {
			ui,
			api,
			action,
			execute,
			middleware,
			async close() {
				await Promise.all([close(api.server), close(ui.server)]);
			},
		};
	} catch (error) {
		await close(ui.server);
		throw error;
	}
}

function fetchHeaders(page: Page, url: string) {
	return page.evaluate(async (url) => {
		const response = await fetch(url, {
			method: 'POST',
			credentials: 'omit',
			headers: { 'Content-Type': 'application/json' },
			body: '[]',
		});
		return {
			status: response.status,
			body: await response.text(),
			retryAfter: response.headers.get('retry-after'),
			requestId: response.headers.get('x-request-id'),
			privateHeader: response.headers.get('x-private'),
			outcome: response.headers.get('octane-rpc-outcome'),
		};
	}, url);
}

describe('RPC response header visibility in a cross-origin browser', () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await launchBrowser({ headless: true });
	});
	afterAll(async () => {
		await browser?.close();
	});

	it.each([
		['explicit list', 'Retry-After, X-Request-Id', '60', 'request-123', null],
		['existing outcome', 'retry-after, OCTANE-rpc-OUTCOME', '60', null, null],
		['wildcard', '*', '60', 'request-123', 'hidden'],
		['empty list', '', null, null, null],
		['no list', undefined, null, null, null],
	] as const)(
		'preserves %s visibility and the rejected outcome',
		async (_, expose, retryAfter, requestId, privateHeader) => {
			const app = await fixture(expose);
			let page: Page | undefined;
			try {
				page = await browser.newPage();
				await page.goto(app.api.origin);
				expect(await fetchHeaders(page, app.api.origin + RPC_PATH)).toEqual({
					status: 429,
					body: 'Rate limited',
					retryAfter: '60',
					requestId: 'request-123',
					privateHeader: 'hidden',
					outcome: 'rejected',
				});
				await page.goto(app.ui.origin);
				const expected = {
					status: 429,
					body: 'Rate limited',
					retryAfter,
					requestId,
					privateHeader,
					outcome: 'rejected',
				};
				expect(await fetchHeaders(page, app.api.origin + '/native')).toEqual(expected);
				expect(await fetchHeaders(page, app.api.origin + RPC_PATH)).toEqual(expected);
				expect(app.action).not.toHaveBeenCalled();
				expect(app.execute).not.toHaveBeenCalled();
			} finally {
				try {
					await page?.close();
				} finally {
					await app.close();
				}
			}
		},
	);

	it.each([
		['untrusted origin', false, 'omit'],
		['credentialed preflight', true, 'include'],
	] as const)(
		'continues to block %s before middleware or action execution',
		async (_, trusted, credentials) => {
			const app = await fixture('Retry-After, X-Request-Id', trusted);
			let page: Page | undefined;
			try {
				page = await browser.newPage();
				await page.goto(app.ui.origin);
				const result = await page.evaluate(
					async ({ url, credentials }) => {
						try {
							await fetch(url, {
								method: 'POST',
								credentials,
								headers: { 'Content-Type': 'application/json' },
								body: '[]',
							});
							return 'allowed';
						} catch (error) {
							return error instanceof TypeError ? 'blocked' : 'unexpected error';
						}
					},
					{ url: app.api.origin + RPC_PATH, credentials },
				);
				expect(result).toBe('blocked');
				expect(app.middleware).not.toHaveBeenCalled();
				expect(app.action).not.toHaveBeenCalled();
				expect(app.execute).not.toHaveBeenCalled();
			} finally {
				try {
					await page?.close();
				} finally {
					await app.close();
				}
			}
		},
	);
});
