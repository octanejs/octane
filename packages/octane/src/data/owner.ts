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
 * - With `fence`, the origin has one account at a time. Its record, the
 *   account and a generation that increases with every sign-in and sign-out,
 *   is durable before any replica hears of it. An owner serves only while its
 *   account is the recorded one; once another is signed in, or this one is
 *   signed out, each of its replicas is retired and nothing it had in flight
 *   reaches one.
 */
import {
	parse,
	type Feed,
	type FeedFrame,
	type FeedRequest,
	type Listener,
	type Read,
	type Transport,
	type Write,
	type DataReply,
	type DataRequest,
} from './contracts.js';
import { clearHostTimeout, hostDateNow, setHostTimeout } from '../host-task.js';
import {
	createDataStore,
	DataRetiredError,
	entryKey,
	internals,
	type DataStore,
	type DataStoreOptions,
	type Entry,
} from './store.js';
import { done, request as settled, shape } from './persist.js';
import { DATA_WORKER_PATH } from './worker-path.js';

/** The part of a `MessagePort` the owner and its replicas use. */
export interface OwnerPort {
	postMessage(message: unknown): void;
	addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
	start?(): void;
}

/** What a replica sends its owner. */
type ToOwner =
	/**
	 * A tab's first message: the account it signs in as, where the owner
	 * fences by account, and its build's contracts, which must match the first
	 * build the owner served.
	 */
	| { readonly t: 'hello'; readonly account: string | undefined; readonly identity: string }
	/** Sign the account out, in every tab. */
	| { readonly t: 'retire' }
	/** Is the account still signed in? Asked by a tab resuming from being frozen. */
	| { readonly t: 'ping' }
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
	/** The account is signed in; this replica may show what it holds. */
	| { readonly t: 'live' }
	/** The account was signed out, or another signed in: show nothing more. */
	| { readonly t: 'retired' }
	/** This tab cannot share the owner: its build's contracts differ, or the account cannot be recorded. */
	| { readonly t: 'refused' }
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
	/** Serve only while this owner's account is the origin's, recorded in IndexedDB. */
	readonly fence?: boolean | undefined;
}): DataOwner {
	const { transport, listen, fence } = options;
	/** The replicas of the signed-in account. A replica of a retired one is never served again. */
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
	/** Answer a replica, unless its account was retired since it asked. */
	const post = (port: OwnerPort, message: ToReplica) => {
		if (replicas.has(port)) port.postMessage(message);
	};

	/** The contracts of the first build served; a tab of another build is refused. */
	let identity: string | undefined;
	const refused = new WeakSet<OwnerPort>();
	const refuse = (port: OwnerPort) => (refused.add(port), port.postMessage(REFUSED));
	/** When each replica was last heard from; one silent too long has gone, and is dropped. */
	const heard = new Map<OwnerPort, number>();
	let sweeping: unknown;
	function watch(port: OwnerPort): void {
		heard.set(port, hostDateNow());
		sweeping ??= setHostTimeout(sweep, HEARTBEAT_MS);
	}
	function sweep(): void {
		sweeping = undefined;
		for (const [port, at] of heard) {
			if (replicas.has(port) && hostDateNow() - at <= HEARTBEAT_MS * 3) continue;
			heard.delete(port);
			replicas.delete(port);
			// Its writes keep going; only what it listened to stops.
			for (const upstream of upstreams.values()) {
				const id = upstream.members.get(port);
				if (id !== undefined) unsubscribe(port, id);
			}
		}
		if (heard.size > 0) sweeping = setHostTimeout(sweep, HEARTBEAT_MS);
	}

	/** The account being served, once its generation is recorded; `null` once retired. */
	let serving: { readonly account: string | null; readonly ready: Promise<number> } | null = fence
		? null
		: { account: null, ready: Promise.resolve(0) };
	/** The generation this owner serves, and the newest any owner has announced. */
	let generation = 0;
	let announced = 0;
	const channel = fence ? new BroadcastChannel(ACCOUNT_CHANNEL) : null;
	if (channel) {
		channel.onmessage = ({ data }) => {
			announced = Math.max(announced, data as number);
			if (generation > 0 && announced > generation) retireAll();
		};
	}

	/** Every replica of the account hears it is retired, and nothing in flight reaches one. */
	function retireAll(): void {
		serving = null;
		generation = 0;
		for (const upstream of upstreams.values()) upstream.abort.abort();
		upstreams.clear();
		reading.clear();
		newest.clear();
		for (const port of replicas) port.postMessage(RETIRED);
		replicas.clear();
	}

	/** Serve `port` as a replica of `account`, signing it in if another account is recorded. */
	function join(port: OwnerPort, account: string): Promise<void> {
		if (serving?.account !== account) {
			if (serving) retireAll();
			serving = { account, ready: decide(account) };
		}
		const current = serving;
		return current.ready.then(
			(recorded) => {
				if (serving === current) {
					generation = recorded;
					// Another account was signed in while this one was being recorded.
					if (announced > recorded) retireAll();
				}
				if (serving !== current) return port.postMessage(RETIRED);
				replicas.add(port);
				watch(port);
				port.postMessage({ t: 'live' } satisfies ToReplica);
			},
			() => {
				// The account could not be recorded: this tab keeps its own store, and the next tab
				// to connect tries again.
				if (serving === current) serving = null;
				refuse(port);
			},
		);
	}

	/** Sign the account out: recorded first, then announced, then every replica retired. */
	function signOut(): void {
		const current = serving;
		if (!current) return;
		void (fence ? decide(null, generation) : Promise.resolve(0)).then(() => {
			if (serving === current) retireAll();
		});
	}

	/**
	 * Record `account` as the origin's in one transaction, so two owners
	 * signing in at once take consecutive generations. Signing in the recorded
	 * account keeps its generation. Signing out (`null`) records only if
	 * `signedIn` is still the recorded generation, so a late sign-out never
	 * undoes a newer sign-in.
	 */
	async function decide(account: string | null, signedIn?: number): Promise<number> {
		const opening = indexedDB.open(ACCOUNT_DATABASE, 1);
		opening.onupgradeneeded = () => opening.result.createObjectStore('account');
		const database = await settled(opening);
		try {
			const transaction = database.transaction('account', 'readwrite');
			const store = transaction.objectStore('account');
			const recorded = (await settled(store.get(0))) as
				{ account: string | null; generation: number } | undefined;
			let next = recorded?.generation ?? 0;
			const changed =
				account === null ? recorded?.generation === signedIn : recorded?.account !== account;
			if (changed) store.put({ account, generation: ++next }, 0);
			await done(transaction);
			if (changed) channel!.postMessage(next);
			return next;
		} finally {
			database.close();
		}
	}

	function request(from: OwnerPort, id: number, payload: DataRequest, fresh: boolean): void {
		const answer = (reply: DataReply) => post(from, { t: 'reply', id, reply });
		const fail = (error: unknown) => post(from, { t: 'failed', id, error });
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
						for (const port of replicas) if (!asked.get(started)!.has(port)) post(port, value);
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
						post(port, { t: 'frame', id: member, frame });
				}
			} catch (cause) {
				error = cause;
			}
			if (current.abort.signal.aborted) return;
			upstreams.delete(key);
			// Each replica's feed connects again, and the first to do so opens a new upstream.
			for (const [port, member] of current.members) post(port, { t: 'end', id: member, error });
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
			/** A replica is served once its build matches and its account is recorded, in the order it asked. */
			let joined: Promise<void> | null = null;
			const handle = (message: ToOwner) => {
				if (refused.has(port)) return port.postMessage(REFUSED);
				// A replica of a retired account is told so, whatever it asks.
				if (!replicas.has(port)) return port.postMessage(RETIRED);
				heard.set(port, hostDateNow());
				if (message.t === 'request') request(port, message.id, message.request, message.fresh);
				else if (message.t === 'listen') subscribe(port, message.id, message.request);
				else if (message.t === 'unlisten') unsubscribe(port, message.id);
				else if (message.t === 'retire') signOut();
				else if (message.t === 'ping') port.postMessage({ t: 'live' } satisfies ToReplica);
				else if (message.t !== 'hello') others(port, message);
			};
			port.addEventListener('message', ({ data }) => {
				const message = data as ToOwner;
				if (message.t === 'hello') {
					// The first build served decides which builds share this owner.
					identity ??= message.identity;
					if (message.identity !== identity) joined = Promise.resolve(refuse(port));
					else if (fence) joined = join(port, message.account!);
					else if (serving) (replicas.add(port), watch(port));
				} else if (joined) joined = joined.then(() => handle(message));
				else handle(message);
			});
			port.start?.();
		},
	};
}

