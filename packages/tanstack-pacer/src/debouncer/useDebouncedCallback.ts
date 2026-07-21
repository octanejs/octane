import { useCallback } from 'octane';
import { useDebouncer } from './useDebouncer';
import type { ReactDebouncerOptions } from './useDebouncer';
import type { AnyFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a debounced version of a callback function.
 * The returned function delays invoking the callback until after the
 * specified wait time has elapsed since its last invocation.
 *
 * @example
 * ```tsx
 * const debouncedSearch = useDebouncedCallback(performSearch, { wait: 500 });
 * ```
 */
export function useDebouncedCallback<TFn extends AnyFunction>(
	fn: TFn,
	options: ReactDebouncerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => void {
	const debouncedFn = useDebouncer(fn, options).maybeExecute;
	return useCallback((...args) => debouncedFn(...args), [debouncedFn]);
}
