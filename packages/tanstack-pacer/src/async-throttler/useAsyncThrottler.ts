import { useEffect, useMemo, useState } from 'octane';
import { AsyncThrottler } from '@tanstack/pacer/async-throttler';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { AsyncThrottlerOptions, AsyncThrottlerState } from '@tanstack/pacer/async-throttler';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncThrottler:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncThrottler:state');

export interface ReactAsyncThrottlerOptions<
	TFn extends AnyAsyncFunction,
	TSelected = {},
> extends AsyncThrottlerOptions<TFn> {
	/**
	 * Custom unmount behavior. Defaults to cancelling pending executions and
	 * aborting in-flight ones.
	 */
	onUnmount?: (throttler: ReactAsyncThrottler<TFn, TSelected>) => void;
}

export interface ReactAsyncThrottler<TFn extends AnyAsyncFunction, TSelected = {}> extends Omit<
	AsyncThrottler<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the throttler's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: AsyncThrottlerState<TFn>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<AsyncThrottlerState<TFn>>>;
}

/**
 * An Octane hook that creates and manages an AsyncThrottler instance.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const throttler = useAsyncThrottler(async (v) => save(v), { wait: 1000 });
 * ```
 */
export function useAsyncThrottler<TFn extends AnyAsyncFunction, TSelected = {}>(
	fn: TFn,
	options: ReactAsyncThrottlerOptions<TFn, TSelected>,
	selector: (state: AsyncThrottlerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactAsyncThrottler<TFn, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().asyncThrottler,
		...options,
	} as ReactAsyncThrottlerOptions<TFn, TSelected>;
	const [asyncThrottler] = useState(() => {
		const asyncThrottlerInstance = new AsyncThrottler<TFn>(
			fn,
			mergedOptions,
		) as unknown as ReactAsyncThrottler<TFn, TSelected>;

		asyncThrottlerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: AsyncThrottlerState<TFn>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				asyncThrottlerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return asyncThrottlerInstance;
	});

	asyncThrottler.fn = fn;
	asyncThrottler.setOptions(mergedOptions);

	const state = useSelectorSlot(asyncThrottler.store, selector, { compare: shallow }, stateSlot);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(asyncThrottler);
			} else {
				asyncThrottler.cancel();
				asyncThrottler.abort();
			}
		};
	}, []);

	return useMemo(
		() =>
			({
				...asyncThrottler,
				state,
			}) as ReactAsyncThrottler<TFn, TSelected>, // omit `store` in favor of `state`
		[asyncThrottler, state],
	);
}
