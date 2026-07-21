import { useEffect } from 'octane';
import { useThrottledState } from './useThrottledState';
import type { ReactThrottler, ReactThrottlerOptions } from './useThrottler';
import type { Dispatch, SetStateAction } from '../internal';
import type { ThrottlerState } from '@tanstack/pacer/throttler';

/**
 * An Octane hook that creates a throttled value that updates at most once per
 * wait period. Automatically tracks changes to the input value.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useThrottler}).
 *
 * @example
 * ```tsx
 * const [throttledValue, throttler] = useThrottledValue(value, { wait: 1000 });
 * ```
 */
export function useThrottledValue<
	TValue,
	TSelected = ThrottlerState<Dispatch<SetStateAction<TValue>>>,
>(
	value: TValue,
	options: ReactThrottlerOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: ThrottlerState<Dispatch<SetStateAction<TValue>>>) => TSelected,
): [TValue, ReactThrottler<Dispatch<SetStateAction<TValue>>, TSelected>] {
	const [throttledValue, setThrottledValue, throttler] = useThrottledState(
		value,
		options,
		selector,
	);

	useEffect(() => {
		setThrottledValue(value);
	}, [value, setThrottledValue]);

	return [throttledValue, throttler];
}
