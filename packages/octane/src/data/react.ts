'use client';

/**
 * React bindings for the data store. A React component and an Octane
 * component given the same store see the same values, pending edits and
 * rollbacks, because the store owns them and neither renderer does.
 */
import { createContext, createElement, use, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Write } from './contracts.js';
import type { FeedHandle, FeedSnapshot } from './feeds.js';
import { formViews, type FormView } from './form.js';
import type { PagesHandle, PagesSnapshot } from './pages.js';
import { loading, type DataStore, type ReadHandle, type ReadSnapshot } from './store.js';

const StoreContext = createContext<DataStore | null>(null);

export function DataProvider(props: { store: DataStore; children?: ReactNode }) {
	return createElement(StoreContext, { value: props.store }, props.children);
}

export function useDataStore(): DataStore {
	const store = use(StoreContext);
	if (!store) throw new Error('octane/data: no <DataProvider> above this component');
	return store;
}

/**
 * Read a value from a handle, `store.read(read, input)`, while the component
 * is mounted. It suspends under the nearest `<Suspense>` until the first value
 * arrives, and throws a failed first load to the nearest error boundary; later
 * reloads keep the last value on screen. With `{ suspend: false }` it returns
 * the live snapshot instead. Equal arguments resolve to one handle, so its
 * methods are stable across renders.
 */
export function useRead<T>(handle: ReadHandle<T>): T;
export function useRead<T>(
	handle: ReadHandle<T>,
	options: { readonly suspend: false },
): ReadSnapshot<T>;
export function useRead<T>(
	handle: ReadHandle<T>,
	options?: { readonly suspend: false },
): T | ReadSnapshot<T> {
	const snapshot = useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
	if (options?.suspend === false) return snapshot;
	if (snapshot.status === 'error') throw snapshot.error;
	if (snapshot.status === 'pending') use(loading(useDataStore(), handle));
	return snapshot.value as T;
}

/**
 * Show a view a page at a time, from a handle, `pages(store, view, params)`.
 * `more` says whether another page has rows, and `loadMore` shows it. It does
 * not suspend.
 */
export function usePages<T>(handle: PagesHandle<T>): PagesSnapshot<T> {
	return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
}

/**
 * Listen to a feed, from a handle, `listen(store, feed, params)`, while the
 * component is mounted, so its events keep the store's reads current.
 * Components listening to equal arguments share one connection. Returns the
 * connection's status.
 */
export function useFeed(handle: FeedHandle): FeedSnapshot {
	return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
}

const formView = formViews<ReactNode>(createElement);

/**
 * A native form for a write that declares `form` fields. `key` separates
 * instances, such as one per row, so each keeps its own state.
 */
export function useForm<I, O>(write: Write<I, O>, key?: string): FormView<I, O, ReactNode> {
	const handle = useDataStore().form(write, key);
	const state = useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
	return formView(handle, state);
}
