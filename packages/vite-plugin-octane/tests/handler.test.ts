// createHandler unit tests — the production handler's pure assembly decisions
// (template splitting, hydration payload shape, status, preload tags, the
// buffered fallback, server routes, 404) with stub renderers. The real-render
// byte-compat path is covered end-to-end in production.test.ts.
import { describe, it, expect } from 'vitest';
import { createHandler } from '../src/server/production.js';
import { RenderRoute, ServerRoute } from '../src/routes.js';

const TEMPLATE = `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" src="/assets/hydrate-abc.js"></script></body></html>`;

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
		const deps = {
			...baseDeps,
			renderToReadableStream: async () => {
				streamed = true;
				return streamOf('');
			},
		};
		const handler = createHandler(makeManifest({ render: 'buffered' }) as any, deps as any);
		const html = await (await handler(new Request('http://localhost/'))).text();
		expect(streamed).toBe(false);
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
});