/** Any contract a replica's app uses: reads and views, writes, and feeds. */
type Contract = Read<any, any> | Write<any, any> | Feed<any, any>;

/**
 * Whether two builds can share an owner: the name, kind, `version` and output
 * schema shape of each contract they use, as the persistent cache compares a
 * saved value with its read.
 */
function contractIdentity(contracts: ReadonlyArray<Contract>): string {
	return contracts
		.map((contract) =>
			contract.kind === 'read'
				? `read ${contract.name} ${contract.version} ${shape(contract)}`
				: `${contract.kind} ${contract.name}`,
		)
		.sort()
		.join('\n');
}

/**
 * A store for one tab that shares the owner on `owner`, and shows what the
 * owner's other tabs do. It takes the options of a local store: where `owner`
 * is `null`, the owner refuses this build (another deploy's contracts), or it
 * is lost and cannot be reopened, the tab carries on as a local store with
 * them. `contracts` lists every read, write and feed the app uses, so the
 * owner can tell compatible builds apart and this tab can show the others'
 * writes.
 */
export function createReplica(
	owner: OwnerPort | null,
	options: DataStoreOptions & { readonly contracts: ReadonlyArray<Contract> },
): DataStore {
	const { contracts, ...local } = options;
	/** The owner's port, or `null` once this tab is a local store. */
	let port: OwnerPort | null = null;
	let next = 0;
	/** Requests the owner has not answered, so a new owner can be asked again. */
	const replies = new Map<
		number,
		{
			readonly request: DataRequest;
			readonly fresh: boolean;
			resolve(reply: DataReply): void;
			reject(error: unknown): void;
		}
	>();
	const feeds = new Map<number, { push(frame: FeedFrame): void; end(error?: unknown): void }>();
	/** Other tabs' writes this tab shows and has not seen settle. */
	const followed = new Set<string>();
	const send = (message: ToOwner) => port?.postMessage(message);
	/**
	 * The reads this replica asked for most recently, by wire key: asking again
	 * is a reload. Bounded, so a long session paging through views keeps only
	 * the recent ones; a forgotten key's reload may share an in-flight request.
	 */
	const askedFor = new Set<string>();

	const transport: Transport = (request, signal) => {
		if (!port) return local.transport(request, signal);
		return new Promise((resolve, reject) => {
			const id = ++next;
			let fresh = false;
			if (request.kind !== 'write') {
				const key = `${request.kind}\n${entryKey(request.name, request.input)}`;
				fresh = askedFor.delete(key);
				askedFor.add(key);
				if (askedFor.size > 512) askedFor.delete(askedFor.values().next().value!);
			}
			replies.set(id, { request, fresh, resolve, reject });
			send({ t: 'request', id, request, fresh });
		});
	};

	const viaOwner: Listener = (request, signal) => ({
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
	const listen = local.listen;
	const store = createDataStore({
		...local,
		transport,
		listen: listen && ((request, signal) => (port ? viaOwner : listen)(request, signal)),
	});
	const inner = internals.get(store)!;
	inner.onSettle((op, confirmed, value) => send({ t: 'settle', op, confirmed, value }));

	// Retiring signs the account out in every tab. Until the owner confirms it, ask again:
	// a sign-out must not be lost to a busy or restarting owner.
	const retireHere = store.retire;
	let asking: unknown;
	const signOut = () => {
		send({ t: 'retire' });
		asking = setHostTimeout(signOut, SIGN_OUT_RETRY_MS);
	};
	store.retire = () => {
		if (port && !store.retired) signOut();
		return retireHere();
	};

	/**
	 * Stop waiting on the owner's port: a write already sent to it may have
	 * been made, so it is uncertain, never sent again; every other request is
	 * asked again, of `ask`. Each feed connects again, through whatever serves
	 * this tab now.
	 */
	function abandon(
		ask: (request: DataRequest, fresh: boolean) => Promise<DataReply>,
		refused: boolean,
	) {
		const pending = [...replies.values()];
		replies.clear();
		for (const item of pending) {
			if (item.request.kind === 'write' && !refused) item.reject(new Error(LOST));
			else ask(item.request, item.fresh).then(item.resolve, item.reject);
		}
		for (const feed of feeds.values()) feed.end(new Error(LOST));
		// Another tab's write in flight may still settle; its tab settles it once it knows.
		for (const op of followed) {
			const operation = inner.operation(op);
			if (operation?.status === 'pending') operation.status = 'uncertain';
		}
	}

	/** Carry on as a local store: the owner refused this build, or is gone for good. */
	function becomeLocal(refused: boolean) {
		port = null;
		clearHostTimeout(beat);
		inner.fence(false);
		abandon((request) => local.transport(request, new AbortController().signal), refused);
	}

	/** The account was signed out, or another signed in: nothing more is shown. */
	function retired() {
		clearHostTimeout(asking);
		clearHostTimeout(beat);
		port = null;
		void retireHere();
		for (const pending of replies.values()) pending.reject(new DataRetiredError());
		replies.clear();
		for (const feed of feeds.values()) feed.end();
	}

	/**
	 * The owner stopped answering: its worker may have crashed. Show nothing
	 * until a new owner confirms the account, and ask it what the old one did
	 * not answer.
	 */
	function lost() {
		const reopened = port && opened.get(port)?.reopen();
		if (!reopened) return becomeLocal(false);
		inner.fence(true);
		connect(reopened);
		abandon(
			(request, fresh) =>
				new Promise((resolve, reject) => {
					const id = ++next;
					replies.set(id, { request, fresh, resolve, reject });
					send({ t: 'request', id, request, fresh });
				}),
			false,
		);
	}

	// Each side checks the other is still there. A tab that hears nothing for a while has lost
	// its owner; an owner that hears nothing from a tab drops it.
	let heard = hostDateNow();
	let beat: unknown;
	const heartbeat = () => {
		if (!port || store.retired) return;
		if (hostDateNow() - heard > HEARTBEAT_MS * 3) lost();
		if (!port) return;
		send({ t: 'ping' });
		beat = setHostTimeout(heartbeat, HEARTBEAT_MS);
	};

	// A tab frozen in the background may have missed a sign-out: it shows nothing it held
	// until the owner says the account is still signed in.
	if (typeof document !== 'undefined') {
		const listening = { signal: inner.retired };
		document.addEventListener('freeze', () => port && inner.fence(true), listening);
		document.addEventListener(
			'resume',
			() => {
				// Time frozen is not time the owner was silent.
				heard = hostDateNow();
				send({ t: 'ping' });
			},
			listening,
		);
	}
	const byName = new Map<string, Write<any, any>>();
	for (const contract of contracts)
		if (contract.kind === 'write') byName.set(contract.name, contract);
	const identity = contractIdentity(contracts);

	/** Show another replica's write, once its input validates here. */
	async function follow(op: string, name: string, raw: unknown) {
		const write = byName.get(name);
		if (!write || store.retired) return;
		const input = await parse(write.input, raw);
		if (store.retired) return;
		followed.add(op);
		inner.follow(inner.operationFor(op, write, input, raw, 'pending'));
	}
	/** Followed writes in order, so an outcome never overtakes its write. */
	let following: Promise<unknown> = Promise.resolve();
	const inOrder = (step: () => unknown) => {
		following = following.then(step).catch(() => {});
	};

	/** Settle another replica's write the way it settled. */
	async function outcome(op: string, reply: DataReply | null) {
		followed.delete(op);
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

	/** Use `next` as this tab's owner: introduce the tab, and hear only that owner from now on. */
	function connect(next: OwnerPort) {
		port = next;
		heard = hostDateNow();
		next.addEventListener('message', ({ data }) => {
			if (port !== next) return;
			heard = hostDateNow();
			const message = data as ToReplica;
			switch (message.t) {
				case 'live':
					inner.fence(false);
					break;
				case 'retired':
					retired();
					break;
				case 'refused':
					becomeLocal(true);
					break;
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
						followed.delete(message.op);
						const operation = inner.operation(message.op);
						if (operation?.status === 'uncertain' && !store.retired) {
							inner.settleOperation(operation, message.confirmed, message.value);
						}
					});
					break;
			}
		});
		next.start?.();
		next.postMessage({
			t: 'hello',
			account: opened.get(next)?.account,
			identity,
		} satisfies ToOwner);
	}

	if (owner) {
		connect(owner);
		beat = setHostTimeout(heartbeat, HEARTBEAT_MS);
	}
	return store;
}

/**
 * The owner protocol's version, in the worker's name, so a tab on another
 * protocol never shares it. 3: `hello` carries the build's contract identity,
 * and each side checks the other is still there.
 */
const PROTOCOL = 3;
const RETIRED: ToReplica = { t: 'retired' };
const REFUSED: ToReplica = { t: 'refused' };
/** How often a tab and its owner check on each other; three silent intervals means gone. */
const HEARTBEAT_MS = 5_000;
const LOST = 'octane/data: the connection to the shared owner was lost';
/** What `sharedOwner` knows of each port it opened: the account, and how to open another. */
const opened = new WeakMap<OwnerPort, { account: string; reopen(): OwnerPort | null }>();
/** How long a tab waits for its owner to confirm a sign-out before asking again. */
const SIGN_OUT_RETRY_MS = 5_000;
/** Where fencing owners record the origin's account, and announce a new one. */
const ACCOUNT_DATABASE = 'octane-data-account';
const ACCOUNT_CHANNEL = 'octane-data:account';

/**
 * Connect to the owner every tab sharing `name` uses, such as the account's
 * partition, through the data worker the build plugins emit. Pass the port to
 * `createReplica`. Returns `null` where SharedWorker is missing or cannot
 * start, and `createReplica` then makes the tab a local store.
 */
export function sharedOwner(name: string, url: string | URL = DATA_WORKER_PATH): OwnerPort | null {
	if (typeof SharedWorker !== 'function') return null;
	try {
		const { port } = new SharedWorker(url, {
			type: 'module',
			name: `octane-data:${PROTOCOL}:${name}`,
		});
		opened.set(port, { account: name, reopen: () => sharedOwner(name, url) });
		return port;
	} catch {
		return null;
	}
}

/** Serve an owner to every tab that connects: what the app's data worker module calls. */
export function serveDataOwner(options: Parameters<typeof createDataOwner>[0]): DataOwner {
	const owner = createDataOwner({ ...options, fence: true });
	globalThis.addEventListener('connect', (event) =>
		owner.connect((event as MessageEvent).ports[0]!),
	);
	return owner;
}
