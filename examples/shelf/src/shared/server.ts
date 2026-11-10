/**
 * An in-memory shelf per account, served through `createDataHandler`. Each
 * write records its operation ID with its effect, so a retried or looked-up
 * write is applied once and its receipt can be read back.
 */
import { DataError } from 'octane/data';
import { createDataHandler } from 'octane/data/server';
import { addBook, books, receipt, removeBook, setRead, stats, type Book } from './contracts.ts';

interface Shelf {
	books: Book[];
	applied: Set<string>;
}

const SEEDS: Record<string, string[]> = {
	ada: ['The Left Hand of Darkness', 'Kindred', 'Piranesi'],
	grace: ['A Memory Called Empire', 'The Dispossessed'],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createShelfHandler(options: { latency?: number } = {}) {
	const latency = options.latency ?? 250;
	const shelves = new Map<string, Shelf>();

	function shelfFor(request: Request): Shelf {
		const key = request.headers.get('x-shelf-account') ?? 'ada';
		let shelf = shelves.get(key);
		if (!shelf) {
			const account = key.slice(key.lastIndexOf(':') + 1);
			const titles = SEEDS[account] ?? [];
			shelf = {
				books: titles.map((title, index) => ({ id: `${account}-${index}`, title, read: false })),
				applied: new Set(),
			};
			shelves.set(key, shelf);
		}
		return shelf;
	}

	/** Apply a write once per operation ID, so a retried request changes nothing. */
	async function apply(shelf: Shelf, operationId: string, effect: () => void) {
		await delay(latency);
		if (shelf.applied.has(operationId)) return;
		effect();
		shelf.applied.add(operationId);
	}

	function find(shelf: Shelf, id: string): Book {
		const book = shelf.books.find((item) => item.id === id);
		if (!book) throw new DataError('missing');
		return book;
	}

	return createDataHandler({ context: (request) => ({ shelf: shelfFor(request) }) }, (handle) => [
		handle(books, async (_, { shelf }) => {
			await delay(latency / 2);
			return shelf.books.map((book) => ({ ...book }));
		}),
		handle(stats, (_, { shelf }) => ({
			total: shelf.books.length,
			read: shelf.books.filter((book) => book.read).length,
		})),
		handle(addBook, (input, { shelf, operationId }) => {
			const title = input.title.toLowerCase();
			if (shelf.books.some((book) => book.title.toLowerCase() === title)) {
				throw new DataError('duplicate');
			}
			return apply(shelf, operationId, () => {
				shelf.books.push({ id: operationId, title: input.title, read: false });
			});
		}),
		handle(setRead, (input, { shelf, operationId }) =>
			apply(shelf, operationId, () => {
				find(shelf, input.id).read = input.read;
			}),
		),
		handle(removeBook, (input, { shelf, operationId }) =>
			apply(shelf, operationId, () => {
				find(shelf, input.id);
				shelf.books = shelf.books.filter((book) => book.id !== input.id);
			}),
		),
		handle(receipt, (input, { shelf }) => ({ applied: shelf.applied.has(input.operationId) })),
	]);
}
