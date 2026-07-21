import { useEffect, useMemo, useState } from 'octane';
import { Debouncer } from '@tanstack/pacer/debouncer';
import { shallow } from '@octanejs/tanstack-store';
import { useDefaultPacerOptions } from '../provider/context';
import { useSelectorSlot } from '../internal';
import type { Store } from '@octanejs/tanstack-store';
import type { DebouncerOptions, DebouncerState } from '@tanstack/pacer/debouncer';
import type { AnyFunction } from '@tanstack/pacer/types';

const subscribeSlot = Symbol.for('@octanejs/tanstack-pacer:useDebouncer:Subscribe');
const stateSlot = Symbol.for('@octanejs/tanstack-pacer:useDebouncer:state');

export interface ReactDebouncerOptions<
	TFn extends AnyFunction,
	TSelected = {},
> extends DebouncerOptions<TFn> {
	/**
	 * Custom unmount behavior. Defaults to cancelling any pending execution.
	 */
	onUnmount?: (debouncer: ReactDebouncer<TFn, TSelected>) => void;
}

export interface ReactDebouncer<TFn extends AnyFunction, TSelected = {}> extends Omit<
	Debouncer<TFn>,
	'store'
> {
	/**
	 * Render-prop component subscribing to a slice of the debouncer's state.
	 */
	Subscribe: <TSelected>(props: {
		selector: (state: DebouncerState<TFn>) => TSelected;
		children: ((state: TSelected) => unknown) | unknown;
	}) => unknown;
	/**
	 * Reactive state selected by the hook's `selector` (empty object without one).
	 */
	readonly state: Readonly<TSelected>;
	/**
	 * The underlying TanStack Store instance.
	 */
	readonly store: Store<Readonly<DebouncerState<TFn>>>;
}

/**
 * An Octane hook that creates and manages a Debouncer instance.
 *
 * The debouncer delays function execution until after a specified wait time
 * has elapsed since the last call.
 *
 * ## State Management and Selector
 *
 * Uses TanStack Store for reactive state management. **By default there are no
 * reactive state subscriptions** — opt in by providing a `selector`; only then
 * does the component re-render when the selected state values change.
 *
 * @example
 * ```tsx
 * // Opt-in to re-render when isPending changes
 * const debouncer = useDebouncer(setValue, { wait: 500 }, (state) => ({
 *   isPending: state.isPending,
 * }));
 * ```
 */
export function useDebouncer<TFn extends AnyFunction, TSelected = {}>(
	fn: TFn,
	options: ReactDebouncerOptions<TFn, TSelected>,
	selector: (state: DebouncerState<TFn>) => TSelected = () => ({}) as TSelected,
): ReactDebouncer<TFn, TSelected> {
	const mergedOptions = {
		...useDefaultPacerOptions().debouncer,
		...options,
	} as ReactDebouncerOptions<TFn, TSelected>;
	const [debouncer] = useState(() => {
		const debouncerInstance = new Debouncer(fn, mergedOptions) as unknown as ReactDebouncer<
			TFn,
			TSelected
		>;

		debouncerInstance.Subscribe = function Subscribe<TSelected>(props: {
			selector: (state: DebouncerState<TFn>) => TSelected;
			children: ((state: TSelected) => unknown) | unknown;
		}) {
			const selected = useSelectorSlot(
				debouncerInstance.store,
				props.selector,
				{ compare: shallow },
				subscribeSlot,
			);

			return typeof props.children === 'function'
				? (props.children as (state: TSelected) => unknown)(selected)
				: props.children;
		};

		return debouncerInstance;
	});

	debouncer.fn = fn;
	debouncer.setOptions(mergedOptions);

	// Unmount cleanup only; empty deps keep teardown stable (as upstream).
	useEffect(() => {
		return () => {
			if (mergedOptions.onUnmount) {
				mergedOptions.onUnmount(debouncer);
			} else {
				debouncer.cancel();
			}
		};
	}, []);

	const state = useSelectorSlot(debouncer.store, selector, { compare: shallow }, stateSlot);

	return useMemo(
		() =>
			({
				...debouncer,
				state,
			}) as ReactDebouncer<TFn, TSelected>, // omit `store` in favor of `state`
		[debouncer, state],
	);
}
