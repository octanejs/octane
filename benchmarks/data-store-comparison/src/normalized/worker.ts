/**
 * Design B's worker: one record per book, pending edits layered over them,
 * and every view evaluated locally from its declared rule. One change, one
 * own reply or one server transaction posts one message with every view it
 * moved.
 */
import * as devalue from 'devalue';
import { parentPort, type MessagePort } from 'node:worker_threads';
import { VIEWS, comparator, evaluate, type Book, type ViewDef } from '../library.ts';
import type {
	Coverage,
	FromWorker,
	NetMessage,
	NetRequest,
	Op,
	ToWorker,
	Without,
} from './protocol.ts';

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
let coverage: Coverage = 'all';

/** Rows loaded either side of what a view shows, so small moves need no fetch. */
const MARGIN = 20;

/**
 * The part of a view's full order this worker holds: every record between
 * `first` and `last` in the view's order, starting at absolute position
 * `start`. A null bound means the window reaches that end of the list.
 */
interface Window {
	start: number;
	first: Book | null;
	last: Book | null;
}
const windows = new Map<string, Window>();
const fetching = new Set<string>();

async function loadWindow(view: ViewDef): Promise<void> {
	fetching.add(view.name);
	const start = Math.max(0, view.offset - MARGIN);
	const count = view.offset - start + view.limit + MARGIN;
	const reply = await request({ kind: 'window', view: view.name, start, count });
	const { rows, atEnd } = reply.value as { rows: Book[]; atEnd: boolean };
	for (const book of rows) records.set(book.id, book);
	windows.set(view.name, {
		start,
		first: start === 0 ? null : rows[0]!,
		last: atEnd ? null : rows[rows.length - 1]!,
	});
	fetching.delete(view.name);
}

/**
 * A view's rows from the records inside its window. Returns null when an edit
 * moved rows out and the window no longer holds enough to fill the view.
 */
function evaluateWindow(view: ViewDef, books: Iterable<Book>): Book[] | null {
	const window = windows.get(view.name);
	if (!window) return [];
	const order = comparator(view);
	const region = [...books]
		.filter(
			(book) =>
				view.where(book) &&
				(!window.first || order(window.first, book) <= 0) &&
				(!window.last || order(book, window.last) <= 0),
		)
		.sort(order);
	const from = view.offset - window.start;
	if (window.last && region.length < from + view.limit) return null;
	return region.slice(from, from + view.limit).map((book) => ({ ...book }));
}
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
		const rows =
			coverage === 'all' ? evaluate(view, merged.values()) : evaluateWindow(view, merged.values());
		if (rows === null) {
			// Past the edge of what is held: fetch the window again, then show it.
			if (!fetching.has(view.name)) void loadWindow(view).then(publish);
			continue;
		}
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
		coverage = message.coverage;
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
			const saved = devalue.parse(message.persisted) as {
				revision: number;
				books: Book[];
				windows: [string, Window][];
			};
			revision = saved.revision;
			for (const book of saved.books) records.set(book.id, book);
			for (const [name, window] of saved.windows) windows.set(name, window);
		} else if (coverage === 'all') {
			// The covering read: every book the viewer can access.
			const reply = await request({ kind: 'all' });
			for (const book of reply.value as Book[]) records.set(book.id, book);
		} else {
			await Promise.all(VIEWS.map(loadWindow));
		}
		publish();
		return;
	}
	if (message.type === 'persist') {
		const value = devalue.stringify({
			revision,
			books: [...records.values()],
			windows: [...windows],
		});
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
