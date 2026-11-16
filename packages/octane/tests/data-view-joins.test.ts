import { describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	DataError,
	entity,
	memoryStorage,
	pages,
	receive,
	view,
	write,
	type ReadHandle,
	type Transport,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';
import { schema } from './_data-todos.js';

interface UserRow {
	id: string;
	name: string;
}
interface MessageRow {
	id: string;
	authorId: string | null;
	text: string;
	sent: number;
}

/** Each refuses a key it does not declare, as a strict validator does. */
const exactly = (value: any, keys: string[]) =>
	value !== null && typeof value === 'object' && Object.keys(value).sort().join() === keys.join();
const isUser = (value: any) => exactly(value, ['id', 'name']) && value.name !== '';
const isMessage = (value: any) => exactly(value, ['authorId', 'id', 'sent', 'text']);
const User = entity('user', schema<UserRow>(isUser));
const Message = entity('message', schema<MessageRow>(isMessage));

const inbox = view({
	name: 'messages.inbox',
	of: Message,
	with: { author: [User, 'authorId'] },
	order: [['sent', 'asc']],
	limit: 3,
});
/** The same records with no relation. */
const texts = view({ name: 'messages.texts', of: Message, order: [['sent', 'asc']], limit: 3 });
/** Dropped soon after its last reader leaves. */
const people = view({ name: 'users.all', of: User, order: [['name', 'asc']], limit: 10, keep: 20 });

const renameUser = write({
	name: 'users.rename',
	input: schema<UserRow>(isUser),
	output: schema<UserRow>(isUser),
	patches: User,
	record: (user) => user,
});
const removeUser = write({
	name: 'users.remove',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	removes: User,
});
const reassign = write({
	name: 'messages.reassign',
	input: schema<{ id: string; authorId: string }>((value) => typeof value?.authorId === 'string'),
	output: schema<MessageRow>(isMessage),
	patches: Message,
	record: (message) => message,
});

/** Five messages by three users; `m3` has no author and `m4`'s author is gone from the server. */
function chatServer() {
	const users = new Map<string, UserRow>(
		['Ada', 'Brook', 'Cy'].map((name, index) => [`u${index}`, { id: `u${index}`, name }]),
	);
	const messages = new Map<string, MessageRow>(
		['u0', 'u1', 'u0', null, 'u9'].map((authorId, index) => [
			`m${index}`,
			{ id: `m${index}`, authorId, text: `Text ${index}`, sent: index },
		]),
	);
	const log: string[] = [];
	const refuse = new Set<string>();
	const window = (input: { offset: number; limit: number }) =>
		[...messages.values()]
			.sort(inbox.view.compare)
			.slice(input.offset, input.offset + input.limit)
			.map((message) => ({ ...message }));
	const handler = createDataHandler({}, (handle) => [
		handle(inbox, (input) => {
			log.push(`messages.inbox ${input.offset}+${input.limit}`);
			return window(input).map((message) => {
				const author = message.authorId === null ? undefined : users.get(message.authorId);
				// A left join's empty side, as a database returns it.
				return { ...message, author: author ? { ...author } : (null as never) };
			});
		}),
		handle(texts, (input) => {
			log.push(`messages.texts ${input.offset}+${input.limit}`);
			return window(input);
		}),
		handle(people, () => {
			log.push('users.all');
			return [...users.values()].sort(people.view.compare).map((user) => ({ ...user }));
		}),
		handle(renameUser, (input) => {
			log.push(`rename ${input.id}`);
			if (refuse.has(input.id)) throw new DataError('refused');
			// The server's record can differ from the edit: it trims names.
			const user = { id: input.id, name: input.name.trim() };
			users.set(user.id, user);
			return { ...user };
		}),
		handle(removeUser, (input) => {
			log.push(`remove ${input.id}`);
			users.delete(input.id);
		}),
		handle(reassign, (input) => {
			log.push(`reassign ${input.id}`);
			return { ...reassigned(input.id, input.authorId) };
		}),
	]);
	function reassigned(id: string, authorId: string) {
		const message = messages.get(id)!;
		message.authorId = authorId;
		return message;
	}
	const direct = handler.transport(new Request('https://app.test/data'));
	const held: Array<() => void> = [];
	let holding = false;
	const transport: Transport = async (request, signal) => {
		if (holding && request.kind === 'write') await new Promise<void>((done) => held.push(done));
		return direct(request, signal);
	};
	return {
		users,
		log,
		refuse,
		transport,
		/** A change another client made. */
		reassign: (id: string, authorId: string) => void reassigned(id, authorId),
		hold: () => void (holding = true),
		release: () => {
			holding = false;
			held.splice(0).forEach((done) => done());
		},
	};
}

async function ready<T>(handle: ReadHandle<T>) {
	const notify = vi.fn();
	handle.subscribe(notify);
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return notify;
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, 10));

