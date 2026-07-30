import { useConnect } from '@octanejs/wagmi';
import { createElement, isChildrenBlock, useContext } from 'octane';
import type { OctaneNode } from 'octane';
import { RainbowKitContext } from './internal';

export type WalletButtonProps = {
	children?: | OctaneNode
	| ((props: {
			ready: boolean;
			connect: () => void;
			error: unknown | null;
	  }) => OctaneNode);
	wallet: string;
};

export function WalletButton(props: WalletButtonProps) {
	const context = useContext(RainbowKitContext);
	const mutation = useConnect();
	const entry = context?.wallets.find(
		(candidate) =>
			candidate.identity === props.wallet || candidate.id === props.wallet ||
				candidate.name === props.wallet,
	);
	const connector = entry?.connector;
	const ready = Boolean(context?.mounted && connector);
	const connect = () => {
		if (!context?.mounted || !connector) return;
		const token = context.beginConnecting();
		void mutation.connectAsync({ connector }).catch(() => {}).finally(
			() => context.endConnecting(token),
		);
	};
	if (props.children != null) {
		return typeof props.children === 'function' && !isChildrenBlock(props.children)
			? props.children({ ready, connect, error: mutation.error })
			: props.children;
	}
	return [
		createElement(
			'button',
			{
				type: 'button',
				className: 'rk-wallet-button',
				disabled: !ready || context?.connecting || mutation.isPending,
				onClick: connect,
			},
			entry?.name ?? props.wallet,
		),
		mutation.error
			? createElement(
					'p',
					{ role: 'alert', className: 'rk-wallet-error' },
					mutation.error instanceof Error ? mutation.error.message : 'The wallet request failed.',
				)
			: null,
	];
}
