/**
 * A list read a page at a time, shown as one list.
 *
 * A view's page is an ordinary window of the view, `size` rows at
 * `offset = index * size`, so pages share records, and an edit moves a row
 * from one page to the next exactly as it moves rows within one window.
 *
 * A read's page is the read at the input its cursor derives from the page
 * before, so its pages are a chain: each confirmed page names the next.
 * Invariants of a chain:
 * - A page is added only after a confirmed page, never after a preview, and
 *   only at an input no page of the list has read.
 * - When a confirmed page names another next page than the one the list
 *   holds, as after a refresh, the pages that now follow load out of sight.
 *   The list shows what it last showed until they are all confirmed, then
 *   shows them together. If one fails, the list stays, and `loadMore` loads
 *   that page again.
 */
import type { Read, View } from './contracts.js';
import {
	entryKey,
	internals,
	type DataStore,
	type ReadHandle,
	type ReadSnapshot,
} from './store.js';

export interface PagesSnapshot<T> extends ReadSnapshot<T[]> {
	/** The next page is loading. Its preview, when it sends one, is already among the rows. */
	readonly loadingMore: boolean;
	/**
	 * Show the next page, when `more` says there is one. While a page has failed
	 * to load, wherever it is in the list, it loads that page again instead.
	 * While the next page is loading, it joins that load. Resolves once the page
	 * has loaded.
	 */
	readonly loadMore: () => Promise<void>;
}

export interface PagesHandle<T> {
	/**
	 * Stable between changes, so it can back `useSyncExternalStore`. Its `value`
	 * is the same array until a row changes, whatever else does.
	 */
	getSnapshot(): PagesSnapshot<T>;
	/** Observe every page loaded so far, and each one added later. */
	subscribe(notify: () => void): () => void;
	loadMore(): Promise<void>;
	refresh(): Promise<void>;
}

/** How a read that returns one page of a list continues. */
export interface PageCursor<I, O, T> {
	/** The rows one page holds, in order. */
	readonly rows: (page: O) => readonly T[];
	/**
	 * The input that reads the page after `page`, which `input` read: usually
	 * `input` with the cursor `page` returned. `null` or `undefined` when `page`
	 * is the last. An input the list has already read ends it too.
	 */
	readonly next: (page: O, input: I) => I | null | undefined;
}

/** How a list goes from one page to the next. */
interface Chain {
	readonly first: unknown;
	/** The input after a confirmed page, which `input` read and `count` pages end with; nullish at the end. */
	next(part: ReadSnapshot<any>, input: unknown, count: number): unknown;
	rows(value: any): readonly unknown[];
	/** Whether each page names the next, so a page that reloads can change every page after it. */
	readonly linked: boolean;
}

interface Page {
	readonly input: unknown;
	readonly key: string;
	readonly handle: ReadHandle<any>;
	/** The snapshot `next` was derived from. */
	part: ReadSnapshot<any> | null;
	/** The page this one's confirmed value names next, with its key; null at the end, and until confirmed. */
	next: { readonly input: unknown; readonly key: string } | null;
}

const lists = new WeakMap<DataStore, Map<string, PagesHandle<any>>>();

const confirmed = (part: ReadSnapshot<any>) => part.status === 'ready' && !part.preview;

/**
 * Read `view` `size` rows at a time (its default window when omitted), as one
 * list that grows with `loadMore()`. Equal arguments on one store return one
 * handle, so every component showing that list grows it together.
 */
export function pages<T>(
	store: DataStore,
	view: View<void, T>,
	params?: void,
	size?: number,
): PagesHandle<T>;
export function pages<P, T>(
	store: DataStore,
	view: View<P, T>,
	params: P,
	size?: number,
): PagesHandle<T>;
/**
 * Read a list whose server returns a page and a cursor for the next: `read`
 * at `input` is the first page, and `cursor.next` derives each later input.
 * One store has one such list for a read and its first input.
 */
