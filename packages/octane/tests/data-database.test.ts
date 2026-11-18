/**
 * A book list served from a SQLite database, a page at a time, two ways:
 *
 * - as a view, whose SQL sorts exactly as the view's `order` does, so the
 *   store places every edit itself;
 * - as a read the database orders, with a collation the browser cannot
 *   reproduce, whose pages follow a keyset cursor and take the server's order
 *   again once each write is confirmed.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createDataStore, DataError, entity, pages, read, view, write } from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';
import { schema } from './_data-todos.js';

interface Book {
	id: number;
	title: string;
}
interface Page {
	books: Book[];
	next: string | null;
}

const Book = entity(
	'book',
	schema<Book>((value) => typeof value?.id === 'number'),
);
const byTitle = view({ name: 'books.byTitle', of: Book, order: [['title', 'asc']], limit: 5 });
/** The database's own order: case ignored, as `COLLATE NOCASE` sorts. */
const shelf = read({
	name: 'books.shelf',
	input: schema<{ after?: string }>((value) => value !== null && typeof value === 'object'),
	output: schema<Page>((value) => Array.isArray(value?.books)),
	entities: (page) => Book.from(page.books),
});
const rename = write({
	name: 'books.rename',
	input: schema<Book>((value) => typeof value?.title === 'string'),
	output: Book.one,
	patches: Book,
});
const add = write({
	name: 'books.add',
	input: schema<{ title: string }>((value) => typeof value?.title === 'string'),
	output: Book.one,
	creates: Book,
	draft: (input, id) => ({ id, title: input.title }),
	serverId: (book) => String(book.id),
});
const remove = write({
	name: 'books.remove',
	input: schema<{ id: number }>((value) => typeof value?.id === 'number'),
	removes: Book,
});

const SIZE = 5;
const byCursor = {
	rows: (page: Page) => page.books,
	next: (page: Page, input: { after?: string }) =>
		page.next ? { ...input, after: page.next } : null,
};

/** A database of `titles`, and a handler whose view sorts by `collation`. */
function library(titles: string[], collation = 'BINARY') {
	const db = new DatabaseSync(':memory:');
	db.exec('CREATE TABLE book (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
	const insert = db.prepare('INSERT INTO book (title) VALUES (?) RETURNING id, title');
	for (const title of titles) insert.run(title);
	const all = (order: string) =>
		db.prepare(`SELECT id, title FROM book ORDER BY ${order}`).all() as unknown as Book[];
	const nocase = 'title COLLATE NOCASE, id';
	const handler = createDataHandler({}, (handle) => [
		// `ORDER BY` names each of the view's keys, then the entity key, as the view sorts.
		handle(
			byTitle,
			({ offset, limit }) =>
				db
					.prepare(
						`SELECT id, title FROM book ORDER BY title COLLATE ${collation}, id LIMIT ? OFFSET ?`,
					)
					.all(limit, offset) as unknown as Book[],
		),
		handle(shelf, ({ after }) => {
			const [title, id] = after ? (JSON.parse(after) as [string, number]) : ['', 0];
			const books = db
				.prepare(
					`SELECT id, title FROM book WHERE (title COLLATE NOCASE, id) > (?, ?) ORDER BY ${nocase} LIMIT ?`,
				)
				.all(title, id, SIZE) as unknown as Book[];
			const last = books[SIZE - 1];
			return { books, next: last ? JSON.stringify([last.title, last.id]) : null };
		}),
		handle(
			rename,
			({ id, title }) =>
				db
					.prepare('UPDATE book SET title = ? WHERE id = ? RETURNING id, title')
					.get(title, id) as unknown as Book,
		),
		handle(add, ({ title }) => insert.get(title) as unknown as Book),
		handle(remove, ({ id }) => void db.prepare('DELETE FROM book WHERE id = ?').run(id)),
	]);
	const store = createDataStore({ transport: handler.transport(new Request('https://app.test/')) });
	return { store, titles: (order = `title, id`) => all(order).map((book) => book.title), nocase };
}

async function loadAll(list: {
	subscribe(listener: () => void): unknown;
	getSnapshot(): { status: string; more: boolean; value?: Book[] | undefined };
	loadMore(): Promise<void>;
}) {
	list.subscribe(() => {});
	await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
	while (list.getSnapshot().more) await list.loadMore();
	return () => list.getSnapshot().value!.map((book) => book.title);
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('octane/data over a database', () => {
	it('pages through a view whose SQL sorts as the view does, ties broken by the integer key', async () => {
		// Twelve equal titles: their order, and every page edge between them, is the key's.
		const titles = [...Array.from({ length: 12 }, () => 'Same'), 'Atlas', 'Zephyr'];
		const db = library(titles);
		const list = pages(db.store, byTitle, undefined, SIZE);
		const shown = await loadAll(list);
		expect(shown()).toEqual(db.titles());
		expect(list.getSnapshot().value!.map((book) => book.id)).toEqual([
			13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14,
		]);
	});

	it('moves an edited row across a page edge before the reply, where the database then puts it', async () => {
		const db = library(['Alder', 'Birch', 'Cedar', 'Elm', 'Fir', 'Hazel', 'Larch', 'Oak', 'Pine']);
		const shown = await loadAll(pages(db.store, byTitle, undefined, SIZE));
		const saved = db.store.write(rename, { id: 1, title: 'Maple' });
		expect(shown()).toEqual([
			'Birch',
			'Cedar',
			'Elm',
			'Fir',
			'Hazel',
			'Larch',
			'Maple',
			'Oak',
			'Pine',
		]);
		await saved;
		await quiet();
		expect(shown()).toEqual(db.titles());
	});

	it('refuses a window the database sorted with another collation, naming the view', async () => {
		const db = library(['apple', 'Banana', 'cherry'], 'NOCASE');
		const window = db.store.read(byTitle, undefined);
		window.subscribe(() => {});
		await vi.waitFor(() => expect(window.getSnapshot().status).toBe('error'));
		const error = window.getSnapshot().error as DataError;
		expect(error).toBeInstanceOf(DataError);
		expect(error.code).toBe('invalid');
		expect(error.issues?.[0]?.message).toContain('View "books.byTitle"');
	});

	it("keeps the database's order through a read with cursor pages, and takes it again after each write", async () => {
		const db = library(['apple', 'Banana', 'cherry', 'Date', 'elder', 'Fig', 'grape']);
		const shown = await loadAll(pages(db.store, shelf, {}, byCursor));
		const order = () => db.titles(db.nocase);
		expect(shown()).toEqual(order());
		const settle = async (written: Promise<unknown>) => {
			await written;
			await vi.waitFor(() => expect(shown()).toEqual(order().slice(0, shown().length)));
		};

		// A new book shows once, after the rows loaded, until the database places it.
		const added = db.store.write(add, { title: 'avocado' });
		expect(shown()).toEqual([...order(), 'avocado']);
		await settle(added);
		expect(shown()).toContain('avocado');

		// A renamed book keeps its place until the database moves it.
		const before = shown();
		const renamed = db.store.write(rename, { id: 3, title: 'zucchini' });
		expect(shown()).toEqual(before.map((title) => (title === 'cherry' ? 'zucchini' : title)));
		await settle(renamed);

		// A removed book leaves at once.
		const removed = db.store.write(remove, { id: 2 });
		expect(shown()).not.toContain('Banana');
		await settle(removed);
	});
});
