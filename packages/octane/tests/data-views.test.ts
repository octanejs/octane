import { describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	DataError,
	entity,
	read,
	view,
	write,
	type ReadHandle,
	type Transport,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';
import { schema } from './_data-todos.js';

interface BookRow {
	id: string;
	title: string;
	starred: boolean;
	shelf: 'A' | 'B';
}

const isBook = (value: any) =>
	typeof value?.id === 'string' && typeof value.title === 'string' && value.title !== '';
const Book = entity('book', schema<BookRow>(isBook));

const library = view({ name: 'books.library', of: Book, order: [['title', 'asc']], limit: 3 });
const bookmarks = view({
	name: 'books.bookmarks',
	of: Book,
	where: (book) => book.starred,
	order: [['title', 'asc']],
	limit: 3,
});
const shelf = view({
	name: 'books.shelf',
	of: Book,
	input: schema<{ shelf: 'A' | 'B' }>((value) => value?.shelf === 'A' || value?.shelf === 'B'),
	where: (book, input) => book.shelf === input.shelf,
	order: [['title', 'desc']],
	limit: 3,
});

const patchInput = schema<Partial<BookRow> & { id: string }>(
	(value) => typeof value?.id === 'string',
);
const star = write({
	name: 'books.star',
	input: patchInput,
	output: schema<BookRow>(isBook),
	patches: Book,
	record: (book) => book,
});
const rename = write({
	name: 'books.rename',
	input: patchInput,
	output: schema<BookRow>(isBook),
	patches: Book,
	record: (book) => book,
});
/** The same patch without `record`: views learn the result only by reloading. */
const renameBlind = write({ name: 'books.renameBlind', input: patchInput, patches: Book });
const add = write({
	name: 'books.add',
	input: schema<{ title: string }>((value) => typeof value?.title === 'string'),
	output: schema<BookRow>(isBook),
	creates: Book,
	draft: (input, id) => ({ id, title: input.title, starred: false, shelf: 'A' }),
	serverId: (book) => book.id,
	record: (book) => book,
});
const remove = write({
	name: 'books.remove',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	removes: Book,
});

/** Results only the server can order: here, most recently added first. */
const search = read({
	name: 'books.search',
	input: schema<{ q: string }>((value) => typeof value?.q === 'string'),
	output: schema<BookRow[]>((value) => Array.isArray(value) && value.every(isBook)),
	entities: (books) => Book.from(books),
});

const titles = (handle: ReadHandle<BookRow[]>) =>
	handle.getSnapshot().value?.map((book) => book.title);

/** A library server that serves each view from its own rule, logs every request, and can hold writes. */
function libraryServer(count = 10) {
	const books = new Map<string, BookRow>();
	for (let index = 0; index < count; index++) {
		const id = `b${index}`;
		books.set(id, {
			id,
			title: `Book ${String(index).padStart(2, '0')}`,
			starred: index % 2 === 0,
			shelf: index % 3 === 0 ? 'B' : 'A',
		});
	}
	const log: string[] = [];
	const refuse = new Set<string>();
	let next = 0;
	const serve =
		(contract: typeof library | typeof shelf) =>
		(input: { offset: number; limit: number; shelf?: 'A' | 'B' }) => {
			log.push(`${contract.name} ${input.offset}+${input.limit}`);
			return [...books.values()]
				.filter((book) => contract.view.where(book, input))
				.sort(contract.view.compare)
				.slice(input.offset, input.offset + input.limit)
				.map((book) => ({ ...book }));
		};
	const patch = (input: Partial<BookRow> & { id: string }) => {
		log.push(`patch ${input.id}`);
		if (refuse.has(input.id)) throw new DataError('refused');
		const book = books.get(input.id);
		if (!book) throw new DataError('missing');
		Object.assign(book, input);
		// The server's record can differ from the edit: it keeps titles trimmed.
		book.title = book.title.trim();
		return { ...book };
	};
	const handler = createDataHandler({}, (handle) => [
		handle(library, serve(library)),
		handle(bookmarks, serve(bookmarks)),
		handle(shelf, serve(shelf)),
		handle(search, (input) => {
			log.push(`books.search ${input.q}`);
			return [...books.values()]
				.filter((book) => book.title.includes(input.q))
				.reverse()
				.map((book) => ({ ...book }));
		}),
		handle(star, patch),
		handle(rename, patch),
		handle(renameBlind, (input) => void patch(input)),
		handle(add, (input) => {
			log.push(`add ${input.title}`);
			const book: BookRow = { id: `srv-${++next}`, title: input.title, starred: false, shelf: 'A' };
			books.set(book.id, book);
			return { ...book };
		}),
		handle(remove, (input) => {
			log.push(`remove ${input.id}`);
			books.delete(input.id);
		}),
	]);
	const direct = handler.transport(new Request('https://app.test/data'));
	const held: Array<() => void> = [];
	let holding = false;
	const transport: Transport = async (request, signal) => {
		if (holding && request.kind === 'write') await new Promise<void>((done) => held.push(done));
		return direct(request, signal);
	};
	return {
		books,
		log,
		refuse,
		transport,
		hold: () => void (holding = true),
		release: () => {
			holding = false;
			held.splice(0).forEach((done) => done());
		},
	};
}

async function ready<T>(handle: ReadHandle<T>) {
	const notify = vi.fn();
	handle.subscribe(notify);
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return notify;
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('octane/data views', () => {
	it('loads the window it shows plus a margin, and shows only the window', async () => {
		const server = libraryServer(40);
		const store = createDataStore({ transport: server.transport });
		const page = store.read(library, { offset: 25 });
		await ready(page);

		expect(titles(page)).toEqual(['Book 25', 'Book 26', 'Book 27']);
		expect(server.log).toEqual(['books.library 5+44']);
	});

	it('moves a starred record into a sorted view in the task that starred it, and keeps it on confirm', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const marks = store.read(bookmarks, undefined);
		const all = store.read(library, { limit: 10 });
		await ready(marks);
		await ready(all);
		expect(titles(marks)).toEqual(['Book 00', 'Book 02', 'Book 04']);
		server.log.length = 0;

		const saved = store.write(star, { id: 'b1', starred: true });
		expect(titles(marks)).toEqual(['Book 00', 'Book 01', 'Book 02']);

		await saved;
		await quiet();
		expect(titles(marks)).toEqual(['Book 00', 'Book 01', 'Book 02']);
		// The reply carried the record, so no view reloaded.
		expect(server.log).toEqual(['patch b1']);
	});

	it('takes a refused edit back out of every view', async () => {
		const server = libraryServer();
		server.refuse.add('b1');
		const store = createDataStore({ transport: server.transport });
		const marks = store.read(bookmarks, undefined);
		// A view places an edited record only once some view has loaded it.
		await ready(store.read(library, undefined));
		await ready(marks);

		const saved = store.write(star, { id: 'b1', starred: true });
		expect(titles(marks)).toEqual(['Book 00', 'Book 01', 'Book 02']);
		await expect(saved).rejects.toMatchObject({ code: 'refused' });
		expect(titles(marks)).toEqual(['Book 00', 'Book 02', 'Book 04']);
	});

	it('reorders a renamed record in every view that shares it, including a later page', async () => {
		const server = libraryServer(50);
		const store = createDataStore({ transport: server.transport });
		const first = store.read(library, undefined);
		const later = store.read(library, { offset: 25 });
		const shelfA = store.read(shelf, { shelf: 'A' });
		await ready(first);
		await ready(later);
		await ready(shelfA);
		expect(titles(later)).toEqual(['Book 25', 'Book 26', 'Book 27']);
		expect(titles(shelfA)).toEqual(['Book 49', 'Book 47', 'Book 46']);
		server.log.length = 0;

		server.hold();
		const saved = store.write(rename, { id: 'b1', title: 'Book 99' });
		// b1 moved from above the later page to the end, so every row there moved up one place.
		expect(titles(first)).toEqual(['Book 00', 'Book 02', 'Book 03']);
		expect(titles(later)).toEqual(['Book 26', 'Book 27', 'Book 28']);
		expect(titles(shelfA)).toEqual(['Book 99', 'Book 49', 'Book 47']);

		server.release();
		await saved;
		await quiet();
		expect(titles(first)).toEqual(['Book 00', 'Book 02', 'Book 03']);
		expect(titles(later)).toEqual(['Book 26', 'Book 27', 'Book 28']);
		expect(titles(shelfA)).toEqual(['Book 99', 'Book 49', 'Book 47']);
	});

	it("shows the server's record once a write returns it", async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		await ready(all);
		server.log.length = 0;

		const saved = store.write(rename, { id: 'b0', title: '  Book 00 (2nd)' });
		expect(titles(all)).toEqual(['  Book 00 (2nd)', 'Book 01', 'Book 02']);
		await saved;
		expect(titles(all)).toEqual(['Book 00 (2nd)', 'Book 01', 'Book 02']);
		await quiet();
		expect(server.log).toEqual(['patch b0']);
	});

	it('keeps a later page in place once a removal above it is confirmed', async () => {
		const server = libraryServer(50);
		const store = createDataStore({ transport: server.transport });
		const later = store.read(library, { offset: 25 });
		await ready(store.read(library, undefined));
		await ready(later);

		const removed = store.write(remove, { id: 'b1' });
		expect(titles(later)).toEqual(['Book 26', 'Book 27', 'Book 28']);
		await removed;
		await vi.waitFor(() => expect(later.getSnapshot().refreshing).toBe(false));
		expect(titles(later)).toEqual(['Book 26', 'Book 27', 'Book 28']);
	});

	it('moves a later page down when a new record lands above it', async () => {
		const server = libraryServer(50);
		const store = createDataStore({ transport: server.transport });
		const later = store.read(library, { offset: 25 });
		await ready(later);

		server.hold();
		const added = store.write(add, { title: 'Book 00a' });
		expect(titles(later)).toEqual(['Book 24', 'Book 25', 'Book 26']);
		server.release();
		await added;
		await vi.waitFor(() => expect(later.getSnapshot().refreshing).toBe(false));
		expect(titles(later)).toEqual(['Book 24', 'Book 25', 'Book 26']);
	});

	it('keeps the same snapshot when an edit leaves the window unchanged', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const marks = store.read(bookmarks, undefined);
		await ready(store.read(library, { limit: 10 }));
		await ready(marks);
		const before = marks.getSnapshot();

		// b9 is unstarred, so it is in no bookmark window before or after.
		const saved = store.write(rename, { id: 'b9', title: 'Book 09b' });
		expect(marks.getSnapshot()).toBe(before);
		await saved;
		expect(marks.getSnapshot()).toBe(before);
	});

	it('reloads the views a write reaches when its reply carries no record', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		await ready(all);
		server.log.length = 0;

		await store.write(renameBlind, { id: 'b0', title: 'Book 99' });
		await vi.waitFor(() => expect(all.getSnapshot().refreshing).toBe(false));
		expect(titles(all)).toEqual(['Book 01', 'Book 02', 'Book 03']);
		expect(server.log).toEqual(['patch b0', 'books.library 0+24']);
	});

	it('places a new record by its rule and replaces it with the server record on confirm', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const shelfA = store.read(shelf, { shelf: 'A', limit: 10 });
		await ready(shelfA);
		server.log.length = 0;

		server.hold();
		const added = store.write(add, { title: 'Book 05a' });
		const local = shelfA.getSnapshot().value!.find((book) => book.title === 'Book 05a')!;
		expect(titles(shelfA)).toEqual([
			'Book 08',
			'Book 07',
			'Book 05a',
			'Book 05',
			'Book 04',
			'Book 02',
			'Book 01',
		]);

		server.release();
		await added;
		await quiet();
		const rows = shelfA.getSnapshot().value!;
		expect(rows.map((book) => book.title)).toEqual(titles(shelfA));
		expect(rows.filter((book) => book.title === 'Book 05a')).toEqual([
			{ id: 'srv-1', title: 'Book 05a', starred: false, shelf: 'A' },
		]);
		expect(local.id).not.toBe('srv-1');
		expect(server.log).toEqual(['add Book 05a']);
	});

	it('drops a removed record from every view without reloading them', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		const marks = store.read(bookmarks, undefined);
		await ready(all);
		await ready(marks);
		server.log.length = 0;

		const removed = store.write(remove, { id: 'b0' });
		expect(titles(all)).toEqual(['Book 01', 'Book 02', 'Book 03']);
		expect(titles(marks)).toEqual(['Book 02', 'Book 04', 'Book 06']);
		await removed;
		await quiet();
		expect(titles(all)).toEqual(['Book 01', 'Book 02', 'Book 03']);
		expect(server.log).toEqual(['remove b0']);
	});

	it('reloads a window once when edits leave it too few rows, then fills it', async () => {
		const server = libraryServer(40);
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		await ready(all);
		server.log.length = 0;

		server.hold();
		const removals = [];
		// The window holds 24 rows; removing 22 leaves too few to show 3.
		for (let index = 0; index < 22; index++) {
			removals.push(store.write(remove, { id: `b${index}` }));
		}
		server.release();
		await Promise.all(removals);
		await vi.waitFor(() => expect(titles(all)).toEqual(['Book 22', 'Book 23', 'Book 24']));
		expect(server.log.filter((line) => line.startsWith('books.'))).toEqual(['books.library 0+24']);
	});

	it('leaves a record out of a view whose newer load no longer includes it', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		await ready(all);
		// Another user unstars b0 after the library loaded it.
		server.books.get('b0')!.starred = false;

		const marks = store.read(bookmarks, undefined);
		const shown: string[][] = [];
		marks.subscribe(() => {
			if (marks.getSnapshot().status === 'ready') shown.push(titles(marks)!);
		});
		await vi.waitFor(() => expect(shown.length).toBeGreaterThan(0));
		// The first value shown already leaves the stale copy out.
		expect(shown[0]).toEqual(['Book 02', 'Book 04', 'Book 06']);
		// The library held that copy too, so it reloads and drops b0 from the stars.
		await vi.waitFor(() => expect(all.getSnapshot().value![0]).toMatchObject({ starred: false }));
	});

	it('shows an empty window past the end of the list, through edits', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const past = store.read(library, { offset: 40 });
		await ready(store.read(library, undefined));
		await ready(past);
		expect(titles(past)).toEqual([]);

		await store.write(rename, { id: 'b0', title: 'Book 99' });
		await store.write(remove, { id: 'b1' });
		expect(titles(past)).toEqual([]);
	});

	it('reloads its views when a write lands but its reply cannot be read', async () => {
		const server = libraryServer();
		// The server applies the edit, but its reply is damaged on the way back.
		const transport: Transport = async (request, signal) => {
			const reply = await server.transport(request, signal);
			return request.kind === 'write' && reply.ok ? { ...reply, value: { damaged: true } } : reply;
		};
		const store = createDataStore({ transport });
		const all = store.read(library, undefined);
		await ready(all);
		server.log.length = 0;

		await expect(store.write(rename, { id: 'b0', title: 'Book 99' })).rejects.toMatchObject({
			code: 'invalid',
		});
		await vi.waitFor(() => expect(server.log).toEqual(['patch b0', 'books.library 0+24']));
		await vi.waitFor(() => expect(titles(all)).toEqual(['Book 01', 'Book 02', 'Book 03']));
	});

	it('waits for edits that leave a window short to settle before reloading it', async () => {
		const server = libraryServer(40);
		const store = createDataStore({ transport: server.transport });
		const all = store.read(library, undefined);
		await ready(all);
		server.log.length = 0;

		server.hold();
		const removals = [];
		for (let index = 0; index < 22; index++) {
			removals.push(store.write(remove, { id: `b${index}` }));
		}
		await quiet();
		// The server has not applied the removals yet, so a reload could not fill the window.
		expect(server.log).toEqual([]);
		expect(titles(all)).toEqual(['Book 22', 'Book 23']);
		server.release();
		await Promise.all(removals);
		await vi.waitFor(() => expect(titles(all)).toEqual(['Book 22', 'Book 23', 'Book 24']));
		expect(server.log.filter((line) => line.startsWith('books.'))).toEqual(['books.library 0+24']);
	});

	it('serves a later page of a view whose window is its maximum', async () => {
		const server = libraryServer(40);
		const store = createDataStore({ transport: server.transport });
		const tight = view({ name: 'books.tight', of: Book, order: [['title', 'asc']], max: 10 });
		const handler = createDataHandler({}, (handle) => [
			handle(tight, (input) => {
				server.log.push(`books.tight ${input.offset}+${input.limit}`);
				return [...server.books.values()]
					.sort(tight.view.compare)
					.slice(input.offset, input.offset + input.limit);
			}),
		]);
		const local = createDataStore({
			transport: handler.transport(new Request('https://app.test/data')),
		});
		const page = local.read(tight, { offset: 10 });
		await ready(page);
		expect(titles(page)).toHaveLength(10);
		expect(titles(page)![0]).toBe('Book 10');
	});

	it('refuses a window larger than the view allows', async () => {
		const server = libraryServer();
		const store = createDataStore({ transport: server.transport });
		const huge = store.read(library, { limit: 501 });
		huge.subscribe(() => {});
		await vi.waitFor(() => expect(huge.getSnapshot().status).toBe('error'));
		expect(huge.getSnapshot().error).toMatchObject({ code: 'invalid' });
	});

	it('hydrates a view from a server render without loading it', async () => {
		const server = libraryServer();
		const rendering = createDataStore({ transport: server.transport });
		await rendering.prefetch(bookmarks, undefined);
		await rendering.prefetch(library, undefined);
		const seed = rendering.dehydrate();
		rendering.retire();
		server.log.length = 0;

		const client = createDataStore({ transport: server.transport, seed });
		const marks = client.read(bookmarks, undefined);
		const all = client.read(library, undefined);
		expect(titles(marks)).toEqual(['Book 00', 'Book 02', 'Book 04']);
		expect(titles(all)).toEqual(['Book 00', 'Book 01', 'Book 02']);
		marks.subscribe(() => {});
		all.subscribe(() => {});
		client.write(star, { id: 'b1', starred: true });
		expect(titles(marks)).toEqual(['Book 00', 'Book 01', 'Book 02']);
		await quiet();
		expect(server.log).toEqual(['patch b1']);
	});
});

