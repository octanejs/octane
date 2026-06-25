// @octane-ts/zustand — zustand for the octane renderer.
//
// zustand cleanly separates a framework-agnostic vanilla store (`createStore`)
// from a tiny React binding (`create` + `useStore`) layered on
// `useSyncExternalStore`. This package reuses the vanilla store UNCHANGED (it's
// pure JS — re-exported verbatim from `zustand/vanilla`) and reimplements only
// the binding on top of octane's `useSyncExternalStore`. The public surface
// (`create`, `useStore`, `createStore`) matches zustand 1:1, so existing zustand
// code works by changing the import from `zustand` to `@octane-ts/zustand`.
//
// The one octane-specific detail is hook slots: octane keys hooks by a
// compiler-injected per-call-site Symbol, appended as the LAST argument of every
// `use*` call. A custom hook is just a wrapper that FORWARDS that slot to the
// base hook it composes — which is exactly what `useStore` does below. Because
// the slot is per-call-site, `useFoo(a)` and `useFoo(b)` in one component (or
// the same `useFoo` used twice) stay independent, just like in React.
import { useSyncExternalStore } from 'octane';
import { createStore } from 'zustand/vanilla';
import type { Mutate, StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';

// Re-export the vanilla core so `@octane-ts/zustand` is a drop-in for both the
// store-only (`createStore`) and binding (`create`) entry points of zustand.
export { createStore } from 'zustand/vanilla';
export type * from 'zustand/vanilla';

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
type ReadonlyStoreApi<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;

const identity = <T>(arg: T): T => arg;

export function useStore<S extends ReadonlyStoreApi<unknown>>(api: S): ExtractState<S>;
export function useStore<S extends ReadonlyStoreApi<unknown>, U>(
	api: S,
	selector: (state: ExtractState<S>) => U,
): U;
export function useStore<TState, StateSlice>(
	api: ReadonlyStoreApi<TState>,
	// The compiler appends the call-site slot Symbol after the user args, so the
	// runtime tuple is `[selector?, slot?]`. Both are optional to the author; the
	// slot is supplied by the octane transform.
	...rest: [selector?: (state: TState) => StateSlice, slot?: symbol]
): StateSlice {
	// Resolve the slot the way every base hook does: it's the LAST argument and a
	// Symbol. Counting from the end means `useFoo()` (where the slot lands in the
	// selector position) and `useFoo(sel)` both work.
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const selector = (typeof rest[0] === 'function' ? rest[0] : identity) as (
		state: TState,
	) => StateSlice;
	return useSyncExternalStore(
		api.subscribe,
		() => selector(api.getState()),
		() => selector(api.getInitialState()),
		slot,
	);
}

type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
	(): ExtractState<S>;
	<U>(selector: (state: ExtractState<S>) => U): U;
} & S;

type Create = {
	<T, Mos extends [StoreMutatorIdentifier, unknown][] = []>(
		initializer: StateCreator<T, [], Mos>,
	): UseBoundStore<Mutate<StoreApi<T>, Mos>>;
	<T>(): <Mos extends [StoreMutatorIdentifier, unknown][] = []>(
		initializer: StateCreator<T, [], Mos>,
	) => UseBoundStore<Mutate<StoreApi<T>, Mos>>;
};

const createImpl = (<T>(createState: StateCreator<T, [], []>) => {
	const api = createStore(createState);
	// The bound hook forwards ALL args (selector + the appended slot) straight
	// through to `useStore`. It is NOT compiled by octane (it lives in this
	// dependency), so no slot is injected here — the slot is the one the consumer's
	// `useFoo(...)` call site carries, which is exactly what makes each call-site
	// independent.
	const useBoundStore = (...args: unknown[]) =>
		(useStore as (...a: unknown[]) => unknown)(api, ...args);
	Object.assign(useBoundStore, api);
	return useBoundStore;
}) as Create;

export const create = (<T>(createState?: StateCreator<T, [], []>) =>
	createState ? createImpl(createState) : createImpl) as Create;

export default create;
