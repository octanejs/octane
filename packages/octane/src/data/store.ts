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
 * - Every optimistic edit is an absolute patch, an insert by ID or a delete by
 *   ID. Applying one to a value that already includes it changes nothing, so an
 *   edit can be replayed over any newer value without counting twice.
 */
import {
	DataError,
	parse,
	type DataReply,
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
	/** Name the outcome of an uncertain write, once a receipt lookup has established it. */
	settle(operationId: string, confirmed: boolean): void;
	/** End this grant: clear every value and refuse later calls and late replies. */
	retire(): void;
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
	readonly input: unknown;
	readonly entityId: string;
	readonly draft: unknown;
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

export function createDataStore(options: { transport: Transport }): DataStore {
	const { transport } = options;
	const entries = new Map<string, Entry>();
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
	function touch(entry: Entry): void {
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
			return;
		}
		entry.snapshot = next;
		for (const notify of [...entry.subscribers]) notify();
	}

	function touchEntities(): void {
		for (const entry of entries.values()) if (entry.read.entities) touch(entry);
	}

	/** Start the retention clock for an entry nothing observes. */
	function idle(entry: Entry): void {
		// A load in flight is demand: retention starts when it lands.
		if (entry.subscribers.size > 0 || entry.inflight || entry.keepTimer !== undefined) return;
		entry.keepTimer = setTimeout(() => {
			entry.keepTimer = undefined;
			clearTimeout(entry.expireTimer);
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

	function adopt(entry: Entry, value: unknown, startedSeq: number): void {
		entry.base = value;
		entry.hasBase = true;
		entry.names = new Set(selections(entry.read, value).map(({ entity }) => entity.name));
		entry.fetchedAt = Date.now();
		entry.baseSeq = startedSeq;
		entry.stale = false;
		entry.served = entry.subscribers.size > 0;
		entry.error = undefined;
		// A mounted reader must stop seeing the value at `expire`, not at its next change.
		clearTimeout(entry.expireTimer);
		if (entry.read.expire < 2 ** 31) {
			entry.expireTimer = setTimeout(() => {
				if (entry.subscribers.size > 0) invalidateEntry(entry);
				else touch(entry);
			}, entry.read.expire);
		}
		collect();
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
		const key = `${read.name}\n${inputKey(input)}`;
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
					assertLive();
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
					assertLive();
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
		idle(created);
		return created;
	}

	/** A confirmed write refreshes the reads it returned and marks the rest it affects stale. */
	function confirm(operation: Operation, reply?: DataReply & { ok: true }): void {
		operation.status = 'confirmed';
		operation.settledSeq = ++sequence;
		const refreshed = new Set<Entry>();
		for (const item of reply?.refreshed ?? []) {
			const entry = entries.get(`${item.name}\n${inputKey(item.input)}`);
			if (!entry) continue;
			refreshed.add(entry);
			// The refreshed value was read after the write, so it supersedes any load in flight.
			const attempt = ++entry.attempt;
			const startedSeq = ++sequence;
			entry.abort?.abort();
			entry.abort = null;
			entry.inflight = null;
			Promise.resolve()
				.then(() => parse(entry.read.output, item.value))
				.then(
					(value) => {
						if (retired || entry.attempt !== attempt) return;
						adopt(entry, value, startedSeq);
						touch(entry);
					},
					() => {
						if (!retired && entry.attempt === attempt) invalidateEntry(entry);
					},
				);
		}
		const tags = writeTags(operation.write);
		for (const entry of entries.values()) {
			// A first load of a read that selects entities has no value to compare yet and may
			// predate the write. Reads that select none are untouched unless a tag names them.
			const unknown = !entry.hasBase && operation.write.effect && entry.read.entities;
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
		const operation: Operation = {
			id,
			write,
			input,
			entityId: effect ? (effect.kind === 'create' ? id : effect.entity.id(input)) : '',
			draft:
				effect?.kind === 'create'
					? write.draft
						? write.draft(input, id)
						: { ...(input as object), id }
					: undefined,
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
			return request(
				{ kind: 'write', name: write.name, input: raw, operationId: id, refresh },
				new AbortController().signal,
			);
		};

		// Writes to one entity are sent in submission order, so the last edit wins on the server too.
		const queueKey = effect ? `${effect.entity.name}\n${operation.entityId}` : undefined;
		const previous = queueKey === undefined ? undefined : queues.get(queueKey);
		const sent = previous ? previous.then(dispatch, dispatch) : dispatch();
		if (queueKey !== undefined) {
			queues.set(queueKey, sent);
			const release = () => {
				if (queues.get(queueKey) === sent) queues.delete(queueKey);
			};
			sent.then(release, release);
		}

		return sent.then(
			(reply) => {
				if (retired) throw new DataRetiredError();
				if (!reply.ok) {
					remove(operation);
					throw new DataError(reply.code, reply.data, reply.issues);
				}
				confirm(operation, reply);
				return write.output ? parse(write.output, reply.value) : reply.value;
			},
			(error) => {
				if (retired) throw new DataRetiredError();
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
			assertLive();
			return entryFor(read, input).handle;
		},
		prefetch(read, input) {
			assertLive();
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
		settle(operationId, confirmed) {
			assertLive();
			const operation = operations.find((item) => item.id === operationId);
			if (operation?.status !== 'uncertain') return;
			if (confirmed) {
				confirm(operation);
			} else {
				remove(operation);
			}
		},
		retire() {
			if (retired) return;
			retired = true;
			operations = [];
			queues.clear();
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
