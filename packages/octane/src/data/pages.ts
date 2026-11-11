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
		const [first] = current;
		const rows: T[] = [];
		let shown = 0;
		// Pages show in order: one still loading hides the pages after it.
		for (const part of current) {
			if (part.status !== 'ready') break;
			rows.push(...part.value!);
			shown++;
		}
		const last = current[shown - 1];
		const next = current[shown];
		snapshot = {
			status: first!.status,
			value: first!.status === 'ready' ? rows : undefined,
			error: next?.status === 'error' ? next.error : first!.error,
			refreshing: current.some((part) => part.refreshing),
			stale: current.some((part) => part.stale),
			more: next === undefined ? (last?.more ?? false) : next.status !== 'pending',
			loadingMore: shown > 0 && next?.status === 'pending',
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
