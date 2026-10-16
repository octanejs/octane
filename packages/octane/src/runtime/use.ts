// use() and fetch warming
//
// use(thenable) and the Suspense exception, batched parallel use(), fetch-tree
// warming, and the closure-free parallel-use ABI that the inline hook-memo tier
// compiles to.

import {
	missingSlot,
	depsChanged,
	resolveHookArgs,
	type MemoHookEntry,
	memoEntryHit,
	adoptMemoEntry,
	publishMemoEntry,
} from './hooks.js';
import { hydrating } from '../hydration-flag.js';
import { EXTERNAL_HYDRATION_PROMISE } from '../constants.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import {
	type SeedSites,
	type SeedSiteDriver,
	SEED_SITE_DRIVER,
	seedSite,
} from '../hydration/use-seeds.js';
import {
	type NativeReadWitness,
	validateNativeReadWitness,
} from '../signals/native-read-collector.js';
import type { HookSlot, Scope, Block } from './types.js';
import { resolveSlot } from './drivers.js';
import {
	beginNativeReadWitness,
	finishNativeReadWitness,
	replayNativeReadWitness,
} from './signal-owners.js';
import {
	ACTIVE_WARM_PLANS,
	TRANSITION_HARVEST,
	getRootRenderRetryKey,
	CURRENT_WARM,
	CURRENT_WARM_CLAIMS,
	WARM_EVER,
	runActiveWarmPlans,
	publishNativeMemoEntry,
} from './engine.js';
import { type WarmHarvestEntry, setMemoEntry } from './transitions.js';
import { HYDRATION_PASS } from './hydration.js';
import { blockRare } from './block.js';
import { CURRENT_SCOPE, CURRENT_BLOCK, CURRENT_WARM_EPISODE, RESUME_REPLAY } from './render.js';
import { forEachSubtreeChild } from './activity.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// ---------------------------------------------------------------------------
// Suspense — use(thenable) and the SuspenseException sentinel.
// ---------------------------------------------------------------------------

export interface TrackedThenable<T = any> extends PromiseLike<T> {
	status?: 'pending' | 'fulfilled' | 'rejected' | undefined;
	value?: T | undefined;
	reason?: any;
}

/**
 * Sentinel thrown by `use(pendingThenable)`. Intentionally NOT an Error so
 * userland try/catch is unlikely to swallow it — only our `tryBlock` knows
 * to look for it via `isSuspenseException`. Carries the thenable so the
 * boundary can attach a `then` listener and schedule a retry.
 */
export class SuspenseException {
	readonly __isSuspense = true;
	constructor(public readonly thenable: TrackedThenable<any>) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.SUSPEND_THROW);
	}
}

export function isSuspenseException(x: any): x is SuspenseException {
	try {
		return x !== null && typeof x === 'object' && (x as any).__isSuspense === true;
	} catch {
		// Error values can expose throwing accessors instead of a control marker.
		return false;
	}
}

export const HYDRATION_SITE_EVENTS = Symbol('octane.hydration.site-events');

export interface HydrationSeedArray extends Array<unknown> {
	[HYDRATION_SITE_EVENTS]?: SeedSites;
}

/**
 * Compiler-owned use() sites (hydration/use-seeds.ts), installed by the first
 * compiled seedOrCreate that a hydration pass seeds. Only that call writes
 * it, so an app without one folds every read away.
 */
export let SEED_SITES: SeedSiteDriver | null = null;

/**
 * Hydration uses the server's fulfilled value as the canonical first-render
 * result. An externally supplied or otherwise unoptimized client thenable may
 * already exist, so observe it without letting its eventual result replace the
 * seed. Otherwise a later client-side rejection is reported as unhandled even
 * though the authored use() already rendered the server's value.
 * Compiler-owned seeded factories never create a client thenable to observe.
 */
export function observeHydrationSeedThenable(thenable: TrackedThenable<unknown>): void {
	thenable.then(
		() => undefined,
		() => undefined,
	);
}

function hasExternalHydrationOwner(thenable: PromiseLike<unknown>): boolean {
	try {
		return (thenable as any)[EXTERNAL_HYDRATION_PROMISE] === true;
	} catch {
		return false;
	}
}

/** Compiler-owned direct use() creations consult their server-proven site outcome first. */
export function seedOrCreate<T>(site: string, factory: () => T): T {
	const hydration = hydrating && HYDRATION_PASS!.consumesSeeds() ? HYDRATION_PASS : null;
	const sites =
		hydration === null || hydration.seeds === null
			? undefined
			: (hydration.seeds as HydrationSeedArray)[HYDRATION_SITE_EVENTS];
	if (sites === undefined) return factory();
	SEED_SITES = SEED_SITE_DRIVER;
	return seedSite(sites, hydration!.seedCursor, site, factory);
}

