import { act, renderHook } from '@octanejs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent, RealtimeToken } from '@tanstack/ai';
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client';
import { useRealtimeChat } from '../../../src/use-realtime-chat.tsrx';
import type { UseRealtimeChatOptions } from '../../../src/realtime-types';

interface TestConnection {
	connection: RealtimeConnection;
}

function createConnection(): TestConnection {
	const updateSession = vi.fn<RealtimeConnection['updateSession']>();
	const listeners = new Map<RealtimeEvent, Set<(payload: unknown) => void>>();
	const on: RealtimeConnection['on'] = (event, handler) => {
		let eventListeners = listeners.get(event);
		if (!eventListeners) {
			eventListeners = new Set();
			listeners.set(event, eventListeners);
		}
		const listener = handler as unknown as (payload: unknown) => void;
		eventListeners.add(listener);
		return () => eventListeners.delete(listener);
	};
	const connection: RealtimeConnection = {
		disconnect: vi.fn(async () => {}),
		startAudioCapture: vi.fn(async () => {}),
		stopAudioCapture: vi.fn(),
		sendText: vi.fn(),
		sendImage: vi.fn(),
		sendToolResult: vi.fn(),
		updateSession,
		interrupt: vi.fn(),
		on,
		getAudioVisualization: () => ({
			inputLevel: 0,
			outputLevel: 0,
			getInputFrequencyData: () => new Uint8Array(128),
			getOutputFrequencyData: () => new Uint8Array(128),
			getInputTimeDomainData: () => new Uint8Array(128),
			getOutputTimeDomainData: () => new Uint8Array(128),
			inputSampleRate: 48_000,
			outputSampleRate: 48_000,
		}),
	};
	return { connection };
}

function createAdapter(provider: string, connections: Array<RealtimeConnection>) {
	const remaining = [...connections];
	const connect = vi.fn<RealtimeAdapter['connect']>(async () => {
		const connection = remaining.shift();
		if (!connection) throw new Error(`No ${provider} test connection remains`);
		return connection;
	});
	const adapter: RealtimeAdapter = { provider, connect };
	return { adapter, connect };
}

function createToken(
	provider: string,
	value: string,
	expiresAt: number = Date.now() + 3_600_000,
): RealtimeToken {
	return { provider, token: value, expiresAt, config: {} };
}

function createOptions(
	adapter: RealtimeAdapter,
	getToken: UseRealtimeChatOptions['getToken'],
	overrides: Partial<UseRealtimeChatOptions> = {},
): UseRealtimeChatOptions {
	return { adapter, getToken, autoCapture: false, ...overrides };
}

beforeEach(() => {
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn(() => 1),
	);
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('useRealtimeChat', () => {
	// Octane divergence note.
	it('uses updated authentication and provider on the next connection', async () => {
		const firstConnection = createConnection();
		const secondConnection = createConnection();
		const firstAdapter = createAdapter('first', [firstConnection.connection]);
		const secondAdapter = createAdapter('second', [secondConnection.connection]);
		const firstToken = createToken('first', 'first-token');
		const secondToken = createToken('second', 'second-token');
		const firstGetToken = vi.fn(async () => firstToken);
		const secondGetToken = vi.fn(async () => secondToken);

		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{ initialProps: createOptions(firstAdapter.adapter, firstGetToken) },
		);

		await act(async () => {
			await result.current.connect();
			await result.current.disconnect();
		});

		rerender(createOptions(secondAdapter.adapter, secondGetToken));
		await act(async () => {
			await result.current.connect();
		});

		expect(firstGetToken).toHaveBeenCalledTimes(1);
		expect(firstAdapter.connect).toHaveBeenCalledTimes(1);
		expect(secondGetToken).toHaveBeenCalledTimes(1);
		expect(secondAdapter.connect).toHaveBeenCalledWith(secondToken, undefined);

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});

	// Octane divergence note.
	it('forwards connection status to the latest callback', async () => {
		const testConnection = createConnection();
		const testAdapter = createAdapter('test', [testConnection.connection]);
		const getToken = vi.fn(async () => createToken('test', 'token'));
		const firstOnStatusChange = vi.fn();
		const secondOnStatusChange = vi.fn();
		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{
				initialProps: createOptions(testAdapter.adapter, getToken, {
					onStatusChange: firstOnStatusChange,
				}),
			},
		);

		rerender(
			createOptions(testAdapter.adapter, getToken, {
				onStatusChange: secondOnStatusChange,
			}),
		);
		await act(async () => {
			await result.current.connect();
		});

		expect(firstOnStatusChange).not.toHaveBeenCalled();
		expect(secondOnStatusChange).toHaveBeenCalledWith('connecting');
		expect(secondOnStatusChange).toHaveBeenCalledWith('connected');

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});
});
