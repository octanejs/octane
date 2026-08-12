// Universal-renderer Zustand binding for Octane packages such as @octanejs/three.
// The vanilla store is unchanged; only the renderer-specific subscription hook differs.
import { useSyncExternalStore } from 'octane/universal';
import { createStore } from 'zustand/vanilla';
import type { Mutate, StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';

export { createStore } from 'zustand/vanilla';
export type * from 'zustand/vanilla';

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
type ReadonlyStoreApi<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;
const identity = <T>(value: T): T => value;

export function useStore<S extends ReadonlyStoreApi<unknown>>(api: S): ExtractState<S>;
export function useStore<S extends ReadonlyStoreApi<unknown>, U>(
	api: S,
	selector: (state: ExtractState<S>) => U,
): U;
export function useStore<TState, StateSlice>(
	api: ReadonlyStoreApi<TState>,
	...rest: [selector?: (state: TState) => StateSlice, slot?: symbol]
): StateSlice {
	const tail = rest.at(-1);
	const slot = typeof tail === 'symbol' ? tail : undefined;
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

export type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
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
	const useBoundStore = (...args: unknown[]) =>
		(useStore as (...values: unknown[]) => unknown)(api, ...args);
	Object.assign(useBoundStore, api);
	return useBoundStore;
}) as Create;

export const create = (<T>(createState?: StateCreator<T, [], []>) =>
	createState ? createImpl(createState) : createImpl) as Create;

export default create;
