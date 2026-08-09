import { createTodoMvcStore, events, tables } from '@livestore/framework-toolkit/testing';
import { queryDb, signal } from '@livestore/livestore';
import { Effect, Schema } from '@livestore/utils/effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { withReactApi } from '../src/useStore';
import { __resetUseRcResourceCache } from '../src/useRcResource';
import { act, flushEffects, mount, nextPaint } from './_helpers';
import { QueryReader } from './_fixtures/query.tsrx';

beforeEach(() => {
	__resetUseRcResourceCache();
});

const allTodosQuery = () =>
	queryDb({
		query: 'select * from todos order by id',
		schema: Schema.Array(tables.todos.rowSchema),
	});

describe('reactive queries', () => {
	// Per upstream/src/useQuery.test.tsx:24 (simple) and :55 (query identity changes).
	it('returns synchronously, reacts to commits, and switches query identity without stale data', async () => {
		await Effect.gen(function* () {
			const store = yield* createTodoMvcStore();
			const augmented = withReactApi(store);
			const allTodos$ = allTodosQuery();
			const firstTodo$ = queryDb({
				query: "select * from todos where id = 't1'",
				schema: Schema.Array(tables.todos.rowSchema),
			});
			let renders = 0;
			const onRender = () => renders++;
			const result = mount(QueryReader, {
				store: augmented,
				queryable: allTodos$,
				label: 'todos',
				onRender,
			});
			flushEffects();

			expect(result.find('.query').textContent).toBe('[]');
			yield* Effect.promise(() =>
				act(() => store.commit(events.todoCreated({ id: 't1', text: 'milk', completed: false }))),
			);
			void nextPaint();
			expect(result.find('.query').textContent).toContain('"text":"milk"');

			result.update(QueryReader, {
				store: augmented,
				queryable: firstTodo$,
				label: 'first',
				onRender,
			});
			expect(result.find('.query').textContent).toContain('"id":"t1"');

			const renderCount = renders;
			yield* Effect.promise(() =>
				act(() => store.commit(events.todoCreated({ id: 't2', text: 'bread', completed: false }))),
			);
			void nextPaint();
			expect(result.find('.query').textContent).not.toContain('"id":"t2"');
			expect(renders).toBe(renderCount);
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useQuery.test.tsx:101.
	it('filtered dependency query follows signal changes', async () => {
		await Effect.gen(function* () {
			const store = yield* createTodoMvcStore();
			const augmented = withReactApi(store);
			const filter$ = signal('t1', { label: 'id-filter' });
			const filtered$ = queryDb((get) => tables.todos.where('id', get(filter$)), {
				label: 'filtered-todo',
			});
			store.commit(
				events.todoCreated({ id: 't1', text: 'milk', completed: false }),
				events.todoCreated({ id: 't2', text: 'eggs', completed: false }),
			);
			const result = mount(QueryReader, {
				store: augmented,
				queryable: filtered$,
				label: 'filtered',
				onRender: () => {},
			});
			flushEffects();
			expect(result.find('.query').textContent).toContain('milk');
			act(() => store.setSignal(filter$, 't2'));
			yield* Effect.promise(() => nextPaint());
			expect(result.find('.query').textContent).toContain('eggs');
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useQuery.test.tsx:183.
	it('should work with signal', async () => {
		await Effect.gen(function* () {
			const store = yield* createTodoMvcStore();
			const augmented = withReactApi(store);
			const value$ = signal(0);
			const result = mount(QueryReader, {
				store: augmented,
				queryable: value$,
				label: 'signal',
				onRender: () => {},
			});
			flushEffects();
			expect(result.find('.query').textContent).toBe('0');
			act(() => store.setSignal(value$, 1));
			yield* Effect.promise(() => nextPaint());
			expect(result.find('.query').textContent).toBe('1');
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useQuery.test.tsx:198.
	it('supports query builders directly', async () => {
		await Effect.gen(function* () {
			const store = yield* createTodoMvcStore();
			const augmented = withReactApi(store);
			store.commit(
				events.todoCreated({ id: 't1', text: 'milk', completed: false }),
				events.todoCreated({ id: 't2', text: 'eggs', completed: true }),
			);
			const result = mount(QueryReader, {
				store: augmented,
				queryable: tables.todos.where({ completed: false }),
				label: 'builder',
				onRender: () => {},
			});
			flushEffects();
			expect(result.find('.query').textContent).toContain('"id":"t1"');
			expect(result.find('.query').textContent).not.toContain('"id":"t2"');
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useQuery.test.tsx:221.
	it('derives a fresh LiveQuery per Store instance', async () => {
		await Effect.gen(function* () {
			const storeA = yield* createTodoMvcStore();
			const storeB = yield* createTodoMvcStore();
			const queryable = allTodosQuery();
			storeA.commit(events.todoCreated({ id: 't1', text: 'milk', completed: false }));
			const result = mount(QueryReader, {
				store: withReactApi(storeA),
				queryable,
				label: 'store-a',
				onRender: () => {},
			});
			flushEffects();
			expect(result.find('.query').textContent).toContain('"id":"t1"');
			result.update(QueryReader, {
				store: withReactApi(storeB),
				queryable,
				label: 'store-b',
				onRender: () => {},
			});
			expect(result.find('.query').textContent).toBe('[]');
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useQuery.test.tsx:250.
	it('supports a union of different result types', async () => {
		await Effect.gen(function* () {
			const store = withReactApi(yield* createTodoMvcStore());
			const text$ = signal('hello');
			const number$ = signal(123);
			const result = mount(QueryReader, {
				store,
				queryable: text$,
				label: 'text',
				onRender: () => {},
			});
			flushEffects();
			expect(result.find('.query').textContent).toBe('"hello"');
			result.update(QueryReader, {
				store,
				queryable: number$,
				label: 'number',
				onRender: () => {},
			});
			expect(result.find('.query').textContent).toBe('123');
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});
});
