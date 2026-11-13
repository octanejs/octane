/**
 * One owner of an account's data for several stores, such as one per tab.
 * Each tab keeps a replica: an ordinary store that renders, evaluates views and
 * shows its own edits in the task that made them. The owner makes every
 * request, holds every feed connection, and tells each replica what the
 * others did, so every tab shows the same confirmed values, the same pending
 * edits and the same rollbacks.
 *
 * Owner and replicas talk over message ports: a `MessageChannel` in one
 * realm, or a SharedWorker's ports across tabs. Messages are structured-cloned.
 *
 * Invariants:
 * - The owner sends each write once, for the replica that made it. Every other
 *   replica shows it from the moment it is sent, and settles it as that
 *   replica does: confirmed with the same reply, refused, or uncertain until
 *   one of them settles it.
 * - Equal reads in flight at once are one request, except that a replica
 *   asking again for a read it asked for before, to reload it, never joins a
 *   request that may predate the change it reloads for. The newest read
 *   started for a key replaces the value of each replica that holds it and is
 *   not loading it itself; an older one finishing later does not.
 * - One upstream connection serves every replica listening to a feed with
 *   the same parameters; it closes when the last one stops.
 */
import {
	parse,
	type FeedFrame,
	type FeedRequest,
	type Listener,
	type Transport,
	type Write,
	type DataReply,
	type DataRequest,
} from './contracts.js';
import {
	createDataStore,
	entryKey,
	internals,
	type DataStore,
	type DataStoreOptions,
	type Entry,
} from './store.js';

/** The part of a `MessagePort` the owner and its replicas use. */
export interface OwnerPort {
	postMessage(message: unknown): void;
	addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
	start?(): void;
}

/** What a replica sends its owner. */
type ToOwner =
	| {
			readonly t: 'request';
			readonly id: number;
			readonly request: DataRequest;
			/** A reload: it must not join a request already in flight. */
			readonly fresh: boolean;
	  }
	| { readonly t: 'listen'; readonly id: number; readonly request: FeedRequest }
	| { readonly t: 'unlisten'; readonly id: number }
	| {
			readonly t: 'settle';
			readonly op: string;
			readonly confirmed: boolean;
			readonly value: unknown;
	  };

/** What an owner sends a replica. */
type ToReplica =
	| { readonly t: 'reply'; readonly id: number; readonly reply: DataReply }
	| { readonly t: 'failed'; readonly id: number; readonly error: unknown }
	| { readonly t: 'frame'; readonly id: number; readonly frame: FeedFrame }
	| { readonly t: 'end'; readonly id: number; readonly error?: unknown }
	/** Another replica loaded a read. */
	| { readonly t: 'value'; readonly name: string; readonly input: unknown; readonly value: unknown }
	/** Another replica sent a write. */
	| { readonly t: 'write'; readonly op: string; readonly name: string; readonly raw: unknown }
	/** How a write another replica sent ended: its reply, or uncertain. */
	| { readonly t: 'outcome'; readonly op: string; readonly reply: DataReply | null }
	| {
			readonly t: 'settle';
			readonly op: string;
			readonly confirmed: boolean;
			readonly value: unknown;
	  };

export interface DataOwner {
	/** Serve a replica connected through `port`. */
	connect(port: OwnerPort): void;
}

interface Upstream {
	readonly members: Map<OwnerPort, number>;
	readonly abort: AbortController;
	cursor: string | null;
}

/**
 * The owner of an account's data: its transport, and its listener for feeds.
 * Replicas connect to it with `createReplica`.
 */
