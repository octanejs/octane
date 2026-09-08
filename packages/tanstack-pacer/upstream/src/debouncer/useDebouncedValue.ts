import { useEffect } from 'react'
import { useDebouncedState } from './useDebouncedState'
import type { ReactDebouncer, ReactDebouncerOptions } from './useDebouncer'
import type { DebouncerState } from '@tanstack/pacer/debouncer'

/**
 * A React hook that creates a debounced value that updates only after a specified delay.
 * Unlike useDebouncedState, this hook automatically tracks changes to the input value
 * and updates the debounced value accordingly.
 *
 * The debounced value will only update after the specified wait time has elapsed since
 * the last change to the input value. If the input value changes again before the wait
 * time expires, the timer resets and starts waiting again.
 *
 * This is useful for deriving debounced values from props or state that change frequently,
 * like search queries or form inputs, where you want to limit how often downstream effects
 * or calculations occur.
 *
 * The hook returns the current debounced value and the underlying debouncer instance.
 * The debouncer instance can be used to access additional functionality like cancellation
 * and execution counts.
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
 * const [searchQuery, setSearchQuery] = useState('');
 * const [debouncedQuery, debouncer] = useDebouncedValue(searchQuery, {
 *   wait: 500 // Wait 500ms after last change
 * });
 *
 * // Opt-in to re-render when pending state changes (optimized for loading indicators)
 * const [debouncedQuery, debouncer] = useDebouncedValue(
 *   searchQuery,
 *   { wait: 500 },
 *   (state) => ({ isPending: state.isPending })
 * );
 *
 * // Opt-in to re-render when execution count changes (optimized for tracking executions)
 * const [debouncedQuery, debouncer] = useDebouncedValue(
 *   searchQuery,
 *   { wait: 500 },
 *   (state) => ({ executionCount: state.executionCount })
 * );
 *
 * // Opt-in to re-render when debouncing status changes (optimized for status display)
 * const [debouncedQuery, debouncer] = useDebouncedValue(
 *   searchQuery,
 *   { wait: 500 },
 *   (state) => ({
 *     status: state.status,
 *     canLeadingExecute: state.canLeadingExecute
 *   })
 * );
 *
 * // debouncedQuery will update 500ms after searchQuery stops changing
 * useEffect(() => {
 *   fetchSearchResults(debouncedQuery);
 * }, [debouncedQuery]);
 *
 * // Handle input changes
 * const handleChange = (e) => {
 *   setSearchQuery(e.target.value);
 * };
 *
 * // Access the selected debouncer state (will be empty object {} unless selector provided)
 * const { isPending, executionCount } = debouncer.state;
 * ```
 */
export function useDebouncedValue<
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
  ReactDebouncer<React.Dispatch<React.SetStateAction<TValue>>, TSelected>,
] {
  const [debouncedValue, setDebouncedValue, debouncer] = useDebouncedState(
    value,
    options,
    selector,
  )

  useEffect(() => {
    setDebouncedValue(value)
  }, [value, setDebouncedValue])

  return [debouncedValue, debouncer]
}
