import { entity, feed, read, view, write, type StandardSchema } from 'octane/data';
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
export const changes = feed(
	{
		name: 'served.changes',
		params: schema<{ room: string }>(),
		event: Book.one,
		changes: (event) => ({ put: Book, value: event }),
		covers: ['book'],
	},
	async function* (params, { cursor, shelf }: Shelf & { readonly cursor: string | null }) {
		yield { cursor: cursor ?? params.room };
		for (const book of shelf) yield { event: book, cursor: book.id };
	},
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
feed(
	{ name: 'served.badEvent', event: Book.one, changes: () => [], covers: [] },
	// @ts-expect-error a feed's function yields the contract's events
	async function* () {
		yield { event: { id: 1 } };
	},
);
