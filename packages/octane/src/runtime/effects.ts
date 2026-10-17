// Effect queues
//
// Effect queues and phases, deferred layout capture, the useSyncExternalStore
// commit sync, post-paint scheduling and commit order.

import {
	DEFERRED_LAYOUT_DRIVER,
	NATIVE_ADOPTION_RELEASES,
	scheduleNativeRead,
	EFFECT_BODY_DEPTH,
	REF_CALLBACK_DEPTH,
	runEffectCleanupCallback,
	QUEUE,
	TRANSITION_QUEUE,
	TRANSITION_FALLS,
	PENDING_SIGNAL_PROMOTIONS,
	COMMITTING_OWNER,
	ROOT_RENDER_TRANSACTIONS,
	refAttachQueue,
	MaximumUpdateDepthError,
	reportEffectError,
	runEffectBody,
} from './engine.js';
import { hydrationStarted } from '../hydration-flag.js';
import { __profileQueueCleanup, __profileWorkEnter, __profileRootExit } from '../profiling.js';
import type { NativeAdoptionState } from '../signals/native-read-seeds.js';
import type {
	Cleanup,
	Block,
	EffectSlot,
	PendingEffect,
	RootRenderTransaction,
	StoreInst,
	RefAttach,
	UncommittedRefAttaches,
	TryHandler,
} from './types.js';
import { drainPassivePhase, schedulePassiveFlush, NATIVE_READ_DRIVER } from './drivers.js';
import {
	storeSyncQueue,
	type RefStateUpdate,
	blockSubtreeDisposed,
	discardSubtreeRefAttachesFrom,
} from './refs.js';
import { type StateSlot, deferHiddenRevealAction, inInactiveSubtree } from './hooks.js';
import { RENDER_VALID } from './block.js';
import { findScheduledVisibilityOwner } from './suspense.js';
import {
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	effectEventQueue,
	effectEventCommitActions,
	WIP_CAPTURE,
} from './render.js';
import type { InlineCaughtErrorReport } from './roots.js';
import { journalObjectOnce } from './commit.js';
import { hasControlledSyncs } from './forms.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

interface EffectStateSnapshot {
	deps: any[] | undefined;
	revision: number;
	active: boolean;
}

export type EffectDepsSnapshot = Map<EffectSlot, EffectStateSnapshot>;
// Store consistency checks are commit-spawned updates as well. Keeping a
// distinct depth lets unstable getSnapshot values share the nested-update guard
// without pretending the store check itself is a user effect or ref callback.
let STORE_SYNC_DEPTH = 0;

export const INSERTION = 0,
	LAYOUT = 1,
	PASSIVE = 2;

export const effectQueues: [PendingEffect[], PendingEffect[], PendingEffect[]] = [[], [], []];
export let passiveScheduled = false;

export function inNestedUpdateCallback(): boolean {
	return EFFECT_BODY_DEPTH > 0 || REF_CALLBACK_DEPTH > 0 || STORE_SYNC_DEPTH > 0;
}

// ---------------------------------------------------------------------------
// Effect commit pipeline (insertion → layout → passive)
// ---------------------------------------------------------------------------

/**
 * Drop commit-phase attaches owned by a primary that has just become hidden and
 * index their exact ref/target pairs. The hide walk uses this cold-path index to
 * distinguish a ref that committed earlier from one that only reached the queue.
 */
export function discardSubtreeRefAttaches(
	root: Block,
	uncommitted: UncommittedRefAttaches = new Map(),
): UncommittedRefAttaches {
	discardSubtreeRefAttachesFrom(refAttachQueue, root, uncommitted);
	if (WIP_CAPTURE !== null) discardSubtreeRefAttachesFrom(WIP_CAPTURE.refs, root, uncommitted);
	if (DEFERRED_LAYOUT_DRIVER) DEFERRED_LAYOUT_DRIVER.discardRefs(root, uncommitted);
	return uncommitted;
}

export interface DeferredLayoutDriver {
	beforeCommit(): void;
	capturing(): boolean;
	defer(
		mutationBatch: PendingEffect[] | null,
		caughtReports: InlineCaughtErrorReport[] | null,
	): boolean;
	schedulePending(block: Block): void;
	discardRefs(root: Block, uncommitted: UncommittedRefAttaches): void;
	holdPassivesBeforeRender(): boolean;
	holdsPendingQueue(): boolean;
	recordRootTransaction(transaction: RootRenderTransaction): void;
}

