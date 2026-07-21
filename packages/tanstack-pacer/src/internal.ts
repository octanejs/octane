import { useSelector } from '@octanejs/tanstack-store';

// React type aliases used by upstream signatures (`React.Dispatch<React.SetStateAction<T>>`).
// Octane's `useState` setter is structurally identical.
export type SetStateAction<S> = S | ((prev: S) => S);
export type Dispatch<A> = (value: A) => void;

// Slot mechanics for the binding's plain-`.ts` hooks. The octane compiler
// wraps custom-hook CALLS made from compiled `.tsrx`/`.tsx` modules in
// `withSlot`, but calls made from plain `.ts` modules (this binding's hooks
// composing `useSelector` from @octanejs/tanstack-store) are not wrapped —
// so each `useSelector` call site here hands over its own slot symbol.
// `useSelector` reads the slot off its last argument; the public overloads
// don't declare it, hence the cast.

type SelectionSource<T> = {
	get: () => T;
	subscribe: (listener: (value: T) => void) => {
		unsubscribe: () => void;
	};
};

export function useSelectorSlot<TSource, TSelected>(
	source: SelectionSource<TSource>,
	selector: (snapshot: TSource) => TSelected,
	options: { compare?: (a: TSelected, b: TSelected) => boolean } | undefined,
	slot: symbol,
): TSelected {
	return (
		useSelector as (
			source: SelectionSource<TSource>,
			selector: (snapshot: TSource) => TSelected,
			options: { compare?: (a: TSelected, b: TSelected) => boolean } | undefined,
			slot: symbol,
		) => TSelected
	)(source, selector, options, slot);
}
