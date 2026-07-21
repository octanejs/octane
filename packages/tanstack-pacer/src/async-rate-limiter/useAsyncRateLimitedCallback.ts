import { useCallback } from 'octane';
import { useAsyncRateLimiter } from './useAsyncRateLimiter';
import type { ReactAsyncRateLimiterOptions } from './useAsyncRateLimiter';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a rate-limited version of an async callback
 * function.
 *
 * @example
 * ```tsx
 * const rateLimitedFetch = useAsyncRateLimitedCallback(fetchData, {
 *   limit: 5,
 *   window: 60000,
 * });
 * ```
 */
export function useAsyncRateLimitedCallback<TFn extends AnyAsyncFunction>(
	fn: TFn,
	options: ReactAsyncRateLimiterOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
	const asyncRateLimitedFn = useAsyncRateLimiter(fn, options).maybeExecute;
	return useCallback(
		(...args) => asyncRateLimitedFn(...args) as Promise<ReturnType<TFn>>,
		[asyncRateLimitedFn],
	);
}
