// createHandler unit tests — the production handler's pure assembly decisions
// (template splitting, hydration payload shape, status, preload tags, the
// buffered fallback, server routes, 404) with stub renderers. The real-render
// byte-compat path is covered end-to-end in production.test.ts.
import { describe, it, expect } from 'vitest';
import { createHandler } from '../src/server/production.js';
import { RenderRoute, ServerRoute } from '../src/routes.js';
import { OCTANE_NONCE_STATE_KEY } from '../src/constants.js';

const TEMPLATE = `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" data-octane-hydrate src="/assets/hydrate-abc.js"></script></body></html>`;

function Page() {
	return '<main>page</main>';
}

function streamOf(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

const baseDeps = {
	renderToReadableStream: async () =>
		streamOf('<style data-octane="x">.x{}</style><main>page</main>'),
	prerender: async () => ({
		html: '<main>page</main>',
		css: '<style data-octane="x">.x{}</style>',
	}),
	htmlTemplate: TEMPLATE,
	executeServerFunction: async () => '',
};

function makeManifest(overrides: Record<string, unknown> = {}) {
	const routes = [
		new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'] }),
		new RenderRoute({ path: '/*splat', entry: ['Page', '/src/Page.tsrx'], status: 404 }),
		new ServerRoute({
			path: '/api/ping',
			handler: () => new Response('pong', { status: 200 }),
		}),
	];
	return {
		routes,
		components: { '/src/Page.tsrx': { Page } },
		layouts: {},
		middlewares: [],
		...overrides,
	};
}

describe('createHandler', () => {
	it('streams template prefix → render stream → suffix with the dev-shaped data script', async () => {
		const handler = createHandler(makeManifest() as any, baseDeps as any);
		const response = await handler(new Request('http://localhost/?q=1'));
		expect(response.status).toBe(200);
		const html = await response.text();

		// Assembly: styles + markup inside #root, template suffix intact.
		expect(html).toContain(
			'<div id="root"><style data-octane="x">.x{}</style><main>page</main></div>',
		);
		expect(html).toContain('src="/assets/hydrate-abc.js"');

		// The payload matches dev render-route.js: same keys, same order.
		const payload = html.match(/__octane_data" type="application\/json">(.*?)<\/script>/s)![1];
		expect(payload).toBe(
			JSON.stringify({
				entry: '/src/Page.tsrx',
				exportName: 'Page',
				layout: null,
				routeIndex: 0,
				params: {},
				url: '/?q=1',
				preHydrate: null,
				rootBoundary: { pending: null, catch: null },
			}),
		);
	});

	it('uses the RenderRoute status (catch-all 404) and route params', async () => {
		const handler = createHandler(makeManifest() as any, baseDeps as any);
		const response = await handler(new Request('http://localhost/not/a/page'));
		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain('"params":{"splat":"not/a/page"}');
	});

	it("render: 'buffered' awaits prerender and sends one document (css leads the body)", async () => {
		let streamed = false;
		let prerenderSignal: AbortSignal | undefined;
		const deps = {
			...baseDeps,
			renderToReadableStream: async () => {
				streamed = true;
				return streamOf('');
			},
			prerender: async (
				_component: Function,
				_props: unknown,
				options: { signal?: AbortSignal } | undefined,
			) => {
				prerenderSignal = options?.signal;
				return {
					html: '<main>page</main>',
					css: '<style data-octane="x">.x{}</style>',
				};
			},
		};
		const handler = createHandler(makeManifest({ render: 'buffered' }) as any, deps as any);
		const request = new Request('http://localhost/');
		const html = await (await handler(request)).text();
		expect(streamed).toBe(false);
		expect(prerenderSignal).toBe(request.signal);
		expect(html).toContain(
			'<div id="root"><style data-octane="x">.x{}</style><main>page</main></div>',
		);
	});

	it('emits stylesheet + modulepreload tags for the matched entry from clientAssets', async () => {
		const handler = createHandler(
			makeManifest({
				clientAssets: {
					'/src/Page.tsrx': { js: 'assets/Page-123.js', css: ['assets/Page-123.css'] },
				},
			}) as any,
			baseDeps as any,
		);
		const html = await (await handler(new Request('http://localhost/'))).text();
		expect(html).toContain('<link rel="stylesheet" href="/assets/Page-123.css">');
		expect(html).toContain('<link rel="modulepreload" href="/assets/Page-123.js">');
	});

	it('serves ServerRoutes and 404s unmatched paths when no catch-all exists', async () => {
		const manifest = makeManifest();
		(manifest.routes as unknown[]).splice(1, 1); // drop the catch-all
		const handler = createHandler(manifest as any, baseDeps as any);

		const api = await handler(new Request('http://localhost/api/ping'));
		expect(api.status).toBe(200);
		expect(await api.text()).toBe('pong');

		const missing = await handler(new Request('http://localhost/nope'));
		expect(missing.status).toBe(404);
	});

	it('threads a middleware CSP nonce through renderer and inline hydration scripts', async () => {
		let rendererNonce: string | undefined;
		let rendererSignal: AbortSignal | undefined;
		const nonce = 'request-123"&';
		const handler = createHandler(
			makeManifest({
				middlewares: [
					(context: { state: Map<string, unknown> }, next: () => Promise<Response>) => {
						context.state.set(OCTANE_NONCE_STATE_KEY, nonce);
						return next();
					},
				],
			}) as any,
			{
				...baseDeps,
				renderToReadableStream: async (
					_component: Function,
					_props: unknown,
					options: { nonce?: string; signal?: AbortSignal } | undefined,
				) => {
					rendererNonce = options?.nonce;
					rendererSignal = options?.signal;
					return streamOf('<main>page</main>');
				},
			} as any,
		);
		const request = new Request('http://localhost/');
		const html = await (await handler(request)).text();
		expect(rendererNonce).toBe(nonce);
		expect(rendererSignal).toBe(request.signal);
		expect(html.match(/nonce="request-123&quot;&amp;"/g)).toHaveLength(2);
	});

	it('passes request Context.state to server route props without serializing it', async () => {
		let seenState: Map<string, unknown> | undefined;
		const StatePage = (props: { state?: Map<string, unknown> }) => {
			seenState = props.state;
			return '<main>state</main>';
		};
		const manifest = makeManifest({
			components: { '/src/Page.tsrx': { Page: StatePage } },
			middlewares: [
				(context: { state: Map<string, unknown> }, next: () => Promise<Response>) => {
					context.state.set('loaded.router', 'server-value');
					return next();
				},
			],
		});
		const handler = createHandler(
			manifest as any,
			{
				...baseDeps,
				renderToReadableStream: async (component: Function) => {
					component(undefined, undefined, undefined);
					return streamOf('<main>state</main>');
				},
			} as any,
		);
		const html = await (await handler(new Request('http://localhost/'))).text();
		expect(seenState?.get('loaded.router')).toBe('server-value');
		expect(html).not.toContain('loaded.router');
		expect(html).not.toContain('server-value');
	});

	it('rejects invalid nonce state instead of stringifying unsafe values', async () => {
		const handler = createHandler(
			makeManifest({
				middlewares: [
					(context: { state: Map<string, unknown> }, next: () => Promise<Response>) => {
						context.state.set(OCTANE_NONCE_STATE_KEY, 123);
						return next();
					},
				],
			}) as any,
			baseDeps as any,
		);
		const response = await handler(new Request('http://localhost/'));
		expect(response.status).toBe(500);
	});

	it.each([
		['missing head marker', TEMPLATE.replace('<!--ssr-head-->', '')],
		[
			'duplicate head marker',
			TEMPLATE.replace('<!--ssr-head-->', '<!--ssr-head--><!--ssr-head-->'),
		],
		['missing body marker', TEMPLATE.replace('<!--ssr-body-->', '')],
		[
			'duplicate body marker',
			TEMPLATE.replace('<!--ssr-body-->', '<!--ssr-body--><!--ssr-body-->'),
		],
		['missing closing body', TEMPLATE.replace('</body>', '')],
		['missing hydrate entry marker', TEMPLATE.replace(' data-octane-hydrate', '')],
		[
			'duplicate hydrate entry marker',
			TEMPLATE.replace(
				'</body>',
				'<script type="module" data-octane-hydrate src="/assets/other.js"></script></body>',
			),
		],
	])('rejects a malformed SSR template: %s', (_name, htmlTemplate) => {
		expect(() =>
			createHandler(makeManifest() as any, { ...baseDeps, htmlTemplate } as any),
		).toThrow(/exactly one|hydration module/);
	});
});
