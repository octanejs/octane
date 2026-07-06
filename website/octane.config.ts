// @octanejs/vite-plugin config. The plugin owns dev SSR + hydration; page
// routing INSIDE the app is @octanejs/router (a TanStack Router port), so every
// URL funnels into the single App entry via a catch-all RenderRoute. The
// `before` middleware pre-loads a server-side router (memory history at the
// request URL) so App can read a loaded match tree synchronously during
// prerender — see src/app/router-server.ts.
import { defineConfig, RenderRoute, type Middleware } from '@octanejs/vite-plugin';

// Warm the per-URL server router before the render runs. Dynamic import so
// loading octane.config.ts itself stays cheap (the app graph loads on demand);
// it resolves to the SAME module instance the page entry sees (both load
// through the dev server's SSR module graph).
const warmRouter: Middleware = async (context, next) => {
	const { warmServerRouter } = await import('./src/app/router-server.ts');
	await warmServerRouter(context.url.pathname);
	return next();
};

const appEntry = ['App', '/src/app/AppEntry.ts'] as const;

export default defineConfig({
	router: {
		routes: [
			// '/' and '/*splat' both render the same octane app; @octanejs/router
			// resolves the actual page ('/*splat' alone does not match '/').
			new RenderRoute({ path: '/', entry: appEntry, before: [warmRouter] }),
			new RenderRoute({ path: '/*splat', entry: appEntry, before: [warmRouter] }),
		],
	},
});
