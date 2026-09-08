import { useCallback } from 'react'
import { useAsyncThrottler } from './useAsyncThrottler'
import type { ReactAsyncThrottlerOptions } from './useAsyncThrottler'
import type { AnyAsyncFunction } from '@tanstack/pacer/types'

/**
 * A React hook that creates a throttled version of an async callback function.
 * This hook is a convenient wrapper around the `useAsyncThrottler` hook,
 * providing a stable, throttled async function reference for use in React components.
 *
 * The throttled async function will execute at most once within the specified wait time period,
 * regardless of how many times it is called. If called multiple times during the wait period,
 * only the first invocation will execute, and subsequent calls will be ignored until
 * the wait period has elapsed. The returned function always returns a promise
 * that resolves or rejects with the result of the original async function.
 *
 * This hook provides a simpler API compared to `useAsyncThrottler`, making it ideal for basic
 * async throttling needs. However, it does not expose the underlying AsyncThrottler instance.
 *
 * For advanced usage requiring features like:
 * - Manual cancellation
 * - Access to execution/error state
 * - Custom useCallback dependencies
 *
 * Consider using the `useAsyncThrottler` hook instead.
 *
 *
 * @example
 * ```tsx
 * // Throttle an async API call
 * const handleApiCall = useAsyncThrottledCallback(async (data) => {
 *   const result = await sendDataToServer(data);
 *   return result;
 * }, {
 *   wait: 200 // Execute at most once every 200ms
 * });
 *
 * // Use in an event handler
 * <button onClick={() => handleApiCall(formData)}>Send</button>
 * ```
 */
export function useAsyncThrottledCallback<TFn extends AnyAsyncFunction>(
  fn: TFn,
  options: ReactAsyncThrottlerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
  const asyncThrottledFn = useAsyncThrottler(fn, options).maybeExecute
  return useCallback(
    (...args) => asyncThrottledFn(...args) as Promise<ReturnType<TFn>>,
    [asyncThrottledFn],
  )
}
