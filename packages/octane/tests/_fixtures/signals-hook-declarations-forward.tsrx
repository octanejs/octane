import { useStoredCell$, useStoredCell$ as useStoredCell } from './signals-hook-declarations-cell';

// Composes a declaring hook without importing octane/signals itself.
export function useForwardedPair$(left: string, right: string) {
	return [useStoredCell$(left), useStoredCell$(right)] as const;
}

// The same composition through an import alias that drops the `$`.
export function useAliasedPair$(left: string, right: string) {
	return [useStoredCell(left), useStoredCell(right)] as const;
}
