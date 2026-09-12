import {
	defineConfig,
	RenderRoute,
	ServerRoute,
	OCTANE_NONCE_STATE_KEY,
} from '@octanejs/vite-plugin';
import { acceptUrlAction, fetchHistory } from './src/conversation-history/server.ts';

export default defineConfig({
	server: {
		rpc: {
			allowedOrigins: [
				'http://127.0.0.1',
				...(process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN === undefined
					? []
					: [process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN]),
			],
		},
	},
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
			if (context.request.headers.get('x-fixture-rpc-authorization') === 'deny') {
				return new Response('Unauthorized', { status: 401 });
			}
			context.state.set(OCTANE_NONCE_STATE_KEY, 'fixture-nonce');
			// Deterministic test authentication, not a production identity policy.
			// Each browser run has separate data; RPC arguments never set viewer.
			context.viewer = context.request.headers.get('x-fixture-viewer') ?? 'fixture-viewer';
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
			new RenderRoute({
				path: '/conversation-history',
				entry: ['HistoryApp', '/src/conversation-history/App.tsrx'],
				before: [acceptUrlAction],
			}),
			new ServerRoute({ path: '/conversation-history/frames', handler: fetchHistory }),
			new RenderRoute({
				path: '/conversations',
				entry: ['ConversationApp', '/src/conversation/App.tsrx'],
			}),
			new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'], layout: '/src/Layout.tsrx' }),
			new RenderRoute({
				path: '/pages/:slug',
				entry: ['Page', '/src/Page.tsrx'],
				layout: '/src/Layout.tsrx',
			}),
			new RenderRoute({
				path: '/layout-assets',
				entry: ['Page', '/src/Page.tsrx'],
				layout: '/src/LayoutAssets.tsrx',
			}),
		],
	},
});
