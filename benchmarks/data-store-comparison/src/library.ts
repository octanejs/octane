/**
 * The library both designs serve: a server that assigns IDs, can refuse a
 * star, and lets another user change books; a network with fixed latency that
 * counts the bytes each response carries; and the views a screen shows, with
 * an oracle that says what each should contain.
 */
import * as devalue from 'devalue';

export interface Book {
	id: string;
	title: string;
	starred: boolean;
	shelf: 'A' | 'B';
	rank: number;
}

/** What a screen shows. Each design must produce exactly these rows. */
export interface ViewDef {
	readonly name: string;
	readonly where: (book: Book) => boolean;
	readonly order: 'title' | 'rank';
	readonly offset: number;
	readonly limit: number;
}

export const byTitle = (a: Book, b: Book) =>
	a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1;
export const byRank = (a: Book, b: Book) => b.rank - a.rank || byTitle(a, b);

// FEATURE START: what an app declares for these screens with the normalized design.
export const VIEWS: readonly ViewDef[] = [
	{ name: 'recent', where: () => true, order: 'rank', offset: 0, limit: 20 },
	{ name: 'bookmarks', where: (book) => book.starred, order: 'title', offset: 0, limit: 20 },
	{ name: 'library-1', where: () => true, order: 'title', offset: 0, limit: 20 },
	{ name: 'library-2', where: () => true, order: 'title', offset: 20, limit: 20 },
	{ name: 'shelf-A', where: (book) => book.shelf === 'A', order: 'title', offset: 0, limit: 20 },
	{ name: 'shelf-B', where: (book) => book.shelf === 'B', order: 'title', offset: 0, limit: 20 },
];
// FEATURE END

/** A view's sort order, for the store to place edited records locally. */
export const comparator = (view: ViewDef) => (view.order === 'title' ? byTitle : byRank);

export function evaluate(view: ViewDef, books: Iterable<Book>): Book[] {
	const rows = [...books].filter(view.where).sort(view.order === 'title' ? byTitle : byRank);
	return rows.slice(view.offset, view.offset + view.limit).map((book) => ({ ...book }));
}

/** A row as the oracle compares it: IDs are ignored, since a pending create has a local one. */
export const visible = (rows: readonly Book[]) =>
	rows.map((book) => `${book.title}|${book.starred ? '*' : ''}|${book.shelf}`).join('\n');

const WORDS = [
	'Tides',
	'Atlas',
	'Harbor',
	'Lantern',
	'Meridian',
	'Orchard',
	'Quartz',
	'Summit',
	'Willow',
	'Ember',
];

export function seedBooks(count: number): Book[] {
	const books: Book[] = [];
	for (let index = 0; index < count; index++) {
		const word = WORDS[index % WORDS.length]!;
		books.push({
			id: `b${index}`,
			title: index < WORDS.length ? word : `${word} ${String(index).padStart(4, '0')}`,
			starred: index % 7 === 0,
			shelf: index % 2 === 0 ? 'A' : 'B',
			rank: (index * 7919) % count,
		});
	}
	return books;
}

export type Change =
	{ readonly kind: 'put'; readonly book: Book } | { readonly kind: 'delete'; readonly id: string };

/** One committed server transaction, as a live feed would carry it. */
export interface ServerEvent {
	readonly revision: number;
	readonly changes: readonly Change[];
}

export class LibraryServer {
	readonly books = new Map<string, Book>();
	revision = 0;
	bytesSent = 0;
	requests = 0;
	/** Titles a star is refused for, to model a domain refusal. */
	readonly refuseStar = new Set<string>();
	private readonly listeners = new Set<(event: ServerEvent) => void>();
	private next = 0;

	constructor(count: number) {
		for (const book of seedBooks(count)) this.books.set(book.id, book);
	}

	/** Every response passes through here, so both designs pay for the bytes they ask for. */
	respond<T>(value: T): T {
		this.requests++;
		this.bytesSent += devalue.stringify(value).length;
		return devalue.parse(devalue.stringify(value)) as T;
	}

	view(view: ViewDef): Book[] {
		return evaluate(view, this.books.values());
	}

	add(title: string): Book {
		const book: Book = {
			id: `srv-${++this.next}`,
			title,
			starred: false,
			shelf: 'A',
			rank: this.books.size,
		};
		this.books.set(book.id, book);
		this.commit([{ kind: 'put', book }]);
		return { ...book };
	}

	update(id: string, patch: Partial<Book>, by: 'me' | 'other' = 'me'): Book {
		const book = this.books.get(id);
		if (!book) throw new Error(`missing ${id}`);
		if (by === 'me' && patch.starred && this.refuseStar.has(book.title)) throw new Error('refused');
		Object.assign(book, patch);
		this.commit([{ kind: 'put', book: { ...book } }]);
		return { ...book };
	}

	subscribe(listener: (event: ServerEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private commit(changes: Change[]): void {
		const event = { revision: ++this.revision, changes };
		for (const listener of this.listeners) listener(this.respond(event));
	}
}

/** One network hop. Fixed so the designs differ only in how many hops they need. */
export const LATENCY_MS = 40;
export const hop = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
