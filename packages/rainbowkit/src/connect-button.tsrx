import { useChains, useConnect, useConnection, useDisconnect } from '@octanejs/wagmi';
import { isChildrenBlock, useContext, type OctaneNode } from 'octane';
import { useAccountModal, useChainModal, useConnectModal } from './hooks';
import { RainbowKitContext } from './internal';

export type ConnectButtonRendererProps = {
	account?: { address: string; displayName: string };
	accountModalOpen: boolean;
	authenticationStatus?: undefined;
	chain?: { id: number; name?: string; unsupported: boolean };
	chainModalOpen: boolean;
	connectModalOpen: boolean;
	connectionStatus: 'connected' | 'connecting' | 'disconnected';
	mounted: boolean;
	openAccountModal?: (event?: Event) => void;
	openChainModal?: (event?: Event) => void;
	openConnectModal?: (event?: Event) => void;
};

export type ConnectButtonProps = {
	chainStatus?: 'name' | 'none';
	label?: string;
};

function formatAddress(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function useConnectButtonState(): ConnectButtonRendererProps {
	const connection = useConnection();
	const connect = useConnect();
	const rainbowKit = useContext(RainbowKitContext);
	const chains = useChains();
	const accountModal = useAccountModal();
	const chainModal = useChainModal();
	const connectModal = useConnectModal();
	const chain = chains.find((candidate) => candidate.id === connection.chainId);
	const connected = connection.status === 'connected' && Boolean(connection.address);
	const mounted = rainbowKit?.mounted ?? false;
	return {
		account: mounted && connected
			? {
					address: connection.address!,
					displayName: formatAddress(connection.address!),
				}
			: undefined,
		accountModalOpen: accountModal.accountModalOpen,
		authenticationStatus: undefined,
		chain: mounted && connected
			? { id: connection.chainId!, name: chain?.name, unsupported: chain === undefined }
			: undefined,
		chainModalOpen: chainModal.chainModalOpen,
		connectModalOpen: connectModal.connectModalOpen,
		connectionStatus: !mounted
			? 'disconnected'
			: connected
				? 'connected'
				: connect.isPending || rainbowKit?.connecting
					? 'connecting'
					: 'disconnected',
		mounted,
		openAccountModal: mounted ? accountModal.openAccountModal : undefined,
		openChainModal: mounted ? chainModal.openChainModal : undefined,
		openConnectModal: mounted ? connectModal.openConnectModal : undefined,
	};
}

export function ConnectButton(props: ConnectButtonProps = {}) @{
	const state = useConnectButtonState();
	const disconnect = useDisconnect();
	@if (!state.account) {
		<button
			type="button"
			className="rk-connect-button"
			disabled={!state.mounted || state.connectionStatus === 'connecting'}
			onClick={state.openConnectModal}
		>
			{props.label ?? 'Connect Wallet'}
		</button>
	} @else {
		<div>
			@if (state.chain?.unsupported) {
				<button type="button" className="rk-connect-button" onClick={state.openChainModal}>
					Wrong network
				</button>
			} @else {
				@if (props.chainStatus !== 'none') {
					<button type="button" className="rk-connect-button" onClick={state.openChainModal}>
						{state.chain?.name ?? `Chain ${state.chain?.id}`}
					</button>
				}
			}
			<button
				type="button"
				className="rk-connect-button"
				onClick={state.openAccountModal}
			>{state.account.displayName}</button>
			<button
				type="button"
				className="rk-connect-button"
				disabled={disconnect.isPending}
				onClick={() => disconnect.mutate(undefined)}
			>
				Disconnect
			</button>
		</div>
	}
}

ConnectButton.Custom = function ConnectButtonCustom(props: {
	children: OctaneNode | ((state: ConnectButtonRendererProps) => OctaneNode);
}) {
	const state = useConnectButtonState();
	return typeof props.children === 'function' && !isChildrenBlock(props.children)
		? props.children(state)
		: props.children;
};
