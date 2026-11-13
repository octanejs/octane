/**
 * Octane bindings for the data store, with the same names and behavior as
 * `octane/data/react`: moving a component between the two renderers changes
 * only the import. Both renderers given one store share its values, pending
 * edits and rollbacks, including across a `ReactCompat` or `OctaneCompat`
 * boundary.
 *
 * The client and server runtimes each build the binding from their own hooks
 * and context (`octane/data/octane` and `octane/data/octane/server`); the
 * server compiler retargets the client entry to the server one. Both read
 * snapshots through `useSyncExternalStore`, as React does. Reading the store
 * as native signal reads was measured slower on every step that could be
 * measured, and it put read collection around every component's render
 * (benchmarks in the pull request that switched back).
 *
 * The compiler appends each call site's hook slot as the last argument. The
 * hooks forward it to the one slot-keyed hook each of them calls.
 */
import type * as Client from '../index.js';
import type { OctaneNode } from '../index.js';
import type { Write } from './contracts.js';
import type { FeedHandle, FeedSnapshot } from './feeds.js';
import { formViews, type FormView } from './form.js';
import type { PagesHandle, PagesSnapshot } from './pages.js';
import { loading, type DataStore, type ReadHandle, type ReadSnapshot } from './store.js';

type Runtime = Pick<
	typeof Client,
	'createContext' | 'createElement' | 'use' | 'useSyncExternalStore'
>;

export interface OctaneDataBinding {
	DataProvider(props: { store: DataStore; children?: OctaneNode }): OctaneNode;
	useDataStore(): DataStore;
	/**
	 * Read a value from a handle, `store.read(read, input)`, while the component
	 * is mounted. It suspends under the nearest `@pending` or `<Suspense>` until
	 * the first value arrives, and throws a failed first load to the nearest
	 * `@catch` or error boundary; later reloads keep the last value on screen.
	 * With `{ suspend: false }` it returns the live snapshot instead.
	 */
	useRead: {
		<T>(handle: ReadHandle<T>): T;
		<T>(handle: ReadHandle<T>, options: { readonly suspend: false }): ReadSnapshot<T>;
	};
	/**
	 * Show a view a page at a time, from a handle, `pages(store, view, params)`.
	 * `more` says whether another page has rows, and `loadMore` shows it. It
	 * does not suspend.
	 */
	usePages<T>(handle: PagesHandle<T>): PagesSnapshot<T>;
	/**
	 * Listen to a feed, from a handle, `listen(store, feed, params)`, while the
	 * component is mounted, so its events keep the store's reads current.
	 * Components listening to equal arguments share one connection. Returns the
	 * connection's status.
	 */
	useFeed(handle: FeedHandle): FeedSnapshot;
	/**
	 * A native form for a write that declares `form` fields. `key` separates
	 * instances, such as one per row, so each keeps its own state.
	 */
	useForm<I, O>(write: Write<I, O>, key?: string): FormView<I, O, OctaneNode>;
}

/** A read whose input is omitted receives the slot in the input position. */
function split(input: unknown, slot: symbol | undefined): [unknown, symbol | undefined] {
	return typeof input === 'symbol' ? [undefined, input] : [input, slot];
}

export function createOctaneDataBinding(runtime: Runtime): OctaneDataBinding {
	const { createContext, createElement, use, useSyncExternalStore } = runtime;
	const StoreContext = createContext<DataStore | null>(null);

	function useDataStore(): DataStore {
		const store = use(StoreContext);
		if (!store) throw new Error('octane/data: no <DataProvider> above this component');
		return store;
	}

	// Equal arguments resolve to one handle, so a handle's methods are stable across renders.
	function useRead(handle: ReadHandle<any>, options?: unknown, slot?: symbol) {
		const [given, hookSlot] = split(options, slot);
		const snapshot = useSyncExternalStore(
			handle.subscribe,
			handle.getSnapshot,
			handle.getSnapshot,
			hookSlot,
		);
		if ((given as { suspend?: boolean } | undefined)?.suspend === false) return snapshot;
		if (snapshot.status === 'error') throw snapshot.error;
		if (snapshot.status === 'pending') use(loading(useDataStore(), handle));
		return snapshot.value;
	}

	function usePages(handle: PagesHandle<any>, slot?: symbol) {
		return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot, slot);
	}

	function useFeed(handle: FeedHandle, slot?: symbol) {
		return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot, slot);
	}

	const formView = formViews(createElement as (type: string, props: object) => OctaneNode);

	function useForm(write: Write<any, any>, key?: unknown, slot?: symbol) {
		const [formKey, hookSlot] = split(key, slot);
		const handle = useDataStore().form(write, formKey as string | undefined);
		const state = useSyncExternalStore(
			handle.subscribe,
			handle.getSnapshot,
			handle.getSnapshot,
			hookSlot,
		);
		return formView(handle, state);
	}

	return {
		DataProvider: (props) => createElement(StoreContext, { value: props.store }, props.children),
		useDataStore,
		useRead,
		usePages,
		useFeed,
		useForm,
	} as OctaneDataBinding;
}