export function useThenable<T>(thenable: TrackedThenable<T>, replaceOnResume = false): T {
	const block = CURRENT_BLOCK!;
	const rare = blockRare(block);
	const state: TrackedThenable<any>[] = (rare.thenables ??= []);
	const idx = rare.thenableIdx;
	rare.thenableIdx = idx + 1;

	// Hydration seeding (SSR Phase 4): the server already resolved this use() and
	// serialized the value. Adopt the next seeded value (use() calls hydrate in
	// the same render order the server produced them in) and mark the thenable
	// fulfilled, so this render and every later one return synchronously — no
	// re-suspend, no client re-fetch. Folds out for client-only builds.
	const hydration = hydrating && HYDRATION_PASS!.consumesSeeds() ? HYDRATION_PASS : null;
	if (
		hydration !== null &&
		hydration.seeds !== null &&
		hydration.seedCursor < hydration.seeds.length &&
		!hasExternalHydrationOwner(thenable)
	) {
		return hydration.useSeed(thenable, state, idx, replaceOnResume);
	}

	const stored = state[idx];
	if (stored !== undefined && stored !== thenable && !replaceOnResume)
		thenable = replayThenable(block, stored, thenable);
	// Replay path: same promise as last attempt, or the stored one a replay kept
	// — fast lookup of the cached entry.
	if (stored === thenable) {
		if (thenable.status === 'fulfilled') return thenable.value as T;
		if (thenable.status === 'rejected') throw thenable.reason;
		// Still pending — re-throw without re-tagging (already wired up).
		throw new SuspenseException(thenable);
	}

	// A batch that suspended before this unwrap ran recorded the replay's fresh
	// promise for its member. Keep the held one, as replayThenable does.
	if (rare.batchThenables !== undefined)
		thenable = heldBatchThenable(rare.batchThenables, thenable);
	// New thenable at this slot — tag status if untracked, attach listeners.
	state[idx] = thenable;
	trackThenable(thenable);
	if (thenable.status === 'fulfilled') return thenable.value as T;
	if (thenable.status === 'rejected') throw thenable.reason;
	// Waterfall diagnostic: a replay reached a use() slot this body had never
	// executed before (earlier slots have history, this one doesn't) and it is
	// pending — a sequential dependency the parallel-start transform could not
	// hoist. Informational, dev-compiled output only.
	if (
		process.env.NODE_ENV !== 'production' &&
		RESUME_REPLAY &&
		idx > 0 &&
		state[idx - 1] !== undefined
	)
		warnUseWaterfall(block, idx);
	throw new SuspenseException(thenable);
}

/**
 * Resume-replay leniency (React parity: ReactFiberThenable's "reuse the previous
 * thenable, and drop the new one"): the body is replaying after a resolution,
 * and an UNMEMOIZED creation minted a fresh promise for a use() call that
 * already holds `kept`. Components are assumed idempotent — keep it; the fresh
 * one's fetch already fired (that duplicate request is exactly what the
 * compiler's use()-argument memoization eliminates). Without this, a fresh
 * promise per replay re-suspends forever. Normal renders (updates with
 * genuinely new promises) keep the new one.
 */
function replayThenable(
	block: Block,
	kept: TrackedThenable<any>,
	thenable: TrackedThenable<any>,
): TrackedThenable<any> {
	if (!RESUME_REPLAY) return thenable;
	if (process.env.NODE_ENV !== 'production') warnUncachedUsePromise(block);
	return kept;
}

/**
 * Wakeables whose settlement a Suspense resume listener has already observed.
 * A retry can suspend on one again: a resource reader whose own state lags its
 * resolved promise, or use() of a thenable whose status React does not
 * recognize (router-core reports `'resolved'`), which stays pending by design.
 * A listener attached after settlement fires on the next microtask, so retrying
 * there would re-render forever and starve the timer or network callback that
 * ends the suspension. React's ping reaches its retry through a Scheduler task.
 */
let SETTLED_WAKEABLES: WeakSet<PromiseLike<unknown>> | null = null;

/**
 * Subscribe a Suspense retry to `wakeable`. A first settlement retries on its
 * own microtask, keeping ordinary data reveals immediate. Once a settlement has
 * been observed, the retry yields one macrotask after the next notification.
 * It still subscribes, so a reusable custom wakeable is not turned into polling.
 */
export function resumeOnSettle(wakeable: PromiseLike<unknown>, retry: () => void): void {
	const onSettle =
		SETTLED_WAKEABLES?.has(wakeable) === true
			? () => void setTimeout(retry, 0)
			: () => {
					(SETTLED_WAKEABLES ??= new WeakSet()).add(wakeable);
					retry();
				};
	wakeable.then(onSettle, onSettle);
}

// Tag a thenable's `status`/`value`/`reason` expandos and attach the settle
// listeners exactly once (a thenable that already carries a status — React 19
// cache() shape, or one we tagged earlier — is left untouched).
export function trackThenable(thenable: TrackedThenable<any>): void {
	if (thenable.status !== undefined) return;
	thenable.status = 'pending';
	thenable.then(
		(v) => {
			thenable.status = 'fulfilled';
			thenable.value = v;
		},
		(e) => {
			thenable.status = 'rejected';
			thenable.reason = e;
		},
	);
}

// ---------------------------------------------------------------------------
// Parallel use() — batched unwrap + fetch-tree warming.
// (docs/suspense-parallel-use-plan.md; emitted by the compiler as _$useBatch /
// _$warmMemo / _$warmChild.)
// ---------------------------------------------------------------------------

/** Dev gate, matching the hydration-warning convention: source-location
 * metadata (`__s.locs` / `__s.locFile`) exists only in dev-compiled output,
 * so prod stays silent while the recovery behavior itself runs everywhere. */
