import { useEffect } from 'octane';
import { WagmiProvider, useConnection, type Config, type State } from '@octanejs/wagmi';

function HydrationProbe(props: { log: (entry: string) => void }) @{
	const connection = useConnection();
	props.log(`render:${connection.status}:${connection.address ?? '-'}`);

	useEffect(() => {
		props.log(`effect:${connection.status}:${connection.address ?? '-'}`);
	}, [connection.status, connection.address]);

	<div>
		<span id="status">{connection.status}</span>
		<span id="address">{connection.address ?? '-'}</span>
	</div>
}

export function HydrationApp(props: {
	config: Config;
	initialState: State;
	reconnectOnMount: boolean;
	log: (entry: string) => void;
}) @{
	<WagmiProvider
		config={props.config}
		initialState={props.initialState}
		reconnectOnMount={props.reconnectOnMount}
	>
		<HydrationProbe log={props.log} />
	</WagmiProvider>
}
