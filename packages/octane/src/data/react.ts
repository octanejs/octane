'use client';

/**
 * React bindings for the data store. A React component and an Octane
 * component given the same store see the same values, pending edits and
 * rollbacks, because the store owns them and neither renderer does.
 */
import { createContext, createElement, use, useCallback, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Read, Write } from './contracts.js';
import type { DataStore, ReadSnapshot } from './store.js';

const StoreContext = createContext<DataStore | null>(null);

export function DataProvider(props: { store: DataStore; children?: ReactNode }) {
	return createElement(StoreContext, { value: props.store }, props.children);
}

export function useDataStore(): DataStore {
	const store = use(StoreContext);
	if (!store) throw new Error('octane/data: no <DataProvider> above this component');
	return store;
}

/** Observe a read without suspending. The component mounts and unmounts the observation. */
export function useReadState<O>(read: Read<void, O>): ReadSnapshot<O>;
export function useReadState<I, O>(read: Read<I, O>, input: I): ReadSnapshot<O>;
export function useReadState<I, O>(read: Read<I, O>, input?: I): ReadSnapshot<O> {
	// Equal inputs resolve to one handle, so its methods are stable across renders.
	const handle = useDataStore().read(read, input as I);
	return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
}

/**
 * Read a value, suspending under the nearest `<Suspense>` until the first one
 * arrives and throwing a failed first load to the nearest error boundary.
 * Later reloads keep the last value on screen.
 */
export function useRead<O>(read: Read<void, O>): O;
export function useRead<I, O>(read: Read<I, O>, input: I): O;
export function useRead<I, O>(read: Read<I, O>, input?: I): O {
	const store = useDataStore();
	const snapshot = useReadState(read, input as I);
	if (snapshot.status === 'error') throw snapshot.error;
	// The load in flight is one promise for every caller, as `use` requires.
	if (snapshot.status === 'pending') use(store.prefetch(read, input as I));
	return snapshot.value as O;
}

/** A stable function that submits a write through the store. */
export function useWrite<I, O>(write: Write<I, O>): (input: I) => Promise<O> {
	const store = useDataStore();
	return useCallback((input: I) => store.write(write, input), [store, write]);
}
