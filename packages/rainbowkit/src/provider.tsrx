import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'octane';
import { useConnect, useConnection, useDisconnect, useSwitchChain } from '@octanejs/wagmi';
import type { OctaneNode } from 'octane';
import type { Connector } from '@wagmi/core';
import {
	RainbowKitContext,
	connectorIdentity,
	focusTopModal,
	isTopModal,
	lockBody,
	pushModal,
	registerModal,
	removeModal,
	unlockBody,
	type ModalKind,
	type ModalToken,
	type WalletDescriptor,
	type WalletEntry,
} from './internal';
import { lightTheme, type Theme } from './theme';
import './styles.css';

export type RainbowKitProviderProps = {
	children?: OctaneNode;
	theme?: Theme;
	wallets?: readonly WalletDescriptor[];
};

function themeStyle(theme: Theme): Record<string, string> {
	return {
		'--rk-accent': theme.colors.accentColor,
		'--rk-accent-foreground': theme.colors.accentColorForeground,
		'--rk-connect-background': theme.colors.connectButtonBackground,
		'--rk-connect-text': theme.colors.connectButtonText,
		'--rk-modal-background': theme.colors.modalBackground,
		'--rk-modal-text': theme.colors.modalText,
		'--rk-font-body': theme.fonts.body,
		'--rk-action-radius': theme.radii.actionButton,
		'--rk-connect-radius': theme.radii.connectButton,
		'--rk-modal-radius': theme.radii.modal,
	};
}

function walletEntries(
	connectors: readonly Connector[],
	descriptors: readonly WalletDescriptor[],
): readonly WalletEntry[] {
	const byIdentity = new Map(connectors.map(
		(connector) => [connectorIdentity(connector), connector],
	));
	const consumed = new Set<string>();
	const entries: WalletEntry[] = [];
	for (const descriptor of descriptors) {
		const fallback = connectors.find(
			(connector) => connector.id === descriptor.id || connector.name === descriptor.name,
		);
		const connector = descriptor.connectorUid
			? byIdentity.get(descriptor.connectorUid) ?? fallback
			: fallback;
		const identity =
			connector ? connectorIdentity(connector) : descriptor.connectorUid || descriptor.id;
		if (consumed.has(identity)) continue;
		consumed.add(identity);
		entries.push({ ...descriptor, connector, identity });
	}
	for (const connector of connectors) {
		const identity = connectorIdentity(connector);
		if (consumed.has(identity)) continue;
		consumed.add(identity);
		entries.push({ id: connector.id, name: connector.name, connector, identity });
	}
	return entries;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'The wallet request failed.';
}

