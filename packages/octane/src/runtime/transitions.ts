// Transitions
//
// Transition action batches, holds and retries, pending signals, the transition
// memo harvest, startTransition and useDeferredValue.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './use.js';
import { postHostTask } from '../host-task.js';
import { __profileSchedule, __profileCount, ProfileCounter } from '../profiling.js';
import type { NativeReadWitness } from '../signals/native-read-collector.js';
import { type PendingHost, registerPendingHost } from '../signals/transition-state.js';
import { installRendererSignalActions } from '#octane/signal-actions/renderer';
import type {
	HookSlot,
	Scope,
	Block,
	QueuedCell,
	TransitionActionBatch,
	RootRenderOwner,
	RootRenderTransaction,
	TrySlot,
} from './types.js';
import {
	TRANSITION_TASK_DRIVER,
	TRANSITION_ROOT_DRIVER,
	SCHEDULED_VISIBILITY_DRIVER,
	EFFECT_EVENT_INVOCATION_DEPTH,
	resolveSlot,
} from './drivers.js';
import { renderBlock } from './signal-owners.js';
import {
	EFFECT_BODY_DEPTH,
	CURRENT_EFFECT_PHASE,
	REF_CALLBACK_DEPTH,
	QUEUE,
	QUEUE_REINDEX_EPOCH,
	syncFlush,
	inFlush,
	TRANSITION_QUEUE,
	TRANSITION_CUES,
	TRANSITION_FALLS,
	ARMED_TRANSITION_FALLS,
	TRANSITION_FALL_DRAIN,
	TRANSITION_FALL_FROM,
	TRANSITION_TASK_ACTIVE,
	queuePendingSignalPromotion,
	ACTIVE_TRANSITION_ACTION_BATCH,
	RENDERER_DISCRETE_EVENT_DEPTH,
	IN_FLIGHT_TRANSITION_ACTION_BATCH,
	flushTransitionActionBatch,
	TRANSITION_HOLDERS,
	holdTransitionBatch,
	retryTransitionBatch,
	type unsuspendTransitionHolder,
	TRANSITION_ORIGIN,
	TRANSITION_HARVEST,
	harvestTransitionWarmValues,
	restoreTransitionMemos,
	type retryTransitionHolder,
	type wakeHeldTransitions,
	ROOT_RENDER_TRANSACTIONS,
	rollbackRootRender,
	tickTransitionCount,
	scheduleRender,
	scheduleTransitionTask,
	adoptTransitionQueue,
	settleTransitionFalls,
	DRAIN_ID,
	RENDERED_CUES,
	runTransition,
	spawnDeferredSwap,
	runDeferredSwaps,
} from './engine.js';
import { PASSIVE } from './effects.js';
import {
	ensureHooks,
	missingSlot,
	CUE_RENDERS,
	latestHookValue,
	inInactiveSubtree,
} from './hooks.js';
import { RENDERED_CUE_DRAIN, invalidateRender, keepTransitionWork } from './block.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	armTransitionFall,
	renderTransitionFall,
} from './render.js';
import { owningBlock } from './branches.js';
import { journalObjectOnce } from './commit.js';
import type { SubmitDispatchRec } from './actions.js';
import { _dispatchDepth, reportListenerError } from './events.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

let TRANSITION_CUE_EPOCH = -1;

// ---------------------------------------------------------------------------
// Transitions — React 18 priority lanes, simplified to two levels.
// ---------------------------------------------------------------------------

/**
 * Transition holds and cue scheduling. Every path that can create
 * transition-priority work runs through startTransition(), which installs this
 * driver before raising TRANSITION_DEPTH. Until then no render runs at
 * transition priority and no hook update carries a batch, so a missing driver
 * means what an installed one would report: nothing held and nothing to drop.
 * A Suspense-only application therefore does not retain it.
 */
export interface TransitionRootDriver {
	fold: typeof foldTransitionUpdate;
	queue: typeof queueTransitionUpdate;
	memoCells: typeof transitionMemoCells;
	keep: typeof keepTransitionWork;
	splitCue: typeof splitTransitionCue;
	splitsCue: typeof splitsTransitionCue;
	armFalls: typeof armTransitionFalls;
	settleFalls: typeof settleTransitionFalls;
	cancelFall: typeof cancelTransitionFall;
	drop: typeof dropTransitionRender;
	retry: typeof retryTransitionHolder;
	unsuspend: typeof unsuspendTransitionHolder;
	holdsUnrendered: typeof holdsUnrenderedTransition;
	wake: typeof wakeHeldTransitions;
	discard: typeof discardHeldRoot;
}

/**
 * One queued hook-cell update. An urgent update (`batch` null) applies in every
 * render; a transition update applies only in a transition render once its
 * batch is ready (transitionBatchReady).
 */
