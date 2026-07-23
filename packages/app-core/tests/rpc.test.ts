// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context, Middleware } from '@octanejs/app-core';
import { createHandler } from '../src/server/production.js';

const TEMPLATE = `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body></html>`;
const FETCH_COORDINATOR_KEY = Symbol.for('octane.app-core.fetch-coordinator');
const originalFetch = globalThis.fetch;

interface RpcTestOptions {
	allowedOrigins?: string[];
	maxBodyBytes?: number;
	middlewares?: Middleware[];
	trustProxy?: boolean;
	action?: (...args: unknown[]) => unknown;
}

function createRpcHandler(options: RpcTestOptions = {}) {
	const storage = new AsyncLocalStorage<{ origin?: string; platform?: unknown }>();
	const action = vi.fn(options.action ?? ((value: unknown) => value));
	const handler = createHandler(
		{
			routes: [],
			components: {},
			layouts: {},
			middlewares: options.middlewares ?? [],
			trustProxy: options.trustProxy ?? false,
			rpc: {
				...(options.allowedOrigins === undefined ? {} : { allowedOrigins: options.allowedOrigins }),
				...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
			},
			rpcModules: { '/src/actions.ts': { action } },
			runtime: {
				hash: () => 'deadbeef',
				createAsyncContext: <T>() => {
					const context = storage as unknown as AsyncLocalStorage<T>;
					return {
						run: <R>(store: T, fn: () => R | Promise<R>) => context.run(store, fn),
						getStore: () => context.getStore(),
					};
				},
			},
		},
		{
			htmlTemplate: TEMPLATE,
			renderToReadableStream: async () => new ReadableStream(),
			prerender: async () => ({ html: '', css: '' }),
			executeServerFunction: async (fn, body) => {
				const args: unknown = JSON.parse(body);
				if (!Array.isArray(args)) {
					throw Object.assign(new Error('Invalid server function arguments'), {
						code: 'OCTANE_INVALID_RPC_PAYLOAD',
					});
				}
				return JSON.stringify({ value: await fn(...args) });
			},
			Suspense: () => undefined,
			ErrorBoundary: () => undefined,
			createElement: () => undefined,
		},
	);
	return { action, handler, storage };
}

