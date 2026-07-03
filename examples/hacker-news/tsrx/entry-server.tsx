// SSR entry (TSRX app). For each request the dev/prod server calls render(url):
// build a FRESH server router (memory history at that URL + isServer:true) and
// load it — `loadServerRouter` follows any redirect the router issues (the feed
// routes normalize `/` → `/?page=1`) so the active route is known. Then octane's
// async render() resolves the route's useSuspenseQuery into a per-request
// QueryClient (it awaits suspended queries, bounded by the suspense timeout).
// dehydrate(qc) serializes that cache so the client can seed it (no refetch).
import { render as renderToString } from 'octane/server';
import { QueryClient, dehydrate } from '@octanejs/query';
import { loadServerRouter } from '../shared/routes.js';
import { makeRouter } from './routes.js';
import { App } from './App.tsrx';

export interface RenderResult {
	head: string;
	body: string;
	css: string;
	/** Dehydrated query cache → injected as #__octane_data, hydrated on the client. */
	state: unknown;
}

export async function render(url: string): Promise<RenderResult> {
	// One QueryClient per request. The route loaders PREFETCH this route's queries
	// into it during `loadServerRouter` (router.load()), so by render() the cache
	// is warm and useSuspenseQuery reads it without suspending mid-render.
	const queryClient = new QueryClient();

	// Build + load a server router for this URL (prefetching into queryClient),
	// following any redirect the router issues.
	const router = await loadServerRouter(makeRouter, url, queryClient);

	// render() takes the component FUNCTION + props (it calls component(props, …)),
	// NOT a JSX descriptor — so pass App directly with the per-request instances.
	const { head, body, css } = await renderToString(App, { router, queryClient });

	// dehydrate() captures the warm cache so the client hydrates from it (no flash).
	return { head, body, css, state: dehydrate(queryClient) };
}
