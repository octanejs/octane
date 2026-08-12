import { useEffect, useMemo, useState } from 'react'
import { RateLimiter } from '@tanstack/pacer/rate-limiter'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type {
  RateLimiterOptions,
  RateLimiterState,
} from '@tanstack/pacer/rate-limiter'
import type { AnyFunction } from '@tanstack/pacer/types'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactRateLimiterOptions<
  TFn extends AnyFunction,
  TSelected = {},
> extends RateLimiterOptions<TFn> {
  /**
   * Optional callback invoked when the component unmounts. Receives the rate limiter instance.
   * When provided, replaces the default cleanup; use it to call reset(), add logging, etc.
   */
  onUnmount?: (rateLimiter: ReactRateLimiter<TFn, TSelected>) => void
}

export interface ReactRateLimiter<
  TFn extends AnyFunction,
  TSelected = {},
> extends Omit<RateLimiter<TFn>, 'store'> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the rate limiter state.
   *
   * This is useful for opting into state re-renders for specific parts of the rate limiter state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <rateLimiter.Subscribe selector={(state) => ({ rejectionCount: state.rejectionCount })}>
   *   {({ rejectionCount }) => (
   *     <div>Rejected: {rejectionCount} requests</div>
   *   )}
   * </rateLimiter.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: RateLimiterState) => TSelected
    children: ((state: TSelected) => ReactNode) | ReactNode
  }) => ReturnType<FunctionComponent>
  /**
   * Reactive state that will be updated and re-rendered when the rate limiter state changes
   *
   * Use this instead of `rateLimiter.store.state`
   */
  readonly state: Readonly<TSelected>
  /**
   * @deprecated Use `rateLimiter.state` instead of `rateLimiter.store.state` if you want to read reactive state.
   * The state on the store object is not reactive, as it has not been wrapped in a `useSelector` hook internally.
   * Although, you can make the state reactive by using the `useSelector` in your own usage.
   */
  readonly store: Store<Readonly<RateLimiterState>>
}

/**
 * A low-level React hook that creates a `RateLimiter` instance to enforce rate limits on function execution.
 *
 * This hook is designed to be flexible and state-management agnostic - it simply returns a rate limiter instance that
 * you can integrate with any state management solution (useState, Redux, Zustand, Jotai, etc).
 *
 * Rate limiting is a simple "hard limit" approach that allows executions until a maximum count is reached within
 * a time window, then blocks all subsequent calls until the window resets. Unlike throttling or debouncing,
 * it does not attempt to space out or collapse executions intelligently.
 *
 * The rate limiter supports two types of windows:
 * - 'fixed': A strict window that resets after the window period. All executions within the window count
 *   towards the limit, and the window resets completely after the period.
 * - 'sliding': A rolling window that allows executions as old ones expire. This provides a more
 *   consistent rate of execution over time.
 *
 * For smoother execution patterns:
 * - Use throttling when you want consistent spacing between executions (e.g. UI updates)
 * - Use debouncing when you want to collapse rapid-fire events (e.g. search input)
 * - Use rate limiting only when you need to enforce hard limits (e.g. API rate limits)
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management. You can subscribe to state changes
 * in two ways:
 *
 * **1. Using `rateLimiter.Subscribe` HOC (Recommended for component tree subscriptions)**
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
 * - `executionTimes`: Array of timestamps when executions occurred for rate limiting calculations
 * - `rejectionCount`: Number of function executions that have been rejected due to rate limiting
 *
 * The hook returns an object containing:
 * - maybeExecute: The rate-limited function that respects the configured limits
 * - getExecutionCount: Returns the number of successful executions
 * - getRejectionCount: Returns the number of rejected executions due to rate limiting
 * - getRemainingInWindow: Returns how many more executions are allowed in the current window
 * - reset: Resets the execution counts and window timing
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const rateLimiter = useRateLimiter(apiCall, {
 *   limit: 5,
 *   window: 60000,
 *   windowType: 'sliding',
 * });
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <rateLimiter.Subscribe selector={(state) => ({ rejectionCount: state.rejectionCount })}>
 *   {({ rejectionCount }) => (
 *     <div>Rejected: {rejectionCount} requests</div>
 *   )}
 * </rateLimiter.Subscribe>
 *
 * // Opt-in to re-render when execution count changes at hook level (optimized for tracking successful executions)
 * const rateLimiter = useRateLimiter(
 *   apiCall,
 *   {
 *     limit: 5,
 *     window: 60000,
 *     windowType: 'sliding',
 *   },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Opt-in to re-render when rejection count changes (optimized for tracking rate limit violations)
 * const rateLimiter = useRateLimiter(
 *   apiCall,
 *   {
 *     limit: 5,
 *     window: 60000,
 *     windowType: 'sliding',
 *   },
 *   (state) => ({ rejectionCount: state.rejectionCount })
 * );
 *
 * // Opt-in to re-render when execution times change (optimized for window calculations)
 * const rateLimiter = useRateLimiter(
 *   apiCall,
 *   {
 *     limit: 5,
 *     window: 60000,
 *     windowType: 'sliding',
 *   },
 *   (state) => ({ executionTimes: state.executionTimes })
 * );
 *
 * // Multiple state properties - re-render when any of these change
 * const rateLimiter = useRateLimiter(
 *   apiCall,
 *   {
 *     limit: 5,
 *     window: 60000,
 *     windowType: 'sliding',
 *   },
 *   (state) => ({
 *     executionCount: state.executionCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Monitor rate limit status
 * const handleClick = () => {
 *   const remaining = rateLimiter.getRemainingInWindow();
 *   if (remaining > 0) {
 *     rateLimiter.maybeExecute(data);
 *   } else {
 *     showRateLimitWarning();
 *   }
 * };
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { executionCount, rejectionCount } = rateLimiter.state;
 * ```
 */
export function useRateLimiter<TFn extends AnyFunction, TSelected = {}>(
  fn: TFn,
  options: ReactRateLimiterOptions<TFn, TSelected>,
  selector: (state: RateLimiterState) => TSelected = () => ({}) as TSelected,
): ReactRateLimiter<TFn, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().rateLimiter,
    ...options,
  } as ReactRateLimiterOptions<TFn, TSelected>
  const [rateLimiter] = useState(() => {
    const rateLimiterInstance = new RateLimiter<TFn>(
      fn,
      mergedOptions,
    ) as unknown as ReactRateLimiter<TFn, TSelected>

    rateLimiterInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: RateLimiterState) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(rateLimiterInstance.store, props.selector, {
        compare: shallow,
      })

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return rateLimiterInstance
  })

  rateLimiter.fn = fn
  rateLimiter.setOptions(mergedOptions)

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(rateLimiter)
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  const state = useSelector(rateLimiter.store, selector, { compare: shallow })

  return useMemo(
    () =>
      ({
        ...rateLimiter,
        state,
      }) as ReactRateLimiter<TFn, TSelected>, // omit `store` in favor of `state`
    [rateLimiter, state],
  )
}