function Modal(props: {
	kind: ModalKind;
	token: ModalToken;
	wallets: readonly WalletEntry[];
	close: (token: ModalToken) => void;
	titleId: string;
	descriptionId: string;
	beginConnecting: () => symbol;
	endConnecting: (token: symbol) => void;
	opener: HTMLElement | null;
}) @{
	const connection = useConnection();
	const connect = useConnect();
	const disconnect = useDisconnect();
	const switchChain = useSwitchChain();
	const [pendingWalletIdentity, setPendingWalletIdentity] = useState<string | null>(null);
	const dialogRef = useRef<HTMLElement | null>(null);
	const focusScope = props.opener?.closest<HTMLElement>('[data-rk]');
	const restoreFocus = () => {
		const ownerDocument = props.opener?.ownerDocument ?? dialogRef.current?.ownerDocument;
		if (!ownerDocument) return;
		queueMicrotask(() => {
			if (focusTopModal(ownerDocument)) return;
			const fallback = focusScope?.querySelector<HTMLElement>(
				'.rk-connect-button:not([disabled]), .rk-wallet-button:not([disabled])',
			);
			((props.opener?.isConnected ? props.opener : fallback))?.focus();
		});
	};
	const title =
		props.kind === 'connect'
			? 'Connect a wallet'
			: props.kind === 'chain'
				? 'Switch network'
				: 'Account';
	const description =
		props.kind === 'connect'
			? 'Choose an available wallet.'
			: props.kind === 'chain'
				? 'Choose a network for the connected wallet.'
				: 'Manage the connected wallet.';

	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const ownerDocument = dialog.ownerDocument;
		pushModal(props.token, ownerDocument);
		lockBody(ownerDocument);
		registerModal(props.token, dialog);
		const focusable = () => Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		);
		focusable()[0]?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isTopModal(props.token)) return;
			if (event.key === 'Escape') {
				event.preventDefault();
				props.close(props.token);
				return;
			}
			if (event.key !== 'Tab') return;
			const items = focusable();
			if (items.length === 0) {
				event.preventDefault();
				dialog.focus();
				return;
			}
			const first = items[0]!;
			const last = items.at(-1)!;
			if (
				!dialog.contains(ownerDocument.activeElement) ||
					!items.includes(ownerDocument.activeElement as HTMLElement)
			) {
				event.preventDefault();
				((event.shiftKey ? last : first)).focus();
			} else if (event.shiftKey && ownerDocument.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && ownerDocument.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		ownerDocument.addEventListener('keydown', onKeyDown);
		return () => {
			ownerDocument.removeEventListener('keydown', onKeyDown);
			removeModal(props.token);
			unlockBody(ownerDocument);
			restoreFocus();
		};
	}, [props.token]);

	const connectWallet = (entry: WalletEntry) => {
		if (!entry.connector) return;
		const pendingToken = props.beginConnecting();
		setPendingWalletIdentity(entry.identity);
		void connect.connectAsync({ connector: entry.connector }).then(() => {
			props.close(props.token);
			restoreFocus();
		}).catch(() => {}).finally(() => {
			setPendingWalletIdentity(null);
			props.endConnecting(pendingToken);
		});
	};

	<div
		className="rk-overlay"
		data-rk-overlay=""
		onClick={(event) => {
			if (event.target === event.currentTarget && isTopModal(props.token)) props.close(props.token);
		}}
	>
		<section
			className="rk-dialog"
			ref={dialogRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby={props.titleId}
			aria-describedby={props.descriptionId}
			tabIndex={-1}
		>
			<header className="rk-dialog-header">
				<h2 id={props.titleId}>{title}</h2>
				<button
					type="button"
					className="rk-close"
					aria-label="Close"
					onClick={() => props.close(props.token)}
				>
					×
				</button>
			</header>
			<p id={props.descriptionId}>{description}</p>
			<div role="status" aria-live="polite">
				{connect.isPending
					? 'Waiting for wallet approval'
					: switchChain.isPending
						? 'Switching network'
						: disconnect.isPending
							? 'Disconnecting wallet'
							: ''}
			</div>
			@if (props.kind === 'connect') {
				<>
					@if (props.wallets.length === 0) {
						<p>No compatible wallets are available.</p>
					} @else {
						<ul className="rk-list">
							@for (const wallet of props.wallets; key wallet.identity) {
								<li>
									<button
										type="button"
										className="rk-action"
										disabled={connect.isPending || !wallet.connector}
										onClick={() => connectWallet(wallet)}
									>
										{connect.isPending && pendingWalletIdentity === wallet.identity
											? `Waiting for ${wallet.name}`
											: wallet.name}
									</button>
									@if (!wallet.connector) {
										<p>{wallet.unavailableReason ?? 'Wallet is unavailable in this browser.'}</p>
									}
								</li>
							}
						</ul>
					}
					@if (connect.error) {
						<p role="alert">{errorMessage(connect.error)}</p>
					}
				</>
			} @else {
				@if (props.kind === 'chain') {
					<>
						<ul className="rk-list">
							@for (const chain of switchChain.chains; key chain.id) {
								<li>
									<button
										type="button"
										className="rk-action"
										disabled={switchChain.isPending || connection.chainId === chain.id}
										onClick={() => switchChain.mutate({ chainId: chain.id }, {
											onSuccess: () => props.close(props.token),
										})}
									>{chain.name}</button>
								</li>
							}
						</ul>
						@if (switchChain.error) {
							<p role="alert">{errorMessage(switchChain.error)}</p>
						}
					</>
				} @else {
					<>
						<p>{connection.address ?? 'No connected account'}</p>
						<button
							type="button"
							className="rk-action"
							disabled={disconnect.isPending || connection.status !== 'connected'}
							onClick={() => disconnect.mutate(undefined, {
								onSuccess: () => props.close(props.token),
							})}
						>
							Disconnect
						</button>
						@if (disconnect.error) {
							<p role="alert">{errorMessage(disconnect.error)}</p>
						}
					</>
				}
			}
		</section>
	</div>
}

