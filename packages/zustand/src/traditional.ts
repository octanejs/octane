// `@octane-ts/zustand/traditional` — zustand's equality-function binding.
//
// `createWithEqualityFn` / `useStoreWithEqualityFn` let a selector pair with a
// custom equality function (e.g. `shallow`). zustand builds these on React's
// `use-sync-external-store/shim/with-selector` — a polyfill whose extra machinery
// (a closure-memoizer in useMemo + a useEffect commit) exists for React's
// CONCURRENT rendering, where a render can be produced and then thrown away.
//
// octane renders synchronously (a render always commits), so none of that is
// needed: we build directly on octane's REAL `useSyncExternalStore`. A ref caches
// the last-returned selection and `getSnapshot` returns that SAME reference while
// the equality fn says the selection is unchanged — so useSyncExternalStore's own
// Object.is check bails out the re-render. One extra base hook (the ref), with its
// slot derived from the wrapper's forwarded slot.
//
// Note: v5 recommends `useShallow` over this equality-fn pattern for object
// slices; `traditional` exists for code that still uses it.
import { useSyncExternalStore, useRef } from 'octane';
import { createStore } from 'zustand/vanilla';
import type { StateCreator, StoreApi } from 'zustand/vanilla';

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
type ReadonlyStoreApi<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;

const identity = <T>(arg: T): T => arg;

// Derive a stable, distinct sub-slot from the wrapper's slot. `Symbol.for` interns
// by description, so the same call site always yields the same sub-slot; the
// `:wsel:` namespace keeps it clear of useSyncExternalStore's `:uses:` slots.
function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':wsel:' + tag) : undefined;
}

interface SelectionCell<U> {
	hasValue: boolean;
	value: U | undefined;
}

export function useStoreWithEqualityFn<S extends ReadonlyStoreApi<unknown>>(
	api: S,
): ExtractState<S>;
export function useStoreWithEqualityFn<S extends ReadonlyStoreApi<unknown>, U>(
	api: S,
	selector: (state: ExtractState<S>) => U,
	equalityFn?: (a: U, b: U) => boolean,
): U;
export function useStoreWithEqualityFn<TState, StateSlice>(
	api: ReadonlyStoreApi<TState>,
	// Runtime args are `[selector?, equalityFn?, slot?]`; the slot is appended by
	// the octane compiler and is always LAST.
	...rest: [
		selector?: (state: TState) => StateSlice,
		equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
		slot?: symbol,
	]
): StateSlice {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const userArgs = slot !== undefined ? rest.slice(0, -1) : rest;
	const selector = (typeof userArgs[0] === 'function' ? userArgs[0] : identity) as (
		state: TState,
	) => StateSlice;
	const equalityFn =
		typeof userArgs[1] === 'function'
			? (userArgs[1] as (a: StateSlice, b: StateSlice) => boolean)
			: undefined;

	const cache = useRef<SelectionCell<StateSlice>>(
		{ hasValue: false, value: undefined },
		subSlot(slot, 'sel'),
	);
	// Returns the cached reference while the selection is "equal" → octane's
	// useSyncExternalStore sees an Object.is-equal snapshot and bails out.
	const select = (state: TState): StateSlice => {
		const next = selector(state);
		const c = cache.current;
		if (c.hasValue) {
			const prev = c.value as StateSlice;
			if (equalityFn ? equalityFn(prev, next) : Object.is(prev, next)) return prev;
		}
		c.hasValue = true;
		c.value = next;
		return next;
	};

	return useSyncExternalStore(
		api.subscribe,
		() => select(api.getState()),
		() => select(api.getInitialState()),
		slot,
	);
}

type UseBoundStoreWithEqualityFn<S extends ReadonlyStoreApi<unknown>> = {
	(): ExtractState<S>;
	<U>(selector: (state: ExtractState<S>) => U, equalityFn?: (a: U, b: U) => boolean): U;
} & S;

type CreateWithEqualityFn = {
	<T, U = T>(
		initializer: StateCreator<T, [], []>,
		defaultEqualityFn?: (a: U, b: U) => boolean,
	): UseBoundStoreWithEqualityFn<StoreApi<T>>;
	<T, U = T>(): (
		initializer: StateCreator<T, [], []>,
		defaultEqualityFn?: (a: U, b: U) => boolean,
	) => UseBoundStoreWithEqualityFn<StoreApi<T>>;
};

const createWithEqualityFnImpl = (<T>(
	createState: StateCreator<T, [], []>,
	defaultEqualityFn?: (a: unknown, b: unknown) => boolean,
) => {
	const api = createStore(createState);
	// The bound hook receives `[selector?, equalityFn?, slot?]`. We resolve the
	// default equality fn, then hand off to useStoreWithEqualityFn with the slot
	// kept last (it re-parses the same trailing-slot shape).
	const useBoundStoreWithEqualityFn = (...args: unknown[]) => {
		const tail = args[args.length - 1];
		const slot = typeof tail === 'symbol' ? tail : undefined;
		const u = slot !== undefined ? args.slice(0, -1) : args;
		const selector = u[0];
		const equalityFn = u.length > 1 ? u[1] : defaultEqualityFn;
		return (useStoreWithEqualityFn as (...a: unknown[]) => unknown)(
			api,
			selector,
			equalityFn,
			slot,
		);
	};
	Object.assign(useBoundStoreWithEqualityFn, api);
	return useBoundStoreWithEqualityFn;
}) as CreateWithEqualityFn;

export const createWithEqualityFn = (<T, U = T>(
	createState?: StateCreator<T, [], []>,
	defaultEqualityFn?: (a: U, b: U) => boolean,
) =>
	createState
		? createWithEqualityFnImpl(
				createState,
				defaultEqualityFn as (a: unknown, b: unknown) => boolean,
			)
		: createWithEqualityFnImpl) as CreateWithEqualityFn;
