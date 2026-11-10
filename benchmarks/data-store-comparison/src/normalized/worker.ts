/**
 * Design B's worker: one record per book, pending edits layered over them,
 * and every view evaluated locally from its declared rule. One change, one
 * own reply or one server transaction posts one message with every view it
 * moved.
 */
import * as devalue from 'devalue';
import { parentPort, type MessagePort } from 'node:worker_threads';
import { VIEWS, evaluate, type Book } from '../library.ts';
import type { FromWorker, NetMessage, NetRequest, Op, ToWorker, Without } from './protocol.ts';

interface Pending {
	id: string;
	op: Op;
	draft?: Book;
}

const records = new Map<string, Book>();
const pending: Pending[] = [];
const shown = new Map<string, string>();
/** Created records' local IDs, mapped to the IDs the server assigned. */
const assigned = new Map<string, string>();
/** Writes to one record run in order; a create holds its record until the server names it. */
const queues = new Map<string, Promise<unknown>>();
let revision = 0;
let net: MessagePort;
let netSeq = 0;
let localSeq = 0;
const waiting = new Map<number, (message: NetMessage & { type: 'reply' }) => void>();

const post = (message: FromWorker) => parentPort!.postMessage(message);

function request(body: Without<NetRequest, 'seq'>): Promise<NetMessage & { type: 'reply' }> {
	const seq = ++netSeq;
	return new Promise((resolve) => {
		waiting.set(seq, resolve);
		net.postMessage({ ...body, seq });
	});
}

/** Evaluate every view over confirmed records with pending edits applied, and post what moved. */
function publish(): void {
	const merged = new Map(records);
	for (const item of pending) {
		if (item.draft) merged.set(item.id, item.draft);
		else if (item.op.kind === 'update') {
			const book = merged.get(item.id);
			if (book) merged.set(item.id, { ...book, ...item.op.patch });
		}
	}
	const views: Record<string, Book[]> = {};
	let moved = false;
	for (const view of VIEWS) {
		const rows = evaluate(view, merged.values());
		const key = JSON.stringify(rows);
		if (shown.get(view.name) === key) continue;
		shown.set(view.name, key);
		views[view.name] = rows;
		moved = true;
	}
	if (moved) post({ type: 'views', views });
}

function drop(item: Pending): void {
	pending.splice(pending.indexOf(item), 1);
}

async function write(op: Op): Promise<void> {
	if (op.kind === 'add') {
		const local = `local-${++localSeq}`;
		const item: Pending = {
			id: local,
			op,
			draft: { id: local, title: op.title, starred: false, shelf: 'A', rank: 0 },
		};
		pending.push(item);
		publish();
		const reply = request({ kind: 'add', title: op.title });
		queues.set(local, reply);
		const { ok, value } = await reply;
		drop(item);
		if (!ok) {
			for (const other of [...pending]) if (other.id === local) drop(other);
			publish();
			throw new Error('refused');
		}
		const book = value as Book;
		records.set(book.id, book);
		assigned.set(local, book.id);
		for (const other of pending) if (other.id === local) other.id = book.id;
		publish();
		return;
	}
	const id = assigned.get(op.id) ?? op.id;
	const item: Pending = { id, op };
	pending.push(item);
	publish();
	const previous = queues.get(op.id) ?? queues.get(id);
	const sent = (previous ?? Promise.resolve()).then(
		// A write whose create was refused was dropped with it, and is never sent.
		() =>
			pending.includes(item)
				? request({ kind: 'update', id: item.id, patch: op.patch })
				: { type: 'reply' as const, seq: 0, ok: false, value: undefined },
		() => ({ type: 'reply' as const, seq: 0, ok: false, value: undefined }),
	);
	queues.set(id, sent);
	const { ok, value } = await sent;
	drop(item);
	if (ok) records.set((value as Book).id, value as Book);
	publish();
	if (!ok) throw new Error('refused');
}

parentPort!.on('message', async (message: ToWorker) => {
	if (message.type === 'start') {
		net = message.net;
		net.on('message', (incoming: NetMessage) => {
			if (incoming.type === 'reply') {
				waiting.get(incoming.seq)?.(incoming);
				waiting.delete(incoming.seq);
				return;
			}
			// One server transaction: apply every change, then publish once.
			if (incoming.event.revision <= revision) return;
			revision = incoming.event.revision;
			for (const change of incoming.event.changes) {
				if (change.kind === 'put') records.set(change.book.id, change.book);
				else records.delete(change.id);
			}
			publish();
		});
		if (message.persisted) {
			const saved = devalue.parse(message.persisted) as { revision: number; books: Book[] };
			revision = saved.revision;
			for (const book of saved.books) records.set(book.id, book);
		} else {
			// The covering read: every book the viewer can access.
			const reply = await request({ kind: 'all' });
			for (const book of reply.value as Book[]) records.set(book.id, book);
		}
		publish();
		return;
	}
	if (message.type === 'persist') {
		const value = devalue.stringify({ revision, books: [...records.values()] });
		post({ type: 'done', seq: message.seq, value });
		return;
	}
	try {
		await write(message.op);
		post({ type: 'done', seq: message.seq });
	} catch (error) {
		post({ type: 'done', seq: message.seq, error: (error as Error).message });
	}
});
