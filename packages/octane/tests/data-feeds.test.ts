/**
 * Feeds: server events that keep a store's loaded values current. The store
 * listens while anything observes a feed, shares one connection, applies each
 * event to every read that holds its records, and reloads what it may have
 * missed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	feed,
	listen,
	pubSubListener,
	read,
	receive,
	webSocketListener,
	type FeedFrame,
	type FeedRequest,
	type Listener,
	type ReadHandle,
	type Transport,
} from '../src/data/index.js';
import {
	createServer,
	firstTodo,
	isTodo,
	schema,
	Todo,
	todoChanges,
	todoPages,
	todos,
	type TodoItem,
} from './_data-todos.js';
import { createDataHandler, type DataServer, type FeedSocket } from '../src/data/server.js';

type TodoEvent =
	{ kind: 'put'; todo: TodoItem } | { kind: 'remove'; id: string } | { kind: 'added' };

const changes = feed({
	name: 'todos.changes',
	event: schema<TodoEvent>(
		(value) =>
			(value?.kind === 'put' && isTodo(value.todo)) ||
			(value?.kind === 'remove' && typeof value.id === 'string') ||
			value?.kind === 'added',
	),
	changes: (event) =>
		event.kind === 'put'
			? { put: Todo, value: event.todo }
			: event.kind === 'remove'
				? { remove: Todo, id: event.id }
				: { invalidates: ['todo'] },
	covers: ['todo'],
});

interface Connection {
	readonly request: FeedRequest;
	readonly signal: AbortSignal;
	send(frame: FeedFrame): void;
	/** End the connection, cleanly or with `error`. */
	end(error?: unknown): void;
}

/** A listener whose connections the test drives frame by frame. */
function scripted() {
	const connections: Connection[] = [];
	const listener: Listener = (request, signal) => ({
		async *[Symbol.asyncIterator]() {
			const queue: FeedFrame[] = [];
			let wake: () => void = () => {};
			let ended = false;
			let failure: unknown;
			connections.push({
				request,
				signal,
				send: (frame) => (queue.push(frame), wake()),
				end: (error) => ((ended = true), (failure = error), wake()),
			});
			signal.addEventListener('abort', () => ((ended = true), wake()));
			while (true) {
				while (queue.length === 0 && !ended) await new Promise<void>((resolve) => (wake = resolve));
				if (queue.length > 0) yield queue.shift()!;
				else if (failure !== undefined) throw failure;
				else return;
			}
		},
	});
	return { listener, connections };
}

function setup(transport?: Transport) {
	const server = createServer();
	const { listener, connections } = scripted();
	const store = createDataStore({ transport: transport ?? server.transport, listen: listener });
	return { server, store, connections };
}

/** Observe a read until the test ends; returns its value once it has one. */
async function observed<T>(handle: ReadHandle<T>): Promise<() => T> {
	stops.push(handle.subscribe(() => {}));
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return () => handle.getSnapshot().value!;
}

