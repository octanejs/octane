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
	feed,
	indexedDBStorage,
	listen,
	memoryStorage as createMemoryStorage,
	read,
	view,
	write,
	type DataReply,
	type DataRequest,
	type FeedFrame,
	type Listener,
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

/** Whether the server applied a write, by the operation ID it was sent with. */
const receipt = read({
	name: 'receipt',
	input: schema<{ operationId: string }>((v) => typeof v?.operationId === 'string'),
	output: schema<{ applied: boolean }>((v) => typeof v?.applied === 'boolean'),
});

/** A server over `books`, logging each request it answers. */
function server(books: Book[], applied = new Set<string>()) {
	const log: string[] = [];
	/** Make the next request fail before the server sees it, or after it applied a write. */
	const faults = { lose: null as 'request' | 'reply' | null };
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
		const lose = faults.lose;
		faults.lose = null;
		if (lose === 'request') throw new Error('offline');
		log.push(`${request.kind} ${request.name}`);
		if (request.name === 'receipt') {
			const { operationId } = request.input as { operationId: string };
			return { ok: true, value: { applied: applied.has(operationId) } };
		}
		if (request.kind === 'read') return { ok: true, value: answer(request.name, request.input) };
		const { id, read } = request.input as { id: string; read: boolean };
		books.find((book) => book.id === id)!.read = read;
		applied.add(request.operationId!);
		if (lose === 'reply') throw new Error('connection reset after the server applied the write');
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
		faults,
		books,
		applied,
		/** Hold requests, or one kind of them, until the returned function is called. */
		hold(kind: DataRequest['kind'] | 'all' = 'all') {
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
	vi.restoreAllMocks();
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
		await vi.waitFor(() => expect(listPartitions(storage)).toHaveLength(1));
		// Nothing the storage holds names the account, the read or a title.
		const index = await Promise.all(
			listPartitions(storage).map((name) => everything(storage, name)),
		);
		// These words can occur inside a random Base64 value.
		expect(index.join('')).not.toMatch(
			/(?<![A-Za-z0-9+/=])(?:ada|shelf|Kindred)(?![A-Za-z0-9+/=])/,
		);

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
			return storage;
		}
		const measured = await fill(Infinity);
		const [shelfSize, unreadSize, countSize] = (
			await measured.index(listPartitions(measured)[0]!)
		).map((meta) => meta.size);

		// Room for the shelf and the count, with slack for sizes that vary by a few characters,
		// but not for the view as well.
		const budget = Math.ceil((shelfSize! + countSize! + 40) / 0.9);
		expect(shelfSize! + unreadSize! + countSize!).toBeGreaterThan(budget);
		const storage = await fill(budget);

		// The mounted shelf is the oldest, but only `unread`, the least recently used of the rest, went.
		const remote = server(books());
		remote.hold();
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const handles = [shelf, count, unread].map((contract) => {
			const handle = after.read(contract as any, undefined);
			handle.subscribe(() => {});
			return handle;
		});
		await saved();
		expect(handles.map((handle) => handle.getSnapshot().status)).toEqual([
			'ready',
			'ready',
			'pending',
		]);
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

		// Room for the two saved values, with slack for sizes that vary by a few characters,
		// and not for one more of the count's size.
		const budget = Math.ceil((shelfSize! + countSize! + 40) / 0.9);
		expect(shelfSize! + 2 * countSize!).toBeGreaterThan(budget);
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

	it('never purges at startup what a component is waiting to restore', async () => {
		const storage = memoryStorage();
		const seed = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada', { budget: Infinity }),
		});
		for (const contract of [shelf, unread]) {
			(await value(seed, contract)).stop();
			await saved();
		}
		const [shelfSize] = (await storage.index(listPartitions(storage)[0]!)).map((meta) => meta.size);

		// A budget that holds less than the shelf: over budget from the moment it starts.
		const remote = server(books());
		const store = createDataStore({
			transport: remote.transport,
			persist: cache(storage, 'ada', { budget: shelfSize! - 1 }),
		});
		await value(store, shelf);
		expect(remote.log).toEqual([]);
	});

	it('marks saved values stale when a write changes what they hold, though nothing loaded them', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		(await value(before, shelf)).stop();
		await saved();

		// The next session writes to a book without loading the shelf.
		const second = server(first.books);
		const writer = createDataStore({ transport: second.transport, persist: cache(storage, 'ada') });
		await writer.write(setRead, { id: 'a', read: true });
		await saved();

		// The shelf saved before the write is still fresh, yet it no longer matches the server.
		const third = server(first.books);
		const after = createDataStore({ transport: third.transport, persist: cache(storage, 'ada') });
		const shown = await value<Book[]>(after, shelf);
		await vi.waitFor(() => expect(shown.handle.getSnapshot().value![0]!.read).toBe(true));
		expect(third.log).toEqual(['read shelf']);
	});

	it.each([true, false])(
		'retries an idle cache save once after a storage failure (recovers: %s)',
		async (recover) => {
			const inner = memoryStorage();
			let attempts = 0;
			const storage: PersistentStorage = {
				...inner,
				commit(partition, put, remove) {
					if (put.some(({ meta, value }) => value !== undefined && meta.key !== partition)) {
						attempts++;
						if (!recover || attempts === 1) return Promise.reject(new Error('unavailable'));
					}
					return inner.commit(partition, put, remove);
				},
			};
			const first = server(books());
			const before = createDataStore({
				transport: first.transport,
				persist: cache(storage, 'ada'),
			});
			await before.prefetch(shelf, undefined);
			await vi.waitFor(() => expect(attempts).toBe(2));
			// Give a mistakenly self-rearming retry time to run again.
			await new Promise((resolve) => setTimeout(resolve, 250));
			expect(attempts).toBe(2);
			const remote = server(books());
			const next = createDataStore({ transport: remote.transport, persist: cache(inner, 'ada') });
			await next.prefetch(shelf, undefined);
			expect(remote.log).toEqual(recover ? [] : ['read shelf']);
		},
	);

	it('saves marks again after storage fails to save them', async () => {
		const inner = memoryStorage();
		let failMarks = false;
		const storage: PersistentStorage = {
			...inner,
			commit(partition, put, remove) {
				// The marks are the only value saved under their partition's own name.
				if (failMarks && put[0]?.meta.key === partition) {
					failMarks = false;
					return Promise.reject(new Error('quota exceeded'));
				}
				return inner.commit(partition, put, remove);
			},
		};
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		(await value(before, shelf)).stop();
		await saved();

		failMarks = true;
		const writer = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		await writer.write(setRead, { id: 'a', read: true });
		await saved();
		expect(failMarks).toBe(false);
		// Any later save writes the marks that failed.
		(await value(writer, count)).stop();
		await saved();

		const remote = server(first.books);
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		await value(after, shelf);
		await vi.waitFor(() => expect(remote.log).toContain('read shelf'));
	});

	it('marks a saved value stale when its tag is invalidated later in the same millisecond', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(Date.now());
		const storage = memoryStorage();
		const tally = read({ name: 'count', output: count.output, tags: ['count'], fresh: 60_000 });
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		(await value(before, tally)).stop();
		await vi.waitFor(() => expect(listPartitions(storage)).toHaveLength(1));

		createDataStore({ transport: first.transport, persist: cache(storage, 'ada') }).invalidate([
			'count',
		]);
		await vi.waitFor(() => expect(listPartitions(storage)).toHaveLength(2));

		const remote = server(books());
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		await value(after, tally);
		await vi.waitFor(() => expect(remote.log).toEqual(['read count']));
	});

	it('keeps fresh a value saved in the same millisecond with the write already in it', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(Date.now());
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		// Mounted, the shelf comes back in the write's reply and is saved with the write.
		await value(before, shelf);
		await before.write(setRead, { id: 'a', read: true });
		await saved();

		const remote = server(first.books);
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		expect((await value<Book[]>(after, shelf)).value[0]!.read).toBe(true);
		expect(remote.log).toEqual([]);
	});

	it('saves the views a server-ordered read gave a newer copy of a record', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		await value(before, unread);
		await saved();
		// Another user renames a book; the shelf, ordered by the server, brings the new title.
		first.books[1]!.title = 'Piranesi (revised)';
		await value(before, shelf);
		await saved();

		const remote = server(first.books);
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const restored = await value<Book[]>(after, unread);
		expect(restored.value.map((book) => book.title)).toContain('Piranesi (revised)');
		expect(remote.log).toEqual([]);
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

describe('octane/data durable writes', () => {
	const durable = (storage: PersistentStorage) =>
		cache(storage, 'ada', { journal: { writes: [setRead], receipt } });

	/** A restart: a new store over the same storage and server data. */
	function restart(storage: PersistentStorage, previous: ReturnType<typeof server>) {
		const remote = server(previous.books, previous.applied);
		return {
			remote,
			store: createDataStore({ transport: remote.transport, persist: durable(storage) }),
		};
	}

	it('saves a durable write before sending it', async () => {
		const events: string[] = [];
		const inner = memoryStorage();
		const storage: PersistentStorage = {
			...inner,
			async commit(partition, put, remove) {
				await inner.commit(partition, put, remove);
				if (put.length > 0) events.push('saved');
			},
		};
		const remote = server(books());
		const store = createDataStore({
			transport: (request) => {
				events.push(`sent ${request.name}`);
				return remote.transport(request);
			},
			persist: durable(storage),
		});
		await store.write(setRead, { id: 'a', read: true });
		expect(events).toEqual(['saved', 'sent setRead']);
	});

	it('shows a write left uncertain before a restart, and keeps it once its receipt says it landed', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await value(before, shelf);
		first.faults.lose = 'reply';
		await expect(before.write(setRead, { id: 'a', read: true })).rejects.toThrow(/unknown/);
		await saved();

		const { remote, store } = restart(storage, first);
		const shown = await value<Book[]>(store, shelf);
		// Confirmed by its receipt, the write reloads the reads it affects; it is not sent again.
		await vi.waitFor(() => expect(remote.log).toEqual(['read receipt', 'read shelf']));
		expect(shown.handle.getSnapshot().value![0]!.read).toBe(true);

		// Settled, it leaves the journal: the next start looks nothing up.
		await saved();
		const again = restart(storage, remote);
		await value(again.store, shelf);
		await saved();
		expect(again.remote.log).toEqual([]);
	});

	it('rolls back a write left uncertain before a restart once its receipt says it never arrived', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await value(before, shelf);
		await saved();
		first.faults.lose = 'request';
		await expect(before.write(setRead, { id: 'a', read: true })).rejects.toThrow(/unknown/);
		await saved();

		const { remote, store } = restart(storage, first);
		const release = remote.hold('read');
		const shown = await value<Book[]>(store, shelf);
		// The saved shelf predates the write; the journal puts the edit back over it.
		await vi.waitFor(() => expect(shown.handle.getSnapshot().value![0]!.read).toBe(true));
		release();
		await vi.waitFor(() => expect(shown.handle.getSnapshot().value![0]!.read).toBe(false));
		expect(remote.log).toEqual(['read receipt']);

		// Rolled back, it leaves the journal too.
		await saved();
		const again = restart(storage, remote);
		await value(again.store, shelf);
		await saved();
		expect(again.remote.log).toEqual([]);
	});

	it.each([
		'storage read fails',
		'storage returns unreadable data',
		'write no longer declared',
		'input schema changed',
	] as const)('preserves a journaled write for a later restart when %s', async (reason) => {
		const inner = memoryStorage();
		let failRead = false;
		const storage: PersistentStorage = {
			...inner,
			get(partition, key) {
				if (failRead && partition !== key) {
					failRead = false;
					return reason === 'storage returns unreadable data'
						? Promise.resolve('incomplete journal value')
						: Promise.reject(new Error('storage temporarily unavailable'));
				}
				return inner.get(partition, key);
			},
		};
		const first = server(books());
		first.faults.lose = 'reply';
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await expect(before.write(setRead, { id: 'a', read: true })).rejects.toThrow(/unknown/);

		const incompatible = write({ name: setRead.name, input: schema(() => false) });
		const writes = {
			'storage read fails': [setRead],
			'storage returns unreadable data': [setRead],
			'write no longer declared': [],
			'input schema changed': [incompatible],
		}[reason];
		failRead = reason === 'storage read fails' || reason === 'storage returns unreadable data';
		const intermediate = server(first.books, first.applied);
		createDataStore({
			transport: intermediate.transport,
			persist: cache(storage, 'ada', { journal: { writes, receipt } }),
		});
		await saved();
		expect(failRead).toBe(false);
		expect(intermediate.log).toEqual([]);

		const { remote } = restart(storage, first);
		await vi.waitFor(() => expect(remote.log).toEqual(['read receipt']));
		expect(first.applied.size).toBe(1);
	});

	it.each(['applied', 'refused', 'offline'] as const)(
		'settles an obsolete journal entry by its original receipt (%s)',
		async (outcome) => {
			const storage = memoryStorage();
			const first = server(books());
			const cachedShelf = read({
				name: shelf.name,
				output: shelf.output,
				fresh: Infinity,
				expire: Infinity,
			});
			const now = Date.now();
			vi.spyOn(Date, 'now').mockReturnValue(now);
			const before = createDataStore({ transport: first.transport, persist: durable(storage) });
			await before.prefetch(cachedShelf, undefined);
			const seed = before.dehydrate();
			await saved();
			first.faults.lose = outcome === 'refused' ? 'request' : 'reply';
			await expect(before.write(setRead, { id: 'a', read: true })).rejects.toThrow(/unknown/);
			await saved();

			vi.mocked(Date.now).mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
			const intermediate = server(first.books, first.applied);
			if (outcome === 'offline') intermediate.faults.lose = 'request';
			let receipts = 0;
			const hydrating = createDataStore({
				seed,
				transport(request) {
					if (request.name === 'receipt') receipts++;
					return intermediate.transport(request);
				},
				persist: cache(storage, 'ada', { journal: { writes: [], receipt } }),
			});
			await vi.waitFor(() => expect(receipts).toBe(1));
			await saved();
			const { store, remote } = restart(storage, first);
			await saved();
			if (outcome === 'offline') {
				await vi.waitFor(() => expect(remote.log).toContain('read receipt'));
			} else {
				expect(remote.log).toEqual([]);
				await value(store, cachedShelf);
				await saved();
				expect(remote.log).toEqual(outcome === 'applied' ? ['read shelf'] : []);
			}
			// This read was still buffered in the SSR seed when the journal checked the receipt.
			expect(hydrating.read(cachedShelf, undefined).getSnapshot()).toMatchObject({
				status: 'ready',
				stale: outcome === 'applied',
			});
		},
	);

	it('keeps a write whose receipt cannot be read for the next start', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		first.faults.lose = 'reply';
		await before.write(setRead, { id: 'a', read: true }).catch(() => {});
		await saved();

		const offline = server(first.books, first.applied);
		offline.faults.lose = 'request';
		createDataStore({ transport: offline.transport, persist: durable(storage) });
		await saved();

		const { remote } = restart(storage, offline);
		await vi.waitFor(() => expect(remote.log).toEqual(['read receipt']));
	});

	it('recovers writes in the order they were submitted, whatever order storage lists them in', async () => {
		const inner = memoryStorage();
		const storage: PersistentStorage = {
			...inner,
			index: async (partition) => (await inner.index(partition)).reverse(),
		};
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await value(before, shelf);
		await saved();
		for (const read of [true, false]) {
			first.faults.lose = 'request';
			await before.write(setRead, { id: 'a', read }).catch(() => {});
		}
		await saved();

		const { remote, store } = restart(storage, first);
		remote.hold('read');
		const shown = await value<Book[]>(store, shelf);
		await saved();
		// The later edit wins, as it did before the restart.
		expect(shown.handle.getSnapshot().value![0]!.read).toBe(false);
	});

	it('keeps a settled write recoverable until its invalidations are durable', async () => {
		const inner = memoryStorage();
		let rejectMarks = true;
		let failed = false;
		const storage: PersistentStorage = {
			...inner,
			commit(partition, put, remove) {
				if (rejectMarks && put.some(({ meta }) => meta.key === partition)) {
					failed = true;
					return Promise.reject(new Error('could not save invalidations'));
				}
				return inner.commit(partition, put, remove);
			},
		};
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await before.write(setRead, { id: 'a', read: true });
		await vi.waitFor(() => expect(failed).toBe(true));

		rejectMarks = false;
		const { remote } = restart(storage, first);
		await vi.waitFor(() => expect(remote.log).toEqual(['read receipt']));
		await saved();
		const again = restart(storage, remote);
		await saved();
		expect(again.remote.log).toEqual([]);
	});

	it('removes a settled write from the journal after a failed removal', async () => {
		const inner = memoryStorage();
		let failRemoval = true;
		const storage: PersistentStorage = {
			...inner,
			commit(partition, put, remove) {
				if (failRemoval && put.length === 0 && remove.length > 0) {
					failRemoval = false;
					return Promise.reject(new Error('quota exceeded'));
				}
				return inner.commit(partition, put, remove);
			},
		};
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await before.write(setRead, { id: 'a', read: true });
		await saved();
		expect(failRemoval).toBe(false);
		// Any later save retries the removal.
		await before.write(setRead, { id: 'b', read: true });
		await saved();

		const { remote } = restart(storage, first);
		await saved();
		expect(remote.log).toEqual([]);
	});

	it('journals only the writes it lists', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({
			transport: first.transport,
			persist: cache(storage, 'ada', { journal: { writes: [], receipt } }),
		});
		first.faults.lose = 'reply';
		await before.write(setRead, { id: 'a', read: true }).catch(() => {});
		await saved();

		const { remote } = restart(storage, first);
		await saved();
		expect(remote.log).toEqual([]);
	});

	it('forgets settled writes, and every write when the store is retired', async () => {
		const storage = memoryStorage();
		const first = server(books());
		const before = createDataStore({ transport: first.transport, persist: durable(storage) });
		await before.write(setRead, { id: 'b', read: true });
		first.faults.lose = 'reply';
		await before.write(setRead, { id: 'c', read: true }).catch(() => {});
		before.retire();
		await saved();

		const { remote } = restart(storage, first);
		await saved();
		expect(remote.log).toEqual([]);
	});
});