function devHintsEnabled(): boolean {
	const s = CURRENT_SCOPE as any;
	return s != null && (s.locs !== undefined || s.locFile !== undefined);
}
const warnedUncached = new WeakSet<Block>();
function warnUncachedUsePromise(block: Block): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (!devHintsEnabled() || warnedUncached.has(block)) return;
	warnedUncached.add(block);
	console.error(
		'A component was suspended by an uncached promise: a replay created a fresh ' +
			'promise for a use() slot that already had one, so the stored promise was ' +
			'reused and the fresh request was wasted. Create the promise outside the ' +
			'component or cache it. The compiler automatically memoizes analyzable ' +
			'component-local use() arguments per call site.',
	);
}
const warnedWaterfall = new WeakSet<Block>();
function warnUseWaterfall(block: Block, idx: number): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (!devHintsEnabled() || warnedWaterfall.has(block)) return;
	warnedWaterfall.add(block);
	console.error(
		`use() waterfall: a replay discovered a new pending promise at call index ${idx} ` +
			'that only starts after the earlier use() resolved. If it does not depend on ' +
			'the earlier value, restructure so both promises are created before the first ' +
			'use(). The compiler does this automatically for analyzable independent ' +
			'component-local arguments.',
	);
}

/**
 * Batched unwrap for a stratum of use() promises (compiler-emitted before the
 * unwrap statements). Tags every thenable, skips non-thenables (Contexts pass
 * through untouched), and — if any are still pending — throws ONE
 * SuspenseException whose thenable settles when ALL members fulfil or the
 * FIRST member rejects. One boundary retry per stratum instead of one per
 * promise; the unwraps then read settled values from the thenable expandos in
 * their original (hydration-seed-preserving) order.
 *
 * `warm` is the compiler-built fetch-tree thunk. On an empty compiler batch it
 * registers lazily for the active component frame; on a throwing data batch,
 * it joins every registered ancestor plan and prefetches provably-independent
 * descendants via warmChild/warmMemo. A resolved batch costs no warm work.
 */
export function useBatch(items: any[], warm?: () => void): void {
	// Compiler registration form: publish the component's child-only plan on
	// the active render stack. It is intentionally lazy — a fully synchronous
	// tree neither walks its children nor allocates a warm cache.
	if (items.length === 0) {
		if (warm !== undefined) ACTIVE_WARM_PLANS.push(CURRENT_BLOCK!, warm, undefined);
		return;
	}
	// Hydrating: every use() adopts a server seed synchronously — nothing to
	// batch, and warming would duplicate fetches the server already resolved.
	const hydration = hydrating && HYDRATION_PASS!.consumesSeeds() ? HYDRATION_PASS : null;
	if (hydration !== null && hydration.seeds !== null) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.USE_STRATUM);
	let pending: TrackedThenable<any>[] | null = null;
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (it == null || typeof it.then !== 'function') continue; // Context / non-thenable
		trackThenable(it);
		// A rejected member ends the batch AT ITS POSITION (sequential
		// semantics): earlier pendings still gate (suspend on them), but later
		// members must not — the unwraps need to run so this rejection reaches
		// its use() and routes to @catch instead of re-suspending forever.
		if (it.status === 'rejected') break;
		if (it.status === 'pending') {
			pending = holdBatchThenables(items);
			break;
		}
	}
	if (pending === null) return;
	runActiveWarmPlans(warm);
	// Single pending member: suspend on it DIRECTLY — semantics (and microtask
	// hop count) identical to a plain use() suspension, and attachResume's
	// pendingThenable dedup keeps working on the stable promise identity.
	if (pending.length === 1) throw new SuspenseException(pending[0]);
	const members = pending;
	let remaining = members.length;
	const combined: TrackedThenable<void> = new Promise<void>((resolve, reject) => {
		for (let i = 0; i < members.length; i++) {
			members[i].then(() => {
				if (--remaining === 0) resolve();
			}, reject);
		}
	});
	throw new SuspenseException(combined);
}

/**
 * A batch suspends before its unwraps reach useThenable, so it applies the
 * resume-replay leniency itself and returns the members it suspends on. It
 * holds each member at the call position its unwrap takes when no other use()
 * runs in between. A replay that brings a fresh promise for a held member keeps
 * the held one, and records the fresh one so the unwrap can find the held one
 * wherever its call lands.
 */
function holdBatchThenables(items: any[]): TrackedThenable<any>[] | null {
	const block = CURRENT_BLOCK!;
	const rare = blockRare(block);
	// renderBlockInner drops the held entries along with `thenables`.
	rare.thenables ??= [];
	const held: TrackedThenable<any>[] = (rare.batchThenables ??= []);
	let pending: TrackedThenable<any>[] | null = null;
	for (let i = 0, at = rare.thenableIdx * 2; i < items.length; i++) {
		let it = items[i];
		if (it == null || typeof it.then !== 'function') continue;
		trackThenable(it);
		// Held entries survive only the replays of one suspension episode.
		const kept = held[at];
		if (kept === undefined) held[at] = it;
		else if (kept !== it) {
			held[at + 1] = it;
			it = replayThenable(block, kept, it);
		}
		at += 2;
		// The same rejected-member cutoff as useBatch, on the kept members.
		if (it.status === 'rejected') break;
		if (it.status === 'pending') (pending ??= []).push(it);
	}
	return pending;
}

function heldBatchThenable(
	held: TrackedThenable<any>[],
	thenable: TrackedThenable<any>,
): TrackedThenable<any> {
	for (let i = 1; i < held.length; i += 2) if (held[i] === thenable) return held[i - 1];
	return thenable;
}

