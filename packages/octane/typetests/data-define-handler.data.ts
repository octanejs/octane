import { entity, feed, read, view, write, type StandardSchema } from 'octane/data';

declare function schema<T>(): StandardSchema<unknown, T>;

export interface BookRow {
	id: string;
	title: string;
}
export const Book = entity('book', schema<BookRow>());
export const bookShape = schema<BookRow>();
export const PAGE = 20;

export const stats = read({ name: 'books.stats', output: schema<{ total: number }>() });
export const byId = read({
	name: 'books.byId',
	input: schema<{ id: string }>(),
	output: schema<BookRow>(),
});
export const list = view({ name: 'books.list', of: Book, order: [['title', 'asc']] });
export const search = view({
	name: 'books.search',
	of: Book,
	input: schema<{ q: string }>(),
	where: (book, input) => book.title.includes(input.q),
	order: [['title', 'asc']],
});
export const addBook = write({
	name: 'books.add',
	input: schema<{ title: string }>(),
	output: schema<BookRow>(),
});
export const changes = feed({
	name: 'books.changes',
	params: schema<{ room: string }>(),
	event: schema<BookRow>(),
	changes: (event) => ({ put: Book, value: event }),
	covers: ['book'],
});
