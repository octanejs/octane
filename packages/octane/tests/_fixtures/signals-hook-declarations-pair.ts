import { useMemo } from 'octane';
import { useStoredCell$ } from './signals-hook-declarations-cell';

// Composes an imported declaring hook without importing signals itself.
export function useStoredPair$(left: string, right: string) {
	const first$ = useStoredCell$(left);
	// A type-wrapped callee is still a custom-hook call.
	const second$ = (useStoredCell$ as typeof useStoredCell$)(right);
	return useMemo(() => [first$, second$] as const, [first$, second$]);
}
