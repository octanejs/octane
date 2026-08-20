import { useCallback } from 'react'
import { useBatcher } from './useBatcher'
import type { ReactBatcherOptions } from './useBatcher'

/**
 * A React hook that creates a batched version of a callback function.
 * This hook is essentially a wrapper around the basic `batch` function
 * that is exported from `@tanstack/pacer`,
 * but optimized for React with reactive options and a stable function reference.
 *
 * The batched function will collect individual calls into batches and execute them
 * when batch conditions are met (max size reached, wait time elapsed, or custom logic).
 *
 * This hook provides a simpler API compared to `useBatcher`, making it ideal for basic
 * batching needs. However, it does not expose the underlying Batcher instance.
 *
 * For advanced usage requiring features like:
 * - Manual batch execution
 * - Access to batch state and metrics
 * - Custom useCallback dependencies
 *
 * Consider using the `useBatcher` hook instead.
 *
 * @example
 * ```tsx
 * // Batch analytics events
 * const trackEvents = useBatchedCallback((events: AnalyticsEvent[]) => {
 *   sendAnalytics(events);
 * }, {
 *   maxSize: 5,    // Process when 5 events collected
 *   wait: 2000     // Or after 2 seconds
 * });
 *
 * // Use in event handlers
 * <button onClick={() => trackEvents({ type: 'click', target: 'button' })}>
 *   Click me
 * </button>
 * ```
 */
export function useBatchedCallback<TValue>(
  fn: (items: Array<TValue>) => void,
  options: ReactBatcherOptions<TValue, {}>,
): (item: TValue) => void {
  const batchedFn = useBatcher(fn, options).addItem
  return useCallback((item: TValue) => batchedFn(item), [batchedFn])
}
