import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ConnectionState, Schema, Zero } from '@rocicorp/zero';

vi.mock('@rocicorp/zero', async (importOriginal) => {
	const original = await importOriginal<typeof import('@rocicorp/zero')>();
	return { ...original, Zero: vi.fn() };
});

import { Zero as ZeroConstructor } from '@rocicorp/zero';
import { ConstructedZeroBinding } from '../_fixtures/binding.tsrx';
import { mount, nextPaint } from '../_helpers.ts';

const schema = {
	tables: {},
	relationships: {},
} as Schema;

function createConstructedZero(clientID: string) {
	const close = vi.fn(async () => {});
	const connect = vi.fn(async () => {});
	const state: ConnectionState = { name: 'connected' };
	const zero = {
		clientID,
		close,
		connection: {
			connect,
			state: {
				current: state,
				subscribe: () => () => {},
			},
		},
		online: true,
		onOnline: () => () => {},
	} as unknown as Zero<Schema>;
	return { zero, close, connect };
}

describe('ZeroProvider options lifecycle', () => {
	beforeEach(() => vi.clearAllMocks());

	// Adapted from zero-provider.test.tsx at @rocicorp/zero 1.8.0.
	test('constructs, initializes, reconnects, and closes an owned Zero instance', async () => {
		const constructed = createConstructedZero('owned-client');
		vi.mocked(ZeroConstructor).mockImplementation(function () {
			return constructed.zero;
		});
		const init = vi.fn();
		const props = {
			cacheURL: 'https://example.com',
			userID: 'user-1',
			schema,
			auth: 'token-a',
			init,
		};
		const result = mount(ConstructedZeroBinding, props);

		expect(result.container.textContent).toBe('');
		await nextPaint();
		expect(result.find('#binding-values').textContent).toBe('owned-client/connected/true');
		expect(ZeroConstructor).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledWith(constructed.zero);

		result.update(ConstructedZeroBinding, { ...props, auth: 'token-b' });
		await nextPaint();
		expect(ZeroConstructor).toHaveBeenCalledTimes(1);
		expect(constructed.connect).toHaveBeenCalledWith({ auth: 'token-b' });

		result.unmount();
		await nextPaint();
		expect(constructed.close).toHaveBeenCalledTimes(1);
	});
});
