import { defineConfig, RenderRoute } from '@octanejs/app-core';
import { threeRenderers } from '@octanejs/three/config';

export default defineConfig({
	build: {
		outDir: process.env.OCTANE_THREE_SSR_OUTDIR ?? 'dist',
		minify: false,
	},
	compiler: {
		renderers: threeRenderers,
	},
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'] }),
			new RenderRoute({ path: '/:mode', entry: ['Page', '/src/Page.tsrx'] }),
		],
	},
	server: { render: 'streaming' },
});
