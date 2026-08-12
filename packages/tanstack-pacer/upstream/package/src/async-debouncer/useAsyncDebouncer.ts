import { useEffect, useMemo, useState } from 'react'
import { AsyncDebouncer } from '@tanstack/pacer/async-debouncer'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type { AnyAsyncFunction } from '@tanstack/pacer/types'
import type {
  AsyncDebouncerOptions,
  AsyncDebouncerState,
} from '@tanstack/pacer/async-debouncer'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactAsyncDebouncerOptions<
  TFn extends AnyAsyncFunction,
  TSelected = {},
> extends AsyncDebouncerOptions<TFn> {
  /**
   * Optional callback invoked when the component unmounts. Receives the debouncer instance.
   * When provided, replaces the default cleanup (cancel + abort); use it to call flush(), reset(), cancel(), add logging, etc.
   */
  onUnmount?: (debouncer: ReactAsyncDebouncer<TFn, TSelected>) => void
}

export interface ReactAsyncDebouncer<
  TFn extends AnyAsyncFunction,
  TSelected = {},
> extends Omit<AsyncDebouncer<TFn>, 'store'> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the debouncer state.
   *
   * This is useful for opting into state re-renders for specific parts of the debouncer state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <debouncer.Subscribe selector={(state) => ({ isExecuting: state.isExecuting })}>
   *   {({ isExecuting }) => (
   *     <div>{isExecuting ? 'Loading...' : 'Ready'}</div>
   *   )}
   * </debouncer.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: AsyncDebouncerState<TFn>) => TSelected
    children: ((state: TSelected) => ReactNode) | ReactNode
  }) => ReturnType<FunctionComponent>
  /**
   * Reactive state that will be updated and re-rendered when the debouncer state changes
   *
   * Use this instead of `debouncer.store.state`
   */
  readonly state: Readonly<TSelected>
  /**
   * @deprecated Use `debouncer.state` instead of `debouncer.store.state` if you want to read reactive state.
   * The state on the store object is not reactive, as it has not been wrapped in a `useSelector` hook internally.
   * Although, you can make the state reactive by using the `useSelector` in your own usage.
   */
  readonly store: Store<Readonly<AsyncDebouncerState<TFn>>>
}

