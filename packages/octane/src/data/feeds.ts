/**
 * Listening to a feed: one connection per feed and parameters on a store,
 * open while anything observes it, applying each event to the store.
 *
 * Invariants:
 * - Frames apply in the order the source sends them. Feeds are independent:
 *   nothing orders one feed's events against another's.
 * - An event whose ID the connection has seen recently applies once.
 * - The store resumes from the last cursor a frame carried, which a
 *   persistent store saves for its next session. When it may have missed
 *   events, it marks the feed's `covers` stale: on a gap frame, on an event it
 *   cannot validate or apply, and when a connection without a cursor comes
 *   back after a live one dropped.
 * - The connection closes when its last observer leaves, and when the store
 *   retires. A failed connection retries with growing, jittered delays.
 */
import { clearHostTimeout, setHostTimeout } from '../host-task.js';
import { parse, type Entity, type Feed, type FeedChange, type FeedFrame } from './contracts.js';
import {
	DataRetiredError,
	entryKey,
	internals,
	rewrite,
	selections,
	type DataStore,
	type Entry,
} from './store.js';

export interface FeedSnapshot {
	/**
	 * `connecting` until the first frame arrives, `live` once one has, and
	 * `offline` after a connection failed, while it waits to try again.
	 */
	readonly status: 'connecting' | 'live' | 'offline';
	/** Why the last connection failed, while offline. */
	readonly error: unknown;
}

export interface FeedHandle {
	/** Stable between changes, so it can back `useSyncExternalStore`. */
	getSnapshot(): FeedSnapshot;
	/** Observe the feed. The first observer connects it; the last one to leave disconnects it. */
	subscribe(notify: () => void): () => void;
}

/** Event IDs remembered per feed, for dropping a duplicate. */
const SEEN = 256;
/** The longest wait between attempts to connect. */
const MAX_DELAY = 30_000;

const CONNECTING: FeedSnapshot = { status: 'connecting', error: undefined };
const LIVE: FeedSnapshot = { status: 'live', error: undefined };

const handles = new WeakMap<DataStore, Map<string, FeedHandle>>();

/**
 * Listen to `feed` with `params` through the store's `listen` option. Equal
 * arguments on one store return one handle, so every observer shares one
 * connection.
 */
export function listen<E>(store: DataStore, feed: Feed<void, E>, params?: void): FeedHandle;
export function listen<P, E>(store: DataStore, feed: Feed<P, E>, params: P): FeedHandle;
export function listen<P, E>(store: DataStore, feed: Feed<P, E>, params: P): FeedHandle {
	let byKey = handles.get(store);
	if (!byKey) handles.set(store, (byKey = new Map()));
	const key = entryKey(feed.name, params);
	let handle = byKey.get(key);
	if (!handle) byKey.set(key, (handle = createFeed(store, feed, params, key)));
	return handle;
}

function createFeed<P, E>(store: DataStore, feed: Feed<P, E>, params: P, key: string): FeedHandle {
	const source = internals.get(store)!;
	const observers = new Set<() => void>();
	const seen = new Set<string>();
	let snapshot = CONNECTING;
	let cursor: string | null = source.seeded.get(key) ?? null;
	/** Whether a connection has been live, so one that comes back without a cursor missed events. */
	let wasLive = false;
	/** Only a subscribed run reconciles page and disk after storage is ready. */
	let restored = false;
	/** Aborts the current run, when the last observer leaves. */
	let running: AbortController | null = null;

	function set(next: FeedSnapshot): void {
		if (next === snapshot) return;
		snapshot = next;
		for (const notify of [...observers]) notify();
	}

	function missed(): void {
		if (!store.retired) store.invalidate(feed.covers);
	}

	async function apply(frame: FeedFrame): Promise<void> {
		if (frame.gap) missed();
		if ('event' in frame && !(frame.id !== undefined && seen.has(frame.id))) {
			try {
				const changes = feed.changes(await parse(feed.event, frame.event), params);
				if (!store.retired) receive(store, Array.isArray(changes) ? changes : [changes as never]);
			} catch {
				// An event the store cannot read or apply is one it missed.
				missed();
			}
			if (frame.id !== undefined) {
				seen.add(frame.id);
				if (seen.size > SEEN) seen.delete(seen.values().next().value!);
			}
		}
		if (frame.cursor !== undefined && frame.cursor !== cursor) {
			cursor = frame.cursor;
			// Saved after the values this frame and the ones before it changed.
			source.persisted?.keepCursor(key, cursor);
		}
	}

	async function run(stop: AbortSignal): Promise<void> {
		const connect = source.listen!;
		const signal = AbortSignal.any([stop, source.retired]);
		if (!restored && source.persisted) {
			const saved = await source.persisted.cursor(key);
			if (signal.aborted) return;
			restored = true;
			// Positions are opaque. Refresh covered values when cache and page disagree.
			if (saved !== null && cursor !== null && saved !== cursor) {
				missed();
				source.persisted.keepCursor(key, cursor);
			}
			cursor ??= saved;
		}
		let failures = 0;
		while (!signal.aborted) {
			let live = false;
			let error: unknown;
			try {
				for await (const frame of connect({ name: feed.name, params, cursor }, signal)) {
					if (signal.aborted) break;
					if (!live) {
						live = true;
						failures = 0;
						if (wasLive && cursor === null) missed();
						wasLive = true;
						set(LIVE);
					}
					await apply(frame);
				}
			} catch (cause) {
				error = cause;
			}
			if (signal.aborted) return;
			// A connection that ended after it was live reconnects at once; any other waits.
			if (live && error === undefined) continue;
			failures++;
			set({ status: 'offline', error });
			const delay = Math.min(MAX_DELAY, 1000 * 2 ** (failures - 1)) * (0.5 + Math.random() / 2);
			await new Promise<void>((resolve) => {
				const timer = setHostTimeout(done, delay);
				signal.addEventListener('abort', done, { once: true });
				function done() {
					clearHostTimeout(timer);
					signal.removeEventListener('abort', done);
					resolve();
				}
			});
		}
	}

	return {
		getSnapshot: () => snapshot,
		subscribe(notify) {
			// A server render reads the snapshot and never subscribes, so only a browser needs `listen`.
			if (!source.listen)
				throw new Error('octane/data: listening to a feed needs a store with `listen`');
			observers.add(notify);
			if (!running && !store.retired) {
				running = new AbortController();
				void run(running.signal);
			}
			return () => {
				if (!observers.delete(notify) || observers.size > 0) return;
				running?.abort();
				running = null;
				snapshot = CONNECTING;
			};
		},
	};
}

