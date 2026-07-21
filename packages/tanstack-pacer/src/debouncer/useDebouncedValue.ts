import { useEffect } from 'octane';
import { useDebouncedState } from './useDebouncedState';
import type { ReactDebouncer, ReactDebouncerOptions } from './useDebouncer';
import type { Dispatch, SetStateAction } from '../internal';
import type { DebouncerState } from '@tanstack/pacer/debouncer';

/**
 * An Octane hook that creates a debounced value that updates only after a
 * specified delay. Unlike `useDebouncedState`, this hook automatically tracks
 * changes to the input value and updates the debounced value accordingly.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useDebouncer}).
 *
 * @example
 * ```tsx
 * const [debouncedQuery, debouncer] = useDebouncedValue(searchQuery, {
 *   wait: 500, // Wait 500ms after last change
 * });
 * ```
 */
export function useDebouncedValue<
	TValue,
	TSelected = DebouncerState<Dispatch<SetStateAction<TValue>>>,
>(
	value: TValue,
	options: ReactDebouncerOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: DebouncerState<Dispatch<SetStateAction<TValue>>>) => TSelected,
): [TValue, ReactDebouncer<Dispatch<SetStateAction<TValue>>, TSelected>] {
	const [debouncedValue, setDebouncedValue, debouncer] = useDebouncedState(
		value,
		options,
		selector,
	);

	useEffect(() => {
		setDebouncedValue(value);
	}, [value, setDebouncedValue]);

	return [debouncedValue, debouncer];
}
