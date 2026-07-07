// @octanejs/vite-plugin config. The plugin owns dev SSR + hydration; page
// routing INSIDE the app is @octanejs/router (a TanStack Router port), so every
// site URL funnels into the same App component, which reads the request `url`
// prop the plugin passes to RenderRoute entries. The `before` middleware
// pre-loads a per-URL server-side router (memory history at the request URL) so
// App can read a loaded match tree synchronously during the SSR shell pass, and
// `preHydrate` commits the CLIENT router's match tree before hydrateRoot so the
// first hydration render adopts the server DOM.
//
// The '/*splat' catch-all SSRs every other URL through the same App (the app
// router decides what "not found" looks like) with a real 404 status; the
// plugin skips Vite-owned requests (/@vite/client, /src/*.ts, …) before route
// matching, so the catch-all never swallows module requests.
import { defineConfig, RenderRoute, type Middleware } from '@octanejs/vite-plugin';
import { vercel } from '@octanejs/adapter-vercel';

// Warm the per-URL server router before the render runs. Dynamic import so
// loading octane.config.ts itself stays cheap; it resolves to the SAME module
// instance the page entry sees (both load through the dev server's SSR module
// graph).
const warmRouter: Middleware = async (context, next) => {
	const { warmServerRouter } = await import('./src/app/router-server.ts');
	await warmServerRouter(context.url.pathname);
	return next();
};

const ENTRY = ['App', '/src/app/App.tsrx'] as const;

export default defineConfig({
	adapter: vercel(),
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ENTRY, before: [warmRouter] }),
			new RenderRoute({ path: '/docs', entry: ENTRY, before: [warmRouter] }),
			new RenderRoute({ path: '/docs/:slug', entry: ENTRY, before: [warmRouter] }),
			new RenderRoute({ path: '/*splat', entry: ENTRY, before: [warmRouter], status: 404 }),
		],
		preHydrate: '/src/app/router-client.ts',
	},
});
