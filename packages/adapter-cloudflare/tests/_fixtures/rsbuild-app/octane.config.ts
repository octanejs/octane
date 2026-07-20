import { cloudflare, type CloudflarePlatform } from '@octanejs/adapter-cloudflare';
import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/rsbuild-plugin';

type FixtureEnv = { MARKER: string };

export default defineConfig({
	adapter: cloudflare(),
	router: {
		routes: [
			new ServerRoute({
				path: '/chunk',
				async handler() {
					const { marker } = await import(/* webpackChunkName: "worker" */ './src/worker.js');
					return new Response(marker);
				},
			}),
			new ServerRoute({
				path: '/binding',
				handler(context) {
					const platform = context.platform as CloudflarePlatform<FixtureEnv>;
					return new Response(platform.env.MARKER);
				},
			}),
			new RenderRoute({ path: '/', entry: '/src/Page.tsrx' }),
		],
	},
});
