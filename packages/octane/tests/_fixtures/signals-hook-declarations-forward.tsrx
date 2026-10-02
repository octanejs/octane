import { useStoredCell$ } from './signals-hook-declarations-cell';

// Composes a declaring hook without importing octane/signals itself.
export function useForwardedPair$(left: string, right: string) {
	return [useStoredCell$(left), useStoredCell$(right)] as const;
}
