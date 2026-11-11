/**
 * A view read a page at a time, shown as one list. Each page is an ordinary
 * window of the view, `size` rows at `offset = index * size`, so pages share
 * records, and an edit moves a row from one page to the next exactly as it
 * moves rows within one window.
 */
import type { View, ViewInput } from './contracts.js';
import { entryKey, type DataStore, type ReadHandle, type ReadSnapshot } from './store.js';

export interface PagesSnapshot<T> extends ReadSnapshot<T[]> {
	/** The next page is loading. */
	readonly loadingMore: boolean;
	/**
	 * Show the next page, when `more` says there is one. After a page failed to
	 * load, it loads that page again. Resolves once the page has loaded.
	 */
	readonly loadMore: () => Promise<void>;
}

export interface PagesHandle<T> {
	/** Stable between changes, so it can back `useSyncExternalStore`. */
	getSnapshot(): PagesSnapshot<T>;
	/** Observe every page loaded so far, and each one added later. */
	subscribe(notify: () => void): () => void;
	loadMore(): Promise<void>;
	refresh(): Promise<void>;
}

const lists = new WeakMap<DataStore, Map<string, PagesHandle<any>>>();

/**
 * Read `view` `size` rows at a time (its default window when omitted), as one
 * list that grows with `loadMore()`. Equal arguments on one store return one
 * handle, so every component showing that list grows it together.
 */
export function pages<T>(
	store: DataStore,
	view: View<void, T>,
	params?: void,
	size?: number,
): PagesHandle<T>;
export function pages<P, T>(
	store: DataStore,
	view: View<P, T>,
	params: P,
	size?: number,
): PagesHandle<T>;
export function pages<P, T>(
	store: DataStore,
	view: View<P, T>,
	params: P,
	size = view.view.limit,
): PagesHandle<T> {
	let byKey = lists.get(store);
	if (!byKey) lists.set(store, (byKey = new Map()));
	const key = `${entryKey(view.name, params)}\n${size}`;
	let list = byKey.get(key);
	if (!list) byKey.set(key, (list = createPages(store, view, params, size)));
	return list;
}

function createPages<P, T>(
	store: DataStore,
	view: View<P, T>,
	params: P,
	size: number,
): PagesHandle<T> {
	const pages: ReadHandle<T[]>[] = [];
	const listeners = new Set<() => void>();
	/** Each page's subscription, while anything observes the list. */
	const stops: Array<() => void> = [];
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	const inputAt = (index: number) =>
		({ ...(params as object), offset: index * size, limit: size }) as ViewInput<P>;
	const add = () => {
		const page = store.read(view, inputAt(pages.length));
		pages.push(page);
		if (listeners.size > 0) stops.push(page.subscribe(notify));
	};
	add();

	let parts: ReadSnapshot<T[]>[] = [];
	let snapshot: PagesSnapshot<T> | null = null;

	function loadMore(): Promise<void> {
		const last = pages[pages.length - 1]!;
		const state = last.getSnapshot();
		if (state.status === 'error') return last.refresh();
		if (state.status !== 'ready' || !state.more) return Promise.resolve();
		const index = pages.length;
		add();
		notify();
		return store.prefetch(view, inputAt(index));
	}

	function getSnapshot(): PagesSnapshot<T> {
		const current = pages.map((page) => page.getSnapshot());
		if (snapshot && current.every((part, index) => part === parts[index])) return snapshot;
		parts = current;
		const first = current[0]!;
		const last = current[current.length - 1]!;
		const rows: T[] = [];
		let holes = false;
		// A page that is not ready, such as an expired one reloading, leaves only
		// its own rows out: the pages after it are still current.
		for (const part of current) {
			if (part.status === 'ready') rows.push(...part.value!);
			else if (part !== last) holes = true;
		}
		const ready = current.some((part) => part.status === 'ready');
		snapshot = {
			status: ready ? 'ready' : first.status,
			value: ready ? rows : undefined,
			error: current.find((part) => part.status === 'error')?.error ?? first.error,
			refreshing: holes || current.some((part) => part.refreshing),
			stale: current.some((part) => part.stale),
			more: last.status === 'ready' ? last.more : last.status === 'error',
			loadingMore: current.length > 1 && last.status === 'pending',
			loadMore,
		};
		return snapshot;
	}

	return {
		getSnapshot,
		subscribe(listener) {
			if (listeners.size === 0) for (const page of pages) stops.push(page.subscribe(notify));
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) for (const stop of stops.splice(0)) stop();
			};
		},
		loadMore,
		refresh: () => Promise.all(pages.map((page) => page.refresh())).then(() => {}),
	};
}
