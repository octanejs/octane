// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createContext } from '../src/middleware.js';
import { createHandler } from '../src/server/production.js';
import { ServerRoute } from '../src/routes.js';

const TEMPLATE = `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body></html>`;

describe('request platform context', () => {
	it('only adds the platform property when a platform is supplied', () => {
		const request = new Request('https://octane.test/context');
		const withoutPlatform = createContext(request, {});
		expect(Object.hasOwn(withoutPlatform, 'platform')).toBe(false);

		const platform = { env: { API_TOKEN: 'test' } };
		const withPlatform = createContext(request, {}, platform);
		expect(Object.hasOwn(withPlatform, 'platform')).toBe(true);
		expect(withPlatform.platform).toBe(platform);
	});

	it('forwards each handler platform to the matched route', async () => {
		const handler = createHandler(
			{
				routes: [
					new ServerRoute({
						path: '/platform/:requestId',
						handler: async (context) => {
							await Promise.resolve();
							const platform = context.platform as { env: { binding: string } };
							return new Response(`${context.params.requestId}:${platform.env.binding}`);
						},
					}),
				],
				components: {},
				layouts: {},
				middlewares: [],
			},
			{
				htmlTemplate: TEMPLATE,
				renderToReadableStream: async () => new ReadableStream(),
				prerender: async () => ({ html: '', css: '' }),
				executeServerFunction: async (fn, body) => String(await fn(body)),
				Suspense: () => undefined,
				ErrorBoundary: () => undefined,
				createElement: () => undefined,
			},
		);

		const [first, second] = await Promise.all([
			handler(new Request('https://octane.test/platform/first'), {
				env: { binding: 'alpha' },
			}),
			handler(new Request('https://octane.test/platform/second'), {
				env: { binding: 'beta' },
			}),
		]);

		expect(await first.text()).toBe('first:alpha');
		expect(await second.text()).toBe('second:beta');
	});

	it('keeps each platform on same-origin fetches from concurrent server functions', async () => {
		const action = async () => {
			await Promise.resolve();
			return (await fetch('/binding')).text();
		};
		const handler = createHandler(
			{
				routes: [
					new ServerRoute({
						path: '/binding',
						handler(context) {
							const platform = context.platform as { env: { binding: string } };
							return new Response(platform.env.binding);
						},
					}),
				],
				components: {},
				layouts: {},
				middlewares: [],
				rpcModules: { '/src/actions.ts': { action } },
				runtime: {
					hash: () => '00000000',
					createAsyncContext: <T>() => {
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
				executeServerFunction: async (fn, body) => String(await fn(body)),
				Suspense: () => undefined,
				ErrorBoundary: () => undefined,
				createElement: () => undefined,
			},
		);

		const rpcRequest = () =>
			new Request('https://octane.test/_$_ripple_rpc_$_/00000000', {
				method: 'POST',
				body: '{}',
			});
		const [first, second] = await Promise.all([
			handler(rpcRequest(), { env: { binding: 'alpha' } }),
			handler(rpcRequest(), { env: { binding: 'beta' } }),
		]);

		expect(await first.text()).toBe('alpha');
		expect(await second.text()).toBe('beta');
	});
});
