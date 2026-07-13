import { defineConfig, RenderRoute, OCTANE_NONCE_STATE_KEY } from '@octanejs/vite-plugin';

export default defineConfig({
	middlewares: [
		(context, next) => {
			context.state.set(OCTANE_NONCE_STATE_KEY, 'fixture-nonce');
			return next();
		},
	],
	rootBoundary: {
		pending: '/src/RootPending.tsrx',
		catch: ['RootCatch', '/src/RootCatch.tsrx'],
	},
	router: {
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
