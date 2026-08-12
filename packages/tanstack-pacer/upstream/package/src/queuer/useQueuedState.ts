import { useQueuer } from './useQueuer'
import type { ReactQueuer, ReactQueuerOptions } from './useQueuer'
import type { Queuer, QueuerState } from '@tanstack/pacer/queuer'

/**
 * A React hook that creates a queuer with managed state, combining React's useState with queuing functionality.
 * This hook provides both the current queue state and queue control methods.
 *
 * The queue state is automatically updated whenever items are added, removed, or reordered in the queue.
 * All queue operations are reflected in the state array returned by the hook.
 *
 * The queue can be started and stopped to automatically process items at a specified interval,
 * making it useful as a scheduler. When started, it will process one item per tick, with an
 * optional wait time between ticks.
 *
 * The hook returns a tuple containing:
 * - The current queue state as an array
 * - The queue instance with methods for queue manipulation
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management via the underlying queuer instance.
 * The `selector` parameter allows you to specify which queuer state changes will trigger a re-render,
 * optimizing performance by preventing unnecessary re-renders when irrelevant state changes occur.
 *
 * **By default, there will be no reactive state subscriptions** and you must opt-in to state
 * tracking by providing a selector function. This prevents unnecessary re-renders and gives you
 * full control over when your component updates. Only when you provide a selector will the
 * component re-render when the selected state values change.
 *
 * Available queuer state properties:
 * - `executionCount`: Number of items that have been processed by the queuer
 * - `expirationCount`: Number of items that have been removed due to expiration
 * - `isEmpty`: Whether the queuer has no items to process
 * - `isFull`: Whether the queuer has reached its maximum capacity
 * - `isIdle`: Whether the queuer is not currently processing any items
 * - `isRunning`: Whether the queuer is active and will process items automatically
 * - `items`: Array of items currently waiting to be processed
 * - `itemTimestamps`: Timestamps when items were added for expiration tracking
 * - `pendingTick`: Whether the queuer has a pending timeout for processing the next item
 * - `rejectionCount`: Number of items that have been rejected from being added
 * - `size`: Number of items currently in the queue
 * - `status`: Current processing status ('idle' | 'running' | 'stopped')
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const [items, addItem, queue] = useQueuedState(
 *   (item) => console.log('Processing:', item),
 *   {
 *     initialItems: ['item1', 'item2'],
 *     started: true,
 *     wait: 1000,
 *     getPriority: (item) => item.priority
 *   }
 * );
 *
 * // Opt-in to re-render when queue contents change (optimized for displaying queue items)
 * const [items, addItem, queue] = useQueuedState(
 *   (item) => console.log('Processing:', item),
 *   { started: true, wait: 1000 },
 *   (state) => ({
 *     items: state.items,
 *     size: state.size,
 *     isEmpty: state.isEmpty
 *   })
 * );
 *
 * // Opt-in to re-render when processing state changes (optimized for loading indicators)
 * const [items, addItem, queue] = useQueuedState(
 *   (item) => console.log('Processing:', item),
 *   { started: true, wait: 1000 },
 *   (state) => ({
 *     isRunning: state.isRunning,
 *     isIdle: state.isIdle,
 *     status: state.status,
 *     pendingTick: state.pendingTick
 *   })
 * );
 *
 * // Opt-in to re-render when execution metrics change (optimized for stats display)
 * const [items, addItem, queue] = useQueuedState(
 *   (item) => console.log('Processing:', item),
 *   { started: true, wait: 1000 },
 *   (state) => ({
 *     executionCount: state.executionCount,
 *     expirationCount: state.expirationCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Add items to queue
 * const handleAdd = (item) => {
 *   addItem(item);
 * };
 *
 * // Start automatic processing
 * const startProcessing = () => {
 *   queue.start();
 * };
 *
 * // Stop automatic processing
 * const stopProcessing = () => {
 *   queue.stop();
 * };
 *
 * // Manual processing still available
 * const handleProcess = () => {
 *   const nextItem = queue.getNextItem();
 *   if (nextItem) {
 *     processItem(nextItem);
 *   }
 * };
 *
 * // Access the selected queuer state (will be empty object {} unless selector provided)
 * const { size, isRunning, executionCount } = queue.state;
 * ```
 */
export function useQueuedState<
  TValue,
  TSelected extends Pick<QueuerState<TValue>, 'items'> = Pick<
    QueuerState<TValue>,
    'items'
  >,
>(
  fn: (item: TValue) => void,
  options: ReactQueuerOptions<TValue, TSelected> = {},
  selector?: (state: QueuerState<TValue>) => TSelected,
): [Array<TValue>, Queuer<TValue>['addItem'], ReactQueuer<TValue, TSelected>] {
  const queue = useQueuer(fn, options, selector)

  return [queue.state.items, queue.addItem, queue]
}
