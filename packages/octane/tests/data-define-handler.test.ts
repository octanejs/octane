/**
 * `defineHandler` serves a module's contracts from one object keyed by export
 * name. It expands to the pairs `handle` makes, so a group must answer every
 * request exactly as the same handlers registered one by one.
 */
import * as devalue from 'devalue';
import { describe, expect, it } from 'vitest';
import { DataError, entity, feed, read, write, type DataRequest } from '../src/data/index.js';
import {
	createDataHandler,
	type DataCall,
	type DataServer,
	type Implementations,
} from '../src/data/server.js';
import * as Todos from './_data-todos.js';
import { schema } from './_data-todos.js';

type Context = { viewer: string };
const context = (_request: Request, caller?: { viewer?: unknown }) => ({
	viewer: String(caller?.viewer ?? 'ada'),
});

function implementations(): Implementations<Context, typeof Todos> {
	const rows: Todos.TodoItem[] = [
		{ id: 'b', title: 'Tides', done: false },
		{ id: 'a', title: 'Atoll', done: false },
	];
	return {
		todos: () => rows.map((row) => ({ ...row })),
		firstTodo: (_, { viewer }) => ({ todo: { ...rows[0]!, title: `${viewer}'s` } }),
		todoPages: (input) =>
			[...rows].sort(Todos.todoPages.view.compare).slice(input.offset, input.offset + input.limit),
		addTodo: (input, { operationId }) => {
			rows.push({ id: operationId, title: input.title, done: false });
		},
		setDone: (input) => {
			rows.find((row) => row.id === input.id)!.done = input.done;
		},
		removeTodo: (input) => {
			rows.splice(
				rows.findIndex((row) => row.id === input.id),
				1,
			);
		},
		todoChanges: async function* (_, { cursor }) {
			yield { cursor: cursor ?? '0' };
			yield { event: { ...rows[0]! }, id: 'e1', cursor: '1' };
			// Fails its contract, so it never leaves the server.
			yield { event: { id: 'x', title: '' }, cursor: '2' };
		},
	};
}

const REQUESTS: DataRequest[] = [
	{ kind: 'read', name: 'todos.list', input: undefined },
	{ kind: 'read', name: 'todos.first', input: undefined },
	{ kind: 'read', name: 'todos.byTitle', input: { offset: 0, limit: 1 } },
	{ kind: 'write', name: 'todos.add', input: { title: 'Kelp' }, operationId: 'op1' },
	{ kind: 'write', name: 'todos.add', input: { title: '' }, operationId: 'op2' },
	{ kind: 'read', name: 'todos.add', input: { title: 'Kelp' } },
	{
		kind: 'write',
		name: 'todos.setDone',
		input: { id: 'a', done: true },
		operationId: 'op3',
		refresh: [{ name: 'todos.byTitle', input: { offset: 0, limit: 3 } }],
	},
	{ kind: 'write', name: 'todos.remove', input: { id: 'b' }, operationId: 'op4' },
	{ kind: 'read', name: 'todos.list', input: undefined },
	{ kind: 'position', name: 'todos.changes', input: undefined },
];

async function script(server: DataServer) {
	const transport = server.transport(new Request('https://app.test/data'));
	const replies = [];
	for (const request of REQUESTS) {
		replies.push(await transport(request, new AbortController().signal));
	}
	const request = new Request('https://app.test/data');
	const frames = [];
	const feed = devalue.stringify({ name: 'todos.changes', params: undefined, cursor: 'c0' });
	for await (const frame of server.listen(feed, {
		request,
		signal: request.signal,
		viewer: 'bo',
	})) {
		frames.push(devalue.parse(frame));
	}
	return { replies, frames };
}

describe('octane/data defineHandler', () => {
	it('serves reads, views, writes and feeds exactly as the same handlers passed to handle', async () => {
		const one = implementations();
		const byHandle = createDataHandler({ context }, (handle) => [
			handle(Todos.todos, one.todos),
			handle(Todos.firstTodo, one.firstTodo),
			handle(Todos.todoPages, one.todoPages),
			handle(Todos.addTodo, one.addTodo),
			handle(Todos.setDone, one.setDone),
			handle(Todos.removeTodo, one.removeTodo),
			handle(Todos.todoChanges, one.todoChanges),
		]);
		const byGroup = createDataHandler({ context }, (_, defineHandler) =>
			defineHandler(Todos, implementations()),
		);

		const expected = await script(byHandle);
		expect(await script(byGroup)).toEqual(expected);
		// The script reached every path: data, refusals, refreshes and a dropped event.
		expect(expected.replies.map((reply) => (reply.ok ? 'ok' : reply.code))).toEqual([
			'ok',
			'ok',
			'ok',
			'ok',
			'invalid',
			'not_found',
			'ok',
			'ok',
			'ok',
			'ok',
		]);
		expect(expected.replies[6]).toMatchObject({ refreshed: [{ name: 'todos.byTitle' }] });
		expect(expected.frames).toEqual([
			{},
			{ cursor: 'c0' },
			{ event: { id: 'a', title: 'Atoll', done: true }, id: 'e1', cursor: '1' },
			{ gap: true, cursor: '2' },
		]);
	});

	it('mixes with handle, and keeps refusing two handlers for one name', () => {
		const group = implementations();
		expect(() =>
			createDataHandler({ context }, (handle, defineHandler) => [
				...defineHandler(Todos, group),
				handle(Todos.todos, group.todos),
			]),
		).toThrow('octane/data: two handlers are named "todos.list"');
	});

	it('refuses a contract with no implementation, even without type checking', () => {
		const { addTodo: _, ...missing } = implementations();
		expect(() =>
			createDataHandler({ context }, (_, defineHandler) =>
				defineHandler(Todos, missing as Implementations<Context, typeof Todos>),
			),
		).toThrow('octane/data: no handler for "addTodo"');
	});
});

