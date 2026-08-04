import { describe, expect, test, vi } from 'vitest';
import type { ConnectionState, Schema, Zero } from '@rocicorp/zero';
import { ExternalZeroBinding, MissingZeroProvider } from '../_fixtures/binding.tsrx';
import { mount, nextPaint } from '../_helpers.ts';

type Listener<T> = (value: T) => void;

function createMockZero(
	clientID: string,
	initialConnection: ConnectionState,
	initialOnline: boolean,
) {
	let connection = initialConnection;
	let online = initialOnline;
	const connectionListeners = new Set<Listener<ConnectionState>>();
	const onlineListeners = new Set<() => void>();
	const close = vi.fn(async () => {});

	const zero = {
		clientID,
		close,
		get online() {
			return online;
		},
		onOnline(listener: () => void) {
			onlineListeners.add(listener);
			return () => onlineListeners.delete(listener);
		},
		connection: {
			state: {
				get current() {
					return connection;
				},
				subscribe(listener: Listener<ConnectionState>) {
					connectionListeners.add(listener);
					return () => connectionListeners.delete(listener);
				},
			},
			connect: vi.fn(async () => {}),
		},
	} as unknown as Zero<Schema>;

	return {
		zero,
		close,
		connectionListeners,
		onlineListeners,
		setConnection(next: ConnectionState) {
			connection = next;
			for (const listener of connectionListeners) listener(next);
		},
		setOnline(next: boolean) {
			online = next;
			for (const listener of onlineListeners) listener();
		},
	};
}

describe('@octanejs/zero bindings', () => {
	// Adapted from zero-provider.test.tsx at @rocicorp/zero 1.8.0.
	test('provides an externally owned Zero instance without closing it', async () => {
		const mock = createMockZero('client-a', { name: 'connecting' }, false);
		const result = mount(ExternalZeroBinding, { zero: mock.zero });

		expect(result.find('#binding-values').textContent).toBe('client-a/connecting/false');
		await nextPaint();
		expect(mock.connectionListeners.size).toBe(1);
		expect(mock.onlineListeners.size).toBe(1);

		result.unmount();
		await nextPaint();
		expect(mock.close).not.toHaveBeenCalled();
		expect(mock.connectionListeners.size).toBe(0);
		expect(mock.onlineListeners.size).toBe(0);
	});

	// Adapted from use-connection-state.test.tsx at @rocicorp/zero 1.8.0.
	test('updates connection and online snapshots through public subscriptions', async () => {
		const mock = createMockZero('client-b', { name: 'connecting' }, false);
		const result = mount(ExternalZeroBinding, { zero: mock.zero });
		await nextPaint();

		mock.setConnection({ name: 'connected' });
		mock.setOnline(true);
		await nextPaint();

		expect(result.find('#binding-values').textContent).toBe('client-b/connected/true');
		result.unmount();
	});

	// Adapted from zero-provider.test.tsx at @rocicorp/zero 1.8.0.
	test('updates the context when the external Zero instance changes', async () => {
		const first = createMockZero('client-first', { name: 'connected' }, true);
		const second = createMockZero(
			'client-second',
			{ name: 'disconnected', reason: 'offline' },
			false,
		);
		const result = mount(ExternalZeroBinding, { zero: first.zero });
		await nextPaint();

		result.update(ExternalZeroBinding, { zero: second.zero });
		await nextPaint();

		expect(result.find('#binding-values').textContent).toBe('client-second/disconnected/false');
		expect(first.close).not.toHaveBeenCalled();
		expect(second.close).not.toHaveBeenCalled();
		result.unmount();
	});

	// Adapted from zero-provider.test.tsx at @rocicorp/zero 1.8.0.
	test('throws a clear error outside ZeroProvider', () => {
		expect(() => mount(MissingZeroProvider)).toThrowError(
			'useZero must be used within a ZeroProvider',
		);
	});
});
