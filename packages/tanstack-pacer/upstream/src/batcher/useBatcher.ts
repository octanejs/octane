import { useEffect, useMemo, useState } from 'react'
import { Batcher } from '@tanstack/pacer/batcher'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type { BatcherOptions, BatcherState } from '@tanstack/pacer/batcher'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactBatcherOptions<
  TValue,
  TSelected = {},
> extends BatcherOptions<TValue> {
  /**
   * Optional callback invoked when the component unmounts. Receives the batcher instance.
   * When provided, replaces the default cleanup (cancel); use it to call flush(), reset(), cancel(), add logging, etc.
   */
  onUnmount?: (batcher: ReactBatcher<TValue, TSelected>) => void
}

export interface ReactBatcher<TValue, TSelected = {}> extends Omit<
  Batcher<TValue>,
  'store'
> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the batcher state.
   *
   * This is useful for opting into state re-renders for specific parts of the batcher state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <batcher.Subscribe selector={(state) => ({ size: state.size, isPending: state.isPending })}>
   *   {({ size, isPending }) => (
   *     <div>Batch: {size} items, {isPending ? 'Pending' : 'Ready'}</div>
   *   )}
   * </batcher.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: BatcherState<TValue>) => TSelected
    children: ((state: TSelected) => ReactNode) | ReactNode
  }) => ReturnType<FunctionComponent>
  /**
   * Reactive state that will be updated and re-rendered when the batcher state changes
   *
   * Use this instead of `batcher.store.state`
   */
  readonly state: Readonly<TSelected>
  /**
   * @deprecated Use `batcher.state` instead of `batcher.store.state` if you want to read reactive state.
   * The state on the store object is not reactive, as it has not been wrapped in a `useSelector` hook internally.
   * Although, you can make the state reactive by using the `useSelector` in your own usage.
   */
  readonly store: Store<Readonly<BatcherState<TValue>>>
}

/**
 * A React hook that creates and manages a Batcher instance.
 *
 * This is a lower-level hook that provides direct access to the Batcher's functionality without
 * any built-in state management. This allows you to integrate it with any state management solution
 * you prefer (useState, Redux, Zustand, etc.) by utilizing the onItemsChange callback.
 *
 * The Batcher collects items and processes them in batches based on configurable conditions:
 * - Maximum batch size
 * - Time-based batching (process after X milliseconds)
 * - Custom batch processing logic via getShouldExecute
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management. You can subscribe to state changes
 * in two ways:
 *
 * **1. Using `batcher.Subscribe` HOC (Recommended for component tree subscriptions)**
 *
 * Use the `Subscribe` HOC to subscribe to state changes deep in your component tree without
 * needing to pass a selector to the hook. This is ideal when you want to subscribe to state
 * in child components.
 *
 * **2. Using the `selector` parameter (For hook-level subscriptions)**
 *
 * The `selector` parameter allows you to specify which state changes will trigger a re-render
 * at the hook level, optimizing performance by preventing unnecessary re-renders when irrelevant
 * state changes occur.
 *
 * **By default, there will be no reactive state subscriptions** and you must opt-in to state
 * tracking by providing a selector function or using the `Subscribe` HOC. This prevents unnecessary
 * re-renders and gives you full control over when your component updates.
 *
 * Available state properties:
 * - `executionCount`: Number of batch executions that have been completed
 * - `isEmpty`: Whether the batcher has no items to process
 * - `isPending`: Whether the batcher is waiting for the timeout to trigger batch processing
 * - `isRunning`: Whether the batcher is active and will process items automatically
 * - `items`: Array of items currently queued for batch processing
 * - `size`: Number of items currently in the batch queue
 * - `status`: Current processing status ('idle' | 'pending')
 * - `totalItemsProcessed`: Total number of items processed across all batches
 *
 * ## Unmount behavior
 *
 * By default, the hook cancels any pending batch when the component unmounts.
 * Use the `onUnmount` option to customize this. For example, to flush pending work instead:
 *
 * ```tsx
 * const batcher = useBatcher(fn, {
 *   maxSize: 5,
 *   wait: 2000,
 *   onUnmount: (b) => b.flush()
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const batcher = useBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   { maxSize: 5, wait: 2000 }
 * );
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <batcher.Subscribe selector={(state) => ({ size: state.size, isPending: state.isPending })}>
 *   {({ size, isPending }) => (
 *     <div>Batch: {size} items, {isPending ? 'Pending' : 'Ready'}</div>
 *   )}
 * </batcher.Subscribe>
 *
 * // Opt-in to re-render when batch size changes at hook level (optimized for displaying queue size)
 * const batcher = useBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   { maxSize: 5, wait: 2000 },
 *   (state) => ({
 *     size: state.size,
 *     isEmpty: state.isEmpty
 *   })
 * );
 *
 * // Opt-in to re-render when execution metrics change (optimized for stats display)
 * const batcher = useBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   { maxSize: 5, wait: 2000 },
 *   (state) => ({
 *     executionCount: state.executionCount,
 *     totalItemsProcessed: state.totalItemsProcessed
 *   })
 * );
 *
 * // Opt-in to re-render when processing state changes (optimized for loading indicators)
 * const batcher = useBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   { maxSize: 5, wait: 2000 },
 *   (state) => ({
 *     isPending: state.isPending,
 *     isRunning: state.isRunning,
 *     status: state.status
 *   })
 * );
 *
 * // Example with custom state management and batching
 * const [items, setItems] = useState([]);
 *
 * const batcher = useBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   {
 *     maxSize: 5,
 *     wait: 2000,
 *     onItemsChange: (batcher) => setItems(batcher.peekAllItems()),
 *     getShouldExecute: (items) => items.length >= 3
 *   }
 * );
 *
 * // Add items to batch - they'll be processed when conditions are met
 * batcher.addItem(1);
 * batcher.addItem(2);
 * batcher.addItem(3); // Triggers batch processing
 *
 * // Control the batcher
 * batcher.stop();  // Pause batching
 * batcher.start(); // Resume batching
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { size, isPending } = batcher.state;
 * ```
 */
export function useBatcher<TValue, TSelected = {}>(
  fn: (items: Array<TValue>) => void,
  options: ReactBatcherOptions<TValue, TSelected> = {},
  selector: (state: BatcherState<TValue>) => TSelected = () =>
    ({}) as TSelected,
): ReactBatcher<TValue, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().batcher,
    ...options,
  } as ReactBatcherOptions<TValue, TSelected>
  const [batcher] = useState(() => {
    const batcherInstance = new Batcher<TValue>(
      fn,
      mergedOptions,
    ) as unknown as ReactBatcher<TValue, TSelected>

    batcherInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: BatcherState<TValue>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(batcherInstance.store, props.selector, {
        compare: shallow,
      })

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return batcherInstance
  })

  batcher.fn = fn
  batcher.setOptions(mergedOptions)

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(batcher)
      } else {
        batcher.cancel()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  const state = useSelector(batcher.store, selector, { compare: shallow })

  return useMemo(
    () =>
      ({
        ...batcher,
        state,
      }) as ReactBatcher<TValue, TSelected>, // omit `store` in favor of `state`
    [batcher, state],
  )
}
