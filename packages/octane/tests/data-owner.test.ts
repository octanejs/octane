/**
 * One owner for several replicas, as one SharedWorker serves several tabs.
 * Every tab sees the same values, the same pending edits and the same
 * rollbacks, and the owner makes each request and holds each feed once.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDataOwner,
	createReplica,
	DataRetiredError,
	DataUncertainError,
	listen,
	serveDataOwner,
	sharedOwner,
	type DataOwner,
	type DataStore,
	type FeedFrame,
	type Listener,
	type ReadHandle,
	type Transport,
} from '../src/data/index.js';
import {
	addTodo,
	createServer,
	removeTodo,
	setDone,
	todoChanges,
	todoPages,
	todos,
	type TodoItem,
} from './_data-todos.js';

const closers: Array<() => void> = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
});

const writes = [addTodo, setDone, removeTodo];

/** An owner over `transport`, and `count` replicas connected to it by message channels. */
function tabs(transport: Transport, count: number, feedListener?: Listener): DataStore[] {
	const owner = createDataOwner({ transport, listen: feedListener });
	return Array.from({ length: count }, () => {
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		const store = createReplica(channel.port2, { writes });
		closers.push(() => {
			void store.retire();
			channel.port1.close();
			channel.port2.close();
		});
		return store;
	});
}

async function observed<T>(handle: ReadHandle<T>): Promise<() => T> {
	closers.push(handle.subscribe(() => {}));
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return () => handle.getSnapshot().value!;
}

const done = (list: () => TodoItem[]) => list()[0]!.done;
const writeCount = (log: string[]) => log.filter((entry) => entry.startsWith('setDone')).length;

