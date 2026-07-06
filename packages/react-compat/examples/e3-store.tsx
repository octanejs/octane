// E3 — HARDER (but still bridgeable-with-rewrites). A mini external store
// binding — the shape of zustand/valtio/redux. Exercises the highest-value
// parity surface: `useSyncExternalStore` (React-19 3-arg shape) + `memo` +
// a custom `use*` hook that the compiler must slot and forward.
//
// `useDebugValue` is deliberately included: it does not exist in Octane, so
// the bridger must rewrite it to a no-op — a `status: rewrite` case.
import { useSyncExternalStore, useDebugValue, memo } from 'react';

export type Store<T> = {
	getState: () => T;
	setState: (fn: (s: T) => T) => void;
	subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
	let state = initial;
	const listeners = new Set<() => void>();
	return {
		getState: () => state,
		setState: (fn) => {
			state = fn(state);
			listeners.forEach((l) => l());
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
	const value = useSyncExternalStore(
		store.subscribe,
		() => selector(store.getState()),
		() => selector(store.getState()),
	);
	useDebugValue(value);
	return value;
}

export const CountDisplay = memo(function CountDisplay(props: { store: Store<{ count: number }> }) {
	const count = useStore(props.store, (s) => s.count);
	return <span className="count">{count}</span>;
});

// Same binding, without memo — to isolate whether memo interacts with the
// store-driven update path.
export function CountView(props: { store: Store<{ count: number }> }) {
	const count = useStore(props.store, (s) => s.count);
	return <span className="view">{count}</span>;
}