export interface DeferredLayoutCapture {
	commits: Array<{
		mutationBatch: PendingEffect[] | null;
		caughtReports: InlineCaughtErrorReport[] | null;
	}>;
	refs: RefAttach[];
	refUpdates: Map<StateSlot<unknown>, RefStateUpdate> | null;
	stores: StoreInst<any>[];
	adoptions: NativeAdoptionState[];
	passives: PendingEffect[];
	passiveUnmounts: Array<Cleanup | TryHandler | Block | null>;
	retainPassives: boolean;
	onInterrupt: (() => void) | undefined;
	pendingWork: Set<Block> | null;
	transactions: Set<RootRenderTransaction> | null;
	completed: boolean;
}

export function captureDeferredPassives(capture: DeferredLayoutCapture): void {
	for (const effect of effectQueues[PASSIVE]) capture.passives.push(effect);
	effectQueues[PASSIVE].length = 0;
	for (const entry of pendingPassiveUnmounts) capture.passiveUnmounts.push(entry);
	pendingPassiveUnmounts.length = 0;
}

export function restoreDeferredPassives(capture: DeferredLayoutCapture): void {
	const laterPassives = effectQueues[PASSIVE].splice(0);
	for (const effect of capture.passives) effectQueues[PASSIVE].push(effect);
	for (const effect of laterPassives) effectQueues[PASSIVE].push(effect);
	capture.passives.length = 0;
	const laterUnmounts = pendingPassiveUnmounts.splice(0);
	for (const entry of capture.passiveUnmounts) pendingPassiveUnmounts.push(entry);
	for (const entry of laterUnmounts) pendingPassiveUnmounts.push(entry);
	capture.passiveUnmounts.length = 0;
	if ((effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) && !passiveScheduled)
		schedulePassiveFlush();
}

/** An animation batch owns its passive work without blocking unrelated commits. */
export function releaseDeferredPassives(capture: DeferredLayoutCapture): void {
	capture.retainPassives = false;
	if (capture.completed) restoreDeferredPassives(capture);
}

/** Arm the post-paint passive drain. Callers check `passiveScheduled` first. */
export function scheduleRegisteredPassiveFlush(): void {
	passiveScheduled = true;
	schedulePostPaint(flushPassivePostPaint);
}

function flushPassivePostPaint(): void {
	// Passives owed to an animating ViewTransition are held on that capture's
	// own deferred-layout receipt (see captureDeferredPassives); global queues
	// may belong to an unrelated, already-committed scope and drain normally.
	passiveScheduled = false;
	drainPassivePhase();
}

/**
 * Test-only probe for the strict render-write check (tests/_render-write-guard.ts):
 * whether a DOM write now happens during a render (#2043), by the innermost
 * root's phase. A root render frame is open, or a Block is rendering, and no
 * commit is applying its writes. Unused by applications, so bundlers drop it.
 */
export function renderWritesForbidden(): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	return (
		COMMITTING_OWNER === null &&
		(CURRENT_BLOCK !== null || (transaction !== null && transaction.rendering > 0))
	);
}

/**
 * Test/test-environment helper — synchronously drain any queued passive
 * (`useEffect`) bodies that would normally fire after paint. Idempotent.
 * While a queued commit settles an exhausted update budget, the bodies stay
 * queued until that commit (see scheduleRender), as `hasPendingWork()` reports.
 * Real apps should not call this; rely on the normal post-paint scheduler.
 */
export function drainPassiveEffects(): void {
	// Cancel any scheduler-side passive drain that hadn't fired yet — we're
	// about to drain inline.
	passiveScheduled = false;
	cancelPostPaint();
	drainPassivePhase();
}

/**
 * True if there's a queued render or any uncommitted effect. Used by `act`,
 * and exported (tier 2, binding infrastructure) so @octanejs/testing-library's
 * synchronous settle can loop to EXACT quiescence instead of a fixed bound.
 * A transition render, or the completion of one, waiting for its host task is
 * pending: flushSync drains it. Purely promise-driven work (use(promise), async
 * transitions) and a useDeferredValue swap waiting for its host task are not
 * "pending" by this definition — they need `waitFor`/async `act`.
 */
