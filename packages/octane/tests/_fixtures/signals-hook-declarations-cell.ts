import { signal$ } from 'octane/signals';

export function useStoredCell$(initial: string) {
	return signal$(initial);
}

// The same hook exported under a name without `$`.
export const useStoredCell = useStoredCell$;

// Composes this module's own declaring hook; the module imports only signals.
export function useLocalPair$(left: string, right: string) {
	return [useStoredCell$(left), useStoredCell$(right)] as const;
}
