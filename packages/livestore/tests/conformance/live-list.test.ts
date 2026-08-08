import { createTodoMvcStore, events, tables } from '@livestore/framework-toolkit/testing';
import { queryDb } from '@livestore/livestore';
import { Effect, Schema } from '@livestore/utils/effect';
import { describe, expect, it } from 'vitest';
import { withReactApi } from '../../src/useStore';
import { __resetUseRcResourceCache } from '../../src/useRcResource';
import { act, flushEffects, mount } from '../_helpers';
import { TodoLiveList } from '../_fixtures/live-list.tsrx';

describe('LiveList', () => {
	it('preserves keyed identity, current indexes, metadata, and item reactivity', async () => {
		await Effect.gen(function* () {
			__resetUseRcResourceCache();
			const store = withReactApi(yield* createTodoMvcStore());
			const items$ = queryDb({
				query: 'select * from todos order by text',
				schema: Schema.Array(tables.todos.rowSchema),
			});
			const renders: string[] = [];
			const result = mount(TodoLiveList, {
				store,
				items$,
				onRender: function onRender(entry: string) {
					renders.push(entry);
				},
			});
			flushEffects();
			expect(result.findAll('li')).toHaveLength(0);

			yield* Effect.promise(function createInitialTodos() {
				return act(function commitInitial() {
					store.commit(
						events.todoCreated({ id: 't1', text: 'beta', completed: false }),
						events.todoCreated({ id: 't2', text: 'alpha', completed: false }),
					);
				});
			});
			flushEffects();
			const initial = result.findAll('li');
			expect(
				initial.map(function idOf(node) {
					return node.getAttribute('data-id');
				}),
			).toEqual(['t2', 't1']);
			expect(
				initial.map(function indexOf(node) {
					return node.getAttribute('data-index');
				}),
			).toEqual(['0', '1']);
			expect(renders).toContain('t2:0:false');
			expect(renders).toContain('t1:1:false');
			const t1 = initial[1];
			const t2 = initial[0];

			yield* Effect.promise(function reorderTodos() {
				return act(function commitReorder() {
					store.commit(events.todoUpdated({ id: 't1', text: 'aardvark' }));
				});
			});
			flushEffects();
			const reordered = result.findAll('li');
			expect(
				reordered.map(function idOf(node) {
					return node.getAttribute('data-id');
				}),
			).toEqual(['t1', 't2']);
			expect(
				reordered.map(function indexOf(node) {
					return node.getAttribute('data-index');
				}),
			).toEqual(['0', '1']);
			expect(reordered[0]).toBe(t1);
			expect(reordered[1]).toBe(t2);
			expect(reordered[0]?.textContent).toBe('aardvark');

			yield* Effect.promise(function insertTodo() {
				return act(function commitInsert() {
					store.commit(events.todoCreated({ id: 't3', text: 'charlie', completed: false }));
				});
			});
			flushEffects();
			const inserted = result.findAll('li');
			expect(
				inserted.map(function idOf(node) {
					return node.getAttribute('data-id');
				}),
			).toEqual(['t1', 't2', 't3']);
			expect(inserted[0]).toBe(t1);
			expect(inserted[1]).toBe(t2);
			result.unmount();
			flushEffects();
		}).pipe(Effect.scoped, Effect.runPromise);
	});
});