export function hasPendingWork(): boolean {
	return TRANSITION_QUEUE.length > 0 || TRANSITION_FALLS.length > 0 || hasScheduledWork();
}

/** hasPendingWork() without the transition renders waiting for their task. */
export function hasScheduledWork(): boolean {
	return (
		QUEUE.length > 0 ||
		ROOT_RENDER_TRANSACTIONS.length > 0 ||
		PENDING_SIGNAL_PROMOTIONS !== null ||
		effectEventQueue.length > 0 ||
		effectEventCommitActions.length > 0 ||
		effectQueues[INSERTION].length > 0 ||
		effectQueues[LAYOUT].length > 0 ||
		effectQueues[PASSIVE].length > 0 ||
		pendingPassiveUnmounts.length > 0 ||
		storeSyncQueue.length > 0 ||
		(hydrationStarted ? NATIVE_ADOPTION_RELEASES !== null : false) ||
		hasControlledSyncs()
	);
}

export function drainQueuedEffectEventUpdates(): void {
	if (effectEventQueue.length === 0) return;
	const q = effectEventQueue.splice(0);
	for (let i = 0; i < q.length; i++) {
		const entry = q[i];
		const block = entry.block;
		if (
			!entry.cell.active ||
			(NATIVE_READ_DRIVER && !NATIVE_READ_DRIVER.publicationCurrent(entry)) ||
			blockSubtreeDisposed(block)
		)
			continue;
		const hiddenOwner = findScheduledVisibilityOwner(block, true);
		// A rolled-back render's payload must never publish: the journal/invalidate
		// path restored the earlier committed output, so the earlier impl stays
		// correct and the block re-renders when it next commits. Hidden-owner
		// descendants stay VALID-less while retained, so only the active tree is
		// gated on status here.
		if (block.renderStatus !== RENDER_VALID && hiddenOwner === null) continue;
		// Independently scheduled siblings may complete before another child
		// suspends their shared boundary. That boundary hides the try
		// subtree, so its completed payload is still uncommitted. Do not use the
		// broader inactive check: hidden Activity renders intentionally publish
		// fresh Effect Event bodies while their DOM/effects stay preserved.
		if (hiddenOwner !== null && hiddenOwner.__kind === 'trySlotSlot') {
			const hiddenTry = hiddenOwner;
			// Park the update on the hidden boundary instead of dropping it: the
			// reveal publishes the retained subtree's DOM without re-invoking the
			// bodies that queued this impl, so nothing else would ever re-apply
			// it. The version guard still rules out a newer committed impl.
			deferHiddenRevealAction(hiddenTry, () => {
				if (
					entry.cell.active &&
					!blockSubtreeDisposed(block) &&
					block.rare?.eventRender === entry.renderVersion &&
					block.rare.eventCommitted === entry.renderVersion
				)
					entry.cell.impl = entry.nextImpl;
			});
			continue;
		}
		if (
			block.rare?.eventRender !== entry.renderVersion ||
			block.rare.eventCommitted !== entry.renderVersion
		)
			continue;
		entry.cell.impl = entry.nextImpl;
	}
}

/** True if `anc` is a STRICT ancestor of `node` in the Block tree. */
export function blockIsAncestorOf(anc: Block, node: Block): boolean {
	for (let b: Block | null = node.parentBlock; b !== null; b = b.parentBlock) {
		if (b === anc) return true;
	}
	return false;
}