describe('octane/data owner and replicas', () => {
	it('makes one request for a read two tabs load at once, and shows one tab’s reload in the other', async () => {
		const server = createServer();
		// A little latency, so the second tab asks while the first tab's read is in flight.
		const [first, second] = tabs(async (request, signal) => {
			await new Promise((resolve) => setTimeout(resolve, 30));
			return server.transport(request, signal);
		}, 2);
		const [one, two] = await Promise.all([
			observed(first!.read(todos, undefined)),
			observed(second!.read(todos, undefined)),
		]);
		expect(server.log).toEqual(['list']);

		server.rows[0]!.title = 'Atoll';
		await first!.read(todos, undefined).refresh();
		expect(one()[0]!.title).toBe('Atoll');
		await vi.waitFor(() => expect(two()[0]!.title).toBe('Atoll'));
		expect(server.log).toEqual(['list', 'list']);
	});

	it.each([
		['read', todos, 0],
		['view', todoPages, 0],
		['read after many writes', todos, 600],
	] as const)(
		'reloads a %s with a new request even while an older one is in flight, and keeps the newer value',
		async (_, read, writes) => {
			const server = createServer();
			const held: Array<() => void> = [];
			let hold = false;
			const [first, second] = tabs(async (request, signal) => {
				// The server answers now, as of now; the reply reaches the tab when released.
				const reply = await server.transport(request, signal);
				if (hold) await new Promise<void>((resolve) => held.push(resolve));
				return reply;
			}, 2);
			const one = await observed(first!.read(read as typeof todos, undefined));
			const two = await observed(second!.read(read as typeof todos, undefined));
			// Writes do not push the read out of what the tab remembers asking for.
			for (let index = 0; index < writes; index++) {
				await second!.write(setDone, { id: `x${index}`, done: true }).catch(() => {});
			}

			hold = true;
			const older = first!.read(read as typeof todos, undefined).refresh();
			await vi.waitFor(() => expect(held).toHaveLength(1));
			server.rows[0]!.title = 'Atoll';
			// The second tab reloads after the change, so the first tab's request cannot answer it.
			const newer = second!.read(read as typeof todos, undefined).refresh();
			await vi.waitFor(() => expect(held).toHaveLength(2));
			held[1]!();
			await newer;
			expect(two()[0]!.title).toBe('Atoll');
			held[0]!();
			await older;
			await new Promise((resolve) => setTimeout(resolve, 20));
			// The older reply, finishing last, does not take the second tab back.
			expect(two()[0]!.title).toBe('Atoll');
			expect(one()[0]!.title).toBe('Tides');
		},
	);

	it('holds an edit to a record another tab is creating until the create is settled', async () => {
		const server = createServer();
		let release!: () => void;
		const [first, second] = tabs(async (request, signal) => {
			if (request.name === addTodo.name) {
				await new Promise<void>((resolve) => (release = resolve));
				return { ok: false, code: 'full' };
			}
			return server.transport(request, signal);
		}, 2);
		await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const added = first!.write(addTodo, { title: 'Reef' }).catch((error) => error);
		await vi.waitFor(() => expect(two()).toHaveLength(2));
		const edited = second!.write(setDone, { id: two()[1]!.id, done: true }).catch((error) => error);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(writeCount(server.log)).toBe(0);
		release();
		expect(((await added) as { code: string }).code).toBe('full');
		await edited;
		// The create was refused, so the edit to its record is never sent.
		expect(writeCount(server.log)).toBe(0);
		await vi.waitFor(() => expect(two()).toHaveLength(1));
	});

	it('shows a write from one tab in the other before its reply, and the same rollback when it is refused', async () => {
		const server = createServer();
		let release!: () => void;
		let refuse = true;
		const [first, second] = tabs(async (request, signal) => {
			if (request.kind === 'write') {
				await new Promise<void>((resolve) => (release = resolve));
				if (refuse) return { ok: false, code: 'missing' };
			}
			return server.transport(request, signal);
		}, 2);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const refused = first!.write(setDone, { id: 'a', done: true }).catch((error) => error);
		expect(done(one)).toBe(true);
		await vi.waitFor(() => expect(done(two)).toBe(true));
		release();
		expect(((await refused) as { code: string }).code).toBe('missing');
		expect(done(one)).toBe(false);
		await vi.waitFor(() => expect(done(two)).toBe(false));

		refuse = false;
		const saved = first!.write(setDone, { id: 'a', done: true });
		await vi.waitFor(() => expect(done(two)).toBe(true));
		release();
		await saved;
		await vi.waitFor(() => expect(server.rows[0]!.done).toBe(true));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(done(two)).toBe(true);
		// The tab that showed it never sent it.
		expect(writeCount(server.log)).toBe(1);
	});

	it('settles an uncertain write in every tab once one tab learns its outcome', async () => {
		const server = createServer();
		const [first, second] = tabs(async (request, signal) => {
			if (request.kind === 'write') throw new Error('connection reset');
			return server.transport(request, signal);
		}, 2);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const error = (await first!
			.write(setDone, { id: 'a', done: true })
			.catch((reason: unknown) => reason)) as DataUncertainError;
		expect(error).toBeInstanceOf(DataUncertainError);
		await vi.waitFor(() => expect(done(two)).toBe(true));

		// A receipt says it never arrived.
		first!.settle(error.operationId, false);
		expect(done(one)).toBe(false);
		await vi.waitFor(() => expect(done(two)).toBe(false));
	});

	it('holds one feed connection for every tab, and closes it when the last tab stops listening', async () => {
		const server = createServer();
		const connections: Array<{ signal: AbortSignal; send(frame: FeedFrame): void }> = [];
		const feedListener: Listener = (_request, signal) => ({
			async *[Symbol.asyncIterator]() {
				const queue: FeedFrame[] = [{}];
				let wake = () => {};
				connections.push({ signal, send: (frame) => (queue.push(frame), wake()) });
				signal.addEventListener('abort', () => wake(), { once: true });
				while (!signal.aborted) {
					if (queue.length > 0) yield queue.shift()!;
					else await new Promise<void>((resolve) => (wake = resolve));
				}
			},
		});
		const [first, second] = tabs(server.transport, 2, feedListener);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));
		const stopFirst = listen(first!, todoChanges).subscribe(() => {});
		const stopSecond = listen(second!, todoChanges).subscribe(() => {});
		await vi.waitFor(() => expect(listen(second!, todoChanges).getSnapshot().status).toBe('live'));
		expect(connections).toHaveLength(1);

		connections[0]!.send({ event: { id: 'a', title: 'Atoll', done: false } });
		await vi.waitFor(() => expect(one()[0]!.title).toBe('Atoll'));
		await vi.waitFor(() => expect(two()[0]!.title).toBe('Atoll'));

		stopFirst();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(connections[0]!.signal.aborted).toBe(false);
		stopSecond();
		await vi.waitFor(() => expect(connections[0]!.signal.aborted).toBe(true));
	});
});

/**
 * Fencing owners behind a stand-in SharedWorker: one owner per worker name, as
 * the browser keeps one worker per name, each recording the origin's account in
 * IndexedDB. Returns a function that opens a tab's replica for an account.
 */
function sharedWorkers(transport: Transport) {
	const owners = new Map<string, DataOwner>();
	vi.stubGlobal(
		'SharedWorker',
		class {
			port: MessagePort;
			constructor(_url: string, { name }: { name: string }) {
				let owner = owners.get(name);
				if (!owner) owners.set(name, (owner = createDataOwner({ transport, fence: true })));
				const channel = new MessageChannel();
				owner.connect(channel.port1);
				this.port = channel.port2;
				closers.push(() => (channel.port1.close(), channel.port2.close()));
			}
		},
	);
	return (account: string) => createReplica(sharedOwner(account)!, { writes });
}

async function accountStore<T>(
	mode: IDBTransactionMode,
	use: (store: IDBObjectStore) => IDBRequest<T>,
) {
	const opening = indexedDB.open('octane-data-account', 1);
	const database = await new Promise<IDBDatabase>(
		(resolve) => (opening.onsuccess = () => resolve(opening.result)),
	);
	const request = use(database.transaction('account', mode).objectStore('account'));
	const value = await new Promise<T>(
		(resolve) => (request.onsuccess = () => resolve(request.result)),
	);
	database.close();
	return value;
}
const recordedAccount = () => accountStore('readonly', (store) => store.get(0));
const recordAccount = (value: object) => accountStore('readwrite', (store) => store.put(value, 0));

