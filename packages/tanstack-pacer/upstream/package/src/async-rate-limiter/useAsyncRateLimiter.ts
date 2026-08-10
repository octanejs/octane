import { useEffect, useMemo, useState } from 'react'
import { AsyncRateLimiter } from '@tanstack/pacer/async-rate-limiter'
import { shallow, useSelector } from '@tanstack/react-store'
import { useDefaultPacerOptions } from '../provider/PacerProvider'
import type { Store } from '@tanstack/react-store'
import type { AnyAsyncFunction } from '@tanstack/pacer/types'
import type {
  AsyncRateLimiterOptions,
  AsyncRateLimiterState,
} from '@tanstack/pacer/async-rate-limiter'
import type { FunctionComponent, ReactNode } from 'react'

export interface ReactAsyncRateLimiterOptions<
  TFn extends AnyAsyncFunction,
  TSelected = {},
> extends AsyncRateLimiterOptions<TFn> {
  /**
   * Optional callback invoked when the component unmounts. Receives the rate limiter instance.
   * When provided, replaces the default cleanup (abort); use it to call reset(), add logging, etc.
   */
  onUnmount?: (rateLimiter: ReactAsyncRateLimiter<TFn, TSelected>) => void
}

export interface ReactAsyncRateLimiter<
  TFn extends AnyAsyncFunction,
  TSelected = {},
