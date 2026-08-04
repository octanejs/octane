// Adapted from @rocicorp/zero 1.8.0 under Apache-2.0.
import { useSyncExternalStore } from 'octane';
import { useZero } from './zero-provider.tsrx';

/**
 * Hook to subscribe to the online status of the Zero instance.
 *
 * This is useful when you want to update state based on the online status.
 *
 * @returns The online status of the Zero instance.
 *
 * @deprecated Use {@linkcode useConnectionState} instead, which provides more detailed connection state.
 */
export function useZeroOnline(): boolean {
	const zero = useZero();
	return useSyncExternalStore(
		zero.onOnline,
		() => zero.online,
		() => zero.online,
	);
}