// React's commit order is a post-order tree walk: a node's descendants fire before it,
// and disjoint subtrees fire in tree order. We reconstruct that from the flat queues:
// descendant-before-ancestor via the parentBlock chain; everything else (disjoint
// subtrees, and multiple entries on the SAME block) falls back to enqueue order, which
// IS tree order because rendering is top-down DFS pre-order. Effects pass their explicit
// sequence; refs pass equal sequence values and rely on ES stable sort to retain their
// queue order. This is correct where a plain depth sort was not — a shallow node in an
// earlier sibling subtree must fire before a deeper node in a LATER sibling subtree,
// which depth alone gets backwards.
// Nearby ancestors and siblings resolve before the full chain scans. These are
// the common comparisons in a DFS-queued commit, including a deep linear tree.
function comparePostOrder(
	aBlock: Block | null,
	aSeq: number,
	bBlock: Block | null,
	bSeq: number,
): number {
	if (aBlock !== bBlock && aBlock !== null && bBlock !== null) {
		const aParent = aBlock.parentBlock;
		const bParent = bBlock.parentBlock;
		if (aParent === bBlock) return -1;
		if (bParent === aBlock) return 1;
		if (aParent === bParent) return aSeq - bSeq;
		for (let b = bParent; b !== null; b = b.parentBlock) {
			if (b === aBlock) return 1;
		}
		for (let a = aParent; a !== null; a = a.parentBlock) {
			if (a === bBlock) return -1;
		}
	}
	return aSeq - bSeq;
}
export function compareEffectPostOrder(a: PendingEffect, b: PendingEffect): number {
	if (a.scope === b.scope) return a.order - b.order || a.seq - b.seq;
	return comparePostOrder(a.scope.block, a.seq, b.scope.block, b.seq);
}
export function compareRefPostOrder(a: RefAttach, b: RefAttach): number {
	return comparePostOrder(a.block, 0, b.block, 0);
}

export function fireEffectCleanup(e: PendingEffect): void {
	const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
	if (slot === undefined || slot.revision !== e.revision) return;
	if (!nativeEffectPublicationCurrent(e, slot)) return;
	const disconnect = e.fn === null;
	const cleanup = slot.cleanup;
	if (disconnect) {
		// Publish the absence before user cleanup runs. A cleanup may schedule a
		// render; that render must see this call site as disconnected and must not
		// queue a duplicate teardown while the current one is still unwinding.
		slot.connectedFn = null;
		slot.connectedArgs = undefined;
		slot.disconnected = false;
	}
	if (cleanup) {
		slot.cleanup = undefined;
		try {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileQueueCleanup(cleanup, e.scope, e);
			runEffectCleanupCallback(cleanup, e.phase, e.scope);
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			reportEffectError(e.scope.block, err);
		}
	}
}

export function nativeEffectPublicationCurrent(entry: PendingEffect, slot: EffectSlot): boolean {
	if (!NATIVE_READ_DRIVER || NATIVE_READ_DRIVER.publicationCurrent(entry)) return true;
	// A skipped setup still belongs to the next render, even with an unchanged
	// explicit dependency array or a memoized parent. Preserve any connected
	// cleanup until that render decides whether the call site remains present.
	if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(slot);
	slot.deps = undefined;
	slot.active = slot.connectedFn !== null;
	// The superseding render may have already drained before this old entry was
	// rejected. Retry through the existing native path so suspended islands and
	// held transitions retain their ownership; cache invalidation alone is idle.
	if (!entry.scope.block.idState.renderOwner?.disposed && !blockSubtreeDisposed(entry.scope.block))
		scheduleNativeRead(entry.scope.block);
	return false;
}

/**
 * Mutation phase — React's commitMutationEffects, reconstructed from the flat
 * queues. Merges the INSERTION and LAYOUT queues into one post-order batch and
 * walks it PER SCOPE (React walks per fiber — commitMutationEffectsOnFiber,
 * FunctionComponent): destroy ALL of the scope's insertion effects, create ALL
 * of them, destroy ALL of its layout effects — then the next scope. So a
 * sibling's layout destroys land BEFORE a later sibling's insertion work, and
 * insertion destroy/create pairs group per component — observable to CSS-in-JS
 * (a component's style teardown/re-injection completes before its own layout
 * cleanup measures) and pinned by conformance/insertion-effect-order.test.ts.
 * Layout BODIES do not run here — commitEffects runs them in the layout phase
 * (runLayoutEffects), after ref detach/attach — so the returned batch hands
 * them across.
 *
 * Same-scope entries are contiguous after the sort: a scope's hooks all run in
 * its setup (before any child renders), so its seqs are consecutive, and
 * comparePostOrder only reorders across ancestor chains.
 *
 * Both queues are snapshotted UP-FRONT (React's flushPassiveEffects nulls
 * rootWithPendingPassiveEffects before running any effect): an effect body may
 * synchronously dispatch a DISCRETE event (e.g. Radix's form bubble inputs
 * dispatching `click`) whose handler flushes and re-enters the drains. A
 * live-array walk would let that re-entrant call re-run entries the outer walk
 * already executed — double-firing effects, unboundedly when the effect
 * re-dispatches. With a snapshot, the re-entrant call sees only effects
 * enqueued DURING this drain (nested-update work, which it runs like React's
 * nested flush); anything enqueued later re-arms via normal commit scheduling.
 *
 * Skip entries whose subtree was hidden by <Activity> after they were queued
 * but before this drain: deactivateScope already fired their cleanups, and the
 * body must not run while hidden (it re-enqueues on reveal). See
 * inInactiveSubtree. INSERTION entries are exempt — they stay connected and
 * keep firing while hidden (deactivateScope spares them too).
 */