export interface HookUpdate {
	batch: TransitionActionBatch | null;
	action: unknown;
	next: HookUpdate | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending signals (#2043).
//
// A signal written inside a transition keeps its committed state and gets one
// pending slot tagged with the write's batch (signals/pending.ts). Committed
// readers, subscriptions and DOM bindings keep reading committed state. The
// Blocks that read it render with the batch, at transition priority, and a
// transition render that folds a ready batch reads its slots, exactly as it
// folds its hook updates, so a hold keeps them pending with the rest of the
// batch. When the batch and every batch entangled into it finish, the slots
// promote before the commit that presents them accepts its reads, and their
// committed readers hear of it once that commit ends.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the current read sees `batch`'s pending signals (PendingHost.visible):
 * a render folds them exactly when it folds the batch's hook updates.
 */
function pendingSignalVisible(batch: object): boolean | 'action' | undefined {
	const block = CURRENT_BLOCK;
	if (block === null) {
		const active = ACTIVE_TRANSITION_ACTION_BATCH;
		return active === null
			? undefined
			: rootTransitionBatch(active) === rootTransitionBatch(batch as TransitionActionBatch)
				? 'action'
				: false;
	}
	return foldTransitionUpdate(
		batch as TransitionActionBatch,
		block.currentRenderMode === 'transition',
		ROOT_RENDER_TRANSACTION,
	);
}

/** A batch's signals promote once its work and holds are over and every batch entangled into it has flushed. */
function settleTransitionSignals(batch: TransitionActionBatch): void {
	const root = rootTransitionBatch(batch);
	const slots = root.signals;
	if (!slots || !root.finished || root.waiting !== 0) return;
	root.signals = null;
	queuePendingSignalPromotion(slots);
}

export function installPendingSignalHost(): void {
	const host: PendingHost = {
		batch: transitionActionBatchForUpdate,
		visible: pendingSignalVisible,
		root: rootTransitionBatch as PendingHost['root'],
		entangle(into, from) {
			const root = rootTransitionBatch(into as TransitionActionBatch);
			const other = rootTransitionBatch(from as TransitionActionBatch);
			if (root !== other) entangleTransitionBatches(root, other);
		},
		consume(batch, block) {
			// A hookless component's stand-in renders with the Block that owns it.
			const owner = owningBlock(block as Block);
			invalidateRender(owner, owner);
			noteTransitionBlock(rootTransitionBatch(batch as TransitionActionBatch), owner);
		},
		hold(batch, slot) {
			const root = rootTransitionBatch(batch as TransitionActionBatch);
			if (root.signals === null) queuePendingSignalPromotion([slot]);
			else (root.signals ??= []).push(slot);
		},
	};
	registerPendingHost(host);
	installRendererSignalActions();
}

export function createTransitionActionBatch(): TransitionActionBatch {
	return {
		blocks: [],
		pendingActions: 0,
		closed: false,
		flushed: false,
		stamp: 0,
		origin: null,
		held: false,
		merged: null,
		members: null,
		waiting: 0,
		finished: false,
		suspended: 0,
		hook: null,
		hooks: null,
		hooksPending: false,
		falling: false,
		cueEpoch: -1,
	};
}

/**
 * Insertion and layout effect callbacks and callback refs run synchronously
 * inside a commit, so no post-await Action continuation can be on the stack.
 * Like React, their updates are urgent and never join an in-flight Action;
 * commitEffects also clears any transition the commit inherited. A transition
 * started inside the callback still owns its own updates. Store consistency
 * checks need no case here: external-store updates already schedule urgently.
 */
export function inCommitCallback(): boolean {
	return (EFFECT_BODY_DEPTH > 0 && CURRENT_EFFECT_PHASE !== PASSIVE) || REF_CALLBACK_DEPTH > 0;
}

/** Callback boundaries do not infer ownership from an unrelated in-flight Action. */
export function canInheritAsyncAction(): boolean {
	return (
		!syncFlush &&
		_dispatchDepth === 0 &&
		RENDERER_DISCRETE_EVENT_DEPTH === 0 &&
		EFFECT_EVENT_INVOCATION_DEPTH === 0 &&
		!inCommitCallback()
	);
}

/**
 * The batch an update joins. A state update passes its Block: a render-phase
 * update belongs to the render processing it, never to an Action.
 */
export function transitionActionBatchForUpdate(block?: Block): TransitionActionBatch | null {
	if (CURRENT_BLOCK === block) return null;
	if (ACTIVE_TRANSITION_ACTION_BATCH !== null) return ACTIVE_TRANSITION_ACTION_BATCH;
	// AsyncContext is not available in the browser target, so post-await Action
	// continuations share the one entangled in-flight batch. Delegated handlers
	// (including continuous events), Effect Events, flushSync and commit callbacks
	// opt out. An explicit transition still wins above.
	return IN_FLIGHT_TRANSITION_ACTION_BATCH !== null && canInheritAsyncAction()
		? IN_FLIGHT_TRANSITION_ACTION_BATCH
		: null;
}

/**
 * A transition render folds a batch once its synchronous callback has returned
 * and its Actions have settled, unless a dropped render holds it waiting for
 * data (dropTransitionRender): React's suspended lanes.
 */
export function transitionBatchReady(batch: TransitionActionBatch): boolean {
	batch = rootTransitionBatch(batch);
	return batch.flushed && batch.waiting === 0 && batch.suspended === 0;
}

/** Record a Block whose render must process this batch's queued work. */
export function noteTransitionBlock(batch: TransitionActionBatch, block: Block): void {
	if (batch.blocks.indexOf(block) === -1) batch.blocks.push(block);
}

/**
 * Batches whose renders the current flush scheduled, newest last, for decisions
 * about those renders (hasQueuedTransitionCells). CONSUMED_TRANSITION_BLOCKS
 * records the list length when a Block's own render consumed every earlier one.
 * Both are cleared when a flush completes with no transition render waiting.
 */
export const FLUSHED_TRANSITION_BATCHES: TransitionActionBatch[] = [];
export let CONSUMED_TRANSITION_BLOCKS: Map<Block, number> | null = null;

/** Render a ready batch's blocks at transition priority. */
export function clearFlushedTransitions(): void {
	FLUSHED_TRANSITION_BATCHES.length = 0;
	CONSUMED_TRANSITION_BLOCKS = null;
}

export function scheduleTransitionBatch(batch: TransitionActionBatch): void {
	if (batch.blocks.length === 0) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		// A queued update that settles on the committed value is not a cause.
		const profile = batch.profile;
		if (profile !== undefined) {
			for (let i = 0; i < profile.length; i += 4) {
				const cell = profile[i] as QueuedCell;
				if (profile[i + 2] === 'reducer' || !Object.is(latestHookValue(cell, null), cell.value))
					__profileSchedule(
						profile[i + 1] as Block,
						profile[i + 2] as string,
						profile[i + 3] as HookSlot,
					);
			}
		}
	}
	for (const block of batch.blocks) {
		if (block.disposed) continue;
		scheduleRender(block);
		// A block already queued for its pending cue keeps this update for the task.
		if (TRANSITION_TASK_DRIVER) TRANSITION_TASK_DRIVER.upgrade(block, 'transition');
	}
	// After scheduling: those renders have not consumed this batch yet.
	FLUSHED_TRANSITION_BATCHES.push(batch);
}

export function flushTransitionActionBatchIfReady(batch: TransitionActionBatch): void {
	if (batch.closed && batch.pendingActions === 0) flushTransitionActionBatch(batch);
}
export const TRANSITION_LISTENERS = new Set<() => void>();

/**
 * Count `batch` toward `hook`'s pending indicator. Idempotent per batch: a hook
 * joins once however many nested starts it performs inside the same batch, and
 * a batch counted in its hooks stays counted until it finishes.
 */
export function addTransitionHookToBatch(
	batch: TransitionActionBatch,
	hook: TransitionHookSlot,
): void {
	if (batch.hook === null) batch.hook = hook;
	else if (batch.hook !== hook) {
		const hooks = batch.hooks;
		if (hooks === null) batch.hooks = [hook];
		else if (hooks.includes(hook)) return;
		else hooks.push(hook);
	} else return;
	if (batch.hooksPending) {
		// The batch is already counted in its earlier hooks; count the newcomer.
		hook.pendingBatches++;
		batch.cueEpoch = QUEUE_REINDEX_EPOCH;
		hook.publish(true);
	}
}

/** Publish the rising edge to every hook of `batch` and count the batch once. */
export function publishTransitionHookBatch(batch: TransitionActionBatch): void {
	const hook = batch.hook;
	if (hook === null || batch.hooksPending) return;
	batch.hooksPending = true;
	batch.cueEpoch = QUEUE_REINDEX_EPOCH;
	hook.pendingBatches++;
	hook.publish(true);
	const hooks = batch.hooks;
	if (hooks !== null) {
		for (let i = 0; i < hooks.length; i++) {
			hooks[i].pendingBatches++;
			hooks[i].publish(true);
		}
	}
}

export function finishTransitionHookBatch(batch: TransitionActionBatch): void {
	if (!batch.workComplete || batch.pendingActions !== 0 || (batch.pendingHolds ?? 0) !== 0) return;
	// An entangled batch finishes with the batch it joined.
	if (batch.merged !== null && !rootTransitionBatch(batch).finished) return;
	batch.finished = true;
	if (batch.hooksPending) {
		batch.hooksPending = false;
		const hook = batch.hook!;
		if (--hook.pendingBatches === 0) hook.publish(false);
		const hooks = batch.hooks;
		if (hooks !== null) {
			for (let i = 0; i < hooks.length; i++) {
				if (--hooks[i].pendingBatches === 0) hooks[i].publish(false);
			}
		}
	}
	const members = batch.members;
	if (members !== null)
		for (let i = 0; i < members.length; i++) finishTransitionHookBatch(members[i]);
	settleTransitionSignals(batch);
}

/**
 * A hold keeps its batches' hooks pending. While it `suspends`, it also keeps
 * them from rendering (transitionBatchReady); a boundary showing its timeout
 * fallback only keeps isPending (unsuspendTransitionHolder).
 */
export interface TransitionHold {
	batches: Set<TransitionActionBatch>;
	suspends: boolean;
}

/** A held batch and the batches entangled into it stay pending until it finishes. */
export function raiseHeldTransitionBatch(batch: TransitionActionBatch): void {
	batch.finished = false;
	if (batch.hook !== null) {
		// The drain rendering this batch's work held it: isPending stays raised.
		if (batch.falling) TRANSITION_ROOT_DRIVER!.cancelFall(batch);
		// A finished batch that a later round re-holds becomes pending again.
		publishTransitionHookBatch(batch);
	}
	const members = batch.members;
	if (members !== null)
		for (let i = 0; i < members.length; i++) raiseHeldTransitionBatch(members[i]);
}

/**
 * End `holder`'s holds, returning whether it held anything. Work a suspending
 * hold kept back renders again at transition priority with its falling edge,
 * or is abandoned (`retry` false, a discarded root). Work that already
 * rendered lets its batch finish now.
 */
export function releaseTransitionHookHolder(holder: object, retry = true): boolean {
	const hold = TRANSITION_HOLDERS?.get(holder);
	if (hold === undefined) return false;
	TRANSITION_HOLDERS!.delete(holder);
	for (const batch of hold.batches) {
		const unblocked = hold.suspends && --batch.suspended === 0;
		const settled = --batch.pendingHolds! === 0;
		if (hold.suspends && retry) {
			// isPending falls with the retried work, not before it renders.
			if (unblocked || settled) retryTransitionBatch(batch, unblocked, settled);
		} else if (settled) finishTransitionHookBatch(batch);
	}
	return true;
}

// ── Global commit coordination (entangled transitions) ──────────────────────
// React commits a transition's whole tree atomically. Octane's documented model
// is narrower: it coordinates per-boundary reveals, while ordinary pre-timeout
// same-identity renders retain the global-WIP divergence documented in
// SUSPENSE_DIVERGENCE.md #4. In particular, fallback-hidden boundaries can prove
// their whole primary ready under a captured retry and reveal their DOM + public
// ref/layout lifecycle together; without coordination A would reveal while B's
// fallback remained visible.
//
// `HELD_TRANSITIONS` is the set of boundaries currently holding prior content for an
// in-flight transition (transitionHeld === true). `STAGED_REVEALS` is the subset
// whose current retry is staged waiting for the rest. A fallback-hidden retry joins
// only after its entire body completes (not merely its first thenable). When exact
// membership matches, `flushStagedReveals` commits the group. Abandoning a held
// boundary (urgent supersede / error / unmount) removes it and re-checks, so the
// remaining group isn't stranded waiting on a boundary that will never resolve.
export const HELD_TRANSITIONS = new Set<TrySlot>();
export const STAGED_REVEALS = new Set<TrySlot>();

// ─────────────────────────────────────────────────────────────────────────────
// Transition holds (#2029).
//
// A transition render folds its ready batches' hook updates into the root
// transaction (foldHookQueue). When it suspends into a hold, a Suspense boundary
// keeping committed content or a root with no boundary, the whole transaction
// is dropped once that origin's render returns (dropTransitionRender): the
// journal restores DOM and renderer state, the folded cells are discarded, and
// the updates simply stay queued. The boundaries or root that held become the
// batches' holders. A held batch keeps its hooks pending and no render folds it
// (React's suspended lanes) until a holder retries it: its data settled, or a
// new update reached its root (React's markRootUpdated). The retry renders the
// batches' blocks at transition priority and commits the whole screen in one
// flush, or suspends again and goes around.
//
// Memo state gets a second copy for a dropped render only. The hook-map entries
// and inline memo cells a transition render replaces are recorded on its
// transaction. A drop restores the committed copies, so a render of the
// committed inputs still hits them, and harvests the dropped copies, so the
// retry adopts the requests the dropped render already started instead of
// creating them again (adoptWarmEntry, adoptHarvestedCells). Warm-walk creations
// join the same harvest, because each round mints a fresh warm episode.
//
// Urgent work rendered in a dropped transaction is lost with it: a pending cue
// rendered together with its transition (flushSync, act(), a discrete event),
// or an unrelated urgent origin. The drop renders the drain's urgent origins
// again, and on a batch's first hold every origin, so the committed screen
// shows the cue.
// ─────────────────────────────────────────────────────────────────────────────

export interface WarmHarvestEntry {
	slot: HookSlot;
	deps: any[];
	value: any;
	taken: boolean;
	/** Only the held root's own later renders adopt it. */
	owner: RootRenderOwner | undefined;
	nativeWitness?: NativeReadWitness | null;
}

/** Whether a memo write belongs to a transition render that a hold may drop. */
export function inTransitionRender(): boolean {
	return (
		ROOT_RENDER_TRANSACTION !== null &&
		CURRENT_BLOCK !== null &&
		CURRENT_BLOCK.currentRenderMode === 'transition'
	);
}

/** Publish a hook-map memo entry, keeping the committed one for a dropped render. */
export function setMemoEntry(scope: Scope, slot: HookSlot, entry: unknown): void {
	const hooks = ensureHooks(scope);
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		(ROOT_RENDER_TRANSACTION!.memos ??= []).push(hooks, slot, hooks.get(slot));
	hooks.set(slot, entry);
}

/** The compiled inline-memo ABI publishes `length` cells from `base` (see Transition holds). */
export function transitionMemoCells(cells: any[], base: number, length: number): void {
	(ROOT_RENDER_TRANSACTION!.memos ??= []).push(cells, base, cells.slice(base, base + length));
}

/** The batch a transition update's batch entangled into (entangleTransitionBatches). */
export function rootTransitionBatch(batch: TransitionActionBatch): TransitionActionBatch {
	while (batch.merged !== null) batch = batch.merged;
	return batch;
}

/**
 * Two batches that update one hook cell commit together, as React entangles
 * transitions that share an update queue: `from` folds, holds and schedules as
 * part of `into`, and its hooks stay pending until `into` finishes.
 */
function entangleTransitionBatches(into: TransitionActionBatch, from: TransitionActionBatch): void {
	from.merged = into;
	(into.members ??= []).push(from);
	if (!from.flushed) into.waiting++;
	for (const block of from.blocks) noteTransitionBlock(into, block);
	const signals = from.signals;
	if (signals) {
		from.signals = undefined;
		if (into.signals === null) queuePendingSignalPromotion(signals);
		else (into.signals ??= []).push(...signals);
	}
}

/**
 * Whether a render folds a queued transition update (see foldHookQueue). A
 * transaction that folds it holds its batch if a hold drops that transaction.
 */
export function foldTransitionUpdate(
	batch: TransitionActionBatch,
	transition: boolean,
	transaction: RootRenderTransaction | null,
): boolean {
	if (
		!transitionBatchReady(batch) ||
		(!transition &&
			CUE_RENDERS.length !== 0 &&
			CUE_RENDERS[CUE_RENDERS.length - 1] === CURRENT_BLOCK)
	)
		return false;
	if (transaction !== null) noteTransitionBatch(transaction, rootTransitionBatch(batch));
	return true;
}

/**
 * A transition update joined `cell`'s queue (enqueueHookUpdate). Every batch
 * with an update in one queue commits as one (entangleTransitionBatches), and
 * the batch renders `block` when it is ready.
 */
export function queueTransitionUpdate(
	cell: QueuedCell,
	batch: TransitionActionBatch,
	block: Block,
	type: 'state' | 'reducer',
	slot: HookSlot,
): void {
	let into = rootTransitionBatch(batch);
	for (let update: HookUpdate | null = cell.queue; update !== null; update = update.next) {
		if (update.batch === null) continue;
		const earlier = rootTransitionBatch(update.batch);
		if (earlier === into) continue;
		entangleTransitionBatches(earlier, into);
		into = earlier;
	}
	noteTransitionBlock(into, block);
	// A transition reports its cause when its work renders (scheduleTransitionBatch).
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		(into.profile ??= []).push(cell, block, type, slot);
}

/** A transaction that folds a batch's updates holds the batch if it is dropped. */
function noteTransitionBatch(
	transaction: RootRenderTransaction,
	batch: TransitionActionBatch,
): void {
	batch.origin = TRANSITION_ORIGIN;
	if (batch.stamp === transaction.createdStamp) return;
	batch.stamp = transaction.createdStamp;
	(transaction.batches ??= []).push(batch);
}

/**
 * Drop a transaction whose transition render suspended into a hold (see
 * Transition holds). Returns false when there is nothing to hold: no hook work
 * was folded, or every holder already stopped holding, and the transaction
 * then commits as before, with any boundary holding on its own.
 */
export function dropTransitionRender(transaction: RootRenderTransaction): boolean {
	const holders = transaction.holders!;
	transaction.holders = null;
	// A drained origin holds the batches its own render folded; other
	// transitions in the drain render again and can still commit.
	const origin = TRANSITION_ORIGIN;
	const batches =
		origin === null
			? transaction.batches
			: (transaction.batches?.filter((batch) => batch.origin === origin) ?? null);
	if (batches === null || batches.length === 0 || transaction.owner.disposed) return false;
	let live = false;
	for (const holder of holders)
		if ((holder as TrySlot).__kind !== 'trySlotSlot' || (holder as TrySlot).transitionHeld)
			live = true;
	if (!live) return false;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.ROLLBACK_TRANSITION);
	if (TRANSITION_HARVEST !== null)
		for (let i = 0; i < TRANSITION_HARVEST.length; i++) TRANSITION_HARVEST[i].taken = false;
	let first = false;
	for (const batch of batches) {
		if (!batch.held) first = batch.held = true;
	}
	renderDroppedTransaction(transaction, first);
	for (const holder of holders) {
		if ((holder as TrySlot).__kind === 'trySlotSlot') {
			if (!(holder as TrySlot).transitionHeld) continue;
		} else if (TRANSITION_HOLDERS?.has(holder) !== true) tickTransitionCount(+1);
		for (const batch of batches) holdTransitionBatch(holder, batch);
	}
	// Signals are shared by every root. Another root that rendered a batch with
	// pending signals that this one now holds waits with it, rather than commit
	// those signals alone.
	for (const other of ROOT_RENDER_TRANSACTIONS)
		if (
			other !== transaction &&
			!other.aborted &&
			other.batches !== null &&
			other.batches.some((batch) => batch.signals && batches.includes(batch))
		)
			renderDroppedTransaction(other, true);
	return true;
}

