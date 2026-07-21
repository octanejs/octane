import { useState } from 'octane';
import { useDebouncer } from './useDebouncer';
import type { ReactDebouncer, ReactDebouncerOptions } from './useDebouncer';
import type { Dispatch, SetStateAction } from '../internal';
import type { DebouncerState } from '@tanstack/pacer/debouncer';

/**
 * An Octane hook that creates a debounced state value, combining `useState`
 * with debouncing functionality. Returns a tuple of the current debounced
 * value, a debounced updater, and the debouncer instance.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useDebouncer}).
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm, debouncer] = useDebouncedState('', {
 *   wait: 500,
 * });
 * ```
 */
export function useDebouncedState<
	TValue,
	TSelected = DebouncerState<Dispatch<SetStateAction<TValue>>>,
>(
	value: TValue,
	options: ReactDebouncerOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: DebouncerState<Dispatch<SetStateAction<TValue>>>) => TSelected,
): [
	TValue,
	Dispatch<SetStateAction<TValue>>,
	ReactDebouncer<Dispatch<SetStateAction<TValue>>, TSelected>,
] {
	const [debouncedValue, setDebouncedValue] = useState(value);
	const debouncer = useDebouncer(setDebouncedValue, options, selector);
	return [debouncedValue, debouncer.maybeExecute, debouncer];
}