export function drainRegisteredMutationEffects(): PendingEffect[] | null {
	const ins = effectQueues[INSERTION];
	const lay = effectQueues[LAYOUT];
	if (ins.length === 0 && lay.length === 0) return null;
	const q =
		ins.length === 0
			? lay.splice(0)
			: lay.length === 0
				? ins.splice(0)
				: ins.splice(0).concat(lay.splice(0));
	// React parity: fire in post-order (child-before-parent, siblings in tree order).
	// Stable sort preserves enqueue order for entries the comparator treats as equal.
	q.sort(compareEffectPostOrder);
	const n = q.length;
	let i = 0;
	while (i < n) {
		const scope = q[i].scope;
		let end = i + 1;
		while (end < n && q[end].scope === scope) end++;
		for (let k = i; k < end; k++) {
			const e = q[k];
			if (e.phase === INSERTION && !e.scope.block.disposed) fireEffectCleanup(e);
		}
		for (let k = i; k < end; k++) {
			const e = q[k];
			if (e.phase === INSERTION && !e.scope.block.disposed) runEffectBody(e);
		}
		for (let k = i; k < end; k++) {
			const e = q[k];
			if (
				e.phase === LAYOUT &&
				!e.scope.block.disposed &&
				(e.fn === null || !inInactiveSubtree(e.scope.block))
			)
				fireEffectCleanup(e);
		}
		i = end;
	}
	return q;
}

/**
 * Layout phase — run the layout BODIES of a mutation batch (their cleanups
 * already fired in drainMutationEffects' walk), in the batch's post-order.
 * Guards re-checked per entry: a mutation-walk effect (or the ref work in
 * between) may have unmounted or hidden a later entry's subtree.
 */
export function runRegisteredLayoutEffects(q: PendingEffect[]): void {
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.phase !== LAYOUT) continue;
		if (e.scope.block.disposed || inInactiveSubtree(e.scope.block)) continue;
		runEffectBody(e);
	}
}

export function drainEffectEventCommitActions(): InlineCaughtErrorReport[] | null {
	if (effectEventCommitActions.length === 0) return null;
	const q = effectEventCommitActions.splice(0);
	let reports: InlineCaughtErrorReport[] | null = null;
	for (let i = 0; i < q.length; i++) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileWorkEnter(q[i]);
		try {
			const report = q[i]();
			if (report !== undefined) (reports ??= []).push(report);
		} catch (err) {
			console.error(err);
		} finally {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileRootExit();
		}
	}
	return reports;
}

// Passive destroys of DELETED scopes, deferred past the sync phase (React
// defers them to flushPassiveEffects — commitPassiveUnmountEffects). Flat
// [cleanup, boundary-handler, owner-block] triples, pushed by unmountScope's effect-slot walk
// in deletion-walk order (parent→child, declaration order within a scope);
// the captured handler routes a late throw to the try boundary that enclosed
// the deletion — the same routing reportTeardownError gave the sync destroys.
export const pendingPassiveUnmounts: Array<Cleanup | TryHandler | Block | null> = [];

export function drainRegisteredPassiveUnmounts(): void {
	if (pendingPassiveUnmounts.length === 0) return;
	const q = pendingPassiveUnmounts.splice(0);
	for (let i = 0; i < q.length; i += 3) {
		try {
			runEffectCleanupCallback(q[i] as Cleanup, PASSIVE, q[i + 2] as Block | null);
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			const handler = q[i + 1] as TryHandler | null;
			const owner = q[i + 2] as Block | null;
			reportEffectError(owner, err, handler);
		}
	}
}

