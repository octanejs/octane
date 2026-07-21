import { useEffect, useMemo, useState } from 'octane';
import { RateLimiter } from '@tanstack/pacer/rate-limiter';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { RateLimiterOptions, RateLimiterState } from '@tanstack/pacer/rate-limiter';
import type { AnyFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useRateLimiter:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useRateLimiter:state');

export interface ReactRateLimiterOptions<
	TFn extends AnyFunction,
	TSelected = {},
> extends RateLimiterOptions<TFn> {
	/**
	 * Custom unmount behavior (rate limiters have nothing to cancel by default).
	 */
	onUnmount?: (rateLimiter: ReactRateLimiter<TFn, TSelected>) => void;
}

export interface ReactRateLimiter<TFn extends AnyFunction, TSelected = {}> extends Omit<
	RateLimiter<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the rate limiter's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: RateLimiterState) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<RateLimiterState>>;
}

/**
 * An Octane hook that creates and manages a RateLimiter instance.
 *
 * The rate limiter allows a maximum number of executions within a time window
 * (fixed or sliding).
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const rateLimiter = useRateLimiter(
 *   makeApiCall,
 *   { limit: 5, window: 60000 },
 *   (state) => ({ rejectionCount: state.rejectionCount }),
 * );
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
	} as ReactRateLimiterOptions<TFn, TSelected>;
	const [rateLimiter] = useState(() => {
		const rateLimiterInstance = new RateLimiter<TFn>(
			fn,
			mergedOptions,
		) as unknown as ReactRateLimiter<TFn, TSelected>;

		rateLimiterInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: RateLimiterState) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				rateLimiterInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return rateLimiterInstance;
	});

	rateLimiter.fn = fn;
	rateLimiter.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(rateLimiter);
			}
		};
	}, []);

	const state = useSelectorSlot(rateLimiter.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...rateLimiter,
				state,
			}) as ReactRateLimiter<TFn, TSelected>, // omit `store` in favor of `state`
		[rateLimiter, state],
	);
}
