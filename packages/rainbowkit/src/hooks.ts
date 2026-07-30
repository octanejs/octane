import { useContext } from 'octane';
import { RainbowKitContext } from './internal';

export function useConnectModal(): {
	connectModalOpen: boolean;
	openConnectModal?: (event?: Event) => void;
} {
	const context = useContext(RainbowKitContext);
	return {
		connectModalOpen: context?.activeModal?.kind === 'connect',
		openConnectModal:
			context?.mounted && !context.connected
				? (event) =>
						context.openModal('connect', event?.currentTarget as HTMLElement | null | undefined)
				: undefined,
	};
}

export function useAccountModal(): {
	accountModalOpen: boolean;
	openAccountModal?: (event?: Event) => void;
} {
	const context = useContext(RainbowKitContext);
	return {
		accountModalOpen: context?.activeModal?.kind === 'account',
		openAccountModal:
			context?.mounted && context.connected
				? (event) =>
						context.openModal('account', event?.currentTarget as HTMLElement | null | undefined)
				: undefined,
	};
}

export function useChainModal(): {
	chainModalOpen: boolean;
	openChainModal?: (event?: Event) => void;
} {
	const context = useContext(RainbowKitContext);
	return {
		chainModalOpen: context?.activeModal?.kind === 'chain',
		openChainModal:
			context?.mounted && context.connected
				? (event) =>
						context.openModal('chain', event?.currentTarget as HTMLElement | null | undefined)
				: undefined,
	};
}
