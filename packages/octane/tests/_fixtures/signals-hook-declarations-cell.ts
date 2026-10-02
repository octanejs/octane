import { signal$ } from 'octane/signals';

export function useStoredCell$(initial: string) {
	return signal$(initial);
}

// The same hook exported under a name without `$`.
export const useStoredCell = useStoredCell$;