/**
 * Roll a dropped transaction back and render this drain's origins in it again:
 * every origin (`all`), or only its urgent ones, whose work the drop lost.
 */
function renderDroppedTransaction(transaction: RootRenderTransaction, all: boolean): void {
	const owner = transaction.owner;
	restoreTransitionMemos(transaction, true);
	if (!transaction.aborted) rollbackRootRender(transaction);
	// Later origins in this drain render, and commit, in a transaction of their own.
	if (owner.transaction === transaction) owner.transaction = null;
	// The scheduled Blocks this drain rendered in the dropped transaction.
	for (let i = 0, end = QUEUE.length; i < end; i++) {
		const origin = QUEUE[i];
		if (origin.drainStamp !== DRAIN_ID || origin.disposed || origin.idState.renderOwner !== owner)
			continue;
		harvestTransitionWarmValues(origin);
		if (all || origin.currentRenderMode === 'urgent') scheduleRender(origin);
	}
}

/** Whether a boundary holds transition work that the render in progress did not fold. */
export function holdsUnrenderedTransition(state: TrySlot): boolean {
	// Most visible renders of a boundary happen while nothing holds.
	if (TRANSITION_HOLDERS === null || TRANSITION_HOLDERS.size === 0) return false;
	const hold = TRANSITION_HOLDERS.get(state);
	if (hold === undefined) return false;
	const transaction = ROOT_RENDER_TRANSACTION;
	for (const batch of hold.batches)
		if (transaction === null || batch.stamp !== transaction.createdStamp) return true;
	return false;
}

