import { describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	DataError,
	DataRetiredError,
	DataUncertainError,
	httpTransport,
	read,
	write,
	type Transport,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';
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

	it('lands an unobserved load even when retention is short, and reloads cleanly after eviction', async () => {
		const server = createServer();
		const brief = read({ ...todos, keep: 5 } as any) as typeof todos;
		const store = createDataStore({
			transport: async (request, signal) => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				// Like fetch, this transport fails a request whose signal was aborted.
				signal.throwIfAborted();
				return server.transport(request, signal);
			},
		});
		const list = store.read(brief, undefined);

		await store.prefetch(brief, undefined);
		expect(list.getSnapshot()).toMatchObject({ status: 'ready', error: undefined });

		// Retention ends, the entry is dropped, and observing it again starts a clean load.
		await new Promise((resolve) => setTimeout(resolve, 20));
		list.subscribe(() => {});
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		expect(list.getSnapshot().error).toBeUndefined();
	});

	it('stops showing a value to a mounted reader once it expires', async () => {
		vi.useFakeTimers();
		try {
			const server = createServer();
			const shortLived = read({ ...todos, fresh: 10_000, expire: 1_000 } as any) as typeof todos;
			const store = createDataStore({ transport: server.transport });
			const list = store.read(shortLived, undefined);
			const notify = vi.fn();
			list.subscribe(notify);
			await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
			notify.mockClear();

			vi.advanceTimersByTime(1_000);
			expect(list.getSnapshot()).toMatchObject({ status: 'pending', value: undefined });
			expect(notify).toHaveBeenCalled();
			await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
			expect(server.log).toEqual(['list', 'list']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('reloads for the next reader after a value expired or was evicted unobserved', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const options = { ...todos, fresh: 10_000 };
		const cases = [
			read({ ...options, name: 'todos.list', expire: 10 } as any) as typeof todos,
			read({ ...options, name: 'todos.list', keep: 5, expire: 30 } as any) as typeof todos,
		];
		for (const [index, contract] of cases.entries()) {
			const list = store.read(contract, { case: index } as any);
			await store.prefetch(contract, { case: index } as any);
			expect(list.getSnapshot().status).toBe('ready');
			server.log.length = 0;

			await new Promise((resolve) => setTimeout(resolve, 40));
			expect(list.getSnapshot().value).toBeUndefined();
			list.subscribe(() => {});
			await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
			expect(server.log).toContain('list');
		}
	});

	it('restarts a first load that may predate a write which only names tags', async () => {
		const server = createServer();
		const reindex = write({
			name: 'todos.setDone',
			input: { '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) } },
			invalidates: ['todo'],
		});
		const releases: Array<() => void> = [];
		const store = createDataStore({
			transport: async (request, signal) => {
				const reply = await server.transport(request, signal);
				if (request.kind === 'read') await new Promise<void>((resolve) => releases.push(resolve));
				return reply;
			},
		});
		const list = store.read(todos, undefined);
		list.subscribe(() => {});
		await vi.waitFor(() => expect(releases).toHaveLength(1));

		// The first load read `done: false`; the write lands before that reply is delivered.
		await store.write(reindex, { id: 'a', done: true });
		await vi.waitFor(() => expect(releases).toHaveLength(2));
		for (const release of releases) release();
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		expect(list.getSnapshot().value![0].done).toBe(true);
	});

	it('does not restart an unrelated first load when a write confirms', async () => {
		const server = createServer();
		const settings = read({
			name: 'settings',
			output: { '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) } },
		});
		let settingsLoads = 0;
		let release!: () => void;
		const store = createDataStore({
			transport: async (request, signal) => {
				if (request.name !== 'settings') return server.transport(request, signal);
				settingsLoads++;
				await new Promise<void>((resolve) => (release = resolve));
				return { ok: true, value: { theme: 'dark' } };
			},
		});
		const list = store.read(todos, undefined);
		await observe(list);
		const page = store.read(settings, undefined);
		page.subscribe(() => {});

		await store.write(setDone, { id: 'a', done: true });
		await settled();
		release();
		await vi.waitFor(() => expect(page.getSnapshot().status).toBe('ready'));
		expect(settingsLoads).toBe(1);
	});

	it("sends the caller's input, so a schema that transforms it validates on the server too", async () => {
		const received: unknown[] = [];
		const rename = write({
			name: 'rename',
			// Accepts a string and produces a number; its own output would be refused.
			input: {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate: (value) =>
						typeof value === 'string'
							? { value: Number(value) }
							: { issues: [{ message: 'expected a string' }] },
				},
			},
		});
		const handler = createDataHandler({}, (handle) => [
			handle(rename, (input) => void received.push(input)),
		]);
		const store = createDataStore({
			transport: httpTransport('https://app.test/data', {
				fetch: (url, init) => handler(new Request(url as string, init)),
			}),
		});

		await store.write(rename, '42' as any);
		expect(received).toEqual([42]);
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
		// A render still holding the retired store sees nothing and starts nothing.
		const stale = store.read(todos, undefined);
		stale.subscribe(() => {});
		expect(stale.getSnapshot().status).toBe('pending');
		await settled();
		// Only the load that started before retirement reached the server.
		expect(server.log).toEqual(['list']);
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

describe('octane/data server render and hydration', () => {
	const page = new Request('https://app.test/');

	/** Render on the server: load in process, render for `elapsed` ms, then hand the client its seed. */
	async function serverRender(
		server: ReturnType<typeof createServer>,
		contract = todos,
		elapsed = 0,
	) {
		const store = createDataStore({ transport: server.handler.transport(page) });
		await store.prefetch(contract, undefined);
		if (elapsed) vi.advanceTimersByTime(elapsed);
		const seed = store.dehydrate();
		store.retire();
		return seed;
	}

	it('loads in process on the server, and hydrates without waiting or loading again', async () => {
		const server = createServer();
		const seed = await serverRender(server);
		expect(server.log).toEqual(['list']);

		const client = createDataStore({ transport: server.transport, seed });
		const list = client.read(todos, undefined);
		// The first render reads the server's value synchronously.
		expect(list.getSnapshot()).toMatchObject({ status: 'ready', value: [{ title: 'Tides' }] });
		list.subscribe(() => {});
		await settled();
		expect(server.log).toEqual(['list']);

		// The adopted value is ordinary state: edits apply over it.
		const saved = client.write(setDone, { id: 'a', done: true });
		expect(list.getSnapshot().value![0].done).toBe(true);
		await saved;
	});

	it('runs the same validation in process as over HTTP', async () => {
		const server = createServer();
		const transport = server.handler.transport(page);
		const reply = await transport(
			{ kind: 'write', name: 'todos.setDone', input: { id: 'a', done: 'yes' }, operationId: 'x' },
			new AbortController().signal,
		);
		expect(reply).toMatchObject({ ok: false, code: 'invalid' });
		expect(server.log).toEqual([]);
	});

	it("keeps the server value's age, so freshness and expiry count from the server load", async () => {
		vi.useFakeTimers();
		try {
			const server = createServer();
			const timed = read({ ...todos, fresh: 1_000, expire: 3_000 } as any) as typeof todos;
			// The rest of the page took 600 ms to render after the value loaded.
			const seed = await serverRender(server, timed, 600);
			const client = createDataStore({ transport: server.transport, seed });
			const list = client.read(timed, undefined);
			list.subscribe(() => {})();
			expect(list.getSnapshot()).toMatchObject({ status: 'ready', stale: false });

			vi.advanceTimersByTime(400);
			expect(list.getSnapshot().stale).toBe(false);
			// Snapshots are cached between changes; the next observer sees its age.
			const stop = list.subscribe(() => {});
			expect(list.getSnapshot()).toMatchObject({ status: 'ready', refreshing: true });
			stop();

			// Expiry fires 3 s after the server load, not 3 s after hydration.
			vi.advanceTimersByTime(2_000);
			expect(list.getSnapshot().status).toBe('pending');
		} finally {
			vi.useRealTimers();
		}
	});

	it('loads normally when a value expired during the render or no longer matches the schema', async () => {
		vi.useFakeTimers();
		try {
			const server = createServer();
			const timed = read({ ...todos, expire: 500 } as any) as typeof todos;
			const seed = await serverRender(server, timed, 500);
			const expired = createDataStore({ transport: server.transport, seed });
			expect(expired.read(timed, undefined).getSnapshot().status).toBe('pending');
		} finally {
			vi.useRealTimers();
		}

		// The client is a newer build whose schema refuses the value the server sent.
		const server = createServer();
		const seed = await serverRender(server);
		const stricter = read({
			...todos,
			output: {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate: () => ({ issues: [{ message: 'needs a revision' }] }),
				},
			},
		} as any) as typeof todos;
		const client = createDataStore({ transport: server.transport, seed });
		const list = client.read(stricter, undefined);
		expect(list.getSnapshot().status).toBe('pending');
	});

	it('writes a seed that cannot close the script element it is embedded in', async () => {
		const server = createServer();
		server.rows[0].title = '</script><script>alert(1)</script>';
		const seed = await serverRender(server);
		expect(seed).not.toContain('<');

		const client = createDataStore({ transport: server.transport, seed });
		expect(client.read(todos, undefined).getSnapshot().value![0].title).toBe(
			'</script><script>alert(1)</script>',
		);
	});
});
