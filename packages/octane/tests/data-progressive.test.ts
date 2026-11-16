/**
 * A catalog search whose server answers in parts: provisional results while a
 * request runs, a confirmed page with a cursor for the next, and requests that
 * stop once nothing shows them.
 */
import * as devalue from 'devalue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createDataOwner,
	createDataStore,
	createReplica,
	memoryStorage,
	pages,
	read,
	view,
	type DataReply,
	type DataStore,
	type PageCursor,
	type PersistOptions,
	type ReadSnapshot,
	type StandardSchema,
	type Transport,
} from '../src/data/index.js';
import { schema, Todo } from './_data-todos.js';

interface Book {
	id: string;
	title: string;
}
/** One page of results, and the cursor of the page after it. */
interface Shelf {
	books: Book[];
	next: string | null;
}
interface Query {
	q: string;
	after?: string;
}

const isShelf = (value: any) =>
	Array.isArray(value?.books) && value.books.every((book: any) => typeof book?.title === 'string');
const query = schema<Query>((value) => typeof value?.q === 'string');
const search = read({
	name: 'catalog.search',
	input: query,
	output: schema<Shelf>(isShelf),
	tags: ['catalog'],
	cancel: true,
});
/** The same search, kept running whoever watches. */
const lookup = read({ name: 'catalog.lookup', input: query, output: search.output });
/** The same search again, whose values are current for a minute. */
const settledSearch = read({
	name: 'catalog.settled',
	input: query,
	output: search.output,
	fresh: 60_000,
});

const byCursor: PageCursor<Query, Shelf, Book> = {
	rows: (shelf) => shelf.books,
	next: (shelf, input) => (shelf.next ? { ...input, after: shelf.next } : null),
};

const shelf = (titles: string[], next: string | null = null): Shelf => ({
	books: titles.map((title) => ({ id: title, title })),
	next,
});
const titles = (handle: { getSnapshot(): { value: unknown } }) => {
	const value = handle.getSnapshot().value as Shelf | Book[] | undefined;
	return (Array.isArray(value) ? value : value?.books)?.map((book) => book.title);
};

/** A request the test answers by hand. */
interface Call {
	readonly input: Query;
	readonly signal: AbortSignal;
	/** Whether the store gave the transport a way to send previews. */
	readonly previews: boolean;
	preview(value: unknown): void;
	finish(value: unknown): void;
	fail(): void;
}

/**
 * A catalog server: every request waits for the test to preview, finish or
 * fail it. A `deaf` one carries on with a request it was told to stop.
 */
function catalog(deaf = false) {
	const calls: Call[] = [];
	const transport: Transport = (request, signal, preview) =>
		new Promise<DataReply>((resolve, reject) => {
			if (!deaf) signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			calls.push({
				input: request.input as Query,
				signal,
				previews: preview !== undefined,
				preview: (value) => preview?.(value),
				finish: (value) => resolve({ ok: true, value }),
				fail: () => reject(new Error('interrupted')),
			});
		});
	const call = async (index: number) => {
		await vi.waitFor(() => expect(calls.length).toBeGreaterThan(index));
		return calls[index]!;
	};
	return { calls, call, transport };
}

const quiet = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const loaded = (handle: { getSnapshot(): { status: string; preview: boolean } }) =>
	vi.waitFor(() => expect(handle.getSnapshot()).toMatchObject({ status: 'ready', preview: false }));

