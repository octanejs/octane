import { useCallback } from 'octane';
import { useAsyncDebouncer } from './useAsyncDebouncer';
import type { ReactAsyncDebouncerOptions } from './useAsyncDebouncer';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a debounced version of an async callback
 * function. The returned function resolves with the callback's result once
 * the debounced execution runs. Suppressed or disabled calls may resolve with
 * undefined when no prior result is available.
 *
 * @example
 * ```tsx
 * const debouncedSearch = useAsyncDebouncedCallback(searchApi, { wait: 500 });
 * ```
 */
export function useAsyncDebouncedCallback<TFn extends AnyAsyncFunction>(
	fn: TFn,
	options: ReactAsyncDebouncerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<Awaited<ReturnType<TFn>> | undefined> {
	const asyncDebouncedFn = useAsyncDebouncer(fn, options).maybeExecute;
	return useCallback((...args) => asyncDebouncedFn(...args), [asyncDebouncedFn]);
}
