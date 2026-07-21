import { useSelector } from '@octanejs/tanstack-store';

// Slot mechanics for the binding's plain-`.ts` hooks. The octane compiler
// wraps custom-hook CALLS made from compiled `.tsrx`/`.tsx` modules in
// `withSlot`, but calls made from plain `.ts` modules (this binding's hooks
// composing `useSelector` from @octanejs/tanstack-store) are not wrapped —
// so a hook that composes `useSelector` more than once must hand each call
// site its own slot symbol. `useSelector` reads the slot off its last
// argument; the public overloads don't declare it, hence the cast here.

type SelectionSource<T> = {
	get: () => T;
	subscribe: (listener: (value: T) => void) => {
		unsubscribe: () => void;
	};
};

export function useSelectorSlot<TSource, TSelected>(
	source: SelectionSource<TSource>,
	selector: (snapshot: TSource) => TSelected,
	slot: symbol,
): TSelected {
	return (
		useSelector as (
			source: SelectionSource<TSource>,
			selector: (snapshot: TSource) => TSelected,
			options: undefined,
			slot: symbol,
		) => TSelected
	)(source, selector, undefined, slot);
}
