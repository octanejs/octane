import { useEffect, useMemo, useState } from 'octane';
import { Throttler } from '@tanstack/pacer/throttler';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { ThrottlerOptions, ThrottlerState } from '@tanstack/pacer/throttler';
import type { AnyFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useThrottler:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useThrottler:state');

export interface ReactThrottlerOptions<
	TFn extends AnyFunction,
	TSelected = {},
> extends ThrottlerOptions<TFn> {
	/**
	 * Custom unmount behavior. Defaults to cancelling any pending execution.
	 */
	onUnmount?: (throttler: ReactThrottler<TFn, TSelected>) => void;
}

export interface ReactThrottler<TFn extends AnyFunction, TSelected = {}> extends Omit<
	Throttler<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the throttler's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: ThrottlerState<TFn>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<ThrottlerState<TFn>>>;
}

/**
 * An Octane hook that creates and manages a Throttler instance.
 *
 * The throttler limits how often a function can execute, ensuring executions
 * are spaced by at least the specified wait time.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const throttler = useThrottler(updateValue, { wait: 1000 }, (state) => ({
 *   executionCount: state.executionCount,
 * }));
 * ```
 */
export function useThrottler<TFn extends AnyFunction, TSelected = {}>(
	fn: TFn,
	options: ReactThrottlerOptions<TFn, TSelected>,
	selector: (state: ThrottlerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactThrottler<TFn, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().throttler,
		...options,
	} as ReactThrottlerOptions<TFn, TSelected>;
	const [throttler] = useState(() => {
		const throttlerInstance = new Throttler<TFn>(fn, mergedOptions) as unknown as ReactThrottler<
			TFn,
			TSelected
		>;

		throttlerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: ThrottlerState<TFn>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				throttlerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return throttlerInstance;
	});

	throttler.fn = fn;
	throttler.setOptions(mergedOptions);

	const state = useSelectorSlot(throttler.store, selector, { compare: shallow }, stateSlot);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(throttler);
			} else {
				throttler.cancel();
			}
		};
	}, []);

	return useMemo(
		() =>
			({
				...throttler,
				state,
			}) as ReactThrottler<TFn, TSelected>, // omit `store` in favor of `state`
		[throttler, state],
	);
}
