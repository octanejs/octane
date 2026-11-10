/**
 * The data store: one owner for confirmed server values and pending writes.
 * It has no renderer and no compiler, so Octane, React and a plain test all
 * drive the same object.
 *
 * Invariants:
 * - Describing or snapshotting a read does no network work. Subscribing,
 *   prefetching and refreshing start a load; readers of one entry share it.
 * - A write is sent once. A transport failure after dispatch leaves the write
 *   uncertain, with its edit still shown, until `settle` names the outcome.
 * - Only a reply for the entry's current attempt, in a store that has not been
 *   retired, can change confirmed state.
 * - Writes to a record its own create has not confirmed wait for that create.
 *   They are refused unsent if it is refused, and they carry the server's ID
 *   if the server assigned one.
 * - Every value one reply or commit carries is adopted before any reader is
 *   notified, so no render sees part of a server transaction.
 * - Every optimistic edit is an absolute patch, an insert by ID or a delete by
 *   ID. Applying one to a value that already includes it changes nothing, so an
 *   edit can be replayed over any newer value without counting twice.
 * - A seed from a server render is adopted when its read is first asked for,
 *   so hydration finds the server's value without waiting or loading. It keeps
 *   its age: freshness and expiry count from when the server loaded it.
 */
import * as devalue from 'devalue';
import {
	DataError,
	parse,
	type DataReply,
	type Entity,
	type DataRequest,
	type Read,
	type Transport,
	type Write,
} from './contracts.js';

export interface ReadSnapshot<T> {
	readonly status: 'pending' | 'ready' | 'error';
	/** The newest confirmed value with pending edits applied. */
	readonly value: T | undefined;
	readonly error: unknown;
	readonly refreshing: boolean;
	readonly stale: boolean;
}

export interface ReadHandle<T> {
	/** Stable between changes, so it can back `useSyncExternalStore`. */
	getSnapshot(): ReadSnapshot<T>;
	/** Observe the read. The first observer starts a load when the value is missing or stale. */
	subscribe(notify: () => void): () => void;
	refresh(): Promise<void>;
}

/** The write may have reached the server. Its edit stays visible until `settle`. */
export class DataUncertainError extends Error {
	readonly operationId: string;
	constructor(operationId: string, cause: unknown) {
		super('octane/data: the outcome of this write is unknown', { cause });
		this.name = 'DataUncertainError';
		this.operationId = operationId;
	}
}

/** The store belonged to a grant that has ended, such as a signed-out account. */
export class DataRetiredError extends Error {
	constructor() {
		super('octane/data: this store has been retired');
		this.name = 'DataRetiredError';
	}
}

export interface DataStore {
	readonly retired: boolean;
	read<I, O>(read: Read<I, O>, input: I): ReadHandle<O>;
	prefetch<I, O>(read: Read<I, O>, input: I): Promise<void>;
	write<I, O>(write: Write<I, O>, input: I): Promise<O>;
	/** Mark reads with one of these tags or entity names stale; observed ones reload. */
	invalidate(tags: readonly string[]): void;
	/**
	 * Name the outcome of an uncertain write, once a receipt lookup has
	 * established it. For a create whose server assigns IDs, pass the created
	 * record as `value`, or writes waiting on it are refused.
	 */
	settle(operationId: string, confirmed: boolean, value?: unknown): void;
	/**
	 * End this grant: clear every value and ignore late replies. Later writes,
	 * invalidations and settlements throw. Later reads stay pending without
	 * loading, so a render that still holds this store, such as a React island
	 * that has not yet received its replacement, shows nothing instead of failing.
	 */
	retire(): void;
	/**
	 * The confirmed values loaded so far, for a client store to start from.
	 * The text is safe inside `<script type="application/json">`. On a server,
	 * call it once the render is complete, then `retire()` the request's store.
	 */
	dehydrate(): string;
}

