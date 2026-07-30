import { afterEach, describe, expect, it } from 'vitest';
import { connect, createConfig, http, type Config, type State } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';
import { act } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { HydrationApp } from './_fixtures/hydration.tsrx';
import { parseHydratedState, serializeHydratedState } from '@octanejs/wagmi';

const account = '0x0000000000000000000000000000000000000001' as const;
let mounted: ReturnType<typeof mount> | undefined;

function config() {
	return createConfig({
		chains: [mainnet],
		connectors: [mock({ accounts: [account] })],
		ssr: true,
		transports: { [mainnet.id]: http() },
	});
}

async function connectedInitialState(client: Config): Promise<State> {
	await connect(client, { connector: client.connectors[0]! });
	const initialState = client.state;
	client.setState((state) => ({
		...state,
		connections: new Map(),
		current: null,
		status: 'disconnected',
	}));
	return initialState;
}

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
});

describe('WagmiProvider SSR initial state', () => {
	it('mounts a non-SSR config immediately and only once when the provider rerenders', () => {
		const client = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		const initialState = client.state;
		client._internal.store.persist.hasHydrated = () => false;
		Object.defineProperty(client, 'storage', { value: {} });
		let hydrationCalls = 0;
		let mountCalls = 0;
		const setState = client.setState.bind(client);
		client.setState = ((state: State | ((state: State) => State)) => {
			if (typeof state === 'function') mountCalls++;
			else hydrationCalls++;
			return setState(state);
		}) as typeof client.setState;
		const log: string[] = [];
		const props = {
			config: client,
			initialState,
			reconnectOnMount: false,
			log: (entry: string) => log.push(entry),
		};

		mounted = mount(HydrationApp, props);
		expect(hydrationCalls).toBe(1);
		expect(mountCalls).toBe(1);
		flushEffects();
		mounted.update(HydrationApp, props);
		flushEffects();

		expect(hydrationCalls).toBe(1);
		expect(mountCalls).toBe(1);
	});

	it('defers the mount lifecycle for an SSR config until effects flush', async () => {
		const client = config();
		const initialState = client.state;
		client._internal.store.persist.hasHydrated = () => false;
		Object.defineProperty(client, 'storage', { value: {} });
		let hydrationCalls = 0;
		let mountCalls = 0;
		const setState = client.setState.bind(client);
		client.setState = ((state: State | ((state: State) => State)) => {
			if (typeof state === 'function') mountCalls++;
			else hydrationCalls++;
			return setState(state);
		}) as typeof client.setState;

		mounted = mount(HydrationApp, {
			config: client,
			initialState,
			reconnectOnMount: false,
			log: () => {},
		});

		expect(hydrationCalls).toBe(1);
		expect(mountCalls).toBe(0);
		flushEffects();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mountCalls).toBe(1);
	});

	it('mounts each replacement SSR config once without remounting the old config', async () => {
		const first = config();
		const second = config();
		const mountCalls = new Map<Config, number>([
			[first, 0],
			[second, 0],
		]);
		for (const client of [first, second]) {
			client._internal.store.persist.hasHydrated = () => false;
			Object.defineProperty(client, 'storage', { value: {} });
			const setState = client.setState.bind(client);
			client.setState = ((state: State | ((state: State) => State)) => {
				if (typeof state === 'function') mountCalls.set(client, mountCalls.get(client)! + 1);
				return setState(state);
			}) as typeof client.setState;
		}
		const props = {
			config: first,
			initialState: first.state,
			reconnectOnMount: false,
			log: () => {},
		};

		mounted = mount(HydrationApp, props);
		expect([...mountCalls.values()]).toEqual([0, 0]);
		flushEffects();
		await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
		expect([...mountCalls.values()]).toEqual([1, 0]);

		mounted.update(HydrationApp, {
			...props,
			config: second,
			initialState: second.state,
		});
		expect([...mountCalls.values()]).toEqual([1, 0]);
		flushEffects();
		await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
		expect([...mountCalls.values()]).toEqual([1, 1]);

		mounted.update(HydrationApp, {
			...props,
			config: second,
			initialState: { ...second.state },
		});
		flushEffects();
		await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
		expect([...mountCalls.values()]).toEqual([1, 1]);
	});

	it('does not restart hydration for separately parsed equivalent initial state', () => {
		const client = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			transports: { [mainnet.id]: http() },
		});
		const serialized = serializeHydratedState(client.state)!;
		const firstInitialState = parseHydratedState(serialized)!;
		const secondInitialState = parseHydratedState(serialized)!;
		expect(secondInitialState).not.toBe(firstInitialState);

		client._internal.store.persist.hasHydrated = () => false;
		Object.defineProperty(client, 'storage', { value: {} });
		let hydrationCalls = 0;
		let mountCalls = 0;
		const setState = client.setState.bind(client);
		client.setState = ((state: State | ((state: State) => State)) => {
			if (typeof state === 'function') mountCalls++;
			else hydrationCalls++;
			return setState(state);
		}) as typeof client.setState;

		const props = {
			config: client,
			initialState: firstInitialState,
			reconnectOnMount: false,
			log: () => {},
		};
		mounted = mount(HydrationApp, props);
		flushEffects();
		mounted.update(HydrationApp, { ...props, initialState: secondInitialState });
		flushEffects();

		expect(hydrationCalls).toBe(1);
		expect(mountCalls).toBe(1);
	});

	it('renders the supplied connection before effects without a disconnected intermediate render', async () => {
		const client = config();
		const initialState = await connectedInitialState(client);
		client.connectors[0]!.isAuthorized = async () => true;
		const log: string[] = [];
		mounted = mount(HydrationApp, {
			config: client,
			initialState,
			reconnectOnMount: true,
			log: (entry) => log.push(entry),
		});

		expect(mounted.find('#status').textContent).toBe('reconnecting');
		expect(mounted.find('#address').textContent).toBe(account);
		expect(log).toEqual([`render:reconnecting:${account}`]);

		flushEffects();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(log[1]).toBe(`effect:reconnecting:${account}`);
		expect(log).not.toContain('render:disconnected:-');
		expect(mounted.find('#status').textContent).not.toBe('disconnected');
	});

	it('does not reconnect on mount when reconnectOnMount is false', async () => {
		const client = config();
		const initialState = await connectedInitialState(client);
		let reconnectAttempts = 0;
		const connector = client.connectors[0]!;
		const connectorConnect = connector.connect.bind(connector);
		connector.connect = async (parameters) => {
			reconnectAttempts++;
			return connectorConnect(parameters);
		};
		const log: string[] = [];
		mounted = mount(HydrationApp, {
			config: client,
			initialState,
			reconnectOnMount: false,
			log: (entry) => log.push(entry),
		});

		expect(log).toEqual(['render:disconnected:-']);
		expect(mounted.find('#status').textContent).toBe('disconnected');
		expect(mounted.find('#address').textContent).toBe('-');

		flushEffects();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(log).toEqual(['render:disconnected:-', 'effect:disconnected:-']);
		expect(reconnectAttempts).toBe(0);
	});
});