/** A replaced or unmounted root abandons what it held. */
export function discardHeldRoot(owner: RootRenderOwner): void {
	if (TRANSITION_HOLDERS?.has(owner) !== true) return;
	tickTransitionCount(-1);
	releaseTransitionHookHolder(owner, false);
}

/**
 * Hold a render for the shared host task (see TRANSITION_QUEUE).
 * Work scheduled inside a render or flush belongs to the drain already on the
 * stack. A pending cue keeps the microtask flush, which renders it at urgent
 * priority (markTransitionCue).
 */
export function queueTransitionBlock(block: Block, cue?: boolean): boolean {
	// The block is not queued, so a render consumed the work of every batch
	// flushed so far (hasQueuedTransitionCells).
	if (FLUSHED_TRANSITION_BATCHES.length !== 0 && CURRENT_BLOCK !== block)
		(CONSUMED_TRANSITION_BLOCKS ??= new Map()).set(block, FLUSHED_TRANSITION_BATCHES.length);
	if (syncFlush || inFlush || CURRENT_BLOCK !== null || cue || TRANSITION_TASK_ACTIVE) return false;
	TRANSITION_QUEUE.push(block);
	scheduleTransitionTask();
	return true;
}

/**
 * Whether a queued block renders only its pending cue now, at urgent priority,
 * apart from any transition work. A pure cue (TRANSITION_CUES) has no transition
 * work of its own. A cue whose block also has transition work waiting in the
 * task queue (upgradeTransitionBlock) renders alone when that work is queued
 * hook updates, which the cue's urgent render leaves queued. A Suspense or
 * Activity boundary that owns the render, or a pending root request, keeps the
 * combined render at transition priority, as does work that is not hook state.
 * View Transition routing asks this too, since a split cue is urgent work.
 */
