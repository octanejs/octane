/**
 * Octane bindings for the data store, with the same names and behavior as
 * `octane/data/react`: moving a component between the two renderers changes
 * only the import. Both renderers given one store share its values, pending
 * edits and rollbacks, including across a `ReactCompat` or `OctaneCompat`
 * boundary.
 *
 * The client and server runtimes each build the binding from their own hooks
 * and context (`octane/data/octane` and `octane/data/octane/server`); the
 * server compiler retargets the client entry to the server one. On the client
 * a read is a native signal read: the renderer subscribes the component that
 * made it, as it does for `signal$` and `query$`, so no hook slot is used. The
 * server reads snapshots through `useSyncExternalStore`.
 *
 * The compiler appends each call site's hook slot as the last argument. The
 * hooks forward it to the one slot-keyed hook each of them calls.
 */
import type * as Client from '../index.js';
import type { OctaneNode } from '../index.js';
import type { Read, View, Write } from './contracts.js';
import { formViews, type FormView } from './form.js';
import type { DataStore, ReadSnapshot } from './store.js';

/** A store value a render can read: a read's handle or a form's. */
export interface Observable {
	getSnapshot(): unknown;
	subscribe(notify: () => void): () => void;
}

type Runtime = Pick<
	typeof Client,
	'createContext' | 'createElement' | 'use' | 'useCallback' | 'useSyncExternalStore'
> & {
	/** Report a render's read of a handle to the renderer, which subscribes the reader. */
	observe?: (handle: Observable) => void;
};

export interface OctaneDataBinding {
	DataProvider(props: { store: DataStore; children?: OctaneNode }): OctaneNode;
	useDataStore(): DataStore;
	/** Observe a read without suspending. The component mounts and unmounts the observation. */
	useReadState: {
		<O>(read: Read<void, O>): ReadSnapshot<O>;
		<T>(read: View<void, T>): ReadSnapshot<T[]>;
		<I, O>(read: Read<I, O>, input: I): ReadSnapshot<O>;
	};
	/**
	 * Read a value, suspending under the nearest `@pending` or `<Suspense>` until
	 * the first one arrives and throwing a failed first load to the nearest
	 * `@catch` or error boundary. Later reloads keep the last value on screen.
	 */
	useRead: {
		<O>(read: Read<void, O>): O;
		<T>(read: View<void, T>): T[];
		<I, O>(read: Read<I, O>, input: I): O;
	};
	/** A stable function that submits a write through the store. */
	useWrite<I, O>(write: Write<I, O>): (input: I) => Promise<O>;
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
	const { createContext, createElement, use, useCallback, useSyncExternalStore, observe } = runtime;
	const StoreContext = createContext<DataStore | null>(null);

	function useDataStore(): DataStore {
		const store = use(StoreContext);
		if (!store) throw new Error('octane/data: no <DataProvider> above this component');
		return store;
	}

	function useReadState(read: Read<any, any>, input?: unknown, slot?: symbol) {
		const [value, hookSlot] = split(input, slot);
		// Equal inputs resolve to one handle, so its methods are stable across renders.
		const handle = useDataStore().read(read, value);
		if (observe) {
			observe(handle);
			return handle.getSnapshot();
		}
		return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot, hookSlot);
	}

	function useRead(read: Read<any, any>, input?: unknown, slot?: symbol) {
		const [value, hookSlot] = split(input, slot);
		const store = useDataStore();
		const snapshot = useReadState(read, value, hookSlot);
		if (snapshot.status === 'error') throw snapshot.error;
		// The load in flight is one promise for every caller, as `use` requires.
		if (snapshot.status === 'pending') use(store.prefetch(read, value));
		return snapshot.value;
	}

	const formView = formViews(createElement as (type: string, props: object) => OctaneNode);

	function useForm(write: Write<any, any>, key?: unknown, slot?: symbol) {
		const [formKey, hookSlot] = split(key, slot);
		const handle = useDataStore().form(write, formKey as string | undefined);
		if (observe) {
			observe(handle);
			return formView(handle, handle.getSnapshot());
		}
		const state = useSyncExternalStore(
			handle.subscribe,
			handle.getSnapshot,
			handle.getSnapshot,
			hookSlot,
		);
		return formView(handle, state);
	}

	function useWrite(write: Write<any, any>, slot?: symbol) {
		const store = useDataStore();
		return useCallback((input: unknown) => store.write(write, input), [store, write], slot);
	}

	return {
		DataProvider: (props) => createElement(StoreContext, { value: props.store }, props.children),
		useDataStore,
		useReadState,
		useRead,
		useWrite,
		useForm,
	} as OctaneDataBinding;
}
