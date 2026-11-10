/**
 * Octane bindings for the data store, with the same names and behavior as
 * `octane/data/react`: moving a component between the two renderers changes
 * only this import. Both renderers given one store share its values, pending
 * edits and rollbacks, including across a `ReactCompat` or `OctaneCompat`
 * boundary.
 *
 * The compiler appends each call site's hook slot as the last argument. The
 * hooks forward it to the one slot-keyed hook each of them calls.
 */
import { createContext, createElement, use, useCallback, useSyncExternalStore } from 'octane';
import type { OctaneNode } from 'octane';
import type { Read, Write } from './contracts.js';
import type { DataStore, ReadSnapshot } from './store.js';

const StoreContext = createContext<DataStore | null>(null);

export function DataProvider(props: { store: DataStore; children?: OctaneNode }) {
	return createElement(StoreContext, { value: props.store }, props.children);
}

export function useDataStore(): DataStore {
	const store = use(StoreContext);
	if (!store) throw new Error('octane/data: no <DataProvider> above this component');
	return store;
}

/** A read whose input is omitted receives the slot in the input position. */
function split(input: unknown, slot: symbol | undefined): [unknown, symbol | undefined] {
	return typeof input === 'symbol' ? [undefined, input] : [input, slot];
}

/** Observe a read without suspending. The component mounts and unmounts the observation. */
export function useReadState<O>(read: Read<void, O>): ReadSnapshot<O>;
export function useReadState<I, O>(read: Read<I, O>, input: I): ReadSnapshot<O>;
export function useReadState<I, O>(read: Read<I, O>, input?: I, slot?: symbol): ReadSnapshot<O> {
	const [value, hookSlot] = split(input, slot);
	// Equal inputs resolve to one handle, so its methods are stable across renders.
	const handle = useDataStore().read(read, value as I);
	return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot, hookSlot);
}

/**
 * Read a value, suspending under the nearest `@pending` or `<Suspense>` until
 * the first one arrives and throwing a failed first load to the nearest
 * `@catch` or error boundary. Later reloads keep the last value on screen.
 */
export function useRead<O>(read: Read<void, O>): O;
export function useRead<I, O>(read: Read<I, O>, input: I): O;
export function useRead<I, O>(read: Read<I, O>, input?: I, slot?: symbol): O {
	const [value, hookSlot] = split(input, slot);
	const store = useDataStore();
	const snapshot = (useReadState as Function)(read, value, hookSlot) as ReadSnapshot<O>;
	if (snapshot.status === 'error') throw snapshot.error;
	// The load in flight is one promise for every caller, as `use` requires.
	if (snapshot.status === 'pending') use(store.prefetch(read, value as I));
	return snapshot.value as O;
}

/** A stable function that submits a write through the store. */
export function useWrite<I, O>(write: Write<I, O>): (input: I) => Promise<O>;
export function useWrite<I, O>(write: Write<I, O>, slot?: symbol): (input: I) => Promise<O> {
	const store = useDataStore();
	return useCallback((input: I) => store.write(write, input), [store, write], slot);
}