/**
 * Apply what the server says changed, as a feed's events do: every read
 * holding a put record shows it, a removed record leaves every list, a read
 * the store holds takes its new value, and reads with an `invalidates` tag
 * reload. The changes apply together, and a read with a load in flight, which
 * may predate them, reloads. Use it for an app's own subscription. Values are
 * not validated, so pass only what a schema has already checked.
 */
export function receive(store: DataStore, changes: readonly FeedChange[]): void {
	if (store.retired) throw new DataRetiredError();
	const { entries, persisted, invalidateSeeds, discardSeed, viewed, record, rebase, finish } =
		internals.get(store)!;
	const reload = new Set<Entry>();
	const changed: Entry[] = [];
	const names = new Set<string>();
	const tags: string[] = [];
	for (const change of changes) {
		if ('invalidates' in change) {
			tags.push(...change.invalidates);
			continue;
		}
		if ('read' in change) {
			if ('view' in change.read) {
				throw new TypeError(
					'octane/data: a view needs its fetched window, so an event cannot set it',
				);
			}
			// Only a read the store holds takes it; a saved copy of one it does not is out of date.
			const key = entryKey(change.read.name, change.input);
			const entry = entries.get(key);
			if (entry) {
				rebase(entry, change.value, false, reload);
				changed.push(entry);
			} else {
				discardSeed(key);
				persisted?.discard(key);
			}
			continue;
		}
		const value = 'put' in change ? change.value : null;
		const entity = 'put' in change ? change.put : change.remove;
		const id = 'put' in change ? entity.id(change.value) : change.id;
		names.add(entity.name);
		if (viewed(entity, id, value ?? undefined)) record(entity, id, value, reload);
		for (const entry of entries.values()) {
			if (!entry.read.entities || (entry.hasBase && !entry.names.has(entity.name))) continue;
			if (entry.inflight) reload.add(entry);
			else if (!entry.span && entry.hasBase) edit(entry, entity, id, value);
		}
	}
	if (tags.length > 0) store.invalidate(tags);
	// A saved value of these records that is not in memory, and so not saved again now, is restored stale.
	if (names.size > 0) {
		invalidateSeeds(names);
		persisted?.invalidated([...names]);
	}
	finish(reload, changed, names);

	/** Put or remove the record in a read the server ordered, which views do not cover. */
	function edit(entry: Entry, entity: Entity<any>, id: string, value: unknown): void {
		const replace = new Map<unknown, unknown>();
		for (const { entity: selected, source } of selections(entry.read, entry.base)) {
			if (selected.name !== entity.name) continue;
			if (!Array.isArray(source)) {
				if (entity.id(source) !== id) continue;
				// A single selected record has no shape for "absent", so the read reloads.
				if (value === null) return void reload.add(entry);
				replace.set(source, value);
				continue;
			}
			const at = source.findIndex((item) => entity.id(item) === id);
			if (at < 0) continue;
			const next = source.slice();
			if (value === null) next.splice(at, 1);
			else next[at] = value;
			replace.set(source, next);
		}
		if (replace.size === 0) return;
		rebase(entry, rewrite(entry.base, replace), true, reload);
		changed.push(entry);
	}
}