export function createDataOwner(options: {
	readonly transport: Transport;
	readonly listen?: Listener | undefined;
}): DataOwner {
	const { transport, listen } = options;
	const replicas = new Set<OwnerPort>();
	/** Reads in flight, by wire key, so equal reads share one request. */
	const reading = new Map<string, Promise<DataReply>>();
	const upstreams = new Map<string, Upstream>();
	/** The replicas that asked for each shared read; the rest are told its value. */
	const asked = new WeakMap<Promise<DataReply>, Set<OwnerPort>>();
	/** The newest read started for each wire key: only its value is told to the others. */
	const newest = new Map<string, Promise<DataReply>>();

	const others = (from: OwnerPort, message: ToReplica) => {
		for (const port of replicas) if (port !== from) port.postMessage(message);
	};

	function request(from: OwnerPort, id: number, payload: DataRequest, fresh: boolean): void {
		const answer = (reply: DataReply) =>
			from.postMessage({ t: 'reply', id, reply } satisfies ToReplica);
		const fail = (error: unknown) =>
			from.postMessage({ t: 'failed', id, error } satisfies ToReplica);
		if (payload.kind === 'write') {
			const op = payload.operationId!;
			others(from, { t: 'write', op, name: payload.name, raw: payload.input });
			transport(payload, new AbortController().signal).then(
				(reply) => {
					answer(reply);
					others(from, { t: 'outcome', op, reply });
				},
				(error) => {
					fail(error);
					others(from, { t: 'outcome', op, reply: null });
				},
			);
			return;
		}
		const key = `${payload.kind}\n${entryKey(payload.name, payload.input)}`;
		let shared = fresh ? undefined : reading.get(key);
		if (!shared) {
			const started = (shared = Promise.resolve().then(() =>
				transport(payload, new AbortController().signal),
			));
			reading.set(key, started);
			newest.set(key, started);
			const done = () => {
				if (reading.get(key) === started) reading.delete(key);
				if (newest.get(key) === started) newest.delete(key);
			};
			if (payload.kind === 'read') {
				started.then(
					(reply) => {
						// A newer read has replaced this one; its value is the one to share.
						if (!reply.ok || newest.get(key) !== started) return;
						// Every replica holding this read takes the value; the ones that asked already have it.
						const value: ToReplica = {
							t: 'value',
							name: payload.name,
							input: payload.input,
							value: reply.value,
						};
						for (const port of replicas)
							if (!asked.get(started)!.has(port)) port.postMessage(value);
					},
					() => {},
				);
			}
			started.then(done, done);
		}
		let askers = asked.get(shared);
		if (!askers) asked.set(shared, (askers = new Set()));
		askers.add(from);
		shared.then(answer, fail);
	}

	function subscribe(from: OwnerPort, id: number, payload: FeedRequest): void {
		if (!listen) {
			from.postMessage({
				t: 'end',
				id,
				error: new Error('octane/data: the owner has no `listen`'),
			} satisfies ToReplica);
			return;
		}
		const key = entryKey(payload.name, payload.params);
		let upstream = upstreams.get(key);
		if (upstream) {
			upstream.members.set(from, id);
			// A replica joining a live connection hears it is open, and where it stands.
			from.postMessage({
				t: 'frame',
				id,
				frame: upstream.cursor === null ? {} : { cursor: upstream.cursor },
			} satisfies ToReplica);
			return;
		}
		upstream = {
			members: new Map([[from, id]]),
			abort: new AbortController(),
			cursor: payload.cursor,
		};
		upstreams.set(key, upstream);
		const current = upstream;
		void (async () => {
			let error: unknown;
			try {
				for await (const frame of listen(payload, current.abort.signal)) {
					if (current.abort.signal.aborted) return;
					if (frame.cursor !== undefined) current.cursor = frame.cursor;
					for (const [port, member] of current.members)
						port.postMessage({ t: 'frame', id: member, frame } satisfies ToReplica);
				}
			} catch (cause) {
				error = cause;
			}
			if (current.abort.signal.aborted) return;
			upstreams.delete(key);
			// Each replica's feed connects again, and the first to do so opens a new upstream.
			for (const [port, member] of current.members)
				port.postMessage({ t: 'end', id: member, error } satisfies ToReplica);
		})();
	}

	function unsubscribe(from: OwnerPort, id: number): void {
		for (const [key, upstream] of upstreams) {
			if (upstream.members.get(from) !== id) continue;
			upstream.members.delete(from);
			if (upstream.members.size === 0) {
				upstreams.delete(key);
				upstream.abort.abort();
			}
		}
	}

	return {
		connect(port) {
			replicas.add(port);
			port.addEventListener('message', ({ data }) => {
				const message = data as ToOwner;
				if (message.t === 'request') request(port, message.id, message.request, message.fresh);
				else if (message.t === 'listen') subscribe(port, message.id, message.request);
				else if (message.t === 'unlisten') unsubscribe(port, message.id);
				else others(port, message);
			});
			port.start?.();
		},
	};
}

/**
 * A store for one tab, whose requests and feeds go through the owner on
 * `port`, and which shows what the owner's other replicas do. `writes` lists
 * the writes any replica may send, so this one can show them.
 */
