import { useCallback, useContext, useSyncExternalStore } from 'octane';
import type { Client } from '@solana/kit';
import { ClientContext } from '../client-context';
import { subSlot } from '../internal';

export function useClient<TClient extends object = object>(): Client<TClient>;
export function useClient<TClient extends object = object>(
	...args: [slot?: symbol]
): Client<TClient> {
	const slot = args[0];
	const store = useContext(ClientContext);
	if (!store) throw new Error('useClient must be used inside ClientProvider');
	const subscribe = useCallback(
		(listener: () => void) => store.subscribe(listener),
		[store],
		subSlot(slot, 'subscribe'),
	);
	const getVersion = useCallback(() => store.getVersion(), [store], subSlot(slot, 'version'));
	useSyncExternalStore(subscribe, getVersion, getVersion, subSlot(slot, 'store'));
	return store.getSnapshot() as Client<TClient>;
}

export type UseClientCapabilityConfig = Readonly<{
	capability: string | readonly string[];
	hookName: string;
	providerHint: string;
}>;

export function useClientCapability<TClient extends object>(
	config: UseClientCapabilityConfig,
): Client<TClient>;
export function useClientCapability<TClient extends object>(
	config: UseClientCapabilityConfig,
	...args: [slot?: symbol]
): Client<TClient> {
	const slot = args[0];
	const client = (useClient as (...args: [slot?: symbol]) => Client<TClient>)(
		subSlot(slot, 'client'),
	);
	const capabilities =
		typeof config.capability === 'string' ? [config.capability] : config.capability;
	for (const capability of capabilities) {
		if (!(capability in client)) {
			throw new Error(
				`${config.hookName} requires client capability "${capability}". ${config.providerHint}`,
			);
		}
	}
	return client;
}
