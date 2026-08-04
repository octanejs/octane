// Adapted from @rocicorp/zero 1.8.0 under Apache-2.0.
import { useSyncExternalStore } from 'octane';
import { useZero } from './zero-provider.tsrx';
import type { ConnectionState } from '@rocicorp/zero';

/**
 * Hook to subscribe to the connection status of the Zero instance.
 *
 * @returns The connection status of the Zero instance.
 * @see {@link ConnectionState} for more details on the connection state.
 */
export function useConnectionState(): ConnectionState {
	const zero = useZero();
	return useSyncExternalStore(
		zero.connection.state.subscribe,
		() => zero.connection.state.current,
		() => zero.connection.state.current,
	);
}
