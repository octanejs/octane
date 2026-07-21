import { useEffect, useMemo, useState } from 'octane';
import { AsyncQueuer } from '@tanstack/pacer/async-queuer';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { AsyncQueuerOptions, AsyncQueuerState } from '@tanstack/pacer/async-queuer';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncQueuer:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncQueuer:state');

export interface ReactAsyncQueuerOptions<
	TValue,
	TSelected = {},
> extends AsyncQueuerOptions<TValue> {
	/**
	 * Custom unmount behavior. Defaults to stopping the queue and aborting
	 * in-flight executions.
	 */
	onUnmount?: (queuer: ReactAsyncQueuer<TValue, TSelected>) => void;
}

export interface ReactAsyncQueuer<TValue, TSelected = {}> extends Omit<
	AsyncQueuer<TValue>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the queuer's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: AsyncQueuerState<TValue>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<AsyncQueuerState<TValue>>>;
}

/**
 * An Octane hook that creates and manages an AsyncQueuer instance — processes
 * queued items through an async function with configurable concurrency.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const queuer = useAsyncQueuer(processItem, { concurrency: 2 });
 * ```
 */
export function useAsyncQueuer<TValue, TSelected = {}>(
	fn: (value: TValue) => Promise<any>,
	options: ReactAsyncQueuerOptions<TValue, TSelected> = {},
	selector: (state: AsyncQueuerState<TValue>) => TSelected = () => ({}) as TSelected,
): ReactAsyncQueuer<TValue, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().asyncQueuer,
		...options,
	} as ReactAsyncQueuerOptions<TValue, TSelected>;
	const [asyncQueuer] = useState(() => {
		const asyncQueuerInstance = new AsyncQueuer<TValue>(
			fn,
			mergedOptions,
		) as unknown as ReactAsyncQueuer<TValue, TSelected>;

		asyncQueuerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: AsyncQueuerState<TValue>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				asyncQueuerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return asyncQueuerInstance;
	});

	asyncQueuer.fn = fn;
	asyncQueuer.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(asyncQueuer);
			} else {
				asyncQueuer.stop();
				asyncQueuer.abort();
			}
		};
	}, []);

	const state = useSelectorSlot(asyncQueuer.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...asyncQueuer,
				state,
			}) as ReactAsyncQueuer<TValue, TSelected>, // omit `store` in favor of `state`
		[asyncQueuer, state],
	);
}
