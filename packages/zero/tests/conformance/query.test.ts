import { describe, expect, test, vi } from 'vitest';
import { queryInternalsTag, type QueryImpl } from '@rocicorp/zero/bindings';
import type { Query, ResultType, Schema, Zero } from '@rocicorp/zero';
import {
	CancellableSuspenseQueryBinding,
	PartialSuspenseQueryBinding,
	QueryBinding,
	SequentialSuspenseQueryBinding,
	SuspenseQueryBinding,
} from '../_fixtures/binding.tsrx';
import { mount, nextPaint } from '../_helpers.ts';

type Row = { id: string; name: string };
type Listener = (rows: readonly Row[], resultType: ResultType) => void;

function createQuery(hash = 'query-binding'): Query<string, Schema, readonly Row[]> {
	return {
		[queryInternalsTag]: true,
		hash: () => hash,
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

	test('keeps sequential queries suspended until both results are complete', async () => {
		const listenerSets = [new Set<Listener>(), new Set<Listener>()];
		let materialization = 0;
		const materialize = vi.fn(() => {
			const listeners = listenerSets[materialization++];
			if (listeners === undefined) throw new Error('unexpected materialization');
			return {
				addListener(listener: Listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				destroy: vi.fn(),
				updateTTL: vi.fn(),
			};
		});
		const zero = {
			clientID: 'sequential-suspense-client',
			context: {},
			materialize,
		} as unknown as Zero<Schema>;
		const result = mount(SequentialSuspenseQueryBinding, {
			zero,
			queryA: createQuery('query-a'),
			queryB: createQuery('query-b'),
		});

		expect(result.find('#sequential-suspense-query-pending').textContent).toBe('pending');
		await nextPaint();
		for (const listener of listenerSets[0]) {
			listener([{ id: 'a', name: 'Ada' }], 'complete');
		}
		await Promise.resolve();
		await nextPaint();

		expect(result.findAll('#sequential-suspense-query-pending')).toHaveLength(1);
		expect(result.findAll('#sequential-suspense-query-values')).toHaveLength(0);
		expect(result.findAll('#sequential-suspense-query-error')).toHaveLength(0);
		expect(materialize).toHaveBeenCalledTimes(2);

		for (const listener of listenerSets[1]) {
			listener([{ id: 'b', name: 'Babbage' }], 'complete');
		}
		await Promise.resolve();
		await nextPaint();

		expect(result.find('#sequential-suspense-query-values').textContent).toBe(
			'1/complete/1/complete',
		);
		expect(result.findAll('#sequential-suspense-query-pending')).toHaveLength(0);
		expect(result.findAll('#sequential-suspense-query-error')).toHaveLength(0);
		result.unmount();
	});

	test.each([
		['disabled', '#disable-suspense-query', '0/unknown'],
		['cleared', '#clear-suspense-query', 'undefined/unknown'],
	] as const)(
		'releases a pending suspense query when it is %s',
		async (_state, control, expected) => {
			const materialize = vi.fn(() => ({
				addListener() {
					return () => {};
				},
				destroy: vi.fn(),
				updateTTL: vi.fn(),
			}));
			const zero = {
				clientID: `cancellable-suspense-${_state}`,
				context: {},
				materialize,
			} as unknown as Zero<Schema>;
			const result = mount(CancellableSuspenseQueryBinding, {
				zero,
				query: createQuery(`cancellable-query-${_state}`),
			});

			expect(result.find('#cancellable-suspense-query-pending').textContent).toBe('pending');
			result.click(control);
			await Promise.resolve();
			await nextPaint();

			expect(result.find('#cancellable-suspense-query-values').textContent).toBe(expected);
			expect(result.findAll('#cancellable-suspense-query-pending')).toHaveLength(0);
			expect(result.findAll('#cancellable-suspense-query-error')).toHaveLength(0);
			result.unmount();
		},
	);

	test('resuspends when a disabled query is enabled before its replay', async () => {
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
			clientID: 'restarted-suspense',
			context: {},
			materialize,
		} as unknown as Zero<Schema>;
		const result = mount(CancellableSuspenseQueryBinding, {
			zero,
			query: createQuery('restarted-query'),
		});

		result.click('#restart-suspense-query');
		await Promise.resolve();
		await Promise.resolve();
		await nextPaint();

		expect(result.findAll('#cancellable-suspense-query-pending')).toHaveLength(1);
		expect(result.findAll('#cancellable-suspense-query-error')).toHaveLength(0);

		for (const listener of listeners) {
			listener([{ id: '1', name: 'Restarted' }], 'complete');
		}
		await Promise.resolve();
		await nextPaint();

		expect(
			result.findAll('#cancellable-suspense-query-values').map((node) => node.textContent),
		).toContain('1/complete');
		result.unmount();
	});
});
