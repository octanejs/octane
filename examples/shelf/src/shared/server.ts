/**
 * An in-memory shelf per account, served through `createDataHandler`. Server
 * code only: the browser reaches it through `data` in `data.tsrx`. Each
 * write records its operation ID with its effect, so a retried or looked-up
 * write is applied once and its receipt can be read back.
 */
import { DataError } from 'octane/data';
import { createDataHandler, type DataCaller, type Implementation } from 'octane/data/server';
import * as Shelf from './contracts.data.ts';

type Book = Shelf.Book;
type ShelfEvent = { kind: 'put'; book: Book } | { kind: 'removed'; id: string };

interface Account {
	books: Book[];
	applied: Set<string>;
	/** The latest changes, so a listener that reconnects resumes after the last one it saw. */
	history: Array<{ position: number; event: ShelfEvent }>;
	/** Wakes the listeners waiting for the next change. */
	waiters: Set<() => void>;
}

/** Changes a reconnecting listener can resume from; an older cursor gets a gap. */
const HISTORY = 100;

const SEEDS: Record<string, string[]> = {
	ada: ['The Left Hand of Darkness', 'Kindred', 'Piranesi'],
	grace: ['A Memory Called Empire', 'The Dispossessed'],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createShelfHandler(options: { latency?: number } = {}) {
	const latency = options.latency ?? 250;
	const shelves = new Map<string, Account>();

	function shelfFor(key: string): Account {
		let shelf = shelves.get(key);
		if (!shelf) {
			const account = key.slice(key.lastIndexOf(':') + 1);
			const titles = SEEDS[account] ?? [];
			shelf = {
				books: titles.map((title, index) => ({ id: `${account}-${index}`, title, read: false })),
				applied: new Set(),
				history: [],
				waiters: new Set(),
			};
			shelves.set(key, shelf);
		}
		return shelf;
	}

	/** Apply a write once per operation ID, so a retried request changes nothing, and tell listeners. */
	async function apply(shelf: Account, operationId: string, effect: () => ShelfEvent) {
		await delay(latency);
		if (shelf.applied.has(operationId)) return;
		const event = effect();
		shelf.applied.add(operationId);
		const position = (shelf.history.at(-1)?.position ?? 0) + 1;
		shelf.history = [...shelf.history, { position, event }].slice(-HISTORY);
		for (const wake of [...shelf.waiters]) wake();
	}

	const countsOf = (shelf: Account) => ({
		total: shelf.books.length,
		read: shelf.books.filter((book) => book.read).length,
	});

	function find(shelf: Account, id: string): Book {
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

	/** A view's handler serves its rule's window, in exactly the view's order. */
	const windowOf =
		(rule: typeof Shelf.books.view): Implementation<{ shelf: Account }, typeof Shelf.books> =>
		async (input, { shelf }) => {
			await delay(latency / 2);
			return shelf.books
				.filter((book) => rule.where(book, input))
				.sort(rule.compare)
				.slice(input.offset, input.offset + input.limit)
				.map((book) => ({ ...book }));
		};

	return createDataHandler({ context, ...forms }, (_, defineHandler) =>
		defineHandler(Shelf, {
			books: windowOf(Shelf.books.view),
			finished: windowOf(Shelf.finished.view),
			unread: windowOf(Shelf.unread.view),
			stats: (_, { shelf }) => countsOf(shelf),
			addBook: async (input, { shelf, operationId }) => {
				const title = input.title.toLowerCase();
				if (shelf.books.some((book) => book.title.toLowerCase() === title)) {
					throw new DataError('duplicate');
				}
				await apply(shelf, operationId, () => {
					const book = { id: operationId, title: input.title, read: false };
					shelf.books.push(book);
					return { kind: 'put', book: { ...book } };
				});
				return { ...find(shelf, operationId) };
			},
			setRead: async (input, { shelf, operationId }) => {
				await apply(shelf, operationId, () => {
					const book = find(shelf, input.id);
					book.read = input.read;
					return { kind: 'put', book: { ...book } };
				});
				return { ...find(shelf, input.id) };
			},
			removeBook: (input, { shelf, operationId }) =>
				apply(shelf, operationId, () => {
					find(shelf, input.id);
					shelf.books = shelf.books.filter((book) => book.id !== input.id);
					return { kind: 'removed', id: input.id };
				}),
			receipt: (input, { shelf }) => ({ applied: shelf.applied.has(input.operationId) }),
			// Each change after the listener's cursor, then each new one, until the connection ends.
			shelfChanges: async function* (_, { shelf, cursor, signal }) {
				let seen = cursor === null ? (shelf.history.at(-1)?.position ?? 0) : Number(cursor);
				const oldest = shelf.history[0]?.position ?? seen + 1;
				if (!(seen >= oldest - 1)) {
					seen = shelf.history.at(-1)?.position ?? 0;
					yield { gap: true, cursor: String(seen) };
				} else {
					yield { cursor: String(seen) };
				}
				while (!signal.aborted) {
					for (const { position, event } of shelf.history) {
						if (position <= seen) continue;
						seen = position;
						yield {
							event: { ...event, counts: countsOf(shelf) },
							id: String(position),
							cursor: String(position),
						};
					}
					// A change made while the last frame was being read is already in the history.
					if ((shelf.history.at(-1)?.position ?? 0) > seen) continue;
					await new Promise<void>((resolve) => {
						const wake = () => {
							shelf.waiters.delete(wake);
							signal.removeEventListener('abort', wake);
							resolve();
						};
						shelf.waiters.add(wake);
						signal.addEventListener('abort', wake, { once: true });
					});
				}
			},
		}),
	);
}

/** The server's one shelf handler, for `data` and for each page's forms. */
export const handler = createShelfHandler();
