import { useState } from 'octane';
import { useThrottler } from './useThrottler';
import type { ReactThrottler, ReactThrottlerOptions } from './useThrottler';
import type { Dispatch, SetStateAction } from '../internal';
import type { ThrottlerState } from '@tanstack/pacer/throttler';

/**
 * An Octane hook that creates a throttled state value, combining `useState`
 * with throttling functionality. Returns a tuple of the current throttled
 * value, a throttled updater, and the throttler instance.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useThrottler}).
 *
 * @example
 * ```tsx
 * const [value, setValue, throttler] = useThrottledState(0, { wait: 1000 });
 * ```
 */
export function useThrottledState<
	TValue,
	TSelected = ThrottlerState<Dispatch<SetStateAction<TValue>>>,
>(
	value: TValue,
	options: ReactThrottlerOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: ThrottlerState<Dispatch<SetStateAction<TValue>>>) => TSelected,
): [
	TValue,
	Dispatch<SetStateAction<TValue>>,
	ReactThrottler<Dispatch<SetStateAction<TValue>>, TSelected>,
] {
	const [throttledValue, setThrottledValue] = useState<TValue>(value);
	const throttler = useThrottler(setThrottledValue, options, selector);
	return [throttledValue, throttler.maybeExecute, throttler];
}
