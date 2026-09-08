import { useEffect, useMemo, useState } from 'react'
import { Debouncer } from '@tanstack/pacer/debouncer'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type {
  DebouncerOptions,
  DebouncerState,
} from '@tanstack/pacer/debouncer'
import type { AnyFunction } from '@tanstack/pacer/types'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactDebouncerOptions<
  TFn extends AnyFunction,
  TSelected = {},
> extends DebouncerOptions<TFn> {
  /**
   * Optional callback invoked when the component unmounts. Receives the debouncer instance.
   * When provided, replaces the default cleanup (cancel); use it to call flush(), reset(), cancel(), add logging, etc.
   */
  onUnmount?: (debouncer: ReactDebouncer<TFn, TSelected>) => void
}

export interface ReactDebouncer<
  TFn extends AnyFunction,
  TSelected = {},
> extends Omit<Debouncer<TFn>, 'store'> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the debouncer state.
   *
   * This is useful for opting into state re-renders for specific parts of the debouncer state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <debouncer.Subscribe selector={(state) => ({ isPending: state.isPending })}>
   *   {({ isPending }) => (
   *     <div>{isPending ? 'Loading...' : 'Ready'}</div>
   *   )}
   * </debouncer.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: DebouncerState<TFn>) => TSelected
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
  readonly store: Store<Readonly<DebouncerState<TFn>>>
}

/**
 * A React hook that creates and manages a Debouncer instance.
 *
 * This is a lower-level hook that provides direct access to the Debouncer's functionality without
 * any built-in state management. This allows you to integrate it with any state management solution
 * you prefer (useState, Redux, Zustand, etc.).
 *
 * This hook provides debouncing functionality to limit how often a function can be called,
 * waiting for a specified delay before executing the latest call. This is useful for handling
 * frequent events like window resizing, scroll events, or real-time search inputs.
 *
 * The debouncer will only execute the function after the specified wait time has elapsed
 * since the last call. If the function is called again before the wait time expires, the
 * timer resets and starts waiting again.
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
 * - `executionCount`: Number of function executions that have been completed
 * - `isPending`: Whether the debouncer is waiting for the timeout to trigger execution
 * - `lastArgs`: The arguments from the most recent call to maybeExecute
 * - `status`: Current execution status ('disabled' | 'idle' | 'pending')
 *
 * ## Unmount behavior
 *
 * By default, the hook cancels any pending execution when the component unmounts.
 * Use the `onUnmount` option to customize this. For example, to flush pending work instead:
 *
 * ```tsx
 * const debouncer = useDebouncer(fn, {
 *   wait: 500,
 *   onUnmount: (d) => d.flush()
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const searchDebouncer = useDebouncer(
 *   (query: string) => fetchSearchResults(query),
 *   { wait: 500 }
 * );
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <searchDebouncer.Subscribe selector={(state) => ({ isPending: state.isPending })}>
 *   {({ isPending }) => (
 *     <div>{isPending ? 'Searching...' : 'Ready'}</div>
 *   )}
 * </searchDebouncer.Subscribe>
 *
 * // Opt-in to re-render when isPending changes at hook level (optimized for loading states)
 * const searchDebouncer = useDebouncer(
 *   (query: string) => fetchSearchResults(query),
 *   { wait: 500 },
 *   (state) => ({ isPending: state.isPending })
 * );
 *
 * // Opt-in to re-render when executionCount changes (optimized for tracking execution)
 * const searchDebouncer = useDebouncer(
 *   (query: string) => fetchSearchResults(query),
 *   { wait: 500 },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Multiple state properties - re-render when any of these change
 * const searchDebouncer = useDebouncer(
 *   (query: string) => fetchSearchResults(query),
 *   { wait: 500 },
 *   (state) => ({
 *     isPending: state.isPending,
 *     executionCount: state.executionCount,
 *     status: state.status
 *   })
 * );
 *
 * // In an event handler
 * const handleChange = (e) => {
 *   searchDebouncer.maybeExecute(e.target.value);
 * };
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { isPending } = searchDebouncer.state;
 * ```
 */
export function useDebouncer<TFn extends AnyFunction, TSelected = {}>(
  fn: TFn,
  options: ReactDebouncerOptions<TFn, TSelected>,
  selector: (state: DebouncerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactDebouncer<TFn, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().debouncer,
    ...options,
  } as ReactDebouncerOptions<TFn, TSelected>
  const [debouncer] = useState(() => {
    const debouncerInstance = new Debouncer(
      fn,
      mergedOptions,
    ) as unknown as ReactDebouncer<TFn, TSelected>

    debouncerInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: DebouncerState<TFn>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(debouncerInstance.store, props.selector, {
        compare: shallow,
      })

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return debouncerInstance
  })

  debouncer.fn = fn
  debouncer.setOptions(mergedOptions)

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(debouncer)
      } else {
        debouncer.cancel()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  const state = useSelector(debouncer.store, selector, { compare: shallow })

  return useMemo(
    () =>
      ({
        ...debouncer,
        state,
      }) as ReactDebouncer<TFn, TSelected>, // omit `store` in favor of `state`
    [debouncer, state],
  )
}
