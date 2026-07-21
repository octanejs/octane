import { useEffect, useMemo, useState } from 'octane';
import { AsyncRateLimiter } from '@tanstack/pacer/async-rate-limiter';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type {
	AsyncRateLimiterOptions,
	AsyncRateLimiterState,
} from '@tanstack/pacer/async-rate-limiter';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncRateLimiter:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncRateLimiter:state');

export interface ReactAsyncRateLimiterOptions<
	TFn extends AnyAsyncFunction,
	TSelected = {},
> extends AsyncRateLimiterOptions<TFn> {
	/**
	 * Custom unmount behavior. Defaults to aborting in-flight executions.
	 */
	onUnmount?: (rateLimiter: ReactAsyncRateLimiter<TFn, TSelected>) => void;
}

export interface ReactAsyncRateLimiter<TFn extends AnyAsyncFunction, TSelected = {}> extends Omit<
	AsyncRateLimiter<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the rate limiter's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: AsyncRateLimiterState<TFn>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<AsyncRateLimiterState<TFn>>>;
}

/**
 * An Octane hook that creates and manages an AsyncRateLimiter instance.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const rateLimiter = useAsyncRateLimiter(fetchData, {
 *   limit: 5,
 *   window: 60000,
 * });
 * ```
 */
export function useAsyncRateLimiter<TFn extends AnyAsyncFunction, TSelected = {}>(
	fn: TFn,
	options: ReactAsyncRateLimiterOptions<TFn, TSelected>,
	selector: (state: AsyncRateLimiterState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactAsyncRateLimiter<TFn, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().asyncRateLimiter,
		...options,
	} as ReactAsyncRateLimiterOptions<TFn, TSelected>;
	const [asyncRateLimiter] = useState(() => {
		const asyncRateLimiterInstance = new AsyncRateLimiter<TFn>(
			fn,
			mergedOptions,
		) as unknown as ReactAsyncRateLimiter<TFn, TSelected>;

		asyncRateLimiterInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: AsyncRateLimiterState<TFn>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				asyncRateLimiterInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return asyncRateLimiterInstance;
	});

	asyncRateLimiter.fn = fn;
	asyncRateLimiter.setOptions(mergedOptions);

	const state = useSelectorSlot(asyncRateLimiter.store, selector, { compare: shallow }, stateSlot);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(asyncRateLimiter);
			} else {
				asyncRateLimiter.abort();
			}
		};
	}, []);

	return useMemo(
		() =>
			({
				...asyncRateLimiter,
				state,
			}) as ReactAsyncRateLimiter<TFn, TSelected>, // omit `store` in favor of `state`
		[asyncRateLimiter, state],
	);
}
