import { entity, read, view, write, type StandardSchema } from 'octane/data';
import type { DataCall } from 'octane/data/server';

declare function schema<T>(): StandardSchema<unknown, T>;

export interface BookRow {
	id: string;
	title: string;
}
export const Book = entity('book', schema<BookRow>());
type Shelf = DataCall & { shelf: BookRow[] };

// Each contract carries the function that serves it, typed by its schemas.
export const byId = read(
	{ name: 'served.byId', input: schema<{ id: string }>(), output: Book.one },
	(input, call: Shelf) => call.shelf.find((book) => book.id === input.id)!,
);
export const list = view(
	{ name: 'served.list', of: Book, order: [['title', 'asc']] },
	(input, { shelf }: Shelf) => shelf.slice(input.offset, input.offset + input.limit),
);
export const addBook = write(
	{ name: 'served.add', input: schema<{ title: string }>(), output: Book.one, creates: Book },
	(input, { operationId }) => ({ id: operationId, title: input.title }),
);
// A contract with no function is served by the handler's object.
export const stats = read({ name: 'served.stats', output: schema<{ total: number }>() });

// @ts-expect-error the function returns the contract's output
read({ name: 'served.bad', output: Book.one }, () => ({ id: 1 }));
write(
	// @ts-expect-error the function takes the contract's input
	{ name: 'served.badInput', input: schema<{ title: string }>() },
	(input: { name: string }) => {},
);
