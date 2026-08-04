import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { queryInternalsTag, type QueryImpl } from '@rocicorp/zero/bindings';
import type { ErroredQuery, Query, ResultType, Schema, Zero } from '@rocicorp/zero';
import { ViewStore } from '../../src/use-query.ts';

type Listener = (data: unknown, resultType: ResultType, error?: ErroredQuery) => void;

type MockView = {
	listeners: Set<Listener>;
	addListener(listener: Listener): () => void;
	destroy(): void;
	updateTTL(): void;
};

function createQuery(hash: string): Query<string, Schema> {
	return {
		[queryInternalsTag]: true,
		hash: () => hash,
		format: { singular: false },
	} as unknown as QueryImpl<string, Schema>;
}

function createZero(clientID: string) {
	const materialize = vi.fn(
		() =>
			({
				listeners: new Set<Listener>(),
				addListener(listener: Listener) {
					this.listeners.add(listener);
					return () => this.listeners.delete(listener);
				},
				destroy() {
					this.listeners.clear();
				},
				updateTTL() {},
			}) satisfies MockView,
	);
	return {
		zero: { clientID, materialize } as unknown as Zero<Schema, undefined, unknown>,
		materialize,
	};
}

function emit(view: MockView, rows: readonly unknown[]) {
	for (const listener of view.listeners) listener(rows, 'unknown');
}

describe('Zero view lifecycle', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	// Adapted from navigation-race.test.tsx at @rocicorp/zero 1.8.0.
	test('preserves a materialized view across a fast unsubscribe and resubscribe', () => {
		const store = new ViewStore();
		const query = createQuery('fast-navigation');
		const { zero, materialize } = createZero('client-fast');
		const first = store.getView(zero, query, true, 'forever');
		const unsubscribe = first.subscribeReactInternals(() => {});
		const materialized = materialize.mock.results[0]!.value;
		emit(materialized, [{ id: '1' }]);

		unsubscribe();
		vi.advanceTimersByTime(5);
		const second = store.getView(zero, query, true, 'forever');
		const unsubscribeAgain = second.subscribeReactInternals(() => {});
		vi.advanceTimersByTime(20);

		expect(second).toBe(first);
		expect(second.getSnapshot()[0]).toEqual([{ id: '1' }]);
		expect(materialize).toHaveBeenCalledTimes(1);
		unsubscribeAgain();
	});

	// Adapted from navigation-race.test.tsx at @rocicorp/zero 1.8.0.
	test('re-materializes after the destruction deadline', () => {
		const store = new ViewStore();
		const query = createQuery('slow-navigation');
		const { zero, materialize } = createZero('client-slow');
		const first = store.getView(zero, query, true, 'forever');
		const unsubscribe = first.subscribeReactInternals(() => {});

		unsubscribe();
		vi.advanceTimersByTime(15);
		const second = store.getView(zero, query, true, 'forever');

		expect(second).not.toBe(first);
		expect(second.getSnapshot()[0]).toEqual([]);
		expect(materialize).toHaveBeenCalledTimes(2);
	});
});
