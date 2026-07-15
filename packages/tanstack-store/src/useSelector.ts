import { useCallback } from 'octane';
import { useSyncExternalStoreWithSelector } from '@octanejs/redux';
import { splitSlot, subSlot } from './internal';

export interface UseSelectorOptions<TSelected> {
	compare?: (a: TSelected, b: TSelected) => boolean;
}

type SyncExternalStoreSubscribe = Parameters<typeof useSyncExternalStoreWithSelector>[0];

type SelectionSource<T> = {
	get: () => T;
	subscribe: (listener: (value: T) => void) => {
		unsubscribe: () => void;
	};
};

function defaultCompare<T>(a: T, b: T) {
	return a === b;
}

/**
 * Selects a slice of state from an atom or store and subscribes the component
 * to that selection.
 *
 * This is the primary Octane read hook for TanStack Store. It works with any
 * source that exposes `get()` and `subscribe()`, including atoms, readonly
 * atoms, stores, and readonly stores.
 *
 * Omit the selector to subscribe to the whole value.
 *
 * @example
 * ```tsx
 * const count = useSelector(counterStore, (state) => state.count)
 * ```
 *
 * @example
 * ```tsx
 * const value = useSelector(countAtom)
 * ```
 */
export function useSelector<TSource, TSelected = NoInfer<TSource>>(
	source: SelectionSource<TSource>,
	selector?: (snapshot: TSource) => TSelected,
	options?: UseSelectorOptions<TSelected>,
): TSelected;
export function useSelector<TSource, TSelected = NoInfer<TSource>>(
	source: SelectionSource<TSource>,
	...rest: [
		selector?: (snapshot: TSource) => TSelected,
		options?: UseSelectorOptions<TSelected>,
		slot?: symbol,
	]
): TSelected {
	const [user, slot] = splitSlot(rest);
	const selector =
		(user[0] as ((snapshot: TSource) => TSelected) | undefined) ??
		((snapshot: TSource) => snapshot as unknown as TSelected);
	const options = user[1] as UseSelectorOptions<TSelected> | undefined;
	const compare = options?.compare ?? defaultCompare;

	const subscribe: SyncExternalStoreSubscribe = useCallback(
		(handleStoreChange) => {
			const { unsubscribe } = source.subscribe(handleStoreChange);
			return unsubscribe;
		},
		[source],
		subSlot(slot, 'selector:subscribe'),
	);

	const getSnapshot = useCallback(() => source.get(), [source], subSlot(slot, 'selector:snapshot'));

	return useSyncExternalStoreWithSelector(
		subscribe,
		getSnapshot,
		getSnapshot,
		selector,
		compare,
		subSlot(slot, 'selector:external-store'),
	);
}