/** @internal Compiler-owned registration for a component warm plan. */
export function registerWarmPlan(fn: (props: any) => void, props: any): void {
	// This must register before the first descendant suspends, even in an app
	// that has never warmed. The enclosing render's checkpoint drops the registration
	// on normal return, suspension, and rollback.
	ACTIVE_WARM_PLANS.push(CURRENT_BLOCK!, fn, props);
}

// ── Fetch-tree warming ──────────────────────────────────────────────────────
//
// A warm cache is a per-block Map<slot, Array<{deps, value, available}>>
// populated by warmMemo during a suspended body's warm walk and consumed once
// by useMemo when the real descendant mounts. Equal-dependency occurrences get
// separate entries. A consumed entry remains as a tombstone so a later pending
// stratum cannot restart that speculative creation. The cache lives on the
// outermost active plan's block, making it visible to adjacent descendants
// through their parentBlock chains. Its episode tag makes every entry
// unreachable on the next ordinary render, while preserving it across retries
// and dependency strata of the current suspend.

export interface WarmEntry {
	deps: any[];
	value: any;
	/** Real memo cell represented by an unavailable entry, when applicable. */
	source?: MemoHookEntry | undefined;
	/** A warmed value may be adopted once; the retained tombstone still prevents
	 * a later dependency stratum from speculatively creating it again. */
	available: boolean;
	nativeWitness?: NativeReadWitness | null;
}

type WarmMemoEvidence = MemoHookEntry | WarmEntry | WarmHarvestEntry;
type WarmMemoAccept = (entry: WarmMemoEvidence) => boolean;

interface NativeWarmMemoMode {
	accept: WarmMemoAccept;
	create: (compute: () => any, deps: any[]) => WarmEntry;
}
// New episodes cannot match an older attached cache. Keep the maximum rather
// than the last attachment's episode: independent roots may resume older work.
let LATEST_WARM_CACHE_EPISODE = 0;
let WARM_DEPTH = 0;
const WARM_DEPTH_CAP = 64;
// Do not cap per-slot occurrence queues: dropping their FIFO head would map a
// repeated component instance to a later instance's value. The whole cache is
// invalidated when the next ordinary render starts a new suspend episode.
export const WARM_MISS = Symbol('octane.warm.miss');
/** Root retry tokens survive discarded first mounts without retaining a Scope. */
let ROOT_WARM_RETRIES: WeakMap<object, Map<HookSlot, WarmEntry[]>> | null = null;

function rootWarmRetryKey(block: Block): object | null {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		// Scoped Suspense/Activity already retain their own ancestor warm cache.
		if (current.rare?.suspenseHandler) return null;
	}
	return getRootRenderRetryKey(block);
}

export function warmCacheForOwner(owner: Block): Map<HookSlot, WarmEntry[]> {
	for (let block: Block | null = owner; block !== null; block = block.parentBlock) {
		const rare = block.rare;
		if (rare === null || rare.warmCacheEpisode !== CURRENT_WARM_EPISODE) continue;
		const existing = rare.warmCache;
		if (existing !== undefined) return existing;
	}
	const retryKey = rootWarmRetryKey(owner);
	let cache = retryKey === null ? undefined : ROOT_WARM_RETRIES?.get(retryKey);
	if (cache === undefined) {
		cache = new Map<HookSlot, WarmEntry[]>();
		if (retryKey !== null) (ROOT_WARM_RETRIES ??= new WeakMap()).set(retryKey, cache);
	}
	const ownerRare = blockRare(owner);
	ownerRare.warmCache = cache;
	ownerRare.warmCacheEpisode = CURRENT_WARM_EPISODE;
	if (CURRENT_WARM_EPISODE > LATEST_WARM_CACHE_EPISODE)
		LATEST_WARM_CACHE_EPISODE = CURRENT_WARM_EPISODE;
	return cache;
}

export function claimWarmMemoRecord(
	adopted: WarmEntry | WarmHarvestEntry,
	source: MemoHookEntry,
): void {
	if (!('available' in adopted)) return;
	adopted.source = source;
	adopted.value = undefined;
	source.warmRecord = adopted;
}

/**
 * The first-mount list/root discard drops hook scopes before they can replay.
 * Return only those concrete occurrences to their existing warm queue. Live
 * siblings retain consumed records; ordinary unmount never calls this helper.
 */
export function retainDiscardedWarmMemos(scope: Scope): void {
	if (!WARM_EVER) return;
	if (scope.hooks !== null) {
		for (const candidate of scope.hooks.values()) {
			const memo = candidate as MemoHookEntry | null;
			const record = memo?.warmRecord;
			if (record === undefined || record.source !== memo) continue;
			record.source = undefined;
			record.value = memo.value;
			record.available = true;
			if (memo.nativeWitness !== undefined) record.nativeWitness = memo.nativeWitness;
			memo.warmRecord = undefined;
		}
	}
	forEachSubtreeChild(scope, retainDiscardedWarmMemos);
}

export function blockIsAncestor(ancestor: Block, block: Block): boolean {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current === ancestor) return true;
	}
	return false;
}