export function splitsTransitionCue(block: Block): boolean {
	if (syncFlush || TRANSITION_TASK_ACTIVE || block.pendingMode !== 'transition') return false;
	const waiting = TRANSITION_QUEUE.indexOf(block) !== -1;
	if (
		!waiting &&
		(TRANSITION_CUE_EPOCH !== QUEUE_REINDEX_EPOCH || TRANSITION_CUES.indexOf(block) === -1)
	)
		return false;
	// A pure cue that gained queued hook work from a transition scheduled in this
	// flush renders that work with it.
	if (hasQueuedTransitionCells(block) !== waiting) return false;
	const owner = block.idState.renderOwner;
	return (
		(owner === undefined || owner.current !== block || owner.request === null) &&
		(!SCHEDULED_VISIBILITY_DRIVER ||
			SCHEDULED_VISIBILITY_DRIVER.find(block, true, 'urgent') === null)
	);
}

/**
 * Choose how the drain renders a queued block. A pending cue renders at urgent
 * priority, as React renders `isPending` and optimistic values in an urgent lane:
 * descendants with transition work waiting show their committed cells
 * (renderBlockInner) and keep that work for the task. A split cue also shows
 * its own block's committed cells (renderTransitionCue). Otherwise the drain's
 * own render consumes any transition work the block also has waiting.
 */
