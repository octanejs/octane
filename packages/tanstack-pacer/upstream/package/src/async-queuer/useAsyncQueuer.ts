import { useEffect, useMemo, useState } from 'react'
import { AsyncQueuer } from '@tanstack/pacer/async-queuer'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type {
  AsyncQueuerOptions,
  AsyncQueuerState,
} from '@tanstack/pacer/async-queuer'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactAsyncQueuerOptions<
  TValue,
  TSelected = {},
> extends AsyncQueuerOptions<TValue> {
  /**
   * Optional callback invoked when the component unmounts. Receives the queuer instance.
   * When provided, replaces the default cleanup (stop + abort); use it to call flush(), flushAsBatch(), stop(), add logging, etc.
   */
  onUnmount?: (queuer: ReactAsyncQueuer<TValue, TSelected>) => void
}

export interface ReactAsyncQueuer<TValue, TSelected = {}> extends Omit<
  AsyncQueuer<TValue>,
  'store'
> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the queuer state.
   *
   * This is useful for opting into state re-renders for specific parts of the queuer state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <queuer.Subscribe selector={(state) => ({ size: state.size, isRunning: state.isRunning })}>
   *   {({ size, isRunning }) => (
   *     <div>Queue: {size} items, {isRunning ? 'Processing' : 'Idle'}</div>
   *   )}
   * </queuer.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: AsyncQueuerState<TValue>) => TSelected
    children: ((state: TSelected) => ReactNode) | ReactNode
  }) => ReturnType<FunctionComponent>
  /**
   * Reactive state that will be updated and re-rendered when the queuer state changes
   *
   * Use this instead of `queuer.store.state`
   */
  readonly state: Readonly<TSelected>
  /**
   * @deprecated Use `queuer.state` instead of `queuer.store.state` if you want to read reactive state.
   * The state on the store object is not reactive, as it has not been wrapped in a `useSelector` hook internally.
   * Although, you can make the state reactive by using the `useSelector` in your own usage.
   */
  readonly store: Store<Readonly<AsyncQueuerState<TValue>>>
}

/**
 * A lower-level React hook that creates an `AsyncQueuer` instance for managing an async queue of items.
 *
 * Features:
 * - Priority queue support via getPriority option
 * - Configurable concurrency limit
 * - Task success/error/completion callbacks
 * - FIFO (First In First Out) or LIFO (Last In First Out) queue behavior
 * - Pause/resume task processing
 * - Task cancellation
 * - Item expiration to clear stale items from the queue
 *
 * Tasks are processed concurrently up to the configured concurrency limit. When a task completes,
 * the next pending task is processed if below the concurrency limit.
 *
 * Error Handling:
 * - If an `onError` handler is provided, it will be called with the error and queuer instance
 * - If `throwOnError` is true (default when no onError handler is provided), the error will be thrown
 * - If `throwOnError` is false (default when onError handler is provided), the error will be swallowed
 * - Both onError and throwOnError can be used together - the handler will be called before any error is thrown
 * - The error state can be checked using the underlying AsyncQueuer instance
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management. You can subscribe to state changes
 * in two ways:
 *
 * **1. Using `queuer.Subscribe` HOC (Recommended for component tree subscriptions)**
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
 * ## Unmount behavior
 *
 * By default, the hook stops the queuer and aborts any in-flight task executions when the component unmounts.
 * Abort only cancels underlying operations (e.g. fetch) when the abort signal from `getAbortSignal()` is passed to them.
 * Use the `onUnmount` option to customize this. For example, to flush pending items instead:
 *
 * ```tsx
 * const queuer = useAsyncQueuer(fn, {
 *   concurrency: 2,
 *   started: false,
 *   onUnmount: (q) => q.flush()
 * });
 * ```
 *
 * Note: For async utils, `flush()` returns a Promise and runs fire-and-forget in the cleanup.
 * If your task function updates React state, those updates may run after the component has
 * unmounted, which can cause "setState on unmounted component" warnings. Guard your callbacks
 * accordingly when using onUnmount with flush.
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const asyncQueuer = useAsyncQueuer(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: false }
 * );
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <asyncQueuer.Subscribe selector={(state) => ({ size: state.size, isRunning: state.isRunning })}>
 *   {({ size, isRunning }) => (
 *     <div>Queue: {size} items, {isRunning ? 'Processing' : 'Idle'}</div>
 *   )}
 * </asyncQueuer.Subscribe>
 *
 * // Opt-in to re-render when queue size changes at hook level (optimized for displaying queue length)
 * const asyncQueuer = useAsyncQueuer(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: false },
 *   (state) => ({
 *     size: state.size,
 *     isEmpty: state.isEmpty,
 *     isFull: state.isFull
 *   })
 * );
 *
 * // Opt-in to re-render when processing state changes (optimized for loading indicators)
 * const asyncQueuer = useAsyncQueuer(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: false },
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
 * const asyncQueuer = useAsyncQueuer(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   { concurrency: 2, maxSize: 100, started: false },
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
 * const asyncQueuer = useAsyncQueuer(
 *   async (item) => {
 *     const result = await processItem(item);
 *     return result;
 *   },
 *   {
 *     concurrency: 2,
 *     maxSize: 100,
 *     started: false,
 *     onSuccess: (result) => {
 *       console.log('Item processed:', result);
 *     },
 *     onError: (error) => {
 *       console.error('Processing failed:', error);
 *     }
 *   },
 *   (state) => ({
 *     lastResult: state.lastResult,
 *     successCount: state.successCount
 *   })
 * );
 *
 * // Add items to queue
 * asyncQueuer.addItem(newItem);
 *
 * // Start processing
 * asyncQueuer.start();
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { size, isRunning, activeItems } = asyncQueuer.state;
 * ```
 */
export function useAsyncQueuer<TValue, TSelected = {}>(
  fn: (value: TValue) => Promise<any>,
  options: ReactAsyncQueuerOptions<TValue, TSelected> = {},
  selector: (state: AsyncQueuerState<TValue>) => TSelected = () =>
    ({}) as TSelected,
): ReactAsyncQueuer<TValue, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().asyncQueuer,
    ...options,
  } as ReactAsyncQueuerOptions<TValue, TSelected>
  const [asyncQueuer] = useState(() => {
    const asyncQueuerInstance = new AsyncQueuer<TValue>(
      fn,
      mergedOptions,
    ) as unknown as ReactAsyncQueuer<TValue, TSelected>

    asyncQueuerInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: AsyncQueuerState<TValue>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(asyncQueuerInstance.store, props.selector, {
        compare: shallow,
      })

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return asyncQueuerInstance
  })

  asyncQueuer.fn = fn
  asyncQueuer.setOptions(mergedOptions)

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(asyncQueuer)
      } else {
        asyncQueuer.stop()
        asyncQueuer.abort()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  const state = useSelector(asyncQueuer.store, selector, { compare: shallow })

  return useMemo(
    () =>
      ({
        ...asyncQueuer,
        state,
      }) as ReactAsyncQueuer<TValue, TSelected>, // omit `store` in favor of `state`
    [asyncQueuer, state],
  )
}
