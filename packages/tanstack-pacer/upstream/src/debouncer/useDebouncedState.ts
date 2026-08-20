import { useState } from 'react'
import { useDebouncer } from './useDebouncer'
import type { ReactDebouncer, ReactDebouncerOptions } from './useDebouncer'
import type { DebouncerState } from '@tanstack/pacer/debouncer'

/**
 * A React hook that creates a debounced state value, combining React's useState with debouncing functionality.
 * This hook provides both the current debounced value and methods to update it.
 *
 * The state value is only updated after the specified wait time has elapsed since the last update attempt.
 * If another update is attempted before the wait time expires, the timer resets and starts waiting again.
 * This is useful for handling frequent state updates that should be throttled, like search input values
 * or window resize dimensions.
 *
 * The hook returns a tuple containing:
 * - The current debounced value
 * - A function to update the debounced value
 * - The debouncer instance with additional control methods
 *
 * ## State Management and Selector
 *
 * The hook uses TanStack Store for reactive state management via the underlying debouncer instance.
 * The `selector` parameter allows you to specify which debouncer state changes will trigger a re-render,
 * optimizing performance by preventing unnecessary re-renders when irrelevant state changes occur.
 *
 * **By default, there will be no reactive state subscriptions** and you must opt-in to state
 * tracking by providing a selector function. This prevents unnecessary re-renders and gives you
 * full control over when your component updates. Only when you provide a selector will the
 * component re-render when the selected state values change.
 *
 * Available debouncer state properties:
 * - `canLeadingExecute`: Whether the debouncer can execute on the leading edge
 * - `executionCount`: Number of function executions that have been completed
 * - `isPending`: Whether the debouncer is waiting for the timeout to trigger execution
 * - `lastArgs`: The arguments from the most recent call to maybeExecute
 * - `status`: Current execution status ('disabled' | 'idle' | 'pending')
 *
 * @example
 * ```tsx
 * // Default behavior - no reactive state subscriptions
 * const [searchTerm, setSearchTerm, debouncer] = useDebouncedState('', {
 *   wait: 500 // Wait 500ms after last keystroke
 * });
 *
 * // Opt-in to re-render when pending state changes (optimized for loading indicators)
 * const [searchTerm, setSearchTerm, debouncer] = useDebouncedState(
 *   '',
 *   { wait: 500 },
 *   (state) => ({ isPending: state.isPending })
 * );
 *
 * // Opt-in to re-render when execution count changes (optimized for tracking executions)
 * const [searchTerm, setSearchTerm, debouncer] = useDebouncedState(
 *   '',
 *   { wait: 500 },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Opt-in to re-render when debouncing status changes (optimized for status display)
 * const [searchTerm, setSearchTerm, debouncer] = useDebouncedState(
 *   '',
 *   { wait: 500 },
 *   (state) => ({
 *     status: state.status,
 *     canLeadingExecute: state.canLeadingExecute
 *   })
 * );
 *
 * // Update value - will be debounced
 * const handleChange = (e) => {
 *   setSearchTerm(e.target.value);
 * };
 *
 * // Access the selected debouncer state (will be empty object {} unless selector provided)
 * const { isPending, executionCount } = debouncer.state;
 * ```
 */
export function useDebouncedState<
  TValue,
  TSelected = DebouncerState<React.Dispatch<React.SetStateAction<TValue>>>,
>(
  value: TValue,
  options: ReactDebouncerOptions<
    React.Dispatch<React.SetStateAction<TValue>>,
    TSelected
  >,
  selector?: (
    state: DebouncerState<React.Dispatch<React.SetStateAction<TValue>>>,
  ) => TSelected,
): [
  TValue,
  React.Dispatch<React.SetStateAction<TValue>>,
  ReactDebouncer<React.Dispatch<React.SetStateAction<TValue>>, TSelected>,
] {
  const [debouncedValue, setDebouncedValue] = useState(value)
  const debouncer = useDebouncer(setDebouncedValue, options, selector)
  return [debouncedValue, debouncer.maybeExecute, debouncer]
}