export function splitTransitionCue(block: Block, position: number): typeof renderBlock | undefined {
	// Release an earlier drain's cues at the next drained block.
	if (TRANSITION_CUE_EPOCH !== QUEUE_REINDEX_EPOCH) TRANSITION_CUES.length = 0;
	// Renders queued as the drain's completions settled are falling edges.
	if (TRANSITION_FALL_DRAIN === DRAIN_ID && position >= TRANSITION_FALL_FROM)
		return renderTransitionFall;
	if (block.pendingMode !== 'transition') return;
	if (splitsTransitionCue(block)) {
		block.pendingMode = 'urgent';
		if (TRANSITION_QUEUE.indexOf(block) === -1) return;
		// An urgent ancestor may already have rendered this cue in the drain.
		return RENDERED_CUE_DRAIN === DRAIN_ID && RENDERED_CUES.indexOf(block) !== -1
			? keepTransitionPending
			: renderTransitionCue;
	}
	const index = TRANSITION_QUEUE.indexOf(block);
	if (index !== -1) {
		TRANSITION_QUEUE.splice(index, 1);
		if (TRANSITION_QUEUE.length === 0) adoptTransitionQueue();
	}
}

/**
 * Record a pending cue its hook schedules outside a render, flush, or the
 * transition task (TRANSITION_CUES), so the microtask flush renders it at urgent
 * priority (splitTransitionCue). Hooks call this, not scheduleRender, so native
 * readers that share the task queue never reach it.
 */
export function markTransitionCue(block: Block): void {
	if (syncFlush || inFlush || CURRENT_BLOCK !== null || TRANSITION_TASK_ACTIVE) return;
	if (TRANSITION_CUE_EPOCH !== QUEUE_REINDEX_EPOCH) {
		TRANSITION_CUE_EPOCH = QUEUE_REINDEX_EPOCH;
		TRANSITION_CUES.length = 0;
	}
	TRANSITION_CUES.push(block);
}

/** A split cue that already rendered keeps its block waiting for the transition task. */
function keepTransitionPending(block: Block): void {
	block.pending = true;
	block.pendingMode = 'transition';
}

/** Whether a ready batch flushed since this block's last render queued hook work for it. */
function hasQueuedTransitionCells(block: Block): boolean {
	const batches = FLUSHED_TRANSITION_BATCHES;
	for (let i = CONSUMED_TRANSITION_BLOCKS?.get(block) ?? 0; i < batches.length; i++) {
		if (batches[i].blocks.indexOf(block) !== -1 && transitionBatchReady(batches[i])) return true;
	}
	return false;
}