export interface DataStoreOptions {
	readonly transport: Transport;
	/** A server store's `dehydrate()` output. */
	readonly seed?: string | null | undefined;
}

interface SeedEntry {
	readonly name: string;
	readonly input: unknown;
	readonly value: unknown;
	/** Milliseconds since the server loaded the value; clocks are not compared. */
	readonly age: number;
}

interface Entry {
	readonly read: Read<any, any>;
	readonly input: unknown;
	readonly key: string;
	readonly subscribers: Set<() => void>;
	readonly handle: ReadHandle<any>;
	base: unknown;
	hasBase: boolean;
	/** Entity names the confirmed value selects. */
	names: Set<string>;
	fetchedAt: number;
	/** Store sequence when the load that produced `base` started. */
	baseSeq: number;
	error: unknown;
	stale: boolean;
	/** Whether an observer has seen `base`. A value loaded for a reader that had not mounted yet is not reloaded when it mounts. */
	served: boolean;
	attempt: number;
	inflight: Promise<void> | null;
	abort: AbortController | null;
	keepTimer: ReturnType<typeof setTimeout> | undefined;
	expireTimer: ReturnType<typeof setTimeout> | undefined;
	snapshot: ReadSnapshot<any> | null;
}

interface Operation {
	readonly id: string;
	readonly write: Write<any, any>;
	/** The validated input the optimistic edit uses. */
	input: unknown;
	/** What the caller passed, which is what the server validates. */
	raw: unknown;
	entityId: string;
	draft: unknown;
	/** A create's hold on later writes to its record; settles when the create does. */
	gate: { promise: Promise<void>; resolve(): void; reject(error: unknown): void } | null;
	status: 'pending' | 'uncertain' | 'confirmed';
	/** Store sequence when the write was confirmed; values loaded later include it. */
	settledSeq: number;
}

const PENDING: ReadSnapshot<any> = {
	status: 'pending',
	value: undefined,
	error: undefined,
	refreshing: false,
	stale: false,
};

/** What a retired store's reads wait on: nothing will arrive. */
const NEVER = new Promise<void>(() => {});
const RETIRED_HANDLE: ReadHandle<any> = {
	getSnapshot: () => PENDING,
	subscribe: () => () => {},
	refresh: () => NEVER,
};

/** A server-side cap also applies; this bounds what one write asks for. */
const MAX_REFRESH = 8;

/** A stable key for plain input: object keys sorted, so `{a,b}` and `{b,a}` share an entry. */
function inputKey(value: unknown): string {
	return JSON.stringify(value, (_, item) =>
		item !== null && typeof item === 'object' && !Array.isArray(item)
			? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
			: item,
	);
}

/** `value` with its entity ID changed from `from` to `to`, copied; other values unchanged. */
function renameId(entity: Entity<any>, value: unknown, from: string, to: string): unknown {
	return value !== null && typeof value === 'object' && (value as any)[entity.key] === from
		? { ...value, [entity.key]: to }
		: value;
}

function entryKey(name: string, input: unknown): string {
	return `${name}\n${inputKey(input)}`;
}

/** Copy-on-write replacement of the arrays and objects named in `replace`. */
function rewrite(value: unknown, replace: Map<unknown, unknown>): unknown {
	if (replace.has(value)) return replace.get(value);
	if (value === null || typeof value !== 'object') return value;
	const array = Array.isArray(value);
	const prototype = Object.getPrototypeOf(value);
	if (!array && prototype !== Object.prototype && prototype !== null) return value;
	let copy: any;
	for (const key of Object.keys(value)) {
		const item = (value as any)[key];
		const next = rewrite(item, replace);
		if (next !== item) (copy ??= array ? (value as unknown[]).slice() : { ...value })[key] = next;
	}
	return copy ?? value;
}

function selections(read: Read<any, any>, value: unknown) {
	const selected = read.entities ? read.entities(value) : [];
	return Array.isArray(selected) ? selected : [selected];
}

