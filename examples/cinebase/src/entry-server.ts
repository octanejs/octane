import { renderToPipeableStream } from 'octane/server';
import type { NormalizedCacheObject } from '@octanejs/apollo-client';
import { createCinebaseApollo } from './apollo.js';
import { App } from './App.tsrx';
import { CATALOG_QUERY, TITLE_QUERY } from './graphql.js';
import { parseRoute } from './routes.js';
import type { Editorial } from './types.js';

export interface ServerRender {
	cache: NormalizedCacheObject;
	stream: ReturnType<typeof renderToPipeableStream>;
}

async function preloadRoute(
	client: ReturnType<typeof createCinebaseApollo>['client'],
	url: string,
) {
	const route = parseRoute(url);
	if (route.kind === 'catalog') {
		await client.query({
			query: CATALOG_QUERY,
			variables: { search: route.search, genre: route.genre, recover: false },
		});
	} else if (route.kind === 'title') {
		await client.query({ query: TITLE_QUERY, variables: { id: route.id } });
	} else if (route.kind === 'watchlist') {
		await client.query({
			query: CATALOG_QUERY,
			variables: { search: '', genre: '', recover: true },
		});
	}
}

async function loadEditorial(origin: string): Promise<Editorial> {
	const response = await fetch(`${origin}/api/editorial`);
	if (!response.ok) throw new Error(`Editorial request failed (${response.status})`);
	return (await response.json()) as Editorial;
}

export async function render(url: string, origin: string): Promise<ServerRender> {
	const runtime = createCinebaseApollo(`${origin}/graphql`);
	await preloadRoute(runtime.client, url);
	const cache = runtime.client.extract() as NormalizedCacheObject;
	const editorialPromise = loadEditorial(origin);
	const stream = renderToPipeableStream(App, {
		client: runtime.client,
		watchlist: runtime.watchlist,
		initialPath: url,
		editorialPromise,
	});
	return { cache, stream };
}
