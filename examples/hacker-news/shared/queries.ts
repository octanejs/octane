// Shared query-option factories over shared/api.ts. Framework-agnostic and
// imported verbatim by BOTH the React (.tsx) and TSRX apps. Each returns a plain
// options object — `queryKey` + `queryFn` — that a component passes to
// `useSuspenseQuery` (from '@octane-ts/query'), which suspends while the query
// loads and returns `{ data }`.
import { stories, item, user } from './api.js';
import type { Feed } from './api.js';
import type { Story, Comment, User } from './types.js';

export const storiesQuery = (feed: Feed) => ({
	queryKey: ['stories', feed] as const,
	queryFn: (): Promise<number[]> => stories(feed),
});

/** Convenience alias for the home feed. */
export const topStoriesQuery = () => storiesQuery('top');

/**
 * Batch query for one PAGE of stories. The id list (`storiesQuery`) is cached per
 * feed and won't re-suspend on a page change, so the page's items are fetched as a
 * single batch keyed by the exact id slice. Because the key changes per page, a
 * page change re-suspends StoriesPage — which lets the router's concurrent
 * navigation transition hold the previous page on screen until the batch resolves
 * (per-item <Suspense> would instead flash a skeleton per row).
 */
export const pageItemsQuery = (ids: number[]) => ({
	queryKey: ['items', ids] as const,
	queryFn: (): Promise<(Story & Comment)[]> => Promise.all(ids.map((id) => item(id))),
});

export const itemQuery = (id: number) => ({
	queryKey: ['item', id] as const,
	queryFn: (): Promise<Story & Comment> => item(id),
});

export const userQuery = (id: string) => ({
	queryKey: ['user', id] as const,
	queryFn: (): Promise<User> => user(id),
});

export type { Story, Comment, User, Feed };
