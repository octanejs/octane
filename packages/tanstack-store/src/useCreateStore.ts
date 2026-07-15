import { useState } from 'octane';
import { createStore } from '@tanstack/store';
import type { ReadonlyStore, Store, StoreActionMap, StoreActionsFactory } from '@tanstack/store';
import { splitSlot } from './internal';

type NonFunction<T> = T extends (...args: Array<any>) => any ? never : T;

/**
 * Creates a stable store instance for the lifetime of the component.
 *
 * Pass an initial value to create a writable store, or a getter function to
 * create a readonly derived store. This hook mirrors the overloads from
 * {@link createStore}, but ensures the store is only created once per mount.
 *
 * @example
 * ```tsx
 * const counterStore = useCreateStore({ count: 0 })
 * ```
 */
export function useCreateStore<T>(getValue: (prev?: NoInfer<T>) => T): ReadonlyStore<T>;
export function useCreateStore<T>(initialValue: T): Store<T>;
export function useCreateStore<T, TActions extends StoreActionMap>(
	initialValue: NonFunction<T>,
	actions: StoreActionsFactory<T, TActions>,
): Store<T, TActions>;
export function useCreateStore<T, TActions extends StoreActionMap>(
	valueOrFn: T | ((prev?: T) => T),
	...rest: [actions?: StoreActionsFactory<T, TActions>, slot?: symbol]
): Store<T, TActions> | Store<T> | ReadonlyStore<T> {
	const [user, slot] = splitSlot(rest);
	const actions = user[0] as StoreActionsFactory<T, TActions> | undefined;
	const [store] = useState<Store<T, TActions> | Store<T> | ReadonlyStore<T>>(() => {
		if (typeof valueOrFn === 'function') {
			return createStore(valueOrFn as (prev?: NoInfer<T>) => T);
		}

		if (actions) {
			return createStore(valueOrFn as NonFunction<T>, actions);
		}

		return createStore(valueOrFn);
	}, slot);

	return store;
}
