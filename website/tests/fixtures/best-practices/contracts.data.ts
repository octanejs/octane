// The contract module the best-practices guide's Data examples import as
// `./contracts.data.ts`. The test runs the Data contract check over it and over
// every example, so the examples' contract sites stay valid.
import { entity, read, write } from 'octane/data';

export type Book = { id: string; title: string; read: boolean };

// A minimal Standard Schema validator, so the fixture needs no schema library.
const accept = <T>() => ({
	'~standard': {
		version: 1 as const,
		vendor: 'best-practices-fixture',
		validate: (value: unknown) => ({ value: value as T }),
	},
});

export const BookEntity = entity('book', accept<Book>());

export const books = read({ name: 'books.list', output: accept<Book[]>() });

export const setRead = write({
	name: 'books.setRead',
	input: accept<{ id: string; read: boolean }>(),
	patches: BookEntity,
});

export const addBook = write({
	name: 'books.add',
	input: accept<{ title: string }>(),
	output: accept<Book>(),
	creates: BookEntity,
	record: (book: Book) => book,
	form: { title: 'text' },
});
