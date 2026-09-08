import { useEffect, useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import type { Client as SolanaClient } from '@solana/kit';
import { ClientContext } from './client-context';
import { createClientStore } from './client-store';

export type ClientProviderProps =
	Readonly<{
		client: SolanaClient<object>;
		children?: OctaneNode;
	}>;

function assertResolvedClient(client: unknown): void {
	if (
		client !== null && typeof client === 'object' &&
			typeof (client as { then?: unknown }).then === 'function'
	) {
		throw new Error('ClientProvider accepts only a resolved client; resolve async setup before mount');
	}
}

export function ClientProvider(props: ClientProviderProps) @{
	assertResolvedClient(props.client);
	const store = useMemo(() => createClientStore(props.client), [props.client]);
	useEffect(() => () => store.dispose(), [store]);
	<ClientContext.Provider value={store}>{props.children}</ClientContext.Provider>
}
