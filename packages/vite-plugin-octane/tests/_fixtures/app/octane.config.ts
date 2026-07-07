import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

export default defineConfig({
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
