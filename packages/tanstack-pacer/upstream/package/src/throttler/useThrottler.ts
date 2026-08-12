import { useEffect, useMemo, useState } from 'react'
import { Throttler } from '@tanstack/pacer/throttler'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type { AnyFunction } from '@tanstack/pacer/types'
import type {
  ThrottlerOptions,
  ThrottlerState,
} from '@tanstack/pacer/throttler'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactThrottlerOptions<
  TFn extends AnyFunction,
  TSelected = {},
> extends ThrottlerOptions<TFn> {
  /**
   * Optional callback invoked when the component unmounts. Receives the throttler instance.
   * When provided, replaces the default cleanup (cancel); use it to call flush(), reset(), cancel(), add logging, etc.
   */
  onUnmount?: (throttler: ReactThrottler<TFn, TSelected>) => void
}

export interface ReactThrottler<
  TFn extends AnyFunction,
  TSelected = {},
> extends Omit<Throttler<TFn>, 'store'> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the throttler state.
   *
   * This is useful for opting into state re-renders for specific parts of the throttler state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <throttler.Subscribe selector={(state) => ({ isPending: state.isPending })}>
   *   {({ isPending }) => (
   *     <div>{isPending ? 'Throttling...' : 'Ready'}</div>
   *   )}
   * </throttler.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: ThrottlerState<TFn>) => TSelected
    children: ((state: TSelected) => ReactNode) | ReactNode
  }) => ReturnType<FunctionComponent>
  /**
   * Reactive state that will be updated and re-rendered when the throttler state changes
   *
   * Use this instead of `throttler.store.state`
   */
  readonly state: Readonly<TSelected>
  /**
   * @deprecated Use `throttler.state` instead of `throttler.store.state` if you want to read reactive state.
   * The state on the store object is not reactive, as it has not been wrapped in a `useSelector` hook internally.
   * Although, you can make the state reactive by using the `useSelector` in your own usage.
   */
  readonly store: Store<Readonly<ThrottlerState<TFn>>>
}

/**
 * A low-level React hook that creates a `Throttler` instance that limits how often the provided function can execute.
 *
 * This hook is designed to be flexible and state-management agnostic - it simply returns a throttler instance that
 * you can integrate with any state management solution (useState, Redux, Zustand, Jotai, etc). For a simpler and higher-level hook that
 * integrates directly with React's useState, see useThrottledState.
 *
 * Throttling ensures a function executes at most once within a specified time window,
 * regardless of how many times it is called. This is useful for rate-limiting
 * expensive operations or UI updates.
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management. You can subscribe to state changes
 * in two ways:
 *
 * **1. Using `throttler.Subscribe` HOC (Recommended for component tree subscriptions)**
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
 * - `executionCount`: Number of function executions that have been completed
 * - `lastArgs`: The arguments from the most recent call to maybeExecute
 * - `lastExecutionTime`: Timestamp of the last function execution in milliseconds
 * - `nextExecutionTime`: Timestamp when the next execution can occur in milliseconds
 * - `isPending`: Whether the throttler is waiting for the timeout to trigger execution
 * - `status`: Current execution status ('disabled' | 'idle' | 'pending')
 *
 * ## Unmount behavior
 *
 * By default, the hook cancels any pending execution when the component unmounts.
 * Use the `onUnmount` option to customize this. For example, to flush pending work instead:
 *
 * ```tsx
 * const throttler = useThrottler(fn, {
 *   wait: 1000,
 *   onUnmount: (t) => t.flush()
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const [value, setValue] = useState(0);
 * const throttler = useThrottler(setValue, { wait: 1000 });
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <throttler.Subscribe selector={(state) => ({ isPending: state.isPending })}>
 *   {({ isPending }) => (
 *     <div>{isPending ? 'Throttling...' : 'Ready'}</div>
 *   )}
 * </throttler.Subscribe>
 *
 * // Opt-in to re-render when execution count changes at hook level (optimized for tracking executions)
 * const [value, setValue] = useState(0);
 * const throttler = useThrottler(
 *   setValue,
 *   { wait: 1000 },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Opt-in to re-render when throttling state changes (optimized for loading indicators)
 * const [value, setValue] = useState(0);
 * const throttler = useThrottler(
 *   setValue,
 *   { wait: 1000 },
 *   (state) => ({
 *     isPending: state.isPending,
 *     status: state.status
 *   })
 * );
 *
 * // Opt-in to re-render when timing information changes (optimized for timing displays)
 * const [value, setValue] = useState(0);
 * const throttler = useThrottler(
 *   setValue,
 *   { wait: 1000 },
 *   (state) => ({
 *     lastExecutionTime: state.lastExecutionTime,
 *     nextExecutionTime: state.nextExecutionTime
 *   })
 * );
 *
 * // With any state manager
 * const throttler = useThrottler(
 *   (value) => stateManager.setState(value),
 *   {
 *     wait: 2000,
 *     leading: true,   // Execute immediately on first call
 *     trailing: false  // Skip trailing edge updates
 *   }
 * );
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { executionCount, isPending } = throttler.state;
 * ```
 */
export function useThrottler<TFn extends AnyFunction, TSelected = {}>(
  fn: TFn,
  options: ReactThrottlerOptions<TFn, TSelected>,
  selector: (state: ThrottlerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactThrottler<TFn, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().throttler,
    ...options,
  } as ReactThrottlerOptions<TFn, TSelected>

  const [throttler] = useState(() => {
    const throttlerInstance = new Throttler<TFn>(
      fn,
      mergedOptions,
    ) as unknown as ReactThrottler<TFn, TSelected>

    throttlerInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: ThrottlerState<TFn>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(throttlerInstance.store, props.selector, {
        compare: shallow,
      })

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return throttlerInstance
  })

  throttler.fn = fn
  throttler.setOptions(mergedOptions)

  const state = useSelector(throttler.store, selector, { compare: shallow })

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(throttler)
      } else {
        throttler.cancel()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  return useMemo(
    () =>
      ({
        ...throttler,
        state,
      }) as ReactThrottler<TFn, TSelected>, // omit `store` in favor of `state`
    [throttler, state],
  )
}