// True if the store's current snapshot differs from the inst's last-committed
// value. A throwing getSnapshot is treated as "changed" so the render-phase read
// re-runs and surfaces the error (React's behavior). Hoisted (not a per-render
// closure) — the inst carries everything it needs.
export function checkStoreChanged(inst: StoreInst<any>): boolean {
	try {
		return !Object.is(inst.value, inst.getSnapshot());
	} catch {
		return true;
	}
}

// Commit-phase drain of the uSES store-sync queue (see storeSyncQueue). Runs in
// commitEffects AFTER runLayoutEffects. For each queued consumer: promote the
// render-read snapshot to the committed `value`, then tear-check against the store
// as of NOW — if a mutation slipped into the render→commit window (e.g. a sibling
// layout effect that mutated+notified), force a re-render so the DOM catches up.
// No sort (order is irrelevant: each entry only touches its own inst) and no
// cleanup bookkeeping — the whole point of not routing these through the effect drains.
export function drainQueuedStoreSyncs(): void {
	if (storeSyncQueue.length === 0) return;
	// Snapshot-and-clear up front (like the effect drains): a forced re-render below could
	// synchronously re-enter this drain; it must see only entries queued AFTER this
	// point, never re-process the batch we already own.
	const q = storeSyncQueue.splice(0);
	STORE_SYNC_DEPTH++;
	try {
		for (let i = 0; i < q.length; i++) {
			const inst = q[i];
			inst.queued = false;
			// Skip a consumer whose block was unmounted, or hidden by <Activity>, between
			// enqueue and now — same guards the effect drains apply to effects.
			if (inst.block.disposed || inInactiveSubtree(inst.block)) continue;
			inst.value = inst.pending;
			if (checkStoreChanged(inst)) inst.forceUpdate();
		}
	} finally {
		STORE_SYNC_DEPTH--;
	}
}

// `schedulePostPaint` — fires after the next paint (React's scheduler trick).
let _postPaintCbs: Array<() => void> = [];
let _postPaintTimeout: ReturnType<typeof setTimeout> | null = null;
let _postPaintGeneration = 0;

function cancelPostPaint(): void {
	if (_postPaintCbs.length === 0) return;
	_postPaintCbs = [];
	_postPaintGeneration++;
	if (_postPaintTimeout !== null) {
		clearTimeout(_postPaintTimeout);
		_postPaintTimeout = null;
	}
	// Preserve the already-requested frame: sibling imperative focus callbacks
	// may join it after an inline passive drain. Generation checks discard ours.
}

/** Swap out the pending post-paint callbacks and run them (both delivery paths). */
function drainPostPaint(generation?: number): void {
	if (generation !== undefined && generation !== _postPaintGeneration) return;
	const cbs = _postPaintCbs;
	if (cbs.length === 0) return;
	cancelPostPaint();
	for (let i = 0; i < cbs.length; i++) cbs[i]();
}
let _postAfterPaint: ((generation: number) => void) | undefined;
function initPostAfterPaint(): (generation: number) => void {
	if (_postAfterPaint === undefined) {
		if (typeof MessageChannel === 'undefined') {
			_postAfterPaint = (generation) => setTimeout(() => drainPostPaint(generation), 0);
		} else {
			const channel = new MessageChannel();
			channel.port1.onmessage = (event) => drainPostPaint(event?.data);
			_postAfterPaint = (generation) => channel.port2.postMessage(generation);
		}
	}
	return _postAfterPaint;
}
function schedulePostPaint(cb: () => void): void {
	_postPaintCbs.push(cb);
	if (_postPaintCbs.length !== 1) return;
	const postAfterPaint = initPostAfterPaint();
	const generation = ++_postPaintGeneration;
	const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
	const hasAnimationFrame = typeof requestAnimationFrame === 'function';
	// Background tabs and occluded WebViews may never receive an animation
	// frame. One bounded timer per batch prevents passive effects starving while
	// the ordinary visible-page path still waits for rAF and its post-paint task.
	_postPaintTimeout = setTimeout(
		() => drainPostPaint(generation),
		hidden || !hasAnimationFrame ? 0 : 250,
	);
	if (!hidden && hasAnimationFrame) {
		requestAnimationFrame(() => {
			postAfterPaint(generation);
		});
	}
}
