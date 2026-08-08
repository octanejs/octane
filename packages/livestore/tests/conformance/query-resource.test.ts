import { createTodoMvcStore, events, tables } from '@livestore/framework-toolkit/testing';
import { queryDb } from '@livestore/livestore';
import { Effect, Schema } from '@livestore/utils/effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { withReactApi } from '../../src/useStore';
import { __resetUseRcResourceCache } from '../../src/useRcResource';
import { act, flushEffects, mount, nextPaint } from '../_helpers';
import { TwoQueryReaders } from '../_fixtures/query.tsrx';

beforeEach(function resetResourceCache() {
	__resetUseRcResourceCache();
});

describe('query resource sharing', () => {
	it('shares one query resource and unsubscribes only after the last consumer leaves', async () => {
		await Effect.gen(function* () {
			const store = yield* createTodoMvcStore();
			const augmented = withReactApi(store);
			const queryable = queryDb({
				query: 'select * from todos order by id',
				schema: Schema.Array(tables.todos.rowSchema),
			});
			let query: { activeSubscriptions: Set<unknown> } | undefined;
			const onQuery = function onQuery(value: object) {
				query = value as { activeSubscriptions: Set<unknown> };
			};
			const result = mount(TwoQueryReaders, {
				store: augmented,
				queryable,
				showSecond: true,
				onQuery,
			});
			flushEffects();
			expect(query?.activeSubscriptions.size).toBe(2);

			result.update(TwoQueryReaders, {
				store: augmented,
				queryable,
				showSecond: false,
				onQuery,
			});
			flushEffects();
			expect(query?.activeSubscriptions.size).toBe(1);
			yield* Effect.promise(function commitTodo() {
				return act(function createTodo() {
					store.commit(events.todoCreated({ id: 't1', text: 'milk', completed: false }));
				});
			});
			void nextPaint();
			expect(result.findAll('.query')).toHaveLength(1);
			expect(result.find('.query').textContent).toContain('milk');

			result.unmount();
			flushEffects();
			expect(query?.activeSubscriptions.size).toBe(0);
		}).pipe(Effect.scoped, Effect.runPromise);
	});
});
