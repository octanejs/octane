import { signal$ } from 'octane/signals';

export function useStoredCell$(initial: string) {
	return signal$(initial);
}
