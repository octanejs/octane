import { useCallback } from 'react'
import { useThrottler } from './useThrottler'
import type { ReactThrottlerOptions } from './useThrottler'
import type { AnyFunction } from '@tanstack/pacer/types'

/**
 * A React hook that creates a throttled version of a callback function.
 * This hook is essentially a wrapper around the basic `throttle` function
 * that is exported from `@tanstack/pacer`,
 * but optimized for React with reactive options and a stable function reference.
 *
 * The throttled function will execute at most once within the specified wait time period,
 * regardless of how many times it is called. If called multiple times during the wait period,
 * only the first invocation will execute, and subsequent calls will be ignored until
 * the wait period has elapsed.
 *
 * This hook provides a simpler API compared to `useThrottler`, making it ideal for basic
 * throttling needs. However, it does not expose the underlying Throttler instance.
 *
 * For advanced usage requiring features like:
 * - Manual cancellation
 * - Access to execution counts
 * - Custom useCallback dependencies
 *
 * Consider using the `useThrottler` hook instead.
 *
 * @example
 * ```tsx
 * // Throttle a window resize handler
 * const handleResize = useThrottledCallback(() => {
 *   updateLayoutMeasurements();
 * }, {
 *   wait: 100 // Execute at most once every 100ms
 * });
 *
 * // Use in an event listener
 * useEffect(() => {
 *   window.addEventListener('resize', handleResize);
 *   return () => window.removeEventListener('resize', handleResize);
 * }, [handleResize]);
 * ```
 */
export function useThrottledCallback<TFn extends AnyFunction>(
  fn: TFn,
  options: ReactThrottlerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => void {
  const throttledFn = useThrottler(fn, options).maybeExecute
  return useCallback((...args) => throttledFn(...args), [throttledFn])
}