function activeMemoMatch(
	slot: HookSlot,
	deps: any[],
	accept?: WarmMemoAccept,
): MemoHookEntry | null {
	for (let block: Block | null = CURRENT_BLOCK; block !== null; block = block.parentBlock) {
		const entry = block.hooks?.get(slot) as MemoHookEntry | undefined;
		if (
			entry !== undefined &&
			entry.deps !== undefined &&
			!depsChanged(entry.deps, deps) &&
			!CURRENT_WARM_CLAIMS?.has(entry) &&
			(accept === undefined || accept(entry))
		) {
			return entry;
		}
	}
	return null;
}

/**
 * Start (and cache) one prefetched creation. Each warm-plan occurrence claims
 * one matching (slot, deps) entry, so retries reuse the same concrete work while
 * repeated equal-dependency component instances still get separate entries.
 * The value is status-tagged immediately so the real use() unwrap reads it
 * directly.
 */
export function warmMemo(
	compute: () => any,
	deps: any[],
	slot: HookSlot,
	native?: NativeWarmMemoMode,
): void {
	if (!CURRENT_WARM) return;
	const cache = CURRENT_WARM;
	let list = cache.get(slot);
	if (list !== undefined) {
		for (let i = 0; i < list.length; i++) {
			const entry = list[i];
			if (
				depsChanged(entry.deps, deps) ||
				CURRENT_WARM_CLAIMS?.has(entry) ||
				(native !== undefined && !native.accept(entry))
			)
				continue;
			CURRENT_WARM_CLAIMS?.add(entry);
			if (entry.source !== undefined) CURRENT_WARM_CLAIMS?.add(entry.source);
			return; // this concrete occurrence already ran or warmed
		}
	}
	// An ancestor plan can recurse through the component whose real memo already
	// created this value before its batch discovered suspension. Record a consumed
	// tombstone instead of duplicating that creation; later strata then remain
	// deduped even after the active component has returned.
	const activeMemo = activeMemoMatch(slot, deps, native?.accept);
	if (activeMemo !== null) {
		CURRENT_WARM_CLAIMS?.add(activeMemo);
		if (list === undefined) {
			list = [];
			cache.set(slot, list);
		}
		const entry = { deps, value: undefined, available: false, source: activeMemo };
		list.push(entry);
		activeMemo.warmRecord = entry;
		CURRENT_WARM_CLAIMS?.add(entry);
		return;
	}
	// A retried transition starts a fresh warm episode, but values its dropped
	// rounds created remain in the episode-agnostic harvest. Claim the matching
	// occurrence for this plan without consuming it: the real memo still owns
	// adoption, and an already-adopted entry remains a tombstone for that
	// occurrence when a later sibling suspends in the same round.
	const harvest = TRANSITION_HARVEST;
	if (harvest !== null) {
		const owner = CURRENT_BLOCK?.idState.renderOwner;
		for (let i = 0; i < harvest.length; i++) {
			const entry = harvest[i];
			if (
				entry.owner !== owner ||
				entry.slot !== slot ||
				depsChanged(entry.deps, deps) ||
				CURRENT_WARM_CLAIMS?.has(entry) ||
				(native !== undefined && !native.accept(entry))
			) {
				continue;
			}
			CURRENT_WARM_CLAIMS?.add(entry);
			return;
		}
	}
	let entry: WarmEntry;
	try {
		entry =
			native === undefined
				? { deps, value: compute(), available: true }
				: native.create(compute, deps);
	} catch {
		return; // speculative — a throwing creation is simply not warmed
	}
	const value = entry.value;
	if (value != null && typeof value.then === 'function') trackThenable(value);
	if (list === undefined) {
		list = [];
		cache.set(slot, list);
	}
	list.push(entry);
	CURRENT_WARM_CLAIMS?.add(entry);
}

function nativeMemoEvidenceValid(entry: WarmMemoEvidence): boolean {
	const source = 'source' in entry && entry.source !== undefined ? entry.source : entry;
	const witness = source.nativeWitness;
	// Undefined means this entry predates the native compiler capability. Null
	// is the intentional witness for a successful computation with no reads.
	return witness !== undefined && validateNativeReadWitness(witness);
}

function createNativeWarmEntry(compute: () => any, deps: any[]): WarmEntry {
	const token = beginNativeReadWitness(true);
	let completed = false;
	let value: any;
	let nativeWitness: NativeReadWitness | null;
	try {
		value = compute();
		completed = true;
	} finally {
		nativeWitness = finishNativeReadWitness(token, completed);
	}
	return { deps, value, available: true, nativeWitness };
}

const NATIVE_WARM_MEMO_MODE: NativeWarmMemoMode = {
	accept: nativeMemoEvidenceValid,
	create: createNativeWarmEntry,
};

/** @internal Speculation collects evidence without subscribing its ancestor. */
export function nativeWarmMemo(compute: () => any, deps: any[], slot: HookSlot): void {
	warmMemo(compute, deps, slot, NATIVE_WARM_MEMO_MODE);
}

/**
 * Recurse the warm walk into a child component's compiled fetch plan
 * (`Comp.__warm`, emitted by the compiler when the child's reachability and
 * props are provably independent of suspended values). No-ops for components
 * without a plan. Depth-capped as a backstop for recursion the compiler
 * cannot prove finite.
 */
