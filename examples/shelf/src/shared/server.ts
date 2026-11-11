/**
 * An in-memory shelf per account, served through `createDataHandler`. Server
 * code only: the browser reaches it through `data` in `data.tsrx`. Each
 * write records its operation ID with its effect, so a retried or looked-up
 * write is applied once and its receipt can be read back.
 */
import { DataError } from 'octane/data';
import { createDataHandler, type DataCaller } from 'octane/data/server';
import {
	addBook,
	books,
	finished,
	receipt,
	removeBook,
	setRead,
	stats,
	unread,
	type Book,
} from './contracts.ts';

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

	function shelfFor(key: string): Shelf {
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

	// The account the server's middleware authenticated for this call.
	const context = (_request: Request, caller?: DataCaller) => {
		const account = String(caller?.viewer ?? 'ada');
		return { account, shelf: shelfFor(account) };
	};

	// A real app keeps its secret out of the source; it signs each page's forms for its account.
	const forms = {
		secret: 'shelf example secret',
		grant: ({ account }: { account: string }) => account,
	};
	return createDataHandler({ context, ...forms }, (handle) => [
		// A view's handler serves its rule's window, in exactly the view's order.
		...[books, finished, unread].map((list) =>
			handle(list, async (input, { shelf }) => {
				await delay(latency / 2);
				return shelf.books
					.filter((book) => list.view.where(book, input))
					.sort(list.view.compare)
					.slice(input.offset, input.offset + input.limit)
					.map((book) => ({ ...book }));
			}),
		),
		handle(stats, (_, { shelf }) => ({
			total: shelf.books.length,
			read: shelf.books.filter((book) => book.read).length,
		})),
		handle(addBook, async (input, { shelf, operationId }) => {
			const title = input.title.toLowerCase();
			if (shelf.books.some((book) => book.title.toLowerCase() === title)) {
				throw new DataError('duplicate');
			}
			await apply(shelf, operationId, () => {
				shelf.books.push({ id: operationId, title: input.title, read: false });
			});
			return { ...find(shelf, operationId) };
		}),
		handle(setRead, async (input, { shelf, operationId }) => {
			await apply(shelf, operationId, () => {
				find(shelf, input.id).read = input.read;
			});
			return { ...find(shelf, input.id) };
		}),
		handle(removeBook, (input, { shelf, operationId }) =>
			apply(shelf, operationId, () => {
				find(shelf, input.id);
				shelf.books = shelf.books.filter((book) => book.id !== input.id);
			}),
		),
		handle(receipt, (input, { shelf }) => ({ applied: shelf.applied.has(input.operationId) })),
	]);
}

/** The server's one shelf handler, for `data` and for each page's forms. */
export const handler = createShelfHandler();