const stops: Array<() => void> = [];
afterEach(() => {
	for (const stop of stops.splice(0)) stop();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('feeds', () => {
	it('shows a changed record in every read that holds it, with no request', async () => {
		const { server, store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		const first = await observed(store.read(firstTodo, undefined));
		const page = await observed(store.read(todoPages, undefined));
		stops.push(listen(store, changes).subscribe(() => {}));
		const loads = server.log.length;

		connections[0]!.send({ event: { kind: 'put', todo: { id: 'a', title: 'Atoll', done: true } } });
		await vi.waitFor(() => expect(list()).toEqual([{ id: 'a', title: 'Atoll', done: true }]));
		expect(first()).toEqual({ todo: { id: 'a', title: 'Atoll', done: true } });
		expect(page()).toEqual([{ id: 'a', title: 'Atoll', done: true }]);

		// An app's own subscription applies the same changes.
		receive(store, [{ put: Todo, value: { id: 'a', title: 'Lagoon', done: true } }]);
		expect(first()).toEqual({ todo: { id: 'a', title: 'Lagoon', done: true } });
		expect(server.log.length).toBe(loads);
	});

	it("puts a new record into a view's window and takes a removed one out of every list", async () => {
		const { server, store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		const page = await observed(store.read(todoPages, undefined));
		stops.push(listen(store, changes).subscribe(() => {}));
		const loads = server.log.length;

		connections[0]!.send({
			event: { kind: 'put', todo: { id: 'b', title: 'Amber', done: false } },
		});
		await vi.waitFor(() => expect(page().map((todo) => todo.title)).toEqual(['Amber', 'Tides']));

		connections[0]!.send({ event: { kind: 'remove', id: 'a' } });
		await vi.waitFor(() => expect(page().map((todo) => todo.title)).toEqual(['Amber']));
		expect(list()).toEqual([]);
		expect(server.log.length).toBe(loads);
	});

	it('reloads a window lower in a view when a new record lands above it', async () => {
		const { server, store, connections } = setup();
		server.rows.splice(
			0,
			1,
			...Array.from({ length: 30 }, (_, at) => ({
				id: `r${at}`,
				title: `r${String(at).padStart(2, '0')}`,
				done: false,
			})),
		);
		const page = await observed(store.read(todoPages, { offset: 24, limit: 2 }));
		stops.push(listen(store, changes).subscribe(() => {}));
		expect(page().map((todo) => todo.title)).toEqual(['r24', 'r25']);

		const added = { id: 'n', title: 'a new first', done: false };
		server.rows.push(added);
		connections[0]!.send({ event: { kind: 'put', todo: added } });
		await vi.waitFor(() => expect(page().map((todo) => todo.title)).toEqual(['r23', 'r24']));
	});

	it('reloads a read whose load in flight the server answered before a removal', async () => {
		const server = createServer();
		let hold: Promise<void> | null = null;
		const { store, connections } = setup(async (request, signal) => {
			const reply = await server.transport(request, signal);
			await hold;
			return reply;
		});
		const handle = store.read(todos, undefined);
		const list = await observed(handle);
		stops.push(listen(store, changes).subscribe(() => {}));

		let release!: () => void;
		hold = new Promise((resolve) => (release = resolve));
		void handle.refresh();
		await vi.waitFor(() => expect(server.log.filter((entry) => entry === 'list')).toHaveLength(2));
		// The server removes the record after answering that reload, and reports it.
		server.rows.splice(0, 1);
		connections[0]!.send({ event: { kind: 'remove', id: 'a' } });
		await vi.waitFor(() => expect(server.log.filter((entry) => entry === 'list')).toHaveLength(3));
		hold = null;
		release();
		await vi.waitFor(() => expect(list()).toEqual([]));
		await settle();
		expect(list()).toEqual([]);
	});

	it("replaces a read's value it holds, and keeps none it does not", async () => {
		const count = read({
			name: 'todos.count',
			input: schema<{ done: boolean }>((value) => typeof value?.done === 'boolean'),
			output: schema<number>((value) => typeof value === 'number'),
		});
		const counted = feed({
			name: 'todos.counted',
			event: schema<{ open: number; done: number }>(() => true),
			changes: (event) => [
				{ read: count, input: { done: false }, value: event.open },
				{ read: count, input: { done: true }, value: event.done },
			],
			covers: [],
		});
		const requests: string[] = [];
		const { store, connections } = setup(async (request) => {
			requests.push(request.name);
			return { ok: true, value: 1 };
		});
		const open = await observed(store.read(count, { done: false }));
		stops.push(listen(store, counted).subscribe(() => {}));

		connections[0]!.send({ event: { open: 4, done: 2 } });
		await vi.waitFor(() => expect(open()).toBe(4));
		expect(requests).toEqual(['todos.count']);
		// The store never held the other count, so the event left nothing for it.
		expect(store.read(count, { done: true }).getSnapshot().status).toBe('pending');
	});

	it('applies an event once when its ID arrives again', async () => {
		const { store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		stops.push(listen(store, changes).subscribe(() => {}));

		const renamed = (title: string) => ({ kind: 'put', todo: { id: 'a', title, done: false } });
		connections[0]!.send({ id: 'e1', event: renamed('Atoll') });
		connections[0]!.send({ id: 'e1', event: renamed('Duplicate') });
		connections[0]!.send({ id: 'e2', event: renamed('Lagoon') });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Lagoon'));
		connections[0]!.send({ id: 'e1', event: renamed('Duplicate') });
		await settle();
		expect(list()[0]!.title).toBe('Lagoon');
	});

	it('reloads what it covers after a gap, or an event it cannot read', async () => {
		const { server, store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		stops.push(listen(store, changes).subscribe(() => {}));
		const reloads = () => server.log.filter((entry) => entry === 'list').length;

		server.rows[0]!.title = 'Atoll';
		connections[0]!.send({ gap: true });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Atoll'));
		expect(reloads()).toBe(2);

		server.rows[0]!.title = 'Lagoon';
		connections[0]!.send({ event: { kind: 'put', todo: { id: 'a', title: '', done: false } } });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Lagoon'));
		expect(reloads()).toBe(3);
	});

	it("reloads tagged reads an event's change does not carry", async () => {
		const { server, store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		stops.push(listen(store, changes).subscribe(() => {}));

		server.rows.push({ id: 'b', title: 'Kelp', done: false });
		connections[0]!.send({ event: { kind: 'added' } });
		await vi.waitFor(() => expect(list().map((todo) => todo.id)).toEqual(['a', 'b']));
	});

	it('resumes from its cursor, and reloads after a connection that had none comes back', async () => {
		const { server, store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		const handle = listen(store, changes);
		stops.push(handle.subscribe(() => {}));
		expect(handle.getSnapshot().status).toBe('connecting');
		expect(connections[0]!.request.cursor).toBeNull();

		connections[0]!.send({ cursor: 'c1' });
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('live'));
		const reloads = server.log.length;
		// A clean end reconnects at once, from the cursor, and nothing reloads.
		connections[0]!.end();
		await vi.waitFor(() => expect(connections).toHaveLength(2));
		expect(connections[1]!.request.cursor).toBe('c1');
		connections[1]!.send({ event: { kind: 'remove', id: 'a' } });
		await vi.waitFor(() => expect(list()).toEqual([]));
		expect(server.log.length).toBe(reloads);

		// Without a cursor, a connection that comes back may have missed events.
		const live = setup();
		const shown = await observed(live.store.read(todos, undefined));
		stops.push(listen(live.store, changes).subscribe(() => {}));
		live.connections[0]!.send({ event: { kind: 'added' } });
		await vi.waitFor(() =>
			expect(live.server.log.filter((entry) => entry === 'list')).toHaveLength(2),
		);
		live.server.rows[0]!.title = 'Atoll';
		live.connections[0]!.end();
		await vi.waitFor(() => expect(live.connections).toHaveLength(2));
		live.connections[1]!.send({ id: 'hello' });
		await vi.waitFor(() => expect(shown()[0]!.title).toBe('Atoll'));
	});

	it('shares one connection, and closes it when the last observer leaves', async () => {
		const { store, connections } = setup();
		const handle = listen(store, changes);
		expect(listen(store, changes)).toBe(handle);
		const stopFirst = handle.subscribe(() => {});
		const stopSecond = handle.subscribe(() => {});
		expect(connections).toHaveLength(1);

		connections[0]!.send({ cursor: 'c1' });
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('live'));
		stopFirst();
		expect(connections[0]!.signal.aborted).toBe(false);
		stopSecond();
		expect(connections[0]!.signal.aborted).toBe(true);

		stops.push(handle.subscribe(() => {}));
		expect(connections).toHaveLength(2);
		expect(connections[1]!.request.cursor).toBe('c1');
	});

	it('keeps feeds with other parameters apart, each in its own order', async () => {
		const room = feed({
			name: 'room',
			params: schema<{ room: string }>((value) => typeof value?.room === 'string'),
			event: schema<{ title: string }>((value) => typeof value?.title === 'string'),
			changes: (event, params) => ({
				put: Todo,
				value: { id: params.room, title: event.title, done: false },
			}),
			covers: [],
		});
		const { store, connections } = setup();
		const list = await observed(store.read(todos, undefined));
		stops.push(listen(store, room, { room: 'a' }).subscribe(() => {}));
		stops.push(listen(store, room, { room: 'b' }).subscribe(() => {}));
		expect(connections.map((connection) => connection.request.params)).toEqual([
			{ room: 'a' },
			{ room: 'b' },
		]);

		connections[0]!.send({ event: { title: 'One' } });
		connections[1]!.send({ event: { title: 'Elsewhere' } });
		connections[0]!.send({ event: { title: 'Two' } });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Two'));
	});

	it('reports a failed connection, and closes its connection when the store retires', async () => {
		const { store, connections } = setup();
		const handle = listen(store, changes);
		stops.push(handle.subscribe(() => {}));
		const error = new Error('offline');
		connections[0]!.end(error);
		await vi.waitFor(() => expect(handle.getSnapshot()).toEqual({ status: 'offline', error }));

		const other = setup();
		stops.push(listen(other.store, changes).subscribe(() => {}));
		void other.store.retire();
		expect(other.connections[0]!.signal.aborted).toBe(true);
	});
});

/**
 * A WebSocket class whose sockets connect in memory to `server.accept`, as a
 * host's upgrade handler would, for a page on `origin`.
 */
function sockets(server: DataServer, origin: string, viewer: string) {
	const closed: number[] = [];
	class MemorySocket extends EventTarget {
		readonly peer: FeedSocket;
		constructor(url: string | URL) {
			super();
			const listeners = {
				message: [] as Array<(event: { data: unknown }) => void>,
				close: [] as Array<() => void>,
			};
			let open = true;
			const finish = (code: number) => {
				if (!open) return;
				open = false;
				closed.push(code);
				for (const listener of listeners.close) listener();
				const event = Object.assign(new Event('close'), { code, wasClean: code === 1000 });
				queueMicrotask(() => this.dispatchEvent(event));
			};
			this.peer = {
				send: (data) =>
					queueMicrotask(
						() => open && this.dispatchEvent(Object.assign(new Event('message'), { data })),
					),
				close: (code = 1000) => finish(code),
				addEventListener: (type: 'message' | 'close', listener: any) =>
					listeners[type].push(listener),
			};
			this.close = (code = 1000) => finish(code);
			this.send = (data: string) =>
				queueMicrotask(() => {
					for (const listener of listeners.message) listener({ data });
				});
			// The upgrade request, over HTTPS as the host receives it.
			const request = new Request(String(url).replace(/^wss:/, 'https:'), { headers: { origin } });
			server.accept(this.peer, request, { viewer });
			queueMicrotask(() => open && this.dispatchEvent(new Event('open')));
		}
		close: (code?: number) => void;
		send: (data: string) => void;
	}
	return { WebSocket: MemorySocket as unknown as typeof WebSocket, closed };
}

describe('feed presets', () => {
	function feedServer() {
		const heard: Array<{ viewer: string; signal: AbortSignal }> = [];
		let push: (todo: TodoItem) => void = () => {};
		const handler = createDataHandler(
			{ context: (_request, caller) => ({ viewer: String(caller?.viewer) }) },
			(handle) => [
				handle(todos, () => [{ id: 'a', title: 'Tides', done: false }]),
				handle(todoChanges, async function* (_, { viewer, signal }) {
					heard.push({ viewer, signal });
					while (!signal.aborted) {
						const todo = await new Promise<TodoItem | null>((resolve) => {
							push = resolve;
							signal.addEventListener('abort', () => resolve(null), { once: true });
						});
						if (todo) yield { event: todo };
					}
				}),
			],
		);
		return { handler, heard, push: (todo: TodoItem) => push(todo) };
	}

	it('streams a feed over a WebSocket, for the viewer the host authenticated, until the store stops', async () => {
		const { handler, heard, push } = feedServer();
		const { WebSocket, closed } = sockets(handler, 'https://app.test', 'ada');
		const store = createDataStore({
			transport: handler.transport(new Request('https://app.test/')),
			listen: webSocketListener('wss://app.test/feeds', { WebSocket }),
		});
		const list = await observed(store.read(todos, undefined));
		const handle = listen(store, todoChanges);
		const stop = handle.subscribe(() => {});
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('live'));
		await vi.waitFor(() => expect(heard).toHaveLength(1));
		expect(heard[0]!.viewer).toBe('ada');

		push({ id: 'a', title: 'Atoll', done: false });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Atoll'));

		stop();
		await vi.waitFor(() => expect(heard[0]!.signal.aborted).toBe(true));
		expect(closed).toEqual([1000]);
	});

	it('refuses a socket opened from another origin', async () => {
		const { handler, heard } = feedServer();
		const { WebSocket, closed } = sockets(handler, 'https://evil.test', 'ada');
		const store = createDataStore({
			transport: handler.transport(new Request('https://app.test/')),
			listen: webSocketListener('wss://app.test/feeds', { WebSocket }),
		});
		const handle = listen(store, todoChanges);
		stops.push(handle.subscribe(() => {}));
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('offline'));
		expect(closed[0]).toBe(1008);
		expect(heard).toEqual([]);
	});

	it("listens through the page's own broker, one subscription per topic, live once subscribed", async () => {
		const topics = new Map<string, Set<(message: unknown) => void>>();
		const broker = (topic: string, deliver: (message: unknown) => void) => {
			if (!topics.has(topic)) topics.set(topic, new Set());
			topics.get(topic)!.add(deliver);
			return () => topics.get(topic)!.delete(deliver);
		};
		const live = createDataStore({
			transport: async () => ({ ok: true, value: [{ id: 'a', title: 'Tides', done: false }] }),
			listen: pubSubListener(broker),
		});
		const list = await observed(live.read(todos, undefined));
		const handle = listen(live, todoChanges);
		const stop = handle.subscribe(() => {});
		await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('live'));
		expect(topics.get('todos.changes')!.size).toBe(1);

		for (const deliver of topics.get('todos.changes')!)
			deliver({ id: 'a', title: 'Atoll', done: false });
		await vi.waitFor(() => expect(list()[0]!.title).toBe('Atoll'));
		stop();
		await vi.waitFor(() => expect(topics.get('todos.changes')!.size).toBe(0));
	});
});
