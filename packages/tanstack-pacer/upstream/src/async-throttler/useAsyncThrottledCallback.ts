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
 * regardless of how many times it is called. Calls made during the wait period reschedule a
 * single trailing execution with the latest arguments when `trailing` is enabled (the default).
 * The most recent call's promise resolves or rejects with the trailing execution's result;
 * each earlier call's promise resolves immediately with the most recent previous result (or
 * `undefined` if nothing has executed yet), as does every call when the throttler is disabled.
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
): (...args: Parameters<TFn>) => Promise<Awaited<ReturnType<TFn>> | undefined> {
  const asyncThrottledFn = useAsyncThrottler(fn, options).maybeExecute
  return useCallback((...args) => asyncThrottledFn(...args), [asyncThrottledFn])
}
