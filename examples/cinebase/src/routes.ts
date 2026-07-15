import type { Route } from './types.js';

export function parseRoute(value: string): Route {
	const url = new URL(value, 'http://cinebase.local');
	if (url.pathname === '/') {
		return {
			kind: 'catalog',
			search: url.searchParams.get('q') ?? '',
			genre: url.searchParams.get('genre') ?? '',
		};
	}
	if (url.pathname === '/watchlist') return { kind: 'watchlist' };
	const titleMatch = /^\/title\/([a-z0-9-]+)$/.exec(url.pathname);
	if (titleMatch) return { kind: 'title', id: titleMatch[1] };
	return { kind: 'not-found' };
}

export function catalogHref(search: string, genre: string): string {
	const params = new URLSearchParams();
	if (search !== '') params.set('q', search);
	if (genre !== '') params.set('genre', genre);
	const query = params.toString();
	return query === '' ? '/' : `/?${query}`;
}
