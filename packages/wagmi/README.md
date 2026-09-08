# @octanejs/wagmi

Wagmi v3 bindings for Octane. The package reuses `@wagmi/core`, Viem, and the
official connectors, while replacing the React provider and hooks with Octane
bindings backed by `@octanejs/tanstack-query`.

```bash
npm install @octanejs/wagmi @octanejs/tanstack-query viem
pnpm add @octanejs/wagmi @octanejs/tanstack-query viem
```

```tsrx
import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, createConfig, http, useConnect, useConnection } from '@octanejs/wagmi';
import { injected } from '@octanejs/wagmi/connectors';
import { mainnet } from '@octanejs/wagmi/chains';

const config = createConfig({
	chains: [mainnet],
	connectors: [injected()],
	transports: { [mainnet.id]: http() },
});
const queryClient = new QueryClient();

function Wallet() @{
	const connection = useConnection();
	const connect = useConnect();
	<button onClick={() => connect.connect({ connector: connect.connectors[0] })}>
		{connection.address ?? 'Connect wallet'}
	</button>
}

function App() @{
	<WagmiProvider config={config}>
		<QueryClientProvider client={queryClient}>
			<Wallet />
		</QueryClientProvider>
	</WagmiProvider>
}
```

## Supported surface

The first compatibility slice includes config/provider access; connection,
connect, disconnect, switch-connection, and switch-chain; connector, connection,
and chain lists; balance; contract read, simulate, and write; transaction send
and receipt waiting; and message signing.

Wagmi v3 names are authoritative. Deprecated v2 aliases and all remaining hooks
are intentionally absent until they have behavioral evidence.

## Wallet-action safety

Signing, writing, sending, and wallet-switch prompts set `retry: false` even if a
shared QueryClient has a mutation retry default. They require a live connected
connector at dispatch. The binding snapshots the displayed address, chain, and
connector: replacement before dispatch yields `ActionContextChangedError` and
does not prompt; replacement after dispatch quarantines the late result in the
same typed error instead of publishing normal success.

Hydrated state is only an initial UI/cache hint. Use `parseHydratedState` for
untrusted cookie/SSR input: it is versioned, capped at 16 KiB, schema checked,
and rejects connector/provider/signature/token material. Privileged actions
always consult current live connector state.

EIP-1193 event validation, duplicate coalescing, and stale connector-generation
discarding remain `@wagmi/core` responsibilities. The Octane binding subscribes
to the core's normalized store; it does not intercept raw provider events or
claim a second normalization implementation.

## SSR

Set `ssr: true` on the Wagmi config and pass the validated state as
`initialState`. `WagmiProvider` follows Wagmi's split hydration contract:
non-SSR configs mount immediately, while SSR configs reconnect after hydration.

## RainbowKit compatibility gate

RainbowKit 2.2.x declares Wagmi v2 peers, but its defining
`RainbowKitProvider`, `ConnectButton.Custom`, and `useConnectModal` state can be
derived honestly from this v3 surface. The test suite proves the critical
disconnected → connecting → connected sequence with a deterministic connector.
The actual UI/modal implementation belongs to the stacked RainbowKit package.

No test needs a wallet secret, production RPC, or funded account.
