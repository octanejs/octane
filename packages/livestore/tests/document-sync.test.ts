import { SessionIdSymbol } from '@livestore/common';
import { createTodoMvcStore, events, tables } from '@livestore/framework-toolkit/testing';
import { Effect } from '@livestore/utils/effect';
import { describe, expect, it } from 'vitest';
import { withReactApi } from '../src/useStore';
import { act, flushEffects, mount } from './_helpers';
import {
	ChainedDocumentReader,
	DocumentReader,
	KvDocumentReader,
} from './_fixtures/document-sync.tsrx';

describe('client documents', () => {
	it('resolves IDs and applies value, functional, and external updates reactively', async () => {
		await Effect.gen(function* () {
			const store = withReactApi(yield* createTodoMvcStore());
			let setRow!: (value: any) => void;
			const onSetter = function onSetter(setter: (value: any) => void) {
				setRow = setter;
			};
			const result = mount(DocumentReader, {
				store,
				table: tables.userInfo,
				id: 'u1',
				onSetter,
			});
			flushEffects();
			expect(result.find('#document').getAttribute('data-id')).toBe('u1');
			expect(result.find('#document').textContent).toContain('"username":""');

			yield* Effect.promise(function commitAda() {
				return act(function setAda() {
					setRow({ username: 'Ada' });
				});
			});
			expect(result.find('#document').textContent).toContain('"username":"Ada"');

			yield* Effect.promise(function commitGrace() {
				return act(function setGrace() {
					setRow(function updateUsername(previous: { username: string }) {
						return { ...previous, username: 'Grace' };
					});
				});
			});
			expect(result.find('#document').textContent).toContain('"username":"Grace"');

			yield* Effect.promise(function commitLin() {
				return act(function setLin() {
					store.commit(events.UserInfoSet({ username: 'Lin' }, 'u1'));
				});
			});
			expect(result.find('#document').textContent).toContain('"username":"Lin"');

			result.update(DocumentReader, {
				store,
				table: tables.userInfo,
				id: SessionIdSymbol,
				onSetter,
			});
			expect(result.find('#document').getAttribute('data-id')).toBe(store.sessionId);
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useClientDocument.test.tsx:195
	it('should work for a useClientDocument query chained with a useTemporary query', async () => {
		await Effect.gen(function* () {
			const store = withReactApi(yield* createTodoMvcStore());
			store.commit(
				events.todoCreated({ id: 't1', text: 'buy milk', completed: false }),
				events.todoCreated({ id: 't2', text: 'buy bread', completed: false }),
			);
			let renders = 0;
			const onRender = function onRender() {
				renders += 1;
			};
			const result = mount(ChainedDocumentReader, {
				store,
				userId: 'u1',
				onRender,
			});
			flushEffects();

			yield* Effect.promise(function commitFilter() {
				return act(function setFilter() {
					store.commit(events.UserInfoSet({ username: 'username_u2', text: 'milk' }, 'u2'));
				});
			});
			expect(result.find('#chained').getAttribute('data-count')).toBe('2');
			expect(renders).toBe(1);

			result.update(ChainedDocumentReader, {
				store,
				userId: 'u2',
				onRender,
			});
			flushEffects();
			expect(result.find('#chained').getAttribute('data-count')).toBe('1');
			expect(renders).toBe(2);
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// Per upstream/src/useClientDocument.test.tsx:238
	it('kv client document overwrites value (Schema.Any, no partial merge)', async () => {
		await Effect.gen(function* () {
			const store = withReactApi(yield* createTodoMvcStore());
			let setState!: (value: any) => void;
			let renders = 0;
			const onSetter = function onSetter(setter: (value: any) => void) {
				setState = setter;
			};
			const onRender = function onRender() {
				renders += 1;
			};
			const result = mount(KvDocumentReader, {
				store,
				id: 'k1',
				onSetter,
				onRender,
			});
			flushEffects();
			expect(result.find('#kv').getAttribute('data-id')).toBe('k1');
			expect(result.find('#kv').textContent).toBe('null');
			expect(renders).toBe(1);

			yield* Effect.promise(function writeNumber() {
				return act(function setNumber() {
					setState(1);
				});
			});
			expect(result.find('#kv').textContent).toBe('1');
			expect(renders).toBe(2);

			yield* Effect.promise(function writeObject() {
				return act(function setObject() {
					setState({ b: 2 });
				});
			});
			expect(result.find('#kv').textContent).toBe('{"b":2}');
			expect(renders).toBe(3);
			result.unmount();
		}).pipe(Effect.scoped, Effect.runPromise);
	});
});
