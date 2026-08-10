import { useEffect } from 'react'
import { useThrottledState } from './useThrottledState'
import type { ReactThrottler, ReactThrottlerOptions } from './useThrottler'
import type { ThrottlerState } from '@tanstack/pacer/throttler'

/**
 * A high-level React hook that creates a throttled version of a value that updates at most once within a specified time window.
 * This hook uses React's useState internally to manage the throttled state.
 *
 * Throttling ensures the value updates occur at a controlled rate regardless of how frequently the input value changes.
 * This is useful for rate-limiting expensive re-renders or API calls that depend on rapidly changing values.
 *
 * The hook returns a tuple containing:
 * - The throttled value that updates according to the leading/trailing edge behavior specified in the options
 * - The throttler instance with control methods
 *
 * For more direct control over throttling behavior without React state management,
 * consider using the lower-level useThrottler hook instead.
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management via the underlying throttler instance.
 * The `selector` parameter allows you to specify which throttler state changes will trigger a re-render,
 * optimizing performance by preventing unnecessary re-renders when irrelevant state changes occur.
 *
 * **By default, there will be no reactive state subscriptions** and you must opt-in to state
 * tracking by providing a selector function. This prevents unnecessary re-renders and gives you
 * full control over when your component updates. Only when you provide a selector will the
 * component re-render when the selected state values change.
 *
 * Available throttler state properties:
 * - `executionCount`: Number of function executions that have been completed
 * - `lastArgs`: The arguments from the most recent call to maybeExecute
 * - `lastExecutionTime`: Timestamp of the last function execution in milliseconds
 * - `nextExecutionTime`: Timestamp when the next execution can occur in milliseconds
 * - `isPending`: Whether the throttler is waiting for the timeout to trigger execution
 * - `status`: Current execution status ('disabled' | 'idle' | 'pending')
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const [throttledValue, throttler] = useThrottledValue(rawValue, { wait: 1000 });
 *
 * // Opt-in to re-render when execution count changes (optimized for tracking executions)
 * const [throttledValue, throttler] = useThrottledValue(
 *   rawValue,
 *   { wait: 1000 },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Opt-in to re-render when throttling state changes (optimized for loading indicators)
 * const [throttledValue, throttler] = useThrottledValue(
 *   rawValue,
 *   { wait: 1000 },
 *   (state) => ({
 *     isPending: state.isPending,
 *     status: state.status
 *   })
 * );
 *
 * // Opt-in to re-render when timing information changes (optimized for timing displays)
 * const [throttledValue, throttler] = useThrottledValue(
 *   rawValue,
 *   { wait: 1000 },
 *   (state) => ({
 *     lastExecutionTime: state.lastExecutionTime,
 *     nextExecutionTime: state.nextExecutionTime
 *   })
 * );
 *
 * // With custom leading/trailing behavior
 * const [throttledValue, throttler] = useThrottledValue(rawValue, {
 *   wait: 1000,
 *   leading: true,   // Update immediately on first change
 *   trailing: false  // Skip trailing edge updates
 * });
 *
 * // Access the selected throttler state (will be empty object {} unless selector provided)
 * const { executionCount, isPending } = throttler.state;
 * ```
 */
export function useThrottledValue<
  TValue,
  TSelected = ThrottlerState<React.Dispatch<React.SetStateAction<TValue>>>,
>(
  value: TValue,
  options: ReactThrottlerOptions<
    React.Dispatch<React.SetStateAction<TValue>>,
    TSelected
  >,
  selector?: (
    state: ThrottlerState<React.Dispatch<React.SetStateAction<TValue>>>,
  ) => TSelected,
): [
  TValue,
  ReactThrottler<React.Dispatch<React.SetStateAction<TValue>>, TSelected>,
] {
  const [throttledValue, setThrottledValue, throttler] = useThrottledState(
    value,
    options,
    selector,
  )

  useEffect(() => {
    setThrottledValue(value)
  }, [value, setThrottledValue])

  return [throttledValue, throttler]
}