/**
 * A low-level React hook that creates an `AsyncDebouncer` instance to delay execution of an async function.
 *
 * This hook is designed to be flexible and state-management agnostic - it simply returns a debouncer instance that
 * you can integrate with any state management solution (useState, Redux, Zustand, Jotai, etc).
 *
 * Async debouncing ensures that an async function only executes after a specified delay has passed since its last invocation.
 * Each new invocation resets the delay timer. This is useful for handling frequent events like window resizing
 * or input changes where you only want to execute the handler after the events have stopped occurring.
 *
 * Unlike throttling which allows execution at regular intervals, debouncing prevents any execution until
 * the function stops being called for the specified delay period.
 *
 * Unlike the non-async Debouncer, this async version supports returning values from the debounced function,
 * making it ideal for API calls and other async operations where you want the result of the `maybeExecute` call
 * instead of setting the result on a state variable from within the debounced function.
 *
 * Error Handling:
 * - If an `onError` handler is provided, it will be called with the error and debouncer instance
 * - If `throwOnError` is true (default when no onError handler is provided), the error will be thrown
 * - If `throwOnError` is false (default when onError handler is provided), the error will be swallowed
 * - Both onError and throwOnError can be used together - the handler will be called before any error is thrown
 * - The error state can be checked using the underlying AsyncDebouncer instance
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management. You can subscribe to state changes
 * in two ways:
 *
 * **1. Using `debouncer.Subscribe` HOC (Recommended for component tree subscriptions)**
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
 * - `canLeadingExecute`: Whether the debouncer can execute on the leading edge
 * - `errorCount`: Number of function executions that have resulted in errors
 * - `isExecuting`: Whether the debounced function is currently executing asynchronously
 * - `isPending`: Whether the debouncer is waiting for the timeout to trigger execution
 * - `lastArgs`: The arguments from the most recent call to maybeExecute
 * - `lastResult`: The result from the most recent successful function execution
 * - `settleCount`: Number of function executions that have completed (success or error)
 * - `status`: Current execution status ('disabled' | 'idle' | 'pending' | 'executing' | 'settled')
 * - `successCount`: Number of function executions that have completed successfully
 *
 * ## Unmount behavior
 *
 * By default, the hook cancels any pending execution and aborts any in-flight execution when the component unmounts.
 * Abort only cancels underlying operations (e.g. fetch) when the abort signal from `getAbortSignal()` is passed to them.
 * Use the `onUnmount` option to customize this. For example, to flush pending work instead:
 *
 * ```tsx
 * const debouncer = useAsyncDebouncer(fn, {
 *   wait: 500,
 *   onUnmount: (d) => d.flush()
 * });
 * ```
 *
 * Note: For async utils, `flush()` returns a Promise and runs fire-and-forget in the cleanup.
 * If your debounced function updates React state, those updates may run after the component has
 * unmounted, which can cause "setState on unmounted component" warnings. Guard your callbacks
 * accordingly when using onUnmount with flush.
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const searchDebouncer = useAsyncDebouncer(
 *   async (query: string) => {
 *     const results = await api.search(query);
 *     return results;
 *   },
 *   { wait: 500 }
 * );
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <searchDebouncer.Subscribe selector={(state) => ({ isExecuting: state.isExecuting, isPending: state.isPending })}>
 *   {({ isExecuting, isPending }) => (
 *     <div>{isExecuting || isPending ? 'Loading...' : 'Ready'}</div>
 *   )}
 * </searchDebouncer.Subscribe>
 *
 * // Opt-in to re-render when execution state changes at hook level (optimized for loading indicators)
 * const searchDebouncer = useAsyncDebouncer(
 *   async (query: string) => {
 *     const results = await api.search(query);
 *     return results;
 *   },
 *   { wait: 500 },
 *   (state) => ({
 *     isExecuting: state.isExecuting,
 *     isPending: state.isPending
 *   })
 * );
 *
 * // Opt-in to re-render when results are available (optimized for data display)
 * const searchDebouncer = useAsyncDebouncer(
 *   async (query: string) => {
 *     const results = await api.search(query);
 *     return results;
 *   },
 *   { wait: 500 },
 *   (state) => ({
 *     lastResult: state.lastResult,
 *     successCount: state.successCount
 *   })
 * );
 *
 * // Opt-in to re-render when error state changes (optimized for error handling)
 * const searchDebouncer = useAsyncDebouncer(
 *   async (query: string) => {
 *     const results = await api.search(query);
 *     return results;
 *   },
 *   {
 *     wait: 500,
 *     onError: (error) => console.error('Search failed:', error)
 *   },
 *   (state) => ({
 *     errorCount: state.errorCount,
 *     status: state.status
 *   })
 * );
 *
 * // With state management
 * const [results, setResults] = useState([]);
 * const { maybeExecute, state } = useAsyncDebouncer(
 *   async (searchTerm) => {
 *     const data = await searchAPI(searchTerm);
 *     setResults(data);
 *   },
 *   {
 *     wait: 300,
 *     leading: true,   // Execute immediately on first call
 *     trailing: false, // Skip trailing edge updates
 *     onError: (error) => {
 *       console.error('API call failed:', error);
 *     }
 *   }
 * );
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { isExecuting, lastResult } = state;
 * ```
 */
export function useAsyncDebouncer<TFn extends AnyAsyncFunction, TSelected = {}>(
  fn: TFn,
  options: ReactAsyncDebouncerOptions<TFn, TSelected>,
  selector: (state: AsyncDebouncerState<TFn>) => TSelected = () =>
    ({}) as TSelected,
): ReactAsyncDebouncer<TFn, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().asyncDebouncer,
    ...options,
  } as ReactAsyncDebouncerOptions<TFn, TSelected>
  const [asyncDebouncer] = useState(() => {
    const asyncDebouncerInstance = new AsyncDebouncer<TFn>(
      fn,
      mergedOptions,
    ) as unknown as ReactAsyncDebouncer<TFn, TSelected>

    asyncDebouncerInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: AsyncDebouncerState<TFn>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(
        asyncDebouncerInstance.store,
        props.selector,
        { compare: shallow },
      )

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return asyncDebouncerInstance
  })

  asyncDebouncer.fn = fn
  asyncDebouncer.setOptions(mergedOptions)

  const state = useSelector(asyncDebouncer.store, selector, {
    compare: shallow,
  })

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(asyncDebouncer)
      } else {
        asyncDebouncer.cancel()
        asyncDebouncer.abort()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  return useMemo(
    () =>
      ({
        ...asyncDebouncer,
        state,
      }) as ReactAsyncDebouncer<TFn, TSelected>, // omit `store` in favor of `state`
    [asyncDebouncer, state],
  )
}
