import { useCallback } from 'octane';
import { useAsyncDebouncer } from './useAsyncDebouncer';
import type { ReactAsyncDebouncerOptions } from './useAsyncDebouncer';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a debounced version of an async callback
 * function. The returned function resolves with the callback's result once
 * the debounced execution runs.
 *
 * @example
 * ```tsx
 * const debouncedSearch = useAsyncDebouncedCallback(searchApi, { wait: 500 });
 * ```
 */
export function useAsyncDebouncedCallback<TFn extends AnyAsyncFunction>(
	fn: TFn,
	options: ReactAsyncDebouncerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
	const asyncDebouncedFn = useAsyncDebouncer(fn, options).maybeExecute;
	return useCallback(
		(...args) => asyncDebouncedFn(...args) as Promise<ReturnType<TFn>>,
		[asyncDebouncedFn],
	);
}