describe('octane/data previews', () => {
	it('shows each preview, then the reply, to one subscriber with no empty snapshot between', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const found = store.read(search, { q: 'fern' });
		const seen: ReadSnapshot<Shelf>[] = [];
		found.subscribe(() => seen.push(found.getSnapshot()));

		const request = await server.call(0);
		request.preview(shelf(['Fern Atlas', 'Ferns of the Nroth']));
		// A provisional value is a value to show, and is not a reload of one.
		expect(found.getSnapshot()).toMatchObject({
			status: 'ready',
			preview: true,
			refreshing: false,
		});
		request.preview(shelf(['Fern Atlas', 'Ferns of the Nroth', 'Fern Gardens']));

		// The reply corrects a title the previews carried.
		request.finish(shelf(['Fern Atlas', 'Ferns of the North', 'Fern Gardens', 'Tree Ferns']));
		await loaded(found);
		expect(seen.map((snapshot) => snapshot.value?.books.map((book) => book.title))).toEqual([
			undefined,
			['Fern Atlas', 'Ferns of the Nroth'],
			['Fern Atlas', 'Ferns of the Nroth', 'Fern Gardens'],
			['Fern Atlas', 'Ferns of the North', 'Fern Gardens', 'Tree Ferns'],
		]);
		expect(seen.map((snapshot) => snapshot.preview)).toEqual([false, true, true, false]);
	});

	it('keeps a preview out of the seed and out of storage', async () => {
		const server = catalog();
		const storage = memoryStorage();
		let saved = 0;
		const persist: PersistOptions = {
			partition: 'ada',
			key: 'a session secret of at least sixteen bytes',
			storage: {
				...storage,
				async commit(partition, put, remove) {
					await storage.commit(partition, put, remove);
					if (put.some((item) => item.value !== undefined)) saved++;
				},
			},
		};
		const store = createDataStore({ transport: server.transport, persist });
		const found = store.read(search, { q: 'fern' });
		found.subscribe(() => {});

		const request = await server.call(0);
		request.preview(shelf(['Fern Atlas']));
		expect(titles(found)).toEqual(['Fern Atlas']);
		await quiet(30);
		expect(saved).toBe(0);
		expect((devalue.parse(store.dehydrate()) as { reads: unknown[] }).reads).toEqual([]);

		request.finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await vi.waitFor(() => expect(saved).toBe(1));
		expect((devalue.parse(store.dehydrate()) as { reads: unknown[] }).reads).toHaveLength(1);
	});

	it('removes the preview when the load fails, and loads again when asked to', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const found = store.read(search, { q: 'fern' });
		found.subscribe(() => {});

		(await server.call(0)).preview(shelf(['Fern Atlas']));
		server.calls[0]!.fail();
		await vi.waitFor(() => expect(found.getSnapshot().status).toBe('error'));
		expect(found.getSnapshot()).toMatchObject({ value: undefined, preview: false });
		// A failed read waits to be asked again.
		await quiet();
		expect(server.calls).toHaveLength(1);

		const retried = found.refresh();
		(await server.call(1)).finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await retried;
		expect(titles(found)).toEqual(['Fern Atlas', 'Tree Ferns']);
		expect(found.getSnapshot().error).toBeUndefined();
	});

	it('keeps a confirmed value on screen through a reload’s previews and its failure', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const found = store.read(search, { q: 'fern' });
		found.subscribe(() => {});
		(await server.call(0)).finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await loaded(found);

		const reloading = found.refresh();
		(await server.call(1)).preview(shelf(['Fern Atlas']));
		expect(found.getSnapshot()).toMatchObject({ preview: false, refreshing: true });
		expect(titles(found)).toEqual(['Fern Atlas', 'Tree Ferns']);

		server.calls[1]!.fail();
		await reloading;
		expect(found.getSnapshot()).toMatchObject({ status: 'ready', preview: false });
		expect(found.getSnapshot().error).toBeInstanceOf(Error);
		expect(titles(found)).toEqual(['Fern Atlas', 'Tree Ferns']);
	});

	it('shows previews in the order they were sent, and the reply over one still validating', async () => {
		// A validator that answers after as long as the value asks.
		const slow: StandardSchema<unknown, Shelf & { wait: number }> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value) =>
					new Promise((resolve) =>
						setTimeout(
							() => resolve({ value: value as Shelf & { wait: number } }),
							(value as { wait: number }).wait,
						),
					),
			},
		};
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		// Its value is shown for 600 ms from its request, after which only what the next load sends is.
		const found = store.read(read({ name: 'catalog.slow', output: slow, expire: 600 }));
		const seen: unknown[] = [];
		found.subscribe(() => seen.push(titles(found)));

		const request = await server.call(0);
		request.preview({ ...shelf(['First']), wait: 30 });
		request.preview({ ...shelf(['Second']), wait: 0 });
		await vi.waitFor(() => expect(titles(found)).toEqual(['Second']));
		// The first preview validates last, and is older than the one shown.
		await quiet(50);
		expect(titles(found)).toEqual(['Second']);

		request.preview({ ...shelf(['Third']), wait: 40 });
		request.finish({ ...shelf(['Final']), wait: 0 });
		await loaded(found);
		// Once the value expires, no preview of the load that confirmed it is left to show.
		await server.call(1);
		expect(found.getSnapshot()).toMatchObject({ status: 'pending', preview: false });
		expect(seen).toEqual([undefined, ['Second'], ['Final'], undefined]);
	});

	it('tells a reader when the reply confirms the very value it previewed', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		// A read whose value is current once confirmed, so nothing else about it changes.
		const found = store.read(settledSearch, { q: 'fern' });
		const seen: boolean[] = [];
		found.subscribe(() => seen.push(found.getSnapshot().preview));

		const whole = shelf(['Fern Atlas']);
		const request = await server.call(0);
		request.preview(whole);
		request.finish(whole);
		await loaded(found);
		expect(seen).toEqual([false, true, false]);
	});

	it('shows nothing for a preview its schema refuses', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const found = store.read(search, { q: 'fern' });
		found.subscribe(() => {});

		const request = await server.call(0);
		request.preview({ books: 'none' });
		expect(found.getSnapshot()).toMatchObject({ status: 'pending', preview: false });
		request.finish(shelf(['Fern Atlas']));
		await loaded(found);
		expect(titles(found)).toEqual(['Fern Atlas']);
	});

	it('ignores the previews and the reply of a load another has replaced', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const found = store.read(lookup, { q: 'fern' });
		found.subscribe(() => {});

		const first = await server.call(0);
		first.preview(shelf(['Fern Atlas']));
		store.invalidate([lookup.name]);
		void found.refresh();
		// The load that replaced it starts with no preview of its own.
		expect(found.getSnapshot()).toMatchObject({ status: 'pending', preview: false });
		const second = await server.call(1);
		first.preview(shelf(['Late']));
		first.finish(shelf(['Late']));
		await quiet();
		expect(found.getSnapshot().status).toBe('pending');

		second.finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await loaded(found);
		expect(titles(found)).toEqual(['Fern Atlas', 'Tree Ferns']);
	});

	it('gives a view no way to preview, since its rows need the bounds of its reply', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		store
			.read(view({ name: 'todos.all', of: Todo, order: [['title', 'asc']] }))
			.subscribe(() => {});
		store.read(search, { q: 'fern' }).subscribe(() => {});
		await server.call(1);
		expect(server.calls.map((call) => call.previews)).toEqual([false, true]);
	});
});

