/**
 * The shelf's data contracts. Both front ends and the server import this one
 * module: declaring a contract does no I/O, so it is safe on either side.
 */
import { z } from 'zod';
import { entity, read, view, write } from 'octane/data';

const bookShape = z.object({
	id: z.string(),
	title: z.string().trim().min(1, 'Enter a title').max(80, 'Keep titles under 80 characters'),
	read: z.boolean(),
});
export type Book = z.infer<typeof bookShape>;

/** Every read that selects a book shares its fields: one edit updates each copy. */
export const Book = entity('book', bookShape);

/**
 * Lists declared by a rule. The store keeps each one sorted and complete under
 * any edit, so marking a book read moves it between them before the reply.
 */
export const books = view({
	name: 'books.list',
	of: Book,
	order: [['title', 'asc']],
	limit: 50,
	fresh: 30_000,
});

export const finished = view({
	name: 'books.finished',
	of: Book,
	where: (book) => book.read,
	order: [['title', 'asc']],
	limit: 50,
	fresh: 30_000,
});

export const unread = view({
	name: 'books.unread',
	of: Book,
	where: (book) => !book.read,
	order: [['title', 'asc']],
	limit: 50,
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
	output: bookShape,
	creates: Book,
	draft: (input, id) => ({ id, title: input.title, read: false }),
	/** The reply is the saved book, so the lists take it without reloading. */
	record: (book) => book,
	invalidates: ['shelf'],
});

export const setRead = write({
	name: 'books.setRead',
	input: bookShape.pick({ id: true, read: true }),
	output: bookShape,
	patches: Book,
	record: (book) => book,
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