/**
 * Render a split pending cue (splitTransitionCue) at urgent priority, which
 * folds only the block's urgent updates, as an urgent ancestor renders a child
 * whose transition is queued, then leave the block pending at transition
 * priority for the task. React likewise renders `isPending` in an urgent lane
 * and the transition's own updates later.
 */
function renderTransitionCue(block: Block): void {
	const pendingDeferred = block.pendingDeferred;
	const queueEpoch = QUEUE_REINDEX_EPOCH;
	block.pendingDeferred = false;
	CUE_RENDERS.push(block);
	try {
		renderBlock(block);
	} finally {
		CUE_RENDERS.pop();
		keepTransitionWork(block, pendingDeferred, queueEpoch);
	}
}

/**
 * Queue a transition's completion for the drain that renders its work: for a
 * synchronous callback, the pending count, form status and form resets it holds,
 * then isPending's falling edge. React carries `setPending(false)` in the
 * transition lane with the transition's own updates, so both commit in one
 * render, and a transition that suspends into a hold stays pending.
 */
export function queueTransitionFall(
	batch: TransitionActionBatch,
	submit: SubmitDispatchRec | null | undefined,
): void {
	// Work scheduled inside a flush or the task joins the drain on the stack
	// (queueTransitionBlock), which settles the completion with it, unless that
	// drain also renders the cue announcing it.
	if (
		QUEUE.length !== 0 &&
		(syncFlush || inFlush || CURRENT_BLOCK !== null || TRANSITION_TASK_ACTIVE) &&
		batch.cueEpoch !== QUEUE_REINDEX_EPOCH
	)
		armTransitionFall(batch, submit);
	else {
		TRANSITION_FALLS.push(batch, submit);
		scheduleTransitionTask();
	}
}

/** Arm the waiting completions for the drain adopting their work (adoptTransitionQueue). */
export function armTransitionFalls(): void {
	const falls = TRANSITION_FALLS;
	let waiting = 0;
	for (let i = 0; i < falls.length; i += 2) {
		const batch = falls[i] as TransitionActionBatch;
		// A flushSync or act() drain can render a cue with the transition it
		// announces. The cue commits first, and its falling edge takes a later
		// task. That drain advances the epoch, so the edge waits only once.
		if (batch.cueEpoch === QUEUE_REINDEX_EPOCH && QUEUE.length !== 0) {
			falls[waiting++] = batch;
			falls[waiting++] = falls[i + 1];
		} else armTransitionFall(batch, falls[i + 1] as SubmitDispatchRec | null | undefined);
	}
	falls.length = waiting;
	if (waiting !== 0) scheduleTransitionTask();
	// Nothing renders in this drain, so nothing can hold these batches.
	if (QUEUE.length === 0 && ARMED_TRANSITION_FALLS.length !== 0) settleTransitionFalls();
}

/**
 * When this batch is the last a hook counts, the render its block has queued in
 * the drain shows the falling edge. That render carries the transition's own
 * updates, as React's transition lane renders `setPending(false)` with them. A
 * hold on the batch raises it again (cancelTransitionFall). A hook whose block
 * has no render queued publishes its edge when the drain settles, after every
 * hold the drain's renders decide.
 */
export function fallTransitionHook(hook: TransitionHookSlot): void {
	if (hook.pendingBatches !== 1 || !hook.isPending || !hook.block.pending) return;
	hook.isPending = false;
	hook.tentative = true;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileSchedule(hook.block, 'transition-pending', hook.profileSlot);
}

/** A render in the drain suspended into a hold of this falling batch. */
export function cancelTransitionFall(batch: TransitionActionBatch): void {
	batch.falling = false;
	raiseTransitionHook(batch.hook!);
	batch.hooks?.forEach(raiseTransitionHook);
}

function raiseTransitionHook(hook: TransitionHookSlot): void {
	if (!hook.tentative) return;
	// A queued render reads the raised value. A render that already showed the
	// falling edge renders the cue again.
	if (hook.block.pending) {
		hook.tentative = false;
		hook.isPending = true;
	} else hook.publish(true);
}

// ---------------------------------------------------------------------------
// startTransition / useTransition — React 18 priority transitions.
//
// `startTransition(fn)` runs `fn` synchronously; any setters called inside
// it schedule transition-priority renders. When a transition-priority render
// of an already-committed try block suspends, we keep the prior DOM mounted
// instead of swapping to the pending fallback. `useTransition` returns
// `[isPending, start]` so a component can show "loading" cues without
// tearing down the current view.
// ---------------------------------------------------------------------------

export function startTransition(fn: () => void | Promise<unknown>): void {
	runTransition(fn);
}

export interface TransitionHookSlot {
	isPending: boolean;
	block: Block;
	/**
	 * Action batches this hook started or was re-held into that have not
	 * finished. The batches themselves list their hooks; the hook only needs
	 * the count to publish its falling edge, so no per-hook collection exists.
	 */
	pendingBatches: number;
	/** isPending shows a falling edge its drain has yet to settle (fallTransitionHook). */
	tentative: boolean;
	/** Profile-build-only hook source; the assignment is erased in normal bundles. */
	profileSlot?: HookSlot;
	error?: { value: unknown } | undefined;
	start: (fn: () => void | Promise<unknown>) => void;
	publish: (pending: boolean) => void;
}

export function reportTransitionError(error: unknown, hook?: TransitionHookSlot): void {
	if (hook !== undefined && !hook.block.disposed) {
		// Hook-started Actions belong to their rendering owner. Re-enter its
		// ordinary error path so boundary/root recovery and reporting happen at
		// the same publication point as other render failures.
		hook.error = { value: error };
		scheduleRender(hook.block);
	} else reportListenerError(error);
}