describe('octane/data reads that cancel', () => {
	it('stops a load when its last observer leaves, and not before', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const fern = store.read(search, { q: 'fern' });
		const stopFirst = fern.subscribe(() => {});
		const stopSecond = fern.subscribe(() => {});
		const request = await server.call(0);
		request.preview(shelf(['Fern Atlas']));

		stopFirst();
		expect(request.signal.aborted).toBe(false);
		stopSecond();
		expect(request.signal.aborted).toBe(true);
		expect(fern.getSnapshot()).toMatchObject({ status: 'pending', preview: false });

		// What arrives late changes nothing, here or for a later reader.
		request.preview(shelf(['Late']));
		request.finish(shelf(['Late']));
		await quiet();
		expect(fern.getSnapshot().status).toBe('pending');

		fern.subscribe(() => {});
		(await server.call(1)).finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await loaded(fern);
		expect(titles(fern)).toEqual(['Fern Atlas', 'Tree Ferns']);
	});

	it('leaves a load running while a prefetch or a refresh waits on it', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const fern = store.read(search, { q: 'fern' });
		const stop = fern.subscribe(() => {});
		const fetched = store.prefetch(search, { q: 'fern' });
		stop();
		const request = await server.call(0);
		expect(request.signal.aborted).toBe(false);
		request.finish(shelf(['Fern Atlas']));
		await fetched;
		expect(titles(fern)).toEqual(['Fern Atlas']);

		const stopAgain = fern.subscribe(() => {});
		const refreshed = fern.refresh();
		stopAgain();
		const again = await server.call(1);
		expect(again.signal.aborted).toBe(false);
		again.finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await refreshed;
		expect(titles(fern)).toEqual(['Fern Atlas', 'Tree Ferns']);

		// The load after one that was waited on stops as any other does.
		store.invalidate(['catalog']);
		const stopLast = fern.subscribe(() => {});
		const last = await server.call(2);
		stopLast();
		expect(last.signal.aborted).toBe(true);
	});

	it('keeps the confirmed value when its reload is stopped', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const fern = store.read(search, { q: 'fern' });
		const stop = fern.subscribe(() => {});
		(await server.call(0)).finish(shelf(['Fern Atlas']));
		await loaded(fern);

		store.invalidate(['catalog']);
		const reload = await server.call(1);
		stop();
		expect(reload.signal.aborted).toBe(true);
		expect(fern.getSnapshot()).toMatchObject({ status: 'ready', refreshing: false, stale: true });
		expect(titles(fern)).toEqual(['Fern Atlas']);
	});

	it('leaves the load of a read that does not cancel running with no observer', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const fern = store.read(lookup, { q: 'fern' });
		const stop = fern.subscribe(() => {});
		const request = await server.call(0);
		stop();
		expect(request.signal.aborted).toBe(false);
		request.finish(shelf(['Fern Atlas']));
		await loaded(fern);
	});

	it('starts no load for a read let go while its saved value was looked up, unless one is waited on', async () => {
		const server = catalog();
		const store = createDataStore({
			transport: server.transport,
			persist: {
				partition: 'ada',
				key: 'a session secret of at least sixteen bytes',
				storage: memoryStorage(),
			},
		});
		store.read(search, { q: 'fern' }).subscribe(() => {})();
		await quiet(30);
		expect(server.calls).toHaveLength(0);

		// A prefetch that began with the lookup holds the load the lookup leads to.
		const fetched = store.prefetch(search, { q: 'moss' });
		const stop = store.read(search, { q: 'moss' }).subscribe(() => {});
		const request = await server.call(0);
		expect(request.input).toEqual({ q: 'moss' });
		stop();
		expect(request.signal.aborted).toBe(false);
		request.finish(shelf(['Moss Field Guide']));
		await fetched;
		expect(titles(store.read(search, { q: 'moss' }))).toEqual(['Moss Field Guide']);
	});
});