export function pages<I, O, T>(
	store: DataStore,
	read: Read<I, O>,
	input: I,
	cursor: PageCursor<I, O, T>,
): PagesHandle<T>;
export function pages(
	store: DataStore,
	read: Read<any, any>,
	input: unknown,
	option?: number | PageCursor<any, any, any>,
): PagesHandle<any> {
	const cursor = typeof option === 'object' ? option : null;
	const size = cursor ? 0 : ((option as number | undefined) ?? (read as View<any, any>).view.limit);
	let byKey = lists.get(store);
	if (!byKey) lists.set(store, (byKey = new Map()));
	const key = `${entryKey(read.name, input)}\n${cursor ? 'cursor' : size}`;
	let list = byKey.get(key);
	if (!list) {
		const window = (index: number) => ({ ...(input as object), offset: index * size, limit: size });
		const chain: Chain = cursor
			? {
					first: input,
					next: (part, from) => cursor.next(part.value, from),
					rows: cursor.rows,
					linked: true,
				}
			: {
					first: window(0),
					next: (part, _, count) => (part.more ? window(count) : null),
					rows: (rows) => rows,
					linked: false,
				};
		byKey.set(key, (list = createPages(store, read, chain)));
	}
	return list;
}

function createPages(store: DataStore, read: Read<any, any>, chain: Chain): PagesHandle<any> {
	const page = (input: unknown): Page => ({
		input,
		key: entryKey(read.name, input),
		handle: store.read(read, input),
		part: null,
		next: null,
	});
	/** The pages the list shows, the last of which may still be loading. */
	let shown = [page(chain.first)];
	/**
	 * The chain replacing `shown`, while it loads out of sight: `count` pages
	 * at most, each loaded again when `reload`. The snapshot is held meanwhile.
	 */
	let staged: { readonly pages: Page[]; readonly count: number; readonly reload: boolean } | null =
		null;
	/** The load of `staged` in flight; null once it stops at a page that failed. */
	let following: Promise<void> | null = null;
	let parts: ReadSnapshot<any>[] = [];
	let snapshot: PagesSnapshot<any> | null = null;
	const listeners = new Set<() => void>();
	/** Each shown page's subscription, while anything observes the list. */
	let stops: Array<() => void> = [];
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	const changed = () => {
		relink();
		notify();
	};
	// A listener of its own for each, so a page read at two places in a chain is observed twice.
	const watch = (added: Page) => added.handle.subscribe(() => changed());

	/** The page after `pages[at]`, once that one is confirmed: null at the end. */
	function nextOf(pages: readonly Page[], at: number): Page['next'] {
		const from = pages[at]!;
		const part = from.handle.getSnapshot();
		if (part === from.part) return from.next;
		from.part = part;
		from.next = null;
		const input = confirmed(part) ? chain.next(part, from.input, at + 1) : null;
		if (input == null) return null;
		const key = entryKey(read.name, input);
		// A cursor the list has followed would read a page it holds again.
		for (let seen = 0; chain.linked && seen <= at; seen++)
			if (pages[seen]!.key === key) return null;
		return (from.next = { input, key });
	}

	/** Follow the chain again from the first confirmed page that no longer names the page after it. */
	function relink(): void {
		if (!chain.linked || staged) return;
		for (let at = 0; at < shown.length - 1; at++) {
			if (!confirmed(shown[at]!.handle.getSnapshot())) continue;
			if (nextOf(shown, at)?.key !== shown[at + 1]!.key) return void follow(shown.slice(0, at + 1));
		}
	}

	/**
	 * Load the pages after `pages` out of sight, as many as are shown, while the
	 * list shows what it last showed. `reload` loads `pages`' last page again
	 * first, and every page after it whether or not its value is current.
	 */
	function follow(pages: Page[], reload = false): Promise<void> {
		staged = { pages, count: shown.length, reload };
		snapshot = { ...(snapshot ?? getSnapshot()), refreshing: true };
		return advance(reload);
	}

	/** Load `staged` on, and tell the list's observers how it ended. */
	function advance(again: boolean): Promise<void> {
		const done = load(again).then(() => {
			if (following === done) following = null;
			notify();
		});
		return (following = done);
	}

	/** Load `staged` on from its last page, which `again` loads again first, until it is whole or a page fails. */
	async function load(again: boolean): Promise<void> {
		const { pages, count, reload } = staged!;
		if (again) await pages[pages.length - 1]!.handle.refresh();
		while (true) {
			const part = pages[pages.length - 1]!.handle.getSnapshot();
			if (!confirmed(part) || part.error !== undefined) {
				// The list stays as it was, and `loadMore` loads this page again.
				snapshot = { ...snapshot!, refreshing: false, error: part.error, more: true };
				return;
			}
			const next = pages.length < count ? nextOf(pages, pages.length - 1) : null;
			if (!next) {
				// Observe the new chain before letting go of the old, so a page in both stays observed.
				const old = stops;
				stops = listeners.size > 0 ? pages.map(watch) : [];
				for (const stop of old) stop();
				shown = pages;
				staged = null;
				parts = [];
				return;
			}
			const added = page(next.input);
			pages.push(added);
			await (reload ? added.handle.refresh() : store.prefetch(read, next.input));
		}
	}

	/**
	 * What a caller waiting for `added` waits on. An observed list holds its
	 * pages' loads by observing them, so a read that cancels stops when the list
	 * is let go, which a `prefetch` would prevent.
	 */
	const loading = (added: Page): Promise<void> =>
		read.cancel && listeners.size > 0
			? (internals.get(store)!.entries.get(added.key)?.inflight ?? Promise.resolve())
			: store.prefetch(read, added.input);

	function loadMore(): Promise<void> {
		if (following) return following;
		if (staged) {
			snapshot = { ...snapshot!, refreshing: true };
			notify();
			return advance(true);
		}
		const failed = shown.find((item) => item.handle.getSnapshot().status === 'error');
		if (failed) return failed.handle.refresh();
		const last = shown[shown.length - 1]!;
		const next = nextOf(shown, shown.length - 1);
		// A page being added is the one to wait for; nothing follows a last page.
		if (!next) {
			return shown.length > 1 && !confirmed(last.handle.getSnapshot())
				? loading(last)
				: Promise.resolve();
		}
		const added = page(next.input);
		shown.push(added);
		if (listeners.size > 0) stops.push(watch(added));
		notify();
		return loading(added);
	}

	function getSnapshot(): PagesSnapshot<any> {
		if (staged && snapshot) return snapshot;
		const current = shown.map((item) => item.handle.getSnapshot());
		if (
			snapshot &&
			current.length === parts.length &&
			current.every((part, index) => part === parts[index])
		)
			return snapshot;
		parts = current;
		const first = current[0]!;
		const last = current[current.length - 1]!;
		let rows: unknown[] = [];
		let reloading = false;
		// A page that is not ready, such as an expired one reloading, leaves only
		// its own rows out: the pages after it are still current.
		for (const part of current) {
			if (part.status === 'ready') rows.push(...chain.rows(part.value));
			else if (part !== last && part.status === 'pending') reloading = true;
		}
		// The same rows are the same array, so a reader of the rows alone sees no change.
		const before = snapshot?.value;
		if (before?.length === rows.length && rows.every((row, index) => row === before[index]))
			rows = before;
		const failed = current.find((part) => part.status === 'error');
		const ready = current.some((part) => part.status === 'ready');
		snapshot = {
			status: ready ? 'ready' : first.status,
			value: ready ? rows : undefined,
			error: failed ? failed.error : first.error,
			refreshing: reloading || current.some((part) => part.refreshing),
			stale: current.some((part) => part.stale),
			// A failed page, anywhere, is what `loadMore` does next.
			more: failed !== undefined || nextOf(shown, shown.length - 1) !== null,
			preview: current.some((part) => part.preview),
			loadingMore: current.length > 1 && !confirmed(last) && last.status !== 'error',
			loadMore,
		};
		return snapshot;
	}

	return {
		getSnapshot,
		subscribe(listener) {
			if (listeners.size === 0) {
				stops = shown.map(watch);
				relink();
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) for (const stop of stops.splice(0)) stop();
			};
		},
		loadMore,
		refresh() {
			if (following) return following;
			// A chain is read again from its first page, since each page names the next;
			// with nothing confirmed to keep showing, that page loads as any read does.
			if (chain.linked && confirmed(shown[0]!.handle.getSnapshot())) {
				const refreshing = follow([shown[0]!], true);
				notify();
				return refreshing;
			}
			return Promise.all(shown.map((item) => item.handle.refresh())).then(() => {});
		},
	};
}