// ---------------------------------------------------------------------------
// useDeferredValue — React 18. Returns the latest value normally; when value
// changes, returns the PREVIOUS value (synchronously) and schedules a
// transition-priority re-render where it'll return the new value. Because
// the re-render runs at transition priority, a suspending consumer (via use())
// keeps the prior DOM mounted instead of flashing a fallback.
// ---------------------------------------------------------------------------

export interface DeferredSlot<T> {
	value: T; // committed value (what we return)
	next: T; // latest pending value
	scheduled: boolean;
	block: Block;
	/** The transition of the last swap, and the value it renders (hasHeldDeferredSwap). */
	swap: TransitionActionBatch | null;
	swapValue: T | undefined;
	/** Profile-build-only hook source; the assignment is erased in normal bundles. */
	profileSlot?: HookSlot;
	/**
	 * Whether this slot's LAST render ran inside a hidden <Activity>/suspended
	 * subtree. Revealing a hidden tree is a fresh mount for this hook (React:
	 * the prerendered tree has no on-screen "previous" value to defer to), so
	 * the first visible render after hidden re-runs mount semantics.
	 */
	wasHidden: boolean;
}

export function postDeferredSwaps(): void {
	postHostTask(runDeferredSwaps);
}

/** A held swap of the current value renders again when it retries; do not spawn another. */
function hasHeldDeferredSwap(slot: DeferredSlot<unknown>): boolean {
	return (
		slot.swap !== null &&
		rootTransitionBatch(slot.swap).suspended !== 0 &&
		Object.is(slot.swapValue, slot.next)
	);
}

export function useDeferredValue<T>(value: T, ...rest: any[]): T;
export function useDeferredValue<T>(
	value: T,
	initialValueOrSlot: T | HookSlot | undefined = undefined,
	lastSlot?: HookSlot,
): T {
	// React-19 shape: `useDeferredValue(value, initialValue?)`. The compiler
	// appends the hook slot last. Argument count distinguishes an authored
	// initialValue (even undefined or a symbol) from the compiler slot.
	const count = arguments.length;
	let slot = (count > 3 ? arguments[count - 1] : count === 3 ? lastSlot : initialValueOrSlot) as
		HookSlot | undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useDeferredValue');
	const hasInitial = count >= 3;
	const initialValue = hasInitial ? (initialValueOrSlot as T) : undefined;
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	const hidden = inInactiveSubtree(block);
	let s = scope.hooks?.get(slot) as DeferredSlot<T> | undefined;
	if (s === undefined) {
		if (hasInitial && !block.currentRenderDeferred) {
			// First render returns the user's initialValue; if it differs from
			// `value`, schedule a deferred re-render to swap to `value`. Mirrors
			// React's "useDeferredValue with initialValue" contract: a UI that
			// wants to show stable initial content while the expensive `value`
			// computation settles in the background.
			s = {
				value: initialValue as T,
				next: value,
				scheduled: false,
				block,
				swap: null,
				swapValue: undefined,
				wasHidden: hidden,
			};
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				s.profileSlot = slot;
			ensureHooks(scope).set(slot, s);
			if (!Object.is(initialValue as T, value)) spawnDeferredSwap(s);
			return initialValue as T;
		}
		// No initialValue — or mounting INSIDE an already-spawned deferred pass,
		// where the OUTER preview already covered the loading state, so the final
		// value is adopted directly (React's anti-waterfall: only the first
		// useDeferredValue level defers — ReactDeferredValue-test.js:564).
		s = {
			value: value,
			next: value,
			scheduled: false,
			block,
			swap: null,
			swapValue: undefined,
			wasHidden: hidden,
		};
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			s.profileSlot = slot;
		ensureHooks(scope).set(slot, s);
		return value;
	}
	if (inTransitionRender()) journalObjectOnce(s);
	s.next = value;
	const wasHidden = s.wasHidden;
	s.wasHidden = hidden;
	if (Object.is(s.value, value)) return s.value;
	// Hidden-prerender update, or the first render after a hidden→visible
	// reveal: React treats the (re)appearing tree as a fresh mount for this
	// hook — there is no on-screen "previous" value to defer to
	// (ReactDeferredValue-test.js:746/:848/:894). Re-run mount semantics:
	// show the NEW preview and spawn the swap, or adopt the value directly
	// when there is no initialValue (or this is already a deferred pass).
	if (hidden || wasHidden) {
		if (hasInitial && !block.currentRenderDeferred && !Object.is(initialValue as T, value)) {
			s.value = initialValue as T;
			if (!s.scheduled) spawnDeferredSwap(s);
			return initialValue as T;
		}
		s.value = value;
		return value;
	}
	// If the CURRENT render is already at transition priority, don't defer —
	// commit the new value immediately. Matches React's `useDeferredValue does
	// not defer during a transition` semantics — both Original and Deferred
	// values update in the same paint.
	if (block.currentRenderMode === 'transition') {
		// The swap's own render: a hold of it holds the swap's transition.
		if (s.swap !== null && Object.is(s.swapValue, value) && ROOT_RENDER_TRANSACTION !== null)
			noteTransitionBatch(ROOT_RENDER_TRANSACTION, rootTransitionBatch(s.swap));
		s.value = value;
		return value;
	}
	if (!s.scheduled && !hasHeldDeferredSwap(s)) spawnDeferredSwap(s);
	return s.value;
}