describe('contracts declared with the function that serves them', () => {
	interface Note {
		id: string;
		text: string;
		owner: string;
	}
	const Note = entity(
		'note',
		schema<Note>((value) => typeof value?.text === 'string' && typeof value?.owner === 'string'),
	);
	type Call = DataCall & { viewer: string };
	const notes = new Map<string, Note>();
	const ran: string[] = [];
	const Notes = {
		Note,
		note: read(
			{
				name: 'notes.one',
				input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
				output: Note.one,
			},
			(input, { viewer }: Call) => {
				ran.push('note');
				const note = notes.get(input.id);
				// Authorization stays the function's: it sees the context the handler made.
				if (note?.owner !== viewer) throw new DataError('forbidden');
				return note;
			},
		),
		save: write(
			{
				name: 'notes.save',
				input: schema<{ text: string }>((value) => typeof value?.text === 'string'),
				output: Note.one,
				creates: Note,
			},
			(input, { viewer, operationId }: Call) => {
				ran.push('save');
				// An empty text breaks the output schema, so the reply cannot carry it.
				const note = {
					id: operationId,
					text: input.text,
					owner: input.text ? viewer : (null as any),
				};
				notes.set(note.id, note);
				return note;
			},
		),
		saved: feed(
			{
				name: 'notes.saved',
				event: Note.one,
				changes: (note) => ({ put: Note, value: note }),
				covers: ['note'],
			},
			async function* (_, { viewer, cursor }: Call & { readonly cursor: string | null }) {
				yield { cursor: cursor ?? '0' };
				for (const note of notes.values())
					if (note.owner === viewer) yield { event: note, cursor: note.id };
				// Fails its contract, so it never leaves the server.
				yield { event: { id: 'x', text: 1 } as never, cursor: 'x' };
			},
		),
		count: read({
			name: 'notes.count',
			output: schema<number>((value) => typeof value === 'number'),
		}),
	};

	it('serves each by its own function, validating input and output on the server', async () => {
		const server = createDataHandler({ context }, (_, defineHandler) =>
			defineHandler(Notes, { count: () => notes.size }),
		);
		const transport = server.transport(new Request('https://app.test/data'));
		const send = (request: DataRequest) => transport(request, new AbortController().signal);

		expect(
			await send({ kind: 'write', name: 'notes.save', input: { text: 'Kelp' }, operationId: 'n1' }),
		).toEqual({ ok: true, value: { id: 'n1', text: 'Kelp', owner: 'ada' } });
		expect(await send({ kind: 'read', name: 'notes.one', input: { id: 'n1' } })).toEqual({
			ok: true,
			value: { id: 'n1', text: 'Kelp', owner: 'ada' },
		});
		expect(await send({ kind: 'read', name: 'notes.count', input: undefined })).toEqual({
			ok: true,
			value: 1,
		});

		// Invalid input never reaches the function; an invalid result never leaves the server.
		ran.length = 0;
		expect(await send({ kind: 'read', name: 'notes.one', input: { id: 7 } })).toMatchObject({
			ok: false,
			code: 'invalid',
		});
		expect(ran).toEqual([]);
		// The write ran, so a reply that breaks its output cannot say it was refused.
		await expect(
			send({ kind: 'write', name: 'notes.save', input: { text: '' }, operationId: 'n2' }),
		).rejects.toThrow('octane/data: invalid write result');
		expect(ran).toEqual(['save']);

		// Another viewer is refused by the function itself.
		const other = createDataHandler({ context: () => ({ viewer: 'bo' }) }, (_, defineHandler) =>
			defineHandler(Notes, { count: () => 0 }),
		).transport(new Request('https://app.test/data'));
		expect(
			await other(
				{ kind: 'read', name: 'notes.one', input: { id: 'n1' } },
				new AbortController().signal,
			),
		).toMatchObject({ ok: false, code: 'forbidden' });
	});

	it('serves a feed by its own function, dropping events its contract refuses', async () => {
		const server = createDataHandler({ context }, (_, defineHandler) =>
			defineHandler(Notes, { count: () => notes.size }),
		);
		const request = new Request('https://app.test/data');
		const frames = [];
		for await (const frame of server.listen(
			devalue.stringify({ name: 'notes.saved', params: undefined, cursor: 'c0' }),
			{ request, signal: request.signal, viewer: 'ada' },
		))
			frames.push(devalue.parse(frame));
		expect(frames).toEqual([
			{},
			{ cursor: 'c0' },
			{ event: { id: 'n1', text: 'Kelp', owner: 'ada' }, cursor: 'n1' },
			{ gap: true, cursor: 'x' },
		]);
	});

	it('still refuses a contract with neither its own function nor one in the object', () => {
		expect(() =>
			createDataHandler(
				{ context },
				(_, defineHandler) => (defineHandler as (group: object) => unknown)(Notes) as never,
			),
		).toThrow('octane/data: no handler for "count"');
	});
});
