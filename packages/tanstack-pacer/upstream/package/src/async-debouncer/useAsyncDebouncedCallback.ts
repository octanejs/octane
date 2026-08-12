import { useCallback } from 'react'
import { useAsyncDebouncer } from './useAsyncDebouncer'
import type { ReactAsyncDebouncerOptions } from './useAsyncDebouncer'
import type { AnyAsyncFunction } from '@tanstack/pacer/types'

/**
 * A React hook that creates a debounced version of an async callback function.
 * This hook is a convenient wrapper around the `useAsyncDebouncer` hook,
 * providing a stable, debounced async function reference for use in React components.
 *
 * The debounced async function will only execute after the specified wait time has elapsed
 * since its last invocation. If called again before the wait time expires, the timer
 * resets and starts waiting again. The returned function always returns a promise
 * that resolves or rejects with the result of the original async function.
 *
 * This hook provides a simpler API compared to `useAsyncDebouncer`, making it ideal for basic
 * async debouncing needs. However, it does not expose the underlying AsyncDebouncer instance.
 *
 * For advanced usage requiring features like:
 * - Manual cancellation
 * - Access to execution/error state
 * - Custom useCallback dependencies
 *
 * Consider using the `useAsyncDebouncer` hook instead.
 *
 *
 * @example
 * ```tsx
 * // Debounce an async search handler
 * const handleSearch = useAsyncDebouncedCallback(async (query: string) => {
 *   const results = await fetchSearchResults(query);
 *   return results;
 * }, {
 *   wait: 500 // Wait 500ms between executions
 * });
 *
 * // Use in an input
 * <input
 *   type="search"
 *   onChange={e => handleSearch(e.target.value)}
 * />
 * ```
 */
export function useAsyncDebouncedCallback<TFn extends AnyAsyncFunction>(
  fn: TFn,
  options: ReactAsyncDebouncerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
  const asyncDebouncedFn = useAsyncDebouncer(fn, options).maybeExecute
  return useCallback(
    (...args) => asyncDebouncedFn(...args) as Promise<ReturnType<TFn>>,
    [asyncDebouncedFn],
  )
}