export function createReplica(
	port: OwnerPort,
	options: Omit<DataStoreOptions, 'transport' | 'listen' | 'persist'> & {
		readonly writes: ReadonlyArray<Write<any, any>>;
	},
): DataStore {
	const { writes, ...rest } = options;
	let next = 0;
	const replies = new Map<
		number,
		{ resolve(reply: DataReply): void; reject(error: unknown): void }
	>();
	const feeds = new Map<number, { push(frame: FeedFrame): void; end(error?: unknown): void }>();
	const send = (message: ToOwner) => port.postMessage(message);
	/**
	 * The reads this replica asked for most recently, by wire key: asking again
	 * is a reload. Bounded, so a long session paging through views keeps only
	 * the recent ones; a forgotten key's reload may share an in-flight request.
	 */
	const askedFor = new Set<string>();

	const transport: Transport = (request) =>
		new Promise((resolve, reject) => {
			const id = ++next;
			replies.set(id, { resolve, reject });
			const key = `${request.kind}\n${entryKey(request.name, request.input)}`;
			const fresh = askedFor.delete(key);
			askedFor.add(key);
			if (askedFor.size > 512) askedFor.delete(askedFor.values().next().value!);
			send({ t: 'request', id, request, fresh });
		});

	const listen: Listener = (request, signal) => ({
		async *[Symbol.asyncIterator]() {
			const id = ++next;
			const queue: FeedFrame[] = [];
			let wake = () => {};
			let done = false;
			let failure: unknown;
			feeds.set(id, {
				push: (frame) => (queue.push(frame), wake()),
				end: (error) => ((done = true), (failure = error), wake()),
			});
			const stop = () => ((done = true), wake());
			signal.addEventListener('abort', stop, { once: true });
			send({ t: 'listen', id, request });
			try {
				while (true) {
					if (queue.length > 0) yield queue.shift()!;
					else if (done) {
						if (failure !== undefined) throw failure;
						return;
					} else await new Promise<void>((resolve) => (wake = resolve));
				}
			} finally {
				feeds.delete(id);
				signal.removeEventListener('abort', stop);
				send({ t: 'unlisten', id });
			}
		},
	});

	const store = createDataStore({ ...rest, transport, listen });
	const inner = internals.get(store)!;
	inner.onSettle((op, confirmed, value) => send({ t: 'settle', op, confirmed, value }));
	const byName = new Map(writes.map((write) => [write.name, write]));

	/** Show another replica's write, once its input validates here. */
	async function follow(op: string, name: string, raw: unknown) {
		const write = byName.get(name);
		if (!write || store.retired) return;
		const input = await parse(write.input, raw);
		if (store.retired) return;
		inner.follow(inner.operationFor(op, write, input, raw, 'pending'));
	}
	/** Followed writes in order, so an outcome never overtakes its write. */
	let following: Promise<unknown> = Promise.resolve();
	const inOrder = (step: () => unknown) => {
		following = following.then(step).catch(() => {});
	};

	/** Settle another replica's write the way it settled. */
	async function outcome(op: string, reply: DataReply | null) {
		const operation = inner.operation(op);
		if (!operation || store.retired) return;
		if (reply === null) {
			operation.status = 'uncertain';
		} else if (!reply.ok) {
			inner.remove(operation);
		} else {
			const { write } = operation;
			let output: unknown;
			try {
				output = write.output ? await parse(write.output, reply.value) : reply.value;
			} catch {
				output = undefined;
			}
			if (!store.retired) inner.confirm(operation, reply, output);
		}
	}

	/** Take a value another replica loaded, for a read held here and not loading. */
	async function value(name: string, input: unknown, raw: unknown) {
		const entry: Entry | undefined = inner.wireEntry(entryKey(name, input));
		if (!entry || entry.inflight || store.retired) return;
		let parsed: unknown;
		try {
			parsed = await parse(entry.read.output, raw);
		} catch {
			return;
		}
		if (store.retired || entry.inflight || inner.entries.get(entry.key) !== entry) return;
		const reload = new Set<Entry>();
		inner.rebase(entry, parsed, false, reload);
		inner.finish(reload, [entry], entry.names);
	}

	port.addEventListener('message', ({ data }) => {
		const message = data as ToReplica;
		switch (message.t) {
			case 'reply':
			case 'failed': {
				const pending = replies.get(message.id);
				replies.delete(message.id);
				if (message.t === 'reply') pending?.resolve(message.reply);
				else pending?.reject(message.error);
				break;
			}
			case 'frame':
				feeds.get(message.id)?.push(message.frame);
				break;
			case 'end':
				feeds.get(message.id)?.end(message.error);
				break;
			case 'value':
				void value(message.name, message.input, message.value);
				break;
			case 'write':
				inOrder(() => follow(message.op, message.name, message.raw));
				break;
			case 'outcome':
				inOrder(() => outcome(message.op, message.reply));
				break;
			case 'settle':
				inOrder(() => {
					const operation = inner.operation(message.op);
					if (operation?.status === 'uncertain' && !store.retired) {
						inner.settleOperation(operation, message.confirmed, message.value);
					}
				});
				break;
		}
	});
	port.start?.();
	return store;
}