export function warmChild(comp: any, props: any): void {
	if (!CURRENT_WARM || comp == null) return;
	const plan = comp.__warm;
	if (typeof plan !== 'function') return;
	if (WARM_DEPTH >= WARM_DEPTH_CAP) {
		if (process.env.NODE_ENV !== 'production' && devHintsEnabled()) {
			console.error(
				`warmChild: fetch-tree warm walk exceeded ${WARM_DEPTH_CAP} levels — ` +
					'stopping speculative prefetch here (rendering is unaffected). ' +
					'Is a recursive component missing its termination guard?',
			);
		}
		return;
	}
	WARM_DEPTH++;
	try {
		plan(props);
	} catch {
		// Speculative — ignore.
	} finally {
		WARM_DEPTH--;
	}
}

/** Compiler-owned plans must not follow static hoisting onto unrelated HOCs. */
export function markWarm<T extends Function>(component: T, plan: unknown): T {
	Object.defineProperty(component, '__warm', {
		configurable: true,
		get() {
			return this === component ? plan : undefined;
		},
	});
	return component;
}

/** Adoption lookup for useMemo: nearest ancestor warm cache entry for this
 * slot with matching deps. The value is consumed once; its tombstone remains
 * to dedup later warm passes without being adoptable by another instance. */
export function adoptWarmEntry(
	slot: HookSlot,
	deps: any[],
	accept?: WarmMemoAccept,
): WarmEntry | WarmHarvestEntry | typeof WARM_MISS {
	// Root retries and held-transition harvests below are independently eligible.
	let b: Block | null = CURRENT_WARM_EPISODE <= LATEST_WARM_CACHE_EPISODE ? CURRENT_BLOCK : null;
	while (b !== null) {
		const rare = b.rare;
		const cache = rare?.warmCache;
		if (cache !== undefined && rare!.warmCacheEpisode === CURRENT_WARM_EPISODE) {
			const entry = adoptWarmCacheEntry(cache, slot, deps, accept);
			if (entry !== WARM_MISS) return entry;
		}
		b = b.parentBlock;
	}
	const retryKey = CURRENT_BLOCK?.idState.renderOwner?.retryKey;
	const retryCache = retryKey == null ? undefined : ROOT_WARM_RETRIES?.get(retryKey);
	if (retryCache !== undefined) {
		const entry = adoptWarmCacheEntry(retryCache, slot, deps, accept);
		if (entry !== WARM_MISS) return entry;
	}
	// Held-transition fallback: a dropped round's harvest is episode-agnostic, so
	// a later transition render (whatever episode it minted) still adopts the
	// fetch that round already started instead of creating it again. An urgent
	// render never adopts the uncommitted work of a held transition.
	const harvestList = TRANSITION_HARVEST;
	if (harvestList !== null && CURRENT_BLOCK?.currentRenderMode === 'transition') {
		const owner = CURRENT_BLOCK.idState.renderOwner;
		for (let i = 0; i < harvestList.length; i++) {
			const entry = harvestList[i];
			if (
				!entry.taken &&
				entry.owner === owner &&
				entry.slot === slot &&
				!depsChanged(entry.deps, deps) &&
				(accept === undefined || accept(entry))
			) {
				entry.taken = true;
				return entry;
			}
		}
	}
	return WARM_MISS;
}

function adoptWarmCacheEntry(
	cache: Map<HookSlot, WarmEntry[]>,
	slot: HookSlot,
	deps: any[],
	accept?: WarmMemoAccept,
): WarmEntry | typeof WARM_MISS {
	const list = cache.get(slot);
	if (list !== undefined) {
		for (const entry of list) {
			if (
				entry.available &&
				!depsChanged(entry.deps, deps) &&
				(accept === undefined || accept(entry))
			) {
				entry.available = false;
				return entry;
			}
		}
	}
	return WARM_MISS;
}

// ---------------------------------------------------------------------------
// Closure-free parallel-use creation ABI (inline hook-memo tier).
//
// The production compiler lowers each Pass A creation
// (`_$useMemo(() => make(a, b), [a, b], _h$N)`) to
//
//   __pu$0 = _$puTake2(_h$N, _d0, _d1);
//   if (__pu$0 === _$puMiss) __pu$0 = _$puPub(_h$N, make(_d0, _d1), _d0, _d1);
//
// so the per-render arrow + deps-array allocations disappear; the deps array
// is built only on the take's cold branches (warm adoption / publish, where a
// fetch is being started anyway). puTakeK + puPub together are exactly
// useMemo's thenable-creation path split at the compute: the same scope.hooks
// entry (Symbol slot — warm-visible to activeMemoMatch / adoptWarmValue), the
// same hit-side recordRealWarmMemo episode stamping, the same warm adoption
// before compute, and the same publish tail. `puMiss` is a dedicated sentinel
// so a legitimately-`undefined` cached creation value round-trips.
// ---------------------------------------------------------------------------

export const puMiss: unique symbol = Symbol('octane.pu.miss');

type PuMemoEntry = MemoHookEntry;

function puAdopt(slot: HookSlot, deps: any[]): any {
	const entry = adoptMemoEntry(CURRENT_SCOPE!, slot, deps);
	return entry === null ? puMiss : entry.value;
}

export function puTake0(slot: HookSlot): any {
	const prev = CURRENT_SCOPE!.hooks?.get(slot) as PuMemoEntry | undefined;
	if (prev !== undefined && prev.deps !== undefined && prev.deps.length === 0) {
		return memoEntryHit(slot, prev).value;
	}
	if (WARM_EVER) return puAdopt(slot, []);
	return puMiss;
}

