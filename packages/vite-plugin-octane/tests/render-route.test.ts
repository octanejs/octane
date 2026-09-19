import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '@octanejs/app-core/production';
import * as serverRuntime from 'octane/server';
import { prerender } from 'octane/static';
import { handleRenderRoute } from '../src/server/render-route.js';
import { RenderRoute, ServerRoute } from '../src/routes.js';

const TEMPLATE =
	'<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body></html>';

function payload(html: string) {
	return html.match(/<script id="__octane_data"[^>]*>([\s\S]*?)<\/script>/)![1];
}

it.each(
	[false, true].flatMap((withBuild) =>
		[false, true].flatMap((defaults) =>
			(['streaming', 'buffered'] as const).map((render) => ({ withBuild, defaults, render })),
		),
	),
)(
	'emits the same script-safe hydration data in dev and production ($withBuild, $defaults, $render)',
	async ({ withBuild, defaults, render }) => {
		const root = await mkdtemp(join(tmpdir(), 'octane-route-data-'));
		try {
			await writeFile(join(root, 'index.html'), TEMPLATE);
			const route = new RenderRoute({
				path: '/posts/:id',
				entry: ['Post', '/src/Post.tsrx'],
				layout: defaults ? undefined : '/src/Layout.tsrx',
			});
			const routes = [new ServerRoute({ path: '/api', handler: () => new Response('api') }), route];
			const clientBuild = withBuild
				? {
						version: 1 as const,
						buildId: 'build</script>$&',
						mode: 'development' as const,
						capabilities: { independentHydration: false },
					}
				: undefined;
			const preHydrate = defaults ? null : '/src/prepare</script>.ts';
			const rootBoundaryEntries = defaults
				? undefined
				: { pending: { path: '/src/Pending.tsrx', exportName: 'Pending' }, catch: null };
			const modules = {
				'octane/server': serverRuntime,
				'/src/Post.tsrx': { Post: () => 'page' },
				'/src/Layout.tsrx': { default: () => 'layout' },
				'/src/Pending.tsrx': { Pending: () => 'pending' },
			};
			const vite = {
				config: { root },
				ssrLoadModule: async (id: string) => modules[id as keyof typeof modules],
				transformIndexHtml: async (_path: string, html: string) => html,
				ssrFixStacktrace() {},
			};
			const handler = createHandler(
				{
					routes,
					components: { '/src/Post.tsrx': modules['/src/Post.tsrx'] },
					layouts: { '/src/Layout.tsrx': modules['/src/Layout.tsrx'] },
					middlewares: [],
					preHydrate,
					rootBoundaryEntries,
					clientBuild,
					render,
				},
				{
					...serverRuntime,
					renderToReadableStream: (component, props, options) =>
						serverRuntime.renderToReadableStream(component as () => string, props, options),
					htmlTemplate: TEMPLATE.replace(
						'</body>',
						'<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body>',
					),
					prerender: (component, props, options) =>
						prerender(component as () => string, props, options),
				},
			);
			const request = new Request('https://example.test/posts/%3C%2Fscript%3E?query=$%26');
			const dev = await handleRenderRoute(
				route,
				{
					request,
					url: new URL(request.url),
					params: { id: '</script>' },
					state: new Map(),
				} as any,
				vite as any,
				{
					router: { routes, preHydrate },
					rootBoundary: { pending: defaults ? undefined : ['Pending', '/src/Pending.tsrx'] },
				} as any,
				undefined,
				withBuild ? () => clientBuild! : undefined,
			);
			const prod = await handler(request);
			expect(dev.status).toBe(200);
			expect(prod.status).toBe(200);
			const devData = payload(await dev.text());
			const prodData = payload(await prod.text());
			// Request identities deliberately differ; all other serialized bytes share
			// the route contract, including key order and inline-script escaping.
			const normalize = (text: string) =>
				text.replace(/"documentId":"[^"]*"/, '"documentId":"request-document"');
			expect(normalize(devData)).toBe(normalize(prodData));
			expect(devData).not.toContain('</script>');
			expect(devData).toContain('\\u003c/script\\u003e');
			const parsed = JSON.parse(devData);
			expect(parsed).toMatchObject({
				entry: '/src/Post.tsrx',
				exportName: 'Post',
				layout: defaults ? null : '/src/Layout.tsrx',
				routeIndex: 0,
				params: { id: '</script>' },
				url: '/posts/%3C%2Fscript%3E?query=$%26',
				preHydrate,
				rootBoundary: rootBoundaryEntries ?? { pending: null, catch: null },
			});
			if (withBuild) {
				expect(parsed.clientBuild).toEqual(clientBuild);
				expect(parsed.streamedSignals.buildId).toBe(clientBuild!.buildId);
				expect(parsed.streamedSignals.documentId).not.toBe(
					JSON.parse(prodData).streamedSignals.documentId,
				);
			} else {
				expect(parsed).not.toHaveProperty('clientBuild');
				expect(parsed).not.toHaveProperty('streamedSignals');
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
);

describe('dev SSR error page', () => {
	it('shows the module path, not the raw tuple, for a tuple-configured route', async () => {
		// A route using the [exportName, modulePath] tuple entry form.
		const route = new RenderRoute({ path: '/posts/:id', entry: ['Post', '/src/Post.tsrx'] });

		// Make the render throw so we get the 500 error page. ssrLoadModule is the
		// first thing handleRenderRoute awaits, so throwing here is enough.
		const vite = {
			ssrLoadModule: () => {
				throw new Error('boom');
			},
		};

		const response = await handleRenderRoute(route, {} as any, vite as any);
		expect(response.status).toBe(500);

		const html = await response.text();
		// Should show the module path, not the whole tuple joined as "Post,/src/Post.tsrx".
		expect(html).toContain('Route: /posts/:id → /src/Post.tsrx');
		expect(html).not.toContain('Post,/src/Post.tsrx');
	});
});
