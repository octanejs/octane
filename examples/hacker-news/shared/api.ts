// Hacker News Firebase API client. No key, browser-CORS friendly.
// https://github.com/HackerNews/API
import type { Story, Comment, User } from './types.js';

const BASE = import.meta.env.VITE_HN_API_BASE || 'https://hacker-news.firebaseio.com/v0';

async function getJSON<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}/${path}.json`);
	if (!res.ok) throw new Error(`HN API ${res.status} for /${path}`);
	return (await res.json()) as T;
}

/** The story feeds HN exposes as `/v0/<feed>.json` -> an array of ids. */
export type Feed = 'top' | 'new' | 'ask' | 'show' | 'jobs';

const FEED_ENDPOINT: Record<Feed, string> = {
	top: 'topstories',
	new: 'newstories',
	ask: 'askstories',
	show: 'showstories',
	jobs: 'jobstories',
};

/** Up to ~200-500 story ids for a feed, ranked. */
export function stories(feed: Feed): Promise<number[]> {
	return getJSON<number[]>(FEED_ENDPOINT[feed]);
}

/** Up to ~500 top-story ids, ranked. (Convenience wrapper over `stories`.) */
export function topStories(): Promise<number[]> {
	return stories('top');
}

/** A single item — story OR comment (same endpoint, different shape). */
export function item(id: number): Promise<Story & Comment> {
	return getJSON<Story & Comment>(`item/${id}`);
}

export function user(id: string): Promise<User> {
	return getJSON<User>(`user/${id}`);
}

export type { Story, Comment, User };
