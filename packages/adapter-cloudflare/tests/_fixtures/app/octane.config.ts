import { Buffer } from 'node:buffer';
import { cloudflare, type CloudflarePlatform } from '@octanejs/adapter-cloudflare';
import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/vite-plugin';

type FixtureEnv = { MARKER: string };

export default defineConfig({
	adapter: cloudflare(),
	router: {
		routes: [
			new ServerRoute({
				path: '/node-compat',
				handler() {
					return new Response(Buffer.from('node-compat').toString('base64'));
				},
			}),
			new ServerRoute({
				path: '/binding',
				handler(context) {
					const platform = context.platform as CloudflarePlatform<FixtureEnv>;
					platform.ctx.waitUntil(Promise.resolve());
					return new Response(platform.env.MARKER);
				},
			}),
			new RenderRoute({ path: '/', entry: '/src/Page.tsrx' }),
			new RenderRoute({ path: '/*path', entry: '/src/Page.tsrx', status: 404 }),
		],
	},
});