export function createDataStore(options: DataStoreOptions): DataStore {
	const { transport } = options;
	const entries = new Map<string, Entry>();
	const seeds = new Map<string, SeedEntry>();
	/** Created records' operation IDs, by entity, mapped to the IDs their servers assigned. */
	const assigned = new Map<string, string>();
	if (options.seed) {
		for (const seed of devalue.parse(options.seed) as SeedEntry[]) {
			seeds.set(entryKey(seed.name, seed.input), seed);
		}
	}
	const queues = new Map<string, Promise<unknown>>();
	let operations: Operation[] = [];
	let sequence = 0;
	let retired = false;

	function assertLive(): void {
		if (retired) throw new DataRetiredError();
	}

	function shows(operation: Operation, entry: Entry): boolean {
		return operation.status !== 'confirmed' || entry.baseSeq < operation.settledSeq;
	}

	/** The confirmed value with every outstanding edit applied, in submission order. */
	function project(entry: Entry): unknown {
		if (operations.length === 0 || !entry.read.entities) return entry.base;
		const replace = new Map<unknown, unknown>();
		for (const { entity, source } of selections(entry.read, entry.base)) {
			const list = Array.isArray(source);
			let items: unknown[] = list ? source : [source];
			for (const operation of operations) {
				const { effect } = operation.write;
				if (effect?.entity.name !== entity.name || !shows(operation, entry)) continue;
				const index = items.findIndex((item) => entity.id(item) === operation.entityId);
				if (effect.kind === 'patch') {
					if (index < 0) continue;
					items = items.slice();
					items[index] = { ...(items[index] as object), ...(operation.input as object) };
				} else if (effect.kind === 'remove') {
					// A single selected item stays until the reload: the read's output has
					// no shape for "absent", so removing it could not satisfy its schema.
					if (index >= 0 && list) items = items.filter((_, at) => at !== index);
				} else if (index < 0 && list) {
					items = [...items, operation.draft];
				}
			}
			if (list ? items !== source : items[0] !== source)
				replace.set(source, list ? items : items[0]);
		}
		return replace.size === 0 ? entry.base : rewrite(entry.base, replace);
	}

	function isStale(entry: Entry): boolean {
		return entry.stale || Date.now() - entry.fetchedAt >= entry.read.fresh;
	}

	function buildSnapshot(entry: Entry): ReadSnapshot<any> {
		const usable = entry.hasBase && Date.now() - entry.fetchedAt < entry.read.expire;
		return {
			status: usable ? 'ready' : entry.error === undefined ? 'pending' : 'error',
			value: usable ? project(entry) : undefined,
			error: entry.error,
			refreshing: usable && entry.inflight !== null,
			stale: usable && isStale(entry),
		};
	}

	/** Recompute an entry's snapshot and notify its observers only when it changed. */
	/**
	 * Recompute snapshots, then notify the readers of those that changed. Every
	 * snapshot is current before any reader runs, so a reader of one view never
	 * sees another mid-change.
	 */
	function commit(changed: Iterable<Entry>): void {
		const notify: Entry[] = [];
		for (const entry of changed) {
			const previous = entry.snapshot;
			const next = buildSnapshot(entry);
			if (
				previous !== null &&
				previous.status === next.status &&
				previous.value === next.value &&
				previous.error === next.error &&
				previous.refreshing === next.refreshing &&
				previous.stale === next.stale
			) {
				continue;
			}
			entry.snapshot = next;
			notify.push(entry);
		}
		for (const entry of notify) for (const reader of [...entry.subscribers]) reader();
	}

	function touch(entry: Entry): void {
		commit([entry]);
	}

	function touchEntities(): void {
		commit([...entries.values()].filter((entry) => entry.read.entities));
	}

	/** Drop the confirmed value, so every later reader loads a new one. */
	function forget(entry: Entry): void {
		clearTimeout(entry.expireTimer);
		entry.base = undefined;
		entry.hasBase = false;
		entry.names = new Set();
		entry.snapshot = null;
	}

	/** Start the retention clock for an entry nothing observes. */
	function idle(entry: Entry): void {
		// A load in flight is demand: retention starts when it lands.
		if (entry.subscribers.size > 0 || entry.inflight || entry.keepTimer !== undefined) return;
		entry.keepTimer = setTimeout(() => {
			entry.keepTimer = undefined;
			// A handle outlives its entry; an evicted one must not show what it once held.
			forget(entry);
			entries.delete(entry.key);
			collect();
		}, entry.read.keep);
	}

	/** Drop confirmed edits that every remaining value already includes. */
	function collect(): void {
		operations = operations.filter((operation) => {
			if (operation.status !== 'confirmed') return true;
			const name = operation.write.effect!.entity.name;
			for (const entry of entries.values()) {
				if (entry.hasBase && entry.names.has(name) && shows(operation, entry)) return true;
			}
			return false;
		});
	}

	function adopt(entry: Entry, value: unknown, startedSeq: number, age = 0): void {
		entry.base = value;
		entry.hasBase = true;
		entry.names = new Set(selections(entry.read, value).map(({ entity }) => entity.name));
		entry.fetchedAt = Date.now() - age;
		entry.baseSeq = startedSeq;
		entry.stale = false;
		entry.served = entry.subscribers.size > 0;
		entry.error = undefined;
		// A mounted reader must stop seeing the value at `expire`, not at its next change.
		clearTimeout(entry.expireTimer);
		if (entry.read.expire < 2 ** 31) {
			entry.expireTimer = setTimeout(() => {
				forget(entry);
				if (entry.subscribers.size > 0) void load(entry);
				touch(entry);
			}, entry.read.expire - age);
		}
		collect();
	}

	/**
	 * Start an entry from the server's value. Hydration is synchronous, so a
	 * validator that answers asynchronously, or rejects, leaves an ordinary load.
	 */
	function adoptSeed(entry: Entry): void {
		const seed = seeds.get(entry.key);
		if (!seed) return;
		seeds.delete(entry.key);
		if (seed.age >= entry.read.expire) return;
		let value: unknown;
		try {
			value = parse(entry.read.output, seed.value);
		} catch {
			return;
		}
		if (!(value instanceof Promise)) adopt(entry, value, 0, seed.age);
	}

	/** A transport that throws synchronously still reports through the promise. */
	async function request(payload: DataRequest, signal: AbortSignal): Promise<DataReply> {
		return transport(payload, signal);
	}

	function load(entry: Entry): Promise<void> {
		if (entry.inflight) return entry.inflight;
		const attempt = ++entry.attempt;
		const startedSeq = ++sequence;
		const abort = (entry.abort = new AbortController());
		const { read } = entry;
		clearTimeout(entry.keepTimer);
		entry.keepTimer = undefined;
		const current = () => !retired && entry.attempt === attempt;
		const done = request({ kind: 'read', name: read.name, input: entry.input }, abort.signal)
			.then((reply) => {
				if (!reply.ok) throw new DataError(reply.code, reply.data, reply.issues);
				return parse(read.output, reply.value);
			})
			.then(
				(value) => {
					if (current()) adopt(entry, value, startedSeq);
				},
				(error) => {
					if (current()) entry.error = error;
				},
			)
			.then(() => {
				if (!current()) return;
				entry.inflight = null;
				entry.abort = null;
				touch(entry);
				idle(entry);
			});
		entry.inflight = done;
		touch(entry);
		return done;
	}

	/** Discard any load in flight, since it may predate the change, and reload if observed. */
	function invalidateEntry(entry: Entry): void {
		entry.stale = true;
		entry.attempt++;
		entry.abort?.abort();
		entry.abort = null;
		entry.inflight = null;
		if (entry.subscribers.size > 0) {
			void load(entry);
		} else {
			touch(entry);
			idle(entry);
		}
	}

	function affects(entry: Entry, tags: readonly string[]): boolean {
		return tags.some((tag) => entry.read.tags.includes(tag) || entry.names.has(tag));
	}

	function writeTags(write: Write<any, any>): readonly string[] {
		return write.effect ? [...write.invalidates, write.effect.entity.name] : write.invalidates;
	}

	function entryFor(read: Read<any, any>, input: unknown): Entry {
		const key = entryKey(read.name, input);
		let entry = entries.get(key);
		if (entry) return entry;
		const created: Entry = {
			read,
			input,
			key,
			subscribers: new Set(),
			handle: {
				getSnapshot: () => (retired ? PENDING : (created.snapshot ??= buildSnapshot(created))),
				subscribe(notify) {
					if (retired) return () => {};
					// A handle outlives its entry's retention; observing it again restores the entry.
					if (!entries.has(key)) entries.set(key, created);
					clearTimeout(created.keepTimer);
					created.keepTimer = undefined;
					// Age reloads a value only for the first observer of a value already served.
					const aged = created.subscribers.size === 0 && created.served && isStale(created);
					created.subscribers.add(notify);
					created.served = true;
					if (!created.hasBase || created.stale || aged) void load(created);
					return () => {
						created.subscribers.delete(notify);
						if (!retired) idle(created);
					};
				},
				refresh() {
					if (retired) return NEVER;
					invalidateEntry(created);
					return load(created);
				},
			},
			base: undefined,
			hasBase: false,
			names: new Set(),
			fetchedAt: 0,
			baseSeq: 0,
			error: undefined,
			stale: false,
			served: false,
			attempt: 0,
			inflight: null,
			abort: null,
			keepTimer: undefined,
			expireTimer: undefined,
			snapshot: null,
		};
		entries.set(key, created);
		adoptSeed(created);
		idle(created);
		return created;
	}

	/** Move every edit to a created record from its operation ID to the server's ID. */
	/**
	 * Move every edit to a created record from its operation ID to the server's
	 * ID. Writes already queued keep their order: the record's queue moves to the
	 * new key, and a later write that still names the operation ID is rewritten.
	 */
	function assignId(operation: Operation, serverId: string): void {
		const { entity } = operation.write.effect!;
		const local = operation.entityId;
		const localKey = `${entity.name}\n${local}`;
		const serverKey = `${entity.name}\n${serverId}`;
		assigned.set(localKey, serverId);
		for (const item of operations) {
			if (item.write.effect?.entity.name !== entity.name || item.entityId !== local) continue;
			item.entityId = serverId;
			item.input = renameId(entity, item.input, local, serverId);
			item.raw = renameId(entity, item.raw, local, serverId);
			item.draft = renameId(entity, item.draft, local, serverId);
		}
		const tail = queues.get(localKey);
		if (tail && !queues.has(serverKey)) {
			queues.set(serverKey, tail);
			const release = () => {
				if (queues.get(serverKey) === tail) queues.delete(serverKey);
			};
			tail.then(release, release);
		}
	}

	/** A confirmed write refreshes the reads it returned and marks the rest it affects stale. */
	function confirm(operation: Operation, reply?: DataReply & { ok: true }, output?: unknown): void {
		const { write } = operation;
		if (write.effect?.kind === 'create' && write.serverId) {
			if (output === undefined) {
				operation.gate?.reject(new DataError('dependency'));
			} else {
				assignId(operation, write.serverId(output));
			}
		}
		operation.status = 'confirmed';
		operation.settledSeq = ++sequence;
		operation.gate?.resolve();
		const refreshed = new Set<Entry>();
		const pending: Promise<() => Entry | undefined>[] = [];
		for (const item of reply?.refreshed ?? []) {
			const entry = entries.get(entryKey(item.name, item.input));
			if (!entry) continue;
			refreshed.add(entry);
			// The refreshed value was read after the write, so it supersedes any load in flight.
			const attempt = ++entry.attempt;
			const startedSeq = ++sequence;
			entry.abort?.abort();
			entry.abort = null;
			entry.inflight = null;
			const current = () => !retired && entry.attempt === attempt;
			pending.push(
				Promise.resolve()
					.then(() => parse(entry.read.output, item.value))
					.then(
						(value) => () => {
							if (!current()) return undefined;
							adopt(entry, value, startedSeq);
							return entry;
						},
						() => () => {
							if (current()) invalidateEntry(entry);
							return undefined;
						},
					),
			);
		}
		// One reply is one server transaction: adopt every value, then notify.
		if (pending.length > 0) {
			void Promise.all(pending).then((commits) => {
				const adopted = commits.map((adopt) => adopt());
				commit(adopted.filter((entry): entry is Entry => entry !== undefined));
			});
		}
		const tags = writeTags(operation.write);
		for (const entry of entries.values()) {
			// A first load of a read that selects entities has no value yet to say which ones,
			// and may predate the write. Reads that select none are untouched unless a tag names them.
			const unknown = !entry.hasBase && entry.read.entities && tags.length > 0;
			if (!refreshed.has(entry) && (unknown || affects(entry, tags))) invalidateEntry(entry);
		}
		if (!operation.write.effect) operations = operations.filter((item) => item !== operation);
		collect();
	}

	function remove(operation: Operation): void {
		operations = operations.filter((item) => item !== operation);
		touchEntities();
	}

	/**
	 * `input` is the validated value the optimistic edit uses. `raw` is what the caller
	 * passed, and it is what crosses the wire: the server validates again, and a schema
	 * that transforms its input would refuse its own output.
	 */
	function send(write: Write<any, any>, input: unknown, raw: unknown): Promise<any> {
		const id = crypto.randomUUID();
		const { effect } = write;
		const creates = effect?.kind === 'create';
		let entityId = effect ? (creates ? id : effect.entity.id(input)) : '';
		const serverId =
			effect && !creates ? assigned.get(`${effect.entity.name}\n${entityId}`) : undefined;
		if (serverId !== undefined) {
			// The caller still holds the operation ID of a record the server has since named.
			input = renameId(effect!.entity, input, entityId, serverId);
			raw = renameId(effect!.entity, raw, entityId, serverId);
			entityId = serverId;
		}
		const operation: Operation = {
			id,
			write,
			input,
			raw,
			entityId,
			draft: creates
				? write.draft
					? write.draft(input, id)
					: { ...(input as object), [effect!.entity.key]: id }
				: undefined,
			gate: null,
			status: 'pending',
			settledSeq: 0,
		};
		operations.push(operation);
		if (effect) touchEntities();

		const dispatch = () => {
			const tags = writeTags(write);
			const refresh: { name: string; input: unknown }[] = [];
			for (const entry of entries.values()) {
				if (refresh.length === MAX_REFRESH) break;
				if (entry.subscribers.size > 0 && affects(entry, tags)) {
					refresh.push({ name: entry.read.name, input: entry.input });
				}
			}
			// Read at send time: a server-assigned ID may have replaced the operation ID.
			return request(
				{ kind: 'write', name: write.name, input: operation.raw, operationId: id, refresh },
				new AbortController().signal,
			);
		};

		// Writes to one entity are sent in submission order, so the last edit wins on the
		// server too. After a write that failed to arrive, the next is still sent; after a
		// refused create, writes to its record are refused unsent.
		const queueKey = effect ? `${effect.entity.name}\n${operation.entityId}` : undefined;
		const previous = queueKey === undefined ? undefined : queues.get(queueKey);
		const sent = previous
			? previous.then(dispatch, (error) => {
					if (retired || error instanceof DataError) throw error;
					return dispatch();
				})
			: dispatch();
		if (queueKey !== undefined) {
			// A create holds its record's queue until its outcome is known, even if uncertain.
			let held: Promise<unknown> = sent;
			if (creates) {
				let resolve!: () => void;
				let reject!: (error: unknown) => void;
				const promise = new Promise<void>((done, fail) => {
					resolve = done;
					reject = fail;
				});
				promise.catch(() => {});
				operation.gate = { promise, resolve, reject };
				held = promise;
			}
			queues.set(queueKey, held);
			const release = () => {
				if (queues.get(queueKey) === held) queues.delete(queueKey);
			};
			held.then(release, release);
		}

		return sent.then(
			async (reply) => {
				if (retired) throw new DataRetiredError();
				if (!reply.ok) {
					remove(operation);
					operation.gate?.reject(new DataError('dependency'));
					throw new DataError(reply.code, reply.data, reply.issues);
				}
				let output: unknown;
				try {
					output = write.output ? await parse(write.output, reply.value) : reply.value;
				} catch (error) {
					// The server applied the write; only its reply is unreadable.
					if (!retired) confirm(operation, reply);
					throw error;
				}
				if (retired) throw new DataRetiredError();
				confirm(operation, reply, output);
				if (write.serverId) touchEntities();
				return output;
			},
			(error) => {
				if (retired) throw new DataRetiredError();
				if (error instanceof DataError) {
					// A create this write depended on was refused; it was never sent.
					remove(operation);
					operation.gate?.reject(error);
					throw error;
				}
				operation.status = 'uncertain';
				throw new DataUncertainError(id, error);
			},
		);
	}

	return {
		get retired() {
			return retired;
		},
		read(read, input) {
			return retired ? RETIRED_HANDLE : entryFor(read, input).handle;
		},
		prefetch(read, input) {
			if (retired) return NEVER;
			const entry = entryFor(read, input);
			return entry.hasBase && !isStale(entry) ? Promise.resolve() : load(entry);
		},
		write(write, input) {
			assertLive();
			let parsed: unknown;
			try {
				parsed = parse(write.input, input);
			} catch (error) {
				return Promise.reject(error);
			}
			// A synchronous validator keeps the optimistic edit in the caller's task.
			return parsed instanceof Promise
				? parsed.then((value) => {
						assertLive();
						return send(write, value, input);
					})
				: send(write, parsed, input);
		},
		invalidate(tags) {
			assertLive();
			for (const entry of entries.values()) if (affects(entry, tags)) invalidateEntry(entry);
		},
		settle(operationId, confirmed, value) {
			assertLive();
			const operation = operations.find((item) => item.id === operationId);
			if (operation?.status !== 'uncertain') return;
			if (confirmed) {
				confirm(operation, undefined, value);
				touchEntities();
			} else {
				remove(operation);
				operation.gate?.reject(new DataError('dependency'));
			}
		},
		dehydrate() {
			const now = Date.now();
			const seed: SeedEntry[] = [];
			for (const entry of entries.values()) {
				const age = now - entry.fetchedAt;
				if (!entry.hasBase || age >= entry.read.expire) continue;
				seed.push({ name: entry.read.name, input: entry.input, value: entry.base, age });
			}
			// devalue escapes `<`, so the text cannot close the script element holding it.
			return devalue.stringify(seed);
		},
		retire() {
			if (retired) return;
			retired = true;
			// Writes waiting on a create must settle too, or they would never end.
			for (const operation of operations) operation.gate?.reject(new DataRetiredError());
			operations = [];
			queues.clear();
			assigned.clear();
			seeds.clear();
			for (const entry of entries.values()) {
				entry.abort?.abort();
				clearTimeout(entry.keepTimer);
				clearTimeout(entry.expireTimer);
				entry.snapshot = null;
				for (const notify of [...entry.subscribers]) notify();
			}
			entries.clear();
		},
	};
}
