/**
 * One owner for several replicas, as one SharedWorker serves several tabs.
 * Every tab sees the same values, the same pending edits and the same
 * rollbacks, and the owner makes each request and holds each feed once.
 */
import * as devalue from 'devalue';
import { IDBFactory } from 'fake-indexeddb';
import { postHostTask } from '../src/host-task.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	contractIdentity,
	createDataOwner,
	createDataStore,
	createReplica,
	DataRetiredError,
	DataUncertainError,
	listen,
	memoryStorage,
	read,
	serveDataOwner,
	sharedOwner,
	feed,
	write,
	type DataOwner,
	type DataReply,
	type DataStore,
	type FeedFrame,
	type Listener,
	type OwnerPort,
	type PersistOptions,
	type ReadHandle,
	type StandardSchema,
	type Transport,
} from '../src/data/index.js';
import {
	addTodo,
	createServer,
	removeTodo,
	setDone,
	todoChanges,
	Todo,
	todoPages,
	todos,
	type TodoItem,
} from './_data-todos.js';

const closers: Array<() => void> = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
});

/** Every contract the tabs use: a tab of a build with other contracts is refused. */
const contracts = [todos, todoPages, addTodo, setDone, removeTodo, todoChanges];
/** A tab falls back to its own transport only when it cannot share: here, that would be a bug. */
const unshared: Transport = () => Promise.reject(new Error('this tab did not share its owner'));
const unsharedListener: Listener = () => {
	throw new Error('this tab did not share its owner');
};
const replicaOptions = { transport: unshared, listen: unsharedListener, contracts };

/**
 * An owner over `transport`, and `count` replicas connected to it by message
 * channels. With `persist`, the owner keeps the account's cache there.
 */
