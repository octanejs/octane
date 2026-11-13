/**
 * `defineHandler` serves a module's contracts from one object keyed by export
 * name. It expands to the pairs `handle` makes, so a group must answer every
 * request exactly as the same handlers registered one by one.
 */
import * as devalue from 'devalue';
import { describe, expect, it } from 'vitest';
import type { DataRequest } from '../src/data/index.js';
import { createDataHandler, type DataServer, type Implementations } from '../src/data/server.js';
import * as Todos from './_data-todos.js';

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
