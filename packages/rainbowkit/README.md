# @octanejs/rainbowkit

An Octane-native wallet connection UI preserving RainbowKit's defining provider,
connect-control, modal-hook, and theme contracts.

```bash
npm install @octanejs/rainbowkit @octanejs/wagmi @octanejs/tanstack-query viem
pnpm add @octanejs/rainbowkit @octanejs/wagmi @octanejs/tanstack-query viem
```

```tsrx
import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, createConfig, http } from '@octanejs/wagmi';
import { injected } from '@octanejs/wagmi/connectors';
import { mainnet } from '@octanejs/wagmi/chains';
import {
	ConnectButton,
	RainbowKitProvider,
	lightTheme,
} from '@octanejs/rainbowkit';
import '@octanejs/rainbowkit/styles.css';

const config = createConfig({
	chains: [mainnet],
	connectors: [injected()],
	transports: { [mainnet.id]: http() },
});
const queryClient = new QueryClient();

function App() @{
	<WagmiProvider config={config}>
		<QueryClientProvider client={queryClient}>
			<RainbowKitProvider theme={lightTheme()}>
				<ConnectButton />
			</RainbowKitProvider>
		</QueryClientProvider>
	</WagmiProvider>
}
```

## Important Wagmi divergence

This package is a compatibility adapter for RainbowKit 2.2.11's public UI
contracts, not a repackaging of its React implementation. Upstream RainbowKit
2.2.11 declares `wagmi ^2.9.0`; this package intentionally targets
`@octanejs/wagmi` v3. It does not satisfy upstream RainbowKit's peer range and
must not be presented as drop-in dependency parity.

The adapter derives the familiar disconnected, connecting, connected, wrong
network, and modal-open states directly from Wagmi v3. The supported cohort is
`RainbowKitProvider`, `ConnectButton`, `ConnectButton.Custom`, `WalletButton`,
`useConnectModal`, `useAccountModal`, `useChainModal`, and the familiar light,
dark, and midnight theme factories. `rainbowTheme` is an explicitly documented
Octane-only purple/rounded preset.

## Wallet catalogue and accessibility

Wallet choices come from the connectors configured on the enclosing
`WagmiProvider`. Applications configure injected/EIP-6963 and WalletConnect
connectors themselves, including a WalletConnect project id. Pass `wallets` to
`RainbowKitProvider` to order named entries or explain a configured wallet that
is unavailable:

```tsrx
<RainbowKitProvider
	wallets={[
		{ id: 'injected', name: 'Browser wallet' },
		{
			id: 'walletConnect',
			name: 'WalletConnect',
			unavailableReason: 'WalletConnect projectId is required.',
		},
	]}
>
	<ConnectButton />
</RainbowKitProvider>
```

Entries match the canonical connector `uid` when `connectorUid` is supplied,
with explicit id/name matching as the convenience fallback. They are
deduplicated by that canonical identity while preserving configured/discovery
order.

The native dialog has an accessible name and description, initial focus, tab
containment, Escape and outside dismissal, opener focus restoration, live
status messages, and document-scoped scroll/background containment. The
included stylesheet provides the baseline responsive, touch-target, and
reduced-motion presentation; applications remain responsible for validating
their final composed CSS.

## Deliberately unsupported

The first cohort omits RainbowKit's wallet factory catalogue, authentication
adapter, recent transactions, ENS/avatar resolution, cool mode, locale
translations, pixel-identical themes, account avatars/balances, and React-only
internals. Unsupported upstream props are not accepted by the public types.
Supply vendor connector SDKs directly through Wagmi.

SSR emits the deterministic disconnected control. Live connector state remains
authoritative after hydration; persisted state never authorizes wallet actions.
