/**
 * One owner of an account's data for several stores, such as one per tab.
 * Each tab keeps a replica: an ordinary store that renders, evaluates views and
 * shows its own edits in the task that made them. The owner makes every
 * request, holds every feed connection, and tells each replica what the
 * others did, so every tab shows the same confirmed values, the same pending
 * edits and the same rollbacks.
 *
 * Owner and replicas talk over message ports: a `MessageChannel` in one
 * realm, a SharedWorker's ports across tabs, or a dedicated Worker's port for
 * one page. Messages are structured-cloned.
 *
 * Invariants:
 * - The owner sends each write once, for the replica that made it. Every other
 *   replica shows it from the moment it is sent, and settles it as that
 *   replica does: confirmed with the same reply, refused, or uncertain until
 *   one of them settles it.
 * - A read's request runs while a replica waits on it. A replica lets go of one
 *   when its store does, as a local store aborts its transport's signal; the
 *   owner aborts its own transport's once the last replica waiting has. Each
 *   preview the transport sends reaches every replica waiting, and one that
 *   joins later starts from the newest.
 * - Equal reads in flight at once are one request, except that a replica
 *   asking again for a read it asked for before, to reload it, never joins a
 *   request that may predate the change it reloads for. The newest read
 *   started for a key replaces the value of each replica that holds it and is
 *   not loading it itself; an older one finishing later does not, and its value
 *   is never saved over the newer one's.
 * - A read's value crosses to a tab once. Where the tab's validator returns the
 *   value it was given, the owner saves its own copy of it and the tab sends
 *   none back.
 * - Each write's receipt is looked up once per owner, and every tab that asks
 *   for it settles the write by that answer.
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
	type StandardSchema,
	type Write,
	type DataReply,
	type DataRequest,
} from './contracts.js';
import { clearHostTimeout, hostDateNow, postHostTask, setHostTimeout } from '../host-task.js';
import {
	createDataStore,
	DataRetiredError,
	entryKey,
	internals,
	requestTimes,
	ownerValidated,
	validatedReplies,
	type DataStore,
	type DataStoreOptions,
	type Entry,
	type PersistenceFactory,
	withPersistence,
} from './store.js';
import {
	createPersistence,
	done,
	request as settled,
	schemaShape,
	shape,
	type Persistence,
	type PersistOptions,
	type Journaled,
	type Saving,
	type Stored,
} from './persist.js';
import { DATA_WORKER_PATH } from './worker-path.js';

/** The part of a `MessagePort` the owner and its replicas use. */
export interface OwnerPort {
	postMessage(message: unknown): void;
	addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
	start?(): void;
	close?(): void;
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
	/** Drop only this replica; its account and other replicas remain live. */
	| { readonly t: 'disconnect' }
	/** Is the account still signed in? Asked by a tab resuming from being frozen. */
	| { readonly t: 'ping' }
	/** A call to the account's persistence, which the owner alone writes; `id` 0 wants no answer. */
	| {
			readonly t: 'persist';
			readonly id: number;
			readonly op: PersistOp;
			readonly args: readonly unknown[];
	  }
	| {
			readonly t: 'request';
			readonly id: number;
			readonly request: DataRequest;
			/** A reload: it must not join a request already in flight. */
			readonly fresh: boolean;
			/** A write's receipt, which every tab asking for it shares. */
			readonly receipt: boolean;
			/** This tab saves the read's value, so the owner keeps its reply to save for it. */
			readonly keep?: boolean;
	  }
	/** This tab no longer waits on the request it sent as `id`. */
	| { readonly t: 'cancel'; readonly id: number }
	| { readonly t: 'listen'; readonly id: number; readonly request: FeedRequest }
	| { readonly t: 'unlisten'; readonly id: number }
	/** A value this tab holds, loaded at `at`, for the others: a seed, or one newer than a seed offered. */
	| Offer
	| {
			readonly t: 'settle';
			readonly op: string;
			readonly confirmed: boolean;
			readonly value: unknown;
	  };

/**
 * A value a replica holds, loaded at `at` (a wall-clock time every tab and the
 * owner share): one a server render seeded, or one newer than a value offered.
 * A replica holding an older value takes it; one holding a newer value offers
 * its own back.
 */
interface Offer {
	readonly t: 'offer';
	readonly name: string;
	readonly input: unknown;
	readonly value: unknown;
	readonly at: number;
	/**
	 * The value is what the tab's own schema made of it, and a clone keeps it
	 * as it is. Every tab an owner serves runs one build, so another takes it as it came.
	 */
	readonly validated?: boolean;
}

/** What an owner sends a replica. */
type ToReplica =
	/** The account is signed in; this replica may show what it holds. */
	| { readonly t: 'live' }
	/** The account was signed out, or another signed in: show nothing more. */
	| { readonly t: 'retired' }
	/** This tab cannot share the owner: its build's contracts differ, or the account cannot be recorded. */
	| { readonly t: 'refused' }
	/** The answer to a call to the account's persistence; a restored value may be validated, as a reply's is. */
	| {
			readonly t: 'persisted';
			readonly id: number;
			readonly value: unknown;
			readonly validated?: boolean;
	  }
	| {
			readonly t: 'reply';
			readonly id: number;
			readonly reply: DataReply;
			/** When a read's request started; a write's reply and an owner from an older build leave it out. */
			readonly at?: number;
			/** The owner kept the value: a tab that validates it unchanged saves it without sending it back. */
			readonly kept?: boolean;
			/** The owner validated the value with the tab's own output schema. */
			readonly validated?: boolean;
	  }
	| { readonly t: 'failed'; readonly id: number; readonly error: unknown }
	/** A provisional value of the read asked for as `id`, ahead of its reply. */
	| {
			readonly t: 'preview';
			readonly id: number;
			readonly value: unknown;
			readonly validated?: boolean;
	  }
	| {
			readonly t: 'frame';
			readonly id: number;
			readonly frame: FeedFrame;
			readonly validated?: boolean;
	  }
	| { readonly t: 'end'; readonly id: number; readonly error?: unknown }
	/** Another replica loaded a read. */
	| {
			readonly t: 'value';
			readonly name: string;
			readonly input: unknown;
			readonly value: unknown;
			/** When the request that read it started; an owner from an older build leaves it out. */
			readonly at?: number;
			/** The owner kept the value, and validated it, as for a reply. */
			readonly kept?: boolean;
			readonly validated?: boolean;
	  }
	/** A value another replica holds, which the owner passes on as it came. */
	| Offer
	/** Another replica sent a write. */
	| { readonly t: 'write'; readonly op: string; readonly name: string; readonly raw: unknown }
	/** How a write another replica sent ended: its reply, or uncertain. */
	| {
			readonly t: 'outcome';
			readonly op: string;
			readonly reply: DataReply | null;
			readonly validated?: boolean;
	  }
	| {
			readonly t: 'settle';
			readonly op: string;
			readonly confirmed: boolean;
			readonly value: unknown;
	  };

export interface DataOwner {
	/** Serve a replica connected through `port`. */
	connect(port: OwnerPort): void;
	/** In explicit-fence mode, activate or revoke an account from trusted host code. */
	activate(account: string | null): Promise<void>;
}

/** One request the owner made, shared by every replica that asked for it while it ran. */
interface Asking {
	/** When it started. */
	readonly at: number;
	/** Each replica still waiting on it, with the ID it asked under; the rest are told a read's value. */
	readonly waiting: Array<readonly [OwnerPort, number]>;
	/** Whether a tab that asked saves the read's value. */
	keep: boolean;
	/** Aborts the transport once no replica waits. */
	readonly abort: AbortController;
	/** The newest preview sent, for a replica that joins after it. */
	preview: { readonly value: unknown; readonly validated: boolean } | null;
	/** The previews still being validated, which go out in the order they came. */
	previewing: Promise<void>;
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
	/**
	 * Serve only while this owner's account is the origin's, recorded in IndexedDB.
	 * Explicit mode requires the trusted host to authenticate port/account admission and keep
	 * one owner instance per active grant. A fresh owner can adopt the durable grant when
	 * replacing a stopped worker.
	 */
	readonly fence?: boolean | 'explicit' | undefined;
	/**
	 * The signed-in account's encrypted cache and write journal. The owner is
	 * their only writer, so every tab shares one budget and one journal.
	 */
	readonly persist?: ((account: string) => PersistOptions) | undefined;
	/**
	 * Every read, write and feed the app uses, as `createReplica` takes them.
	 * With them, the owner validates what the server sends with the build's
	 * schemas, for tabs of the same build, which then adopt it without
	 * validating it on the page: each read's reply and previews, each write's
	 * output and the reads its reply returns, and each feed event.
	 */
	readonly contracts?: ReadonlyArray<Contract> | undefined;
}): DataOwner {
	const { transport, listen, fence } = options;
	const outputs = new Map<string, Read<any, any>>();
	const writeContracts = new Map<string, Write<any, any>>();
	const feedContracts = new Map<string, Feed<any, any>>();
	for (const contract of options.contracts ?? []) {
		if (contract.kind === 'read') outputs.set(contract.name, contract);
		else if (contract.kind === 'write') writeContracts.set(contract.name, contract);
		else feedContracts.set(contract.name, contract);
	}
	/** Whether the tabs served, all of one build, share this owner's contracts. */
	let validating = false;
	/** The replies and frames whose values this owner validated. */
	const validated = new WeakSet<object>();
	/**
	 * `value` through `schema`, where the result survives the trip to a tab
	 * unchanged; `NOT` where it fails or would not, and the tab validates it,
	 * reporting what was wrong.
	 */
	const validate = async (schema: StandardSchema<unknown, unknown>, value: unknown) => {
		try {
			const output = await parse(schema, value);
			return cloneable(output) ? output : NOT;
		} catch {
			return NOT;
		}
	};
	/** A read's reply as the tabs should take it: validated here, where the value survives the trip. */
	const check = async (name: string, reply: DataReply): Promise<DataReply> => {
		const read = outputs.get(name);
		if (!validating || !read || !reply.ok) return reply;
		const value = await validate(read.output, reply.value);
		if (value === NOT) return reply;
		const checked: DataReply = { ...reply, value };
		validated.add(checked);
		return checked;
	};
	/** A write's reply, with its output and every read it returns validated, or as it came. */
	const checkWrite = async (name: string, reply: DataReply): Promise<DataReply> => {
		const write = writeContracts.get(name);
		if (!validating || !write || !reply.ok) return reply;
		const value = write.output ? await validate(write.output, reply.value) : reply.value;
		if (value === NOT) return reply;
		const refreshed = [];
		for (const item of reply.refreshed ?? []) {
			const read = outputs.get(item.name);
			const fresh = read ? await validate(read.output, item.value) : NOT;
			if (fresh === NOT) return reply;
			refreshed.push({ ...item, value: fresh });
		}
		const checked: DataReply = { ...reply, value, refreshed };
		validated.add(checked);
		return checked;
	};
	/** A feed's frame, with its event validated, or as it came. */
	const checkFrame = async (name: string, frame: FeedFrame): Promise<FeedFrame> => {
		const feed = feedContracts.get(name);
		if (!validating || !feed || !('event' in frame)) return frame;
		const event = await validate(feed.event, frame.event);
		if (event === NOT) return frame;
		const checked = { ...frame, event };
		validated.add(checked);
		return checked;
	};
	/** A value restored from the cache for `key`, with its value validated here, or as it came. */
	const checkRestored = async (
		key: string,
		stored: Stored | undefined,
	): Promise<[Stored | undefined, boolean]> => {
		// An entry key is the read's name, then its encoded input, which holds no newline.
		const read =
			validating && stored ? outputs.get(key.slice(0, key.lastIndexOf('\nwire:'))) : undefined;
		const value = read ? await validate(read.output, stored!.value) : NOT;
		return value === NOT ? [stored, false] : [{ ...stored!, value }, true];
	};
	/**
	 * The writes a previous session journaled, each whose input validates here
	 * carrying it as `input`; whether any does.
	 */
	const checkRecovered = async (
		items: Array<Journaled & { order: [number, number] }>,
	): Promise<[unknown, boolean]> => {
		if (!validating) return [items, false];
		let any = false;
		const checked = [];
		for (const item of items) {
			const write = writeContracts.get(item.name);
			const input = write ? await validate(write.input, item.raw) : NOT;
			any ||= input !== NOT;
			checked.push(input === NOT ? item : { ...item, input });
		}
		return [checked, any];
	};
	const accountDatabase = fence === 'explicit' ? EXPLICIT_ACCOUNT_DATABASE : ACCOUNT_DATABASE;
	const accountChannel = fence === 'explicit' ? EXPLICIT_ACCOUNT_CHANNEL : ACCOUNT_CHANNEL;
	const persistOptions = (account: string, grant: number): PersistOptions => {
		const configured = options.persist!(account);
		return fence === 'explicit'
			? { ...configured, partition: `octane-data-explicit:${grant}:${configured.partition}` }
			: configured;
	};
	/** The replicas of the signed-in account. A replica of a retired one is never served again. */
	const replicas = new Set<OwnerPort>();
	/** Reads in flight, by wire key, so equal reads share one request. */
	const reading = new Map<string, Promise<DataReply>>();
	const upstreams = new Map<string, Upstream>();
	const asked = new WeakMap<Promise<DataReply>, Asking>();
	/** The requests that have not ended, where a replica letting go of one finds it. */
	const flying = new Set<Asking>();
	/** When the last read started: each starts later than every read before it, so they have an order. */
	let lastStart = 0;
	/** The newest read started for each wire key: only its value is told to the others. */
	const newest = new Map<string, Promise<DataReply>>();
	/** Receipts looked up, by wire key, so every tab settles a write by the same answer. */
	const receipts = new Map<string, Promise<DataReply>>();

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
	/**
	 * Tabs dropped while silent, by the generation they were served under. A
	 * frozen or throttled tab may speak again: under that generation it is
	 * served again, and under any other it is told its account was retired.
	 */
	const dropped = new WeakMap<OwnerPort, number>();
	function disconnect(port: OwnerPort): void {
		replicas.delete(port);
		heard.delete(port);
		dropped.delete(port);
		for (const upstream of upstreams.values()) {
			const id = upstream.members.get(port);
			if (id !== undefined) unsubscribe(port, id);
		}
		if (heard.size === 0) {
			clearHostTimeout(sweeping);
			sweeping = undefined;
		}
	}
	function sweep(): void {
		sweeping = undefined;
		for (const [port, at] of heard) {
			if (replicas.has(port) && hostDateNow() - at <= HEARTBEAT_MS * 3) continue;
			heard.delete(port);
			if (replicas.delete(port)) dropped.set(port, generation);
			// Its writes keep going; what it listened to stops, and connects again if it wakes.
			for (const upstream of upstreams.values()) {
				const id = upstream.members.get(port);
				if (id === undefined) continue;
				unsubscribe(port, id);
				port.postMessage({ t: 'end', id } satisfies ToReplica);
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
	/** An explicit owner never silently adopts a different grant after it was bound. */
	let bound: { readonly account: string | null; readonly generation: number } | null = null;
	const channel = fence ? new BroadcastChannel(accountChannel) : null;
	if (channel) {
		channel.onmessage = ({ data }) => {
			announced = Math.max(announced, data as number);
			if (generation > 0 && announced > generation) retireAll();
		};
	}

	/** The account's persistence, opened on first use; what each tab last asked to save. */
	let persistence: Persistence | null = null;
	const saves = new Map<string, Saving | null>();
	/** When the newest request whose value was saved for each key started. */
	const newestSaved = new Map<string, number>();
	/**
	 * The replies to each read a tab saves, by when their request started, until
	 * a tab saves that reply or a newer one: one that validated it unchanged says
	 * so, and the owner saves this copy. A newer reply lands beside an older one
	 * still waiting, since a newer one no tab can validate leaves the older as
	 * the only value to save. Past `KEPT` waiting replies, a reply is not kept,
	 * and its tabs send it back.
	 */
	const kept = new Map<string, Map<number, unknown>>();
	/** Keys some tab restored or saved this session, which purging leaves alone. */
	const shown = new Set<string>();
	/** Only the first tab to ask recovers the journal, so each write is looked up once. */
	let recovering = false;
	/** Writes journaled through this owner and not yet settled, which are no tab's to recover. */
	const journaled = new Set<string>();
	function persistenceFor(): Persistence | null {
		if (!persistence && serving && options.persist) {
			persistence = createPersistence(
				persistOptions(serving.account ?? '', generation),
				(key) => {
					if (!saves.has(key)) return undefined;
					const saving = saves.get(key);
					saves.delete(key);
					return saving;
				},
				(key) => shown.has(key),
			);
		}
		return persistence;
	}
	function persist(port: OwnerPort, { id, op, args }: Extract<ToOwner, { t: 'persist' }>): void {
		const answer = (value: unknown, validated = false) => {
			if (id)
				post(
					port,
					validated ? { t: 'persisted', id, value, validated } : { t: 'persisted', id, value },
				);
		};
		if (fence === 'explicit' && op === 'clear') return answer(undefined);
		const p = persistenceFor();
		const key = args[0] as string;
		if (!p) return answer(nothing(op));
		if (op === 'save' || op === 'restore') shown.add(key);
		if (op === 'save') {
			let saving = args[1] as Saving | null;
			const at = saving?.requestedAt;
			if (at !== undefined) {
				const held = kept.get(key);
				if (args[2]) {
					// The tab validated the reply unchanged and sent no value. Unless it is still
					// kept, a save of it, or of a newer request's value, came first.
					if (!held?.has(at)) return;
					saving = { ...saving!, stored: { ...saving!.stored, value: held.get(at) } };
				}
				if (held) {
					// This save supersedes every reply it is not older than.
					for (const waiting of held.keys()) if (waiting <= at) held.delete(waiting);
					if (held.size === 0) kept.delete(key);
				}
				// A reply to an older request can land after a newer one's value was saved.
				if (at < (newestSaved.get(key) ?? 0)) return;
				newestSaved.set(key, at);
			}
			return (saves.set(key, saving), p.mark(key));
		}
		if (op === 'journal') journaled.add((args[0] as { id: string }).id);
		if (op === 'unjournal') journaled.delete(key);
		if (op === 'recover') {
			if (recovering) return answer([]);
			recovering = true;
		}
		// Each operation is the persistence method of the same name.
		const result = (p as any)[op](...args) as Promise<unknown> | undefined;
		result?.then(
			async (value) => {
				if (op === 'restore')
					return answer(...(await checkRestored(key, value as Stored | undefined)));
				// A write in flight through this owner is its tab's to settle; only an earlier
				// owner's, such as a crashed worker's, are left for the recovering tab.
				if (op === 'recover')
					return answer(
						...(await checkRecovered(
							(value as Array<Journaled & { order: [number, number] }>).filter(
								({ id }) => !journaled.has(id),
							),
						)),
					);
				answer(value);
			},
			() => answer(nothing(op)),
		);
	}

	/** Every replica of the account hears it is retired, and nothing in flight reaches one. */
	function retireAll(): Promise<void> {
		// Signing out, or another account signing in, leaves nothing of this one on the device.
		const clearing = persistence?.clear() ?? Promise.resolve();
		clearing.catch(() => {});
		persistence = null;
		saves.clear();
		newestSaved.clear();
		kept.clear();
		shown.clear();
		journaled.clear();
		receipts.clear();
		recovering = false;
		serving = null;
		generation = 0;
		for (const upstream of upstreams.values()) upstream.abort.abort();
		upstreams.clear();
		reading.clear();
		newest.clear();
		for (const port of replicas) port.postMessage(RETIRED);
		replicas.clear();
		for (const port of heard.keys()) disconnect(port);
		return clearing;
	}

	async function accountRecord(): Promise<
		{ account: string | null; generation: number; pending?: boolean } | undefined
	> {
		const opening = indexedDB.open(accountDatabase, 1);
		opening.onupgradeneeded = () => opening.result.createObjectStore('account');
		const database = await settled(opening);
		try {
			return await settled(database.transaction('account').objectStore('account').get(0));
		} finally {
			database.close();
		}
	}

	/** Explicit replicas can only join a grant already activated by trusted owner code. */
	async function admit(port: OwnerPort, account: string): Promise<void> {
		await activating;
		let record: Awaited<ReturnType<typeof accountRecord>>;
		try {
			record = await accountRecord();
		} catch {
			return port.postMessage(RETIRED);
		}
		if (
			!record ||
			record.pending ||
			record.account !== account ||
			announced > record.generation ||
			(bound && (bound.account !== account || bound.generation !== record.generation))
		)
			return port.postMessage(RETIRED);
		if (serving && (serving.account !== account || generation !== record.generation))
			await retireAll();
		if (announced > record.generation) return port.postMessage(RETIRED);
		bound ??= { account, generation: record.generation };
		serving ??= { account, ready: Promise.resolve(record.generation) };
		generation = record.generation;
		replicas.add(port);
		watch(port);
		port.postMessage({ t: 'live' } satisfies ToReplica);
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
	async function decide(
		account: string | null,
		signedIn?: number,
		activate = false,
		previous?: (account: string | null) => void,
	): Promise<number> {
		const opening = indexedDB.open(accountDatabase, 1);
		opening.onupgradeneeded = () => opening.result.createObjectStore('account');
		const database = await settled(opening);
		try {
			const transaction = database.transaction('account', 'readwrite');
			const store = transaction.objectStore('account');
			const recorded = (await settled(store.get(0))) as
				{ account: string | null; generation: number } | undefined;
			previous?.(recorded?.account ?? null);
			let next = recorded?.generation ?? 0;
			const changed =
				activate ||
				(account === null ? recorded?.generation === signedIn : recorded?.account !== account);
			if (changed)
				store.put(
					activate
						? { account, generation: ++next, pending: true }
						: { account, generation: ++next },
					0,
				);
			await done(transaction);
			if (changed) channel!.postMessage(next);
			return next;
		} finally {
			database.close();
		}
	}

	async function finishActivation(account: string | null, signedIn: number): Promise<boolean> {
		const opening = indexedDB.open(accountDatabase, 1);
		const database = await settled(opening);
		try {
			const transaction = database.transaction('account', 'readwrite');
			const store = transaction.objectStore('account');
			const record = await settled(store.get(0));
			if (record?.account !== account || record.generation !== signedIn || !record.pending)
				return false;
			store.put({ account, generation: signedIn }, 0);
			await done(transaction);
			return true;
		} finally {
			database.close();
		}
	}

	function request(
		from: OwnerPort,
		{ id, request: payload, fresh, receipt, keep }: Extract<ToOwner, { t: 'request' }>,
	): void {
		const fail = (error: unknown) => post(from, { t: 'failed', id, error });
		if (payload.kind === 'write') {
			const op = payload.operationId!;
			others(from, { t: 'write', op, name: payload.name, raw: payload.input });
			transport(payload, new AbortController().signal).then(
				async (raw) => {
					const reply = await checkWrite(payload.name, raw);
					const checked = validated.has(reply);
					post(from, { t: 'reply', id, reply, validated: checked });
					others(from, { t: 'outcome', op, reply, validated: checked });
				},
				(error) => {
					fail(error);
					others(from, { t: 'outcome', op, reply: null });
				},
			);
			return;
		}
		/** The key a tab saves the read under. */
		const cacheKey = entryKey(payload.name, payload.input);
		const key = `${payload.kind}\n${cacheKey}`;
		let shared = receipt ? receipts.get(key) : fresh ? undefined : reading.get(key);
		if (!shared) {
			const at = (lastStart = Math.max(lastStart + 1, hostDateNow()));
			const asking: Asking = {
				at,
				waiting: [],
				keep: false,
				abort: new AbortController(),
				preview: null,
				previewing: Promise.resolve(),
			};
			const show = (value: unknown, validated: boolean) => {
				asking.preview = { value, validated };
				for (const [port, member] of asking.waiting)
					post(port, { t: 'preview', id: member, value, validated });
			};
			const read = outputs.get(payload.name);
			const started = (shared = Promise.resolve()
				.then(() =>
					transport(payload, asking.abort.signal, (raw) => {
						if (!validating || !read || payload.kind !== 'read') return show(raw, false);
						// Only an object can be marked as validated: the tab validates any other value itself.
						asking.previewing = asking.previewing
							.then(() => validate(read.output, raw))
							.then((value) =>
								typeof value === 'object' && value !== null ? show(value, true) : show(raw, false),
							);
					}),
				)
				.then((reply) => check(payload.name, reply)));
			asked.set(started, asking);
			flying.add(asking);
			reading.set(key, started);
			newest.set(key, started);
			const done = () => {
				flying.delete(asking);
				if (reading.get(key) === started) reading.delete(key);
				if (newest.get(key) === started) newest.delete(key);
			};
			// A request no replica waits on is no longer one to join.
			asking.abort.signal.addEventListener('abort', done, { once: true });
			if (receipt) {
				receipts.set(key, started);
				// An answer that is not an outcome is asked for again; the oldest outcomes are forgotten.
				started.then(
					(reply) => reply.ok || receipts.delete(key),
					() => receipts.delete(key),
				);
				if (receipts.size > 256) receipts.delete(receipts.keys().next().value!);
			}
			if (payload.kind === 'read') {
				started.then(
					(reply) => {
						if (!reply.ok) return;
						// Kept for the tabs that save it, beside any older reply still waiting.
						const held = kept.get(cacheKey);
						const saves = asking.keep && !receipt && options.persist && (held?.size ?? 0) < KEPT;
						if (saves && (newestSaved.get(cacheKey) ?? 0) < at) {
							if (held) held.set(at, reply.value);
							else kept.set(cacheKey, new Map([[at, reply.value]]));
						}
						// A newer read has replaced this one; its value is the one to share.
						if (newest.get(key) !== started) return;
						// Every replica holding this read takes the value; the ones that asked already have it.
						const value: ToReplica = {
							t: 'value',
							name: payload.name,
							input: payload.input,
							value: reply.value,
							at,
							kept: kept.get(cacheKey)?.has(at) === true,
							validated: validated.has(reply),
						};
						for (const port of replicas)
							if (!asking.waiting.some(([asker]) => asker === port)) post(port, value);
					},
					() => {},
				);
			}
			started.then(done, done);
		}
		const asking = asked.get(shared)!;
		const { at } = asking;
		asking.waiting.push([from, id]);
		asking.keep ||= !!keep;
		if (asking.preview) post(from, { t: 'preview', id, ...asking.preview });
		shared.then(
			(reply) =>
				post(from, {
					t: 'reply',
					id,
					reply,
					at,
					kept: kept.get(cacheKey)?.has(at) === true,
					validated: validated.has(reply),
				}),
			fail,
		);
	}

	/** A replica let go of the request it sent as `id`, which ends once no replica waits on it. */
	function cancel(from: OwnerPort, id: number): void {
		for (const asking of flying) {
			const index = asking.waiting.findIndex(([port, member]) => port === from && member === id);
			if (index < 0) continue;
			asking.waiting.splice(index, 1);
			if (asking.waiting.length === 0) asking.abort.abort();
			return;
		}
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
			// A replica joining a live connection hears it is open, and where it stands. One that
			// stood elsewhere, such as a page whose server render read the feed's position, may
			// have missed events in between.
			const { cursor } = upstream;
			const gap = payload.cursor !== null && payload.cursor !== cursor;
			from.postMessage({
				t: 'frame',
				id,
				frame: cursor === null ? { gap } : { cursor, gap },
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
				for await (const raw of listen(payload, current.abort.signal)) {
					if (current.abort.signal.aborted) return;
					// Validated in order: the next frame waits for this one.
					const frame = await checkFrame(payload.name, raw);
					if (current.abort.signal.aborted) return;
					if (frame.cursor !== undefined) current.cursor = frame.cursor;
					const checked = validated.has(frame);
					for (const [port, member] of current.members)
						post(port, { t: 'frame', id: member, frame, validated: checked });
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

	let activating: Promise<void> = Promise.resolve();
	return {
		activate(account) {
			if (fence !== 'explicit')
				return Promise.reject(new Error('octane/data: activate requires an explicit fence'));
			const activation = activating.then(async () => {
				let previous: string | null = null;
				const next = await decide(account, undefined, true, (value) => (previous = value));
				announced = Math.max(announced, next);
				try {
					const prior =
						serving?.account === previous && generation === next - 1 ? persistence : null;
					if (serving) await retireAll();
					if (previous && options.persist && !prior) {
						await createPersistence(
							persistOptions(previous, next - 1),
							() => undefined,
							() => false,
						).clear();
					}
					if (!(await finishActivation(account, next)) || announced > next)
						throw new DataRetiredError();
					bound = { account, generation: next };
					generation = next;
					serving = account === null ? null : { account, ready: Promise.resolve(next) };
				} catch (error) {
					await decide(null, next);
					throw error;
				}
			});
			activating = activation.catch(() => {});
			return activation;
		},
		connect(port) {
			/** A replica is served once its build matches and its account is recorded, in the order it asked. */
			let joined: Promise<void> | null = null;
			const handle = (message: ToOwner) => {
				if (refused.has(port)) return port.postMessage(REFUSED);
				// A replica of a retired account is told so, whatever it asks.
				if (!replicas.has(port)) {
					if (!serving || dropped.get(port) !== generation) return port.postMessage(RETIRED);
					dropped.delete(port);
					replicas.add(port);
					watch(port);
				}
				heard.set(port, hostDateNow());
				if (message.t === 'request') request(port, message);
				else if (message.t === 'cancel') cancel(port, message.id);
				else if (message.t === 'listen') subscribe(port, message.id, message.request);
				else if (message.t === 'unlisten') unsubscribe(port, message.id);
				else if (message.t === 'retire') {
					if (fence === 'explicit') {
						disconnect(port);
						port.postMessage(RETIRED);
					} else signOut();
				} else if (message.t === 'disconnect') disconnect(port);
				else if (message.t === 'ping') port.postMessage({ t: 'live' } satisfies ToReplica);
				else if (message.t === 'persist') persist(port, message);
				else if (message.t !== 'hello') others(port, message);
			};
			port.addEventListener('message', ({ data }) => {
				const message = data as ToOwner;
				if (message.t === 'hello') {
					// The first build served decides which builds share this owner.
					if (identity === undefined) {
						identity = message.identity;
						validating = outputs.size > 0 && contractIdentity(options.contracts!) === identity;
					}
					if (message.identity !== identity) joined = Promise.resolve(refuse(port));
					else if (fence === 'explicit') joined = admit(port, message.account!);
					else if (fence) joined = join(port, message.account!);
					else if (serving) {
						replicas.add(port);
						watch(port);
						port.postMessage({ t: 'live' } satisfies ToReplica);
					}
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
 * saved value with its read. `octane/data/manifest` exports it as `identity`.
 */
export function contractIdentity(contracts: ReadonlyArray<Contract>): string {
	return contracts
		.map((contract) =>
			contract.kind === 'read'
				? `read ${contract.name} ${contract.version} ${shape(contract)}`
				: contract.kind === 'write'
					? `write ${contract.name} ${contract.version} ${contract.output ? `output ${schemaShape(contract.output)}` : 'none'}`
					: `feed ${contract.name} ${contract.version} ${schemaShape(contract.event)}`,
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
			readonly signal: AbortSignal;
			readonly preview: ((value: unknown) => void) | undefined;
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

	const receiptName = local.persist?.journal?.receipt.name;
	/** The reads whose values this tab saves as loaded; a view saves its rows, not its reply. */
	const saved = new Set<string>();
	if (local.persist) {
		for (const contract of contracts)
			if (contract.kind === 'read' && contract.persist && !('view' in contract))
				saved.add(contract.name);
	}
	/**
	 * Values the owner kept its own copy of, with when their request started: one
	 * still held unchanged when it is saved is not sent back.
	 */
	let kept = new WeakMap<object, number>();
	const ownerKept = (value: unknown, at: number) => {
		if (typeof value === 'object' && value !== null) kept.set(value, at);
	};
	/** Ask the owner to make `request`, and let go of it when `signal` aborts. */
	const ask = (
		request: DataRequest,
		fresh: boolean,
		signal: AbortSignal,
		preview?: (value: unknown) => void,
	) =>
		new Promise<DataReply>((resolve, reject) => {
			if (signal.aborted) return reject(signal.reason);
			const id = ++next;
			replies.set(id, { request, fresh, signal, preview, resolve, reject });
			signal.addEventListener(
				'abort',
				() => {
					// Unless it was answered, or asked again of another owner under a new ID.
					if (!replies.delete(id)) return;
					send({ t: 'cancel', id });
					reject(signal.reason);
				},
				{ once: true },
			);
			const receipt = request.kind === 'read' && request.name === receiptName;
			const saves = request.kind === 'read' && saved.has(request.name);
			send({ t: 'request', id, request, fresh, receipt, keep: saves });
		});

	const transport: Transport = (request, signal, preview) => {
		if (!port) return local.transport(request, signal, preview);
		let fresh = false;
		if (request.kind !== 'write') {
			const key = `${request.kind}\n${entryKey(request.name, request.input)}`;
			fresh = askedFor.delete(key);
			askedFor.add(key);
			if (askedFor.size > 512) askedFor.delete(askedFor.values().next().value!);
		}
		return ask(request, fresh, signal, preview);
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
	// The account's cache and journal belong to the owner: this tab forwards its persistence
	// calls there, and keeps its own only once it is a local store.
	let decide!: (shared: boolean) => void;
	const served = new Promise<boolean>((resolve) => (decide = resolve));
	const asked = new Map<
		number,
		{ readonly op: PersistOp; readonly args: readonly unknown[]; resolve(value: any): void }
	>();
	let own: Persistence | null = null;
	let disposed = false;
	let collect!: Parameters<PersistenceFactory>[0];
	let inUse!: Parameters<PersistenceFactory>[1];
	const ownPersistence = () => (own ??= createPersistence(local.persist!, collect, inUse));
	const persistAsk = (op: PersistOp, args: readonly unknown[]): Promise<any> =>
		served.then(() =>
			disposed
				? nothing(op)
				: port
					? new Promise((resolve) => {
							const id = ++next;
							asked.set(id, { op, args, resolve });
							send({ t: 'persist', id, op, args });
						})
					: (ownPersistence() as any)[op](...args),
		);
	const persistTell = (op: PersistOp, args: readonly unknown[]) =>
		void served.then(() => {
			if (!disposed)
				port ? send({ t: 'persist', id: 0, op, args }) : (ownPersistence() as any)[op](...args);
		});
	const marked = new Set<string>();
	/** Send what changed once per host task, as a local store saves once per task. */
	const flush = () => {
		if (disposed) return (marked.clear(), released.clear());
		const keys = [...marked];
		marked.clear();
		for (const key of keys) {
			if (!port) {
				ownPersistence().mark(key);
				continue;
			}
			const saving = collect(key);
			if (saving === undefined) continue;
			const value = saving?.stored.value;
			const at = typeof value === 'object' && value !== null ? kept.get(value) : undefined;
			if (at === undefined || at !== saving!.requestedAt) {
				send({ t: 'persist', id: 0, op: 'save', args: [key, saving] });
				continue;
			}
			// The owner kept this very value: say it validated, in place of cloning it back.
			kept.delete(value as object);
			const unchanged = { ...saving, stored: { ...saving!.stored, value: undefined } };
			send({ t: 'persist', id: 0, op: 'save', args: [key, unchanged, true] });
		}
	};
	/** Marked values collected before their reads were evicted, for the next flush. */
	const released = new Map<string, ReturnType<Parameters<PersistenceFactory>[0]>>();
	const forwarded: PersistenceFactory = (collectSaving, keyInUse) => {
		collect = (key) => {
			if (!released.has(key)) return collectSaving(key);
			const saving = released.get(key);
			released.delete(key);
			return saving;
		};
		inUse = keyInUse;
		return {
			restore: (key, read) => persistAsk('restore', [key, read]),
			mark(key) {
				if (disposed) return;
				if (marked.size === 0) void served.then(() => postHostTask(flush));
				marked.add(key);
				released.delete(key);
			},
			release(key) {
				if (marked.has(key)) released.set(key, collectSaving(key));
			},
			discard: (key, revision) => persistTell('discard', [key, revision]),
			journal: (write) => persistAsk('journal', [write]),
			unjournal: (id) => persistTell('unjournal', [id]),
			recover: () => persistAsk('recover', []),
			invalidated: (tags) => persistTell('invalidated', [tags]),
			cursor: (key) => persistAsk('cursor', [key]),
			keepCursor: (key, cursor) => persistTell('keepCursor', [key, cursor]),
			forget: (key) => persistAsk('forget', [key]),
			dispose: () => own?.dispose() ?? Promise.resolve(),
			clear: () => persistAsk('clear', []),
		};
	};

	const listen = local.listen;
	const store = withPersistence(forwarded, () =>
		createDataStore({
			...local,
			transport,
			listen: listen && ((request, signal) => (port ? viaOwner : listen)(request, signal)),
		}),
	);
	const inner = internals.get(store)!;
	inner.onSettle((op, confirmed, value) => send({ t: 'settle', op, confirmed, value }));

	// Retiring signs the account out in every tab. Until the owner confirms it, ask again:
	// a sign-out must not be lost to a busy or restarting owner.
	const retireHere = store.retire;
	const disposeHere = store.dispose;
	let asking: unknown;
	const signOut = () => {
		send({ t: 'retire' });
		asking = setHostTimeout(signOut, SIGN_OUT_RETRY_MS);
	};
	store.retire = () => {
		if (!store.retired) flush();
		if (port && !store.retired) signOut();
		return retireHere();
	};
	store.dispose = () => {
		if (store.retired) return disposeHere();
		flush();
		disposed = true;
		send({ t: 'disconnect' });
		clearHostTimeout(asking);
		clearHostTimeout(beat);
		port?.close?.();
		port = null;
		decide(false);
		for (const pending of replies.values()) pending.reject(new DataRetiredError());
		replies.clear();
		for (const call of asked.values()) call.resolve(nothing(call.op));
		asked.clear();
		for (const feed of feeds.values()) feed.end();
		return disposeHere();
	};

	/**
	 * Stop waiting on the owner's port: a write already sent to it may have
	 * been made, so it is uncertain, never sent again; every other request is
	 * asked again, of `again`. Each feed connects again, through whatever serves
	 * this tab now.
	 */
	function abandon(again: typeof ask, refused: boolean) {
		const pending = [...replies.values()];
		replies.clear();
		for (const item of pending) {
			if (item.request.kind === 'write' && !refused) item.reject(new Error(LOST));
			else
				again(item.request, item.fresh, item.signal, item.preview).then(item.resolve, item.reject);
		}
		for (const feed of feeds.values()) feed.end(new Error(LOST));
		// Persistence calls are asked again of whatever serves this tab now.
		const persisting = [...asked.values()];
		asked.clear();
		for (const call of persisting) void persistAsk(call.op, call.args).then(call.resolve);
		// Another tab's write in flight may still settle; its tab settles it once it knows.
		for (const op of followed) {
			const operation = inner.operation(op);
			if (operation?.status === 'pending') operation.status = 'uncertain';
		}
	}

	/** Carry on as a local store: the owner refused this build, or is gone for good. */
	function becomeLocal(refused: boolean) {
		port = null;
		decide(false);
		clearHostTimeout(beat);
		inner.fence(false);
		abandon((request, _, signal, preview) => local.transport(request, signal, preview), refused);
	}

	/** The account was signed out, or another signed in: nothing more is shown. */
	function retired() {
		disposed = true;
		marked.clear();
		clearHostTimeout(asking);
		clearHostTimeout(beat);
		port = null;
		decide(false);
		void disposeHere();
		for (const pending of replies.values()) pending.reject(new DataRetiredError());
		replies.clear();
		for (const call of asked.values()) call.resolve(nothing(call.op));
		asked.clear();
		for (const feed of feeds.values()) feed.end();
	}

	/**
	 * The owner stopped answering: its worker may have crashed. Show nothing
	 * until a new owner confirms the account, and ask it what the old one did
	 * not answer. Once it does, settle each write left uncertain by its receipt.
	 */
	let reconnecting = false;
	function lost() {
		const reopened = port && opened.get(port)?.reopen();
		if (!reopened) return becomeLocal(false);
		inner.fence(true);
		reconnecting = true;
		connect(reopened);
		abandon(ask, false);
	}

	// Each side checks the other is still there. A tab whose last three pings went unanswered
	// has lost its owner, however long the browser throttled its timers between them; an owner
	// that hears nothing from a tab drops it.
	let unanswered = 0;
	let beat: unknown;
	const heartbeat = () => {
		if (!port || store.retired) return;
		if (unanswered >= 3) lost();
		if (!port) return;
		unanswered++;
		send({ t: 'ping' });
		beat = setHostTimeout(heartbeat, HEARTBEAT_MS);
	};

	// A tab frozen in the background may have missed a sign-out: it shows nothing it held
	// until the owner says the account is still signed in.
	if (typeof document !== 'undefined') {
		const listening = { signal: inner.retired };
		document.addEventListener(
			'freeze',
			() => {
				if (!port) return;
				inner.fence(true);
				clearHostTimeout(beat);
			},
			listening,
		);
		document.addEventListener(
			'resume',
			() => {
				if (!port) return;
				clearHostTimeout(beat);
				unanswered = 0;
				heartbeat();
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
				output =
					write.output && !ownerValidated(reply)
						? await parse(write.output, reply.value)
						: reply.value;
			} catch {
				output = undefined;
			}
			if (!store.retired) inner.confirm(operation, reply, output);
		}
	}

	/** Offer the others what this tab holds for `entry`. */
	const offer = (entry: Entry) => {
		const held = inner.held(entry);
		if (held) send({ t: 'offer', ...held, validated: cloneable(held.value) });
	};
	inner.onSeed((entry, wireKey) => {
		// A reload of a seeded read must not join a request that may predate what it reloads for.
		askedFor.add(`read\n${wireKey}`);
		offer(entry);
	});

	/**
	 * Take a value another replica holds, if it loaded later than the one held
	 * here; offer this one back if it loaded later.
	 */
	async function offered({ name, input, value, at, validated }: Offer) {
		const key = entryKey(name, input);
		let entry = inner.wireEntry(key);
		// A load under way may finish older than the offer: judge the offer once it lands.
		if (entry?.inflight) {
			await entry.inflight;
			entry = inner.wireEntry(key);
		}
		if (!entry?.hasBase || entry.inflight || store.retired || at === entry.fetchedAt) return;
		if (at < entry.fetchedAt) return offer(entry);
		let parsed: unknown = value;
		if (!validated) {
			try {
				parsed = await parse(entry.read.output, value);
			} catch {
				return;
			}
		}
		if (store.retired || entry.inflight || inner.entries.get(entry.key) !== entry) return;
		if (at <= entry.fetchedAt) return;
		const reload = new Set<Entry>();
		inner.rebase(entry, parsed, false, reload, Math.max(0, hostDateNow() - at));
		inner.finish(reload, [entry], entry.names);
	}

	/**
	 * Take a value another replica loaded, for a read held here and not loading,
	 * unless what is held was read by a request that started later.
	 */
	async function value(
		name: string,
		input: unknown,
		raw: unknown,
		requestedAt?: number,
		validated?: boolean,
	) {
		const at = requestedAt ?? hostDateNow();
		const entry: Entry | undefined = inner.wireEntry(entryKey(name, input));
		const older = () => entry!.hasBase && at < entry!.fetchedAt;
		if (!entry || entry.inflight || store.retired || older()) return;
		let parsed: unknown = raw;
		if (!validated) {
			try {
				parsed = await parse(entry.read.output, raw);
			} catch {
				return;
			}
		}
		// Another value or offer may have landed while this one was validated.
		if (store.retired || entry.inflight || inner.entries.get(entry.key) !== entry || older())
			return;
		const reload = new Set<Entry>();
		inner.rebase(entry, parsed, false, reload, Math.max(0, hostDateNow() - at), requestedAt);
		inner.finish(reload, [entry], entry.names);
	}

	/** Use `next` as this tab's owner: introduce the tab, and hear only that owner from now on. */
	function connect(next: OwnerPort) {
		port = next;
		unanswered = 0;
		opened.get(next)?.failed(() => port === next && becomeLocal(true));
		// What an earlier owner kept went with it.
		kept = new WeakMap();
		next.addEventListener('message', ({ data }) => {
			if (port !== next) return;
			unanswered = 0;
			const message = data as ToReplica;
			switch (message.t) {
				case 'live':
					decide(true);
					inner.fence(false);
					if (reconnecting) {
						reconnecting = false;
						inner.resettle();
					}
					break;
				case 'persisted':
					if (message.validated) trust(message.value);
					asked.get(message.id)?.resolve(message.value);
					asked.delete(message.id);
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
					if (message.t === 'reply') {
						if (message.at !== undefined) requestTimes.set(message.reply, message.at);
						if (message.validated) trust(message.reply);
						if (message.kept && message.reply.ok) ownerKept(message.reply.value, message.at!);
						pending?.resolve(message.reply);
					} else pending?.reject(message.error);
					break;
				}
				case 'preview':
					if (message.validated) trust(message.value);
					replies.get(message.id)?.preview?.(message.value);
					break;
				case 'frame':
					if (message.validated) trust(message.frame);
					feeds.get(message.id)?.push(message.frame);
					break;
				case 'end':
					feeds.get(message.id)?.end(message.error);
					break;
				case 'value':
					if (message.kept) ownerKept(message.value, message.at!);
					void value(message.name, message.input, message.value, message.at, message.validated);
					break;
				case 'offer':
					void offered(message);
					break;
				case 'write':
					inOrder(() => follow(message.op, message.name, message.raw));
					break;
				case 'outcome':
					if (message.validated) trust(message.reply);
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
	} else {
		// No owner to share: this tab is a local store from the start.
		decide(false);
	}
	return store;
}

/**
 * The owner protocol's version, in the worker's name, so a tab on another
 * protocol never shares it. 3: `hello` carries the build's contract identity,
 * and each side checks the other is still there. 4: the owner keeps the
 * account's cache and journal, which tabs reach through `persist`.
 */
const PROTOCOL = 5;
const RETIRED: ToReplica = { t: 'retired' };
/** What a persistence call answers when there is nothing: no entries to recover, no cursor, no value. */
const nothing = (op: PersistOp) => (op === 'recover' ? [] : op === 'cursor' ? null : undefined);
/** The persistence calls a replica forwards, by method name; `save` carries what `mark` would collect. */
type PersistOp =
	| 'restore'
	| 'save'
	| 'discard'
	| 'journal'
	| 'unjournal'
	| 'recover'
	| 'invalidated'
	| 'cursor'
	| 'keepCursor'
	| 'forget'
	| 'clear';
const REFUSED: ToReplica = { t: 'refused' };
/** How often a tab and its owner check on each other; three silent intervals means gone. */
const HEARTBEAT_MS = 5_000;
const LOST = 'octane/data: the connection to the shared owner was lost';
/**
 * What `sharedOwner` knows of each port it opened: the account, how to open
 * another, and how to hear that its worker could not load.
 */
const opened = new WeakMap<
	OwnerPort,
	{ account: string; reopen(): OwnerPort | null; failed(then: () => void): void }
>();
/** How long a tab waits for its owner to confirm a sign-out before asking again. */
const SIGN_OUT_RETRY_MS = 5_000;
/** Where fencing owners record the origin's account, and announce a new one. */
const ACCOUNT_DATABASE = 'octane-data-account';
const ACCOUNT_CHANNEL = 'octane-data:account';
const EXPLICIT_ACCOUNT_DATABASE = 'octane-data-account-explicit';
const EXPLICIT_ACCOUNT_CHANNEL = 'octane-data:account-explicit';

/**
 * Connect to the owner every tab sharing `name` uses, such as the account's
 * partition, through the data worker the build plugins emit. Pass the port to
 * `createReplica`. Where SharedWorker is missing or cannot start, the page
 * runs the worker as a dedicated Worker of its own instead, which its
 * replicas of `name` share, so the owner's work stays off the page's thread
 * but is not shared with other tabs. Returns `null` where neither can start,
 * and `createReplica` then makes the tab a local store, as it does once a
 * worker that failed to load reports it.
 */
export function sharedOwner(name: string, url: string | URL = DATA_WORKER_PATH): OwnerPort | null {
	const options = { type: 'module', name: `octane-data:${PROTOCOL}:${name}` } as const;
	let port: MessagePort | null = null;
	let worker: SharedWorker | Worker;
	try {
		if (typeof SharedWorker === 'function') port = (worker = new SharedWorker(url, options)).port;
	} catch {}
	const key = `${url}\n${options.name}`;
	if (!port) {
		if (typeof Worker !== 'function') return null;
		try {
			worker = dedicated.get(key) ?? new Worker(url, options);
		} catch {
			return null;
		}
		dedicated.set(key, worker);
		const channel = new MessageChannel();
		worker.postMessage(null, [channel.port2]);
		port = channel.port1;
	}
	// One that cannot load, unlike an error it throws, serves nobody: its tabs carry on alone.
	let unloadable = false;
	let tell = () => {};
	worker!.addEventListener('error', (event) => {
		if (typeof ErrorEvent === 'function' && event instanceof ErrorEvent) return;
		if (dedicated.get(key) === worker) dedicated.delete(key);
		unloadable = true;
		tell();
	});
	const reopen = () => {
		// A dedicated worker that stopped answering is replaced, once, for every replica it served.
		if (dedicated.get(key) === worker) {
			dedicated.delete(key);
			(worker as Worker).terminate();
		}
		return sharedOwner(name, url);
	};
	opened.set(port, {
		account: name,
		reopen,
		failed: (then) => (unloadable ? then() : (tell = then)),
	});
	return port;
}

/** What an owner's validation gives where the tab must validate instead. */
const NOT: unique symbol = Symbol('not validated');
/**
 * The most replies to one read the owner keeps while they wait for a tab's
 * save: an older one, and the newer one a refresh brings before the older is saved.
 */
const KEPT = 2;
/** Adopt `value`, which the owner validated with this build's schemas, as it came. */
const trust = (value: unknown) => {
	if (typeof value === 'object' && value !== null) validatedReplies.add(value);
};

/**
 * How many objects, and how deep, `cloneable` walks without tracking which it
 * has seen. Tracking costs most of the walk, and only a value that shares or
 * cycles needs it: a cycle runs past the depth, and enough sharing to matter
 * past the count.
 */
const QUICK_OBJECTS = 1 << 20;
const QUICK_DEPTH = 256;
/** Thrown when an untracked walk passes either limit, to start it over tracking. */
const TRACK = {};
let quickLeft = 0;

/**
 * Whether a structured clone of `value` equals it: plain data, with nothing a
 * clone would drop or turn into a plain object, such as a class instance.
 */
function cloneable(value: unknown): boolean {
	quickLeft = QUICK_OBJECTS;
	try {
		return walk(value, undefined, 0);
	} catch (error) {
		if (error !== TRACK) throw error;
		return walk(value, new Set(), 0);
	}
}

function walk(value: unknown, seen: Set<object> | undefined, depth: number): boolean {
	if (typeof value !== 'object' || value === null)
		return typeof value !== 'function' && typeof value !== 'symbol';
	if (seen) {
		if (seen.has(value)) return true;
		seen.add(value);
	} else if (--quickLeft < 0 || ++depth > QUICK_DEPTH) throw TRACK;
	const proto = Object.getPrototypeOf(value);
	if (proto === Array.prototype) {
		// Items by index: reading a long list through the string keys `for...in`
		// gives costs several times as much.
		const array = value as unknown[];
		let present = array.length;
		for (let index = 0; index < array.length; index++) {
			const item = array[index];
			if (item === undefined && !(index in array)) present--;
			else if (!walk(item, seen, depth)) return false;
		}
		// A clone also copies a list's other properties, which `for...in` gives
		// after its indices. Counting the keys first is cheaper than enumerating them.
		if (Object.keys(array).length === present) return true;
		let keys = 0;
		for (const key in array)
			if (++keys > present && !walk((array as any)[key], seen, depth)) return false;
		return true;
	}
	if (proto === Object.prototype) {
		for (const key in value) if (!walk((value as any)[key], seen, depth)) return false;
		return true;
	}
	if (proto === Map.prototype) {
		for (const [key, item] of value as Map<unknown, unknown>)
			if (!walk(key, seen, depth) || !walk(item, seen, depth)) return false;
		return true;
	}
	if (proto === Set.prototype) {
		for (const item of value as Set<unknown>) if (!walk(item, seen, depth)) return false;
		return true;
	}
	return proto === Date.prototype || proto === RegExp.prototype || ArrayBuffer.isView(value);
}

/** Each partition's dedicated data worker, where the page has no SharedWorker. */
const dedicated = new Map<string, Worker>();

/** Serve an owner to every tab that connects: what the app's data worker module calls. */
export function serveDataOwner(options: Parameters<typeof createDataOwner>[0]): DataOwner {
	const owner = createDataOwner({
		...options,
		fence: options.fence === 'explicit' ? 'explicit' : true,
	});
	globalThis.addEventListener('connect', (event) =>
		owner.connect((event as MessageEvent).ports[0]!),
	);
	// As a dedicated worker, each replica's page sends its port in a message.
	globalThis.addEventListener('message', (event) => {
		const port = (event as MessageEvent).ports?.[0];
		if (port) owner.connect(port);
	});
	return owner;
}