function rpcRequest(
	options: {
		body?: string;
		hash?: string;
		headers?: Record<string, string>;
		method?: string;
	} = {},
) {
	const method = options.method ?? 'POST';
	return new Request(`https://octane.test/_$_ripple_rpc_$_/${options.hash ?? 'deadbeef'}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...options.headers },
		...(method === 'GET' || method === 'HEAD' ? {} : { body: options.body ?? '["ok"]' }),
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete (globalThis as typeof globalThis & Record<symbol, unknown>)[FETCH_COORDINATOR_KEY];
	vi.restoreAllMocks();
});

describe('server-function HTTP security', () => {
	it('accepts a correctly encoded same-origin POST', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ headers: { Origin: 'https://octane.test' } }));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		await expect(response.json()).resolves.toEqual({ value: 'ok' });
		expect(action).toHaveBeenCalledExactlyOnceWith('ok');
	});

	it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD'])(
		'rejects %s without invoking the action',
		async (method) => {
			const { action, handler } = createRpcHandler();
			const response = await handler(rpcRequest({ method }));

			expect(response.status).toBe(405);
			expect(response.headers.get('allow')).toBe('POST');
			expect(action).not.toHaveBeenCalled();
		},
	);

	it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])(
		'rejects the %s content type without invoking the action',
		async (contentType) => {
			const { action, handler } = createRpcHandler();
			const response = await handler(rpcRequest({ headers: { 'Content-Type': contentType } }));

			expect(response.status).toBe(415);
			expect(action).not.toHaveBeenCalled();
		},
	);

	it('accepts JSON content types with a charset parameter', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(
			rpcRequest({ headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
		);

		expect(response.status).toBe(200);
		expect(action).toHaveBeenCalledOnce();
	});

	it('rejects a cross-origin browser POST before executing the action', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ headers: { Origin: 'https://attacker.test' } }));

		expect(response.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects opaque browser origins', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ headers: { Origin: 'null' } }));

		expect(response.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it.each([
		'https://octane.test/path',
		'https://octane.test?token=secret',
		'https://user:password@octane.test',
	])('rejects the malformed serialized browser origin %s', async (origin) => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ headers: { Origin: origin } }));

		expect(response.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects an identified cross-site browser request with no origin', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ headers: { 'Sec-Fetch-Site': 'cross-site' } }));

		expect(response.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it('accepts an explicitly configured additional origin', async () => {
		const { action, handler } = createRpcHandler({
			allowedOrigins: ['https://trusted.octane.test'],
		});
		const response = await handler(
			rpcRequest({ headers: { Origin: 'https://trusted.octane.test' } }),
		);

		expect(response.status).toBe(200);
		expect(action).toHaveBeenCalledOnce();
	});

	it('does not trust forwarded origins by default', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(
			rpcRequest({
				headers: {
					Origin: 'https://attacker.test',
					'X-Forwarded-Host': 'attacker.test',
					'X-Forwarded-Proto': 'https',
				},
			}),
		);

		expect(response.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it('honors forwarded origin headers only behind an explicitly trusted proxy', async () => {
		const { action, handler } = createRpcHandler({ trustProxy: true });
		const response = await handler(
			rpcRequest({
				headers: {
					Origin: 'https://public.octane.test',
					'X-Forwarded-Host': 'public.octane.test',
					'X-Forwarded-Proto': 'https',
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(action).toHaveBeenCalledOnce();
	});

	it('rejects a declared oversized payload before executing the action', async () => {
		const { action, handler } = createRpcHandler({ maxBodyBytes: 8 });
		const response = await handler(rpcRequest({ headers: { 'Content-Length': '1024' } }));

		expect(response.status).toBe(413);
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects an oversized actual payload without trusting its content length', async () => {
		const { action, handler } = createRpcHandler({ maxBodyBytes: 8 });
		const response = await handler(rpcRequest({ body: '["too much data"]' }));

		expect(response.status).toBe(413);
		expect(action).not.toHaveBeenCalled();
	});

	it('keeps the oversized response when the request body refuses cancellation', async () => {
		const { action, handler } = createRpcHandler({ maxBodyBytes: 8 });
		const init: RequestInit & { duplex: 'half' } = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: new ReadableStream({
				pull(controller) {
					controller.enqueue(new TextEncoder().encode('["too much data"]'));
				},
				cancel() {
					throw new Error('The hostile stream refused cancellation');
				},
			}),
			duplex: 'half',
		};
		const response = await handler(
			new Request('https://octane.test/_$_ripple_rpc_$_/deadbeef', init),
		);

		expect(response.status).toBe(413);
		expect(action).not.toHaveBeenCalled();
	});

	it.each(['{', '{}', 'null', '"argument"'])(
		'rejects malformed or non-array RPC payload %s',
		async (body) => {
			const { action, handler } = createRpcHandler();
			const response = await handler(rpcRequest({ body }));

			expect(response.status).toBe(400);
			expect(action).not.toHaveBeenCalled();
		},
	);

	it('rejects invalid function hashes without invoking an action', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ hash: 'not-a-valid-hash' }));

		expect(response.status).toBe(400);
		expect(action).not.toHaveBeenCalled();
	});

	it('returns a generic not-found response for an unknown valid function hash', async () => {
		const { action, handler } = createRpcHandler();
		const response = await handler(rpcRequest({ hash: 'badc0de0' }));

		expect(response.status).toBe(404);
		expect(action).not.toHaveBeenCalled();
	});

	it('runs global authorization middleware before a server action', async () => {
		let authorizationObservedBodyUsed: boolean | undefined;
		const authorization = vi.fn((context: Context) => {
			authorizationObservedBodyUsed = context.request.bodyUsed;
			return new Response('Unauthorized', { status: 401 });
		});
		const { action, handler } = createRpcHandler({ middlewares: [authorization] });
		const response = await handler(rpcRequest());

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Unauthorized');
		expect(authorization).toHaveBeenCalledOnce();
		expect(authorizationObservedBodyUsed).toBe(false);
		expect(action).not.toHaveBeenCalled();
	});

	it('preserves middleware request state and platform bindings for server actions', async () => {
		let observedState: unknown;
		let platformFromContext: () => unknown = () => undefined;
		const platform = { env: { account: 'octane' } };
		const middleware: Middleware = async (context, next) => {
			context.state.set('account', context.platform);
			observedState = context.state.get('account');
			return next();
		};
		const { action, handler, storage } = createRpcHandler({
			middlewares: [middleware],
			action: () => platformFromContext(),
		});
		platformFromContext = () => storage.getStore()?.platform;
		const response = await handler(rpcRequest(), platform);

		expect(response.status).toBe(200);
		expect(observedState).toBe(platform);
		expect(action).toHaveBeenCalledOnce();
		await expect(response.json()).resolves.toEqual({ value: platform });
	});

	it('does not disclose server-action exception messages', async () => {
		const secret = 'private database password';
		const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { action, handler } = createRpcHandler({
			action: () => {
				throw new Error(secret);
			},
		});
		const response = await handler(rpcRequest());

		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain(secret);
		expect(action).toHaveBeenCalledOnce();
		expect(loggedError).toHaveBeenCalledOnce();
	});

	it('does not disclose authorization middleware exception messages', async () => {
		const secret = 'private authorization policy';
		const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { action, handler } = createRpcHandler({
			middlewares: [
				() => {
					throw new Error(secret);
				},
			],
		});
		const response = await handler(rpcRequest());

		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain(secret);
		expect(action).not.toHaveBeenCalled();
		expect(loggedError).toHaveBeenCalledOnce();
	});
});
