// `@octane-ts/zustand/traditional` — zustand's equality-function binding.
//
// `createWithEqualityFn` / `useStoreWithEqualityFn` let a selector pair with a
// custom equality function (e.g. `shallow`). zustand builds them on React's
// `useSyncExternalStoreWithSelector` shim, which composes FOUR base hooks
// (useRef + useMemo + useSyncExternalStore + useEffect). octane has no such shim,
// so it's reimplemented here on octane's base hooks — the canonical algorithm,
// verbatim, with each internal hook given a distinct slot DERIVED from the single
// compiler-injected slot the wrapper receives (sub-slots that won't collide with
// useSyncExternalStore's own `:uses:*` derivations).
//
// Note: v5 recommends `useShallow` over this equality-fn pattern for object
// slices; `traditional` exists for code that still uses it.
import { useSyncExternalStore, useRef, useMemo, useEffect } from 'octane-ts';
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
	value: U | null;
}

// React's `useSyncExternalStoreWithSelector`, reimplemented on octane's hooks.
function useSyncExternalStoreWithSelector<T, U>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot: (() => T) | undefined,
	selector: (state: T) => U,
	isEqual: ((a: U, b: U) => boolean) | undefined,
	slot: symbol | undefined,
): U {
	const instRef = useRef<SelectionCell<U> | null>(null, subSlot(slot, 'inst'));
	let inst: SelectionCell<U>;
	if (instRef.current === null) {
		inst = { hasValue: false, value: null };
		instRef.current = inst;
	} else {
		inst = instRef.current;
	}

	const [getSelection, getServerSelection] = useMemo(
		() => {
			// Closure-local memo state (intentionally NOT a ref — it must be local to
			// this memoized getSnapshot so distinct copies don't share it).
			let hasMemo = false;
			let memoizedSnapshot: T;
			let memoizedSelection: U;
			const memoizedSelector = (nextSnapshot: T): U => {
				if (!hasMemo) {
					hasMemo = true;
					memoizedSnapshot = nextSnapshot;
					const nextSelection = selector(nextSnapshot);
					if (isEqual !== undefined && inst.hasValue) {
						const currentSelection = inst.value as U;
						if (isEqual(currentSelection, nextSelection)) {
							memoizedSelection = currentSelection;
							return currentSelection;
						}
					}
					memoizedSelection = nextSelection;
					return nextSelection;
				}
				const prevSnapshot = memoizedSnapshot;
				const prevSelection = memoizedSelection;
				if (Object.is(prevSnapshot, nextSnapshot)) return prevSelection;
				const nextSelection = selector(nextSnapshot);
				if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
					memoizedSnapshot = nextSnapshot;
					return prevSelection;
				}
				memoizedSnapshot = nextSnapshot;
				memoizedSelection = nextSelection;
				return nextSelection;
			};
			const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
			const getServerSnapshotWithSelector =
				getServerSnapshot === undefined ? undefined : () => memoizedSelector(getServerSnapshot());
			return [getSnapshotWithSelector, getServerSnapshotWithSelector] as const;
		},
		[getSnapshot, getServerSnapshot, selector, isEqual],
		subSlot(slot, 'memo'),
	);

	const value = useSyncExternalStore(subscribe, getSelection, getServerSelection, slot);

	useEffect(
		() => {
			inst.hasValue = true;
			inst.value = value;
		},
		[value],
		subSlot(slot, 'effect'),
	);

	return value;
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
	return useSyncExternalStoreWithSelector(
		api.subscribe,
		api.getState,
		api.getInitialState,
		selector,
		equalityFn,
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
