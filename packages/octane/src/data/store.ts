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
 * - A view's records are shared: one table per entity holds the newest
 *   confirmed copy of each record any view has loaded, and every view of the
 *   entity is evaluated over that table with outstanding edits applied.
 * - A read only the server can order keeps the order and membership it was
 *   sent, but shares records with the views: its load gives them any newer
 *   copy, and it shows any copy newer than its own load.
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
	type Feed,
	type Listener,
	type Read,
	type Transport,
	type View,
	type ViewWindow,
	type Write,
} from './contracts.js';
import {
	createFormHandle,
	IDLE,
	NO_FORM_SEED,
	rejectSubmission,
	type FormHandle,
	type FormSeed,
} from './form.js';
import {
	createPersistence,
	type Persistence,
	type PersistOptions,
	type Stored,
} from './persist.js';
import { setHostTimeout, clearHostTimeout, hostDateNow, hostNow } from '../host-task.js';

export interface ReadSnapshot<T> {
	readonly status: 'pending' | 'ready' | 'error';
	/** The newest confirmed value with pending edits applied. */
	readonly value: T | undefined;
	readonly error: unknown;
	readonly refreshing: boolean;
	readonly stale: boolean;
	/**
	 * For a view, whether the list goes on past the rows shown, so a later
	 * window has rows. Always false for any other read.
	 */
	readonly more: boolean;
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

/** The prerequisite create was refused, so this queued edit never reached the transport. */
class DependencyError extends DataError {
	constructor() {
		super('dependency');
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
	/** A form for a write that declares `form` fields; `key` separates instances, such as rows. */
	form<I, O>(write: Write<I, O>, key?: string): FormHandle<I, O>;
	/** Mark reads with one of these tags or entity names stale; observed ones reload. */
	invalidate(tags: readonly string[]): void;
	/**
	 * Name the outcome of an uncertain write, once a receipt lookup has
	 * established it. For a create whose server assigns IDs, pass the created
	 * record as `value`, or writes waiting on it are refused.
	 */
	settle(operationId: string, confirmed: boolean, value?: unknown): void;
	/**
	 * Take a confirmed value for a read from elsewhere, such as the app's own
	 * live subscription, as if a load had returned it: validated, shared with
	 * other reads of its records, saved, with pending edits still on top. It
	 * supersedes any load, restore or publish started before it. A view needs
	 * the window it was fetched for, so it cannot be published.
	 */
	publish<I, O>(read: Read<I, O>, input: I, value: unknown): Promise<void>;
	/**
	 * Erase one read's confirmed value, in memory and in persistent storage,
	 * and supersede any load or restore in flight. Observers see it pending; it
	 * loads again only when asked. Rejects when storage fails.
	 */
	forget<I, O>(read: Read<I, O>, input: I): Promise<void>;
	/**
	 * End this grant: clear every value and ignore late replies. Later writes,
	 * invalidations and settlements throw. Later reads stay pending without
	 * loading, so a render that still holds this store, such as a React island
	 * that has not yet received its replacement, shows nothing instead of failing.
	 * Memory is cleared at once; the returned promise settles once persistent
	 * storage is cleared, and every call returns the same one.
	 */
	retire(): Promise<void>;
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
	/** Elapsed milliseconds between writing the seed and opening this store, when known. */
	readonly seedAge?: number | undefined;
	/** On a server, the request's `forms(request).form`; `dehydrate()` carries it to the browser. */
	readonly form?: FormSeed | undefined;
	/**
	 * Save confirmed values to persistent storage, and start reads from them
	 * after a restart. Reads with `persist: false` are left out.
	 */
	readonly persist?: PersistOptions | undefined;
	/** Where feeds connect; `listen(store, feed)` needs one. */
	readonly listen?: Listener | undefined;
	/**
	 * Feeds the page listens to. A store with no `listen`, a server render's,
	 * asks each for its position before its first read, and its seed carries
	 * them, so the browser's feed resumes from before the page's values loaded.
	 */
	readonly feeds?: ReadonlyArray<Feed<void, any>> | undefined;
}

/**
 * @internal What `listen` and `receive` in feeds.ts need of a store. Only they
 * read it, so an app that uses no feed ships none of their code.
 */
export interface StoreInternals {
	readonly listen: Listener | undefined;
	/** Aborts when the store retires. */
	readonly retired: AbortSignal;
	/** Where feeds save their cursors, when the store persists. */
	readonly persisted: Persistence | null;
	/** Each feed's position when the server render that seeded this store began. */
	readonly seeded: ReadonlyMap<string, string>;
	readonly entries: ReadonlyMap<string, Entry>;
	/** Whether a view holds the record `id`, or would show `value` or move its rows for it. */
	viewed(entity: Entity<any>, id: string, value?: unknown): boolean;
	/** Take a record into the views, newer than every load already started; `null` removes it. */
	record(entity: Entity<any>, id: string, value: unknown, reload: Set<Entry>): void;
	/** Give a read a new confirmed value; `edited` keeps its load's age and sequence, for a value changed in part. */
	rebase(entry: Entry, value: unknown, edited: boolean, reload: Set<Entry>): void;
	/** Reload `reload`, then notify the readers of `changed` and of every read showing a record of `names`. */
	finish(reload: Set<Entry>, changed: readonly Entry[], names: ReadonlySet<string>): void;
}

/** @internal */
export const internals = new WeakMap<DataStore, StoreInternals>();

interface SeedEntry {
	readonly name: string;
	readonly input: unknown;
	readonly value: unknown;
	/** Milliseconds since the value loaded, measured when the seed was written. */
	readonly age: number;
	readonly stale?: boolean;
	readonly span?: Pick<Span, 'start' | 'first' | 'last'> | undefined;
}

/**
 * The part of a view's full order an entry holds: every record from `first` to
 * `last` in that order, where `first` sits at position `start`. A null `last`
 * means the window reaches the end of the list; `first` is null only at the top.
 */
interface Span {
	readonly start: number;
	readonly first: unknown;
	readonly last: unknown;
	/** Whether a short span has already been reloaded once, so a list that shrank cannot loop. */
	reloaded: boolean;
	/** Whether the view's last evaluation found rows past its window, or the span goes on past its rows. */
	more: boolean;
	/**
	 * The view's index into the shared records: every confirmed record within
	 * the span, by ID. Evaluating the view reads these and the records pending
	 * edits touch, never the whole table.
	 */
	readonly rows: Map<string, unknown>;
}

interface StoredRecord {
	readonly value: unknown;
	/** Store sequence of the load or write that produced the value. */
	readonly seq: number;
}

/** @internal */
export interface Entry {
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
	keepTimer: unknown | undefined;
	expireTimer: unknown | undefined;
	snapshot: ReadSnapshot<any> | null;
	/** A view entry's span; null for a read and for a view with no value. */
	span: Span | null;
	/** Whether persistent storage has been asked for this entry's value. */
	checkedStorage: boolean;
	/** The last projection of a read's value, so an unchanged one keeps its identity. */
	projected: { base: unknown; parts: Map<unknown, unknown>; value: unknown } | null;
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
	more: false,
};

/** What a retired store's reads wait on: nothing will arrive. */
const NEVER = new Promise<void>(() => {});
const RETIRED_HANDLE: ReadHandle<any> = {
	getSnapshot: () => PENDING,
	subscribe: () => () => {},
	refresh: () => NEVER,
};

const RETIRED_FORM: FormHandle<any, never> = {
	getSnapshot: () => IDLE,
	subscribe: () => () => {},
	hidden: () => [],
	submit: (source) => rejectSubmission(source, new DataRetiredError()),
};

/** A server-side cap also applies; this bounds what one write asks for. */
const MAX_REFRESH = 8;

/** Rows a view loads either side of what it shows, so small moves need no reload. */
const MARGIN = 20;

const EMPTY: readonly unknown[] = [];
const NO_VIEWS: ReadonlySet<never> = new Set();

const isView = (read: Read<any, any>): read is View<any, any> => 'view' in read;

/** The window a view entry shows, from its input. */
function shown(entry: Entry): { offset: number; limit: number } {
	const window = (entry.input ?? {}) as ViewWindow;
	return {
		offset: window.offset ?? 0,
		limit: window.limit ?? (entry.read as View<any, any>).view.limit,
	};
}

/**
 * What a load asks the server for. A view asks for its window plus a margin
 * either side, and one row more, which says whether the list ends inside it.
 */
function wireInput(entry: Entry): unknown {
	if (!isView(entry.read)) return entry.input;
	const { offset, limit } = shown(entry);
	// The margins give way to the view's cap; the window itself never does, so the server refuses it.
	const start = Math.max(0, offset - Math.min(MARGIN, Math.max(0, entry.read.view.max - limit)));
	const asked = offset - start + limit;
	const count = Math.max(asked, Math.min(entry.read.view.max, asked + MARGIN + 1));
	return { ...(entry.input as object), offset: start, limit: count };
}

/** Whether two rows show the same fields, so an unchanged view keeps its array. */
function sameRow(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => Object.is((a as any)[key], (b as any)[key]));
}

/** Compare confirmed read outputs only when a bundled refresh and a newer full value raced. */
function sameWireValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	try {
		return devalue.stringify(a) === devalue.stringify(b);
	} catch {
		// A custom transport can return objects the wire codec cannot represent.
		return false;
	}
}

