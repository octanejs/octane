import { useMemo } from 'octane';
import { useStoredCell$, useStoredCell as useRenamedCell$ } from './signals-hook-declarations-cell';

// Composes an imported declaring hook without importing signals itself.
export function useStoredPair$(left: string, right: string) {
	const first$ = useStoredCell$(left);
	// A type-wrapped callee is still a custom-hook call.
	const second$ = (useStoredCell$ as typeof useStoredCell$)(right);
	return useMemo(() => [first$, second$] as const, [first$, second$]);
}

// Only the local alias carries the `$`.
export function useRenamedPair$(left: string, right: string) {
	const first$ = useRenamedCell$(left);
	const second$ = useRenamedCell$(right);
	return useMemo(() => [first$, second$] as const, [first$, second$]);
}
