import { useCallback } from 'react'
import { useAsyncRateLimiter } from './useAsyncRateLimiter'
import type { AnyAsyncFunction } from '@tanstack/pacer/types'
import type { ReactAsyncRateLimiterOptions } from './useAsyncRateLimiter'

/**
 * A React hook that creates a rate-limited version of an async callback function.
 * This hook is a convenient wrapper around the `useAsyncRateLimiter` hook,
 * providing a stable, async rate-limited function reference for use in React components.
 *
 * Async rate limiting is a "hard limit" approach for async functions: it allows all calls
 * until the limit is reached, then blocks (rejects) subsequent calls until the window resets.
 * Unlike throttling or debouncing, it does not attempt to space out or collapse calls.
 * This can lead to bursts of rapid executions followed by periods where all calls are blocked.
 *
 * The async rate limiter supports two types of windows:
 * - 'fixed': A strict window that resets after the window period. All executions within the window count
 *   towards the limit, and the window resets completely after the period.
 * - 'sliding': A rolling window that allows executions as old ones expire. This provides a more
 *   consistent rate of execution over time.
 *
 * For smoother execution patterns, consider:
 * - useAsyncThrottledCallback: When you want consistent spacing between executions (e.g. UI updates)
 * - useAsyncDebouncedCallback: When you want to collapse rapid calls into a single execution (e.g. search input)
 *
 * Async rate limiting should primarily be used when you need to enforce strict limits
 * on async operations, like API rate limits or other scenarios requiring hard caps
 * on execution frequency.
 *
 * This hook provides a simpler API compared to `useAsyncRateLimiter`, making it ideal for basic
 * async rate limiting needs. However, it does not expose the underlying AsyncRateLimiter instance.
 *
 * For advanced usage requiring features like:
 * - Manual cancellation
 * - Access to execution counts
 * - Custom useCallback dependencies
 *
 * Consider using the `useAsyncRateLimiter` hook instead.
 *
 *
 * @example
 * ```tsx
 * // Rate limit async API calls to maximum 5 calls per minute with a sliding window
 * const makeApiCall = useAsyncRateLimitedCallback(
 *   async (data: ApiData) => {
 *     return fetch('/api/endpoint', { method: 'POST', body: JSON.stringify(data) });
 *   },
 *   {
 *     limit: 5,
 *     window: 60000, // 1 minute
 *     windowType: 'sliding',
 *     onReject: () => {
 *       console.warn('API rate limit reached. Please wait before trying again.');
 *     }
 *   }
 * );
 * ```
 */
export function useAsyncRateLimitedCallback<TFn extends AnyAsyncFunction>(
  fn: TFn,
  options: ReactAsyncRateLimiterOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
  const asyncRateLimitedFn = useAsyncRateLimiter(fn, options).maybeExecute
  return useCallback(
    (...args) => asyncRateLimitedFn(...args) as Promise<ReturnType<TFn>>,
    [asyncRateLimitedFn],
  )
}
