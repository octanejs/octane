import { useState } from 'octane';
import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, useConnect, useConnection } from '@octanejs/wagmi';
import { createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';

const account = '0x0000000000000000000000000000000000000001' as const;

function createHarness() {
	return {
		config: createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			storage: null,
			transports: { [mainnet.id]: http() },
		}),
		queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
	};
}

function ConnectionProbe() @{
	const connection = useConnection();
	const connect = useConnect();
	const connector = connect.connectors[0];
	<div>
		<span id="status">
			{connect.isPending ? 'connecting' : connection.status}
		</span>
		<span id="address">{connection.address ?? '-'}</span>
		<span id="mutation-status">{connect.status}</span>
		<button
			id="connect"
			disabled={!connector || connect.isPending}
			onClick={() => connector && connect.connect({ connector })}
		>
			connect
		</button>
	</div>
}

export function WagmiParityApp() @{
	const [harness] = useState(createHarness);
	<WagmiProvider config={harness.config} reconnectOnMount={false}>
		<QueryClientProvider client={harness.queryClient}>
			<ConnectionProbe />
		</QueryClientProvider>
	</WagmiProvider>
}