> extends Omit<AsyncRateLimiter<TFn>, 'store'> {
  /**
   * A React HOC (Higher Order Component) that allows you to subscribe to the rate limiter state.
   *
   * This is useful for opting into state re-renders for specific parts of the rate limiter state
   * deep in your component tree without needing to pass a selector to the hook.
   *
   * @example
   * <rateLimiter.Subscribe selector={(state) => ({ rejectionCount: state.rejectionCount, isExecuting: state.isExecuting })}>
   *   {({ rejectionCount, isExecuting }) => (
   *     <div>Rejected: {rejectionCount}, {isExecuting ? 'Executing' : 'Idle'}</div>
   *   )}
   * </rateLimiter.Subscribe>
   */
  Subscribe: <TSelected>(props: {
    selector: (state: AsyncRateLimiterState<TFn>) => TSelected
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
  readonly store: Store<Readonly<AsyncRateLimiterState<TFn>>>
}

/**
 * A low-level React hook that creates an `AsyncRateLimiter` instance to limit how many times an async function can execute within a time window.
 *
 * This hook is designed to be flexible and state-management agnostic - it simply returns a rate limiter instance that
 * you can integrate with any state management solution (useState, Redux, Zustand, Jotai, etc).
 *
 * Rate limiting allows an async function to execute up to a specified limit within a time window,
 * then blocks subsequent calls until the window passes. This is useful for respecting API rate limits,
 * managing resource constraints, or controlling bursts of async operations.
 *
 * Unlike the non-async RateLimiter, this async version supports returning values from the rate-limited function,
 * making it ideal for API calls and other async operations where you want the result of the `maybeExecute` call
 * instead of setting the result on a state variable from within the rate-limited function.
 *
 * The rate limiter supports two types of windows:
 * - 'fixed': A strict window that resets after the window period. All executions within the window count
 *   towards the limit, and the window resets completely after the period.
 * - 'sliding': A rolling window that allows executions as old ones expire. This provides a more
 *   consistent rate of execution over time.
 *
 * Error Handling:
 * - If an `onError` handler is provided, it will be called with the error and rate limiter instance
 * - If `throwOnError` is true (default when no onError handler is provided), the error will be thrown
 * - If `throwOnError` is false (default when onError handler is provided), the error will be swallowed
 * - Both onError and throwOnError can be used together - the handler will be called before any error is thrown
 * - The error state can be checked using the underlying AsyncRateLimiter instance
 * - Rate limit rejections (when limit is exceeded) are handled separately from execution errors via the `onReject` handler
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
 * - `errorCount`: Number of function executions that have resulted in errors
 * - `executionTimes`: Array of timestamps when executions occurred for rate limiting calculations
 * - `isExecuting`: Whether the rate-limited function is currently executing asynchronously
 * - `lastResult`: The result from the most recent successful function execution
 * - `rejectionCount`: Number of function executions that have been rejected due to rate limiting
 * - `settleCount`: Number of function executions that have completed (success or error)
 * - `successCount`: Number of function executions that have completed successfully
 *
 * ## Unmount behavior
 *
 * By default, the hook aborts any in-flight execution when the component unmounts.
 * Abort only cancels underlying operations (e.g. fetch) when the abort signal from `getAbortSignal()` is passed to them.
 * Use the `onUnmount` option to customize this.
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data; // Return value is preserved
 *   },
 *   { limit: 5, window: 1000 } // 5 calls per second
 * );
 *
 * // Subscribe to state changes deep in component tree using Subscribe HOC
 * <asyncRateLimiter.Subscribe selector={(state) => ({ rejectionCount: state.rejectionCount, isExecuting: state.isExecuting })}>
 *   {({ rejectionCount, isExecuting }) => (
 *     <div>Rejected: {rejectionCount}, {isExecuting ? 'Executing' : 'Idle'}</div>
 *   )}
 * </asyncRateLimiter.Subscribe>
 *
 * // Opt-in to re-render when execution state changes at hook level (optimized for loading indicators)
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data;
 *   },
 *   { limit: 5, window: 1000 },
 *   (state) => ({ isExecuting: state.isExecuting })
 * );
 *
 * // Opt-in to re-render when results are available (optimized for data display)
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data;
 *   },
 *   { limit: 5, window: 1000 },
 *   (state) => ({
 *     lastResult: state.lastResult,
 *     successCount: state.successCount
 *   })
 * );
 *
 * // Opt-in to re-render when error/rejection state changes (optimized for error handling)
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data;
 *   },
 *   {
 *     limit: 5,
 *     window: 1000,
 *     onError: (error) => console.error('API call failed:', error),
 *     onReject: (rateLimiter) => console.log('Rate limit exceeded')
 *   },
 *   (state) => ({
 *     errorCount: state.errorCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Opt-in to re-render when execution metrics change (optimized for stats display)
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data;
 *   },
 *   { limit: 5, window: 1000 },
 *   (state) => ({
 *     successCount: state.successCount,
 *     errorCount: state.errorCount,
 *     settleCount: state.settleCount,
 *     rejectionCount: state.rejectionCount
 *   })
 * );
 *
 * // Opt-in to re-render when execution times change (optimized for window calculations)
 * const asyncRateLimiter = useAsyncRateLimiter(
 *   async (id: string) => {
 *     const data = await api.fetchData(id);
 *     return data;
 *   },
 *   { limit: 5, window: 1000 },
 *   (state) => ({ executionTimes: state.executionTimes })
 * );
 *
 * // With state management and return value
 * const [data, setData] = useState(null);
 * const { maybeExecute, state } = useAsyncRateLimiter(
 *   async (query) => {
 *     const result = await searchAPI(query);
 *     setData(result);
 *     return result; // Return value can be used by the caller
 *   },
 *   {
 *     limit: 10,
 *     window: 60000, // 10 calls per minute
 *     onReject: (rateLimiter) => {
 *       console.log(`Rate limit exceeded. Try again in ${rateLimiter.getMsUntilNextWindow()}ms`);
 *     },
 *     onError: (error) => {
 *       console.error('API call failed:', error);
 *     }
 *   }
 * );
 *
 * // Access the selected state (will be empty object {} unless selector provided)
 * const { isExecuting, lastResult, rejectionCount } = state;
 * ```
 */
export function useAsyncRateLimiter<
  TFn extends AnyAsyncFunction,
  TSelected = {},
>(
  fn: TFn,
  options: ReactAsyncRateLimiterOptions<TFn, TSelected>,
  selector: (state: AsyncRateLimiterState<TFn>) => TSelected = () =>
    ({}) as TSelected,
): ReactAsyncRateLimiter<TFn, TSelected> {
  const mergedOptions = {
    ...useDefaultPacerOptions().asyncRateLimiter,
    ...options,
  } as ReactAsyncRateLimiterOptions<TFn, TSelected>
  const [asyncRateLimiter] = useState(() => {
    const asyncRateLimiterInstance = new AsyncRateLimiter<TFn>(
      fn,
      mergedOptions,
    ) as unknown as ReactAsyncRateLimiter<TFn, TSelected>

    asyncRateLimiterInstance.Subscribe = function Subscribe<TSelected>(props: {
      selector: (state: AsyncRateLimiterState<TFn>) => TSelected
      children: ((state: TSelected) => ReactNode) | ReactNode
    }) {
      const selected = useSelector(
        asyncRateLimiterInstance.store,
        props.selector,
        { compare: shallow },
      )

      return typeof props.children === 'function'
        ? props.children(selected)
        : props.children
    }

    return asyncRateLimiterInstance
  })

  asyncRateLimiter.fn = fn
  asyncRateLimiter.setOptions(mergedOptions)

  /* eslint-disable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler -- unmount cleanup only; empty deps keep teardown stable */
  useEffect(() => {
    return () => {
      if (mergedOptions.onUnmount) {
        mergedOptions.onUnmount(asyncRateLimiter)
      } else {
        asyncRateLimiter.abort()
      }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps, react-compiler/react-compiler */

  const state = useSelector(asyncRateLimiter.store, selector, {
    compare: shallow,
  })

  return useMemo(
    () =>
      ({
        ...asyncRateLimiter,
        state,
      }) as ReactAsyncRateLimiter<TFn, TSelected>, // omit `store` in favor of `state`
    [asyncRateLimiter, state],
  )
}