describe('octane/data live updates and cache lifecycle', () => {
	/** The shelf's count, fresh for a minute, so a restored copy needs no request. */
	const tally = read({ name: 'count', output: count.output, fresh: 60_000 });

	/** A memory adapter whose commits wait while `held` and fail while `failing`. */
	function faultyStorage() {
		const inner = memoryStorage();
		const state = { held: null as Promise<void> | null, failing: false, commits: 0, clears: 0 };
		const storage: PersistentStorage = {
			...inner,
			async commit(partition, put, remove) {
				state.commits++;
				await state.held;
				if (state.failing) throw new Error('disk failed');
				return inner.commit(partition, put, remove);
			},
			async clear(partition) {
				state.clears++;
				if (state.failing) throw new Error('disk failed');
				return inner.clear(partition);
			},
		};
		return { inner, storage, state };
	}

	it('saves a published value, which a reopened store restores without loading', async () => {
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		const shown = await value<Book[]>(before, shelf);
		const kelp = [{ id: 'd', title: 'Kelp', read: false }];
		await before.publish(shelf, undefined, kelp);
		expect(shown.handle.getSnapshot().value).toEqual(kelp);
		await saved();

		const remote = server(books());
		const after = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		expect((await value<Book[]>(after, shelf)).value).toEqual(kelp);
		expect(remote.log).toEqual([]);
	});

	it('keeps the saved value of a read whose published value is refused', async () => {
		const storage = memoryStorage();
		const first = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(first, shelf);
		await saved();

		// Nothing loaded the shelf in this session.
		const second = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await expect(second.publish(shelf, undefined, [{ id: 'd' }])).rejects.toBeDefined();
		await saved();

		const remote = server(books());
		const third = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		await value(third, shelf);
		expect(remote.log).toEqual([]);
	});

	it.each(['restore', 'fetch'])(
		'erases a read while its %s is in flight, and keeps the others',
		async (pending) => {
			const storage = memoryStorage();
			const first = createDataStore({
				transport: server(books()).transport,
				persist: cache(storage, 'ada'),
			});
			await value(first, shelf);
			await value(first, tally);
			await saved();

			const remote = server(books());
			const store = createDataStore({
				transport: remote.transport,
				persist: cache(storage, 'ada'),
			});
			const handle = store.read(shelf, undefined);
			if (pending === 'fetch') await value(store, shelf);
			else handle.subscribe(() => {});
			const release = remote.hold();
			if (pending === 'fetch') void handle.refresh();
			await store.forget(shelf, undefined);
			release();
			await saved();
			expect(handle.getSnapshot().status).toBe('pending');

			const next = server(books());
			const after = createDataStore({ transport: next.transport, persist: cache(storage, 'ada') });
			expect((await value<number>(after, tally)).value).toBe(3);
			await value(after, shelf);
			expect(next.log).toEqual(['read shelf']);
		},
	);

	it('reports a storage failure to the caller that erases a read', async () => {
		const { storage, state } = faultyStorage();
		const store = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(store, shelf);
		await saved();
		state.failing = true;
		await expect(store.forget(shelf, undefined)).rejects.toThrow('disk failed');
	});

	it('empties the partition before awaited retirement settles, after a save in flight', async () => {
		const { inner, storage, state } = faultyStorage();
		const remote = server(books());
		const store = createDataStore({
			transport: remote.transport,
			persist: cache(storage, 'ada', { journal: { writes: [setRead], receipt } }),
		});
		// A value, an uncertain journaled write, and a stale mark: one in each partition.
		const shown = await value(store, shelf);
		remote.faults.lose = 'reply';
		await store.write(setRead, { id: 'a', read: true }).catch(() => {});
		store.invalidate(['count']);
		await saved();
		const partitions = listPartitions(inner);
		expect(partitions).toHaveLength(3);

		let release!: () => void;
		state.held = new Promise((resolve) => (release = resolve));
		const commits = state.commits;
		await shown.handle.refresh();
		await vi.waitFor(() => expect(state.commits).toBe(commits + 1));
		const retiring = store.retire();
		expect(store.retire()).toBe(retiring);
		release();
		await retiring;
		for (const partition of partitions) expect(await storage.index(partition)).toEqual([]);
		expect(state.clears).toBe(3);
	});

	it('reports a failed retirement cleanup to every caller that awaits it', async () => {
		const { storage, state } = faultyStorage();
		const store = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada'),
		});
		await value(store, shelf);
		await saved();
		state.failing = true;
		const retiring = store.retire();
		await expect(retiring).rejects.toThrow('disk failed');
		await expect(store.retire()).rejects.toThrow('disk failed');
		expect(state.clears).toBe(3);

		// One that does not wait is not told.
		const other = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'grace'),
		});
		void other.retire();
		await saved();
	});

	it('derives its keys from a non-exportable CryptoKey, which only the same key opens', async () => {
		const opaque = () =>
			crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, [
				'deriveKey',
			]);
		const key = await opaque();
		const storage = memoryStorage();
		const before = createDataStore({
			transport: server(books()).transport,
			persist: cache(storage, 'ada', { key }),
		});
		await value(before, shelf);
		await saved();

		// A worker reopening the same handle, through a provider.
		const same = server(books());
		const after = createDataStore({
			transport: same.transport,
			persist: cache(storage, 'ada', { key: async () => key }),
		});
		await value(after, shelf);
		expect(same.log).toEqual([]);

		const other = server(books());
		const stranger = createDataStore({
			transport: other.transport,
			persist: cache(storage, 'ada', { key: await opaque() }),
		});
		await value(stranger, shelf);
		expect(other.log).toEqual(['read shelf']);
	});
});

