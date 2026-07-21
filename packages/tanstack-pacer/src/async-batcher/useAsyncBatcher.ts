import { useEffect, useMemo, useState } from 'octane';
import { AsyncBatcher } from '@tanstack/pacer/async-batcher';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { AsyncBatcherOptions, AsyncBatcherState } from '@tanstack/pacer/async-batcher';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncBatcher:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncBatcher:state');

export interface ReactAsyncBatcherOptions<
	TValue,
	TSelected = {},
> extends AsyncBatcherOptions<TValue> {
	/**
	 * Custom unmount behavior. Defaults to cancelling any pending batch and
	 * aborting in-flight executions.
	 */
	onUnmount?: (batcher: ReactAsyncBatcher<TValue, TSelected>) => void;
}

export interface ReactAsyncBatcher<TValue, TSelected = {}> extends Omit<
	AsyncBatcher<TValue>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the batcher's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: AsyncBatcherState<TValue>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<AsyncBatcherState<TValue>>>;
}

/**
 * An Octane hook that creates and manages an AsyncBatcher instance — collects
 * items and processes them together through an async function.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const batcher = useAsyncBatcher(processBatch, { maxSize: 10, wait: 2000 });
 * ```
 */
export function useAsyncBatcher<TValue, TSelected = {}>(
	fn: (items: Array<TValue>) => Promise<any>,
	options: ReactAsyncBatcherOptions<TValue, TSelected> = {},
	selector: (state: AsyncBatcherState<TValue>) => TSelected = () => ({}) as TSelected,
): ReactAsyncBatcher<TValue, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().asyncBatcher,
		...options,
	} as ReactAsyncBatcherOptions<TValue, TSelected>;
	const [asyncBatcher] = useState(() => {
		const asyncBatcherInstance = new AsyncBatcher<TValue>(
			fn,
			mergedOptions,
		) as unknown as ReactAsyncBatcher<TValue, TSelected>;

		asyncBatcherInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: AsyncBatcherState<TValue>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				asyncBatcherInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return asyncBatcherInstance;
	});

	asyncBatcher.fn = fn;
	asyncBatcher.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(asyncBatcher);
			} else {
				asyncBatcher.cancel();
				asyncBatcher.abort();
			}
		};
	}, []);

	const state = useSelectorSlot(asyncBatcher.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...asyncBatcher,
				state,
			}) as ReactAsyncBatcher<TValue, TSelected>, // omit `store` in favor of `state`
		[asyncBatcher, state],
	);
}
