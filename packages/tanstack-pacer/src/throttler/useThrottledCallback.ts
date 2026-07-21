import { useCallback } from 'octane';
import { useThrottler } from './useThrottler';
import type { ReactThrottlerOptions } from './useThrottler';
import type { AnyFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a throttled version of a callback function.
 *
 * @example
 * ```tsx
 * const throttledScroll = useThrottledCallback(onScroll, { wait: 200 });
 * ```
 */
export function useThrottledCallback<TFn extends AnyFunction>(
	fn: TFn,
	options: ReactThrottlerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => void {
	const throttledFn = useThrottler(fn, options).maybeExecute;
	return useCallback((...args) => throttledFn(...args), [throttledFn]);
}