export function puTake1(slot: HookSlot, d0: any): any {
	const prev = CURRENT_SCOPE!.hooks?.get(slot) as PuMemoEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (pd !== undefined && pd.length === 1 && Object.is(pd[0], d0)) {
			return memoEntryHit(slot, prev).value;
		}
	}
	if (WARM_EVER) return puAdopt(slot, [d0]);
	return puMiss;
}

export function puTake2(slot: HookSlot, d0: any, d1: any): any {
	const prev = CURRENT_SCOPE!.hooks?.get(slot) as PuMemoEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (pd !== undefined && pd.length === 2 && Object.is(pd[0], d0) && Object.is(pd[1], d1)) {
			return memoEntryHit(slot, prev).value;
		}
	}
	if (WARM_EVER) return puAdopt(slot, [d0, d1]);
	return puMiss;
}

export function puTake3(slot: HookSlot, d0: any, d1: any, d2: any): any {
	const prev = CURRENT_SCOPE!.hooks?.get(slot) as PuMemoEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (
			pd !== undefined &&
			pd.length === 3 &&
			Object.is(pd[0], d0) &&
			Object.is(pd[1], d1) &&
			Object.is(pd[2], d2)
		) {
			return memoEntryHit(slot, prev).value;
		}
	}
	if (WARM_EVER) return puAdopt(slot, [d0, d1, d2]);
	return puMiss;
}

export function puTake4(slot: HookSlot, d0: any, d1: any, d2: any, d3: any): any {
	const prev = CURRENT_SCOPE!.hooks?.get(slot) as PuMemoEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (
			pd !== undefined &&
			pd.length === 4 &&
			Object.is(pd[0], d0) &&
			Object.is(pd[1], d1) &&
			Object.is(pd[2], d2) &&
			Object.is(pd[3], d3)
		) {
			return memoEntryHit(slot, prev).value;
		}
	}
	if (WARM_EVER) return puAdopt(slot, [d0, d1, d2, d3]);
	return puMiss;
}

export function puPub(slot: HookSlot, value: any, ...deps: any[]): any {
	return publishMemoEntry(CURRENT_SCOPE!, slot, deps, value);
}

function nativeMemoEntryHit(slot: HookSlot, entry: MemoHookEntry): any {
	replayNativeReadWitness(entry.nativeWitness);
	return memoEntryHit(slot, entry).value;
}

function adoptNativeMemoEntry(scope: Scope, slot: HookSlot, deps: any[]): MemoHookEntry | null {
	const adopted = adoptWarmEntry(slot, deps, nativeMemoEvidenceValid);
	if (adopted === WARM_MISS) return null;
	const entry: MemoHookEntry = {
		deps,
		value: adopted.value,
		warmEpisode: CURRENT_WARM_EPISODE,
		warmRecord: undefined,
		nativeWitness: adopted.nativeWitness,
	};
	setMemoEntry(scope, slot, entry);
	claimWarmMemoRecord(adopted, entry);
	replayNativeReadWitness(entry.nativeWitness);
	return entry;
}

function nativePuAdopt(slot: HookSlot, deps: any[]): any {
	const entry = adoptNativeMemoEntry(CURRENT_SCOPE!, slot, deps);
	return entry === null ? puMiss : entry.value;
}

/** @internal Native creation caches retain the existing promise and warm ABI. */
export function nativePuMemo<T>(
	compute: (...deps: any[]) => T,
	deps: any[] | undefined,
	slot?: HookSlot,
): T {
	const [d, s] = resolveHookArgs('useMemo', deps, slot);
	const scope = CURRENT_SCOPE!;
	const previous = scope.hooks?.get(s) as MemoHookEntry | undefined;
	if (
		previous !== undefined &&
		d !== undefined &&
		!depsChanged(previous.deps, d) &&
		nativeMemoEvidenceValid(previous)
	)
		return nativeMemoEntryHit(s, previous);
	if (WARM_EVER && d !== undefined) {
		const adopted = adoptNativeMemoEntry(scope, s, d);
		if (adopted !== null) return adopted.value;
	}
	const token = beginNativeReadWitness();
	let completed = false;
	let value: T;
	let nativeWitness: NativeReadWitness | null;
	try {
		// Preserve useMemo's positional dependency arguments for generated sites.
		// eslint-disable-next-line prefer-spread
		value = compute.apply(null, (d ?? []) as []);
		completed = true;
	} finally {
		nativeWitness = finishNativeReadWitness(token, completed);
	}
	return publishNativeMemoEntry(scope, s, d, value, nativeWitness);
}

export function nativePuTake0(slot: HookSlot): any {
	const previous = CURRENT_SCOPE!.hooks?.get(slot) as MemoHookEntry | undefined;
	if (
		previous !== undefined &&
		previous.deps !== undefined &&
		previous.deps.length === 0 &&
		nativeMemoEvidenceValid(previous)
	)
		return nativeMemoEntryHit(slot, previous);
	return WARM_EVER ? nativePuAdopt(slot, []) : puMiss;
}

export function nativePuTake1(slot: HookSlot, d0: any): any {
	const previous = CURRENT_SCOPE!.hooks?.get(slot) as MemoHookEntry | undefined;
	if (previous !== undefined) {
		const deps = previous.deps;
		if (
			deps !== undefined &&
			deps.length === 1 &&
			Object.is(deps[0], d0) &&
			nativeMemoEvidenceValid(previous)
		)
			return nativeMemoEntryHit(slot, previous);
	}
	return WARM_EVER ? nativePuAdopt(slot, [d0]) : puMiss;
}

