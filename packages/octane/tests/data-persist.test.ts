/**
 * A store with `persist` saves confirmed values and starts from them after a
 * restart. Each test restarts by creating a second store over the same storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import {
	autoBudget,
	createDataStore,
	entity,
	indexedDBStorage,
	memoryStorage as createMemoryStorage,
	read,
	view,
	write,
	type DataReply,
	type DataRequest,
	type PersistentStorage,
	type ReadHandle,
	type StandardSchema,
} from '../src/data/index.js';

interface Book {
	id: string;
	title: string;
	read: boolean;
}

const schema = <T>(check: (value: any) => boolean): StandardSchema<unknown, T> => ({
	'~standard': {
		version: 1,
		vendor: 'test',
		validate: (value) =>
			check(value) ? { value: value as T } : { issues: [{ message: 'does not match' }] },
	},
});
const isBook = (value: any) => typeof value?.id === 'string' && typeof value.title === 'string';
const Book = entity('book', schema<Book>(isBook));
const bookList = schema<Book[]>((value) => Array.isArray(value) && value.every(isBook));

const shelf = read({
	name: 'shelf',
	output: bookList,
	entities: (books) => Book.from(books),
	fresh: 60_000,
});
const count = read({ name: 'count', output: schema<number>((v) => typeof v === 'number') });
const secret = read({
	name: 'secret',
	output: schema<string>((v) => typeof v === 'string'),
	persist: false,
});
const unread = view({
	name: 'unread',
	of: Book,
	where: (book) => !book.read,
	order: [['title', 'asc']],
	limit: 2,
	fresh: 60_000,
});
const setRead = write({
	name: 'setRead',
	input: schema<{ id: string; read: boolean }>((v) => typeof v?.read === 'boolean'),
	patches: Book,
	invalidates: ['count'],
});

/** A server over `books`, logging each request it answers. */
function server(books: Book[]) {
	const log: string[] = [];
	let hold: Promise<void> | null = null;
	let holding: DataRequest['kind'] | 'all' = 'all';
	const answer = (name: string, input: unknown): unknown => {
		if (name === 'count') return books.length;
		if (name === 'secret') return 'hunter2';
		if (name === 'serial') return 7;
		const sorted = books.map((book) => ({ ...book })).sort((a, b) => (a.title < b.title ? -1 : 1));
		if (name === 'shelf') return sorted;
		const { offset, limit } = input as { offset: number; limit: number };
		return sorted.filter((book) => !book.read).slice(offset, offset + limit);
	};
	const transport = async (request: DataRequest): Promise<DataReply> => {
		if (holding === 'all' || holding === request.kind) await hold;
		log.push(`${request.kind} ${request.name}`);
		if (request.kind === 'read') return { ok: true, value: answer(request.name, request.input) };
		const { id, read } = request.input as { id: string; read: boolean };
		books.find((book) => book.id === id)!.read = read;
		// Like the data handler, the reply carries back the reads on screen that the write affects.
		const refreshed = (request.refresh ?? []).map((item) => ({
			...item,
			value: answer(item.name, item.input),
		}));
		return { ok: true, value: null, refreshed };
	};
	return {
		log,
		transport,
		/** Hold requests, or only writes, until the returned function is called. */
		hold(kind: 'all' | 'write' = 'all') {
			holding = kind;
			let release!: () => void;
			hold = new Promise((resolve) => (release = resolve));
			return () => {
				hold = null;
				release();
			};
		},
	};
}

const books = (): Book[] => [
	{ id: 'a', title: 'Kindred', read: false },
	{ id: 'b', title: 'Piranesi', read: false },
	{ id: 'c', title: 'The Dispossessed', read: false },
];

/** A session's cache key: random, and different for each user. */
const KEY = 'a session secret of at least sixteen bytes';

const cache = (storage: PersistentStorage, partition: string, options: object = {}) => ({
	storage,
	partition,
	key: KEY,
	...options,
});

const written = new WeakMap<PersistentStorage, Set<string>>();

/** A memory adapter that remembers the partitions written to it, which are hashed names. */
function memoryStorage(): PersistentStorage {
	const inner = createMemoryStorage();
	const partitions = new Set<string>();
	const storage: PersistentStorage = {
		...inner,
		commit(partition, put, remove) {
			partitions.add(partition);
			return inner.commit(partition, put, remove);
		},
	};
	written.set(storage, partitions);
	return storage;
}

