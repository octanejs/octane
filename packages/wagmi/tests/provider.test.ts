import { afterEach, describe, expect, it } from 'vitest';
import { createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';
import { QueryClient } from '@octanejs/tanstack-query';
import { act } from 'octane';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { App } from './_fixtures/connection.tsrx';

const account = '0x0000000000000000000000000000000000000001' as const;
let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
});

describe('WagmiProvider connection lifecycle', () => {
	it('proves the RainbowKit custom-control disconnected → connecting → connected gate', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		let releaseConnect!: () => void;
		const connectGate = new Promise<void>((resolve) => {
			releaseConnect = resolve;
		});
		const connector = config.connectors[0]!;
		const connect = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			await connectGate;
			return connect(parameters);
		};
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		mounted = mount(App, { config, queryClient });
		flushEffects();

		expect(mounted.find('#status').textContent).toBe('disconnected');
		mounted.click('#connect');
		await act(async () => {
			await Promise.resolve();
		});
		expect(mounted.find('#status').textContent).toBe('connecting');
		releaseConnect();
		await act(async () => {
			await connectGate;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted.find('#status').textContent).toBe('connected');
		expect(mounted.find('#address').textContent).toBe(account);
	});

	it('disables connect retries even when QueryClient mutation defaults enable them', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		let attempts = 0;
		const connector = config.connectors[0]!;
		connector.connect = async () => {
			attempts++;
			throw new Error('wallet rejected');
		};
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: 3 } } }),
		});
		flushEffects();
		mounted.click('#connect');
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(attempts).toBe(1);
		expect(mounted.find('#connect-mutation-status').textContent).toBe('error');
	});

	it('resets the connect mutation after connected → disconnected', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		mounted.click('#connect');
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted.find('#connect-mutation-status').textContent).toBe('success');
		act(() => {
			config.setState((state) => ({
				...state,
				connections: new Map(),
				current: null,
				status: 'disconnected',
			}));
		});
		flushEffects();
		expect(mounted.find('#status').textContent).toBe('disconnected');
		expect(mounted.find('#connect-mutation-status').textContent).toBe('idle');
	});

	it('removes every component-owned config watcher on unmount', () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		let activeWatchers = 0;
		const subscribe = config.subscribe.bind(config);
		config.subscribe = ((...arguments_: unknown[]) => {
			activeWatchers++;
			const unsubscribe = (subscribe as (...input: unknown[]) => () => void)(...arguments_);
			return () => {
				activeWatchers--;
				unsubscribe();
			};
		}) as typeof config.subscribe;
		mounted = mount(App, {
			config,
			queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
		});
		flushEffects();
		expect(activeWatchers).toBeGreaterThan(0);
		mounted.unmount();
		mounted = undefined;
		flushEffects();
		expect(activeWatchers).toBe(0);
	});
});
