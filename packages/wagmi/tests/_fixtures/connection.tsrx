import { QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, useConnect, useConnection, type Config } from '@octanejs/wagmi';

function ConnectionProbe() @{
	const connection = useConnection();
	const connect = useConnect();
	const connector = connect.connectors[0];
	<div>
		<span id="status">
			{connect.isPending ? 'connecting' : connection.status}
		</span>
		<span id="address">{connection.address ?? '-'}</span>
		<span id="connect-mutation-status">{connect.status}</span>
		<button
			id="connect"
			disabled={!connector || connect.isPending}
			onClick={() => connector && connect.connect({ connector })}
		>
			{connect.isPending ? 'connecting' : 'connect'}
		</button>
	</div>
}

export function App(props: { config: Config; queryClient: unknown }) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<ConnectionProbe />
		</QueryClientProvider>
	</WagmiProvider>
}
