// Client entry (JSX app). Two modes, chosen by whether the server pre-rendered:
//
//  - SSR + hydrate: the server rendered the route DOM into #app and inlined its
//    dehydrated query cache as #__octane_data. We seed that cache into the
//    QueryClient (hydrate) BEFORE the first render, so the route's
//    useSuspenseQuery reads it synchronously — no refetch, no @pending flash, no
//    mismatch — then hydrateRoot() adopts the existing server DOM.
//  - Client-only (plain `vite`, no SSR seed): there is no server DOM to adopt, so
//    we createRoot().render() a fresh tree — the original client-only behavior.
import 'virtual:stylex.css';
import { createRoot, hydrateRoot } from 'octane';
import { QueryClient, hydrate } from '@octanejs/tanstack-query';
import { makeRouter } from './routes.js';
import { App } from './App.js';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root in index.html');

// The dehydrated cache the server inlined (the `<` chars were escaped). Its
// presence is also our signal that the page arrived server-rendered.
const dataEl = document.getElementById('__octane_data');
const state = dataEl ? JSON.parse(dataEl.textContent || 'null') : null;

const router = makeRouter(); // browser history + reactive stores (defaults)
const queryClient = new QueryClient();

// Hydrate the SAME tree the server rendered: `<App>` (the server entry calls
// render(App, …)). Rendering the inner `<QueryClientProvider><RouterProvider/>`
// directly would drop App's wrapper component, leaving the client tree one layer
// shallower than the server's — a structural mismatch that desyncs the hydration
// cursor (every descendant adopts the wrong server node).
const tree = <App router={router} queryClient={queryClient} />;

if (dataEl) {
	// Seed the query cache from the server's dehydrated state up front (an explicit
	// hydrate, not the <HydrationBoundary> wrapper), so the first hydration render
	// of the route's useSuspenseQuery is a cache hit and matches the server DOM.
	hydrate(queryClient, state);
	// `router.load()` is the binding's render-readiness boundary: once it resolves,
	// active matches have committed even when a platform View Transition deferred
	// the update callback, so hydration can begin without polling router internals.
	await router.load();
	hydrateRoot(container, tree);
} else {
	await router.load();
	createRoot(container).render(tree);
}
