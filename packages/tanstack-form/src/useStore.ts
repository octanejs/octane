import { useSelector } from '@tanstack/octane-store';

/**
 * Deprecated alias for `useSelector`. @tanstack/react-form re-exports
 * @tanstack/react-store's `useStore`, which @tanstack/octane-store does not ship.
 *
 * @deprecated Use `useSelector` instead.
 */
export function useStore<TSource, TSelected = NoInfer<TSource>>(
	source: {
		get: () => TSource;
		subscribe: (listener: (value: TSource) => void) => { unsubscribe: () => void };
	},
	selector: (snapshot: TSource) => TSelected = (snapshot) => snapshot as unknown as TSelected,
	compare?: (a: TSelected, b: TSelected) => boolean,
): TSelected {
	// Omit `compare` rather than pass `undefined`: this source ships as authored,
	// so a consumer may compile it under `exactOptionalPropertyTypes`.
	return useSelector(source, selector, compare === undefined ? undefined : { compare });
}
