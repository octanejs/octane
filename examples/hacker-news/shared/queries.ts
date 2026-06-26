// Shared query-option factories over shared/api.ts. Framework-agnostic and
// imported verbatim by BOTH the React (.tsx) and TSRX apps. Each returns a plain
// options object — `queryKey` + `queryFn` — that a component passes to
// `useSuspenseQuery` (from '@octane-ts/query'), which suspends while the query
// loads and returns `{ data }`.
import { topStories, item, user } from './api.ts';
import type { Story, Comment, User } from './types.ts';

export const topStoriesQuery = () => ({
	queryKey: ['topstories'] as const,
	queryFn: (): Promise<number[]> => topStories(),
});

export const itemQuery = (id: number) => ({
	queryKey: ['item', id] as const,
	queryFn: (): Promise<Story & Comment> => item(id),
});

export const userQuery = (id: string) => ({
	queryKey: ['user', id] as const,
	queryFn: (): Promise<User> => user(id),
});

export type { Story, Comment, User };
