/**
 * One owner for several replicas, as one SharedWorker serves several tabs.
 * Every tab sees the same values, the same pending edits and the same
 * rollbacks, and the owner makes each request and holds each feed once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createDataOwner,
	createReplica,
	DataUncertainError,
	listen,
	type DataStore,
	type FeedFrame,
	type Listener,
	type ReadHandle,
	type Transport,
} from '../src/data/index.js';
import {
	addTodo,
	createServer,
	removeTodo,
	setDone,
	todoChanges,
	todoPages,
	todos,
	type TodoItem,
} from './_data-todos.js';

const closers: Array<() => void> = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
});

const writes = [addTodo, setDone, removeTodo];

/** An owner over `transport`, and `count` replicas connected to it by message channels. */
function tabs(transport: Transport, count: number, feedListener?: Listener): DataStore[] {
	const owner = createDataOwner({ transport, listen: feedListener });
	return Array.from({ length: count }, () => {
		const channel = new MessageChannel();
		owner.connect(channel.port1);
		const store = createReplica(channel.port2, { writes });
		closers.push(() => {
			void store.retire();
			channel.port1.close();
			channel.port2.close();
		});
		return store;
	});
}

async function observed<T>(handle: ReadHandle<T>): Promise<() => T> {
	closers.push(handle.subscribe(() => {}));
	await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
	return () => handle.getSnapshot().value!;
}

const done = (list: () => TodoItem[]) => list()[0]!.done;
const writeCount = (log: string[]) => log.filter((entry) => entry.startsWith('setDone')).length;