const listPartitions = (storage: PersistentStorage) => [...written.get(storage)!];

/** Every name and value the storage holds, as one text. */
async function everything(storage: PersistentStorage, partition: string) {
	const metas = await storage.index(partition);
	const values = await Promise.all(metas.map((meta) => storage.get(partition, meta.key)));
	return JSON.stringify([partition, metas, values]);
}

/** Wait until the store has written what it queued. */
const saved = () => new Promise((resolve) => setTimeout(resolve, 20));

async function value<T>(store: ReturnType<typeof createDataStore>, contract: any, input?: any) {
	const handle = store.read(contract, input) as ReadHandle<T>;
	const stop = handle.subscribe(() => {});
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return { handle, stop, value: handle.getSnapshot().value as T };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('octane/data persistent cache', () => {
	it('starts a fresh value from storage without loading it again', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({
			transport: first.transport,
			persist: cache(storage, 'ada'),
		});
		const loaded = await value<Book[]>(before, shelf);
		await saved();

		const second = server(books());
		const after = createDataStore({
			transport: second.transport,
			persist: cache(storage, 'ada'),
		});
		const restored = await value<Book[]>(after, shelf);
		expect(restored.value).toEqual(loaded.value);
		await saved();
		expect(second.log).toEqual([]);
	});

	it('shows a stale value from storage while it reloads', async () => {
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		expect((await value<number>(before, count)).value).toBe(3);
		await saved();

		const changed = server([...books(), { id: 'd', title: 'Kelp', read: false }]);
		const release = changed.hold();
		const after = createDataStore({
			transport: changed.transport,
			persist: cache(storage, 'ada'),
		});
		const restored = await value<number>(after, count);
		// `count` is never fresh, so its saved value shows while it reloads.
		expect(restored.value).toBe(3);
		expect(restored.handle.getSnapshot()).toMatchObject({ stale: true, refreshing: true });
		release();
		await vi.waitFor(() => expect(restored.handle.getSnapshot().value).toBe(4));
		expect(changed.log).toEqual(['read count']);
	});

	it('saves confirmed values only, never a pending edit', async () => {
		const storage = memoryStorage();
		const remote = server(books());
		const before = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const shown = await value<Book[]>(before, shelf);

		// The edit is still pending when the shelf reloads and is saved again, and when the page goes away.
		remote.hold('write');
		void before.write(setRead, { id: 'a', read: true }).catch(() => {});
		await shown.handle.refresh();
		expect(shown.handle.getSnapshot().value![0]!.read).toBe(true);
		await saved();

		const after = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		expect((await value<Book[]>(after, shelf)).value[0]!.read).toBe(false);
	});

	it('saves the reads a write reply carries back', async () => {
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(before, shelf);
		await before.write(setRead, { id: 'a', read: true });
		await saved();

		const remote = server(books());
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		// The shelf is fresh, so the saved copy is all that shows: it must include the write.
		expect((await value<Book[]>(after, shelf)).value[0]!.read).toBe(true);
		expect(remote.log).toEqual([]);
	});

	it('keeps a stale mark across a restart, so the value reloads although it is fresh', async () => {
		const storage = memoryStorage();
		const tally = read({ name: 'count', output: count.output, tags: ['count'], fresh: 60_000 });
		const remote = server(books());
		const before = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		(await value(before, tally)).stop();
		await before.write(setRead, { id: 'a', read: true });
		await saved();

		const next = server(books());
		const after = createDataStore({ transport: next.transport, persist: cache(storage, 'ada') });
		await value(after, tally);
		await vi.waitFor(() => expect(next.log).toEqual(['read count']));
	});

	it('keeps accounts apart and forgets an account when its store is retired', async () => {
		const storage = memoryStorage();
		const ada = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(ada, shelf);
		await saved();

		const graceServer = server([{ id: 'z', title: 'Dune', read: false }]);
		const grace = createDataStore({
			transport: graceServer.transport,
			persist: cache(storage, 'grace'),
		});
		expect((await value<Book[]>(grace, shelf)).value.map((book) => book.title)).toEqual(['Dune']);
		expect(graceServer.log).toEqual(['read shelf']);

		ada.retire();
		await saved();
		const adaAgain = server(books());
		await value(
			createDataStore({ transport: adaAgain.transport, persist: cache(storage, 'ada') }),
			shelf,
		);
		expect(adaAgain.log).toEqual(['read shelf']);
		const graceAgain = server([]);
		await value(
			createDataStore({ transport: graceAgain.transport, persist: cache(storage, 'grace') }),
			shelf,
		);
		expect(graceAgain.log).toEqual([]);
	});

	it('leaves out reads marked persist: false, and discards values from another version', async () => {
		const storage = memoryStorage();
		const store = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(store, secret);
		await value(store, shelf);
		await saved();
		const remoteSecret = server(books());
		const restarted = createDataStore({
			transport: remoteSecret.transport,
			persist: cache(storage, 'ada'),
		});
		await value(restarted, secret);
		expect(remoteSecret.log).toEqual(['read secret']);

		const renamed = read({ name: 'shelf', output: bookList, version: '2' });
		const remote = server(books());
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		await value(after, renamed);
		expect(remote.log).toEqual(['read shelf']);
	});

	it('discards a saved value that no longer matches its schema', async () => {
		const storage = memoryStorage();
		const loose = read({ name: 'count', output: schema<unknown>(() => true) });
		const before = createDataStore({
			transport: async () => ({ ok: true, value: 'three' }),
			persist: cache(storage, 'ada'),
		});
		await value(before, loose);
		await saved();

		const remote = server(books());
		const release = remote.hold();
		const store = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const handle = store.read(count, undefined);
		handle.subscribe(() => {});
		await saved();
		// Only the network can supply a value now.
		expect(handle.getSnapshot().status).toBe('pending');
		release();
		await vi.waitFor(() => expect(handle.getSnapshot().value).toBe(3));
	});

	it("discards values saved under another shape of the read's output", async () => {
		const storage = memoryStorage();
		const described = (properties: object) =>
			read({
				name: 'shelf',
				fresh: 60_000,
				output: {
					'~standard': {
						...bookList['~standard'],
						jsonSchema: { output: () => ({ type: 'array', items: { properties } }) },
					},
				},
			});
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(before, described({ id: {}, title: {} }));
		await saved();

		const same = server(books());
		const unchanged = createDataStore({
			transport: same.transport,
			persist: cache(storage, 'ada'),
		});
		await value(unchanged, described({ id: {}, title: {} }));
		expect(same.log).toEqual([]);

		// A new field: the old values still validate, but were saved for another shape.
		const remote = server(books());
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		await value(after, described({ id: {}, title: {}, read: {} }));
		expect(remote.log).toEqual(['read shelf']);
	});

	it("encrypts what it saves, so another user's session can neither read nor list it", async () => {
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(before, shelf);
		await saved();
		// Nothing the storage holds names the account, the read or a title.
		const index = await Promise.all(
			listPartitions(storage).map((name) => everything(storage, name)),
		);
		expect(index.join('')).not.toMatch(/ada|shelf|Kindred/);

		// Another user on the same browser, under the same account name, starts empty.
		const remote = server(books());
		const intruder = createDataStore({
			transport: remote.transport,
			persist: cache(storage, 'ada', { key: 'another session secret, also sixteen+' }),
		});
		await value(intruder, shelf);
		expect(remote.log).toEqual(['read shelf']);
	});

	it('restores a view with the part of its order it held', async () => {
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		const page = await value<Book[]>(before, unread, { offset: 1, limit: 1 });
		expect(page.value.map((book) => book.title)).toEqual(['Piranesi']);
		await saved();

		const remote = server(books());
		const release = remote.hold();
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const restored = await value<Book[]>(after, unread, { offset: 1, limit: 1 });
		expect(restored.value.map((book) => book.title)).toEqual(['Piranesi']);
		// An edit above the window moves it, as it would in the store that loaded it.
		void after.write(setRead, { id: 'a', read: true }).catch(() => {});
		expect(restored.handle.getSnapshot().value!.map((book) => book.title)).toEqual([
			'The Dispossessed',
		]);
		release();
		expect(remote.log).toEqual([]);
	});

	it('stays within its budget, purging the least recently used values first', async () => {
		/** Load the shelf and keep it mounted, then load and unmount `unread`, then `count`. */
		async function fill(budget: number) {
			const storage = memoryStorage();
			const store = createDataStore({
				transport: server(books()).transport,
				persist: cache(storage, 'ada', { budget }),
			});
			const mounted = await value(store, shelf);
			await saved();
			for (const contract of [unread, count]) {
				(await value(store, contract)).stop();
				await saved();
			}
			mounted.stop();
			return (await storage.index(listPartitions(storage)[0]!)).map((meta) => meta.size);
		}
		const [shelfSize, unreadSize, countSize] = await fill(Infinity);

		// Room for the shelf and the count, but not the view as well.
		const budget = Math.ceil((shelfSize! + countSize!) / 0.9);
		expect(shelfSize! + unreadSize! + countSize!).toBeGreaterThan(budget);
		// The mounted shelf is the oldest, but only `unread`, the least recently used of the rest, goes.
		expect((await fill(budget)).sort()).toEqual([shelfSize, countSize].sort());
	});

	it('counts a value restored this session as recently used', async () => {
		const storage = memoryStorage();
		const serial = read({ name: 'serial', output: count.output });
		const seed = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada', { budget: Infinity }),
		});
		// The shelf is saved first, so before this session it is the least recently used.
		for (const contract of [shelf, count]) {
			(await value(seed, contract)).stop();
			await saved();
		}
		const [shelfSize, countSize] = (await storage.index(listPartitions(storage)[0]!)).map(
			(meta) => meta.size,
		);

		// Room for the two saved values, and not for one more of the count's size.
		const budget = Math.ceil((shelfSize! + countSize!) / 0.9);
		const store = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada', { budget }),
		});
		(await value(store, shelf)).stop();
		await saved();
		(await value(store, serial)).stop();
		await saved();

		// The count, unused this session, goes; the shelf, restored and shown, stays.
		const remote = server(books());
		remote.hold();
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const kept = after.read(shelf, undefined);
		kept.subscribe(() => {});
		const gone = after.read(count, undefined);
		gone.subscribe(() => {});
		await saved();
		expect(kept.getSnapshot().status).toBe('ready');
		expect(gone.getSnapshot().status).toBe('pending');
	});

	it('sizes the automatic budget by device', () => {
		const MB = 1024 * 1024;
		const device = { memory: undefined, saveData: false, quota: undefined };
		expect(autoBudget(device)).toBe(2 * MB);
		expect(autoBudget({ ...device, memory: 1 })).toBe(MB);
		expect(autoBudget({ ...device, memory: 4 })).toBe(2 * MB);
		expect(autoBudget({ ...device, memory: 8 })).toBe(5 * MB);
		expect(autoBudget({ ...device, memory: 8, saveData: true })).toBe(2.5 * MB);
		expect(autoBudget({ ...device, memory: 8, quota: 100 * MB })).toBe(MB);
	});
});

