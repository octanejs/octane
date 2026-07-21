import { useEffect } from 'octane';
import { useRateLimitedState } from './useRateLimitedState';
import type { ReactRateLimiter, ReactRateLimiterOptions } from './useRateLimiter';
import type { Dispatch, SetStateAction } from '../internal';
import type { RateLimiterState } from '@tanstack/pacer/rate-limiter';

/**
 * An Octane hook that creates a rate-limited value that automatically tracks
 * changes to the input value.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useRateLimiter}).
 *
 * @example
 * ```tsx
 * const [rateLimitedValue, rateLimiter] = useRateLimitedValue(value, {
 *   limit: 5,
 *   window: 60000,
 * });
 * ```
 */
export function useRateLimitedValue<TValue, TSelected = RateLimiterState>(
	value: TValue,
	options: ReactRateLimiterOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: RateLimiterState) => TSelected,
): [TValue, ReactRateLimiter<Dispatch<SetStateAction<TValue>>, TSelected>] {
	const [rateLimitedValue, setRateLimitedValue, rateLimiter] = useRateLimitedState(
		value,
		options,
		selector,
	);

	useEffect(() => {
		setRateLimitedValue(value);
	}, [value, setRateLimitedValue]);

	return [rateLimitedValue, rateLimiter];
}
