/**
 * The five library journeys from the reply on #2362, run against any design.
 * Each measures what the user sees: how long until every view shows the
 * intended state, how long until it shows the server's settled state, and
 * whether any notification showed an impossible state on the way.
 */
import type { Design, DesignFactory } from './design.ts';
import { LibraryServer, VIEWS, evaluate, visible, type Book } from './library.ts';

export interface Result {
	readonly journey: string;
	readonly design: string;
	/** ms from the action until every view shows what the user intended; null if never before settling. */
	readonly intendedMs: number | null;
	/** Whether every view shows the server's final state once the journey goes quiet. */
	readonly settled: boolean;
	readonly requests: number;
	readonly bytesFetched: number;
	readonly workerBytes: number;
	/** Notifications that showed a state the journey forbids, such as one book on two shelves. */
	readonly violations: number;
	readonly notes?: string;
}

const matches = (design: Design, books: Iterable<Book>) => {
	const all = [...books];
	const shown = design.views();
	return VIEWS.every(
		(view) => visible(shown.get(view.name) ?? []) === visible(evaluate(view, all)),
	);
};

const quiet = () => new Promise((resolve) => setTimeout(resolve, 400));

interface Context {
	readonly server: LibraryServer;
	readonly design: Design;
}

interface Journey {
	readonly name: string;
	prepare?(server: LibraryServer): void;
	/** The books as the user intends them once their action applies. */
	intended(server: LibraryServer): Book[];
	act(context: Context): Promise<unknown>;
	/** A state no notification may show. */
	forbids?(views: Map<string, readonly Book[]>): boolean;
}

const firstInLibrary = (server: LibraryServer) =>
	server.view(VIEWS.find((view) => view.name === 'library-1')!)[0]!.id;
const shownBookmark = (server: LibraryServer) =>
	server.view(VIEWS.find((view) => view.name === 'bookmarks')!)[5]!.id;
const books = (server: LibraryServer) => [...server.books.values()].map((book) => ({ ...book }));
const edit = (server: LibraryServer, id: string, patch: Partial<Book>) =>
	books(server).map((book) => (book.id === id ? { ...book, ...patch } : book));

export const JOURNEYS: readonly Journey[] = [
	{
		name: '1. Add a book and star it before the create returns',
		intended: (server) => [
			...books(server),
			{ id: 'new', title: 'Aardvark', starred: true, shelf: 'A', rank: 0 },
		],
		async act({ design }) {
			const added = design.add('Aardvark');
			const local = [...design.views().values()].flat().find((book) => book.title === 'Aardvark');
			const id =
				local?.id ??
				(await new Promise<string>((resolve) => {
					const stop = design.onChange(() => {
						const row = [...design.views().values()]
							.flat()
							.find((book) => book.title === 'Aardvark');
						if (row) {
							stop();
							resolve(row.id);
						}
					});
				}));
			return Promise.all([added, design.update(id, { starred: true })]);
		},
	},
	{
		name: '2. Rename a starred book across a sorted list and pages',
		// A book the user can see: the sixth row of Bookmarks, renamed to sort first everywhere.
		intended: (server) => edit(server, shownBookmark(server), { title: 'Abyss' }),
		act: ({ design, server }) => design.update(shownBookmark(server), { title: 'Abyss' }),
	},
	{
		name: '3. A star is refused after another user renames the book',
		prepare: (server) => server.refuseStar.add('Harbor'),
		intended: (server) => edit(server, 'b2', { starred: true, title: 'Night harbor' }),
		async act({ design, server }) {
			const starred = design.update('b2', { starred: true }).catch(() => 'refused');
			server.update('b2', { title: 'Night harbor' }, 'other');
			return starred;
		},
	},
	{
		name: '4. Another user moves a book between shelves',
		intended: (server) => edit(server, 'b1', { shelf: 'A' }),
		act: async ({ server }) => server.update('b1', { shelf: 'A' }, 'other'),
		forbids(views) {
			const on = (name: string) => (views.get(name) ?? []).some((book) => book.id === 'b1');
			return on('shelf-A') === on('shelf-B');
		},
	},
	{
		name: '5. Rename the first book in the library so it sorts last',
		// Page 2 now needs a row past the edge of a window, so a windowed store must fetch it.
		intended: (server) => edit(server, firstInLibrary(server), { title: 'Zzz last' }),
		act: ({ design, server }) => design.update(firstInLibrary(server), { title: 'Zzz last' }),
	},
];

export async function runJourney(
	factory: DesignFactory,
	journey: Journey,
	count: number,
): Promise<Result> {
	const server = new LibraryServer(count);
	journey.prepare?.(server);
	const design = factory(server);
	await design.start();
	await quiet();
	const requests = server.requests;
	const bytesFetched = server.bytesSent;
	const workerBytes = design.workerBytes();
	const intended = journey.intended(server);

	let intendedMs: number | null = null;
	let violations = 0;
	const started = performance.now();
	const check = () => {
		if (intendedMs === null && matches(design, intended)) intendedMs = performance.now() - started;
		if (journey.forbids?.(design.views())) violations++;
	};
	const stop = design.onChange(check);
	await journey.act({ server, design });
	await quiet();
	stop();
	const settled = matches(design, server.books.values());
	const result: Result = {
		journey: journey.name,
		design: design.name,
		intendedMs: intendedMs === null ? null : Math.round(intendedMs),
		settled,
		requests: server.requests - requests,
		bytesFetched: server.bytesSent - bytesFetched,
		workerBytes: design.workerBytes() - workerBytes,
		violations,
	};
	design.close();
	return result;
}

/** Journey 6: start once from the network, persist, then start a new session from storage. */
export async function runColdStart(factory: DesignFactory, count: number) {
	const server = new LibraryServer(count);
	const first = factory(server);
	const loadStarted = performance.now();
	await first.start();
	const loadMs = performance.now() - loadStarted;
	const load = {
		requests: server.requests,
		bytes: server.bytesSent,
		workerBytes: first.workerBytes(),
	};
	await quiet();
	const persisted = await first.persist();
	first.close();

	const requests = server.requests;
	const bytes = server.bytesSent;
	const second = factory(server);
	const started = performance.now();
	await second.start(persisted);
	const restoredMs = performance.now() - started;
	const correct = matches(second, server.books.values());
	const result = {
		design: second.name,
		networkLoadMs: Math.round(loadMs),
		networkLoadRequests: load.requests,
		networkLoadBytes: load.bytes,
		networkLoadWorkerBytes: load.workerBytes,
		persistedBytes: persisted.length,
		restoreMs: Math.round(restoredMs),
		restoreRequests: server.requests - requests,
		restoreBytes: server.bytesSent - bytes,
		restoredViewsCorrect: correct,
	};
	second.close();
	return result;
}