describe('octane/data in a SharedWorker', () => {
	beforeEach(() => {
		globalThis.indexedDB = new IDBFactory();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('serves each tab that connects to the worker', async () => {
		const server = createServer();
		serveDataOwner({ transport: server.transport });
		vi.stubGlobal(
			'SharedWorker',
			class {
				port: MessagePort;
				constructor() {
					const channel = new MessageChannel();
					globalThis.dispatchEvent(new MessageEvent('connect', { ports: [channel.port1] }));
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		const store = createReplica(sharedOwner('ada')!, { writes });
		const list = await observed(store.read(todos, undefined));
		expect(list()[0]!.title).toBe('Tides');
		expect(server.log).toEqual(['list']);
	});

	it('retires every tab of an account once another account signs in', async () => {
		const server = createServer();
		let release!: () => void;
		const open = sharedWorkers(async (request, signal) => {
			if (request.kind === 'write') await new Promise<void>((resolve) => (release = resolve));
			return server.transport(request, signal);
		});
		const [first, second] = [open('ada'), open('ada')];
		const one = first.read(todos, undefined);
		await observed(one);
		await observed(second.read(todos, undefined));
		const pending = first.write(setDone, { id: 'a', done: true }).catch((error: unknown) => error);
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));

		const other = open('grace');
		await observed(other.read(todos, undefined));
		await vi.waitFor(() => expect([first.retired, second.retired]).toEqual([true, true]));
		expect(one.getSnapshot().status).toBe('pending');
		// The write's reply, arriving after the sign-in, reaches no tab of the old account.
		release();
		expect(await pending).toBeInstanceOf(DataRetiredError);
		expect(other.retired).toBe(false);
		expect(await recordedAccount()).toEqual({ account: 'grace', generation: 2 });
	});

	it('signs the account out in every tab, and records it', async () => {
		const server = createServer();
		const open = sharedWorkers(server.transport);
		const [first, second] = [open('ada'), open('ada')];
		await observed(second.read(todos, undefined));
		await first.retire();
		await vi.waitFor(() => expect(second.retired).toBe(true));
		expect(await recordedAccount()).toEqual({ account: null, generation: 2 });

		// Signing in again starts a new generation, served by the same worker.
		const again = open('ada');
		await observed(again.read(todos, undefined));
		expect(await recordedAccount()).toEqual({ account: 'ada', generation: 3 });
	});

	it('never lets a late sign-out undo a newer sign-in', async () => {
		const server = createServer();
		const open = sharedWorkers(server.transport);
		const old = open('ada');
		await observed(old.read(todos, undefined));
		// Another account signed in, and its announcement has not reached this owner yet.
		await recordAccount({ account: 'grace', generation: 2 });
		await old.retire();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(await recordedAccount()).toEqual({ account: 'grace', generation: 2 });
	});

	it('shows nothing in a tab resuming from being frozen until its account is confirmed', async () => {
		const server = createServer();
		const open = sharedWorkers(server.transport);
		const tab = open('ada');
		const list = tab.read(todos, undefined);
		await observed(list);

		document.dispatchEvent(new Event('freeze'));
		expect(list.getSnapshot().status).toBe('pending');
		document.dispatchEvent(new Event('resume'));
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		// Confirmed, not reloaded.
		expect(server.log).toEqual(['list']);

		document.dispatchEvent(new Event('freeze'));
		await observed(open('grace').read(todos, undefined));
		document.dispatchEvent(new Event('resume'));
		await vi.waitFor(() => expect(tab.retired).toBe(true));
		expect(list.getSnapshot().status).toBe('pending');
	});

	it('asks the owner again until it confirms a sign-out', async () => {
		vi.useFakeTimers();
		try {
			const channel = new MessageChannel();
			const received: string[] = [];
			channel.port1.onmessage = ({ data }) => received.push(data.t);
			closers.push(() => (channel.port1.close(), channel.port2.close()));
			const store = createReplica(channel.port2, { writes });
			void store.retire();
			await vi.advanceTimersByTimeAsync(0);
			expect(received).toEqual(['retire']);
			await vi.advanceTimersByTimeAsync(5_000);
			expect(received).toEqual(['retire', 'retire']);
			channel.port1.postMessage({ t: 'retired' });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(received).toEqual(['retire', 'retire']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('connects a tab to the worker named for its protocol and partition, or reports that it cannot', () => {
		expect(sharedOwner('ada')).toBeNull();
		const constructed: unknown[] = [];
		const port = new MessageChannel().port1;
		vi.stubGlobal(
			'SharedWorker',
			class {
				port = port;
				constructor(...args: unknown[]) {
					constructed.push(args);
				}
			},
		);
		try {
			expect(sharedOwner('ada')).toBe(port);
			expect(constructed).toEqual([
				['/_octane/data-worker.js', { type: 'module', name: 'octane-data:1:ada' }],
			]);
			vi.stubGlobal(
				'SharedWorker',
				class {
					constructor() {
						throw new DOMException('blocked', 'SecurityError');
					}
				},
			);
			expect(sharedOwner('ada')).toBeNull();
		} finally {
			vi.unstubAllGlobals();
			port.close();
		}
	});
});
