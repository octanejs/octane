import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect, createConfig } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { custom, encodeFunctionData } from 'viem';
import { mainnet } from 'viem/chains';
import { QueryClient } from '@octanejs/tanstack-query';
import { act } from 'octane';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import {
	BalanceApp,
	ContractQueriesApp,
	SignApp,
	TransactionMutationsApp,
} from './_fixtures/actions.tsrx';

const account = '0x0000000000000000000000000000000000000001' as const;
const contract = '0x0000000000000000000000000000000000000002' as const;
const transactionHash = `0x${'22'.repeat(32)}` as const;
let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	vi.unstubAllGlobals();
});

function queryClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
}

describe('representative query and privileged action integration', () => {
	it('shares one balance request across two consumers', async () => {
		let balanceRequests = 0;
		const testChain = { ...mainnet, contracts: undefined };
		const config = createConfig({
			chains: [testChain],
			transports: {
				[testChain.id]: custom({
					async request({ method }) {
						if (method === 'eth_getBalance') {
							balanceRequests++;
							return '0x2a';
						}
						if (method === 'eth_chainId') return '0x1';
						throw new Error(`unexpected RPC method ${method}`);
					},
				}),
			},
		});
		mounted = mount(BalanceApp, { address: account, config, queryClient: queryClient() });
		flushEffects();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});

		if (mounted.find('#first').textContent === 'error')
			throw new Error(mounted.find('#balance-error').textContent ?? 'unknown balance error');
		expect(mounted.find('#first').textContent).toBe('42');
		expect(mounted.find('#second').textContent).toBe('42');
		expect(balanceRequests).toBe(1);
	});

	it('signs once through the live deterministic connector', async () => {
		const signature = `0x${'11'.repeat(65)}`;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body)) as { id: number };
				return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: signature }), {
					headers: { 'content-type': 'application/json' },
				});
			}),
		);
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			storage: null,
			transports: { [mainnet.id]: custom({ request: async () => '0x1' }) },
		});
		await connect(config, { connector: config.connectors[0]! });
		mounted = mount(SignApp, { config, queryClient: queryClient() });
		flushEffects();
		mounted.click('#sign');
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(mounted.find('#sign-status').textContent).toBe('success');
		expect(mounted.find('#signature').textContent).toBe(signature);
		expect(mounted.find('#sign-error').textContent).toBe('-');
	});

	it('surfaces connector signing failure without retrying', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account], features: { signMessageError: true } })],
			storage: null,
			transports: { [mainnet.id]: custom({ request: async () => '0x1' }) },
		});
		await connect(config, { connector: config.connectors[0]! });
		mounted = mount(SignApp, { config, queryClient: queryClient() });
		flushEffects();
		mounted.click('#sign');
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(mounted.find('#sign-status').textContent).toBe('error');
		expect(mounted.find('#sign-error').textContent).not.toBe('-');
	});

	it('reads, simulates, and waits for a receipt through the configured transport', async () => {
		const requests: { method: string; params?: readonly unknown[] }[] = [];
		const testChain = { ...mainnet, contracts: undefined };
		const encodedValue = `0x${42n.toString(16).padStart(64, '0')}`;
		const config = createConfig({
			chains: [testChain],
			connectors: [mock({ accounts: [account] })],
			storage: null,
			transports: {
				[testChain.id]: custom({
					async request({ method, params }) {
						requests.push({ method, params });
						if (method === 'eth_call') {
							const call = params?.[0] as { data?: string };
							return call.data === '0x3fa4f245' ? encodedValue : '0x';
						}
						if (method === 'eth_chainId') return '0x1';
						if (method === 'eth_blockNumber') return '0x1';
						if (method === 'eth_getTransactionReceipt') {
							return {
								blockHash: `0x${'33'.repeat(32)}`,
								blockNumber: '0x1',
								contractAddress: null,
								cumulativeGasUsed: '0x5208',
								effectiveGasPrice: '0x1',
								from: account,
								gasUsed: '0x5208',
								logs: [],
								logsBloom: `0x${'00'.repeat(256)}`,
								status: '0x1',
								to: contract,
								transactionHash,
								transactionIndex: '0x0',
								type: '0x2',
							};
						}
						throw new Error(`unexpected RPC method ${method}`);
					},
				}),
			},
		});
		await connect(config, { connector: config.connectors[0]! });

		mounted = mount(ContractQueriesApp, {
			config,
			hash: transactionHash,
			queryClient: queryClient(),
		});
		flushEffects();
		await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));

		expect(mounted.find('#read').textContent).toBe('42');
		if (mounted.find('#simulate').textContent === 'error')
			throw new Error(mounted.find('#simulate-error').textContent ?? 'unknown simulation error');
		expect(mounted.find('#simulate').textContent).toBe('ping');
		if (mounted.find('#receipt').textContent === 'error')
			throw new Error(mounted.find('#receipt-error').textContent ?? 'unknown receipt error');
		expect(mounted.find('#receipt').textContent).toBe('success');
		const calls = requests.filter((request) => request.method === 'eth_call');
		expect(calls).toHaveLength(2);
		expect(calls.every((request) => request.params?.[0]?.to === contract)).toBe(true);
		expect(calls.map((request) => (request.params?.[0] as { data: string }).data)).toEqual(
			expect.arrayContaining([
				'0x3fa4f245',
				encodeFunctionData({
					abi: [
						{
							type: 'function',
							name: 'ping',
							stateMutability: 'nonpayable',
							inputs: [],
							outputs: [],
						},
					],
					functionName: 'ping',
				}),
			]),
		);
		expect(
			requests.some(
				(request) =>
					request.method === 'eth_getTransactionReceipt' && request.params?.[0] === transactionHash,
			),
		).toBe(true);
	});

	it('writes and sends once with the exact consumer parameters', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			storage: null,
			transports: { [mainnet.id]: custom({ request: async () => '0x1' }) },
		});
		await connect(config, { connector: config.connectors[0]! });
		const requests: { method: string; params?: readonly unknown[] }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body)) as {
					id: number;
					method: string;
					params?: readonly unknown[];
				};
				requests.push(body);
				const result = body.method === 'eth_sendTransaction' ? transactionHash : '0x1';
				return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
					headers: { 'content-type': 'application/json' },
				});
			}),
		);
		mounted = mount(TransactionMutationsApp, { config, queryClient: queryClient() });
		flushEffects();

		mounted.click('#write');
		await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(mounted.find('#write-status').textContent).toBe('success');
		expect(mounted.find('#write-hash').textContent).toBe(transactionHash);
		mounted.click('#send');
		await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(mounted.find('#send-status').textContent).toBe('success');
		expect(mounted.find('#send-hash').textContent).toBe(transactionHash);

		const sends = requests.filter((request) => request.method === 'eth_sendTransaction');
		expect(sends).toHaveLength(2);
		expect(sends[0]?.params?.[0]).toMatchObject({ from: account, to: contract });
		expect(String((sends[0]?.params?.[0] as { data: string }).data)).toMatch(/^0x55241077/);
		expect(sends[1]?.params?.[0]).toMatchObject({ from: account, to: contract, value: '0x1' });
	});

	it('surfaces a rejected transaction without automatic mutation retries', async () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: [account] })],
			storage: null,
			transports: { [mainnet.id]: custom({ request: async () => '0x1' }) },
		});
		await connect(config, { connector: config.connectors[0]! });
		let attempts = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body)) as { method: string };
				if (body.method === 'eth_sendTransaction') {
					attempts++;
					throw new Error('wallet rejected transaction');
				}
				throw new Error(`unexpected wallet method ${body.method}`);
			}),
		);
		const retriesEnabled = new QueryClient({
			defaultOptions: { mutations: { retry: 3 }, queries: { retry: false } },
		});
		mounted = mount(TransactionMutationsApp, { config, queryClient: retriesEnabled });
		flushEffects();
		mounted.click('#send');
		await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

		expect(attempts).toBe(1);
		expect(mounted.find('#send-status').textContent).toBe('error');
		expect(mounted.find('#send-error').textContent).toContain('wallet rejected transaction');
	});
});
