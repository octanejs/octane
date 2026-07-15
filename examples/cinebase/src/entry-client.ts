import { hydrateRoot } from 'octane';
import type { NormalizedCacheObject } from '@octanejs/apollo-client';
import { createCinebaseApollo } from './apollo.js';
import { App } from './App.tsrx';
import type { Editorial } from './types.js';
import './styles.css';

const root = document.getElementById('app');
if (root === null) throw new Error('Cinebase requires an #app element');

const cacheElement = document.getElementById('__cinebase_cache');
if (cacheElement === null) throw new Error('Cinebase SSR cache is missing');
const cache = JSON.parse(cacheElement.textContent ?? '{}') as NormalizedCacheObject;
const runtime = createCinebaseApollo('/graphql', cache);
const initialPath = location.pathname + location.search;
const editorialPromise = fetch('/api/editorial').then(async (response): Promise<Editorial> => {
	if (!response.ok) throw new Error(`Editorial request failed (${response.status})`);
	return (await response.json()) as Editorial;
});

// This opt-in delay creates a deterministic window for the hydration-adoption
// journey to type into server HTML. Normal users hydrate immediately.
const hydrateDelay = Number(new URLSearchParams(location.search).get('hydrateDelay') ?? '0');
if (Number.isFinite(hydrateDelay) && hydrateDelay > 0) {
	await new Promise((resolve) => setTimeout(resolve, Math.min(hydrateDelay, 1_000)));
}

hydrateRoot(root, App, {
	client: runtime.client,
	watchlist: runtime.watchlist,
	initialPath,
	editorialPromise,
});
