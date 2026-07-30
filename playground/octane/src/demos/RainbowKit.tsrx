import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, createConfig, http } from '@octanejs/wagmi';
import { mainnet, sepolia } from '@octanejs/wagmi/chains';
import {
	ConnectButton,
	RainbowKitProvider,
	WalletButton,
	rainbowTheme,
} from '@octanejs/rainbowkit';
import { mock } from '@wagmi/connectors/mock';
import '@octanejs/rainbowkit/styles.css';

const account = '0x0000000000000000000000000000000000000001' as const;
const config = createConfig({
	chains: [mainnet, sepolia],
	connectors: [mock({ accounts: [account] })],
	transports: { [mainnet.id]: http(), [sepolia.id]: http() },
});
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

export function RainbowKitDemo() @{
	<div>
		<h2 class="demo-title">{'RainbowKit on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'A deterministic mock wallet exercises connection, account, chain, and modal states.'}</p>
		<div class="panel">
			<WagmiProvider config={config} reconnectOnMount={false}>
				<QueryClientProvider client={queryClient}>
					<RainbowKitProvider
						theme={rainbowTheme()}
						wallets={[
							{ id: 'mock', name: 'Playground wallet' },
						]}
					>
						<div class="row">
							<ConnectButton />
							<WalletButton wallet="mock" />
						</div>
					</RainbowKitProvider>
				</QueryClientProvider>
			</WagmiProvider>
		</div>
	</div>
}
