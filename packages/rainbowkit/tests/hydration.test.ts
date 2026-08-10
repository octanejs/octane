import { describe, expect, it, vi } from 'vitest';
import { connect, createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';
import { QueryClient } from '@octanejs/tanstack-query';
import { flushSync, hydrateRoot } from 'octane';
import { flushEffects } from '../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { App } from './_fixtures/app.tsrx';

async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await Promise.resolve();
	flushEffects();
}

describe('@octanejs/rainbowkit hydration', () => {
	it('adopts disconnected SSR controls, flips mounted, and opens the live modal', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: ['0x0000000000000000000000000000000000000001'] })],
			ssr: true,
			transports: { [mainnet.id]: http() },
		});
		const queryClient = new QueryClient();
		const server = await renderHydrationFixture(
			'rainbowkit',
			'packages/rainbowkit/tests/_fixtures/app.tsrx',
			'App',
			{ config, queryClient },
		);
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const button = container.querySelector('#custom-connect');
		const mounted = container.querySelector('#mounted');
		const wallet = container.querySelector('.rk-wallet-button') as HTMLButtonElement;
		expect(wallet.disabled).toBe(true);
		wallet.click();
		expect(config.state.status).toBe('disconnected');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, App, { config, queryClient });
		try {
			await settle();
			expect(container.querySelector('#custom-connect')).toBe(button);
			expect(container.querySelector('#mounted')).toBe(mounted);
			expect(container.querySelector('.rk-wallet-button')).toBe(wallet);
			expect(mounted?.textContent).toBe('true');
			expect(wallet.disabled).toBe(false);
			(button as HTMLButtonElement).click();
			await settle();
			expect(container.querySelector('[role="dialog"]')).not.toBeNull();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			errors.mockRestore();
			container.remove();
		}
	}, 15_000);

	it('keeps a prehydrated connection inert until effects without replacing controls', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: ['0x0000000000000000000000000000000000000001'] })],
			ssr: true,
			transports: { [mainnet.id]: http() },
		});
		await connect(config, { connector: config.connectors[0]! });
		const initialState = config.state;
		config.setState((state) => ({
			...state,
			connections: new Map(),
			current: null,
			status: 'disconnected',
		}));
		config.connectors[0]!.isAuthorized = async () => true;
		const serverQueryClient = new QueryClient();
		const props = {
			config,
			initialState,
			queryClient: serverQueryClient,
			reconnectOnMount: true,
		};
		const server = await renderHydrationFixture(
			'rainbowkit',
			'packages/rainbowkit/tests/_fixtures/app.tsrx',
			'App',
			props,
		);
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const control = container.querySelector('#custom-connect') as HTMLButtonElement;
		const status = container.querySelector('#custom-status');
		expect(container.querySelector('#mounted')?.textContent).toBe('false');
		expect(status?.textContent).toBe('disconnected');
		expect(control.disabled).toBe(false);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, App, props);
		try {
			expect(container.querySelector('#custom-connect')).toBe(control);
			expect(container.querySelector('#custom-status')).toBe(status);
			expect(status?.textContent).toBe('disconnected');
			control.click();
			expect(container.querySelector('[role="dialog"]')).toBeNull();
			await settle();
			expect(container.querySelector('#mounted')?.textContent).toBe('true');
			expect(container.querySelector('#connection-status')?.textContent).toBe('connecting');
			control.click();
			await settle();
			expect(container.querySelector('[role="dialog"]')).not.toBeNull();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			errors.mockRestore();
			container.remove();
			serverQueryClient.clear();
		}
	}, 15_000);
});
