/**
 * The shelf's data contracts. Both front ends and the server import this one
 * module: declaring a contract does no I/O, so it is safe on either side.
 */
import { z } from 'zod';
import { entity, read, write } from 'octane/data';

const bookShape = z.object({
	id: z.string(),
	title: z.string().trim().min(1, 'Enter a title').max(80, 'Keep titles under 80 characters'),
	read: z.boolean(),
});
export type Book = z.infer<typeof bookShape>;

/** Every read that selects a book shares its fields: one edit updates each copy. */
export const Book = entity('book', bookShape);

export const books = read({
	name: 'books.list',
	output: z.array(bookShape),
	entities: (list) => Book.from(list),
	fresh: 30_000,
});

/** Counts carry no entities, so writes reach them through the `shelf` tag. */
export const stats = read({
	name: 'books.stats',
	output: z.object({ total: z.number().int(), read: z.number().int() }),
	tags: ['shelf'],
});

export const addBook = write({
	name: 'books.add',
	input: bookShape.pick({ title: true }),
	creates: Book,
	draft: (input, id) => ({ id, title: input.title, read: false }),
	invalidates: ['shelf'],
});

export const setRead = write({
	name: 'books.setRead',
	input: bookShape.pick({ id: true, read: true }),
	patches: Book,
	invalidates: ['shelf'],
});

export const removeBook = write({
	name: 'books.remove',
	input: bookShape.pick({ id: true }),
	removes: Book,
	invalidates: ['shelf'],
});

/** Whether the server applied a write, by the ID the client sent with it. */
export const receipt = read({
	name: 'books.receipt',
	input: z.object({ operationId: z.string() }),
	output: z.object({ applied: z.boolean() }),
});
