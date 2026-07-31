import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import {
	WagmiProvider,
	createConfig,
	http,
	useConnect,
	useConnection,
	useDisconnect,
} from '@octanejs/wagmi';
import { mainnet } from '@octanejs/wagmi/chains';
import { mock } from '@octanejs/wagmi/connectors';

const account = '0x0000000000000000000000000000000000000001' as const;
const config = createConfig({
	chains: [mainnet],
	connectors: [mock({ accounts: [account] })],
	transports: { [mainnet.id]: http() },
});
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

function WalletProbe() @{
	const connection = useConnection();
	const connect = useConnect();
	const disconnect = useDisconnect();
	const connector = connect.connectors[0];

	<div class="panel">
		<h2 class="demo-title">{'Wagmi v3 lifecycle'}</h2>
		<p
			class="demo-blurb"
		>{'Deterministic mock connector: safe for visual regression and repeatable profiling.'}</p>
		<dl class="metrics-grid">
			<div>
				<dt>{'Status'}</dt>
				<dd data-testid="wagmi-status">{connection.status}</dd>
			</div>
			<div>
				<dt>{'Chain'}</dt>
				<dd>{connection.chainId ?? 'none'}</dd>
			</div>
			<div>
				<dt>{'Address'}</dt>
				<dd class="metric-address">{connection.address ?? 'not connected'}</dd>
			</div>
		</dl>
		<div class="row">
			<button
				class="btn"
				disabled={!connector || connect.isPending || connection.status === 'connected'}
				onClick={() => connector && connect.connect({ connector })}
			>
				{connect.isPending ? 'Connecting…' : 'Connect mock wallet'}
			</button>
			<button
				class="btn"
				disabled={connection.status !== 'connected' || disconnect.isPending}
				onClick={() => disconnect.disconnect()}
			>
				{disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
			</button>
		</div>
	</div>
}

export function WagmiDemo() @{
	<WagmiProvider config={config} reconnectOnMount={false}>
		<QueryClientProvider client={queryClient}>
			<WalletProbe />
		</QueryClientProvider>
	</WagmiProvider>
}
