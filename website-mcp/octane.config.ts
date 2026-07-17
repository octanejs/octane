// @octanejs/vite-plugin config for the remote MCP server. One RenderRoute (the
// human-facing landing page) satisfies the metaframework's SSR template
// requirement; everything agents talk to is a ServerRoute. Route definitions
// live in src/server/routes.ts — their handlers dynamically import the heavy
// modules (MCP SDK, compiler, docs snapshot) so loading this config stays
// cheap in every mode (dev reloads it per matched request).
import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';
import { vercel } from '@octanejs/adapter-vercel';
import { serverRoutes } from './src/server/routes.ts';

export default defineConfig({
	adapter: vercel({ serverless: { runtime: 'nodejs24.x' } }),
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ['Landing', '/src/app/Landing.tsrx'] }),
			...serverRoutes,
		],
	},
});