export function nativePuTake2(slot: HookSlot, d0: any, d1: any): any {
	const previous = CURRENT_SCOPE!.hooks?.get(slot) as MemoHookEntry | undefined;
	if (previous !== undefined) {
		const deps = previous.deps;
		if (
			deps !== undefined &&
			deps.length === 2 &&
			Object.is(deps[0], d0) &&
			Object.is(deps[1], d1) &&
			nativeMemoEvidenceValid(previous)
		)
			return nativeMemoEntryHit(slot, previous);
	}
	return WARM_EVER ? nativePuAdopt(slot, [d0, d1]) : puMiss;
}

export function nativePuTake3(slot: HookSlot, d0: any, d1: any, d2: any): any {
	const previous = CURRENT_SCOPE!.hooks?.get(slot) as MemoHookEntry | undefined;
	if (previous !== undefined) {
		const deps = previous.deps;
		if (
			deps !== undefined &&
			deps.length === 3 &&
			Object.is(deps[0], d0) &&
			Object.is(deps[1], d1) &&
			Object.is(deps[2], d2) &&
			nativeMemoEvidenceValid(previous)
		)
			return nativeMemoEntryHit(slot, previous);
	}
	return WARM_EVER ? nativePuAdopt(slot, [d0, d1, d2]) : puMiss;
}

export function nativePuTake4(slot: HookSlot, d0: any, d1: any, d2: any, d3: any): any {
	const previous = CURRENT_SCOPE!.hooks?.get(slot) as MemoHookEntry | undefined;
	if (previous !== undefined) {
		const deps = previous.deps;
		if (
			deps !== undefined &&
			deps.length === 4 &&
			Object.is(deps[0], d0) &&
			Object.is(deps[1], d1) &&
			Object.is(deps[2], d2) &&
			Object.is(deps[3], d3) &&
			nativeMemoEvidenceValid(previous)
		)
			return nativeMemoEntryHit(slot, previous);
	}
	return WARM_EVER ? nativePuAdopt(slot, [d0, d1, d2, d3]) : puMiss;
}

/** @internal Publish the result and its evidence together after computation succeeds. */
export function nativePuPub(
	slot: HookSlot,
	value: any,
	witness: NativeReadWitness | null,
	...deps: any[]
): any {
	return publishNativeMemoEntry(CURRENT_SCOPE!, slot, deps, value, witness);
}

// General closure-free memo ABI for authored helpers/custom hooks. Resolve the
// custom-hook path once, then retain the resolved slot through take + publish.
// Unlike parallel-use's value sentinel, a nullable ENTRY handles every authored
// memo value, including undefined, null, and puMiss itself. Dependency hits do
// not construct a callback or dependency array.
// The compiler passes the hook's name only with an authored slot, which a manual
// hook may leave undefined; a slot it appended always resolves.
export function memoSlot(slot: HookSlot | undefined, name?: 'useMemo' | 'useCallback'): HookSlot {
	const resolved = resolveSlot(slot);
	if (resolved === undefined) missingSlot(name!);
	return resolved;
}

export function memoTake0(slot: HookSlot): MemoHookEntry | null {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as MemoHookEntry | undefined;
	if (prev !== undefined && prev.deps !== undefined && prev.deps.length === 0) {
		return memoEntryHit(slot, prev);
	}
	return WARM_EVER ? adoptMemoEntry(scope, slot, []) : null;
}

export function memoTake1(slot: HookSlot, d0: any): MemoHookEntry | null {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as MemoHookEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (pd !== undefined && pd.length === 1 && Object.is(pd[0], d0)) {
			return memoEntryHit(slot, prev);
		}
	}
	return WARM_EVER ? adoptMemoEntry(scope, slot, [d0]) : null;
}

export function memoTake2(slot: HookSlot, d0: any, d1: any): MemoHookEntry | null {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as MemoHookEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (pd !== undefined && pd.length === 2 && Object.is(pd[0], d0) && Object.is(pd[1], d1)) {
			return memoEntryHit(slot, prev);
		}
	}
	return WARM_EVER ? adoptMemoEntry(scope, slot, [d0, d1]) : null;
}

export function memoTake3(slot: HookSlot, d0: any, d1: any, d2: any): MemoHookEntry | null {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as MemoHookEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (
			pd !== undefined &&
			pd.length === 3 &&
			Object.is(pd[0], d0) &&
			Object.is(pd[1], d1) &&
			Object.is(pd[2], d2)
		) {
			return memoEntryHit(slot, prev);
		}
	}
	return WARM_EVER ? adoptMemoEntry(scope, slot, [d0, d1, d2]) : null;
}

export function memoTake4(
	slot: HookSlot,
	d0: any,
	d1: any,
	d2: any,
	d3: any,
): MemoHookEntry | null {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as MemoHookEntry | undefined;
	if (prev !== undefined) {
		const pd = prev.deps;
		if (
			pd !== undefined &&
			pd.length === 4 &&
			Object.is(pd[0], d0) &&
			Object.is(pd[1], d1) &&
			Object.is(pd[2], d2) &&
			Object.is(pd[3], d3)
		) {
			return memoEntryHit(slot, prev);
		}
	}
	return WARM_EVER ? adoptMemoEntry(scope, slot, [d0, d1, d2, d3]) : null;
}
