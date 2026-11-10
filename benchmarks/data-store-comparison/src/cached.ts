/**
 * Design A: octane/data as it is today. Each view is a read whose response is
 * cached as the server sent it. Edits update every cached copy of a book by
 * ID; membership and order come from the server, so writes and live events
 * refresh the views they may affect.
 */
import {
	createDataStore,
	entity,
	read,
	write,
	type DataReply,
	type DataRequest,
	type DataStore,
	type StandardSchema,
} from '../../../packages/octane/src/data/index.ts';
import type { Design } from './design.ts';
import { VIEWS, hop, type Book, type LibraryServer } from './library.ts';

const trusted = <T>(): StandardSchema<unknown, T> => ({
	'~standard': { version: 1, vendor: 'bench', validate: (value) => ({ value: value as T }) },
});

// FEATURE START: what an app declares for these screens with the cached design.
const Book = entity('book', trusted<Book>());
const reads = new Map(
	VIEWS.map((view) => [
		view.name,
		read({
			name: view.name,
			output: trusted<Book[]>(),
			entities: (rows) => Book.from(rows),
			tags: ['books'],
		}),
	]),
);
const addBook = write({
	name: 'books.add',
	input: trusted<{ title: string }>(),
	output: trusted<Book>(),
	creates: Book,
	draft: (input, id) => ({ id, title: input.title, starred: false, shelf: 'A', rank: 0 }),
	serverId: (book) => book.id,
	// Membership and order come from the server, so every list reloads.
	invalidates: ['books'],
});
const updateBook = write({
	name: 'books.update',
	input: trusted<Partial<Book> & { id: string }>(),
	output: trusted<Book>(),
	patches: Book,
	invalidates: ['books'],
});
/** A live event cannot say which cached lists it moves a book in or out of. */
const onServerEvent = (store: DataStore) => store.invalidate(['books']);
// FEATURE END

export function cachedDesign(server: LibraryServer): Design {
	const transport = async (request: DataRequest): Promise<DataReply> => {
		await hop();
		let reply: DataReply;
		try {
			if (request.kind === 'read') {
				reply = { ok: true, value: server.view(VIEWS.find((view) => view.name === request.name)!) };
			} else {
				const input = request.input as Partial<Book> & { id: string; title: string };
				const value =
					request.name === 'books.add'
						? server.add(input.title)
						: server.update(input.id, (({ id, ...patch }) => patch)(input));
				const refreshed = (request.refresh ?? []).map((item) => ({
					...item,
					value: server.view(VIEWS.find((view) => view.name === item.name)!),
				}));
				reply = { ok: true, value, refreshed };
			}
		} catch (error) {
			reply = { ok: false, code: (error as Error).message };
		}
		return server.respond(reply);
	};

	let store: DataStore;
	const listeners = new Set<() => void>();
	const stops: Array<() => void> = [];
	const handles = () => VIEWS.map((view) => store.read(reads.get(view.name)!, undefined));

	return {
		name: 'A: cached responses',
		async start(persisted) {
			store = createDataStore({ transport, seed: persisted });
			for (const handle of handles())
				stops.push(handle.subscribe(() => listeners.forEach((l) => l())));
			// From storage the seed is shown as is, as design B shows its stored records; neither revalidates here.
			if (!persisted) {
				await Promise.all(VIEWS.map((view) => store.prefetch(reads.get(view.name)!, undefined)));
			}
			stops.push(
				server.subscribe((event) => {
					void hop().then(() => {
						if (!store.retired && event) onServerEvent(store);
					});
				}),
			);
		},
		views() {
			const views = new Map<string, readonly Book[]>();
			for (const view of VIEWS) {
				views.set(
					view.name,
					store.read(reads.get(view.name)!, undefined).getSnapshot().value ?? [],
				);
			}
			return views;
		},
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		add: (title) => store.write(addBook, { title }),
		update: (id, patch) => store.write(updateBook, { id, ...patch }),
		persist: async () => store.dehydrate(),
		workerBytes: () => 0,
		close() {
			stops.splice(0).forEach((stop) => stop());
			store.retire();
		},
	};
}
