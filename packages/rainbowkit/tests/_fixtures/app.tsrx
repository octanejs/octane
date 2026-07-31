import { QueryClientProvider } from '@octanejs/tanstack-query';
import { WagmiProvider, type Config, type State } from '@octanejs/wagmi';
import {
	ConnectButton,
	RainbowKitProvider,
	WalletButton,
	useAccountModal,
	useChainModal,
	useConnectModal,
	type Theme,
	type WalletDescriptor,
} from '@octanejs/rainbowkit';

function CustomControl() @{
	<ConnectButton.Custom>
		{(state) => <div>
			<span id="custom-status">
				{state.account
					? state.chain?.unsupported
						? 'wrong-chain'
						: 'connected'
					: state.connectModalOpen
						? 'modal-open'
						: 'disconnected'}
			</span>
			<span id="mounted">{String(state.mounted)}</span>
			<span id="connection-status">{state.connectionStatus}</span>
			<button type="button" id="custom-connect" onClick={state.openConnectModal}>
				Open wallets
			</button>
		</div>}
	</ConnectButton.Custom>
}

function NaturalChildren() @{
	<div>
		<ConnectButton.Custom>
			<span id="custom-natural-child">Custom natural child</span>
		</ConnectButton.Custom>
		<WalletButton wallet="mock">
			<span id="wallet-natural-child">Wallet natural child</span>
		</WalletButton>
	</div>
}

export let latestWalletConnect: (() => void) | undefined;

function WalletRaceProbe() @{
	<WalletButton wallet="mock">
		{({ connect, error }) => {
			latestWalletConnect = connect;
			return <>
				<span id="wallet-race-ready">ready</span>
				<span id="wallet-race-error">
					{error instanceof Error ? error.message : '-'}
				</span>
			</>;
		}}
	</WalletButton>
}

export function App(props: {
	config: Config;
	initialState?: State;
	queryClient: unknown;
	reconnectOnMount?: boolean;
	onSubmit?: (event: SubmitEvent) => void;
	theme?: Theme;
	wallets?: readonly WalletDescriptor[];
}) @{
	<WagmiProvider
		config={props.config}
		initialState={props.initialState}
		reconnectOnMount={props.reconnectOnMount ?? false}
	>
		<QueryClientProvider client={props.queryClient}>
			<form id="controls-form" onSubmit={props.onSubmit}>
				<button type="button" id="outside-provider">Outside provider</button>
				<RainbowKitProvider wallets={props.wallets} theme={props.theme}>
					<ConnectButton />
					<WalletButton wallet="mock" />
					<WalletRaceProbe />
					<CustomControl />
					<NaturalChildren />
				</RainbowKitProvider>
			</form>
		</QueryClientProvider>
	</WagmiProvider>
}

function ModalOpener(props: { id: string }) @{
	const modal = useConnectModal();
	<button id={props.id} onClick={modal.openConnectModal}>Open {props.id}</button>
}

export function TwoProviders(props: { config: Config; queryClient: unknown }) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<RainbowKitProvider>
				<ModalOpener id="first-provider" />
			</RainbowKitProvider>
			<RainbowKitProvider>
				<ModalOpener id="second-provider" />
			</RainbowKitProvider>
		</QueryClientProvider>
	</WagmiProvider>
}

function ProgrammaticOpener() @{
	const connectModal = useConnectModal();
	const accountModal = useAccountModal();
	const chainModal = useChainModal();
	<div>
		<button
			type="button"
			id="programmatic-open"
			data-enabled={String(connectModal.openConnectModal !== undefined)}
			onClick={() => connectModal.openConnectModal?.()}
		>
			Programmatic open
		</button>
		<button
			type="button"
			id="programmatic-account"
			onClick={() => accountModal.openAccountModal?.()}
		>
			Programmatic account
		</button>
		<button type="button" id="programmatic-chain" onClick={() => chainModal.openChainModal?.()}>
			Programmatic chain
		</button>
	</div>
}

export function ProgrammaticProvider(props: { config: Config; queryClient: unknown }) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<RainbowKitProvider>
				<ProgrammaticOpener />
			</RainbowKitProvider>
		</QueryClientProvider>
	</WagmiProvider>
}

export function OutsideProvider() @{
	const connect = useConnectModal();
	const account = useAccountModal();
	const chain = useChainModal();
	<div>
		<span id="outside">{String(
			connect.openConnectModal === undefined && account.openAccountModal === undefined &&
				chain.openChainModal === undefined,
		)}</span>
	</div>
}