type InboxRow = MessageRow & { readonly author?: UserRow };
const authors = (handle: ReadHandle<InboxRow[]>) =>
	handle.getSnapshot().value?.map((row) => row.author?.name);

describe('octane/data views with relations', () => {
	it('shows each row with the record its key points at, from one request', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, { limit: 5 });
		await ready(list);

		expect(list.getSnapshot().value).toEqual([
			{ id: 'm0', authorId: 'u0', text: 'Text 0', sent: 0, author: { id: 'u0', name: 'Ada' } },
			{ id: 'm1', authorId: 'u1', text: 'Text 1', sent: 1, author: { id: 'u1', name: 'Brook' } },
			{ id: 'm2', authorId: 'u0', text: 'Text 2', sent: 2, author: { id: 'u0', name: 'Ada' } },
			// An empty key, and a key whose record the server does not have.
			{ id: 'm3', authorId: null, text: 'Text 3', sent: 3, author: undefined },
			{ id: 'm4', authorId: 'u9', text: 'Text 4', sent: 4, author: undefined },
		]);
		expect(server.log).toEqual(['messages.inbox 0+26']);
	});

	it('shows an edit to a related record in every row that points at it, in the task that made it', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		const notify = await ready(list);
		const before = list.getSnapshot().value!;
		notify.mockClear();
		server.log.length = 0;

		server.hold();
		const saved = store.write(renameUser, { id: 'u0', name: ' Ada L ' });
		expect(authors(list)).toEqual([' Ada L ', 'Brook', ' Ada L ']);
		// The row that does not point at the user is the row it was.
		expect(list.getSnapshot().value![1]).toBe(before[1]);
		expect(notify).toHaveBeenCalledTimes(1);

		server.release();
		await saved;
		await quiet();
		// The server's record replaces the edit, and the view does not reload for it.
		expect(authors(list)).toEqual(['Ada L', 'Brook', 'Ada L']);
		expect(list.getSnapshot().value![1]).toBe(before[1]);
		expect(server.log).toEqual(['rename u0']);
	});

	it('keeps a row whose related record has a pending edit through a change to another row', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		await ready(list);

		server.hold();
		void store.write(renameUser, { id: 'u0', name: 'Adah' });
		const pending = list.getSnapshot().value!;
		receive(store, [{ put: User, value: { id: 'u1', name: 'Bo' } }]);
		expect(authors(list)).toEqual(['Adah', 'Bo', 'Adah']);
		expect(list.getSnapshot().value![0]).toBe(pending[0]);
		expect(list.getSnapshot().value![2]).toBe(pending[2]);
	});

	it('rolls a refused edit to a related record back out of the rows', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		await ready(list);
		const before = list.getSnapshot().value!;

		server.refuse.add('u1');
		const saved = store.write(renameUser, { id: 'u1', name: 'Brooke' });
		expect(authors(list)).toEqual(['Ada', 'Brooke', 'Ada']);
		await expect(saved).rejects.toMatchObject({ code: 'refused' });
		expect(list.getSnapshot().value).toEqual(before);
		// The rows the edit never touched are the rows they were.
		expect(list.getSnapshot().value![0]).toBe(before[0]);
	});

	it('tells a view of a change to a record its rows point at, and of no other', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		const notify = await ready(list);
		notify.mockClear();
		const before = list.getSnapshot();

		// Cy wrote none of the rows shown.
		receive(store, [{ put: User, value: { id: 'u2', name: 'Cyrus' } }]);
		expect(notify).not.toHaveBeenCalled();
		expect(list.getSnapshot()).toBe(before);

		receive(store, [{ put: User, value: { id: 'u1', name: 'Brooklyn' } }]);
		expect(notify).toHaveBeenCalledTimes(1);
		expect(authors(list)).toEqual(['Ada', 'Brooklyn', 'Ada']);

		receive(store, [{ remove: User, id: 'u0' }]);
		expect(authors(list)).toEqual([undefined, 'Brooklyn', undefined]);
		expect(server.log).toEqual(['messages.inbox 0+24']);
	});

	it('shows a record that arrives for a key that pointed at none', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, { offset: 2 });
		await ready(list);
		expect(authors(list)).toEqual(['Ada', undefined, undefined]);

		receive(store, [{ put: User, value: { id: 'u9', name: 'Ines' } }]);
		expect(authors(list)).toEqual(['Ada', undefined, 'Ines']);
	});

	it('follows a row whose key an edit points at another record', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		const notify = await ready(list);

		server.hold();
		const saved = store.write(reassign, { id: 'm0', authorId: 'u1' });
		expect(authors(list)).toEqual(['Brook', 'Brook', 'Ada']);
		server.release();
		await saved;
		await quiet();
		expect(authors(list)).toEqual(['Brook', 'Brook', 'Ada']);

		// The row now changes with the record it points at.
		notify.mockClear();
		receive(store, [{ put: User, value: { id: 'u1', name: 'Bo' } }]);
		expect(authors(list)).toEqual(['Bo', 'Bo', 'Ada']);
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('loads the record an edit points a row at, once the server has the edit', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		await ready(list);
		server.log.length = 0;

		// No row pointed at Cy, so the store holds no record of him.
		server.hold();
		const saved = store.write(reassign, { id: 'm2', authorId: 'u2' });
		expect(authors(list)).toEqual(['Ada', 'Brook', undefined]);
		await quiet();
		// The server's rows still point at Ada: asking now would bring nothing new.
		expect(server.log).toEqual([]);

		server.release();
		await saved;
		await vi.waitFor(() => expect(authors(list)).toEqual(['Ada', 'Brook', 'Cy']));
		await quiet();
		expect(server.log).toEqual(['reassign m2', 'messages.inbox 0+24']);

		// The record is the store's now: a change to it shows with no request.
		receive(store, [{ put: User, value: { id: 'u2', name: 'Cyrus' } }]);
		expect(authors(list)).toEqual(['Ada', 'Brook', 'Cyrus']);
		expect(server.log).toHaveLength(2);
	});

	it('loads the record an event points a row at, and asks once for one the server lacks', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		// Two windows over the same rows, the last of which points at a user the server lacks.
		const list = store.read(inbox, { limit: 5 });
		const top = store.read(inbox, undefined);
		await ready(list);
		await ready(top);
		await quiet();
		expect(server.log).toEqual(['messages.inbox 0+26', 'messages.inbox 0+24']);

		// A change to that row's own fields is no reason to ask again.
		receive(store, [
			{ put: Message, value: { id: 'm4', authorId: 'u9', text: 'Edited', sent: 4 } },
		]);
		await quiet();
		expect(list.getSnapshot().value![4]).toMatchObject({ text: 'Edited', author: undefined });
		expect(server.log).toHaveLength(2);

		// Another client hands the first message to Cy, whom neither window was given.
		server.log.length = 0;
		server.reassign('m0', 'u2');
		receive(store, [
			{ put: Message, value: { id: 'm0', authorId: 'u2', text: 'Text 0', sent: 0 } },
		]);
		await vi.waitFor(() => expect(authors(top)).toEqual(['Cy', 'Brook', 'Ada']));
		await quiet();
		expect(authors(list)).toEqual(['Cy', 'Brook', 'Ada', undefined, undefined]);
		expect(server.log.sort()).toEqual(['messages.inbox 0+24', 'messages.inbox 0+26']);
	});

	it('keeps the rows a change moves, and reloads for a tag that names a related entity', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		await ready(list);
		const [, second, third] = list.getSnapshot().value!;

		// The first message is sent again, last: the others move up.
		receive(store, [
			{ put: Message, value: { id: 'm0', authorId: 'u0', text: 'Text 0', sent: 9 } },
		]);
		const moved = list.getSnapshot().value!;
		expect(moved.map((row) => row.id)).toEqual(['m1', 'm2', 'm3']);
		expect(moved[0]).toBe(second);
		expect(moved[1]).toBe(third);

		// A change to a row's own record shows, and leaves its related record the object it was.
		receive(store, [
			{ put: Message, value: { id: 'm1', authorId: 'u1', text: 'Edited', sent: 1 } },
		]);
		const edited = list.getSnapshot().value!;
		expect(edited[0]).toMatchObject({ text: 'Edited', author: { name: 'Brook' } });
		expect(edited[0]!.author).toBe(second!.author);
		expect(edited[1]).toBe(third);

		server.log.length = 0;
		store.invalidate(['user']);
		await vi.waitFor(() => expect(server.log).toEqual(['messages.inbox 0+24']));
	});

	it('shares its records with plain views of both entities', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const plain = store.read(texts, undefined);
		const list = store.read(inbox, undefined);
		const users = store.read(people, undefined);
		// The joined view loads last, so the records the plain view shows are the ones it brought.
		await ready(plain);
		await ready(users);
		await ready(list);

		// A plain view's rows are the records alone.
		expect(plain.getSnapshot().value![0]).toEqual({
			id: 'm0',
			authorId: 'u0',
			text: 'Text 0',
			sent: 0,
		});
		void store.write(renameUser, { id: 'u0', name: 'Zed' });
		expect(authors(list)).toEqual(['Zed', 'Brook', 'Zed']);
		expect(users.getSnapshot().value!.map((user) => user.name)).toEqual(['Brook', 'Cy', 'Zed']);
	});

	it('keeps a related record after the last view of its own entity is dropped', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = store.read(inbox, undefined);
		await ready(list);
		const users = store.read(people, undefined);
		const stop = users.subscribe(() => {});
		await vi.waitFor(() => expect(users.getSnapshot().status).toBe('ready'));
		stop();
		// Past the users view's `keep`.
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(users.getSnapshot().status).toBe('pending');

		// A rename still finds the record: the edit shows, which it cannot without one.
		void store.write(renameUser, { id: 'u1', name: 'Bea' });
		expect(authors(list)).toEqual(['Ada', 'Bea', 'Ada']);
	});

	it('hydrates from a server render with its related records and no request', async () => {
		const server = chatServer();
		const rendering = createDataStore({ transport: server.transport });
		await rendering.prefetch(inbox, undefined);
		const seed = rendering.dehydrate();
		server.log.length = 0;

		const client = createDataStore({ transport: server.transport, seed });
		const list = client.read(inbox, undefined);
		expect(list.getSnapshot().status).toBe('ready');
		expect(authors(list)).toEqual(['Ada', 'Brook', 'Ada']);
		// The related records are the store's own, so an edit to one shows.
		void client.write(renameUser, { id: 'u0', name: 'Adah' });
		expect(authors(list)).toEqual(['Adah', 'Brook', 'Adah']);
		await quiet();
		expect(server.log).toEqual(['rename u0']);
	});

	it('restores from persistent storage with its related records', async () => {
		const storage = memoryStorage();
		const persist = {
			storage,
			partition: 'ada',
			key: 'a session secret of at least sixteen bytes',
		};
		const server = chatServer();
		const first = createDataStore({ transport: server.transport, persist });
		await ready(first.read(inbox, undefined));
		await new Promise((resolve) => setTimeout(resolve, 20));

		const offline = createDataStore({ transport: () => new Promise(() => {}), persist });
		const list = offline.read(inbox, undefined);
		await ready(list);
		expect(authors(list)).toEqual(['Ada', 'Brook', 'Ada']);
	});

	it('reads a growing list a page at a time', async () => {
		const server = chatServer();
		const store = createDataStore({ transport: server.transport });
		const list = pages(store, inbox, undefined, 2);
		list.subscribe(() => {});
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		await list.loadMore();
		expect(list.getSnapshot().value!.map((row) => row.author?.name)).toEqual([
			'Ada',
			'Brook',
			'Ada',
			undefined,
		]);
	});
});
