// @octanejs/vite-plugin config. The plugin owns dev SSR + hydration; page
// routing INSIDE the app is @octanejs/router (a TanStack Router port), so every
// site URL funnels into the same App via per-route entry exports that bake the
// request pathname (see src/app/AppEntry.ts). The `before` middleware pre-loads
// a per-URL server-side router (memory history at the request URL) so App can
// read a loaded match tree synchronously during prerender.
//
// NOTE (gap): a catch-all route ('/*splat') is NOT usable here — the plugin's
// dev middleware runs before Vite's transform middleware, so a catch-all
// swallows every module/asset request (/src/*.ts, /@vite/client, …) and SSRs
// an error page instead. Routes must be enumerated; unknown URLs get the dev
// server's plain 404 rather than the app's NotFound page.
import { defineConfig, RenderRoute, type Middleware } from '@octanejs/vite-plugin';

// Warm the per-URL server router before the render runs. Dynamic import so
// loading octane.config.ts itself stays cheap; it resolves to the SAME module
// instance the page entry sees (both load through the dev server's SSR module
// graph).
const warmRouter: Middleware = async (context, next) => {
	const { warmServerRouter } = await import('./src/app/router-server.ts');
	await warmServerRouter(context.url.pathname);
	return next();
};

const ENTRY = '/src/app/AppEntry.ts';

export default defineConfig({
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ['Home', ENTRY], before: [warmRouter] }),
			new RenderRoute({ path: '/docs', entry: ['Docs', ENTRY], before: [warmRouter] }),
			new RenderRoute({ path: '/docs/:slug', entry: ['DocsSlug', ENTRY], before: [warmRouter] }),
		],
	},
});
