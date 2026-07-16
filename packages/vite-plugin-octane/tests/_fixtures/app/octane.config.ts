import { defineConfig, RenderRoute, OCTANE_NONCE_STATE_KEY } from '@octanejs/vite-plugin';

export default defineConfig({
	compiler: {
		renderers: {
			registry: {
				object: {
					module: '/src/object-renderer.ts',
					server: 'client-only',
					text: 'host',
				},
			},
			rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			boundaries: {
				'@fixture/object-canvas': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
						server: 'omit-child',
					},
				},
			},
		},
	},
	middlewares: [
		async (context, next) => {
			context.state.set(OCTANE_NONCE_STATE_KEY, 'fixture-nonce');
			const response = await next();
			const headers = new Headers(response.headers);
			headers.set(
				'Content-Security-Policy',
				"default-src 'self'; script-src 'self' 'nonce-fixture-nonce'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:",
			);
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		},
	],
	rootBoundary: {
		pending: '/src/RootPending.tsrx',
		catch: ['RootCatch', '/src/RootCatch.tsrx'],
	},
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'], layout: '/src/Layout.tsrx' }),
			new RenderRoute({
				path: '/pages/:slug',
				entry: ['Page', '/src/Page.tsrx'],
				layout: '/src/Layout.tsrx',
			}),
		],
	},
});
