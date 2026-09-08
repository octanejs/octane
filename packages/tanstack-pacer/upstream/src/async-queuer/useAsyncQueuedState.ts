import { useAsyncQueuer } from './useAsyncQueuer'
import type {
  ReactAsyncQueuer,
  ReactAsyncQueuerOptions,
} from './useAsyncQueuer'
import type { AsyncQueuerState } from '@tanstack/pacer/async-queuer'

/**
 * A higher-level React hook that creates an `AsyncQueuer` instance with built-in state management.
 *
 * This hook combines an AsyncQueuer with React state to automatically track the queue items.
 * It returns a tuple containing:
 * - The current array of queued items as React state
 * - The queuer instance with methods to control the queue
 *
 * The queue can be configured with:
 * - Maximum concurrent operations
 * - Maximum queue size
 * - Processing function for queue items
 * - Various lifecycle callbacks
 *
 * The state will automatically update whenever items are:
 * - Added to the queue
 * - Removed from the queue
 * - Started processing
 * - Completed processing
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management via the underlying async queuer instance.
 * The `selector` parameter allows you to specify which async queuer state changes will trigger a re-render,
 * optimizing performance by preventing unnecessary re-renders when irrelevant state changes occur.
 *
 * **By default, there will be no reactive state subscriptions** and you must opt-in to state
 * tracking by providing a selector function. This prevents unnecessary re-renders and gives you
 * full control over when your component updates. Only when you provide a selector will the
 * component re-render when the selected state values change.
 *
 * Available async queuer state properties:
 * - `activeItems`: Items currently being processed by the queuer
 * - `errorCount`: Number of task executions that have resulted in errors
 * - `expirationCount`: Number of items that have been removed due to expiration
 * - `isEmpty`: Whether the queuer has no items to process
 * - `isFull`: Whether the queuer has reached its maximum capacity
 * - `isIdle`: Whether the queuer is not currently processing any items
 * - `isRunning`: Whether the queuer is active and will process items automatically
 * - `items`: Array of items currently waiting to be processed
 * - `itemTimestamps`: Timestamps when items were added for expiration tracking
 * - `lastResult`: The result from the most recent task execution
 * - `pendingTick`: Whether the queuer has a pending timeout for processing the next item
 * - `rejectionCount`: Number of items that have been rejected from being added
 * - `settledCount`: Number of task executions that have completed (success or error)
 * - `size`: Number of items currently in the queue
 * - `status`: Current processing status ('idle' | 'running' | 'stopped')
 * - `successCount`: Number of task executions that have completed successfully
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const [queueItems, asyncQueuer] = useAsyncQueuedState(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   {
 *     concurrency: 2,
 *     maxSize: 100,
 *     started: true
 *   }
 * );
 *
 * // Opt-in to re-render when queue contents change (optimized for displaying queue items)
 * const [queueItems, asyncQueuer] = useAsyncQueuedState(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: true },
 *   (state) => ({
 *     items: state.items,
 *     size: state.size,
 *     isEmpty: state.isEmpty,
 *     isFull: state.isFull
 *   })
 * );
 *
 * // Opt-in to re-render when processing state changes (optimized for loading indicators)
 * const [queueItems, asyncQueuer] = useAsyncQueuedState(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: true },
 *   (state) => ({
 *     isRunning: state.isRunning,
 *     isIdle: state.isIdle,
 *     status: state.status,
 *     activeItems: state.activeItems,
 *     pendingTick: state.pendingTick
 *   })
 * );
 *
 * // Opt-in to re-render when execution metrics change (optimized for stats display)
 * const [queueItems, asyncQueuer] = useAsyncQueuedState(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: true },
 *   (state) => ({
 *     successCount: state.successCount,
 *     errorCount: state.errorCount,
 *     settledCount: state.settledCount,
 *     expirationCount: state.expirationCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Opt-in to re-render when results are available (optimized for data display)
 * const [queueItems, asyncQueuer] = useAsyncQueuedState(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: true },
 *   (state) => ({
 *     lastResult: state.lastResult,
 *     successCount: state.successCount
 *   })
 * );
 *
 * // Add items to queue - state updates automatically
 * asyncQueuer.addItem(async () => {
 *   const result = await fetchData();
 *   return result;
 * });
 *
 * // Start processing
 * asyncQueuer.start();
 *
 * // Stop processing
 * asyncQueuer.stop();
 *
 * // queueItems reflects current queue state
 * const pendingCount = asyncQueuer.peekPendingItems().length;
 *
 * // Access the selected async queuer state (will be empty object {} unless selector provided)
 * const { size, isRunning, activeItems } = asyncQueuer.state;
 * ```
 */
export function useAsyncQueuedState<
  TValue,
  TSelected extends Pick<AsyncQueuerState<TValue>, 'items'> = Pick<
    AsyncQueuerState<TValue>,
    'items'
  >,
>(
  fn: (value: TValue) => Promise<any>,
  options: ReactAsyncQueuerOptions<TValue, TSelected> = {},
  selector?: (state: AsyncQueuerState<TValue>) => TSelected,
): [Array<TValue>, ReactAsyncQueuer<TValue, TSelected>] {
  const asyncQueuer = useAsyncQueuer(fn, options, selector)

  return [asyncQueuer.state.items, asyncQueuer]
}
