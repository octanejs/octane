// Hacker News Firebase API client. No key, browser-CORS friendly.
// https://github.com/HackerNews/API
import type { Story, Comment, User } from './types.ts';

const BASE = 'https://hacker-news.firebaseio.com/v0';

async function getJSON<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}/${path}.json`);
	if (!res.ok) throw new Error(`HN API ${res.status} for /${path}`);
	return (await res.json()) as T;
}

/** Up to ~500 top-story ids, ranked. */
export function topStories(): Promise<number[]> {
	return getJSON<number[]>('topstories');
}

/** A single item — story OR comment (same endpoint, different shape). */
export function item(id: number): Promise<Story & Comment> {
	return getJSON<Story & Comment>(`item/${id}`);
}

export function user(id: string): Promise<User> {
	return getJSON<User>(`user/${id}`);
}

export type { Story, Comment, User };
