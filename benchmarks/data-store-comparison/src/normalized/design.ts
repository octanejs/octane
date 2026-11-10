/**
 * Design B's UI side: it only shows the rows the worker posts. Every message
 * across the boundary is structured-cloned, and the bytes are counted.
 */
import { serialize } from 'node:v8';
import { MessageChannel, Worker, type MessagePort } from 'node:worker_threads';
import type { Design } from '../design.ts';
import { VIEWS, evaluate, hop, type Book, type LibraryServer } from '../library.ts';
import type { Coverage, FromWorker, NetRequest, ToWorker, Without } from './protocol.ts';

export function normalizedDesign(server: LibraryServer, coverage: Coverage = 'all'): Design {
	const worker = new Worker(new URL('./worker.js', import.meta.url));
	const views = new Map<string, readonly Book[]>();
	const listeners = new Set<() => void>();
	const done = new Map<number, (message: FromWorker & { type: 'done' }) => void>();
	let bytes = 0;
	let seq = 0;
	let ready: (() => void) | undefined;
	const stops: Array<() => void> = [];

	worker.on('message', (message: FromWorker) => {
		bytes += serialize(message).length;
		if (message.type === 'done') {
			done.get(message.seq)?.(message);
			done.delete(message.seq);
			return;
		}
		for (const [name, rows] of Object.entries(message.views)) views.set(name, rows);
		ready?.();
		listeners.forEach((listener) => listener());
	});

	/** Rows `start` to `start + count` of a view's full order, and whether that reaches its end. */
	function window(name: string, start: number, count: number) {
		const view = VIEWS.find((item) => item.name === name)!;
		const rows = evaluate({ ...view, offset: start, limit: count }, server.books.values());
		return { rows, atEnd: rows.length < count };
	}

	function send(message: ToWorker, transfer: MessagePort[] = []): void {
		if (message.type !== 'start') bytes += serialize(message).length;
		worker.postMessage(message, transfer);
	}

	function call(message: Without<ToWorker & { seq: number }, 'seq'>): Promise<string | undefined> {
		const id = ++seq;
		return new Promise((resolve, reject) => {
			done.set(id, (reply) =>
				reply.error ? reject(new Error(reply.error)) : resolve(reply.value),
			);
			send({ ...message, seq: id } as ToWorker);
		});
	}

	return {
		name:
			coverage === 'all'
				? 'B: normalized, worker, every book'
				: 'C: normalized, worker, view windows',
		async start(persisted) {
			const { port1: ours, port2: theirs } = new MessageChannel();
			ours.on('message', async (request: NetRequest) => {
				await hop();
				try {
					const value =
						request.kind === 'all'
							? [...server.books.values()]
							: request.kind === 'window'
								? window(request.view, request.start, request.count)
								: request.kind === 'add'
									? server.add(request.title)
									: server.update(request.id, request.patch);
					ours.postMessage({
						type: 'reply',
						seq: request.seq,
						ok: true,
						value: server.respond(value),
					});
				} catch {
					ours.postMessage({ type: 'reply', seq: request.seq, ok: false });
				}
			});
			stops.push(
				server.subscribe(
					(event) => void hop().then(() => ours.postMessage({ type: 'event', event })),
				),
				() => ours.close(),
			);
			const shown = new Promise<void>((resolve) => (ready = resolve));
			send({ type: 'start', persisted, net: theirs, coverage }, [theirs]);
			await shown;
			ready = undefined;
		},
		views: () => new Map(views),
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		add: (title) => call({ type: 'write', op: { kind: 'add', title } }),
		update: (id, patch) => call({ type: 'write', op: { kind: 'update', id, patch } }),
		persist: async () => (await call({ type: 'persist' })) ?? '',
		workerBytes: () => bytes,
		close() {
			stops.splice(0).forEach((stop) => stop());
			void worker.terminate();
		},
	};
}