describe('octane/data owner and replicas', () => {
	it('makes one request for a read two tabs load at once, and shows one tab’s reload in the other', async () => {
		const server = createServer();
		// A little latency, so the second tab asks while the first tab's read is in flight.
		const [first, second] = tabs(async (request, signal) => {
			await new Promise((resolve) => setTimeout(resolve, 30));
			return server.transport(request, signal);
		}, 2);
		const [one, two] = await Promise.all([
			observed(first!.read(todos, undefined)),
			observed(second!.read(todos, undefined)),
		]);
		expect(server.log).toEqual(['list']);

		server.rows[0]!.title = 'Atoll';
		await first!.read(todos, undefined).refresh();
		expect(one()[0]!.title).toBe('Atoll');
		await vi.waitFor(() => expect(two()[0]!.title).toBe('Atoll'));
		expect(server.log).toEqual(['list', 'list']);
	});

	it.each([
		['read', todos],
		['view', todoPages],
	] as const)(
		'reloads a %s with a new request even while an older one is in flight, and keeps the newer value',
		async (_, read) => {
			const server = createServer();
			const held: Array<() => void> = [];
			let hold = false;
			const [first, second] = tabs(async (request, signal) => {
				// The server answers now, as of now; the reply reaches the tab when released.
				const reply = await server.transport(request, signal);
				if (hold) await new Promise<void>((resolve) => held.push(resolve));
				return reply;
			}, 2);
			const one = await observed(first!.read(read as typeof todos, undefined));
			const two = await observed(second!.read(read as typeof todos, undefined));

			hold = true;
			const older = first!.read(read as typeof todos, undefined).refresh();
			await vi.waitFor(() => expect(held).toHaveLength(1));
			server.rows[0]!.title = 'Atoll';
			// The second tab reloads after the change, so the first tab's request cannot answer it.
			const newer = second!.read(read as typeof todos, undefined).refresh();
			await vi.waitFor(() => expect(held).toHaveLength(2));
			held[1]!();
			await newer;
			expect(two()[0]!.title).toBe('Atoll');
			held[0]!();
			await older;
			await new Promise((resolve) => setTimeout(resolve, 20));
			// The older reply, finishing last, does not take the second tab back.
			expect(two()[0]!.title).toBe('Atoll');
			expect(one()[0]!.title).toBe('Tides');
		},
	);

	it('holds an edit to a record another tab is creating until the create is settled', async () => {
		const server = createServer();
		let release!: () => void;
		const [first, second] = tabs(async (request, signal) => {
			if (request.name === addTodo.name) {
				await new Promise<void>((resolve) => (release = resolve));
				return { ok: false, code: 'full' };
			}
			return server.transport(request, signal);
		}, 2);
		await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const added = first!.write(addTodo, { title: 'Reef' }).catch((error) => error);
		await vi.waitFor(() => expect(two()).toHaveLength(2));
		const edited = second!.write(setDone, { id: two()[1]!.id, done: true }).catch((error) => error);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(writeCount(server.log)).toBe(0);
		release();
		expect(((await added) as { code: string }).code).toBe('full');
		await edited;
		// The create was refused, so the edit to its record is never sent.
		expect(writeCount(server.log)).toBe(0);
		await vi.waitFor(() => expect(two()).toHaveLength(1));
	});

	it('shows a write from one tab in the other before its reply, and the same rollback when it is refused', async () => {
		const server = createServer();
		let release!: () => void;
		let refuse = true;
		const [first, second] = tabs(async (request, signal) => {
			if (request.kind === 'write') {
				await new Promise<void>((resolve) => (release = resolve));
				if (refuse) return { ok: false, code: 'missing' };
			}
			return server.transport(request, signal);
		}, 2);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const refused = first!.write(setDone, { id: 'a', done: true }).catch((error) => error);
		expect(done(one)).toBe(true);
		await vi.waitFor(() => expect(done(two)).toBe(true));
		release();
		expect(((await refused) as { code: string }).code).toBe('missing');
		expect(done(one)).toBe(false);
		await vi.waitFor(() => expect(done(two)).toBe(false));

		refuse = false;
		const saved = first!.write(setDone, { id: 'a', done: true });
		await vi.waitFor(() => expect(done(two)).toBe(true));
		release();
		await saved;
		await vi.waitFor(() => expect(server.rows[0]!.done).toBe(true));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(done(two)).toBe(true);
		// The tab that showed it never sent it.
		expect(writeCount(server.log)).toBe(1);
	});

	it('settles an uncertain write in every tab once one tab learns its outcome', async () => {
		const server = createServer();
		const [first, second] = tabs(async (request, signal) => {
			if (request.kind === 'write') throw new Error('connection reset');
			return server.transport(request, signal);
		}, 2);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));

		const error = (await first!
			.write(setDone, { id: 'a', done: true })
			.catch((reason: unknown) => reason)) as DataUncertainError;
		expect(error).toBeInstanceOf(DataUncertainError);
		await vi.waitFor(() => expect(done(two)).toBe(true));

		// A receipt says it never arrived.
		first!.settle(error.operationId, false);
		expect(done(one)).toBe(false);
		await vi.waitFor(() => expect(done(two)).toBe(false));
	});

	it('holds one feed connection for every tab, and closes it when the last tab stops listening', async () => {
		const server = createServer();
		const connections: Array<{ signal: AbortSignal; send(frame: FeedFrame): void }> = [];
		const feedListener: Listener = (_request, signal) => ({
			async *[Symbol.asyncIterator]() {
				const queue: FeedFrame[] = [{}];
				let wake = () => {};
				connections.push({ signal, send: (frame) => (queue.push(frame), wake()) });
				signal.addEventListener('abort', () => wake(), { once: true });
				while (!signal.aborted) {
					if (queue.length > 0) yield queue.shift()!;
					else await new Promise<void>((resolve) => (wake = resolve));
				}
			},
		});
		const [first, second] = tabs(server.transport, 2, feedListener);
		const one = await observed(first!.read(todos, undefined));
		const two = await observed(second!.read(todos, undefined));
		const stopFirst = listen(first!, todoChanges).subscribe(() => {});
		const stopSecond = listen(second!, todoChanges).subscribe(() => {});
		await vi.waitFor(() => expect(listen(second!, todoChanges).getSnapshot().status).toBe('live'));
		expect(connections).toHaveLength(1);

		connections[0]!.send({ event: { id: 'a', title: 'Atoll', done: false } });
		await vi.waitFor(() => expect(one()[0]!.title).toBe('Atoll'));
		await vi.waitFor(() => expect(two()[0]!.title).toBe('Atoll'));

		stopFirst();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(connections[0]!.signal.aborted).toBe(false);
		stopSecond();
		await vi.waitFor(() => expect(connections[0]!.signal.aborted).toBe(true));
	});
});