describe('octane/data server-ordered reads', () => {
	it("shows a newer copy of a record that a view loaded, in the server's order, without reloading", async () => {
		const server = libraryServer(4);
		const store = createDataStore({ transport: server.transport });
		const results = store.read(search, { q: 'Book' });
		await ready(results);
		const page = store.read(library, undefined);
		await ready(page);
		expect(titles(results)).toEqual(['Book 03', 'Book 02', 'Book 01', 'Book 00']);

		// Another user renames a book; the library reloads and brings the new title.
		server.books.get('b1')!.title = 'Book 01 (revised)';
		server.log.length = 0;
		await page.refresh();
		expect(titles(results)).toEqual(['Book 03', 'Book 02', 'Book 01 (revised)', 'Book 00']);
		expect(server.log).toEqual(['books.library 0+24']);
	});

	it('gives views the newer copy of a record that a server-ordered read loaded', async () => {
		const server = libraryServer(4);
		const store = createDataStore({ transport: server.transport });
		const page = store.read(library, undefined);
		await ready(page);

		server.books.get('b1')!.title = 'Book 01 (revised)';
		await ready(store.read(search, { q: 'Book' }));
		expect(titles(page)).toEqual(['Book 00', 'Book 01 (revised)', 'Book 02']);
		expect(server.log).toEqual(['books.library 0+24', 'books.search Book']);
	});

	it('keeps a newer copy when an older load lands after it', async () => {
		const server = libraryServer(4);
		let release: (() => void) | null = null;
		const store = createDataStore({
			transport: async (request, signal) => {
				// The search reads the server now, but its reply arrives later.
				const reply = server.transport(request, signal);
				if (request.name === 'books.search') await new Promise<void>((done) => (release = done));
				return reply;
			},
		});
		const page = store.read(library, undefined);
		await ready(page);
		const results = store.read(search, { q: 'Book' });
		results.subscribe(() => {});
		await vi.waitFor(() => expect(release).not.toBeNull());

		// The library loads after the rename and lands first; the search, read before it, lands last.
		server.books.get('b1')!.title = 'Book 01 (revised)';
		await page.refresh();
		release!();
		await vi.waitFor(() => expect(results.getSnapshot().status).toBe('ready'));
		expect(titles(page)).toEqual(['Book 00', 'Book 01 (revised)', 'Book 02']);
		expect(titles(results)).toContain('Book 01 (revised)');
	});

	it('never adds a record a view does not hold, even from a search that lands late', async () => {
		const server = libraryServer(4);
		let release: (() => void) | null = null;
		const store = createDataStore({
			transport: async (request, signal) => {
				const reply = server.transport(request, signal);
				if (request.name === 'books.search') await new Promise<void>((done) => (release = done));
				return reply;
			},
		});
		const page = store.read(library, undefined);
		await ready(page);
		const results = store.read(search, { q: 'Book' });
		results.subscribe(() => {});
		await vi.waitFor(() => expect(release).not.toBeNull());

		// The search read b1 before another user removed it; the library reloads without it.
		server.books.delete('b1');
		await page.refresh();
		expect(titles(page)).toEqual(['Book 00', 'Book 02', 'Book 03']);
		release!();
		await vi.waitFor(() => expect(results.getSnapshot().status).toBe('ready'));
		expect(titles(page)).toEqual(['Book 00', 'Book 02', 'Book 03']);
	});

	it("tells views of a newer copy that a write's reply carried back in a search", async () => {
		const server = libraryServer(4);
		const store = createDataStore({ transport: server.transport });
		const page = store.read(library, undefined);
		await ready(page);
		await ready(store.read(search, { q: 'Book' }));

		// The rename settles the library from its record; the search comes back in the reply.
		server.books.get('b2')!.title = 'Book 02 (revised)';
		await store.write(rename, { id: 'b0', title: 'Book 00 (renamed)' });
		await vi.waitFor(() =>
			expect(titles(page)).toEqual(['Book 00 (renamed)', 'Book 01', 'Book 02 (revised)']),
		);
	});

	it('keeps the same snapshot when nothing it shows changed', async () => {
		const server = libraryServer(4);
		const store = createDataStore({ transport: server.transport });
		const results = store.read(search, { q: 'Book' });
		const notify = await ready(results);
		const page = store.read(library, undefined);
		await ready(page);
		const before = results.getSnapshot();
		notify.mockClear();

		await page.refresh();
		expect(results.getSnapshot()).toBe(before);
		expect(notify).not.toHaveBeenCalled();
	});

	it('keeps the same snapshot while an edit it shows is pending', async () => {
		const server = libraryServer(4);
		const store = createDataStore({ transport: server.transport });
		const results = store.read(search, { q: 'Book' });
		const notify = await ready(results);
		const page = store.read(library, undefined);
		await ready(page);
		server.hold();
		void store.write(star, { id: 'b1', starred: true }).catch(() => {});
		const before = results.getSnapshot();
		expect(before.value!.find((book) => book.id === 'b1')!.starred).toBe(true);
		notify.mockClear();

		await page.refresh();
		expect(results.getSnapshot()).toBe(before);
		expect(notify).not.toHaveBeenCalled();
		server.release();
	});
});
