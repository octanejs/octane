import { describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	DataError,
	DataRetiredError,
	DataUncertainError,
	read,
	type Transport,
} from '../src/data/index.js';
import { addTodo, createServer, firstTodo, removeTodo, setDone, todos } from './_data-todos.js';

/** Observe a read and wait for its first value. */
async function observe<T>(handle: { getSnapshot(): { value: T | undefined }; subscribe: any }) {
	const notify = vi.fn();
	const stop = handle.subscribe(notify);
	await vi.waitFor(() => expect(handle.getSnapshot().value).toBeDefined());
	return { notify, stop };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('octane/data store', () => {
	it('does no network work until a read is observed, and shares one load', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(todos, undefined);

		expect(list.getSnapshot().status).toBe('pending');
		expect(list.getSnapshot()).toBe(list.getSnapshot());
		expect(server.log).toEqual([]);

		list.subscribe(() => {});
		store.read(todos, undefined).subscribe(() => {});
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));

		expect(server.log).toEqual(['list']);
		expect(list.getSnapshot().value).toEqual([{ id: 'a', title: 'Tides', done: false }]);
	});

	it('shows a patch in every view at once and settles it in one round trip', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(todos, undefined);
		const first = store.read(firstTodo, undefined);
		await observe(list);
		await observe(first);
		server.log.length = 0;

		const saved = store.write(setDone, { id: 'a', done: true });
		// Same task as the call: no reply has arrived yet.
		expect(list.getSnapshot().value![0].done).toBe(true);
		expect(first.getSnapshot().value!.todo.done).toBe(true);

		await saved;
		await settled();
		// The write's response carried both reads, so neither reloaded.
		expect(server.log).toEqual(['setDone true', 'list', 'first']);
		expect(list.getSnapshot().value![0].done).toBe(true);
		expect(list.getSnapshot().stale).toBe(true);
		expect(list.getSnapshot().refreshing).toBe(false);
	});

	it('uses the operation ID as the new row ID, and removes a row by ID', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(todos, undefined);
		await observe(list);

		const added = store.write(addTodo, { title: 'Night tides' });
		const optimistic = list.getSnapshot().value![1];
		expect(optimistic).toMatchObject({ title: 'Night tides', done: false });
		await added;
		await settled();
		expect(list.getSnapshot().value).toHaveLength(2);
		expect(list.getSnapshot().value![1].id).toBe(optimistic.id);
		expect(server.rows[1].id).toBe(optimistic.id);

		const removed = store.write(removeTodo, { id: 'a' });
		expect(list.getSnapshot().value!.map((todo) => todo.id)).toEqual([optimistic.id]);
		await removed;
		await settled();
		expect(list.getSnapshot().value!.map((todo) => todo.id)).toEqual([optimistic.id]);
	});

	it('removes only the rejected edit and keeps newer server data', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(todos, undefined);
		await observe(list);

		// The row is renamed and then deleted remotely, so the write is refused.
		server.rows[0].title = 'Night tides';
		await list.refresh();
		server.rows.length = 0;
		const saved = store.write(setDone, { id: 'a', done: true });
		expect(list.getSnapshot().value![0]).toMatchObject({ title: 'Night tides', done: true });

		await expect(saved).rejects.toMatchObject({ name: 'DataError', code: 'missing' });
		expect(list.getSnapshot().value![0]).toMatchObject({ title: 'Night tides', done: false });
	});

	it('never validates on the client alone: the server refuses forged input', async () => {
		const server = createServer();
		const reply = await server.transport(
			{ kind: 'write', name: 'todos.setDone', input: { id: 'a', done: 'yes' }, operationId: 'x' },
			new AbortController().signal,
		);
		expect(reply).toMatchObject({ ok: false, code: 'invalid' });
		expect(server.log).toEqual([]);

		const store = createDataStore({ transport: server.transport });
		await expect(store.write(setDone, { id: 'a', done: 'yes' as any })).rejects.toBeInstanceOf(
			DataError,
		);
		expect(server.log).toEqual([]);
	});

	it('keeps an uncertain edit without counting it twice, until its outcome is named', async () => {
		const server = createServer();
		let dropReply = true;
		const transport: Transport = async (request, signal) => {
			const reply = await server.transport(request, signal);
			if (request.kind === 'write' && dropReply) throw new Error('connection reset');
			return reply;
		};
		const store = createDataStore({ transport });
		const list = store.read(todos, undefined);
		await observe(list);

		// The server commits the write; only the reply is lost.
		const error = (await store
			.write(addTodo, { title: 'Night tides' })
			.catch((thrown) => thrown)) as DataUncertainError;
		expect(error).toBeInstanceOf(DataUncertainError);
		expect(server.rows).toHaveLength(2);
		expect(list.getSnapshot().value).toHaveLength(2);

		// A reload that already includes the write shows it once, not twice.
		await list.refresh();
		expect(list.getSnapshot().value).toHaveLength(2);

		store.settle(error.operationId, true);
		await vi.waitFor(() => expect(list.getSnapshot().refreshing).toBe(false));
		expect(list.getSnapshot().value).toHaveLength(2);

		// A write that did not land is removed when a lookup says so.
		dropReply = false;
		const lost: Transport = () => Promise.reject(new Error('offline'));
		const offline = createDataStore({
			transport: (request, signal) =>
				request.kind === 'write' ? lost(request, signal) : server.transport(request, signal),
		});
		const offlineList = offline.read(todos, undefined);
		await observe(offlineList);
		const failed = (await offline
			.write(removeTodo, { id: 'a' })
			.catch((thrown) => thrown)) as DataUncertainError;
		expect(offlineList.getSnapshot().value).toHaveLength(1);
		offline.settle(failed.operationId, false);
		expect(offlineList.getSnapshot().value).toHaveLength(2);
	});

	it('sends writes to one entity in the order they were submitted', async () => {
		const server = createServer();
		let writes = 0;
		const store = createDataStore({
			// The first write is the slowest to reach the server.
			transport: async (request, signal) => {
				if (request.kind === 'write' && writes++ === 0) await new Promise((r) => setTimeout(r, 20));
				return server.transport(request, signal);
			},
		});
		const list = store.read(todos, undefined);
		await observe(list);

		const sent = [true, false].map((done) => store.write(setDone, { id: 'a', done }));
		expect(list.getSnapshot().value![0].done).toBe(false);
		await Promise.all(sent);
		await settled();

		expect(server.log.filter((line) => line.startsWith('setDone'))).toEqual([
			'setDone true',
			'setDone false',
		]);
		expect(server.rows[0].done).toBe(false);
		expect(list.getSnapshot().value![0].done).toBe(false);
	});

	it('keeps a confirmed edit visible until a value that includes it arrives', async () => {
		const server = createServer();
		let release!: () => void;
		let held = false;
		const store = createDataStore({
			transport: async (request, signal) => {
				const reply = await server.transport(request, signal);
				// This service returns no refreshed reads, and its reload is slow.
				if (request.kind === 'write') return { ok: true, value: undefined };
				if (held) await new Promise<void>((resolve) => (release = resolve));
				return reply;
			},
		});
		const list = store.read(todos, undefined);
		await observe(list);
		held = true;

		await store.write(setDone, { id: 'a', done: true });
		expect(list.getSnapshot()).toMatchObject({ refreshing: true });
		expect(list.getSnapshot().value![0].done).toBe(true);

		await vi.waitFor(() => expect(release).toBeDefined());
		release();
		await vi.waitFor(() => expect(list.getSnapshot().refreshing).toBe(false));
		expect(list.getSnapshot().value![0].done).toBe(true);
	});

	it('does not let a superseded reply overwrite a newer value', async () => {
		const server = createServer();
		let releaseFirst!: () => void;
		let reads = 0;
		const store = createDataStore({
			transport: async (request, signal) => {
				const reply = await server.transport(request, signal);
				if (reads++ === 0) await new Promise<void>((resolve) => (releaseFirst = resolve));
				return reply;
			},
		});
		const list = store.read(todos, undefined);
		list.subscribe(() => {});
		await vi.waitFor(() => expect(releaseFirst).toBeDefined());

		server.rows[0].title = 'Night tides';
		await list.refresh();
		expect(list.getSnapshot().value![0].title).toBe('Night tides');

		releaseFirst();
		await settled();
		expect(list.getSnapshot().value![0].title).toBe('Night tides');
	});

	it('serves a fresh value without reloading and keeps a stale one visible while it reloads', async () => {
		vi.useFakeTimers();
		try {
			const server = createServer();
			const fresh = read({ ...todos, name: 'todos.list', fresh: 1_000 } as any) as typeof todos;
			const store = createDataStore({ transport: server.transport });
			const list = store.read(fresh, undefined);
			const stop = list.subscribe(() => {});
			await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
			stop();

			list.subscribe(() => {})();
			expect(server.log).toEqual(['list']);

			vi.advanceTimersByTime(1_000);
			list.subscribe(() => {});
			expect(list.getSnapshot()).toMatchObject({ status: 'ready', refreshing: true });
			expect(list.getSnapshot().value).toHaveLength(1);
			await vi.waitFor(() => expect(list.getSnapshot().refreshing).toBe(false));
			expect(server.log).toEqual(['list', 'list']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses work for a retired account and ignores its late replies', async () => {
		const server = createServer();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const store = createDataStore({
			transport: async (request, signal) => {
				await gate;
				return server.transport(request, signal);
			},
		});
		const list = store.read(todos, undefined);
		const notify = vi.fn();
		list.subscribe(notify);

		// A callback that began under this account still holds this store.
		const lateInvalidate = () => store.invalidate(['todo']);
		store.retire();
		release();
		await settled();

		expect(list.getSnapshot().status).toBe('pending');
		expect(lateInvalidate).toThrow(DataRetiredError);
		expect(() => store.read(todos, undefined)).toThrow(DataRetiredError);
		expect(() => store.write(setDone, { id: 'a', done: true })).toThrow(DataRetiredError);
	});

	it('rejects a request from another origin', async () => {
		const server = createServer();
		const response = await server.handler(
			new Request('https://app.test/data', {
				method: 'POST',
				headers: { origin: 'https://evil.test' },
				body: '[]',
			}),
		);
		expect(response.status).toBe(403);
		expect(server.log).toEqual([]);
	});
});
