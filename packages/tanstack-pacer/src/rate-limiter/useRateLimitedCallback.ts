import { useCallback } from 'octane';
import { useRateLimiter } from './useRateLimiter';
import type { ReactRateLimiterOptions } from './useRateLimiter';
import type { AnyFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a rate-limited version of a callback function.
 * The returned function reports whether the call was allowed to execute.
 *
 * @example
 * ```tsx
 * const rateLimitedCall = useRateLimitedCallback(makeApiCall, {
 *   limit: 5,
 *   window: 60000,
 * });
 * ```
 */
export function useRateLimitedCallback<TFn extends AnyFunction>(
	fn: TFn,
	options: ReactRateLimiterOptions<TFn, {}>,
): (...args: Parameters<TFn>) => boolean {
	const rateLimitedFn = useRateLimiter(fn, options).maybeExecute;
	return useCallback((...args) => rateLimitedFn(...args), [rateLimitedFn]);
}
