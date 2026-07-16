import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

const ENTRY = ['App', '/src/App.tsrx'] as const;

export default defineConfig({
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ENTRY }),
			new RenderRoute({ path: '/products/:productId', entry: ENTRY }),
			new RenderRoute({ path: '/cart', entry: ENTRY }),
			new RenderRoute({ path: '/checkout', entry: ENTRY }),
			new RenderRoute({ path: '/orders/:orderId', entry: ENTRY }),
		],
	},
});
