import { useState } from 'octane';
import { useRateLimiter } from './useRateLimiter';
import type { ReactRateLimiter, ReactRateLimiterOptions } from './useRateLimiter';
import type { Dispatch, SetStateAction } from '../internal';
import type { RateLimiterState } from '@tanstack/pacer/rate-limiter';

/**
 * An Octane hook that creates a rate-limited state value. Returns a tuple of
 * the current value, a rate-limited updater, and the rate limiter instance.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector` (see {@link useRateLimiter}).
 *
 * @example
 * ```tsx
 * const [value, setValue, rateLimiter] = useRateLimitedState(0, {
 *   limit: 5,
 *   window: 60000,
 * });
 * ```
 */
export function useRateLimitedState<TValue, TSelected = RateLimiterState>(
	value: TValue,
	options: ReactRateLimiterOptions<Dispatch<SetStateAction<TValue>>, TSelected>,
	selector?: (state: RateLimiterState) => TSelected,
): [
	TValue,
	Dispatch<SetStateAction<TValue>>,
	ReactRateLimiter<Dispatch<SetStateAction<TValue>>, TSelected>,
] {
	const [rateLimitedValue, setRateLimitedValue] = useState<TValue>(value);
	const rateLimiter = useRateLimiter(setRateLimitedValue, options, selector);
	return [rateLimitedValue, rateLimiter.maybeExecute, rateLimiter];
}
