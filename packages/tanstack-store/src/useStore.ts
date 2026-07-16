import { useSelector } from './useSelector';
import { splitSlot } from './internal';
import type { UseSelectorOptions } from './useSelector';

type SelectionSource<T> = {
	get: () => T;
	subscribe: (listener: (value: T) => void) => {
		unsubscribe: () => void;
	};
};

/**
 * Deprecated alias for {@link useSelector}.
 *
 * @example
 * ```tsx
 * const count = useStore(counterStore, (state) => state.count)
 * ```
 *
 * @deprecated Use `useSelector` instead.
 */
export function useStore<TSource, TSelected = NoInfer<TSource>>(
	source: SelectionSource<TSource>,
	selector?: (snapshot: TSource) => TSelected,
	compare?: (a: TSelected, b: TSelected) => boolean,
): TSelected;
export function useStore<TSource, TSelected = NoInfer<TSource>>(
	source: SelectionSource<TSource>,
	...rest: [
		selector?: (snapshot: TSource) => TSelected,
		compare?: (a: TSelected, b: TSelected) => boolean,
		slot?: symbol,
	]
): TSelected {
	const [user, slot] = splitSlot(rest);
	const selector = user[0] as ((snapshot: TSource) => TSelected) | undefined;
	const compare = user[1] as ((a: TSelected, b: TSelected) => boolean) | undefined;

	return (
		useSelector as (
			source: SelectionSource<TSource>,
			selector: ((snapshot: TSource) => TSelected) | undefined,
			options: UseSelectorOptions<TSelected>,
			slot?: symbol,
		) => TSelected
	)(source, selector, { compare }, slot);
}
