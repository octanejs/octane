// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHandler } from '../src/server/production.js';
import { ServerRoute } from '../src/routes.js';

const TEMPLATE = `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body></html>`;
const FETCH_COORDINATOR_KEY = Symbol.for('octane.app-core.fetch-coordinator');
const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete (globalThis as typeof globalThis & Record<symbol, unknown>)[FETCH_COORDINATOR_KEY];
});

function makeHandler(label: string) {
	const rpcFunction = async () => (await fetch('/internal')).text();
	return createHandler(
		{
			routes: [
				new ServerRoute({
					path: '/internal',
					handler: () => new Response(label),
				}),
			],
			components: {},
			layouts: {},
			middlewares: [],
			rpcModules: { '/src/rpc.ts': { rpcFunction } },
			runtime: {
				hash: () => 'deadbeef',
				createAsyncContext: <T = unknown>() => {
					const storage = new AsyncLocalStorage<T>();
					return {
						run: <R>(store: T, fn: () => R | Promise<R>) => storage.run(store, fn),
						getStore: () => storage.getStore(),
					};
				},
			},
		},
		{
			htmlTemplate: TEMPLATE,
			renderToReadableStream: async () => new ReadableStream(),
			prerender: async () => ({ html: '', css: '' }),
			executeServerFunction: async (fn) => String(await fn()),
			Suspense: () => undefined,
			ErrorBoundary: () => undefined,
			createElement: () => undefined,
		},
	);
}

async function callRpc(handler: ReturnType<typeof makeHandler>) {
	const response = await handler(
		new Request('http://octane.test/_$_ripple_rpc_$_/deadbeef', {
			method: 'POST',
			body: '[]',
		}),
	);
	return response.text();
}

describe('createHandler fetch refresh', () => {
	it('routes same-origin fetch through the newest hot-reloaded handler', async () => {
		const first = makeHandler('first');
		expect(await callRpc(first)).toBe('first');

		const second = makeHandler('second');
		expect(await callRpc(second)).toBe('second');
	});
});