function tabs(
	transport: Transport,
	count: number,
	feedListener?: Listener,
	persist?: PersistOptions,
): DataStore[] {
	const owner = createDataOwner({
		transport,
		listen: feedListener,
		persist: persist && (() => persist),
	});
	return Array.from({ length: count }, () => {
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		const store = createReplica(channel.port2, { ...replicaOptions, persist });
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
			// The owner saves every tab's values in one cache, which counts the values it has committed.
			const storage = memoryStorage();
			let committed = 0;
			const cache: PersistOptions = {
				partition: 'ada',
				key: 'a session secret of at least sixteen bytes',
				storage: {
					...storage,
					async commit(partition, put, remove) {
						await storage.commit(partition, put, remove);
						if (put.some((item) => item.value !== undefined)) committed++;
					},
				},
			};
			const [first, second] = tabs(
				async (request, signal) => {
					// The server answers now, as of now; the reply reaches the tab when released.
					const reply = await server.transport(request, signal);
					if (hold) await new Promise<void>((resolve) => held.push(resolve));
					return reply;
				},
				2,
				undefined,
				cache,
			);
			/** What a store starting from the cache, with no network, shows for the read. */
			const restored = async () => {
				const offline = createDataStore({ transport: () => new Promise(() => {}), persist: cache });
				const handle = offline.read(read as typeof todos, undefined);
				closers.push(handle.subscribe(() => {}));
				await vi.waitFor(() => expect(handle.getSnapshot().value).toBeDefined());
				return handle.getSnapshot().value!;
			};
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
			const before = committed;
			held[1]!();
			await newer;
			expect(two()[0]!.title).toBe('Atoll');
			await vi.waitFor(() => expect(committed).toBeGreaterThan(before));
			expect((await restored())[0]!.title).toBe('Atoll');
			held[0]!();
			await older;
			await new Promise((resolve) => setTimeout(resolve, 50));
			// The older reply, finishing last, does not take the second tab back.
			expect(two()[0]!.title).toBe('Atoll');
			expect(one()[0]!.title).toBe('Tides');
			// Nor does it take the cache back: the next session starts from the newer value.
			expect((await restored())[0]!.title).toBe('Atoll');

			// The first tab is not left behind: what it reloads next is the newest, and is saved.
			hold = false;
			server.rows[0]!.title = 'Reef';
			const saved = committed;
			await first!.read(read as typeof todos, undefined).refresh();
			await vi.waitFor(() => expect(committed).toBeGreaterThan(saved));
			expect((await restored())[0]!.title).toBe('Reef');
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

	describe('a tab opened from a server render', () => {
		/** The todo list, fresh for a minute, so a seeded or loaded value is shown without loading. */
		const list = read({
			name: todos.name,
			output: todos.output,
			entities: (todos) => Todo.from(todos),
			fresh: 60_000,
		});
		const options = { ...replicaOptions, contracts: [...contracts, list] };
		/** A page's seed: the server render's todo list, loaded `age` milliseconds before it. */
		const seedOf = (title: string, age: number, cursor?: string) =>
			devalue.stringify({
				reads: [
					{ name: list.name, input: undefined, age, value: [{ id: 'a', title, done: false }] },
				],
				cursors: cursor === undefined ? [] : [[todoChanges.name + '\nundefined', cursor]],
			});
		function connect(owner: DataOwner, seed?: string) {
			const channel = new MessageChannel();
			owner.connect(channel.port1);
			const store = createReplica(channel.port2, { ...options, seed });
			closers.push(() => {
				void store.retire();
				channel.port1.close();
				channel.port2.close();
			});
			return store;
		}

		it.each([
			['newer than', 'Lagoon', 0, ['Lagoon', 'Lagoon']],
			['older than', 'Tides', 30_000, ['Atoll', 'Atoll']],
		] as const)(
			'shows in every tab the newer of its seed and what another tab loaded, without loading: a seed %s the load',
			async (_, title, age, shown) => {
				const server = createServer();
				server.rows[0]!.title = 'Atoll';
				const owner = createDataOwner({ transport: server.transport });
				const one = await observed(connect(owner).read(list));
				await new Promise((resolve) => setTimeout(resolve, 5));
				const two = await observed(connect(owner, seedOf(title, age)).read(list));
				await vi.waitFor(() => expect([one()[0]!.title, two()[0]!.title]).toEqual(shown));
				expect(server.log).toEqual(['list']);
			},
		);

		it.each([
			['stands at another position', { cursor: 'after-render' }],
			['has no position yet', {}],
		] as const)(
			'reloads what a feed covers when its seed stood elsewhere than the connection it joins, which %s',
			async (_, frame) => {
				const server = createServer();
				const feedListener: Listener = () => ({
					async *[Symbol.asyncIterator]() {
						yield frame;
						await new Promise(() => {});
					},
				});
				const owner = createDataOwner({ transport: server.transport, listen: feedListener });
				const first = connect(owner);
				await observed(first.read(list));
				closers.push(listen(first, todoChanges).subscribe(() => {}));
				await vi.waitFor(() =>
					expect(listen(first, todoChanges).getSnapshot().status).toBe('live'),
				);

				// The server render read its position before the connection's latest event.
				server.rows[0]!.title = 'Atoll';
				const second = connect(owner, seedOf('Tides', 0, 'before-render'));
				const two = await observed(second.read(list));
				closers.push(listen(second, todoChanges).subscribe(() => {}));
				await vi.waitFor(() => expect(two()[0]!.title).toBe('Atoll'));
			},
		);

		/** A tab whose owner the test plays: it serves the tab, and answers each read with `answer()`. */
		function playedOwner(
			answer: () => unknown,
			list2: Parameters<typeof createReplica>[1]['contracts'],
			seed?: string,
		) {
			const channel = new MessageChannel();
			channel.port1.onmessage = ({ data }) => {
				if (data.t === 'hello') channel.port1.postMessage({ t: 'live' });
				if (data.t === 'request')
					channel.port1.postMessage({
						t: 'reply',
						id: data.id,
						reply: { ok: true, value: answer() },
					});
			};
			const store = createReplica(channel.port2, { ...options, contracts: list2, seed });
			closers.push(() => {
				void store.retire();
				channel.port1.close();
				channel.port2.close();
			});
			return { store, post: (message: object) => channel.port1.postMessage(message) };
		}
		const titled = (title: string) => [{ id: 'a', title, done: false }];

		it("takes a value from an owner of an older build, which doesn't say when it was read", async () => {
			const { store, post } = playedOwner(() => [], [...contracts, list], seedOf('Tides', 0));
			const shown = await observed(store.read(list));
			post({ t: 'value', name: list.name, input: undefined, value: titled('Atoll') });
			await vi.waitFor(() => expect(shown()[0]!.title).toBe('Atoll'));
			expect(store.read(list).getSnapshot().status).toBe('ready');
		});

		it('keeps the newer of two values whose validation overlaps', async () => {
			// An output schema that answers a moment later, as an async validator does.
			const output: StandardSchema<unknown, TodoItem[]> = {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate: (value) =>
						new Promise((resolve) => setTimeout(() => resolve({ value: value as TodoItem[] }), 10)),
				},
			};
			const slow = read({ name: 'todos.slow', output });
			const { store, post } = playedOwner(() => titled('Tides'), [...contracts, slow]);
			const shown = await observed(store.read(slow));
			const loaded = Date.now();
			await new Promise((resolve) => setTimeout(resolve, 30));
			// The newer offer is validated first; the older value lands after it.
			post({
				t: 'offer',
				name: slow.name,
				input: undefined,
				value: titled('Lagoon'),
				at: loaded + 15,
			});
			post({
				t: 'value',
				name: slow.name,
				input: undefined,
				value: titled('Atoll'),
				at: loaded + 5,
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(shown()[0]!.title).toBe('Lagoon');
		});

		/** The server's transport, holding each list reply, read when it was asked, until released. */
		function held(server: ReturnType<typeof createServer>) {
			const waiting: Array<() => void> = [];
			const transport: Transport = async (request, signal) => {
				const reply = await server.transport(request, signal);
				if (request.name === list.name) await new Promise<void>((go) => waiting.push(go));
				return reply;
			};
			return { transport, release: () => waiting.splice(0).forEach((go) => go()) };
		}

		it('shows a newer seed in a tab that was loading, once its older load lands', async () => {
			const server = createServer();
			server.rows[0]!.title = 'Atoll';
			const { transport, release } = held(server);
			const owner = createDataOwner({ transport });
			const first = connect(owner);
			const reading = first.read(list);
			closers.push(reading.subscribe(() => {}));
			await vi.waitFor(() => expect(server.log).toEqual(['list']));
			// The page was rendered after that load started, with a newer title.
			await new Promise((resolve) => setTimeout(resolve, 5));
			const two = await observed(connect(owner, seedOf('Lagoon', 0)).read(list));
			// The offer reaches the first tab while its load is still held.
			await new Promise((resolve) => setTimeout(resolve, 20));
			release();
			await vi.waitFor(() => expect(reading.getSnapshot().value?.[0]!.title).toBe('Lagoon'));
			expect(two()[0]!.title).toBe('Lagoon');
		});

		it('reloads a seeded read after a feed gap without joining an older request in flight', async () => {
			const server = createServer();
			const feedListener: Listener = () => ({
				async *[Symbol.asyncIterator]() {
					yield { cursor: 'after-render' };
					await new Promise(() => {});
				},
			});
			const { transport, release } = held(server);
			const owner = createDataOwner({ transport, listen: feedListener });
			const first = connect(owner);
			const reading = first.read(list);
			closers.push(reading.subscribe(() => {}));
			await vi.waitFor(() => expect(server.log).toEqual(['list']));
			closers.push(listen(first, todoChanges).subscribe(() => {}));
			await vi.waitFor(() => expect(listen(first, todoChanges).getSnapshot().status).toBe('live'));

			// The first tab's load is still held when the title changes and a page renders.
			server.rows[0]!.title = 'Atoll';
			const second = connect(owner, seedOf('Tides', 0, 'before-render'));
			const handle = second.read(list);
			closers.push(handle.subscribe(() => {}));
			closers.push(listen(second, todoChanges).subscribe(() => {}));
			await vi.waitFor(() => expect(server.log).toEqual(['list', 'list']));
			release();
			await vi.waitFor(() => expect(handle.getSnapshot().value?.[0]!.title).toBe('Atoll'));
		});
	});

	it('disposes replicas locally and releases the owner’s last heartbeat without signing out peers', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const server = createServer();
			const [first, second] = tabs(server.transport, 2);
			// MessageChannel delivery is independent of the fake host timers.
			await new Promise((resolve) => setImmediate(resolve));
			await new Promise((resolve) => setImmediate(resolve));
			await first!.dispose();
			expect(second!.retired).toBe(false);
			await second!.dispose();
			await new Promise((resolve) => setImmediate(resolve));
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('flushes a replica’s queued save before local disposal without opening a local cache writer', async () => {
		const server = createServer();
		const backing = memoryStorage();
		let commits = 0;
		let keys = 0;
		const storage = {
			...backing,
			async commit(...args: Parameters<typeof backing.commit>) {
				commits++;
				await backing.commit(...args);
			},
		};
		const persist = {
			storage,
			partition: 'ada',
			key: () => (keys++, 'a session secret of at least sixteen bytes'),
			budget: 4096,
		};
		const [first, peer] = tabs(server.transport, 2, undefined, persist);
		await observed(first!.read(todos));
		await vi.waitFor(() => expect(commits).toBeGreaterThan(0));
		const before = commits;
		const beforeKeys = keys;
		await peer!.publish(todos, undefined, [{ id: 'a', title: 'Latest', done: false }]);
		await peer!.dispose();
		await vi.waitFor(() => expect(commits).toBeGreaterThan(before));
		await new Promise<void>((resolve) => postHostTask(resolve));
		expect(keys).toBe(beforeKeys);
		const offline = createDataStore({ transport: unshared, persist });
		expect((await observed(offline.read(todos)))()[0]!.title).toBe('Latest');
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
function sharedWorkers(transport: Transport, local: Transport = unshared) {
	const owners = new Map<string, DataOwner>();
	vi.stubGlobal(
		'SharedWorker',
		class extends EventTarget {
			port: MessagePort;
			constructor(_url: string, { name }: { name: string }) {
				super();
				let owner = owners.get(name);
				if (!owner) owners.set(name, (owner = createDataOwner({ transport, fence: true })));
				const channel = new MessageChannel();
				owner.connect(channel.port1);
				this.port = channel.port2;
				closers.push(() => (channel.port1.close(), channel.port2.close()));
			}
		},
	);
	return (account: string) =>
		createReplica(sharedOwner(account)!, { ...replicaOptions, transport: local });
}

async function accountStore<T>(
	mode: IDBTransactionMode,
	use: (store: IDBObjectStore) => IDBRequest<T>,
	name = 'octane-data-account',
) {
	const opening = indexedDB.open(name, 1);
	opening.onupgradeneeded = () => opening.result.createObjectStore('account');
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
const recordedExplicitAccount = () =>
	accountStore('readonly', (store) => store.get(0), 'octane-data-account-explicit');
const recordAccount = (value: object) => accountStore('readwrite', (store) => store.put(value, 0));

describe('octane/data replies validated by the owner', () => {
	/** A meeting's start, sent as text and validated into whatever `into` makes of it. */
	class Start {
		constructor(readonly at: string) {}
	}
	function startSchema(into: (at: string) => unknown, calls: string[], label: string) {
		const output: StandardSchema<unknown, { start: unknown }> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate(value) {
					calls.push(label);
					const at = (value as { start?: unknown }).start;
					return typeof at === 'string'
						? { value: { start: into(at) } }
						: { issues: [{ message: 'Expected a start', path: ['start'] }] };
				},
			},
		};
		return read({ name: 'meeting', output, version: '1' });
	}

	/**
	 * An owner serving `count` tabs of one build. The owner and the tabs each
	 * hold their own copy of the build's contracts, as a worker and its pages do.
	 */
	function served(
		reply: unknown,
		into: (at: string) => unknown,
		options: { count?: number; ownerVersion?: string } = {},
	) {
		const calls: string[] = [];
		const onPage = startSchema(into, calls, 'page');
		const inWorker = startSchema(into, calls, 'worker');
		const ownerRead =
			options.ownerVersion === undefined
				? inWorker
				: { ...inWorker, version: options.ownerVersion };
		const owner = createDataOwner({
			transport: async () => ({
				ok: true,
				value: typeof reply === 'function' ? reply() : reply,
			}),
			contracts: [...contracts, ownerRead],
		});
		const stores = Array.from({ length: options.count ?? 1 }, () => {
			const channel = new MessageChannel();
			owner.connect(channel.port1);
			const store = createReplica(channel.port2, {
				...replicaOptions,
				contracts: [...contracts, onPage],
			});
			closers.push(() => (void store.dispose(), channel.port1.close(), channel.port2.close()));
			return store;
		});
		return { stores, read: onPage, calls };
	}

	it('adopts a reply the owner validated with the same build’s schema, without validating it on the page', async () => {
		const {
			stores,
			read: meeting,
			calls,
		} = served({ start: '2026-11-24T10:00:00Z' }, (at) => new Date(at));
		const shown = await observed(stores[0]!.read(meeting));
		// The schema's output, a Date, crosses to the page intact.
		expect(shown().start).toEqual(new Date('2026-11-24T10:00:00Z'));
		expect(calls).toEqual(['worker']);
	});

	it('gives the value it validated to every other tab holding the read, which adopts it as it came', async () => {
		let hour = 10;
		const {
			stores,
			read: meeting,
			calls,
		} = served(
			() => ({ start: `2026-11-24T${hour++}:00:00Z` }),
			(at) => new Date(at),
			{ count: 2 },
		);
		const [first, second] = stores as [DataStore, DataStore];
		const there = await observed(second.read(meeting));
		const here = first.read(meeting);
		await observed(here);
		// A reload in one tab reaches the other, validated once, in the worker.
		await here.refresh();
		await vi.waitFor(() => expect(there().start).toEqual(new Date('2026-11-24T12:00:00Z')));
		expect(calls).toEqual(['worker', 'worker', 'worker']);
	});

	it('leaves a value the trip would change to the page’s own validator, such as a class instance', async () => {
		const {
			stores,
			read: meeting,
			calls,
		} = served({ start: '2026-11-24T10:00:00Z' }, (at) => new Start(at));
		const shown = await observed(stores[0]!.read(meeting));
		expect(shown().start).toBeInstanceOf(Start);
		expect(calls).toEqual(['worker', 'page']);
	});

	it('leaves an invalid reply to the page, which reports what was wrong', async () => {
		const { stores, read: meeting } = served({ begins: 'soon' }, (at) => at);
		const handle = stores[0]!.read(meeting);
		closers.push(handle.subscribe(() => {}));
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('error'));
		expect(handle.getSnapshot().error).toMatchObject({
			code: 'invalid',
			issues: [{ message: 'Expected a start' }],
		});
	});

	it('validates nothing for tabs whose build has other contracts than its own', async () => {
		const {
			stores,
			read: meeting,
			calls,
		} = served({ start: '2026-11-24T10:00:00Z' }, (at) => new Date(at), {
			ownerVersion: '2',
		});
		const shown = await observed(stores[0]!.read(meeting));
		expect(shown().start).toEqual(new Date('2026-11-24T10:00:00Z'));
		expect(calls).toEqual(['page']);
	});
});

describe('octane/data previews, writes and feed events validated by the owner', () => {
	/**
	 * One build's contracts, each schema logging `side` when it runs: a meeting
	 * read whose start becomes a Date, a write that moves it and returns it, and
	 * a feed announcing moves. The owner and the tabs each build their own copy,
	 * as a worker and its pages do.
	 */
	function build(side: string, calls: string[], delays: number[] = []) {
		const schema = (what: string) => {
			const output: StandardSchema<unknown, { start: Date }> = {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate(value) {
						calls.push(`${side} ${what}`);
						const at = (value as { start?: unknown }).start;
						const result =
							typeof at === 'string' || at instanceof Date
								? { value: { start: new Date(at) } }
								: { issues: [{ message: 'Expected a start' }] };
						const delay = side === 'worker' ? delays.shift() : undefined;
						return delay === undefined
							? result
							: new Promise((resolve) => setTimeout(() => resolve(result), delay));
					},
				},
			};
			return output;
		};
		const meeting = read({ name: 'meeting', output: schema('read') });
		const move = write({
			name: 'meeting.move',
			input: schema('input'),
			output: schema('write'),
		});
		const moved = feed({
			name: 'meeting.moved',
			event: schema('event'),
			changes: (event) => ({ read: meeting, value: event }),
			covers: ['meeting'],
		});
		return { meeting, move, moved, contracts: [...contracts, meeting, move, moved] };
	}

	function served(options: {
		transport: Transport;
		listen?: Listener;
		count?: number;
		delays?: number[];
	}) {
		const calls: string[] = [];
		const owner = createDataOwner({
			transport: options.transport,
			listen: options.listen,
			contracts: build('worker', calls, options.delays).contracts,
		});
		const page = build('page', calls);
		const stores = Array.from({ length: options.count ?? 1 }, () => {
			const channel = new MessageChannel();
			owner.connect(channel.port1);
			const store = createReplica(channel.port2, { ...replicaOptions, contracts: page.contracts });
			closers.push(() => (void store.dispose(), channel.port1.close(), channel.port2.close()));
			return store;
		});
		return { stores, page, calls };
	}
	const at = (hour: number) => ({ start: `2026-11-24T${hour}:00:00Z` });
	const date = (hour: number) => new Date(`2026-11-24T${hour}:00:00Z`);
	const onPage = (calls: string[], what: string) => calls.filter((call) => call === `page ${what}`);

	it('shows the previews the worker validated, in the order they came, without validating them on the page', async () => {
		let reply!: () => void;
		const { stores, page, calls } = served({
			// The first preview validates more slowly than the second.
			delays: [30, 0],
			transport: (_request, _signal, preview) => {
				preview?.(at(9));
				preview?.(at(10));
				return new Promise((resolve) => (reply = () => resolve({ ok: true, value: at(11) })));
			},
		});
		const handle = stores[0]!.read(page.meeting);
		closers.push(handle.subscribe(() => {}));
		await vi.waitFor(() => expect(handle.getSnapshot().value?.start).toEqual(date(10)));
		await new Promise((resolve) => setTimeout(resolve, 50));
		// The slower first preview did not come after the second.
		expect(handle.getSnapshot()).toMatchObject({ preview: true, value: { start: date(10) } });
		reply();
		await vi.waitFor(() => expect(handle.getSnapshot().value?.start).toEqual(date(11)));
		expect(onPage(calls, 'read')).toEqual([]);
	});

	it('confirms a write with the output and the reads it returns as the worker validated them, in every tab', async () => {
		const { stores, page, calls } = served({
			count: 2,
			transport: async (request) =>
				request.kind === 'write'
					? {
							ok: true,
							value: at(14),
							refreshed: [{ name: 'meeting', input: undefined, value: at(14) }],
						}
					: { ok: true, value: at(9) },
		});
		const [mine, theirs] = stores as [DataStore, DataStore];
		const here = await observed(mine.read(page.meeting));
		const there = await observed(theirs.read(page.meeting));
		const output = await mine.write(page.move, { start: date(14) });
		expect(output).toEqual({ start: date(14) });
		await vi.waitFor(() => expect(there().start).toEqual(date(14)));
		expect(here().start).toEqual(date(14));
		// Each tab validated the write's input for its own edit, and nothing the server sent.
		expect(onPage(calls, 'write')).toEqual([]);
		expect(onPage(calls, 'read')).toEqual([]);
	});

	it('applies feed events the worker validated, without validating them on the page', async () => {
		const { stores, page, calls } = served({
			transport: async () => ({ ok: true, value: at(9) }),
			listen: async function* () {
				yield { cursor: '1', event: at(15) } as FeedFrame;
				await new Promise(() => {});
			},
		});
		const shown = await observed(stores[0]!.read(page.meeting));
		closers.push(listen(stores[0]!, page.moved).subscribe(() => {}));
		await vi.waitFor(() => expect(shown().start).toEqual(date(15)));
		expect(onPage(calls, 'event')).toEqual([]);
	});

	it('shows a preview whose validated value is not an object, validated again on the page from what the server sent', async () => {
		const calls: string[] = [];
		// Text in, a number out: validating the number again fails.
		const count = (side: string) =>
			read({
				name: 'count',
				output: {
					'~standard': {
						version: 1,
						vendor: 'test',
						validate(value) {
							calls.push(side);
							return typeof value === 'string'
								? { value: Number(value) }
								: { issues: [{ message: 'Expected text' }] };
						},
					},
				} as StandardSchema<unknown, number>,
			});
		const owner = createDataOwner({
			transport: (_request, _signal, preview) => {
				preview?.('41');
				return new Promise(() => {});
			},
			contracts: [...contracts, count('worker')],
		});
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		const page = count('page');
		const store = createReplica(channel.port2, {
			...replicaOptions,
			contracts: [...contracts, page],
		});
		closers.push(() => (void store.dispose(), channel.port1.close(), channel.port2.close()));
		const handle = store.read(page);
		closers.push(handle.subscribe(() => {}));
		await vi.waitFor(() =>
			expect(handle.getSnapshot()).toMatchObject({ preview: true, value: 41 }),
		);
		expect(calls).toEqual(['worker', 'page']);
	});

	it('leaves a write reply to the page when a read it returns does not validate in the worker', async () => {
		const { stores, page, calls } = served({
			transport: async (request) =>
				request.kind === 'write'
					? {
							ok: true,
							value: at(14),
							refreshed: [{ name: 'meeting', input: undefined, value: { begins: 'soon' } }],
						}
					: { ok: true, value: at(9) },
		});
		await observed(stores[0]!.read(page.meeting));
		await stores[0]!.write(page.move, { start: date(14) });
		// The page validates the whole reply itself, output included.
		expect(onPage(calls, 'write')).toEqual(['page write']);
	});
});

describe('octane/data contract identity', () => {
	const shaped = (shape: object): StandardSchema<unknown, { start: string }> => ({
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value: unknown) => ({ value: value as { start: string } }),
			jsonSchema: { input: () => shape, output: () => shape },
		} as never,
	});
	const build = (writeShape: object, eventShape: object) => [
		write({ name: 'meeting.move', input: shaped({}), output: shaped(writeShape) }),
		feed({ name: 'meeting.moved', event: shaped(eventShape), changes: () => [], covers: [] }),
	];
	const text = { type: 'object', properties: { start: { type: 'string' } } };
	const number = { type: 'object', properties: { start: { type: 'number' } } };

	it('tells builds apart by the shape of each write’s output and each feed’s event', () => {
		expect(contractIdentity(build(text, text))).toBe(contractIdentity(build(text, text)));
		expect(contractIdentity(build(number, text))).not.toBe(contractIdentity(build(text, text)));
		expect(contractIdentity(build(text, number))).not.toBe(contractIdentity(build(text, text)));
	});

	it('tells a write with an output schema from one without, whatever the schema describes', () => {
		// A schema that describes no shape, as many with transforms do.
		const opaque: StandardSchema<unknown, unknown> = {
			'~standard': { version: 1, vendor: 'test', validate: (value: unknown) => ({ value }) },
		};
		const move = (output?: StandardSchema<unknown, unknown>) => [
			write({ name: 'meeting.move', input: opaque, ...(output && { output }) }),
		];
		expect(contractIdentity(move(opaque))).not.toBe(contractIdentity(move()));
		expect(contractIdentity(move(opaque))).toBe(contractIdentity(move(opaque)));
	});
});

describe('octane/data owners across builds and crashes', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('shares the owner only between builds with the same contracts; any other tab keeps its own store', async () => {
		const server = createServer();
		const owner = createDataOwner({
			transport: async (request, signal) => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				return server.transport(request, signal);
			},
		});
		const own: string[] = [];
		const tab = (port: MessagePort | null, list: typeof contracts) =>
			createReplica(port, {
				transport: (request, signal) => (own.push(request.name), server.transport(request, signal)),
				contracts: list,
			});
		const connected = () => {
			const channel = new MessageChannel();
			owner.connect(channel.port1);
			closers.push(() => (channel.port1.close(), channel.port2.close()));
			return channel.port2;
		};
		// Another deploy, which no longer has `removeTodo`, and a browser without SharedWorker.
		const stores = [
			tab(connected(), contracts),
			tab(connected(), contracts),
			tab(
				connected(),
				contracts.filter((contract) => contract !== removeTodo),
			),
			tab(null, contracts),
		];
		for (const store of stores) closers.push(() => void store.retire());
		await Promise.all(stores.map((store) => observed(store.read(todos, undefined))));
		// The compatible pair shared one request; the others each loaded on their own.
		expect(own).toEqual(['todos.list', 'todos.list']);
		expect(server.log).toEqual(['list', 'list', 'list']);
	});

	it('reconnects to a new owner when the worker stops answering, without sending a write twice', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const server = createServer();
		const workers: Array<{ channel: MessageChannel; hang: boolean }> = [];
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					// Each construction after a crash starts a new worker, with a new owner.
					const worker = { channel: new MessageChannel(), hang: false };
					workers.push(worker);
					createDataOwner({
						transport: async (request, signal) => {
							if (worker.hang) return new Promise<DataReply>(() => {});
							return server.transport(request, signal);
						},
					}).connect(worker.channel.port1);
					this.port = worker.channel.port2;
					closers.push(() => (worker.channel.port1.close(), worker.channel.port2.close()));
				}
			},
		);
		const store = createReplica(sharedOwner('ada'), replicaOptions);
		closers.push(() => void store.retire());
		const list = store.read(todos, undefined);
		await observed(list);

		// The worker stops answering, with a reload and a write in flight.
		workers[0]!.hang = true;
		const reload = list.refresh();
		const write = store.write(setDone, { id: 'a', done: true }).catch((error: unknown) => error);
		await vi.waitFor(() => expect(done(() => list.getSnapshot().value!)).toBe(true));
		workers[0]!.channel.port1.close();
		await vi.advanceTimersByTimeAsync(20_000);

		await vi.waitFor(() => expect(workers).toHaveLength(2));
		await reload;
		expect(list.getSnapshot().status).toBe('ready');
		// The write may have reached the server before the crash, so it is uncertain, never resent.
		expect(await write).toBeInstanceOf(DataUncertainError);
		expect(writeCount(server.log)).toBe(0);
	});

	it('serves a tab again when it wakes after being dropped as silent, while its account is unchanged', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const server = createServer();
		const signals: AbortSignal[] = [];
		const feedListener: Listener = (_request, signal) => ({
			async *[Symbol.asyncIterator]() {
				signals.push(signal);
				yield {};
				await new Promise((resolve) => signal.addEventListener('abort', resolve));
			},
		});
		const owner = createDataOwner({ transport: server.transport, listen: feedListener });
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		closers.push(() => (channel.port1.close(), channel.port2.close()));
		// A frozen tab runs nothing, its heartbeat included, until it resumes.
		const store = createReplica(channel.port2, replicaOptions);
		const list = store.read(todos, undefined);
		await observed(list);
		closers.push(listen(store, todoChanges).subscribe(() => {}));
		await vi.waitFor(() => expect(signals).toHaveLength(1));

		document.dispatchEvent(new Event('freeze'));
		await vi.advanceTimersByTimeAsync(20_000);
		await vi.waitFor(() => expect(signals[0]!.aborted).toBe(true));
		document.dispatchEvent(new Event('resume'));
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		expect(store.retired).toBe(false);
		// Its feed connects again through the owner.
		await vi.advanceTimersByTimeAsync(5_000);
		await vi.waitFor(() => expect(signals).toHaveLength(2));

		// Silent again, it is dropped again.
		document.dispatchEvent(new Event('freeze'));
		await vi.advanceTimersByTimeAsync(20_000);
		await vi.waitFor(() => expect(signals[1]!.aborted).toBe(true));
		document.dispatchEvent(new Event('resume'));
	});

	it('keeps its owner while the browser throttles its timers, as long as each ping is answered', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const server = createServer();
		const owner = createDataOwner({ transport: server.transport });
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		closers.push(() => (channel.port1.close(), channel.port2.close()));
		const store = createReplica(channel.port2, replicaOptions);
		const list = store.read(todos, undefined);
		await observed(list);
		// A background tab's timers fire a minute apart; each ping is still answered.
		for (let tick = 0; tick < 4; tick++) {
			vi.setSystemTime(Date.now() + 60_000);
			await vi.advanceTimersByTimeAsync(5_000);
			await new Promise((resolve) => setImmediate(resolve));
		}
		// Still served by the owner: this tab's own transport would refuse.
		await list.refresh();
		expect(list.getSnapshot().status).toBe('ready');
		expect(server.log).toEqual(['list', 'list']);
	});

	it('drops a tab that stops answering from the feeds it listened to', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const server = createServer();
		const signals: AbortSignal[] = [];
		const feedListener: Listener = (_request, signal) => ({
			async *[Symbol.asyncIterator]() {
				signals.push(signal);
				yield {};
				await new Promise((resolve) => signal.addEventListener('abort', resolve));
			},
		});
		const owner = createDataOwner({ transport: server.transport, listen: feedListener });
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		const store = createReplica(channel.port2, replicaOptions);
		closers.push(() => (channel.port1.close(), channel.port2.close()));
		const stop = listen(store, todoChanges).subscribe(() => {});
		closers.push(stop);
		await vi.waitFor(() => expect(listen(store, todoChanges).getSnapshot().status).toBe('live'));

		// The tab's process ends without a word: its port goes quiet.
		channel.port2.close();
		await vi.advanceTimersByTimeAsync(20_000);
		await vi.waitFor(() => expect(signals[0]!.aborted).toBe(true));
	});
});

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
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					globalThis.dispatchEvent(new MessageEvent('connect', { ports: [channel.port1] }));
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		const store = createReplica(sharedOwner('ada')!, replicaOptions);
		const list = await observed(store.read(todos, undefined));
		expect(list()[0]!.title).toBe('Tides');
		expect(server.log).toEqual(['list']);
	});

	it('preserves an explicit peer’s cache when a replica retires with a queued save', async () => {
		const server = createServer();
		const backing = memoryStorage();
		let commits = 0;
		const storage = {
			...backing,
			async commit(...args: Parameters<typeof backing.commit>) {
				commits++;
				await backing.commit(...args);
			},
		};
		const persist = (account: string) => ({
			storage,
			partition: account,
			key: 'a session secret of at least sixteen bytes',
			budget: 4096,
		});
		let owner = createDataOwner({ transport: server.transport, fence: 'explicit', persist });
		const held: Array<() => void> = [];
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: OwnerPort;
				constructor() {
					super();
					const channel = new MessageChannel();
					owner.connect(channel.port1);
					this.port = {
						postMessage(message) {
							if ((message as { t?: string }).t === 'retire')
								held.push(() => channel.port2.postMessage(message));
							else channel.port2.postMessage(message);
						},
						addEventListener: (type, listener) => channel.port2.addEventListener(type, listener),
						start: () => channel.port2.start(),
						close: () => channel.port2.close(),
					};
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		await owner.activate('ada');
		const open = () =>
			createReplica(sharedOwner('ada'), { ...replicaOptions, persist: persist('ada') });
		const first = open();
		const retiring = open();
		await observed(first.read(todos));
		await vi.waitFor(() => expect(commits).toBeGreaterThan(0));
		const before = commits;
		try {
			await retiring.publish(todos, undefined, [{ id: 'a', title: 'Latest', done: false }]);
			await retiring.retire();
			await vi.waitFor(() => expect(commits).toBeGreaterThan(before));
			expect(first.retired).toBe(false);
			owner = createDataOwner({ transport: unshared, fence: 'explicit', persist });
			expect((await observed(open().read(todos)))()[0]!.title).toBe('Latest');
		} finally {
			for (const deliver of held.splice(0)) deliver();
			await new Promise((resolve) => setImmediate(resolve));
		}
	});

	it('admits only the account explicitly activated by trusted owner code, including after logout', async () => {
		const server = createServer();
		const owner = createDataOwner({ transport: server.transport, fence: 'explicit' });
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					owner.connect(channel.port1);
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		const open = (account: string) => createReplica(sharedOwner(account), replicaOptions);
		await owner.activate('ada');
		const ada = open('ada');
		const peer = open('ada');
		await observed(ada.read(todos));
		await observed(peer.read(todos));
		await ada.retire();
		expect(peer.retired).toBe(false);
		expect(await recordedExplicitAccount()).toEqual({ account: 'ada', generation: 1 });
		await owner.activate('grace');
		const grace = open('grace');
		await observed(grace.read(todos));
		const stale = open('ada');
		await vi.waitFor(() => expect(stale.retired).toBe(true));
		expect(grace.retired).toBe(false);
		expect(await recordedExplicitAccount()).toEqual({ account: 'grace', generation: 2 });
		await owner.activate(null);
		const late = open('grace');
		await vi.waitFor(() => expect(late.retired).toBe(true));
		expect(await recordedExplicitAccount()).toEqual({ account: null, generation: 3 });
	});

	for (const delivered of [true, false])
		it(`does not admit a newer owner’s grant after activation is revoked (${delivered ? 'delivered' : 'withheld'} broadcast)`, async () => {
			const channels: Array<{ onmessage: ((event: { data: number }) => void) | null }> = [];
			vi.stubGlobal(
				'BroadcastChannel',
				class {
					onmessage: ((event: { data: number }) => void) | null = null;
					constructor() {
						channels.push(this);
					}
					postMessage(data: number) {
						if (delivered)
							for (const channel of channels) if (channel !== this) channel.onmessage?.({ data });
					}
				},
			);
			const server = createServer();
			const first = createDataOwner({ transport: server.transport, fence: 'explicit' });
			const second = createDataOwner({ transport: server.transport, fence: 'explicit' });
			let current = first;
			vi.stubGlobal(
				'SharedWorker',
				class extends EventTarget {
					port: MessagePort;
					constructor() {
						super();
						const channel = new MessageChannel();
						current.connect(channel.port1);
						this.port = channel.port2;
						closers.push(() => (channel.port1.close(), channel.port2.close()));
					}
				},
			);
			const open = (owner: DataOwner, account: string) => (
				(current = owner),
				createReplica(sharedOwner(account), replicaOptions)
			);
			await first.activate('ada');
			await second.activate('grace');
			const late = open(first, 'grace');
			await vi.waitFor(() => expect(late.retired).toBe(true));
			const live = open(second, 'grace');
			expect((await observed(live.read(todos)))()[0]!.title).toBe('Tides');
		});

	it('keeps explicit activation pending until prior persistence clears, and fails closed on cleanup errors', async () => {
		const server = createServer();
		const backing = memoryStorage();
		let release!: () => void;
		let started!: () => void;
		let fail = false;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const clearing = new Promise<void>((resolve) => (started = resolve));
		const storage = {
			...backing,
			async clear(partition: string) {
				started();
				await gate;
				if (fail) throw new Error('clear failed');
				await backing.clear(partition);
			},
		};
		const make = () =>
			createDataOwner({
				transport: server.transport,
				fence: 'explicit',
				persist: (account) => ({
					storage,
					partition: account,
					key: 'a session secret of at least sixteen bytes',
					budget: 4096,
				}),
			});
		let owner = make();
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					owner.connect(channel.port1);
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		const open = (account: string) => createReplica(sharedOwner(account), replicaOptions);
		await owner.activate('ada');
		await observed(open('ada').read(todos));
		const activating = owner.activate('grace');
		await clearing;
		const grace = open('grace');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(grace.retired).toBe(false);
		expect((await recordedExplicitAccount()).pending).toBe(true);
		fail = true;
		release();
		await expect(activating).rejects.toThrow('clear failed');
		await vi.waitFor(() => expect(grace.retired).toBe(true));
		owner = make();
		const afterCrash = open('grace');
		await vi.waitFor(() => expect(afterCrash.retired).toBe(true));
		expect((await recordedExplicitAccount()).account).toBe(null);
	});

	it('does not accept a global cache clear from an explicit replica port', async () => {
		const backing = memoryStorage();
		let clears = 0;
		const storage = {
			...backing,
			async clear(partition: string) {
				clears++;
				await backing.clear(partition);
			},
		};
		const owner = createDataOwner({
			transport: createServer().transport,
			fence: 'explicit',
			persist: (account) => ({
				storage,
				partition: account,
				key: 'a session secret of at least sixteen bytes',
			}),
		});
		await owner.activate('ada');
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		closers.push(() => (channel.port1.close(), channel.port2.close()));
		const messages: any[] = [];
		channel.port2.addEventListener('message', ({ data }) => messages.push(data));
		channel.port2.start();
		channel.port2.postMessage({
			t: 'hello',
			account: 'ada',
			identity: contractIdentity(contracts),
		});
		await vi.waitFor(() => expect(messages).toContainEqual({ t: 'live' }));
		channel.port2.postMessage({ t: 'persist', id: 1, op: 'clear', args: [] });
		await vi.waitFor(() =>
			expect(messages).toContainEqual({ t: 'persisted', id: 1, value: undefined }),
		);
		expect(clears).toBe(0);
		expect((await recordedExplicitAccount()).account).toBe('ada');
	});

	it('does not restore a delayed prior-grant commit into a new same-account grant', async () => {
		const oldServer = createServer();
		oldServer.rows[0]!.title = 'old grant';
		const backing = memoryStorage();
		let release!: () => void;
		let started!: () => void;
		let finished!: () => void;
		const committed = new Promise<void>((resolve) => (finished = resolve));
		const held = new Promise<void>((resolve) => (started = resolve));
		const gate = new Promise<void>((resolve) => (release = resolve));
		let hold = true;
		let oldPartition = '';
		const channels: Array<{ onmessage: ((event: { data: number }) => void) | null }> = [];
		const notifications: Array<() => void> = [];
		const storage = {
			...backing,
			async commit(...args: Parameters<typeof backing.commit>) {
				const heldCommit = hold && args[1].some((item) => item.value !== undefined);
				if (heldCommit) {
					hold = false;
					oldPartition = args[0];
					started();
					await gate;
				}
				await backing.commit(...args);
				if (heldCommit) finished();
			},
		};
		const persist = (account: string) => ({
			storage,
			partition: account,
			key: 'a session secret of at least sixteen bytes',
			budget: 4096,
		});
		vi.stubGlobal(
			'BroadcastChannel',
			class {
				onmessage: ((event: { data: number }) => void) | null = null;
				constructor() {
					channels.push(this);
				}
				postMessage(data: number) {
					for (const channel of channels)
						if (channel !== this) notifications.push(() => channel.onmessage?.({ data }));
				}
			},
		);
		let owner = createDataOwner({ transport: oldServer.transport, fence: 'explicit', persist });
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					owner.connect(channel.port1);
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		await owner.activate('ada');
		const old = createReplica(sharedOwner('ada'), { ...replicaOptions, persist: persist('ada') });
		await observed(old.read(todos));
		await held;
		owner = createDataOwner({ transport: unshared, fence: 'explicit', persist });
		await owner.activate('ada');
		release();
		await committed;
		const current = createReplica(sharedOwner('ada'), {
			...replicaOptions,
			persist: persist('ada'),
		});
		const handle = current.read(todos);
		closers.push(handle.subscribe(() => {}));
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('error'));
		expect(handle.getSnapshot().value).toBeUndefined();
		expect(await backing.index(oldPartition)).toHaveLength(1);
		for (const notify of notifications.splice(0)) notify();
		await vi.waitFor(async () => expect(await backing.index(oldPartition)).toHaveLength(0));
	});

	it('does not let a delayed old-owner notification erase a reactivated account cache', async () => {
		const pending: Array<() => void> = [];
		const channels: any[] = [];
		vi.stubGlobal(
			'BroadcastChannel',
			class {
				onmessage: ((event: { data: number }) => void) | null = null;
				constructor() {
					channels.push(this);
				}
				postMessage(data: number) {
					for (const channel of channels)
						if (channel !== this) pending.push(() => channel.onmessage?.({ data }));
				}
			},
		);
		const server = createServer();
		const backing = memoryStorage();
		let clears = 0;
		let commits = 0;
		const storage = {
			...backing,
			async clear(partition: string) {
				clears++;
				await backing.clear(partition);
			},
			async commit(...args: Parameters<typeof backing.commit>) {
				commits++;
				await backing.commit(...args);
			},
		};
		const persist = (account: string) => ({
			storage,
			partition: account,
			key: 'a session secret of at least sixteen bytes',
			budget: 4096,
		});
		const make = () => createDataOwner({ transport: server.transport, fence: 'explicit', persist });
		let owner = make();
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					owner.connect(channel.port1);
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		await owner.activate('ada');
		await observed(createReplica(sharedOwner('ada'), replicaOptions).read(todos));
		owner = make();
		await owner.activate('ada');
		const fresh = createReplica(sharedOwner('ada'), { ...replicaOptions, persist: persist('ada') });
		await observed(fresh.read(todos));
		await vi.waitFor(() => expect(commits).toBeGreaterThan(0));
		const before = clears;
		for (const deliver of pending.splice(0)) deliver();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(clears).toBe(before);
		owner = createDataOwner({ transport: unshared, fence: 'explicit', persist });
		const offline = createReplica(sharedOwner('ada'), {
			...replicaOptions,
			persist: persist('ada'),
		});
		expect((await observed(offline.read(todos)))()[0]!.title).toBe('Tides');
	});

	it('isolates explicit grants and cache partitions from a still-open legacy owner', async () => {
		const server = createServer();
		const backing = memoryStorage();
		let commits = 0;
		const storage = {
			...backing,
			async commit(...args: Parameters<typeof backing.commit>) {
				commits++;
				await backing.commit(...args);
			},
		};
		const persist = (account: string) => ({
			storage,
			partition: account,
			key: 'a session secret of at least sixteen bytes',
			budget: 4096,
		});
		let explicit = createDataOwner({ transport: server.transport, fence: 'explicit', persist });
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					explicit.connect(channel.port1);
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);
		await explicit.activate('ada');
		const first = createReplica(sharedOwner('ada'), { ...replicaOptions, persist: persist('ada') });
		const peer = createReplica(sharedOwner('ada'), { ...replicaOptions, persist: persist('ada') });
		await observed(first.read(todos));
		const peerValue = await observed(peer.read(todos));
		await vi.waitFor(() => expect(commits).toBeGreaterThan(0));
		await first.dispose();
		expect(peer.retired).toBe(false);
		expect(peerValue()[0]!.title).toBe('Tides');
		const savedBeforeUpdate = commits;
		await peer.publish(todos, undefined, [{ ...peerValue()[0]!, title: 'Peer latest' }]);
		await vi.waitFor(() => expect(commits).toBeGreaterThan(savedBeforeUpdate));
		const legacy = createDataOwner({ transport: server.transport, fence: true, persist });
		const channel = new MessageChannel();
		legacy.connect(channel.port1);
		closers.push(() => (channel.port1.close(), channel.port2.close()));
		channel.port2.start();
		channel.port2.postMessage({
			t: 'hello',
			account: 'grace',
			identity: contractIdentity(contracts),
		});
		await vi.waitFor(async () => expect((await recordedAccount()).account).toBe('grace'));
		await createDataStore({ transport: unshared, persist: persist('ada') }).retire();
		expect((await recordedExplicitAccount()).account).toBe('ada');
		explicit = createDataOwner({ transport: unshared, fence: 'explicit', persist });
		const restarted = createReplica(sharedOwner('ada'), {
			...replicaOptions,
			persist: persist('ada'),
		});
		expect((await observed(restarted.read(todos)))()[0]!.title).toBe('Peer latest');
	});

	it('publishes at most one grant when trusted owners activate concurrently', async () => {
		const first = createDataOwner({ transport: createServer().transport, fence: 'explicit' });
		const second = createDataOwner({ transport: createServer().transport, fence: 'explicit' });
		const results = await Promise.allSettled([first.activate('ada'), second.activate('grace')]);
		const record = await recordedExplicitAccount();
		expect(['ada', 'grace']).toContain(record.account);
		expect(record.pending).toBeUndefined();
		expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(
			1,
		);
		const port = new MessageChannel();
		first.connect(port.port1);
		closers.push(() => (port.port1.close(), port.port2.close()));
		const messages: any[] = [];
		port.port2.addEventListener('message', ({ data }) => messages.push(data));
		port.port2.start();
		port.port2.postMessage({
			t: 'hello',
			account: record.account === 'ada' ? 'grace' : 'ada',
			identity: contractIdentity(contracts),
		});
		await vi.waitFor(() => expect(messages).toContainEqual({ t: 'retired' }));
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

	it('keeps a tab working on its own store when the account cannot be recorded, and tries again for the next', async () => {
		const server = createServer();
		const own: string[] = [];
		const open = sharedWorkers(server.transport, (request, signal) => {
			own.push(request.name);
			return server.transport(request, signal);
		});
		const working = indexedDB;
		vi.stubGlobal('indexedDB', {
			open() {
				throw new DOMException('storage is unavailable', 'UnknownError');
			},
		});
		const alone = open('ada');
		await observed(alone.read(todos, undefined));
		expect(own).toEqual(['todos.list']);
		vi.stubGlobal('indexedDB', working);
		const tab = open('ada');
		await observed(tab.read(todos, undefined));
		expect(own).toEqual(['todos.list']);
		expect(await recordedAccount()).toEqual({ account: 'ada', generation: 1 });
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
			const store = createReplica(channel.port2, replicaOptions);
			void store.retire();
			await vi.advanceTimersByTimeAsync(0);
			const retires = () => received.filter((type) => type === 'retire');
			expect(retires()).toEqual(['retire']);
			await vi.advanceTimersByTimeAsync(5_000);
			expect(retires()).toEqual(['retire', 'retire']);
			channel.port1.postMessage({ t: 'retired' });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(retires()).toEqual(['retire', 'retire']);
		} finally {
			vi.useRealTimers();
		}
	});

	/**
	 * A stand-in dedicated Worker: each page message carrying a port connects
	 * it to this worker's own owner, as `serveDataOwner` does in a real one.
	 */
	function dedicatedWorkers(transport: Transport) {
		const workers: Array<{
			name: string;
			terminated: boolean;
			ports: MessagePort[];
			fail(): void;
		}> = [];
		vi.stubGlobal(
			'Worker',
			class extends EventTarget {
				readonly owner = createDataOwner({ transport, fence: true });
				readonly record;
				constructor(_url: string, { name }: { name: string }) {
					super();
					this.record = {
						name,
						terminated: false,
						ports: [] as MessagePort[],
						fail: () => this.dispatchEvent(new Event('error')),
					};
					workers.push(this.record);
				}
				postMessage(_message: unknown, [port]: [MessagePort]) {
					this.owner.connect(port);
					this.record.ports.push(port);
					closers.push(() => port.close());
				}
				terminate() {
					this.record.terminated = true;
				}
			},
		);
		return workers;
	}

	it('runs the data worker as the page’s own dedicated Worker where SharedWorker is missing, one per partition', async () => {
		const server = createServer();
		const workers = dedicatedWorkers(server.transport);
		const open = (account: string) => {
			const store = createReplica(sharedOwner(account), replicaOptions);
			closers.push(() => void store.dispose());
			return store;
		};
		const [first, second] = [open('ada'), open('ada')];
		const lists = await Promise.all([first, second].map((store) => observed(store.read(todos))));
		// Both replicas of the partition share one worker, so its owner loads the list once.
		expect(lists.map((list) => list()[0]!.title)).toEqual(['Tides', 'Tides']);
		expect(server.log).toEqual(['list']);
		await observed(open('grace').read(todos));
		expect(workers.map((worker) => worker.name)).toEqual([
			'octane-data:5:ada',
			'octane-data:5:grace',
		]);
	});

	it('carries on as a local store when the dedicated data worker cannot load', async () => {
		const server = createServer();
		const workers = dedicatedWorkers(() => new Promise<DataReply>(() => {}));
		const store = createReplica(sharedOwner('bea'), {
			...replicaOptions,
			transport: server.transport,
		});
		closers.push(() => void store.dispose());
		workers[0]!.fail();
		expect((await observed(store.read(todos)))()[0]!.title).toBe('Tides');
		// The next replica starts a new worker rather than the one that failed.
		const next = createReplica(sharedOwner('bea'), replicaOptions);
		closers.push(() => void next.dispose());
		expect(workers).toHaveLength(2);
	});

	it('replaces a dedicated data worker that stops answering, without sending a write twice', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		try {
			const server = createServer();
			let hang = false;
			const workers = dedicatedWorkers((request, signal) =>
				hang ? new Promise<DataReply>(() => {}) : server.transport(request, signal),
			);
			const store = createReplica(sharedOwner('cy'), replicaOptions);
			closers.push(() => void store.dispose());
			const list = store.read(todos);
			await observed(list);
			// The worker stops answering with a write in flight.
			hang = true;
			const write = store.write(setDone, { id: 'a', done: true }).catch((error: unknown) => error);
			for (const port of workers[0]!.ports) port.close();
			await vi.advanceTimersByTimeAsync(20_000);
			hang = false;
			await vi.waitFor(() => expect(workers).toHaveLength(2));
			expect(workers[0]!.terminated).toBe(true);
			expect(await write).toBeInstanceOf(DataUncertainError);
			await list.refresh();
			expect(list.getSnapshot().status).toBe('ready');
			expect(writeCount(server.log)).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('serves a page that connects to the worker as a dedicated Worker', async () => {
		const server = createServer();
		// This worker's global alone, so owners other tests served do not hear the page.
		const listeners = new Map<string, (event: { ports: MessagePort[] }) => void>();
		vi.spyOn(globalThis, 'addEventListener').mockImplementation((type, listener) => {
			listeners.set(type, listener as never);
		});
		serveDataOwner({ transport: server.transport });
		vi.restoreAllMocks();
		vi.stubGlobal(
			'Worker',
			class extends EventTarget {
				postMessage(_message: unknown, ports: MessagePort[]) {
					listeners.get('message')!({ ports });
					closers.push(() => ports[0]!.close());
				}
			},
		);
		const store = createReplica(sharedOwner('dee'), replicaOptions);
		closers.push(() => void store.dispose());
		expect((await observed(store.read(todos)))()[0]!.title).toBe('Tides');
		expect(server.log).toEqual(['list']);
	});

	it('connects a tab to the worker named for its protocol and partition, or reports that it cannot', () => {
		vi.stubGlobal('Worker', undefined);
		expect(sharedOwner('ada')).toBeNull();
		const constructed: unknown[] = [];
		const port = new MessageChannel().port1;
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port = port;
				constructor(...args: unknown[]) {
					super();
					constructed.push(args);
				}
			},
		);
		try {
			expect(sharedOwner('ada')).toBe(port);
			expect(constructed).toEqual([
				['/_octane/data-worker.js', { type: 'module', name: 'octane-data:5:ada' }],
			]);
			vi.stubGlobal(
				'SharedWorker',
				class extends EventTarget {
					constructor() {
						super();
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