export function RainbowKitProvider(props: RainbowKitProviderProps) @{
	const [activeModal, setActiveModal] = useState<
		| {
				kind: ModalKind;
				token: ModalToken;
				chainId: number | undefined;
				opener: HTMLElement | null;
				ownerDocument: Document | null;
		  }
		| null
	>(null);
	const connection = useConnection();
	const [mounted, setMounted] = useState(false);
	const connectingTokens = useRef(new Set<symbol>());
	const modalGeneration = useRef(0);
	const [connectingCount, setConnectingCount] = useState(0);
	const rootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => setMounted(true), []);
	const beginConnecting = useCallback(() => {
		const token = Symbol('rainbowkit-connect');
		connectingTokens.current.add(token);
		setConnectingCount(connectingTokens.current.size);
		return token;
	}, []);
	const endConnecting = useCallback((token: symbol) => {
		if (connectingTokens.current.delete(token)) {
			setConnectingCount(connectingTokens.current.size);
		}
	}, []);
	const connectors = useConnect().connectors;
	const wallets = useMemo(() => walletEntries(connectors, props.wallets ?? []), [
		connectors,
		props.wallets,
	]);
	const selectedTheme = props.theme ?? lightTheme();
	const providerId = useId();
	const closeModal = useCallback((token?: ModalToken) => {
		setActiveModal((current) => {
			if (!current || token && current.token !== token) return current;
			return null;
		});
	}, []);
	useEffect(() => {
		if (!activeModal) return;
		const modalNoLongerApplies =
			activeModal.kind === 'connect'
				? connection.status === 'connected'
				: connection.status !== 'connected' ||
					activeModal.kind === 'chain' && activeModal.chainId !== connection.chainId;
		if (modalNoLongerApplies) closeModal(activeModal.token);
	}, [activeModal, closeModal, connection.chainId, connection.status]);
	const openModal = useCallback((kind: ModalKind, nextOpener?: HTMLElement | null) => {
		const token = `${providerId}:${++modalGeneration.current}`;
		const fallbackDocument = rootRef.current?.ownerDocument;
		const ownerDocument =
			nextOpener?.ownerDocument ?? fallbackDocument ??
				(typeof document === 'undefined' ? null : document);
		setActiveModal({
			kind,
			token,
			chainId: connection.chainId,
			opener: nextOpener ?? ownerDocument?.activeElement as HTMLElement | null | undefined ?? null,
			ownerDocument,
		});
	}, [connection.chainId, providerId]);
	const context = useMemo(
		() => ({
			activeModal,
			beginConnecting,
			closeModal,
			connected: connection.status === 'connected',
			connecting: connectingCount > 0 || connection.status === 'connecting' ||
				connection.status === 'reconnecting',
			endConnecting,
			mounted,
			openModal,
			wallets,
		}),
		[
			activeModal,
			beginConnecting,
			closeModal,
			connectingCount,
			connection.status,
			endConnecting,
			mounted,
			openModal,
			wallets,
		],
	);

	<div data-rk="" ref={rootRef} style={themeStyle(selectedTheme)}>
		<RainbowKitContext.Provider value={context}>
			{props.children}
			@if (activeModal) {
				<Modal
					key={activeModal.token}
					kind={activeModal.kind}
					token={activeModal.token}
					wallets={wallets}
					close={closeModal}
					titleId={`${providerId}-title`}
					descriptionId={`${providerId}-description`}
					beginConnecting={beginConnecting}
					endConnecting={endConnecting}
					opener={activeModal.opener}
				/>
			}
		</RainbowKitContext.Provider>
	</div>
}
