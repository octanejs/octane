import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet, sepolia } from 'viem/chains';
import { QueryClient } from '@octanejs/tanstack-query';
import { act, createRoot, flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import type { WalletDescriptor } from '@octanejs/rainbowkit';
import { darkTheme } from '@octanejs/rainbowkit';
import {
	App,
	OutsideProvider,
	ProgrammaticProvider,
	TwoProviders,
	latestWalletConnect,
} from './_fixtures/app.tsrx';

const rainbowKitStyles = readFileSync(resolve(import.meta.dirname, '../src/styles.css'), 'utf8');

const account = '0x0000000000000000000000000000000000000001' as const;
let mounted: ReturnType<typeof mount> | undefined;

function setup(wallets?: readonly WalletDescriptor[]) {
	const config = createConfig({
		chains: [mainnet],
		connectors: [mock({ accounts: [account] })],
		transports: { [mainnet.id]: http() },
	});
	mounted = mount(App, {
		config,
		queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		wallets,
	});
	flushEffects();
	flushSync(() => {});
	return config;
}

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	document.body.style.overflow = '';
});

describe('RainbowKit Wagmi v3 compatibility gate', () => {
	it('renders natural element children without invoking compiled child blocks', () => {
		setup();
		expect(mounted!.find('#custom-natural-child').textContent).toBe('Custom natural child');
		expect(mounted!.find('#wallet-natural-child').textContent).toBe('Wallet natural child');
	});

	it('moves custom controls from disconnected through modal-open to connected', async () => {
		setup();
		expect(mounted!.find('#custom-status').textContent).toBe('disconnected');
		mounted!.click('#custom-connect');
		flushEffects();
		expect(mounted!.find('#custom-status').textContent).toBe('modal-open');
		expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');

		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		expect(mounted!.find('#custom-status').textContent).toBe('connected');
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('focuses the replacement account control after connecting from the default button', async () => {
		setup();
		const opener = document.querySelector('.rk-connect-button') as HTMLButtonElement;
		opener.focus();
		opener.click();
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		await Promise.resolve();

		expect(opener.isConnected).toBe(false);
		expect(document.activeElement).toBe(document.querySelector('.rk-connect-button'));
	});

	it('dismisses with Escape, restores focus, and releases scroll containment', async () => {
		setup();
		const opener = mounted!.find('#custom-connect') as HTMLButtonElement;
		opener.focus();
		mounted!.click('#custom-connect');
		flushEffects();
		expect(document.body.style.overflow).toBe('hidden');
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
		expect(opener.closest('[aria-hidden="true"]')).not.toBeNull();
		expect(mounted!.find('#outside-provider').closest('[aria-hidden="true"]')).not.toBeNull();

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		flushEffects();
		await Promise.resolve();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.body.style.overflow).toBe('');
		expect(document.activeElement).toBe(opener);
		expect(opener.closest('[aria-hidden="true"]')).toBeNull();
	});

	it('keeps modal hooks inert outside RainbowKitProvider', () => {
		mounted = mount(OutsideProvider);
		expect(mounted.find('#outside').textContent).toBe('true');
	});

	it('keeps the direct connect modal hook inert until the provider mounts', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		root.render(ProgrammaticProvider, {
			config,
			queryClient: new QueryClient(),
		});
		flushSync(() => {});
		const opener = container.querySelector('#programmatic-open') as HTMLButtonElement;
		opener.click();
		flushSync(() => {});
		expect(container.querySelector('[role="dialog"]')).toBeNull();

		flushEffects();
		flushSync(() => {});
		opener.click();
		flushSync(() => {});
		flushEffects();
		try {
			expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		} finally {
			root.unmount();
			container.remove();
			flushEffects();
		}
	});

	it('keeps direct account and chain modal hooks inert until a connected provider mounts', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		await connect(config, { connector: config.connectors[0]! });
		root.render(ProgrammaticProvider, {
			config,
			queryClient: new QueryClient(),
		});
		flushSync(() => {});
		const accountOpener = container.querySelector('#programmatic-account') as HTMLButtonElement;
		const chainOpener = container.querySelector('#programmatic-chain') as HTMLButtonElement;
		accountOpener.click();
		chainOpener.click();
		flushSync(() => {});
		expect(container.querySelector('[role="dialog"]')).toBeNull();

		flushEffects();
		flushSync(() => {});
		accountOpener.click();
		flushSync(() => {});
		flushEffects();
		expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe('Account');
		(container.querySelector('.rk-close') as HTMLButtonElement).click();
		flushSync(() => {});
		flushEffects();
		chainOpener.click();
		flushSync(() => {});
		flushEffects();
		try {
			expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe('Switch network');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('dismisses the connect modal and disables its hook after an external connection', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		root.render(ProgrammaticProvider, {
			config,
			queryClient: new QueryClient(),
		});
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
		const opener = container.querySelector('#programmatic-open') as HTMLButtonElement;
		expect(opener.dataset.enabled).toBe('true');
		opener.click();
		flushSync(() => {});
		flushEffects();
		expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe('Connect a wallet');

		act(() => {
			config.setState((state) => ({ ...state, status: 'connected' }));
		});
		flushSync(() => {});
		flushEffects();
		try {
			expect(container.querySelector('[role="dialog"]')).toBeNull();
			expect(opener.dataset.enabled).toBe('false');
		} finally {
			root.unmount();
			container.remove();
			flushEffects();
		}
		await Promise.resolve();
	});

	it('connects through WalletButton and renders connected account controls', async () => {
		setup();
		(document.querySelector('.rk-wallet-button') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#custom-status').textContent).toBe('connected');
		expect(document.querySelector('[data-rk]')?.textContent).toContain('0x0000…0001');
		expect(document.querySelector('[data-rk]')?.textContent).toContain('Ethereum');
		expect(document.querySelector('[data-rk]')?.textContent).toContain('Disconnect');
	});

	it('keeps WalletButton connection failures visible and retryable', async () => {
		const config = setup();
		let attempts = 0;
		config.connectors[0]!.connect = async () => {
			attempts++;
			throw new Error('WalletButton rejected');
		};

		const button = document.querySelector('.rk-wallet-button') as HTMLButtonElement;
		button.click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('.rk-wallet-error[role="alert"]')?.textContent).toContain(
			'WalletButton rejected',
		);
		expect(button.disabled).toBe(false);

		latestWalletConnect!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#wallet-race-error').textContent).toContain('WalletButton rejected');
		latestWalletConnect!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(attempts).toBe(3);
	});

	it('disconnects from the account modal and keeps failures actionable', async () => {
		const config = setup();
		(document.querySelector('.rk-wallet-button') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		const connector = config.connectors[0]!;
		const disconnect = connector.disconnect?.bind(connector);
		connector.disconnect = async () => {
			throw new Error('Wallet refused disconnect');
		};
		const accountButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('0x0000'))!;
		accountButton.click();
		flushEffects();
		(document.querySelector('.rk-dialog .rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'Wallet refused disconnect',
		);
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		connector.disconnect = disconnect;
		(document.querySelector('.rk-dialog .rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('switches chains from the chain modal and reports a rejected switch', async () => {
		const config = createConfig({
			chains: [mainnet, sepolia],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http(), [sepolia.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		flushSync(() => {});
		(document.querySelector('.rk-wallet-button') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		flushSync(() => {});
		const chainButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('Ethereum'))!;
		chainButton.click();
		flushEffects();
		const sepoliaButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-dialog .rk-action'),
		).find((button) => button.textContent?.includes('Sepolia'))!;
		sepoliaButton.click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.querySelector('[data-rk]')?.textContent).toContain('Sepolia');

		const connector = config.connectors[0]!;
		connector.switchChain = async () => {
			throw new Error('Switch rejected');
		};
		const currentChainButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('Sepolia'))!;
		currentChainButton.click();
		flushEffects();
		const mainnetButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-dialog .rk-action'),
		).find((button) => button.textContent?.includes('Ethereum'))!;
		mainnetButton.click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('[role="alert"]')?.textContent).toContain('Switch rejected');
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it('closes a replacement chain modal when an older request switches the chain', async () => {
		const config = createConfig({
			chains: [mainnet, sepolia],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http(), [sepolia.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		flushSync(() => {});
		await act(async () => {
			await connect(config, { connector: config.connectors[0]! });
		});
		flushEffects();

		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const switchChain = connector.switchChain!.bind(connector);
		connector.switchChain = async (parameters) => {
			await gate;
			return switchChain(parameters);
		};
		const chainButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('Ethereum'))!;
		chainButton.click();
		flushEffects();
		const sepoliaButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-dialog .rk-action'),
		).find((button) => button.textContent?.includes('Sepolia'))!;
		sepoliaButton.click();
		await act(async () => {
			await Promise.resolve();
		});

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushEffects();
		chainButton.click();
		flushEffects();
		expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('Switch network');

		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		expect(document.querySelector('[data-rk]')?.textContent).toContain('Sepolia');
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('dismisses only from the overlay and restores all isolation on unmount', () => {
		setup();
		mounted!.click('#custom-connect');
		flushEffects();
		const dialog = document.querySelector('.rk-dialog') as HTMLElement;
		dialog.click();
		flushEffects();
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		(document.querySelector('.rk-overlay') as HTMLElement).click();
		flushEffects();
		expect(document.querySelector('[role="dialog"]')).toBeNull();

		mounted!.click('#custom-connect');
		flushEffects();
		expect(document.body.style.overflow).toBe('hidden');
		mounted!.unmount();
		mounted = undefined;
		flushEffects();
		expect(document.body.style.overflow).toBe('');
		expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	it('contains forward and reverse Tab navigation', () => {
		setup();
		mounted!.click('#custom-connect');
		flushEffects();
		const close = document.querySelector('.rk-close') as HTMLButtonElement;
		const action = document.querySelector('.rk-action') as HTMLButtonElement;
		action.focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(close);
		close.focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Tab',
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(document.activeElement).toBe(action);
	});

	it('recaptures Tab when a pending action disables the focused control', () => {
		setup();
		mounted!.click('#custom-connect');
		flushEffects();
		const close = document.querySelector('.rk-close') as HTMLButtonElement;
		const action = document.querySelector('.rk-action') as HTMLButtonElement;
		action.focus();
		action.disabled = true;
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(close);
	});

	it('applies explicit theme tokens to the provider boundary', () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient(),
			theme: darkTheme({ accentColor: '#123456', borderRadius: 'small' }),
		});
		const root = document.querySelector('[data-rk]') as HTMLElement;
		expect(root.style.getPropertyValue('--rk-accent')).toBe('#123456');
		expect(root.style.getPropertyValue('--rk-modal-radius')).toBe('8px');
		expect(rainbowKitStyles).toContain('background: var(--rk-connect-background)');
		expect(rainbowKitStyles).toContain('color: var(--rk-connect-text)');
		expect(rainbowKitStyles).toContain('border-radius: var(--rk-action-radius)');
		expect(rainbowKitStyles.match(/color: var\(--rk-modal-text\)/g)).toHaveLength(1);
	});

	it('deduplicates by connector uid and explains configured unavailable wallets', () => {
		const config = setup([
			{ id: 'mock', name: 'Preferred mock' },
			{
				id: 'walletConnect',
				name: 'WalletConnect',
				unavailableReason: 'WalletConnect projectId is required.',
			},
		]);
		mounted!.click('#custom-connect');
		flushEffects();
		const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.rk-list button'));
		expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'Preferred mock',
			'WalletConnect',
		]);
		expect(buttons[1]!.disabled).toBe(true);
		expect(document.querySelector('.rk-list')?.textContent).toContain(
			'WalletConnect projectId is required.',
		);
		expect(config.connectors[0]!.uid).toBeTruthy();
	});

	it('keeps the connect modal useful when no compatible wallets exist', () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(App, { config, queryClient: new QueryClient() });
		flushEffects();
		flushSync(() => {});
		(document.querySelector('.rk-connect-button') as HTMLButtonElement).click();
		flushEffects();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
			'No compatible wallets are available.',
		);
	});

	it('keeps a rejected connector actionable and retries only on another click', async () => {
		const config = setup();
		let attempts = 0;
		config.connectors[0]!.connect = async () => {
			attempts++;
			throw new Error('User rejected request');
		};
		mounted!.click('#custom-connect');
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(attempts).toBe(1);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'User rejected request',
		);
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(attempts).toBe(2);
	});

	it('announces awaiting approval and exposes Custom connecting state', async () => {
		const config = setup();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};
		mounted!.click('#custom-connect');
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connecting');
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'Waiting for wallet approval',
		);
		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	});

	it('labels only the selected wallet as pending and clears the label after rejection', async () => {
		const firstAccount = '0x0000000000000000000000000000000000000011' as const;
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [firstAccount] })],
			transports: { [mainnet.id]: http() },
		});
		const [first] = config.connectors;
		let reject!: (error: Error) => void;
		const gate = new Promise<never>((_, rejectPromise) => {
			reject = rejectPromise;
		});
		first!.connect = async () => gate;
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
			wallets: [
				{ id: 'first', name: 'First wallet', connectorUid: first!.uid },
				{
					id: 'second',
					name: 'Second wallet',
					connectorUid: 'unavailable-second-wallet',
					unavailableReason: 'Not installed',
				},
			],
		});
		flushEffects();
		flushSync(() => {});
		mounted.click('#custom-connect');
		flushEffects();
		const walletButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.rk-action'));
		walletButtons[0]!.click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(walletButtons[0]!.textContent).toBe('Waiting for First wallet');
		expect(walletButtons[1]!.textContent).toBe('Second wallet');
		expect(walletButtons[0]!.disabled).toBe(true);
		expect(walletButtons[1]!.disabled).toBe(true);

		reject(new Error('User rejected request'));
		await act(async () => {
			await Promise.resolve();
			config.setState((state) => ({
				...state,
				connections: new Map(),
				current: null,
				status: 'disconnected',
			}));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushSync(() => {});
		flushEffects();
		const settledWalletButtons = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-action'),
		);
		expect(settledWalletButtons[0]!.textContent).toBe('First wallet');
		expect(settledWalletButtons[1]!.textContent).toBe('Second wallet');
		expect(settledWalletButtons[0]!.disabled).toBe(false);
		expect(settledWalletButtons[1]!.disabled).toBe(true);
	});

	it('falls back to connector id when a configured connector uid is stale', () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: ['0x0000000000000000000000000000000000000011'] })],
			transports: { [mainnet.id]: http() },
		});
		const [connector] = config.connectors;
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
			wallets: [
				{
					id: connector!.id,
					name: 'Configured wallet',
					connectorUid: 'stale-connector-uid',
				},
			],
		});
		flushEffects();
		flushSync(() => {});
		mounted.click('#custom-connect');
		flushEffects();

		const walletButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.rk-action'));
		expect(walletButtons).toHaveLength(1);
		expect(walletButtons[0]!.textContent).toBe('Configured wallet');
		expect(walletButtons[0]!.disabled).toBe(false);
	});

	it('clears a pending modal connection after dismissal without reopening it', async () => {
		const config = setup();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};
		const opener = mounted!.find('#custom-connect') as HTMLButtonElement;
		opener.focus();
		opener.click();
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connecting');

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		flushEffects();
		await Promise.resolve();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);

		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#connection-status').textContent).not.toBe('connecting');
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	it('focuses replacement account controls when a dismissed default connection succeeds', async () => {
		const config = setup();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};
		const opener = document.querySelector('.rk-connect-button') as HTMLButtonElement;
		opener.focus();
		opener.click();
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		flushEffects();
		expect(document.activeElement).toBe(document.body);

		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		flushEffects();
		await Promise.resolve();

		expect(opener.isConnected).toBe(false);
		expect(document.activeElement).toBe(document.querySelector('.rk-connect-button'));
	});

	it('shares slow WalletButton connection state with Custom and default controls', async () => {
		const config = setup();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};
		const wallet = document.querySelector('.rk-wallet-button') as HTMLButtonElement;
		wallet.click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connecting');
		expect(wallet.disabled).toBe(true);
		expect((document.querySelector('.rk-connect-button') as HTMLButtonElement).disabled).toBe(true);
		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	});

	it('keeps Custom connected while another wallet connection attempt is pending', async () => {
		const config = setup();
		await act(async () => {
			await connect(config, { connector: config.connectors[0]! });
		});
		flushEffects();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};

		(document.querySelector('.rk-wallet-button') as HTMLButtonElement).click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#custom-status').textContent).toBe('connected');
		expect(mounted!.find('#connection-status').textContent).toBe('connected');

		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	});

	it('reports connected when an older request completes before a newer pending request', async () => {
		const config = setup();
		const releases: Array<() => void> = [];
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return original(parameters);
		};
		latestWalletConnect!();
		latestWalletConnect!();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connecting');
		releases[0]!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connected');
		releases[1]!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#connection-status').textContent).not.toBe('connecting');
	});

	it('reports connected when a newer request completes before an older pending request', async () => {
		const config = setup();
		const releases: Array<() => void> = [];
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return original(parameters);
		};
		latestWalletConnect!();
		latestWalletConnect!();
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connecting');
		releases[1]!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#connection-status').textContent).toBe('connected');
		releases[0]!();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted!.find('#connection-status').textContent).not.toBe('connecting');
	});

	it('shows wrong-network controls after the connector changes chains and recovers', async () => {
		const config = createConfig({
			chains: [mainnet, sepolia],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http(), [sepolia.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		flushSync(() => {});
		(document.querySelector('.rk-wallet-button') as HTMLButtonElement).click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		act(() => {
			config.connectors[0]!.onChainChanged('999999');
		});
		flushEffects();
		expect(mounted.find('#custom-status').textContent).toBe('wrong-chain');
		const wrong = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('Wrong network'));
		expect(wrong).toBeDefined();
		wrong!.click();
		flushEffects();
		const sepoliaButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-dialog .rk-action'),
		).find((button) => button.textContent?.includes('Sepolia'))!;
		sepoliaButton.click();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(mounted.find('#custom-status').textContent).toBe('connected');
	});

	it('never submits an enclosing form from package controls or modal actions', () => {
		let submits = 0;
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient(),
			onSubmit: (event) => {
				event.preventDefault();
				submits++;
			},
		});
		flushEffects();
		flushSync(() => {});
		(document.querySelector('.rk-connect-button') as HTMLButtonElement).click();
		flushEffects();
		(document.querySelector('.rk-close') as HTMLButtonElement).click();
		flushEffects();
		expect(submits).toBe(0);
	});

	it('coordinates topmost Escape and body locking across providers', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(TwoProviders, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		flushSync(() => {});
		mounted.click('#first-provider');
		flushEffects();
		mounted.click('#second-provider');
		flushEffects();
		const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
		expect(dialogs).toHaveLength(2);
		expect(dialogs[0]!.getAttribute('aria-labelledby')).not.toBe(
			dialogs[1]!.getAttribute('aria-labelledby'),
		);
		expect(dialogs[1]!.closest('[inert]')).toBeNull();
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		flushEffects();
		await Promise.resolve();
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(document.body.style.overflow).toBe('hidden');
		expect(document.activeElement).toBe(dialogs[0]);
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		flushEffects();
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
		expect(document.body.style.overflow).toBe('');
	});

	it('keeps the top modal isolated when a lower provider closes out of order', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(TwoProviders, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		flushSync(() => {});
		mounted.click('#first-provider');
		flushEffects();
		mounted.click('#second-provider');
		flushEffects();
		const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
		(dialogs[0]!.querySelector('.rk-close') as HTMLButtonElement).click();
		flushEffects();
		await Promise.resolve();

		const remaining = document.querySelector<HTMLElement>('[role="dialog"]')!;
		expect(remaining).toBe(dialogs[1]);
		expect(remaining.closest('[inert]')).toBeNull();
		expect(mounted.find('#first-provider').closest('[aria-hidden="true"]')).not.toBeNull();
		expect(document.body.style.overflow).toBe('hidden');

		(remaining.querySelector('.rk-close') as HTMLButtonElement).click();
		flushEffects();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(mounted.find('#first-provider').closest('[aria-hidden="true"]')).toBeNull();
		expect(mounted.find('#second-provider').closest('[aria-hidden="true"]')).toBeNull();
		expect(document.body.style.overflow).toBe('');
	});

	it('coordinates modal stacks and body locks independently per ownerDocument', async () => {
		const config = setup();
		mounted!.click('#custom-connect');
		flushEffects();
		const secondaryDocument = document.implementation.createHTMLDocument('secondary');
		const secondaryContainer = secondaryDocument.createElement('div');
		secondaryDocument.body.appendChild(secondaryContainer);
		const secondaryConfig = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		const secondaryRoot = createRoot(secondaryContainer);
		secondaryRoot.render(ProgrammaticProvider, {
			config: secondaryConfig,
			queryClient: new QueryClient(),
		});
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
		(secondaryContainer.querySelector('#programmatic-open') as HTMLButtonElement).click();
		flushSync(() => {});
		flushEffects();
		try {
			expect(document.body.style.overflow).toBe('hidden');
			expect(secondaryDocument.body.style.overflow).toBe('hidden');
			expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
			expect(secondaryDocument.querySelectorAll('[role="dialog"]')).toHaveLength(1);
			secondaryDocument.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
			);
			flushSync(() => {});
			flushEffects();
			await Promise.resolve();
			expect(secondaryDocument.querySelector('[role="dialog"]')).toBeNull();
			expect(secondaryDocument.body.style.overflow).toBe('');
			expect(document.querySelector('[role="dialog"]')).not.toBeNull();
			expect(document.body.style.overflow).toBe('hidden');
		} finally {
			secondaryRoot.unmount();
		}
	});

	it('starts replacement modal generations with fresh row-local action state', async () => {
		const config = setup();
		let reject!: (error: Error) => void;
		const gate = new Promise<never>((_, rejectPromise) => {
			reject = rejectPromise;
		});
		config.connectors[0]!.connect = async () => gate;
		mounted!.click('#custom-connect');
		flushEffects();
		const firstAction = document.querySelector('.rk-action') as HTMLButtonElement;
		firstAction.click();
		await act(async () => {
			await Promise.resolve();
		});
		expect(firstAction.textContent).toContain('Waiting for');

		mounted!.click('#custom-connect');
		flushEffects();
		const replacementAction = document.querySelector('.rk-action') as HTMLButtonElement;
		const replacementClose = document.querySelector('.rk-close') as HTMLButtonElement;
		expect(replacementAction).not.toBe(firstAction);
		expect(replacementAction.textContent).toBe('Mock Connector');
		await Promise.resolve();
		expect(document.activeElement).toBe(replacementClose);

		reject(new Error('User rejected request'));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	});

	it('dismisses account and chain modals after an external disconnect', async () => {
		const config = setup();
		await act(async () => {
			await connect(config, { connector: config.connectors[0]! });
		});
		flushEffects();

		const accountButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('0x0000'))!;
		accountButton.click();
		flushEffects();
		expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('Account');

		await act(async () => {
			config.setState((state) => ({
				...state,
				connections: new Map(),
				current: null,
				status: 'disconnected',
			}));
		});
		flushSync(() => {});
		flushEffects();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('closes a replacement connect modal when an older request connects the session', async () => {
		const config = setup();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const connector = config.connectors[0]!;
		const original = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await gate;
			return original(parameters);
		};
		mounted!.click('#custom-connect');
		flushEffects();
		(document.querySelector('.rk-action') as HTMLButtonElement).click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushEffects();
		mounted!.click('#custom-connect');
		flushEffects();
		release();
		await act(async () => {
			await gate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
});
