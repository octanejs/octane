import { entity, feed, read, view, write } from 'octane/data';
import { schema } from './schema.ts';

export interface BookRow {
	id: string;
	title: string;
}
// A shared schema: an ordinary export, not a contract.
export const bookShape = schema<BookRow>();
export const Book = entity('book', bookShape);
export const list = view({ name: 'books.list', of: Book, order: [['title', 'asc']] });
export const stats = read({ name: 'books.stats', output: schema<{ total: number }>() });
export const addBook = write({ name: 'books.add', input: bookShape, creates: Book });
export const archive = read({ name: 'books.archive', output: schema<{ total: number }>() });
export const changes = feed({
	name: 'books.changes',
	params: schema<{ room: string }>(),
	event: bookShape,
	changes: (event) => ({ put: Book, value: event }),
	covers: ['book'],
});
