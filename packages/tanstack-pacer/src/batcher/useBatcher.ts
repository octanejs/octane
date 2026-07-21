import { useEffect, useMemo, useState } from 'octane';
import { Batcher } from '@tanstack/pacer/batcher';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { BatcherOptions, BatcherState } from '@tanstack/pacer/batcher';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useBatcher:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useBatcher:state');

export interface ReactBatcherOptions<TValue, TSelected = {}> extends BatcherOptions<TValue> {
	/**
	 * Custom unmount behavior. Defaults to cancelling any pending batch.
	 */
	onUnmount?: (batcher: ReactBatcher<TValue, TSelected>) => void;
}

export interface ReactBatcher<TValue, TSelected = {}> extends Omit<Batcher<TValue>, 'store'> {
	/**
	 * Render-prop component subscribing to a slice of the batcher's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: BatcherState<TValue>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<BatcherState<TValue>>>;
}

/**
 * An Octane hook that creates and manages a Batcher instance — collects items
 * and processes them together by size or time threshold.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const batcher = useBatcher(processBatch, { maxSize: 10, wait: 2000 });
 * ```
 */
export function useBatcher<TValue, TSelected = {}>(
	fn: (items: Array<TValue>) => void,
	options: ReactBatcherOptions<TValue, TSelected> = {},
	selector: (state: BatcherState<TValue>) => TSelected = () => ({}) as TSelected,
): ReactBatcher<TValue, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().batcher,
		...options,
	} as ReactBatcherOptions<TValue, TSelected>;
	const [batcher] = useState(() => {
		const batcherInstance = new Batcher<TValue>(fn, mergedOptions) as unknown as ReactBatcher<
			TValue,
			TSelected
		>;

		batcherInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: BatcherState<TValue>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				batcherInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return batcherInstance;
	});

	batcher.fn = fn;
	batcher.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(batcher);
			} else {
				batcher.cancel();
			}
		};
	}, []);

	const state = useSelectorSlot(batcher.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...batcher,
				state,
			}) as ReactBatcher<TValue, TSelected>, // omit `store` in favor of `state`
		[batcher, state],
	);
}
