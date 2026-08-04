import { describe, expect, test, vi } from 'vitest';
import { queryInternalsTag, type QueryImpl } from '@rocicorp/zero/bindings';
import type { Query, ResultType, Schema, Zero } from '@rocicorp/zero';
import {
	PartialSuspenseQueryBinding,
	QueryBinding,
	SuspenseQueryBinding,
} from '../_fixtures/binding.tsrx';
import { mount, nextPaint } from '../_helpers.ts';

type Row = { id: string; name: string };
type Listener = (rows: readonly Row[], resultType: ResultType) => void;

function createQuery(): Query<string, Schema, readonly Row[]> {
	return {
		[queryInternalsTag]: true,
		hash: () => 'query-binding',
		format: { singular: false },
	} as unknown as QueryImpl<string, Schema, readonly Row[]>;
}

describe('useQuery', () => {
	// Adapted from use-query.test.tsx at @rocicorp/zero 1.8.0.
	test('renders the initial snapshot and live materialized rows', async () => {
		const listeners = new Set<Listener>();
		const destroy = vi.fn();
		const materialize = vi.fn(() => ({
			addListener(listener: Listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			destroy,
			updateTTL: vi.fn(),
		}));
		const zero = {
			clientID: 'query-client',
			context: {},
			materialize,
		} as unknown as Zero<Schema>;
		const result = mount(QueryBinding, { zero, query: createQuery() });

		expect(result.find('#query-values').textContent).toBe('0/unknown');
		await nextPaint();
		for (const listener of listeners) {
			listener([{ id: '1', name: 'Ada' }], 'complete');
		}
		await nextPaint();

		expect(result.find('#query-values').textContent).toBe('1/complete');
		expect(materialize).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	// Adapted from use-query.test.tsx at @rocicorp/zero 1.8.0.
	test('suspends until a complete materialized result arrives', async () => {
		const listeners = new Set<Listener>();
		const materialize = vi.fn(() => ({
			addListener(listener: Listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			destroy: vi.fn(),
			updateTTL: vi.fn(),
		}));
		const zero = {
			clientID: 'suspense-client',
			context: {},
			materialize,
		} as unknown as Zero<Schema>;
		const result = mount(SuspenseQueryBinding, { zero, query: createQuery() });

		expect(result.find('#suspense-query-pending').textContent).toBe('pending');
		await nextPaint();
		for (const listener of listeners) {
			listener([{ id: '1', name: 'Grace' }], 'complete');
		}
		await Promise.resolve();
		await nextPaint();

		expect(result.find('#suspense-query-values').textContent).toBe('1/complete');
		expect(materialize).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	// Adapted from use-query.test.tsx at @rocicorp/zero 1.8.0.
	test('uses partial results as the default suspense threshold', async () => {
		const listeners = new Set<Listener>();
		const materialize = vi.fn(() => ({
			addListener(listener: Listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			destroy: vi.fn(),
			updateTTL: vi.fn(),
		}));
		const zero = {
			clientID: 'partial-suspense-client',
			context: {},
			materialize,
		} as unknown as Zero<Schema>;
		const result = mount(PartialSuspenseQueryBinding, { zero, query: createQuery() });

		expect(result.find('#partial-suspense-query-pending').textContent).toBe('pending');
		await nextPaint();
		for (const listener of listeners) {
			listener([{ id: '1', name: 'Lin' }], 'unknown');
		}
		await Promise.resolve();
		await nextPaint();

		expect(result.find('#partial-suspense-query-values').textContent).toBe('1/unknown');
		result.unmount();
	});
});