describe('octane/data progressive reads through a shared owner', () => {
	const closers: Array<() => void> = [];
	afterEach(() => {
		for (const close of closers.splice(0)) close();
	});

	/** An owner over `transport`, and `count` tabs sharing it; with `local`, the last is of another build. */
	function tabs(transport: Transport, count: number, local?: Transport): DataStore[] {
		const owner = createDataOwner({ transport });
		return Array.from({ length: count }, (_, index) => {
			const channel = new MessageChannel();
			owner.connect(channel.port1);
			const other = local !== undefined && index === count - 1;
			const store = createReplica(channel.port2, {
				transport: other
					? local
					: () => Promise.reject(new Error('this tab did not share its owner')),
				contracts: other ? [search] : [search, lookup],
			});
			closers.push(() => {
				void store.retire();
				channel.port1.close();
				channel.port2.close();
			});
			return store;
		});
	}

	it('shows a preview in each tab waiting on the read, and in one that joins after it', async () => {
		const server = catalog();
		const [first, second] = tabs(server.transport, 2);
		const one = first!.read(search, { q: 'fern' });
		one.subscribe(() => {});
		const request = await server.call(0);
		request.preview(shelf(['Fern Atlas']));
		await vi.waitFor(() => expect(titles(one)).toEqual(['Fern Atlas']));

		// The second tab joins the request in flight, and starts from its newest preview.
		const two = second!.read(search, { q: 'fern' });
		two.subscribe(() => {});
		await vi.waitFor(() => expect(titles(two)).toEqual(['Fern Atlas']));
		expect(two.getSnapshot().preview).toBe(true);

		request.preview(shelf(['Fern Atlas', 'Fern Gardens']));
		await vi.waitFor(() => {
			expect(titles(one)).toEqual(['Fern Atlas', 'Fern Gardens']);
			expect(titles(two)).toEqual(['Fern Atlas', 'Fern Gardens']);
		});

		request.finish(shelf(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']));
		await Promise.all([loaded(one), loaded(two)]);
		expect(titles(two)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']);
		expect(server.calls).toHaveLength(1);
	});

	it('keeps the owner’s request while one tab waits on it, and stops it when the last lets go', async () => {
		const server = catalog();
		const [first, second] = tabs(server.transport, 2);
		const one = first!.read(search, { q: 'fern' });
		const two = second!.read(search, { q: 'fern' });
		const stopOne = one.subscribe(() => {});
		const request = await server.call(0);
		const stopTwo = two.subscribe(() => {});
		request.preview(shelf(['Fern Atlas']));
		await vi.waitFor(() => expect(titles(two)).toEqual(['Fern Atlas']));

		stopOne();
		request.preview(shelf(['Fern Atlas', 'Fern Gardens']));
		await vi.waitFor(() => expect(titles(two)).toEqual(['Fern Atlas', 'Fern Gardens']));
		expect(request.signal.aborted).toBe(false);
		// The tab that let go shows nothing of the request it left.
		expect(one.getSnapshot()).toMatchObject({ status: 'pending', preview: false });

		stopTwo();
		await vi.waitFor(() => expect(request.signal.aborted).toBe(true));
		expect(server.calls).toHaveLength(1);

		one.subscribe(() => {});
		(await server.call(1)).finish(shelf(['Fern Atlas', 'Tree Ferns']));
		await loaded(one);
		expect(titles(one)).toEqual(['Fern Atlas', 'Tree Ferns']);
	});

	it('gives a tab that asks next a request of its own, not one that was stopped', async () => {
		// This server carries on with a request it was told to stop.
		const server = catalog(true);
		const [first, second] = tabs(server.transport, 2);
		const stop = first!.read(search, { q: 'fern' }).subscribe(() => {});
		const request = await server.call(0);
		stop();
		await vi.waitFor(() => expect(request.signal.aborted).toBe(true));

		const two = second!.read(search, { q: 'fern' });
		two.subscribe(() => {});
		(await server.call(1)).finish(shelf(['Fern Atlas']));
		await loaded(two);
		expect(titles(two)).toEqual(['Fern Atlas']);
	});

	it('asks the owner for nothing when a read is let go before its request is sent', async () => {
		const server = catalog();
		const [only] = tabs(server.transport, 1);
		only!.read(search, { q: 'fern' }).subscribe(() => {})();
		await quiet(30);
		expect(server.calls).toHaveLength(0);
	});

	it('shows previews and stops loads through its own transport once the owner refuses the tab', async () => {
		const server = catalog();
		const local = catalog();
		// The first tab's build sets the owner's contracts; the second is of another build.
		const [, other] = tabs(server.transport, 2, local.transport);
		const found = other!.read(search, { q: 'fern' });
		const stop = found.subscribe(() => {});
		const request = await local.call(0);
		request.preview(shelf(['Fern Atlas']));
		expect(titles(found)).toEqual(['Fern Atlas']);
		stop();
		expect(request.signal.aborted).toBe(true);
	});

	it('stops the owner’s request for any read once the tab that asked replaces its load', async () => {
		const server = catalog();
		const [only] = tabs(server.transport, 1);
		const found = only!.read(lookup, { q: 'fern' });
		found.subscribe(() => {});
		const request = await server.call(0);

		const reloading = found.refresh();
		await vi.waitFor(() => expect(request.signal.aborted).toBe(true));
		(await server.call(1)).finish(shelf(['Fern Atlas']));
		await reloading;
		expect(titles(found)).toEqual(['Fern Atlas']);
	});
});

describe('octane/data cursor pages', () => {
	/** A store whose list of `fern` has its first page, `Fern Atlas` and `Fern Gardens`, then cursor `B`. */
	async function firstPage(contract = search) {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const list = pages(store, contract, { q: 'fern' }, byCursor);
		const seen: Array<string[] | undefined> = [];
		const stop = list.subscribe(() => seen.push(titles(list)));
		(await server.call(0)).finish(shelf(['Fern Atlas', 'Fern Gardens'], 'B'));
		await loaded(list);
		return { server, store, list, seen, stop };
	}

	it('loads nothing for a snapshot, and keeps the same rows while only loading status changes', async () => {
		const server = catalog();
		const store = createDataStore({ transport: server.transport });
		const list = pages(store, search, { q: 'fern' }, byCursor);
		expect(pages(store, search, { q: 'fern' }, byCursor)).toBe(list);
		expect(list.getSnapshot()).toMatchObject({ status: 'pending', more: false });
		await quiet();
		expect(server.calls).toHaveLength(0);

		list.subscribe(() => {});
		(await server.call(0)).finish(shelf(['Fern Atlas', 'Fern Gardens'], 'B'));
		await loaded(list);
		const before = list.getSnapshot();
		expect(before).toMatchObject({ more: true, loadingMore: false });

		void list.loadMore();
		const loading = list.getSnapshot();
		expect(loading).not.toBe(before);
		expect(loading.loadingMore).toBe(true);
		expect(loading.value).toBe(before.value);

		(await server.call(1)).finish(shelf(['Tree Ferns']));
		await vi.waitFor(() => expect(list.getSnapshot().loadingMore).toBe(false));
		expect(list.getSnapshot().value).not.toBe(before.value);
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']);
		expect(list.getSnapshot().more).toBe(false);
	});

	it('joins repeated loads of the next page, shows its preview, and retries it at the same cursor', async () => {
		const { server, list } = await firstPage();
		void list.loadMore();
		let joined = false;
		void list
			.getSnapshot()
			.loadMore()
			.then(() => (joined = true));
		const second = await server.call(1);
		expect(second.input).toEqual({ q: 'fern', after: 'B' });
		await quiet();
		expect(joined).toBe(false);

		second.preview(shelf(['Tree Ferns']));
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']);
		expect(list.getSnapshot()).toMatchObject({ preview: true, loadingMore: true, more: false });

		second.fail();
		await vi.waitFor(() => expect(joined).toBe(true));
		expect(list.getSnapshot().error).toBeInstanceOf(Error);
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens']);
		expect(list.getSnapshot()).toMatchObject({
			status: 'ready',
			preview: false,
			loadingMore: false,
			more: true,
		});
		// Only one request was made for the two calls.
		await quiet();
		expect(server.calls).toHaveLength(2);

		const retried = list.loadMore();
		const again = await server.call(2);
		expect(again.input).toEqual({ q: 'fern', after: 'B' });
		again.finish(shelf(['Tree Ferns', 'Water Ferns']));
		await retried;
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns', 'Water Ferns']);
		expect(list.getSnapshot().error).toBeUndefined();
	});

	it('goes on past an empty page with a new cursor, and stops at one it has followed', async () => {
		const { server, list } = await firstPage();
		const empty = list.loadMore();
		(await server.call(1)).finish(shelf([], 'C'));
		await empty;
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens']);
		expect(list.getSnapshot().more).toBe(true);

		const third = list.loadMore();
		const request = await server.call(2);
		expect(request.input).toEqual({ q: 'fern', after: 'C' });
		request.finish(shelf(['Tree Ferns'], 'B'));
		await third;
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']);
		expect(list.getSnapshot().more).toBe(false);
		await list.loadMore();
		expect(server.calls).toHaveLength(3);
	});

	it('follows the cursors a refresh returns, and replaces the list once every page is confirmed', async () => {
		const { server, store, list, seen } = await firstPage();
		const more = list.loadMore();
		(await server.call(1)).finish(shelf(['Tree Ferns']));
		await more;
		const old = ['Fern Atlas', 'Fern Gardens', 'Tree Ferns'];
		expect(titles(list)).toEqual(old);

		seen.length = 0;
		const refreshed = list.refresh();
		expect(list.getSnapshot()).toMatchObject({ refreshing: true });
		// The first page now ends at another cursor.
		(await server.call(2)).finish(shelf(['Bracken', 'Fern Atlas'], 'C'));
		const replacement = await server.call(3);
		expect(replacement.input).toEqual({ q: 'fern', after: 'C' });
		expect(titles(list)).toEqual(old);
		expect(list.getSnapshot().refreshing).toBe(true);

		// The page that replaces the second fails: the list stays, and can be asked again.
		replacement.fail();
		await refreshed;
		expect(titles(list)).toEqual(old);
		expect(list.getSnapshot()).toMatchObject({ refreshing: false, more: true });
		expect(list.getSnapshot().error).toBeInstanceOf(Error);

		const retried = list.loadMore();
		const again = await server.call(4);
		expect(again.input).toEqual({ q: 'fern', after: 'C' });
		expect(titles(list)).toEqual(old);
		// It reads as many pages as the list showed, though another follows them.
		again.finish(shelf(['Fern Gardens', 'Water Ferns'], 'D'));
		await retried;
		const replaced = ['Bracken', 'Fern Atlas', 'Fern Gardens', 'Water Ferns'];
		expect(titles(list)).toEqual(replaced);
		expect(list.getSnapshot()).toMatchObject({ refreshing: false, error: undefined, more: true });
		// No reader saw a list that mixed the old pages with the new.
		expect(new Set(seen.map((rows) => rows!.join()))).toEqual(
			new Set([old.join(), replaced.join()]),
		);
		await quiet();
		expect(server.calls).toHaveLength(5);

		// The list still observes the page it kept, which reloads with the page after it.
		store.invalidate(['catalog']);
		const kept = await server.call(5);
		expect(kept.input).toEqual({ q: 'fern' });
		kept.finish(shelf(['Bracken', 'Fern Almanac'], 'C'));
		(await server.call(6)).finish(shelf(['Fern Gardens', 'Water Ferns'], 'D'));
		await vi.waitFor(() => expect(titles(list)).toContain('Fern Almanac'));
	});

	it('keeps the list when its first page fails to refresh, and reads that page again', async () => {
		const { server, list } = await firstPage();
		const more = list.loadMore();
		(await server.call(1)).finish(shelf(['Tree Ferns']));
		await more;
		const old = ['Fern Atlas', 'Fern Gardens', 'Tree Ferns'];

		const refreshed = list.refresh();
		(await server.call(2)).fail();
		await refreshed;
		expect(titles(list)).toEqual(old);
		expect(list.getSnapshot()).toMatchObject({ refreshing: false, more: true });
		expect(list.getSnapshot().error).toBeInstanceOf(Error);
		// The pages after it wait for the page that names them.
		await quiet();
		expect(server.calls).toHaveLength(3);

		const retried = list.loadMore();
		const again = await server.call(3);
		expect(again.input).toEqual({ q: 'fern' });
		again.finish(shelf(['Bracken'], 'B'));
		(await server.call(4)).finish(shelf(['Tree Ferns']));
		await retried;
		expect(titles(list)).toEqual(['Bracken', 'Tree Ferns']);
		expect(list.getSnapshot().error).toBeUndefined();
	});

	it('follows a cursor that changed while nothing observed the list', async () => {
		const { server, store, list, stop } = await firstPage(settledSearch);
		const more = list.loadMore();
		(await server.call(1)).finish(shelf(['Tree Ferns']));
		await more;
		stop();

		const reloaded = store.read(settledSearch, { q: 'fern' }).refresh();
		(await server.call(2)).finish(shelf(['Bracken', 'Fern Atlas'], 'C'));
		await reloaded;

		list.subscribe(() => {});
		const replacement = await server.call(3);
		expect(replacement.input).toEqual({ q: 'fern', after: 'C' });
		replacement.finish(shelf(['Fern Gardens']));
		await vi.waitFor(() => expect(titles(list)).toEqual(['Bracken', 'Fern Atlas', 'Fern Gardens']));
	});

	it('follows a new cursor when a page reloads on its own, and lets go of the page it replaces', async () => {
		const { server, store, list } = await firstPage();
		const more = list.loadMore();
		(await server.call(1)).finish(shelf(['Tree Ferns']));
		await more;
		const old = ['Fern Atlas', 'Fern Gardens', 'Tree Ferns'];

		// Both pages reload where they are; the first comes back naming another next page.
		store.invalidate(['catalog']);
		const first = await server.call(2);
		const second = await server.call(3);
		expect(second.input).toEqual({ q: 'fern', after: 'B' });
		expect(titles(list)).toEqual(old);
		first.finish(shelf(['Bracken', 'Fern Atlas'], 'C'));
		const replacement = await server.call(4);
		expect(replacement.input).toEqual({ q: 'fern', after: 'C' });
		expect(titles(list)).toEqual(old);

		replacement.finish(shelf(['Fern Gardens']));
		await vi.waitFor(() => expect(titles(list)).toEqual(['Bracken', 'Fern Atlas', 'Fern Gardens']));
		// The page the list no longer shows has no one to load for.
		expect(second.signal.aborted).toBe(true);
	});

	it('lets go of the next page’s load when nothing observes the list', async () => {
		const { server, list, stop } = await firstPage();
		const more = list.loadMore();
		const second = await server.call(1);
		stop();
		expect(second.signal.aborted).toBe(true);
		await more;
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens']);
	});

	it('keeps the next page loading for a caller that waits on it, where the read does not cancel', async () => {
		const { server, list, stop } = await firstPage(lookup);
		const more = list.loadMore();
		const second = await server.call(1);
		stop();
		expect(second.signal.aborted).toBe(false);
		second.finish(shelf(['Tree Ferns']));
		await more;
		expect(titles(list)).toEqual(['Fern Atlas', 'Fern Gardens', 'Tree Ferns']);
	});
});
