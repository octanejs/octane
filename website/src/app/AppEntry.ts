// The RenderRoute entries for @octanejs/vite-plugin. Each export is a thin
// pass-through wrapper (octane component ABI: `(props, scope, extra)`) that
// bakes the route's pathname out of the plugin's `{ params }` — the server
// needs it to pick the per-URL server router, since prerender only forwards
// route params, not the request URL. Calling App DIRECTLY (not via JSX) adds
// no extra component layer, so server markers and client adoption line up.
//
// The plugin's generated client entry does `await import(<this module>)` and
// then immediately `hydrateRoot(target, <export>, { params })` — so the
// top-level await below is what guarantees the client router's matches are
// committed BEFORE the first hydration render (an empty match tree would adopt
// nothing and wipe the server DOM). On the server (ssrLoadModule) the guard
// skips it.
import { App } from './App.tsrx';

type Params = Record<string, string>;

function withPathname(getPathname: (params: Params) => string) {
	return function Root(props: { params?: Params }, scope: unknown, extra: unknown) {
		const params = props?.params ?? {};
		return (App as any)({ pathname: getPathname(params) }, scope, extra);
	};
}

export const Home = withPathname(() => '/');
export const Docs = withPathname(() => '/docs');
export const DocsSlug = withPathname((params) => '/docs/' + (params.slug ?? ''));

if (typeof document !== 'undefined') {
	const { ensureClientRouterReady } = await import('./router-client.ts');
	await ensureClientRouterReady();
}