/** Canonicalize object field order while retaining the types and references used on the wire. */
const keyEncoding: NonNullable<Parameters<typeof devalue.stringify>[2]> = {
	operations: {
		shapeOf(value) {
			const shape = devalue.defaultStringifyOperations.shapeOf(value);
			if (shape.kind === 'plain' || shape.kind === 'null-proto') shape.keys.sort();
			return shape;
		},
	},
};

/** `value` with its entity ID changed from `from` to `to`, copied; other values unchanged. */
function renameId(entity: Entity<any>, value: unknown, from: string, to: string): unknown {
	return value !== null && typeof value === 'object' && (value as any)[entity.key] === from
		? { ...value, [entity.key]: to }
		: value;
}

/** @internal Reads and feed cursors use the same key format. A new cursor cannot cover old cached reads. */
export function entryKey(name: string, input: unknown): string {
	const encoded =
		input === undefined ? 'undefined' : devalue.stringify(input, undefined, keyEncoding);
	return `${name}\nwire:${encoded}`;
}

/** @internal Keep the SSR seed format readable across client and server releases. Server feeds take no parameters. */
export function seedCursorKey(feedName: string): string {
	return feedName + '\nundefined';
}

/** @internal Copy-on-write replacement of the arrays and objects named in `replace`. */
export function rewrite(value: unknown, replace: Map<unknown, unknown>): unknown {
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

/** @internal */
export function selections(read: Read<any, any>, value: unknown) {
	const selected = read.entities ? read.entities(value) : [];
	return Array.isArray(selected) ? selected : [selected];
}

export function createDataStore(options: DataStoreOptions): DataStore {
	const { transport } = options;
	const entries = new Map<string, Entry>();
	const seeds = new Map<string, SeedEntry>();
	let seedsStale = false;
	/** Created records' operation IDs, by entity, mapped to the IDs their servers assigned. */
	const assigned = new Map<string, string>();
	const parsed = options.seed
		? (devalue.parse(options.seed) as {
				reads: SeedEntry[];
				form: FormSeed;
				cursors?: Array<[string, string]>;
			})
		: null;
	const seedAge = options.seedAge ?? 0;
	if (!Number.isFinite(seedAge) || seedAge < 0) throw new RangeError('Invalid seed age');
	const seedTime = parsed ? hostNow() : 0;
	for (const seed of parsed?.reads ?? []) seeds.set(entryKey(seed.name, seed.input), seed);
	const formSeed = options.form ?? parsed?.form ?? NO_FORM_SEED;
	/** A refused submission's outcome goes to the first form that matches it, once. */
	let formOutcome = formSeed;
	const forms = new Map<string, FormHandle<any, any>>();
	const queues = new Map<string, Promise<unknown>>();
	/** Confirmed records that views have loaded, by entity name and then ID. */
	const records = new Map<string, Map<string, StoredRecord>>();
	/** The entries holding a view's span, by entity name. */
	const views = new Map<string, Set<Entry>>();
	let operations: Operation[] = [];
	let sequence = 0;
	let retired = false;
	const retiring = new AbortController();
	/** The feeds' positions a server render took before its first read, for its seed. */
	const cursors: Array<[string, string]> = [];
	const positions =
		options.feeds?.length && !options.listen && !options.seed
			? Promise.all(
					options.feeds.map((feed) =>
						Promise.resolve()
							.then(() => {
								// Position probes bypass request(), which waits on these probes itself.
								assertLive();
								return transport(
									{ kind: 'position', name: feed.name, input: undefined },
									// A retired render, cancelled or failed, stops asking.
									retiring.signal,
								);
							})
							.then(
								(reply) => {
									if (reply.ok && typeof reply.value === 'string') {
										cursors.push([seedCursorKey(feed.name), reply.value]);
									}
								},
								// Without a position the browser's feed starts from its connection.
								() => {},
							),
					),
				)
			: null;
	let retirement: Promise<void> | null = null;
	const persisted = options.persist
		? createPersistence(options.persist, saving, (key) => !!entries.get(key)?.subscribers.size)
		: null;
	const durable = new Set(options.persist?.journal?.writes);
	if (options.persist?.journal) void recover(options.persist.journal);

	/** What persistent storage keeps for an entry: its confirmed value, never a pending edit. */
	function saving(key: string) {
		const entry = entries.get(key);
		// A direct read replacement may have no invalidation tags. After eviction its older
		// copy has to be deleted before a cursor can advance past the missing replacement.
		if (!entry) return null;
		if (!entry.read.persist) return undefined;
		if (!entry.hasBase) return null;
		const { span } = entry;
		const stored: Stored = {
			value: span ? confirmedRows(entry) : entry.base,
			savedAt: entry.fetchedAt,
			stale: entry.stale,
			span: span && { start: span.start, first: span.first, last: span.last },
			tags: [...entry.read.tags, ...entry.names],
		};
		return { stored, read: entry.read };
	}

	/** Save an entry once its confirmed value changes; a view's change is every view's of its entity. */
	function save(entry: Entry): void {
		if (!persisted) return;
		if (!isView(entry.read)) persisted.mark(entry.key);
		else for (const view of viewEntries(entry.read.view.of.name)) persisted.mark(view.key);
	}

	/** The confirmed records within a view's span, in its order. */
	function confirmedRows(entry: Entry): unknown[] {
		return [...entry.span!.rows.values()].sort((entry.read as View<any, any>).view.compare);
	}

	function assertLive(): void {
		if (retired) throw new DataRetiredError();
	}

	function shows(operation: Operation, entry: Entry): boolean {
		if (operation.status !== 'confirmed') return true;
		if (entry.baseSeq >= operation.settledSeq) return false;
		if (!entry.span) return true;
		// A view reads the shared record, which may postdate the view's own load.
		const record = records.get(operation.write.effect!.entity.name)?.get(operation.entityId);
		if (!record) return operation.write.effect!.kind !== 'remove';
		return record.seq < operation.settledSeq;
	}

	function viewEntries(name: string): ReadonlySet<Entry> {
		return views.get(name) ?? NO_VIEWS;
	}

	/** Give a view whose span was just set its index of the records the span holds. */
	function index(entry: Entry): void {
		const { name } = (entry.read as View<any, any>).view.of;
		let held = views.get(name);
		if (!held) views.set(name, (held = new Set()));
		held.add(entry);
		const { rows } = entry.span!;
		for (const [id, record] of records.get(name) ?? []) {
			if (inSpan(entry, record.value)) rows.set(id, record.value);
		}
	}

	/** Whether `value` counts toward the rows above a view's span. */
	function above(entry: Entry, value: unknown): boolean {
		const { where, compare } = (entry.read as View<any, any>).view;
		const { first } = entry.span!;
		return first !== null && where(value, entry.input) && compare(value, first) < 0;
	}

	function inSpan(entry: Entry, value: unknown): boolean {
		const { where, compare } = (entry.read as View<any, any>).view;
		const { first, last } = entry.span!;
		return (
			where(value, entry.input) &&
			(first === null || compare(first, value) <= 0) &&
			(last === null || compare(value, last) <= 0)
		);
	}

	/**
	 * Store a confirmed record unless a newer copy is held. A view whose span
	 * starts below the top knows its position only by count; a change that moves
	 * a record across that edge shifts every row, so the view reloads, unless its
	 * own load is newer than the change and so already counts it. A record with
	 * no earlier copy is new only when this store's own create made it; one that
	 * another load brought was already where the server put it.
	 */
	function putRecord(
		entity: Entity<any>,
		value: unknown,
		seq: number,
		source: Entry | null,
		reload: Set<Entry>,
		created = false,
	): void {
		let table = records.get(entity.name);
		if (!table) records.set(entity.name, (table = new Map()));
		const id = entity.id(value);
		const old = table.get(id);
		if (old && old.seq > seq) return;
		table.set(id, { value, seq });
		const moved = old !== undefined || created;
		for (const entry of viewEntries(entity.name)) {
			const { rows, start } = entry.span!;
			if (inSpan(entry, value)) rows.set(id, value);
			else rows.delete(id);
			if (source === null) persisted?.mark(entry.key);
			if (!moved || entry === source || start === 0 || seq < entry.baseSeq) continue;
			if ((old !== undefined && above(entry, old.value)) !== above(entry, value)) {
				reload.add(entry);
			}
		}
	}

	/** Delete a record from the shared table and from every view's index. */
	function dropRecord(name: string, id: string): void {
		records.get(name)!.delete(id);
		for (const entry of viewEntries(name)) entry.span!.rows.delete(id);
	}

	/** Delete a record a confirmed write removed; views that counted it above their span reload. */
	function deleteRecord(entity: Entity<any>, id: string, reload: Set<Entry>): void {
		const old = records.get(entity.name)?.get(id);
		if (!old) return;
		dropRecord(entity.name, id);
		for (const entry of viewEntries(entity.name)) {
			persisted?.mark(entry.key);
			if (entry.span!.start > 0 && above(entry, old.value)) reload.add(entry);
		}
	}

	/** Drop records no remaining view's span holds. */
	function collectRecords(name: string): void {
		const table = records.get(name);
		if (!table) return;
		const held = viewEntries(name);
		for (const id of table.keys()) {
			let kept = false;
			for (const entry of held) if ((kept = entry.span!.rows.has(id))) break;
			if (!kept) table.delete(id);
		}
	}

	/**
	 * A view's rows: the shared records with every outstanding edit applied,
	 * filtered by its rule, in its order, within its span. When edits leave the
	 * span too few rows to fill the window, the view shows what it has and
	 * reloads once.
	 */
	function evaluate(entry: Entry): unknown[] {
		const span = entry.span!;
		const { of, compare } = (entry.read as View<any, any>).view;
		const { offset, limit } = shown(entry);
		// A window past the end of the list holds no records to bound it.
		if (span.start > 0 && span.first === null) {
			span.more = false;
			return EMPTY as unknown[];
		}
		const table = records.get(of.name);
		const merged = new Map(span.rows);
		// An edit can move a record into the span from anywhere in the table.
		for (const { write, entityId } of operations) {
			if (write.effect?.entity.name !== of.name || merged.has(entityId)) continue;
			const record = table?.get(entityId);
			if (record) merged.set(entityId, record.value);
		}
		const edited = new Set<string>();
		let unsettled = false;
		for (const operation of operations) {
			const { effect } = operation.write;
			if (effect?.entity.name !== of.name || !shows(operation, entry)) continue;
			if (operation.status !== 'confirmed') unsettled = true;
			const id = operation.entityId;
			const current = merged.get(id);
			if (effect.kind === 'patch') {
				if (current === undefined) continue;
				merged.set(id, { ...(current as object), ...(operation.input as object) });
			} else if (effect.kind === 'remove') {
				merged.delete(id);
			} else if (current === undefined) {
				merged.set(id, operation.draft);
			}
			edited.add(id);
		}
		// An edit that moves a record across the top of the span moves every row in it.
		let shift = 0;
		if (span.start > 0) {
			for (const id of edited) {
				const confirmed = table?.get(id)?.value;
				const value = merged.get(id);
				if (value !== undefined && above(entry, value)) shift++;
				if (confirmed !== undefined && above(entry, confirmed)) shift--;
			}
		}
		const rows: unknown[] = [];
		for (const value of merged.values()) if (inSpan(entry, value)) rows.push(value);
		rows.sort(compare);
		const from = offset - span.start - shift;
		// A reload cannot fill the window until the server has the edits that emptied it;
		// each one that settles evaluates the view again.
		const short = from < 0 || (span.last !== null && rows.length < from + limit);
		if (short && !unsettled && !span.reloaded) {
			span.reloaded = true;
			// Not inside the render that asked for the snapshot.
			queueMicrotask(() => {
				if (!retired && entry.span === span && entries.get(entry.key) === entry) {
					invalidateEntry(entry);
				}
			});
		}
		span.more = rows.length > from + limit || span.last !== null;
		const next = rows.slice(Math.max(0, from), Math.max(0, from + limit));
		const previous = entry.snapshot?.value as unknown[] | undefined;
		return previous !== undefined &&
			previous.length === next.length &&
			previous.every((row, index) => sameRow(row, next[index]))
			? previous
			: next;
	}

	/** The confirmed value with every outstanding edit applied, in submission order. */
	function project(entry: Entry, confirmedOnly = false): unknown {
		if (!entry.read.entities || (operations.length === 0 && records.size === 0)) return entry.base;
		const replace = new Map<unknown, unknown>();
		for (const { entity, source } of selections(entry.read, entry.base)) {
			const list = Array.isArray(source);
			let items: unknown[] = list ? source : [source];
			// A copy of a record newer than this read's load, from a view or another read.
			const table = records.get(entity.name);
			if (table) {
				for (let index = 0; index < items.length; index++) {
					const record = table.get(entity.id(items[index]));
					if (record && record.seq > entry.baseSeq && !sameRow(record.value, items[index])) {
						if (items === source) items = items.slice();
						items[index] = record.value;
					}
				}
			}
			for (const operation of operations) {
				if (confirmedOnly && operation.status !== 'confirmed') continue;
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
		if (replace.size === 0) return entry.base;
		if (confirmedOnly) return rewrite(entry.base, replace);
		// Unchanged parts keep the last value, so a reader is not told of a change that is not one.
		const last = entry.projected;
		if (last !== null && last.base === entry.base && last.parts.size === replace.size) {
			const { parts } = last;
			let same = true;
			for (const [source, part] of replace) {
				const previous = parts.get(source);
				same &&=
					sameRow(previous, part) ||
					(Array.isArray(previous) &&
						Array.isArray(part) &&
						previous.length === part.length &&
						previous.every((item, index) => sameRow(item, part[index])));
			}
			if (same) return last.value;
		}
		const value = rewrite(entry.base, replace);
		entry.projected = { base: entry.base, parts: replace, value };
		return value;
	}

	function isStale(entry: Entry): boolean {
		return entry.stale || hostDateNow() - entry.fetchedAt >= entry.read.fresh;
	}

	function buildSnapshot(entry: Entry): ReadSnapshot<any> {
		const usable = entry.hasBase && hostDateNow() - entry.fetchedAt < entry.read.expire;
		return {
			status: usable ? 'ready' : entry.error === undefined ? 'pending' : 'error',
			value: usable ? (entry.span ? evaluate(entry) : project(entry)) : undefined,
			error: entry.error,
			refreshing: usable && entry.inflight !== null,
			stale: usable && isStale(entry),
			// After `value`, whose evaluation sets it.
			more: usable && entry.span !== null && entry.span.more,
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
				previous.stale === next.stale &&
				previous.more === next.more
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

	/** Commit `entry`, and with it every view that reads the records its value carried. */
	function touchWithViews(entry: Entry): void {
		commit(withSharing([entry]));
	}

	/** These entries, and every read that shares a record their values may have changed. */
	function withSharing(changed: readonly Entry[]): Set<Entry> {
		const all = new Set(changed);
		const names = new Set<string>();
		for (const entry of changed)
			if (entry.read.entities) for (const name of entry.names) names.add(name);
		if (names.size === 0) return all;
		for (const other of entries.values()) {
			for (const name of other.names) {
				if (names.has(name)) {
					all.add(other);
					break;
				}
			}
		}
		return all;
	}

	function reloadAll(reload: Set<Entry>): void {
		for (const entry of reload) if (entries.get(entry.key) === entry) invalidateEntry(entry);
	}

	/** Drop the confirmed value, so every later reader loads a new one. */
	function forget(entry: Entry): void {
		clearHostTimeout(entry.expireTimer);
		entry.base = undefined;
		entry.hasBase = false;
		entry.names = new Set();
		entry.snapshot = null;
		if (entry.span) views.get((entry.read as View<any, any>).view.of.name)!.delete(entry);
		entry.span = null;
	}

	/** Start the retention clock for an entry nothing observes. */
	function idle(entry: Entry): void {
		// A load in flight is demand: retention starts when it lands.
		if (entry.subscribers.size > 0 || entry.inflight || entry.keepTimer !== undefined) return;
		entry.keepTimer = setHostTimeout(() => {
			entry.keepTimer = undefined;
			// A handle outlives its entry; an evicted one must not show what it once held.
			const view = isView(entry.read) ? entry.read.view.of.name : undefined;
			forget(entry);
			entries.delete(entry.key);
			if (view !== undefined) collectRecords(view);
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

	/** `reload` collects views that a change to shared records left unable to place their rows. */
	function adopt(
		entry: Entry,
		value: unknown,
		startedSeq: number,
		age = 0,
		reload?: Set<Entry>,
		bounds?: Pick<Span, 'start' | 'first' | 'last'>,
	): void {
		if (isView(entry.read)) {
			const rows = value as unknown[];
			const { offset, limit } = wireInput(entry) as { offset: number; limit: number };
			entry.span = {
				...(bounds ?? {
					start: offset,
					first: offset > 0 ? (rows[0] ?? null) : null,
					last: rows.length < limit ? null : rows[rows.length - 1],
				}),
				reloaded: false,
				more: false,
				rows: new Map(),
			};
			const { of } = entry.read.view;
			const later = reload ?? new Set();
			const loaded = new Set<string>();
			for (const row of rows) {
				loaded.add(of.id(row));
				putRecord(of, row, startedSeq, entry, later);
			}
			// An older copy inside this span that the server left out has changed since.
			for (const [id, record] of records.get(of.name) ?? []) {
				if (record.seq >= startedSeq || loaded.has(id) || !inSpan(entry, record.value)) continue;
				for (const other of viewEntries(of.name)) {
					if (other !== entry && other.span!.rows.has(id)) later.add(other);
				}
				dropRecord(of.name, id);
			}
			index(entry);
			if (!reload) reloadAll(later);
		} else if (entry.read.entities) {
			// Records the server ordered: views get a newer copy of a record they hold, and
			// nothing else moves. A record no view holds stays out: the views' own loads say
			// which records they show, and this one may be older than theirs.
			const later = reload ?? new Set();
			for (const { entity, source } of selections(entry.read, value)) {
				const table = records.get(entity.name);
				if (table === undefined) continue;
				let shared = false;
				for (const item of Array.isArray(source) ? source : [source]) {
					if (!table.has(entity.id(item))) continue;
					putRecord(entity, item, startedSeq, entry, later);
					shared = true;
				}
				if (shared) for (const view of viewEntries(entity.name)) persisted?.mark(view.key);
			}
			if (!reload) reloadAll(later);
		}
		entry.base = value;
		entry.hasBase = true;
		entry.names = new Set(selections(entry.read, value).map(({ entity }) => entity.name));
		entry.fetchedAt = hostDateNow() - age;
		entry.baseSeq = startedSeq;
		entry.stale = false;
		entry.served = entry.subscribers.size > 0;
		entry.error = undefined;
		// A mounted reader must stop seeing the value at `expire`, not at its next change.
		clearHostTimeout(entry.expireTimer);
		if (entry.read.expire < 2 ** 31) {
			entry.expireTimer = setHostTimeout(() => {
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
		const age = seed.age + seedAge + Math.max(0, hostNow() - seedTime);
		if (!Number.isFinite(age) || age < 0 || age >= entry.read.expire) return;
		let value: unknown;
		let bounds: SeedEntry['span'];
		try {
			value = parse(entry.read.output, seed.value);
			if (value instanceof Promise) {
				void value.catch(() => {});
				return;
			}
			if (seed.span !== undefined && isView(entry.read)) {
				const { start, first, last } = seed.span;
				const { offset } = wireInput(entry) as { offset: number };
				if (start !== offset || (start === 0 && first !== null)) return;
				const { of, compare } = entry.read.view;
				// Seed adoption is synchronous. Async bounds use the ordinary validated load.
				const lower = first === null ? null : parse(of.schema, first);
				if (lower instanceof Promise) {
					void lower.catch(() => {});
					return;
				}
				const upper = last === null ? null : parse(of.schema, last);
				if (upper instanceof Promise) {
					void upper.catch(() => {});
					return;
				}
				if (start > 0 && lower === null && (upper !== null || (value as unknown[]).length > 0))
					return;
				if (lower !== null && upper !== null && compare(lower, upper) > 0) return;
				bounds = { start, first: lower, last: upper };
			}
		} catch {
			return;
		}
		const reload = new Set<Entry>();
		adopt(entry, value, 0, age, reload, bounds);
		entry.stale = seed.stale === true || seedsStale;
		save(entry);
		// A seed is adopted while a render asks for its read.
		if (reload.size > 0) queueMicrotask(() => !retired && reloadAll(reload));
	}

	/**
	 * Call the transport after the caller's synchronous work. A component that
	 * reads unloaded data starts its load while rendering; the transport, and any
	 * state it updates, must not run inside that render. A transport that throws
	 * synchronously still reports through the promise.
	 */
	async function request(payload: DataRequest, signal: AbortSignal): Promise<DataReply> {
		await undefined;
		// Read after the feeds' positions, so no change falls between them and a value.
		if (positions) await positions;
		assertLive();
		return transport(payload, signal);
	}

	/**
	 * Start an entry from persistent storage, as from a seed. A fresh value
	 * needs no load; a stale one shows while its load runs.
	 */
	function restore(entry: Entry): Promise<void> {
		entry.checkedStorage = true;
		const attempt = entry.attempt;
		const current = () => !retired && entry.attempt === attempt && !entry.hasBase;
		const done = persisted!
			.restore(entry.key, entry.read)
			.then(async (stored) => {
				if (!stored || !current()) return;
				const age = Math.max(0, hostDateNow() - stored.savedAt);
				let value: unknown;
				try {
					if (age >= entry.read.expire) throw new Error('expired');
					value = await parse(entry.read.output, stored.value);
				} catch {
					persisted!.discard(entry.key);
					return;
				}
				if (!current()) return;
				const reload = new Set<Entry>();
				adopt(entry, value, 0, age, reload);
				if (entry.span) {
					entry.span = {
						...(stored.span as Span),
						reloaded: false,
						more: false,
						rows: new Map(),
					};
					index(entry);
				}
				entry.stale = stored.stale;
				reloadAll(reload);
			})
			.then(() => {
				if (retired || entry.inflight !== done) return;
				entry.inflight = null;
				touchWithViews(entry);
				if (!entry.hasBase) return load(entry);
				if (entry.subscribers.size > 0 && isStale(entry)) void load(entry);
				else idle(entry);
			});
		entry.inflight = done;
		touch(entry);
		return done;
	}

	function load(entry: Entry): Promise<void> {
		if (entry.inflight) return entry.inflight;
		if (persisted && !entry.hasBase && !entry.checkedStorage && entry.read.persist) {
			return restore(entry);
		}
		const startedSeq = ++sequence;
		const attempt = (entry.attempt = startedSeq);
		const abort = (entry.abort = new AbortController());
		const { read } = entry;
		clearHostTimeout(entry.keepTimer);
		entry.keepTimer = undefined;
		const current = () => !retired && entry.attempt === attempt;
		const done = request({ kind: 'read', name: read.name, input: wireInput(entry) }, abort.signal)
			.then((reply) => {
				if (!reply.ok) throw new DataError(reply.code, reply.data, reply.issues);
				return parse(read.output, reply.value);
			})
			.then(
				(value) => {
					if (!current()) return;
					adopt(entry, value, startedSeq);
					save(entry);
				},
				(error) => {
					if (current()) entry.error = error;
				},
			)
			.then(() => {
				if (!current()) return;
				entry.inflight = null;
				entry.abort = null;
				touchWithViews(entry);
				idle(entry);
			});
		entry.inflight = done;
		touch(entry);
		return done;
	}

	/** Discard any load or restore in flight; returns the attempt that supersedes it. */
	function supersede(entry: Entry): number {
		entry.abort?.abort();
		entry.abort = null;
		entry.inflight = null;
		return (entry.attempt = ++sequence);
	}

	/** Discard any load in flight, since it may predate the change, and reload if observed. */
	function invalidateEntry(entry: Entry): void {
		entry.stale = true;
		persisted?.mark(entry.key);
		supersede(entry);
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

	/**
	 * The tags a write affects `entry` through. A view settles a removal, or a
	 * write whose reply carries its record, from the shared table, so only the
	 * write's own `invalidates` tags reach it.
	 */
	function viewTags(entry: Entry, write: Write<any, any>, tags: readonly string[], local: boolean) {
		return entry.span && local ? write.invalidates : tags;
	}

	/** Whether a write's views can settle from the shared table, before its reply is read. */
	function settlesLocally(write: Write<any, any>): boolean {
		return (
			write.effect?.kind === 'remove' || (write.effect !== undefined && write.record !== undefined)
		);
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
				getSnapshot() {
					if (retired) return PENDING;
					const current = entries.get(key) ?? created;
					return (current.snapshot ??= buildSnapshot(current));
				},
				subscribe(notify) {
					if (retired) return () => {};
					// A handle outlives its entry's retention; observing it again restores the entry.
					const current = entries.get(key);
					if (current && current !== created) return current.handle.subscribe(notify);
					if (!current) entries.set(key, created);
					clearHostTimeout(created.keepTimer);
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
					const current = entryFor(read, input);
					invalidateEntry(current);
					return load(current);
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
			span: null,
			checkedStorage: false,
			projected: null,
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
	function confirm(
		operation: Operation,
		reply?: DataReply & { ok: true },
		output?: unknown,
		dispatchedAt = sequence,
	): void {
		const { write } = operation;
		if (write.effect?.kind === 'create' && write.serverId) {
			if (output === undefined) {
				operation.gate?.reject(new DependencyError());
			} else {
				assignId(operation, write.serverId(output));
			}
		}
		operation.status = 'confirmed';
		operation.settledSeq = ++sequence;
		operation.gate?.resolve();
		// Views take a removal or a returned record into the shared table, so they need no reload.
		// A reply that could not be read carries no record, and its views reload.
		const reload = new Set<Entry>();
		const { effect } = write;
		let local = false;
		if (effect?.kind === 'remove') {
			deleteRecord(effect.entity, operation.entityId, reload);
			local = true;
		} else if (effect && write.record && output !== undefined) {
			const created = effect.kind === 'create';
			putRecord(effect.entity, write.record(output), operation.settledSeq, null, reload, created);
			local = true;
		}
		const refreshed = new Set<Entry>();
		const pending: Promise<() => Entry | undefined>[] = [];
		for (const item of reply?.refreshed ?? []) {
			const key = entryKey(item.name, item.input);
			let entry = entries.get(key);
			// A view asked for its window with a margin, so the reply names that input.
			for (const candidate of entry ? [] : entries.values()) {
				if (candidate.span && entryKey(candidate.read.name, wireInput(candidate)) === key) {
					entry = candidate;
					break;
				}
			}
			if (!entry) continue;
			// Another request, invalidation or write reply overtook this write. The server
			// gives no ordering between them, so reload rather than publishing an older value.
			const overtaken = entry.attempt > dispatchedAt;
			if (
				overtaken &&
				(entry.baseSeq <= dispatchedAt || entry.stale || entry.inflight || entry.span)
			) {
				reload.add(entry);
				continue;
			}
			refreshed.add(entry);
			// The refreshed value supersedes any load that preceded this write.
			const attempt = overtaken ? entry.attempt : supersede(entry);
			const startedSeq = ++sequence;
			const current = () => {
				if (retired || entries.get(entry.key) !== entry) return false;
				if (entry.attempt === attempt) return true;
				// A partial feed edit can supersede the refresh while its schema validates.
				// The edit cannot account for the rest of the reply; a later full load can.
				if (!entry.inflight && !entry.stale && entry.baseSeq < startedSeq) invalidateEntry(entry);
				return false;
			};
			pending.push(
				Promise.resolve()
					.then(() => parse(entry.read.output, item.value))
					.then(
						(value) => () => {
							if (!current()) return undefined;
							if (overtaken) {
								// The feed can echo this write before its reply arrives.
								if (!sameWireValue(entry.base, value)) invalidateEntry(entry);
								return undefined;
							}
							adopt(entry, value, startedSeq);
							save(entry);
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
				commit(withSharing(adopted.filter((entry): entry is Entry => entry !== undefined)));
			});
		}
		const tags = writeTags(operation.write);
		// Saved values no entry holds now are marked too, for the session that restores them.
		persisted?.invalidated(tags);
		for (const entry of entries.values()) {
			// A first load of a read that selects entities has no value yet to say which ones,
			// and may predate the write. Reads that select none are untouched unless a tag names them.
			const unknown = !entry.hasBase && entry.read.entities && tags.length > 0;
			if (refreshed.has(entry)) continue;
			if (unknown || affects(entry, viewTags(entry, write, tags, local))) reload.add(entry);
		}
		reloadAll(reload);
		if (!operation.write.effect) operations = operations.filter((item) => item !== operation);
		collect();
		persisted?.unjournal(operation.id);
	}

	function remove(operation: Operation): void {
		operations = operations.filter((item) => item !== operation);
		touchEntities();
		persisted?.unjournal(operation.id);
	}

	/** Name an uncertain write's outcome once a receipt has established it. */
	function settleOperation(operation: Operation, confirmed: boolean, value: unknown): void {
		if (confirmed) {
			confirm(operation, undefined, value);
			touchEntities();
		} else {
			remove(operation);
			operation.gate?.reject(new DependencyError());
		}
	}

	/**
	 * Show the durable writes a previous session left unsettled, then settle
	 * each by its receipt. Nothing is sent again; a write whose receipt cannot be
	 * read stays uncertain, and in the journal for the next start.
	 */
	async function recover(journal: NonNullable<PersistOptions['journal']>): Promise<void> {
		const recovered: Operation[] = [];
		const obsolete: string[] = [];
		for (const { id, name, raw, order } of await persisted!.recover()) {
			const write = journal.writes.find((item) => item.name === name);
			if (write) {
				try {
					const input = await parse(write.input, raw);
					recovered.push(operationFor(id, write, input, raw, 'uncertain'));
					continue;
				} catch {
					// A compatible build may still recover this operation during the grace period.
				}
			}
			if (hostDateNow() - order[0] >= 30 * 24 * 60 * 60 * 1000) obsolete.push(id);
		}
		if (retired) return;
		// Recovered writes were submitted before anything this session submitted.
		if (recovered.length) {
			operations = [...recovered, ...operations];
			touchEntities();
		}
		async function receipt(id: string) {
			const reply = await request(
				{ kind: 'read', name: journal.receipt.name, input: { operationId: id } },
				retiring.signal,
			);
			if (!reply.ok) throw new DataError(reply.code);
			return parse(journal.receipt.output, reply.value);
		}
		for (const operation of recovered) {
			void receipt(operation.id).then(
				({ applied, value }) => {
					if (!retired && operation.status === 'uncertain')
						settleOperation(operation, applied, value);
				},
				() => {},
			);
		}
		// Obsolete writes have no usable effect metadata. Check one receipt at a time.
		for (const id of obsolete) {
			if (retired) return;
			const outcome = await receipt(id).catch(() => undefined);
			if (retired || !outcome || typeof outcome.applied !== 'boolean') continue;
			if (outcome.applied) {
				persisted!.invalidated([null]);
				seedsStale = true;
				for (const entry of entries.values()) invalidateEntry(entry);
			}
			persisted!.unjournal(id);
		}
	}

	/**
	 * `input` is the validated value the optimistic edit uses. `raw` is what the caller
	 * passed, and it is what crosses the wire: the server validates again, and a schema
	 * that transforms its input would refuse its own output.
	 */
	function operationFor(
		id: string,
		write: Write<any, any>,
		input: unknown,
		raw: unknown,
		status: Operation['status'],
	): Operation {
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
		return {
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
			status,
			settledSeq: 0,
		};
	}

	function send(write: Write<any, any>, input: unknown, raw: unknown): Promise<any> {
		const id = crypto.randomUUID();
		const operation = operationFor(id, write, input, raw, 'pending');
		const { effect } = write;
		const creates = effect?.kind === 'create';
		operations.push(operation);
		if (effect) touchEntities();
		// A durable write is in the journal before it can reach the server.
		const journaled = durable.has(write)
			? persisted!.journal({ id, name: write.name, raw: operation.raw })
			: null;

		let dispatchedAt = 0;
		const deliver = () => {
			dispatchedAt = sequence;
			const tags = writeTags(write);
			const refresh: { name: string; input: unknown }[] = [];
			for (const entry of entries.values()) {
				if (refresh.length === MAX_REFRESH) break;
				const viewed = viewTags(entry, write, tags, settlesLocally(write));
				if (entry.subscribers.size > 0 && affects(entry, viewed)) {
					refresh.push({ name: entry.read.name, input: wireInput(entry) });
				}
			}
			// Read at send time: a server-assigned ID may have replaced the operation ID.
			return request(
				{ kind: 'write', name: write.name, input: operation.raw, operationId: id, refresh },
				new AbortController().signal,
			);
		};
		const dispatch = journaled ? () => journaled.then(deliver) : deliver;

		// Writes to one entity are sent in submission order, so the last edit wins on the
		// server too. After a write that failed to arrive, the next is still sent; after a
		// refused create, writes to its record are refused unsent.
		const queueKey = effect ? `${effect.entity.name}\n${operation.entityId}` : undefined;
		const previous = queueKey === undefined ? undefined : queues.get(queueKey);
		const sent = previous
			? previous.then(dispatch, (error) => {
					if (retired || error instanceof DependencyError) throw error;
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
					operation.gate?.reject(new DependencyError());
					throw new DataError(reply.code, reply.data, reply.issues);
				}
				let output: unknown;
				try {
					output = write.output ? await parse(write.output, reply.value) : reply.value;
				} catch (error) {
					// The server applied the write; only its reply is unreadable.
					if (!retired) confirm(operation, reply, undefined, dispatchedAt);
					throw error;
				}
				if (retired) throw new DataRetiredError();
				confirm(operation, reply, output, dispatchedAt);
				if (write.serverId || settlesLocally(write)) touchEntities();
				return output;
			},
			(error) => {
				if (retired) throw new DataRetiredError();
				if (error instanceof DependencyError) {
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

	const store: DataStore = {
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
		form(write, key = '') {
			if (retired) return RETIRED_FORM;
			const formKey = `${write.name}\n${key}`;
			let handle = forms.get(formKey);
			if (!handle) {
				const run = (input: unknown) => store.write(write, input as any);
				handle = createFormHandle(
					write,
					key,
					formOutcome,
					run,
					() => {
						if (forms.get(formKey) === handle) forms.delete(formKey);
					},
					retiring.signal,
				);
				if (formOutcome.outcome && handle.getSnapshot().error !== null) {
					formOutcome = { ...formSeed, outcome: null };
				}
				forms.set(formKey, handle);
			}
			return handle;
		},
		invalidate(tags) {
			assertLive();
			persisted?.invalidated(tags);
			for (const entry of entries.values()) if (affects(entry, tags)) invalidateEntry(entry);
		},
		settle(operationId, confirmed, value) {
			assertLive();
			const operation = operations.find((item) => item.id === operationId);
			if (operation?.status === 'uncertain') settleOperation(operation, confirmed, value);
		},
		publish(read, input, value) {
			assertLive();
			if (isView(read)) {
				throw new TypeError(
					'octane/data: a view needs its fetched window, so it cannot be published',
				);
			}
			const entry = entryFor(read, input);
			const attempt = supersede(entry);
			// Taken now, as a load does: a write confirmed while this validates is newer.
			const startedSeq = ++sequence;
			const current = () => !retired && entry.attempt === attempt;
			let refused = false;
			let reason: unknown;
			// Readers that ask while it validates join it rather than superseding it with a load.
			const done = Promise.resolve()
				.then(() => parse(read.output, value))
				.then(
					(parsed) => {
						if (!current()) return;
						adopt(entry, parsed, startedSeq);
						save(entry);
					},
					(error) => {
						refused = true;
						reason = error;
						// A newer value exists, so what memory holds is stale; storage keeps its copy.
						if (current() && entry.hasBase) entry.stale = true;
					},
				)
				.then(() => {
					if (!current()) return;
					entry.inflight = null;
					touchWithViews(entry);
					// A refused value leaves an observer the load it superseded.
					if (entry.subscribers.size > 0 && (!entry.hasBase || entry.stale)) void load(entry);
					else idle(entry);
				});
			entry.inflight = done;
			touch(entry);
			return done.then(() => {
				if (refused) throw reason;
			});
		},
		forget(read, input) {
			assertLive();
			const key = entryKey(read.name, input);
			seeds.delete(key);
			const entry = entries.get(key);
			if (entry) {
				supersede(entry);
				entry.checkedStorage = true;
				forget(entry);
				entry.error = undefined;
				touch(entry);
				idle(entry);
			}
			return persisted ? persisted.forget(key) : Promise.resolve();
		},
		dehydrate() {
			const now = hostDateNow();
			const seed: SeedEntry[] = [];
			for (const entry of entries.values()) {
				const age = now - entry.fetchedAt;
				if (!entry.hasBase || age >= entry.read.expire) continue;
				const { span } = entry;
				seed.push({
					name: entry.read.name,
					input: entry.input,
					age,
					value: span ? confirmedRows(entry) : project(entry, true),
					span: span ? { start: span.start, first: span.first, last: span.last } : undefined,
					stale: entry.stale,
				});
			}
			// devalue escapes `<`, so the text cannot close the script element holding it.
			return devalue.stringify({ reads: seed, form: formSeed, cursors });
		},
		retire() {
			if (retirement) return retirement;
			retired = true;
			// Signing out leaves nothing of the account on the device.
			retirement = persisted ? persisted.clear() : Promise.resolve();
			// A caller that does not wait for the cleanup is not told it failed.
			retirement.catch(() => {});
			retiring.abort(new DataRetiredError());
			// Writes waiting on a create must settle too, or they would never end.
			for (const operation of operations) operation.gate?.reject(new DataRetiredError());
			operations = [];
			queues.clear();
			assigned.clear();
			records.clear();
			views.clear();
			seeds.clear();
			forms.clear();
			for (const entry of entries.values()) {
				entry.abort?.abort();
				clearHostTimeout(entry.keepTimer);
				clearHostTimeout(entry.expireTimer);
				entry.snapshot = null;
				for (const notify of [...entry.subscribers]) notify();
			}
			entries.clear();
			return retirement;
		},
	};
	internals.set(store, {
		listen: options.listen,
		retired: retiring.signal,
		persisted,
		seeded: new Map(parsed?.cursors),
		entries,
		viewed: (entity, id, value) =>
			!!records.get(entity.name)?.has(id) ||
			(value !== undefined &&
				[...viewEntries(entity.name)].some(
					// A record above a lower window moves every row in it.
					(entry) => inSpan(entry, value) || (entry.span!.start > 0 && above(entry, value)),
				)),
		record(entity, id, value, reload) {
			if (value === null) deleteRecord(entity, id, reload);
			else putRecord(entity, value, ++sequence, null, reload, true);
		},
		rebase(entry, value, edited, reload) {
			if (edited) {
				// The rest of the value is as old, and as stale, as before.
				const { stale } = entry;
				adopt(entry, value, entry.baseSeq, hostDateNow() - entry.fetchedAt, reload);
				entry.stale = stale;
			} else {
				supersede(entry);
				adopt(entry, value, ++sequence, 0, reload);
				idle(entry);
			}
			save(entry);
		},
		finish(reload, changed, names) {
			reloadAll(reload);
			const all = new Set(changed);
			for (const entry of entries.values()) {
				for (const name of names) {
					if (!entry.names.has(name)) continue;
					// A pending reply can introduce a row this event already removed from the server,
					// even if the current read or view has never held that row.
					// In-flight reads have already restarted with their own newer attempts.
					if (!entry.inflight) entry.attempt = ++sequence;
					all.add(entry);
					break;
				}
			}
			commit(all);
		},
	});
	return store;
}
