import { useEffect, useMemo, useState } from 'octane';
import { AsyncDebouncer } from '@tanstack/pacer/async-debouncer';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { AsyncDebouncerOptions, AsyncDebouncerState } from '@tanstack/pacer/async-debouncer';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncDebouncer:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useAsyncDebouncer:state');

export interface ReactAsyncDebouncerOptions<
	TFn extends AnyAsyncFunction,
	TSelected = {},
> extends AsyncDebouncerOptions<TFn> {
	/**
	 * Custom unmount behavior. Defaults to cancelling pending executions and
	 * aborting in-flight ones.
	 */
	onUnmount?: (debouncer: ReactAsyncDebouncer<TFn, TSelected>) => void;
}

export interface ReactAsyncDebouncer<TFn extends AnyAsyncFunction, TSelected = {}> extends Omit<
	AsyncDebouncer<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the debouncer's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: AsyncDebouncerState<TFn>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<AsyncDebouncerState<TFn>>>;
}

/**
 * An Octane hook that creates and manages an AsyncDebouncer instance.
 *
 * Like the sync debouncer but for async functions: adds success/error/settled
 * lifecycle callbacks, abort support, and execution tracking.
 *
 * **By default there are no reactive state subscriptions** — opt in by
 * providing a `selector`; only then does the component re-render when the
 * selected state values change.
 *
 * @example
 * ```tsx
 * const debouncer = useAsyncDebouncer(
 *   async (query: string) => fetchResults(query),
 *   { wait: 500 },
 *   (state) => ({ isExecuting: state.isExecuting }),
 * );
 * ```
 */
export function useAsyncDebouncer<TFn extends AnyAsyncFunction, TSelected = {}>(
	fn: TFn,
	options: ReactAsyncDebouncerOptions<TFn, TSelected>,
	selector: (state: AsyncDebouncerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactAsyncDebouncer<TFn, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().asyncDebouncer,
		...options,
	} as ReactAsyncDebouncerOptions<TFn, TSelected>;
	const [asyncDebouncer] = useState(() => {
		const asyncDebouncerInstance = new AsyncDebouncer<TFn>(
			fn,
			mergedOptions,
		) as unknown as ReactAsyncDebouncer<TFn, TSelected>;

		asyncDebouncerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: AsyncDebouncerState<TFn>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				asyncDebouncerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return asyncDebouncerInstance;
	});

	asyncDebouncer.fn = fn;
	asyncDebouncer.setOptions(mergedOptions);

	const state = useSelectorSlot(asyncDebouncer.store, selector, { compare: shallow }, stateSlot);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(asyncDebouncer);
			} else {
				asyncDebouncer.cancel();
				asyncDebouncer.abort();
			}
		};
	}, []);

	return useMemo(
		() =>
			({
				...asyncDebouncer,
				state,
			}) as ReactAsyncDebouncer<TFn, TSelected>, // omit `store` in favor of `state`
		[asyncDebouncer, state],
	);
}
