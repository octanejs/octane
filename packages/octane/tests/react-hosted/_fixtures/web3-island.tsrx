import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { ConnectButton, RainbowKitProvider } from '@octanejs/rainbowkit';
import { WagmiProvider, useChainId, useConnection, type Config } from '@octanejs/wagmi';
import { createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';
import { useContext, useEffect, useRef, useState } from 'octane';
import { Web3HostContext } from './web3-host-context';
import { islandCleanedUp, watcherAttached, watcherDetached } from './web3-island-state';

const account = '0x0000000000000000000000000000000000000001' as const;

function createTrackedConfig(
	observationId: string,
	rejectNextConnection: { current: boolean },
): Config {
	const config = createConfig({
		chains: [mainnet],
		connectors: [mock({ accounts: [account] })],
		ssr: true,
		transports: { [mainnet.id]: http() },
	});
	const connector = config.connectors[0]!;
	const originalConnect = connector.connect.bind(connector);
	connector.connect = async (...arguments_) => {
		if (rejectNextConnection.current) {
			rejectNextConnection.current = false;
			throw new Error('Deterministic wallet rejection');
		}
		return originalConnect(...arguments_);
	};
	const subscribe = config.subscribe.bind(config);
	config.subscribe = ((...arguments_: unknown[]) => {
		watcherAttached(observationId);
		const unsubscribe = (subscribe as (...input: unknown[]) => () => void)(...arguments_);
		return () => {
			watcherDetached(observationId);
			unsubscribe();
		};
	}) as typeof config.subscribe;
	return config;
}

function WalletJourney(props: { label: string }) @{
	const route = useContext(Web3HostContext);
	const connection = useConnection();
	const chainId = useChainId();
	<section data-web3-island="">
		<h2 id="island-label">{props.label}</h2>
		<p id="island-route">{route}</p>
		<p id="island-status">{connection.status}</p>
		<p id="island-address">{connection.address ?? 'not-connected'}</p>
		<p id="island-chain">{String(chainId)}</p>
		<ConnectButton />
	</section>
}

export function Web3Island(props: {
	label: string;
	observationId: string;
	rejectFirstConnection?: boolean;
}) @{
	const rejectNextConnection = useRef(props.rejectFirstConnection ?? false);
	const [config] = useState(() => createTrackedConfig(props.observationId, rejectNextConnection));
	const [queryClient] = useState(
		() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
	);

	useEffect(
		() => () => {
			queryClient.clear();
			islandCleanedUp(props.observationId);
		},
		[],
	);

	<WagmiProvider config={config} reconnectOnMount={false}>
		<QueryClientProvider client={queryClient}>
			<RainbowKitProvider>
				<WalletJourney label={props.label} />
			</RainbowKitProvider>
		</QueryClientProvider>
	</WagmiProvider>
}
