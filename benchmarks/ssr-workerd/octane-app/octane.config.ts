import { cloudflare } from '@octanejs/adapter-cloudflare';
import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

// The real deployment shape: one RenderRoute per scenario (fixed at the
// route so the page component needs no request plumbing), built by the
// vite-plugin's production pipeline and wrapped in the Cloudflare adapter's
// module Worker.
export default defineConfig({
	adapter: cloudflare(),
	router: {
		routes: [
			new RenderRoute({ path: '/staggered', entry: '/src/PageStaggered.tsrx' }),
			new RenderRoute({ path: '/all-fast', entry: '/src/PageAllFast.tsrx' }),
		],
	},
});
