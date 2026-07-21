import { useEffect, useMemo, useState } from 'octane';
import { Queuer } from '@tanstack/pacer/queuer';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { QueuerOptions, QueuerState } from '@tanstack/pacer/queuer';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useQueuer:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useQueuer:state');

export interface ReactQueuerOptions<TValue, TSelected = {}> extends QueuerOptions<TValue> {
	/**
	 * Custom unmount behavior. Defaults to stopping the queue.
	 */
	onUnmount?: (queuer: ReactQueuer<TValue, TSelected>) => void;
}

export interface ReactQueuer<TValue, TSelected = {}> extends Omit<Queuer<TValue>, 'store'> {
	/**
	 * Render-prop component subscribing to a slice of the queuer's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: QueuerState<TValue>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<QueuerState<TValue>>>;
}

/**
 * An Octane hook that creates and manages a Queuer instance — a FIFO/LIFO/
 * priority queue processing items at a configurable interval.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const queuer = useQueuer(processItem, { wait: 1000 }, (state) => ({
 *   items: state.items,
 * }));
 * ```
 */
export function useQueuer<TValue, TSelected = {}>(
	fn: (item: TValue) => void,
	options: ReactQueuerOptions<TValue, TSelected> = {},
	selector: (state: QueuerState<TValue>) => TSelected = () => ({}) as TSelected,
): ReactQueuer<TValue, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().queuer,
		...options,
	} as ReactQueuerOptions<TValue, TSelected>;
	const [queuer] = useState(() => {
		const queuerInstance = new Queuer<TValue>(fn, mergedOptions) as unknown as ReactQueuer<
			TValue,
			TSelected
		>;

		queuerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: QueuerState<TValue>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				queuerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return queuerInstance;
	});

	queuer.fn = fn;
	queuer.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(queuer);
			} else {
				queuer.stop();
			}
		};
	}, []);

	const state = useSelectorSlot(queuer.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...queuer,
				state,
			}) as ReactQueuer<TValue, TSelected>, // omit `store` in favor of `state`
		[queuer, state],
	);
}