describe('octane/data feeds across restarts', () => {
	const bookChanges = feed({
		name: 'books.changes',
		event: schema<Book>(isBook),
		changes: (book) => ({ put: Book, value: book }),
		covers: ['book'],
	});

	/** A feed source with retained history: a connection resumes after its cursor. */
	function history() {
		const events: Book[] = [];
		const cursors: Array<string | null> = [];
		let wake = () => {};
		const listener: Listener = (request, signal) => ({
			async *[Symbol.asyncIterator](): AsyncGenerator<FeedFrame> {
				cursors.push(request.cursor);
				let seen = request.cursor === null ? events.length : Number(request.cursor);
				yield { cursor: String(seen) };
				while (!signal.aborted) {
					while (seen < events.length) {
						const event = events[seen++];
						yield { event, id: String(seen), cursor: String(seen) };
					}
					await new Promise<void>((resolve) => {
						wake = resolve;
						signal.addEventListener('abort', () => resolve(), { once: true });
					});
				}
			},
		});
		return { listener, cursors, publish: (book: Book) => (events.push(book), wake()) };
	}

	const durable = (storage: PersistentStorage) =>
		cache(storage, 'ada', { journal: { writes: [setRead], receipt } });

	it('waits for the durable cursor when a new observer replaces one during restoration', async () => {
		const storage = memoryStorage();
		const feedLog = history();
		const remote = server(books());
		const first = createDataStore({
			transport: remote.transport,
			persist: cache(storage, 'ada'),
			listen: feedLog.listener,
		});
		const stop = listen(first, bookChanges).subscribe(() => {});
		await vi.waitFor(() => expect(feedLog.cursors).toEqual([null]));
		await saved();
		stop();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const waiting = vi.fn(async (partition: string) => {
			await gate;
			return storage.index(partition);
		});
		const after = createDataStore({
			transport: remote.transport,
			persist: cache({ ...storage, index: waiting }, 'ada'),
			listen: feedLog.listener,
		});
		const handle = listen(after, bookChanges);
		const leave = handle.subscribe(() => {});
		await vi.waitFor(() => expect(waiting).toHaveBeenCalled());
		leave();
		const finish = handle.subscribe(() => {});
		release();
		await vi.waitFor(() => expect(feedLog.cursors).toEqual([null, '0']));
		finish();
		await after.retire();
	});

	it('catches up after a restart on what it missed: a rename shows and a refused write rolls back, with nothing reloaded', async () => {
		const storage = memoryStorage();
		const feedLog = history();
		const first = server(books());
		const before = createDataStore({
			transport: first.transport,
			persist: durable(storage),
			listen: feedLog.listener,
		});
		await value(before, shelf);
		const stop = listen(before, bookChanges).subscribe(() => {});
		await vi.waitFor(() => expect(feedLog.cursors).toEqual([null]));
		// A bookmark that never reached the server, so its outcome is unknown.
		first.faults.lose = 'request';
		await expect(before.write(setRead, { id: 'a', read: true })).rejects.toThrow(/unknown/);
		await saved();
		stop();

		// While the page is closed, the book is renamed; the bookmark never arrived.
		const renamed = { id: 'b', title: 'Piranesi, revised', read: false };
		first.books[1] = renamed;
		feedLog.publish(renamed);

		const remote = server(first.books, first.applied);
		const store = createDataStore({
			transport: remote.transport,
			persist: durable(storage),
			listen: feedLog.listener,
		});
		const shown = await value<Book[]>(store, shelf);
		stops.push(listen(store, bookChanges).subscribe(() => {}));
		await vi.waitFor(() =>
			expect(shown.handle.getSnapshot().value!.map((book) => book.title)).toContain(
				'Piranesi, revised',
			),
		);
		await vi.waitFor(() => expect(shown.handle.getSnapshot().value![0]!.read).toBe(false));
		// It resumed after the cursor the first session saved, and loaded only the receipt.
		expect(feedLog.cursors).toEqual([null, '0']);
		expect(remote.log).toEqual(['read receipt']);
		shown.stop();
	});

	it.each(['offline', 'evicted', 'reopened', 'superseded', 'forgotten'] as const)(
		'recovers a failed feed value commit after the read is %s',
		async (caseName) => {
			const inner = memoryStorage();
			let failValues = false;
			let failed = false;
			let resolveCommit!: () => void;
			const release = new Promise<void>((resolve) => (resolveCommit = resolve));
			let retried!: () => void;
			const nextCheckpoint = new Promise<void>((resolve) => (retried = resolve));
			const storage: PersistentStorage = {
				...inner,
				commit(partition, put, remove) {
					if (
						failValues &&
						put.some(({ meta, value }) => value !== undefined && meta.key !== partition)
					) {
						failed = true;
						return release.then(() => {
							throw new Error('value store unavailable');
						});
					}
					const committed = inner.commit(partition, put, remove);
					if (failed && put.some(({ meta }) => meta.key === partition))
						void committed.then(retried);
					return committed;
				},
			};
			const collection = read({
				name: shelf.name,
				output: shelf.output,
				fresh: 60_000,
				keep: 0,
			});
			const replacements = feed({
				name: 'first-book',
				event: schema<Book>(isBook),
				changes: (book) => ({ read: collection, input: undefined, value: [book] }),
				covers: [],
			});
			const feedLog = history();
			const remote = server(books());
			const open = () =>
				createDataStore({
					transport: remote.transport,
					persist: cache(storage, 'ada'),
					listen: feedLog.listener,
				});
			const before = open();
			const original = await value<Book[]>(before, collection);
			const stop = listen(before, replacements).subscribe(() => {});
			await vi.waitFor(() => expect(feedLog.cursors).toEqual([null]));
			await saved();

			failValues = true;
			const renamed = { ...books()[0]!, title: 'New title' };
			feedLog.publish(renamed);
			await vi.waitFor(() => expect(original.handle.getSnapshot().value![0]).toEqual(renamed));
			await vi.waitFor(() => expect(failed).toBe(true));
			let expected = renamed;
			let cursor = '1';
			if (caseName === 'superseded') {
				expected = { ...renamed, title: 'Later title' };
				feedLog.publish(expected);
				await vi.waitFor(() => expect(original.handle.getSnapshot().value![0]).toEqual(expected));
				cursor = '2';
			}
			stop();
			if (caseName === 'offline') {
				resolveCommit();
				await saved();
				const after = open();
				const shown = await value<Book[]>(after, collection);
				stops.push(listen(after, replacements).subscribe(() => {}));
				await vi.waitFor(() => expect(feedLog.cursors).toEqual([null, '0']));
				await vi.waitFor(() => expect(shown.handle.getSnapshot().value![0]).toEqual(renamed));
				return;
			}

			if (caseName !== 'superseded') {
				original.stop();
				await vi.waitFor(() => expect(original.handle.getSnapshot().status).toBe('pending'));
			}
			if (caseName === 'reopened') {
				const shown = await value<Book[]>(before, collection);
				expect(shown.value[0]).toEqual(renamed);
			}
			const forgotten = caseName === 'forgotten' ? before.forget(collection, undefined) : undefined;
			failValues = false;
			resolveCommit();
			await forgotten;
			await nextCheckpoint;
			const after = open();
			stops.push(listen(after, replacements).subscribe(() => {}));
			await vi.waitFor(() => expect(feedLog.cursors).toEqual([null, cursor]));
			remote.log.length = 0;
			const restored = await value<Book[]>(after, collection);
			expect(restored.value[0]).toEqual(caseName === 'forgotten' ? books()[0] : expected);
			expect(remote.log).toEqual(caseName === 'forgotten' ? ['read shelf'] : []);
		},
	);

	it('restores stale a saved value that missed an event because it was not in memory', async () => {
		const storage = memoryStorage();
		const feedLog = history();
		const first = server(books());
		// An earlier session saved the shelf.
		const earlier = createDataStore({ transport: first.transport, persist: cache(storage, 'ada') });
		(await value(earlier, shelf)).stop();
		await saved();

		const before = createDataStore({
			transport: first.transport,
			persist: cache(storage, 'ada'),
			listen: feedLog.listener,
		});
		const shownBefore = await value<Book[]>(before, unread, undefined);
		stops.push(listen(before, bookChanges).subscribe(() => {}));
		await vi.waitFor(() => expect(feedLog.cursors).toEqual([null]));
		await saved();

		// This session never loaded the shelf, so only the unread list takes the rename.
		const renamed = { id: 'b', title: 'Piranesi, revised', read: false };
		first.books[1] = renamed;
		feedLog.publish(renamed);
		await vi.waitFor(() =>
			expect(shownBefore.handle.getSnapshot().value!.map((book) => book.title)).toContain(
				'Piranesi, revised',
			),
		);
		await saved();

		const remote = server(first.books);
		const store = createDataStore({ transport: remote.transport, persist: cache(storage, 'ada') });
		const unreadAfter = await value<Book[]>(store, unread, undefined);
		const shelfAfter = await value<Book[]>(store, shelf);
		await vi.waitFor(() =>
			expect(shelfAfter.handle.getSnapshot().value!.map((book) => book.title)).toContain(
				'Piranesi, revised',
			),
		);
		// The unread list was saved with the rename; the shelf, saved before it, reloaded.
		expect(unreadAfter.value.map((book) => book.title)).toContain('Piranesi, revised');
		expect(remote.log).toEqual(['read shelf']);
		unreadAfter.stop();
		shelfAfter.stop();
	});
});

const stops: Array<() => void> = [];
afterEach(() => {
	for (const stop of stops.splice(0)) stop();
});
