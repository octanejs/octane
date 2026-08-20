import { useEffect, useState } from 'react'
import { useQueuedState } from './useQueuedState'
import type { ReactQueuer, ReactQueuerOptions } from './useQueuer'
import type { QueuerState } from '@tanstack/pacer/queuer'

/**
 * A React hook that creates a queued value that processes state changes in order with an optional delay.
 * This hook uses useQueuer internally to manage a queue of state changes and apply them sequentially.
 *
 * The queued value will process changes in the order they are received, with optional delays between
 * processing each change. This is useful for handling state updates that need to be processed
 * in a specific order, like animations or sequential UI updates.
 *
 * The hook returns a tuple containing:
 * - The current queued value
 * - The queuer instance with control methods
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
 * const [value, queuer] = useQueuedValue(initialValue, {
 *   wait: 500, // Wait 500ms between processing each change
 *   started: true // Start processing immediately
 * });
 *
 * // Opt-in to re-render when queue processing state changes (optimized for loading indicators)
 * const [value, queuer] = useQueuedValue(
 *   initialValue,
 *   { wait: 500, started: true },
 *   (state) => ({
 *     isRunning: state.isRunning,
 *     isIdle: state.isIdle,
 *     status: state.status,
 *     pendingTick: state.pendingTick
 *   })
 * );
 *
 * // Opt-in to re-render when queue contents change (optimized for displaying queue status)
 * const [value, queuer] = useQueuedValue(
 *   initialValue,
 *   { wait: 500, started: true },
 *   (state) => ({
 *     size: state.size,
 *     isEmpty: state.isEmpty,
 *     isFull: state.isFull
 *   })
 * );
 *
 * // Opt-in to re-render when execution metrics change (optimized for stats display)
 * const [value, queuer] = useQueuedValue(
 *   initialValue,
 *   { wait: 500, started: true },
 *   (state) => ({
 *     executionCount: state.executionCount,
 *     expirationCount: state.expirationCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Add changes to the queue
 * const handleChange = (newValue) => {
 *   queuer.addItem(newValue);
 * };
 *
 * // Control the queue
 * const pauseProcessing = () => {
 *   queuer.stop();
 * };
 *
 * const resumeProcessing = () => {
 *   queuer.start();
 * };
 *
 * // Access the selected queuer state (will be empty object {} unless selector provided)
 * const { size, isRunning, executionCount } = queuer.state;
 * ```
 */
export function useQueuedValue<
  TValue,
  TSelected extends Pick<QueuerState<TValue>, 'items'> = Pick<
    QueuerState<TValue>,
    'items'
  >,
>(
  initialValue: TValue,
  options: ReactQueuerOptions<TValue, TSelected> = {},
  selector?: (state: QueuerState<TValue>) => TSelected,
): [TValue, ReactQueuer<TValue, TSelected>] {
  const [value, setValue] = useState<TValue>(initialValue)

  const [, addItem, queuer] = useQueuedState(
    (item) => {
      setValue(item)
    },
    options,
    selector,
  )

  useEffect(() => {
    addItem(initialValue)
  }, [initialValue, addItem])

  return [value, queuer]
}
