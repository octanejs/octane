import { useCallback } from 'react'
import { useAsyncBatcher } from './useAsyncBatcher'
import type { ReactAsyncBatcherOptions } from './useAsyncBatcher'

/**
 * A React hook that creates a batched version of an async callback function.
 * This hook is a convenient wrapper around the `useAsyncBatcher` hook,
 * providing a stable, batched async function reference for use in React components.
 *
 * The batched async function will collect individual calls into batches and execute them
 * when batch conditions are met (max size reached, wait time elapsed, or custom logic).
 * The returned function always returns a promise that resolves with undefined (since the
 * batch function processes multiple items together).
 *
 * This hook provides a simpler API compared to `useAsyncBatcher`, making it ideal for basic
 * async batching needs. However, it does not expose the underlying AsyncBatcher instance.
 *
 * For advanced usage requiring features like:
 * - Manual batch execution
 * - Access to batch results and state
 * - Custom useCallback dependencies
 *
 * Consider using the `useAsyncBatcher` hook instead.
 *
 * @example
 * ```tsx
 * // Batch API requests
 * const batchApiCall = useAsyncBatchedCallback(async (requests: ApiRequest[]) => {
 *   const results = await Promise.all(requests.map(req => fetch(req.url)));
 *   return results.map(res => res.json());
 * }, {
 *   maxSize: 10,   // Process when 10 requests collected
 *   wait: 1000     // Or after 1 second
 * });
 *
 * // Use in event handlers
 * <button onClick={() => batchApiCall({ url: '/api/analytics', data: eventData })}>
 *   Track Event
 * </button>
 * ```
 */
export function useAsyncBatchedCallback<TValue>(
  fn: (items: Array<TValue>) => Promise<unknown>,
  options: ReactAsyncBatcherOptions<TValue, {}>,
): (item: TValue) => Promise<void> {
  const asyncBatchedFn = useAsyncBatcher(fn, options).addItem
  return useCallback((item: TValue) => asyncBatchedFn(item), [asyncBatchedFn])
}