describe('indexedDBStorage', () => {
	it('keeps partitions apart, and loads metadata without values', async () => {
		globalThis.indexedDB = new IDBFactory();
		const storage: PersistentStorage = indexedDBStorage({ name: 'test' });
		const meta = (key: string) => ({
			key,
			size: 1,
			savedAt: 1,
			expiresAt: null,
			lastUsed: 1,
			version: '',
		});
		await storage.commit(
			'ada',
			[
				{ meta: meta('a'), value: 'A' },
				{ meta: meta('b'), value: 'B' },
			],
			[],
		);
		await storage.commit('grace', [{ meta: meta('a'), value: 'G' }], []);
		await storage.commit('ada', [{ meta: { ...meta('a'), lastUsed: 2 } }], ['b']);

		expect(await storage.index('ada')).toEqual([{ ...meta('a'), lastUsed: 2 }]);
		expect(await storage.get('ada', 'a')).toBe('A');
		expect(await storage.get('ada', 'b')).toBeUndefined();
		expect(await storage.get('grace', 'a')).toBe('G');

		await storage.clear('ada');
		expect(await storage.index('ada')).toEqual([]);
		expect(await storage.get('grace', 'a')).toBe('G');
	});

	it('backs a store across a restart', async () => {
		globalThis.indexedDB = new IDBFactory();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(indexedDBStorage(), 'ada'),
		});
		await value(before, shelf);
		await saved();
		const remote = server(books());
		const after = createDataStore({
			transport: remote.transport,
			persist: cache(indexedDBStorage(), 'ada'),
		});
		expect((await value<Book[]>(after, shelf)).value).toHaveLength(3);
		expect(remote.log).toEqual([]);
	});
});
