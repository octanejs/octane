// The render pass
//
// renderBlockInner, lite component slots and every function that sets the
// render pass's state: the current Block and Scope, effect render versions,
// warm episodes, resume replay and the work-in-progress capture. That includes
// the Suspense and @try reveals, Hydrate activation, effect registration and
// event slots that render in place.

import {
	EFFECT_RECONNECT_CONTEXT,
	deferringStagedRevealEffects,
	cancelSuspenseRetry,
	queueSuspenseRetry,
	recordSuspenseCommit,
	discardServerArm,
	setTryBranch,
	restartUncommittedTry,
	type InitialHydrationQueryCapture,
	type InitialSuspenseHydration,
	initialSuspenseHydrations,
	retireInitialSuspenseHydration,
	TRY_OPS,
	claimStreamedIds,
	waitForStreamedArm,
	finishInitialSuspenseHydration,
	catchesInHydrationFallback,
	markArmDiscard,
	clientRenderDehydratedTry,
	retryInitialSuspenseHydration,
	mountTry,
	hideTryBlock,
	showTryBlock,
	releaseHeldTransition,
	handleSuspense,
	inBoundaryRender,
	findSuspenseHiddenTry,
	findHiddenActivity,
	snapshotSubtreeEffectDeps,
	restoreSubtreeEffectDeps,
	type InsertionEffectReplays,
	invalidateInsertionReplay,
	markEffectReconnectQueued,
	forgetEffectReconnectQueued,
	renderWithEffectReconnect,
	queueCurrentHiddenRefs,
	journalRootReveal,
	flushStagedRevealsIfReady,
	attachResume,
	switchToCatch,
	handleResumeError,
} from './suspense.js';
import { hydrating } from '../hydration-flag.js';
import { INITIAL_ADOPTION_INPUT_CHANGED } from '../hydration-input-control.js';
import { renderSlice, type RenderSlice } from '../render-slice.js';
import { EPOCH_CELL } from '../context-epoch.js';
import { STREAM_BOUNDARY_ATTR } from '../constants.js';
import {
	__profileRootEnter,
	__profileRootExit,
	type ProfileFrame,
	__profileBeginRender,
	__profileEndRender,
	__profileCount,
	ProfileCounter,
	__profileTrackComponent,
	__profileQueueWork,
} from '../profiling.js';
import { ELEMENT_TAG } from '../runtime-tags.js';
import { STREAM_RETRY_PROP } from '../stream-protocol.js';
import { setNativeAdoptionResolver, NativeAdoptionMiss } from '../signals/read-protocol.js';
import { type beginNativeEventBatch, endNativeEventBatch } from '../signals/native-read-events.js';
import {
	currentSignalOwner,
	explicitSignalOwners,
	runInSignalOwner,
	runWithSignalOwner,
} from '../signals/owner-context.js';
import {
	signalDocumentEnabled,
	streamedSignalOwnerActivator as STREAMED_SIGNAL_OWNER_ACTIVATOR,
} from '../signals/document-owner.js';
import type { SignalOwner } from '../signals/types.js';
import type {
	ComponentBody,
	EffectFn,
	HookSlot,
	PendingEffectEvent,
	Scope,
	SignalRetryOwners,
	SignalRetryLocation,
	Block,
	EffectSlot,
	PendingEffect,
	TransitionActionBatch,
	RootRenderOwner,
	RootRenderTransaction,
	HydrationEventReveal,
	Phase,
	SuspenseRefEntry,
	OffscreenCapture,
	HydrateSlot,
	HostPropSource,
	ChildSlot,
	TrySlot,
	ActivitySlot,
} from './types.js';
import {
	withRefDetachSuppression,
	TRANSITION_ROOT_DRIVER,
	SCHEDULED_VISIBILITY_DRIVER,
	runLayoutEffects,
	schedulePassiveFlush,
	installEffectDrivers,
	NATIVE_READ_DRIVER,
	activityInsertionEffectCreated,
	noop,
	MEMO_BAIL,
	SIGNAL_BINDINGS_ENABLED,
	EFFECT_HOOKS,
	registerRootOptions,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_ROLLBACK,
	enterRootJournal,
	exitRootJournal,
	openJournalWindow,
	closeJournalWindow,
} from './drivers.js';
import {
	NATIVE_BLOCK_RETRIES,
	signalRetryBoundary,
	retainSignalRetryScope,
	clearSignalRetryOwners,
	supersedeSignalRetryOwners,
	type SignalRetryVisit,
	takeSignalRetryVisit,
	pruneSignalRetryVisit,
	stampSignalInstance,
	scopeSignalOwner,
	runWithBlockSignalOwner,
	beginActiveNativeReadScope,
	acceptNativeCapture,
	renderBlock,
} from './signal-owners.js';
import { createOffscreenCapture, refDetachQueue, blockSubtreeDisposed } from './refs.js';
import {
	VIEW_TRANSITION_DRIVER,
	DEFERRED_LAYOUT_DRIVER,
	ownNativeAdoption,
	ACTIVE_WARM_PLANS,
	QUEUE_REINDEX_EPOCH,
	inFlush,
	ARMED_TRANSITION_FALLS,
	type RootRenderFrame,
	ROOT_RENDER_TRANSACTIONS,
	journalUndo,
	journalRootProperty,
	isCreatedInRootRender,
	rollbackRootRender,
	tickTransitionCount,
	type EffectEventCommitAction,
	LITE_BODIES,
	scheduleRender,
	drainHydrationRenderPhaseUpdates,
	commitEffects,
	discardHydratePresentation,
	WARM_EVER,
} from './engine.js';
import {
	PASSIVE,
	INSERTION,
	LAYOUT,
	effectQueues,
	passiveScheduled,
	blockIsAncestorOf,
} from './effects.js';
import {
	ensureHooks,
	CUE_RENDERS,
	publishHiddenRevealActions,
	depsChanged,
	inInactiveSubtree,
} from './hooks.js';
import {
	type TrackedThenable,
	SuspenseException,
	isSuspenseException,
	resumeOnSettle,
	retainDiscardedWarmMemos,
	blockIsAncestor,
} from './use.js';
import {
	releaseTransitionHookHolder,
	HELD_TRANSITIONS,
	STAGED_REVEALS,
	fallTransitionHook,
} from './transitions.js';
import {
	openScopeFrontier,
	SHARED_BODY_SCOPE,
	isHostContextRequest,
	CONTEXT_DEPENDENCIES,
} from './context.js';
import {
	clearHydrationThrow,
	HYDRATION_PASS,
	CURSOR,
	swapHydration,
	HydrationCapability,
	passSeeds,
	discardSeeds,
	holdDiagnostics,
	releaseDiagnostics,
	claimDeferred,
	hydrationFailure,
	hydrationHostFailure,
	settleTexts,
	parseSeedJson,
	isBlockClose,
	HydrationMismatch,
} from './hydration.js';
import {
	RENDER_VALID,
	RENDER_INVALID,
	RENDER_RETRYING,
	takeClientRootId,
	BlockImpl,
	ScopeImpl,
	createBlock,
	invalidateRender,
	recordCapturedRender,
	LiteBlockImpl,
	unmountBlock,
	resetScopeChildren,
} from './block.js';
import {
	changedHydrateCaptures,
	serverHydrateContexts,
	applyHydrateCaptures,
	settleHydrateTail,
	discardHydrateTail,
	fallBackOffDocument,
} from './hydrate-boundary.js';
import { noteRecoverableHydrationError } from './roots.js';
import {
	PresentationAdoptionMiss,
	retryPresentationMiss,
	isAdoptionControl,
	markHydrationDiscard,
} from './hydration-presentation.js';
import { bindSignalHostPropSources } from './signal-bindings.js';
import { setHostPropSources } from './host-props.js';
import {
	componentSlotImpl,
	spliceOffscreenCapture,
	openCaptureWindow,
	dropCaptureWindow,
	discardOffscreenCapture,
	tryImplicitBail,
} from './component-slots.js';
import { freshSlotEnd, settleFreshSlot } from './branches.js';
import { deoptItemBody } from './deopt.js';
import {
	suspendHiddenActivity,
	forEachSubtreeChild,
	collectVisibleSubtreeRefs,
	deactivateScope,
} from './activity.js';
import type { ForSlot } from './lists.js';
import {
	JOURNAL_RENDER,
	JOURNAL_INPUTS,
	noteFrontierMember,
	usesFrontier,
	dropRootOps,
	listNext,
	DETACHED_ROOT,
	newDetachedRoot,
	listRoots,
	journalObjectOnce,
	journalForSlot,
	rollbackTransitionJournal,
} from './commit.js';
import { getNextSibling, DeferredHydrationSuspension } from './templates.js';
import type { SubmitDispatchRec } from './actions.js';
import { type EventSlot, invokeEventSlot, reportListenerError } from './events.js';
import { ROOT_ROLLBACK } from '../rollback-flag.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// Only resource authority crosses an abandoned initial render, never its hooks,
// scopes or DOM. The root/boundary's existing retry episode owns this cold cache.
export let RETAINED_SIGNAL_OWNERS: SignalRetryOwners | undefined;

export function discardSignalRetryItem(block: Block, error: unknown): void {
	const previous = RETAINED_SIGNAL_OWNERS;
	if (ROOT_ROLLBACK && isSuspenseException(error)) {
		const owner = block.idState.renderOwner;
		const boundary = signalRetryBoundary(block);
		const root = boundary?.tryBlock ?? owner?.current;
		const holder = boundary ?? owner;
		if (holder !== undefined && root != null) {
			retainSignalRetryScope(block, root, holder, true);
			RETAINED_SIGNAL_OWNERS = holder.retrySignalOwners;
		}
	}
	try {
		unmountBlock(
			block,
			(!hydrating || CURSOR === null) &&
				!ROOT_RENDER_TRANSACTION?.hydrating &&
				!ROOT_RENDER_TRANSACTION?.retainedCreated?.has(block),
		);
	} finally {
		RETAINED_SIGNAL_OWNERS = previous;
	}
}

// ---------------------------------------------------------------------------
// Current-scope/block stacks
// ---------------------------------------------------------------------------

export let CURRENT_SCOPE: Scope | null = null;
export let CURRENT_BLOCK: Block | null = null;
// Conditional effects need to distinguish "deps unchanged" from "the call site
// was not reached". Effect-less components keep this at zero and pay no counter
// increment; a render of an existing effect-owning scope allocates its token up
// front, while the first effect call lazily allocates one below.
let CURRENT_EFFECT_RENDER_VERSION = 0;
let CURRENT_EFFECT_REACHED = 0;
let NEXT_EFFECT_RENDER_VERSION = 1;
// Warm entries live for exactly one outer render/suspension episode. A retry
// re-enters with the episode recorded on its block; an ordinary update starts
// a new one so consumed entries cannot suppress warming after prop changes or
// a remount that happens to reuse the same dependency values.
let NEXT_WARM_EPISODE = 1;
export let CURRENT_WARM_EPISODE = 0;
// The effect sequence of a drain's falling-edge renders, and the drain and queue
// index from which its renders are those (renderTransitionFall).
let TRANSITION_FALL_SEQ = 0;
// A root can discover its first suspension after any earlier sibling write.
// Open an undo window before running user render code, but record only touched
// bindings and changed structure. There is no subtree snapshot or preflight
// render. Separate root-local logs/captures also isolate interleaved roots in a
// scheduler drain; an aborted root cannot drop another root's commit work.
export let ROOT_RENDER_TRANSACTION: RootRenderTransaction | null = null;
/**
 * The `createdStamp` of the Blocks the active root attempt discards whole on
 * rollback (undoCreatedInRootRender), or -1. Inside the root window, a write
 * such a Block makes into its own hosts and bag needs no undo entry, and a
 * Block created below one needs no creation or render entry
 * (createdInRootRender). Hydration and adopted DOM (retainedCreated) keep
 * every entry, because rollback keeps those hosts. Kept in step with the
 * transaction by beginRootRender, endRootRender, preserveRootCreatedDom and
 * hydrateRoot's hydrating mark, so a write tests one field instead of the
 * transaction's shape.
 */
export let ROOT_DISCARD_STAMP = -1;
let NEXT_ROOT_RENDER_CREATED_STAMP = 0;

export function beginRootRender(owner: RootRenderOwner | undefined): RootRenderFrame | null {
	if (
		owner === undefined ||
		(ROOT_RENDER_TRANSACTION === owner.transaction && ROOT_RENDER_TRANSACTION !== null)
	)
		return null;
	let transaction = owner.transaction;
	// A render can't join a ViewTransition's held commit: that commit lands first.
	if (VIEW_TRANSITION_DRIVER && transaction !== null && transaction.held) {
		VIEW_TRANSITION_DRIVER.interrupt();
		transaction = owner.transaction;
	}
	if (transaction === null) {
		owner.nativeRetry?.clear();
		const capture = createOffscreenCapture();
		capture.rootTransaction = true;
		transaction = {
			owner,
			log: null,
			bags: null,
			capture,
			created: null,
			createdStamp: ++NEXT_ROOT_RENDER_CREATED_STAMP,
			bagWindow: 0,
			retainedCreated: null,
			retired: null,
			ops: owner.spareOps ?? [],
			rendering: 0,
			cells: null,
			batches: null,
			holders: null,
			memos: null,
			texts: null,
			aborted: false,
			rootRequest: false,
		};
		owner.spareOps = null;
		owner.transaction = transaction;
		ROOT_RENDER_TRANSACTIONS.push(transaction);
	}
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileRootEnter(transaction, owner);
	transaction.rendering++;
	const frame: RootRenderFrame = {
		transaction,
		previous: ROOT_RENDER_TRANSACTION,
		capture: WIP_CAPTURE,
		discardStamp: ROOT_DISCARD_STAMP,
	};
	if (DEFERRED_LAYOUT_DRIVER) DEFERRED_LAYOUT_DRIVER.recordRootTransaction(transaction);
	ROOT_RENDER_TRANSACTION = transaction;
	ROOT_DISCARD_STAMP =
		transaction.hydrating === true || transaction.retainedCreated !== null
			? -1
			: transaction.createdStamp;
	if (ROOT_ROLLBACK) enterRootJournal(transaction);
	WIP_CAPTURE = transaction.capture;
	// An early binding program defers its writes until the outermost slice closes.
	if (renderSlice && frame.previous === null) renderSlice.open = true;
	return frame;
}

// A root's hydration attempt adopts server DOM, so it discards no created Block.
export function beginHydratingRootRender(owner: RootRenderOwner): RootRenderFrame | null {
	const frame = beginRootRender(owner);
	owner.transaction!.rootRequest = true;
	owner.transaction!.hydrating = true;
	ROOT_DISCARD_STAMP = -1;
	return frame;
}

export function endRootRender(frame: RootRenderFrame | null): void {
	if (frame === null) return;
	frame.transaction.rendering--;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileRootExit();
	ROOT_RENDER_TRANSACTION = frame.previous;
	ROOT_DISCARD_STAMP = frame.discardStamp;
	if (ROOT_ROLLBACK) exitRootJournal();
	WIP_CAPTURE = frame.capture;
	if (renderSlice && frame.previous === null) {
		renderSlice.open = false;
		// The drains the slice deferred land after the commit that follows it
		// (commitRootRenders), or now, when no render is waiting to commit.
		if (ROOT_RENDER_TRANSACTIONS.length === 0) landRenderSliceWrites(renderSlice);
	}
}

/**
 * Run the early binding drains a closed render slice deferred (render-slice.ts),
 * once no render frame is open: after the commit, still before any paint.
 */
export function landRenderSliceWrites(slice: RenderSlice): void {
	if (slice.open || slice.drains.length === 0) return;
	for (const drain of slice.drains.splice(0)) {
		try {
			drain();
		} catch (error) {
			// The publisher has returned and the program disposed itself. Report the
			// failure rather than unwind the renderer's frame.
			queueMicrotask(() => {
				throw error;
			});
		}
	}
}

/** An upgraded runtime descriptor can give a fresh Block existing host DOM. */
export function preserveRootCreatedDom(block: Block): void {
	if (ROOT_RENDER_TRANSACTION !== null) {
		(ROOT_RENDER_TRANSACTION.retainedCreated ??= new Set()).add(block);
		ROOT_DISCARD_STAMP = -1;
	}
}

export function suspendRootRender(block: Block, wakeable: PromiseLike<unknown>): boolean {
	const owner = block.idState.renderOwner;
	if (owner === undefined || owner.disposed) return false;
	const transaction = owner.transaction;
	if (transaction === null) return false;
	// A deferred pass does not supersede the attempt that spawned it: whichever
	// of their wakeables settles first retries the root. Read it before the
	// rollback, whose disposal of the root's Block clears it.
	const spawning = block.currentRenderDeferred ? owner.wakeable : null;
	// A transition render holds its batches at the root; the origin's end drops it.
	if (block.currentRenderMode === 'transition' && transaction.batches !== null)
		(transaction.holders ??= []).push(owner);
	if (WARM_EVER && transaction.created !== null) {
		// Only fresh subtrees are destroyed by this rollback. Their warm
		// occurrences remain owned by the root's continuing retry token.
		for (const created of transaction.created) {
			if (created.parentBlock === null || !isCreatedInRootRender(transaction, created.parentBlock))
				retainDiscardedWarmMemos(created);
		}
	}
	const previousRetainedOwners = RETAINED_SIGNAL_OWNERS;
	const rootBlock = owner.current;
	if (rootBlock !== null && transaction.created !== null && owner.signalOwner !== undefined) {
		for (const created of transaction.created) {
			if (!created.disposed) retainSignalRetryScope(created, rootBlock, owner);
		}
		RETAINED_SIGNAL_OWNERS = owner.retrySignalOwners;
	}
	try {
		rollbackRootRender(transaction);
	} finally {
		RETAINED_SIGNAL_OWNERS = previousRetainedOwners;
	}
	owner.wakeable = wakeable;
	const generation = ++owner.generation;
	let notified = false;
	const ping = () => {
		if (notified) return;
		notified = true;
		// Custom thenables may notify synchronously. Retry only after rollback
		// and the enclosing render stack are complete, never reentrantly here.
		queueMicrotask(() => {
			if (owner.disposed || owner.generation !== generation || owner.wakeable !== wakeable) return;
			owner.wakeable = null;
			if (!TRANSITION_ROOT_DRIVER || !TRANSITION_ROOT_DRIVER.retry(owner)) owner.retry();
		});
	};
	resumeOnSettle(wakeable, ping);
	if (spawning !== null && spawning !== wakeable) resumeOnSettle(spawning, ping);
	return true;
}

/**
 * Open a journal window for a visible try body that is about to re-render, and
 * return the checkpoint to roll back to. `-1` means "not journaling": either the
 * boundary cannot hold (nothing committed to keep) or no transition is in play,
 * which is the overwhelmingly common case and costs one comparison.
 *
 * The arming test mirrors handleSuspense's hold conditions. The body inherits
 * its mode from the block currently rendering it (renderBlockInner walks
 * `pendingMode ?? parent's mode`), so the ambient block answers "is this a
 * transition" before the body runs. An existing hold also arms rollback while
 * the next render decides whether to retain the previous screen or supersede it.
 * Native read retries preserve transition priority; ordinary urgent updates
 * may hide that previous screen behind a fallback.
 */
function armTransitionJournal(state: TrySlot): number {
	if (
		!ROOT_ROLLBACK ||
		!state.hasResolved ||
		state.hiddenDom !== null ||
		!(
			state.transitionHeld ||
			(state.tryBlock?.pendingMode ?? CURRENT_BLOCK?.currentRenderMode) === 'transition'
		)
	)
		return -1;
	return openJournalWindow();
}

/**
 * Close the window opened by `armTransitionJournal`.
 *
 * A committed inner boundary deliberately LEAVES its entries in the log: an
 * enclosing boundary that suspends later still has to undo them, because its
 * content includes everything the inner boundary just wrote. Only the outermost
 * window drops the log — before that there is always someone left who might need
 * to replay it.
 */
function disarmTransitionJournal(checkpoint: number): void {
	if (checkpoint >= 0) closeJournalWindow();
}
// useEffectEvent callback bodies are render output: updates become observable at
// commit, before insertion/layout effects, and are discarded with an aborted
// render. The wrapper returned by the hook is deliberately fresh each render;
// every wrapper closes over the same committed cell.
export const effectEventQueue: PendingEffectEvent[] = [];
export const effectEventCommitActions: EffectEventCommitAction[] = [];
// Monotonic enqueue counter — tags each PendingEffect with its DFS pre-order position
// so the effect drains can reconstruct React's post-order (see comparePostOrder).
let commitSeq = 0;
// A notification deferred until a retry reveals its subtree runs its passive
// effect again, after the revealed child's effects.
export function requeuePassiveEffect(scope: Scope, effect: EffectSlot): void {
	effectQueues[PASSIVE].push({
		scope,
		slot: effect.slot,
		fn: effect.connectedFn!,
		order: effect.order,
		revision: effect.revision,
		args: effect.connectedArgs,
		phase: PASSIVE,
		seq: commitSeq++,
	});
	if (!passiveScheduled) schedulePassiveFlush();
}
export let WIP_CAPTURE: OffscreenCapture | null = null;

// Active append targets for Effect Event render output. renderBlockInner takes
// length checkpoints and truncates on throw, so a later sibling suspension rolls
// back every completed descendant without allocating a transaction object/array
// for the overwhelmingly common no-Effect-Event render.
export let EFFECT_EVENT_RENDER_TARGET = effectEventQueue;
export let EFFECT_EVENT_ACTION_TARGET = effectEventCommitActions;

export function armTransitionFall(
	batch: TransitionActionBatch,
	submit: SubmitDispatchRec | null | undefined,
): void {
	// One sequence orders every falling-edge render of the drain (renderTransitionFall).
	if (ARMED_TRANSITION_FALLS.length === 0) TRANSITION_FALL_SEQ = commitSeq++;
	ARMED_TRANSITION_FALLS.push(batch, submit);
	// A held batch, or one whose Action is still in flight, keeps its hooks pending.
	if (
		batch.falling ||
		!batch.hooksPending ||
		batch.pendingActions !== 0 ||
		(batch.pendingHolds ?? 0) !== 0
	)
		return;
	batch.falling = true;
	fallTransitionHook(batch.hook!);
	batch.hooks?.forEach(fallTransitionHook);
}

/**
 * Render a block whose falling edge published as its drain settled
 * (settleTransitionFalls). Its effects keep the sequence reserved when the drain
 * armed, the position of the transition's first update, where React dispatches
 * `setPending(false)`, rather than following the work that edge finishes.
 */
export function renderTransitionFall(block: Block): void {
	const queues = WIP_CAPTURE?.effects ?? effectQueues;
	const lengths = [queues[0].length, queues[1].length, queues[2].length];
	renderBlock(block);
	for (let phase = 0; phase < 3; phase++) {
		const queue = queues[phase];
		for (let i = lengths[phase]; i < queue.length; i++) queue[i].seq = TRANSITION_FALL_SEQ;
	}
}

export function renderBlockInner(block: Block): true | undefined {
	// Keep retries visible to compiler-owned cache hits throughout the body. A
	// fresh invalidation during this attempt replaces RETRYING, so successful
	// hidden renders cannot erase work still waiting for their reveal.
	if (block.renderStatus === RENDER_INVALID) block.renderStatus = RENDER_RETRYING;
	// Root-transaction captures already learn rendered blocks from their
	// JOURNAL_RENDER entries; recordCapturedRender early-returns on this same
	// predicate, so skip the call outright on the dominant scheduled-update path.
	// `rootTransaction` is write-once at capture creation (beginRootRender), so a
	// non-root capture armed mid-render still takes the full path on entry.
	if (WIP_CAPTURE !== null && WIP_CAPTURE.rootTransaction !== true)
		recordCapturedRender(WIP_CAPTURE, block);
	// A held in-place attempt has no capture. Its completed bodies must lose
	// bailout validity with their rolled-back DOM. Record both owners: a nested
	// journal can roll back even while its enclosing capture survives.
	// Not for a Block the root window discards with its parent (createdInRootRender).
	if (
		TRANSITION_JOURNAL &&
		(TRANSITION_JOURNAL_DEPTH !== 1 ||
			block.createdStamp !== ROOT_DISCARD_STAMP ||
			block.parentBlock?.createdStamp !== ROOT_DISCARD_STAMP)
	) {
		TRANSITION_JOURNAL.push(JOURNAL_RENDER, block, null, null);
	}
	const prevScope = CURRENT_SCOPE;
	const prevBlock = CURRENT_BLOCK;
	const prevEffectRenderVersion = CURRENT_EFFECT_RENDER_VERSION;
	const prevEffectReached = CURRENT_EFFECT_REACHED;
	const prevWarmEpisode = CURRENT_WARM_EPISODE;
	const warmPlanCheckpoint = ACTIVE_WARM_PLANS.length;
	const prevEffectEventTarget = EFFECT_EVENT_RENDER_TARGET;
	const prevEffectEventActionTarget = EFFECT_EVENT_ACTION_TARGET;
	const effectEventTarget = WIP_CAPTURE?.events ?? prevEffectEventTarget;
	const effectEventActionTarget = WIP_CAPTURE?.eventActions ?? prevEffectEventActionTarget;
	const effectEventCheckpoint = effectEventTarget.length;
	const effectEventActionCheckpoint = effectEventActionTarget.length;
	CURRENT_SCOPE = block;
	CURRENT_BLOCK = block;
	CURRENT_EFFECT_RENDER_VERSION =
		EFFECT_HOOKS && block.effectSlots !== null ? NEXT_EFFECT_RENDER_VERSION++ : 0;
	CURRENT_EFFECT_REACHED = 0;
	const continuesParentTree =
		prevBlock !== null && (block.parentBlock === prevBlock || blockIsAncestor(prevBlock, block));
	// An urgent ancestor renders this child's urgent updates only, even when the
	// child already queued a transition. Preserve that queue entry so its later
	// owned pass gets the transition's boundary journal and reveal policy.
	const keepsTransition =
		TRANSITION_ROOT_DRIVER &&
		block.pending &&
		block.pendingMode === 'transition' &&
		continuesParentTree &&
		prevBlock!.currentRenderMode === 'urgent'
			? TRANSITION_ROOT_DRIVER
			: null;
	const keptDeferred = block.pendingDeferred;
	const keptEpoch = QUEUE_REINDEX_EPOCH;
	if (!continuesParentTree) {
		// A true Suspense retry enters from no ambient block and resumes its saved
		// episode. A synchronously nested independent root has an ambient block but
		// no ancestry relationship, so it starts its own episode even while the
		// caller happens to be replaying.
		const replayEpisode =
			prevBlock === null && RESUME_REPLAY ? (block as any).__warmEpisode : undefined;
		CURRENT_WARM_EPISODE = typeof replayEpisode === 'number' ? replayEpisode : NEXT_WARM_EPISODE++;
	} else if (CURRENT_WARM_EPISODE === 0) {
		CURRENT_WARM_EPISODE = NEXT_WARM_EPISODE++;
	}
	(block as any).__warmEpisode = CURRENT_WARM_EPISODE;
	EFFECT_EVENT_RENDER_TARGET = effectEventTarget;
	EFFECT_EVENT_ACTION_TARGET = effectEventActionTarget;
	// A Suspense replay that reaches a Block with an update queued since the
	// suspended attempt renders new inputs: that update, and the props it passes
	// down. Render the subtree as the ordinary update the scheduler would have run
	// had it flushed before the retry. The replay's stored use() sequence belongs
	// to the old inputs, and a shifted call would otherwise take another call's
	// thenable. An urgent pass over a queued transition reads committed cells and
	// leaves the update queued, so it still replays.
	const replayUpdate = RESUME_REPLAY && block.pending && keepsTransition === null;
	if (replayUpdate) RESUME_REPLAY = false;
	// Cascade coalescing: clear the queued flag now. A block dequeued by flush()
	// gets re-rendered here; a block reached as a descendant of some OTHER queued
	// block's cascade is also brought up to date here, so flush() can skip its
	// redundant standalone render (it checks `pending` before rendering). Cleared
	// at the TOP so a re-entrant setState during this render re-queues correctly.
	block.pending = false;
	block.crossRenderUpdate = false;
	// Reset the per-render `use(thenable)` call-order counter. Cached entries
	// in `rare.thenables` persist ONLY across the failed attempts of ONE suspension
	// episode: earlier use() calls return synchronously on replay-after-resolve
	// (React's thenableState[index] scheme), and the resume-replay reuse
	// leniency may consult them. They die on (a) any NON-replay render — a
	// fresh episode with possibly-new promises — and (b) the render after a
	// COMPLETED body (React parity: thenableState is cleared by
	// finishRenderingHooks), so a child whose entries date from a previously
	// committed episode can never shadow a legitimately new promise arriving
	// mid-resume via changed props. (The resolved-value cache itself lives on
	// each thenable's status/value expandos, not in this array, so dropping
	// entries loses nothing.)
	// A Block without a `rare` record has never called use() or useEffectEvent:
	// it has no counter to reset, and its first call allocates the record at 0.
	const rare = block.rare;
	if (rare !== null) {
		// Invalidate any Effect Event payload queued by an earlier render in this
		// commit. A hook call lazily starts version 1; subsequent attempts advance
		// it here even if they suspend before reaching the hook again.
		if (rare.eventRender !== 0) rare.eventRender++;
		rare.thenableIdx = 0;
		const tState = rare.thenables;
		if (tState !== undefined && (!RESUME_REPLAY || (block as any).__thenableDone === true)) {
			if (tState.length !== 0) tState.length = 0;
			rare.batchThenables = undefined;
		}
	}
	(block as any).__thenableDone = false;
	// Clear last render's recorded context dependencies; this render repopulates
	// them (its own reads + descendant reads propagated up). Only memo/armed
	// blocks hold dependency collections; the common case has nothing to clear.
	if (block.$$ctxReads !== null) block.$$ctxReads.clear();
	if (block.$$ctxDirect !== null) {
		// Native refreshes retain Hydrate props. Save context invalidation before
		// replacing its reads so memo-wrapped boundaries cannot preserve stale HTML.
		const state = block.slots[0] as HydrateSlot | undefined;
		if (
			CONTEXT_DEPENDENCIES &&
			state?.__kind === 'hydrateBlockSlot' &&
			state.parentBlock === block &&
			!state.independent &&
			!state.hydrated
		) {
			state.contextChanged =
				block.$$ctxDepsEpoch !== EPOCH_CELL.value && CONTEXT_DEPENDENCIES.directChanged(block);
		}
		block.$$ctxDirect = null;
	}
	// Stamp the dependencies' consistency epoch: entries written during this render
	// record live versions, so while the global epoch still equals this sample
	// no recorded dep can be stale. Sampling at the TOP is deliberate — a
	// provider commit mid-render advances the epoch past this stamp, so the
	// bail scans still run and see any mixed-version entries.
	block.$$ctxDepsEpoch = EPOCH_CELL.value;
	// Capture the render priority. Explicit pendingMode (set by scheduleRender)
	// wins. Otherwise INHERIT from the outer block — re-entrant renders (try,
	// if, for, comp slots) called synchronously inside an outer body should
	// run at the outer body's priority so transitions propagate down naturally.
	block.currentRenderMode =
		keepsTransition !== null
			? 'urgent'
			: (block.pendingMode ?? prevBlock?.currentRenderMode ?? 'urgent');
	// The deferred bit rides the same channel: explicit when this block was
	// scheduled with a mode (pendingMode set), otherwise inherited from the
	// enclosing render so it reaches components mounting inside a deferred pass.
	block.currentRenderDeferred =
		keepsTransition !== null
			? false
			: block.pendingMode !== null
				? block.pendingDeferred
				: (prevBlock?.currentRenderDeferred ?? false);
	block.pendingMode = null;
	block.pendingDeferred = false;
	const profileFrame: ProfileFrame | null =
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		(block.kind === 'root' || block.kind === 'dynamic' || block.kind === 'portal')
			? __profileBeginRender(block, block.body, block.mounted)
			: null;
	let profileDidThrow = false;
	let profileThrown: unknown;
	let renderCompleted = false;
	let renderRetry = false;
	try {
		// Setup can throw too, if only by exhausting the native stack. The finally
		// must still restore this render's state before a caller catches the error.
		if (keepsTransition !== null) CUE_RENDERS.push(block);
		if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.beginRender(block);
		NATIVE_BLOCK_RETRIES?.get(block)?.clear();
		const out = (block.body as (p: any, s: Scope, e: any) => unknown)(
			block.props,
			block,
			block.extra,
		);
		// Compiled bodies stop between setup and output when setup queues a
		// self-update. Plain return-value bodies reach the same checkpoint here.
		// Replay within this call, before a caller captures single-root DOM or
		// publishes the child's mounted state. Cross-component updates retain
		// their ordinary scheduler path.
		if (block.pending && !block.crossRenderUpdate) {
			renderRetry = true;
			return true;
		}
		// Undefined is also the compiled imperative-body ABI. Only an existing
		// return-owned slot makes it an empty renderable on this path; a body
		// which claimed that slot imperatively has already reconciled its output.
		if (
			block.outputHandler !== null &&
			(out !== undefined || (block.slots[0] as any)?.returnedOutput === true)
		) {
			block.outputHandler(block, out ?? null);
		}
		// finishEffectRender exists to invalidate registered effect slots this
		// render never reached; it early-returns on `effectSlots === null` (the
		// render version it also checks is 0 exactly then — see above). effectSlots
		// is populated mid-body by enqueueEffect, so a block's first useEffect
		// still lands the full path on the render that registered it.
		if (EFFECT_HOOKS && block.effectSlots !== null) finishEffectRender(block);
		if (!block.mounted) block.mounted = true;
		if (block.renderStatus === RENDER_RETRYING) block.renderStatus = RENDER_VALID;
		// Re-read: the body's first useEffectEvent call allocates the record. A
		// Block that never called the hook copies its version 0 onto 0.
		if (block.rare !== null) block.rare.eventCommitted = block.rare.eventRender;
		renderCompleted = true;
		// Body completed without suspending: its use() episode is over — the
		// next render (replay or not) must not reuse these entries.
		(block as any).__thenableDone = true;
	} catch (error) {
		profileDidThrow = true;
		// Resource readers may throw a wakeable directly instead of calling use().
		// Normalize only render throws: a promise thrown by an effect or cleanup
		// is still an application error, not a request to suspend that commit.
		// A bundle without an entry that can suspend cannot hold its screen while
		// it waits, so there a thrown wakeable is an ordinary render error.
		if (ROOT_ROLLBACK && error !== null && typeof error === 'object') {
			try {
				if (typeof (error as any).then === 'function') {
					error = new SuspenseException(error as TrackedThenable);
				}
			} catch {
				// Error values are opaque. A throwing accessor must not replace the
				// original application error merely because it is not a wakeable.
			}
		}
		profileThrown = error;
		throw error;
	} finally {
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			profileFrame !== null
		)
			__profileEndRender(profileFrame, profileDidThrow, profileThrown);
		if (!renderCompleted) {
			if (renderRetry) block.renderStatus = RENDER_INVALID;
			// A descendant may already have invalidated this live render stack.
			// A separately scheduled reader instead marks its logical ancestors up
			// to the actual Suspense owner, passing through catch-only boundaries.
			if (block.renderStatus !== RENDER_INVALID) {
				let owner: Block | null = null;
				const suspension = ROOT_ROLLBACK ? isSuspenseException(profileThrown) : false;
				if (suspension || !isHostContextRequest(profileThrown)) {
					for (let current: Block | null = block; current !== null; current = current.parentBlock) {
						const claims = suspension
							? current.rare?.suspenseHandler
							: current.rare?.tryHandler && current.rare.trySlot?.catchBody !== null;
						if (claims) {
							owner = current;
							break;
						}
					}
				}
				invalidateRender(block, owner);
			}
			effectEventTarget.length = effectEventCheckpoint;
			effectEventActionTarget.length = effectEventActionCheckpoint;
		}
		EFFECT_EVENT_RENDER_TARGET = prevEffectEventTarget;
		EFFECT_EVENT_ACTION_TARGET = prevEffectEventActionTarget;
		// Most renders register no warm plan. Compare before restoring: storing
		// an array's length is not free even when the length is unchanged.
		if (ACTIVE_WARM_PLANS.length !== warmPlanCheckpoint)
			ACTIVE_WARM_PLANS.length = warmPlanCheckpoint;
		CURRENT_WARM_EPISODE = prevWarmEpisode;
		CURRENT_EFFECT_RENDER_VERSION = prevEffectRenderVersion;
		CURRENT_EFFECT_REACHED = prevEffectReached;
		CURRENT_SCOPE = prevScope;
		CURRENT_BLOCK = prevBlock;
		if (replayUpdate) RESUME_REPLAY = true;
		try {
			if (NATIVE_READ_DRIVER)
				NATIVE_READ_DRIVER.endRender(block, renderCompleted, isSuspenseException(profileThrown));
		} finally {
			if (keepsTransition !== null) {
				CUE_RENDERS.pop();
				keepsTransition.keep(block, keptDeferred, keptEpoch);
			}
		}
	}
}

export function componentSlotLite<P>(
	parentScope: Scope,
	slotKey: number,
	host: Node,
	comp: ComponentBody<P>,
	props: P,
	invocationSite?: string,
	anchor?: Node,
): void {
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	// Providers and lazy wrappers can execute independently compiled bodies in
	// the same Scope. Their direct children need an identity-aware slot, including
	// when one body selected the lite representation and another selected full.
	if (parentScope === SHARED_BODY_SCOPE) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.BLOCK_LITE_FALLBACK);
		componentSlotImpl(
			null,
			parentScope,
			slotKey,
			host,
			comp,
			comp,
			props,
			props,
			anchor,
			undefined,
			2,
			undefined,
			undefined,
			invocationSite,
		);
		return;
	}
	if (
		parentScope.slots[slotKey] === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentScope.block.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentScope.block, host, anchor);
		if (end !== null) {
			try {
				componentSlotLite(parentScope, slotKey, end.parentNode!, comp, props, invocationSite, end);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
			return;
		}
	}
	const hydration = hydrating ? CURSOR : null;
	let scope = parentScope.slots[slotKey] as Scope | undefined;
	// The server `<!--]-->` this call adopted as its range end (hydration first
	// render only) — consumed by the post-body cursor advance below.
	let adoptedOpen: Comment | null = null;
	let adoptedClose: Node | null = null;
	let liveEnd: Node | null | undefined;
	if (scope === undefined) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.BLOCK_LITE_MOUNT);
		scope = new ScopeImpl(parentScope, parentScope.block);
		// Lite scope's `block` exposes the host/anchor as the body's DOM context
		// — so the compiled body's `__s.block.parentNode.insertBefore(_root,
		// __s.block.endMarker)` plants content INSIDE the owning element rather
		// than spilling out to the parent block's range. `parentBlock` keeps the
		// context-walk Phase B chain pointing at the real ancestor Block.
		let endMarker = anchor ?? null;
		if (hydration !== null) {
			// Hydration: the server frames this hookless call's output as it frames
			// every call (callOpen). Point the cursor at the content so the body's
			// clone() adopts the server DOM, and use the range's close as the insert
			// anchor so the body's `insertBefore(content, endMarker)` is a no-op.
			adoptedOpen = hydration.callOpen(endMarker, host, parentScope, slotKey);
			if (adoptedOpen === null) {
				// A deferred mismatch: the call renders on the client, detached.
				host = hydration.detachedHost(host);
				endMarker = null;
			} else {
				endMarker = hydration.close(adoptedOpen);
				adoptedClose = endMarker;
				hydration.node = getNextSibling(adoptedOpen);
			}
		}
		scope.block = new LiteBlockImpl(host, endMarker, parentScope.block) as unknown as Block;
		if (host.nodeType === 11) noteFrontierMember(host, scope);
		if (process.env.NODE_ENV !== 'production') LITE_BODIES!.set(scope, comp as ComponentBody);
		stampSignalInstance(scope, parentScope, invocationSite);
		parentScope.slots[slotKey] = scope;
		// Register on parent.children so unmountScope(parent) walks into us.
		(parentScope.children ??= []).push({
			key: slotKey,
			scope,
			at: parentScope._slots === null ? 0 : parentScope._slots.length,
		});
	} else if (
		// A call whose first render suspended mounts on its retry over committed
		// DOM off-document: in a frontier its commit inserts before the call's end.
		!scope.mounted &&
		scope.slots[0] === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		usesFrontier(parentScope.block, host)
	)
		liveEnd = openScopeFrontier(scope, parentScope.block, host);
	const prevScope = CURRENT_SCOPE;
	const warmPlanCheckpoint = ACTIVE_WARM_PLANS.length;
	// A Strong hookful body keeps its effects on this Scope. Count the call sites
	// it reaches apart from the owning Block's, as renderBlockInner does per
	// Block, so finishEffectRender retires exactly the ones this render skipped.
	const effectReached = CURRENT_EFFECT_REACHED;
	CURRENT_EFFECT_REACHED = 0;
	if (EFFECT_HOOKS && scope.effectSlots !== null) ensureEffectRenderVersion();
	CURRENT_SCOPE = scope;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileTrackComponent(scope, comp);
	const profileFrame: ProfileFrame | null =
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
			? __profileBeginRender(scope, comp, scope.mounted)
			: null;
	let profileDidThrow = false;
	let profileThrown: unknown;
	const nativeToken = !NATIVE_READ_DRIVER ? -1 : beginActiveNativeReadScope(scope);
	// The first node after the template that adopted the frame's content.
	let claimed: Node | null | undefined;
	const outerClaim =
		adoptedOpen === null ? undefined : hydration!.beginClaim(getNextSibling(adoptedOpen), scope);
	let retryVisit: SignalRetryVisit | null = null;
	try {
		if (
			signalDocumentEnabled ||
			(registerRootOptions && scope.block.idState.renderOwner?.signalOwner !== undefined)
		) {
			// Same owner-resolution order as runWithBlockSignalOwner, but the
			// per-mount closure only exists when the owner actually changes.
			const owner = scopeSignalOwner(scope);
			if (owner !== undefined) STREAMED_SIGNAL_OWNER_ACTIVATOR?.(owner);
			// A lite body renders in place, so its first render prunes here.
			retryVisit = takeSignalRetryVisit(scope);
			if (owner === undefined || currentSignalOwner() === owner) {
				comp(props, scope, undefined);
			} else runWithSignalOwner(owner, () => comp(props, scope, undefined));
		} else comp(props, scope, undefined);
		if (retryVisit !== null) pruneSignalRetryVisit(retryVisit, false);
		if (EFFECT_HOOKS && scope.effectSlots !== null) finishEffectRender(scope);
		if (!scope.mounted) scope.mounted = true;
	} catch (error) {
		if (retryVisit !== null && isSuspenseException(error)) pruneSignalRetryVisit(retryVisit, true);
		profileDidThrow = true;
		profileThrown = error;
		throw error;
	} finally {
		if (adoptedOpen !== null) claimed = hydration!.endClaim(outerClaim);
		if (nativeToken >= 0) NATIVE_READ_DRIVER!.endScope(nativeToken);
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileEndRender(profileFrame, profileDidThrow, profileThrown);
		if (ACTIVE_WARM_PLANS.length !== warmPlanCheckpoint)
			ACTIVE_WARM_PLANS.length = warmPlanCheckpoint;
		CURRENT_EFFECT_REACHED = effectReached;
		CURRENT_SCOPE = prevScope;
		if (liveEnd !== undefined) scope.block.endMarker = liveEnd;
	}
	// Hydration: advance the cursor PAST this component's adopted range so the
	// next SIBLING slot adopts from its own `<!--[-->`. The body leaves the
	// cursor ON its adopted root (clone() parks it there), so without this a
	// following sibling lite slot sees a non-marker node, adopts no range, and
	// its commitBag insert MOVES the previous sibling's root to the shared
	// anchor. Mirrors componentSlot's post-render advance. First, check that the
	// server rendered nothing in the frame after this component's content.
	if (hydration !== null && adoptedClose !== null) {
		hydration.settleClaim(scope, adoptedClose, claimed, parentScope, slotKey);
		hydration.parkPast(adoptedClose, parentScope);
	} else if (hydration !== null) {
		// A hydrating replay, such as a suspended activation's resume, re-renders
		// an adopted range without adopting it again; its new siblings still adopt
		// from after it. An adopted call's stand-in ends at the range's close.
		const end = scope.block.endMarker;
		if (isBlockClose(end)) hydration.node = getNextSibling(end!);
	}
}

function ensureEffectRenderVersion(): number {
	if (CURRENT_EFFECT_RENDER_VERSION === 0) {
		CURRENT_EFFECT_RENDER_VERSION = NEXT_EFFECT_RENDER_VERSION++;
	}
	return CURRENT_EFFECT_RENDER_VERSION;
}

/**
 * A completed render disconnects any previously-live effect call site it did
 * not reach. The teardown rides the ordinary phase queue, so insertion/layout
 * stay synchronous and passive stays post-paint. Suspended/thrown renders never
 * call this function; captured renders redirect the entries into WIP_CAPTURE.
 */
function finishEffectRender(scope: Scope): void {
	const effects = scope.effectSlots;
	if (effects === null || CURRENT_EFFECT_RENDER_VERSION === 0) return;
	// enqueueEffect counts each registered slot at most once per render. Reaching
	// the registered slot count therefore proves there is no conditional
	// omission, even when custom-hook composition invokes one effective slot more
	// than once. This common path avoids scanning the slot list.
	if (CURRENT_EFFECT_REACHED === effects.length) return;
	for (let i = 0; i < effects.length; i++) {
		const effect = effects[i];
		if (effect.renderVersion === CURRENT_EFFECT_RENDER_VERSION) continue;
		if (effect.phase === INSERTION) invalidateInsertionReplay(effect);
		if (!effect.active) continue;
		if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(effect);
		// Reaching this call site again must recreate even when its authored deps
		// are unchanged.
		effect.deps = undefined;
		effect.active = false;
		const revision = ++effect.revision;
		const target =
			WIP_CAPTURE !== null ? WIP_CAPTURE.effects[effect.phase] : effectQueues[effect.phase];
		target.push({
			scope,
			slot: effect.slot,
			fn: null,
			order: effect.order,
			revision,
			args: undefined,
			phase: effect.phase,
			seq: commitSeq++,
		});
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileQueueWork(target[target.length - 1]);
		markEffectReconnectQueued(effect, effect.phase, target);
	}
}

export function enqueueEffect(
	slot: HookSlot,
	fn: EffectFn,
	deps: any[] | undefined,
	phase: Phase,
): void {
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(slot) as EffectSlot | undefined;
	if (phase === INSERTION) {
		if (prev === undefined) activityInsertionEffectCreated?.(scope.block);
		else invalidateInsertionReplay(prev);
	}
	const renderVersion = ensureEffectRenderVersion();
	const firstReach = prev !== undefined && prev.renderVersion !== renderVersion;
	if (firstReach) {
		CURRENT_EFFECT_REACHED++;
		// This presence stamp belongs to the attempt, not its committed lifecycle.
		// Retries mint a fresh version; nested tries have their own hook maps.
		// Leaving an abandoned stamp is safe and needs no rollback entry.
		prev!.renderVersion = renderVersion;
	}
	// Hidden <Activity> subtree: render (state + DOM) but DON'T run effects. Record
	// that this call site was reached, then skip lifecycle state so the effect is
	// treated as fresh and re-fires when the Activity becomes visible
	// (deactivateScope also clears prior deps). Walk ancestors so a visible inner
	// block inside a hidden outer Activity is skipped too. Effects are rare on the
	// hot path, so this extra walk is cheap.
	// INSERTION effects are exempt (React: they stay connected while hidden and an
	// update in a hidden-but-rendered subtree still fires them — Activity-test.js:1428).
	if (phase !== INSERTION && inInactiveSubtree(scope.block)) {
		// No effect body is registered here. A cached descriptor on reveal must
		// revisit this render, even if the hidden DOM completed successfully.
		invalidateRender(scope.block);
		if (prev && !prev.active) {
			if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(prev);
			// A hidden re-reach supersedes teardown from an earlier completed
			// hidden render. Advance the presence revision so its fn:null entry
			// cannot clear the retained body needed by a bailed reveal.
			prev.active = true;
			prev.revision++;
		}
		return;
	}
	if (prev) {
		const changed = depsChanged(prev.deps, deps, true);
		if (prev.active && !changed) return;
		if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(prev);
		let reactivated = false;
		if (!prev.active) {
			prev.active = true;
			prev.revision++;
			reactivated = true;
		}
		if (!changed) return;
		// Multiple calls may legitimately compose onto one effective slot through
		// plain-TypeScript custom-hook paths. Advance once for a later render, not
		// once per enqueue, so every call from this render remains observable.
		if (firstReach && !reactivated) prev.revision++;
	}
	let effect: EffectSlot;
	if (!prev) {
		if (ROOT_RENDER_TRANSACTION !== null) {
			const effects = scope.effectSlots;
			const length = effects?.length ?? 0;
			journalUndo(() => {
				scope.hooks?.delete(slot);
				if (effects === null) scope.effectSlots = null;
				else effects.length = length;
			});
		}
		CURRENT_EFFECT_REACHED++;
		const order = scope.effectSlots === null ? 0 : scope.effectSlots.length;
		const slotObj: EffectSlot = {
			deps,
			cleanup: undefined,
			renderVersion,
			revision: 0,
			active: true,
			order,
			effect: true,
			phase,
			slot,
			connectedFn: null,
			connectedArgs: undefined,
			disconnected: false,
		};
		ensureHooks(scope).set(slot, slotObj);
		// Parallel flat list in declaration order — unmountScope's phase-correct
		// deletion walk reads it (see Scope.effectSlots).
		if (scope.effectSlots === null) {
			if (runLayoutEffects === noop) installEffectDrivers();
			scope.effectSlots = [slotObj];
		} else scope.effectSlots.push(slotObj);
		effect = slotObj;
	} else {
		prev.deps = deps;
		effect = prev;
	}
	// Tag with the enqueue sequence (DFS pre-order). The commit drains turn this +
	// the parentBlock chain into React's post-order commit order — see PendingEffect.seq.
	const entry = {
		scope,
		slot,
		fn,
		order: effect.order,
		revision: effect.revision,
		args: deps,
		phase,
		seq: commitSeq++,
	};
	const target = WIP_CAPTURE !== null ? WIP_CAPTURE.effects[phase] : effectQueues[phase];
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileQueueWork(entry);
	target.push(entry);
	markEffectReconnectQueued(effect, phase, target);
}

export function activateHydrateBoundary(state: HydrateSlot): void {
	if (state.start === null || state.end === null) return;
	const block = state.block;
	if (!state.serverPreserved || (block.slots[0] as TrySlot | undefined)?.__kind === 'trySlotSlot') {
		renderBlock(block);
		return;
	}
	const hydration = new HydrationCapability(block, getNextSibling(state.start), null);
	// Captures that changed before the island activated: the server HTML is the
	// output of the ones it was claimed with, so the attempt hydrates those, and
	// the newer ones apply once it commits (applyHydrateCaptures).
	const initial = state.initialCaptures;
	const props = state.props;
	const serverProps =
		initial !== null && changedHydrateCaptures(initial.props, props) ? initial.props : null;
	const serverContexts = initial === null ? null : serverHydrateContexts(state, initial);
	if (serverProps !== null) state.props = serverProps;
	if (serverContexts !== null) block.$$ctxValues = serverContexts;
	if (state.seedRaw !== null) hydration.seeds = parseSeedJson(state.seedRaw);
	hydration.defers = true;
	hydration.idStart = block.idState.next;
	const previousHydration = HYDRATION_PASS;
	const previousCapture = WIP_CAPTURE;
	const capture = createOffscreenCapture();
	if (block.idState.renderOwner?.bindingLeases?.size) {
		hydration.retryPresentation = () => {
			if (block.disposed) return;
			discardHydratePresentation(state, capture);
			scheduleRender(state.parentBlock);
		};
	}
	// What the attempt queued for its root's commit goes with a retried one.
	const transaction = ROOT_RENDER_TRANSACTION;
	const opsMark = transaction === null ? 0 : transaction.ops.length;
	const retiredMark = transaction?.retired?.size ?? 0;
	swapHydration(hydration);
	WIP_CAPTURE = capture;
	const previousNative = setNativeAdoptionResolver(hydration.nativeAdoption?.resolve ?? null);
	let completed = false;
	let nativeRecovery: NativeAdoptionMiss | undefined;
	let restart: DeferredHydrationSuspension | undefined;
	try {
		if (state.nativeSeedRaw !== undefined) {
			hydration.nativeAdoption = ownNativeAdoption(block, state.nativeSeedRaw, () => {
				state.nativeSeedRaw = undefined;
			});
			setNativeAdoptionResolver(hydration.nativeAdoption.resolve);
		}
		// The island's content adopts its server range as a component's does: what
		// the server left after it is a mismatch, which the island falls back from.
		const outerClaim = hydration.beginClaim(getNextSibling(state.start), block);
		let claimed: Node | null | undefined;
		try {
			renderBlock(block);
		} finally {
			claimed = hydration.endClaim(outerClaim);
		}
		if (hydration.deferred !== null) claimDeferred(hydration);
		drainHydrationRenderPhaseUpdates(block, true);
		if (state.hydrated) {
			settleTexts(hydration);
			hydration.settleClaim(block, state.end, claimed, block, -1);
			settleHydrateTail(hydration, state.end);
			completed = true;
		}
	} catch (thrown) {
		const error = hydrationFailure(hydration, thrown);
		// A suspended or presentation-missed attempt is retried, and the retry
		// repeats what it queued. A mismatch's fallback keeps its diagnostics.
		if (
			transaction !== null &&
			(error instanceof DeferredHydrationSuspension || error instanceof PresentationAdoptionMiss)
		)
			dropRootOps(transaction, opsMark, retiredMark);
		// Discard the attempt's uncommitted work before the enclosing error
		// boundary tears down its partially mounted children.
		discardOffscreenCapture(capture);
		state.block.mounted = false;
		if (error instanceof PresentationAdoptionMiss) {
			discardHydratePresentation(state, capture);
			if (error.retry && error.lease?.active()) {
				retryPresentationMiss(error, () => {
					if (!block.disposed) scheduleRender(state.parentBlock);
				});
				return;
			}
			throw error;
		} else if (error instanceof DeferredHydrationSuspension) restart = error;
		else if (error instanceof NativeAdoptionMiss) nativeRecovery = error;
		else throw error;
	} finally {
		setNativeAdoptionResolver(previousNative);
		WIP_CAPTURE = previousCapture;
		swapHydration(previousHydration);
		if (previousHydration === null) clearHydrationThrow();
		state.props = props;
		if (serverContexts !== null) block.$$ctxValues = null;
	}
	if (restart !== undefined) {
		// As a suspended Suspense arm does, the island keeps its server DOM, with
		// nothing reported, and its retry adopts it afresh, seeding afresh too.
		// Until then the attempt still owns the island: a parent render waits for
		// the retry rather than start another attempt.
		discardSeeds(hydration);
		discardHydratePresentation(state, capture);
		state.serverActivationStarted = true;
		block.idState.next = hydration.idStart;
		const generation = state.activationGeneration;
		resumeOnSettle(restart.thenable, () => {
			if (
				state.block.disposed ||
				!state.activationRequested ||
				state.activationGeneration !== generation
			)
				return;
			state.serverActivationStarted = false;
			scheduleRender(state.parentBlock);
		});
		return;
	}
	if (nativeRecovery !== undefined) {
		// The exact historical demand changed between server output and island
		// activation, or the island's server HTML does not match the client
		// (HydrationMismatch). Roll back every uncommitted child before mounting
		// this one island live; an application @catch must never receive this
		// control flow. Captures that changed before a dormant island activated
		// legitimately differ from the server's, so its fallback reports nothing,
		// as React reports nothing for an update that reaches a dehydrated
		// boundary. Nor does one whose client render catches an error.
		discardSeeds(hydration);
		state.serverPreserved = false;
		state.initialCaptures = null;
		state.serverActivationStarted = false;
		state.seedRaw = null;
		state.nativeSeedRaw = undefined;
		state.hydrated = false;
		state.idState = block.idState = {
			prefix: state.idState.prefix + 'n' + takeClientRootId() + '-',
			next: 0,
			renderOwner: state.idState.renderOwner,
		};
		const recoveryCapture = createOffscreenCapture();
		const recoveryHydration = HYDRATION_PASS;
		const recoveryNative = setNativeAdoptionResolver(null);
		swapHydration(null);
		WIP_CAPTURE = recoveryCapture;
		let caught = false;
		try {
			markHydrationDiscard(
				block.idState.renderOwner,
				block.parentNode,
				getNextSibling(state.start),
				state.end,
			);
			// A root render over the committed page builds the client render
			// off-document, and its commit replaces the server's nodes with it, so a
			// render that drops leaves them as they are.
			const offDocument = usesFrontier(state.parentBlock, state.wrapper);
			discardHydrateTail(state, offDocument);
			// None of the failed attempt's refs attached: dispose its scopes without
			// detaching them.
			const refs: SuspenseRefEntry[] = [];
			collectVisibleSubtreeRefs(block, refs);
			withRefDetachSuppression(refs, () => resetScopeChildren(block, !offDocument));
			if (offDocument) fallBackOffDocument(state);
			block.deoptNode = null;
			caught = catchesInHydrationFallback(() => renderBlock(block));
		} catch (error) {
			discardOffscreenCapture(recoveryCapture);
			throw error;
		} finally {
			WIP_CAPTURE = previousCapture;
			swapHydration(recoveryHydration);
			setNativeAdoptionResolver(recoveryNative);
			// Outside any hydration, an error that escaped the client render ends here.
			if (recoveryHydration === null) clearHydrationThrow();
		}
		if (!caught) noteRecoverableHydrationError(() => nativeRecovery!, block);
		spliceOffscreenCapture(recoveryCapture);
		return;
	}
	if (completed) {
		state.initialCaptures = null;
		passSeeds(hydration, previousHydration);
		spliceOffscreenCapture(capture);
		if (serverProps !== null || serverContexts !== null)
			applyHydrateCaptures(state, serverContexts !== null);
	}
}

/**
 * True while commitResume replays a try body after a resolution. Gates the
 * fresh-thenable reuse leniency and the waterfall diagnostic in useThenable —
 * both are replay-only semantics; ordinary updates must keep replacing.
 * renderBlockInner clears it below a Block whose queued update the replay
 * renders, so only bodies with unchanged inputs replay.
 */
export let RESUME_REPLAY = false;

/**
 * Commit recorded host sources in the Scope that rendered them, so handler
 * authority and signal owners resolve as they did in render. Refs attach and
 * subscriptions switch here, at commit. A host with no signal site resolves
 * its plain props (setHostPropSources).
 */
export function commitHostSources(
	scope: Scope,
	binding: unknown,
	el: Element,
	sources: readonly HostPropSource[],
	site: string | null,
	hasNestedChildren: boolean,
	readStyle?: (value: unknown) => unknown,
): unknown {
	const previous = CURRENT_SCOPE;
	CURRENT_SCOPE = scope;
	try {
		if (site === null)
			return setHostPropSources(
				el,
				sources,
				binding as Record<string, unknown> | undefined,
				scope,
				hasNestedChildren,
				readStyle,
			);
		return signalDocumentEnabled || scope.block.idState.renderOwner?.signalOwner !== undefined
			? runWithBlockSignalOwner(scope, () =>
					bindSignalHostPropSources(
						scope,
						binding,
						el,
						sources,
						site,
						hasNestedChildren,
						readStyle,
					),
				)
			: bindSignalHostPropSources(scope, binding, el, sources, site, hasNestedChildren, readStyle);
	} finally {
		CURRENT_SCOPE = previous;
	}
}

// Invoke one event slot — a bare handler `fn(event)` or a nominal arity-specific
// bundle. Ordinary bundles call `fn(...args)` without an event, preserving the
// authored call argument list. Negative fixed arities prepend the native event
// for compiler-lifted block arrows that receive their lexical captures by value.
//
// GUARDED like the platform guards each listener invocation: a throwing handler
// (or a non-function listener value that arrived through a spread/prop) reports
// its error and must NOT abort the rest of the dispatch walk — ancestors still
// receive the event, exactly as separate native listeners would. `reportError`
// surfaces through the global error event (window.onerror) like an uncaught
// listener exception; console.error is the non-browser fallback.
export function fireEventSlot(
	slot: EventSlot,
	event: Event,
	recorded: SignalOwner | ScopeImpl | BlockImpl | undefined,
): void {
	// DOM writes can synchronously dispatch native events (for example blur when
	// disabling a focused input). Their handlers are outside component rendering,
	// even when the compiled DOM patch is still on the render stack. Restore that
	// stack afterwards so the remainder of the component keeps its own hook slots.
	const previousScope = CURRENT_SCOPE;
	const previousBlock = CURRENT_BLOCK;
	CURRENT_SCOPE = null;
	CURRENT_BLOCK = null;
	// Native read collection belongs to that render too. Pause it, so the
	// handler's reads are not render dependencies and its signal writes are not
	// render writes. A pure computation's own write guard stays in force, and
	// Effect Event permission and signal ownership are unchanged.
	const nativeFrame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
	try {
		// A handler's owner is recorded only once one of these flags is set (see
		// setEventHandler), and each stays set.
		const owner =
			!SIGNAL_BINDINGS_ENABLED && !signalDocumentEnabled && !explicitSignalOwners
				? undefined
				: recorded instanceof ScopeImpl || recorded instanceof BlockImpl
					? scopeSignalOwner(recorded)
					: recorded;
		if (owner === undefined || currentSignalOwner() === owner) invokeEventSlot(slot, event);
		else runInSignalOwner(owner, () => invokeEventSlot(slot, event));
	} catch (err) {
		reportListenerError(err);
	} finally {
		if (nativeFrame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(nativeFrame);
		CURRENT_SCOPE = previousScope;
		CURRENT_BLOCK = previousBlock;
	}
}

// Closing the event's signal batch publishes its listeners' writes to their
// subscribers and consumers. Like the listeners themselves (fireEventSlot), that
// publication is outside a render whose DOM patch dispatched the event: it must
// not schedule as a render-phase update or run under the render's write guard.
export function closeNativeEventBatch(
	event: Event,
	batch: ReturnType<typeof beginNativeEventBatch>,
	waitsForBubble: boolean,
): void {
	if (batch === null) return;
	const previousScope = CURRENT_SCOPE;
	const previousBlock = CURRENT_BLOCK;
	CURRENT_SCOPE = null;
	CURRENT_BLOCK = null;
	const nativeFrame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
	try {
		endNativeEventBatch(event, batch, waitsForBubble, reportListenerError);
	} catch (error) {
		reportListenerError(error);
	} finally {
		if (nativeFrame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(nativeFrame);
		CURRENT_SCOPE = previousScope;
		CURRENT_BLOCK = previousBlock;
	}
}

/**
 * Discard an incoming Block that threw before its commit. Its scope leaves, a
 * ref it never attached detaches nothing, and a suspended Block's signal owners
 * stay with the boundary or root that retries it.
 */
export function discardFrontierBlock(
	block: Block,
	parentBlock: Block,
	error: unknown,
	retryLocation: SignalRetryLocation | undefined,
): void {
	const previousRetained = RETAINED_SIGNAL_OWNERS;
	if (ROOT_ROLLBACK && retryLocation !== undefined && isSuspenseException(error)) {
		const owner = parentBlock.idState.renderOwner;
		const boundary = signalRetryBoundary(parentBlock);
		const retryRoot = boundary?.tryBlock ?? owner?.current;
		const holder = boundary ?? owner;
		if (holder !== undefined && retryRoot != null) {
			retainSignalRetryScope(block, retryRoot, holder, true);
			for (const created of ROOT_RENDER_TRANSACTION?.created ?? [])
				if (!created.disposed && blockIsAncestorOf(block, created))
					retainSignalRetryScope(created, retryRoot, holder);
			if (holder.retrySignalOwners !== undefined) RETAINED_SIGNAL_OWNERS = holder.retrySignalOwners;
		}
	}
	const queued = refDetachQueue.length;
	const captured = WIP_CAPTURE?.detaches?.length ?? 0;
	try {
		unmountBlock(block, false);
	} finally {
		RETAINED_SIGNAL_OWNERS = previousRetained;
		refDetachQueue.length = queued;
		if (WIP_CAPTURE?.detaches !== undefined) WIP_CAPTURE.detaches.length = captured;
	}
}

/**
 * Run a commit write in the Scope that rendered it, so the handlers and refs
 * it installs resolve their owner as they would have in render.
 */
export function commitInScope<A, B>(
	scope: Scope,
	write: (a: A, b: B, scope: Scope) => void,
	a: A,
	b: B,
): void {
	const previous = CURRENT_SCOPE;
	CURRENT_SCOPE = scope;
	try {
		if (signalDocumentEnabled || scope.block.idState.renderOwner?.signalOwner !== undefined)
			runWithBlockSignalOwner(scope, () => write(a, b, scope));
		else write(a, b, scope);
	} finally {
		CURRENT_SCOPE = previous;
	}
}

// A de-opt list item reaches its component through the item's own render,
// deoptItemBody, and a nested childSlot. When the new descriptor names the
// component already mounted there, that childSlot only takes its same-component
// branch: the memo bail, the identical-props bail, or a props update and render
// of the existing Block. A list of re-created descriptors mostly bails, so each
// surviving row would pay a whole item render for one comparison. Take that
// branch here instead, in the item's scope and with the priority its render
// would inherit. A bail leaves the item's committed descriptor in place: its
// props are the ones the bailed component kept, so a later render of the item
// bails on them again, and the root journal needs no entry for it.
//
// Returns false, leaving the item to its ordinary render, whenever that render
// could differ: hydration, signal owners, native reads, a non-root capture, an
// unsettled item, recorded context reads, or any other child regime. Reached
// only through ForSlot.plainDeopt, so the compiled @for path that shares
// updateSurvivor never retains the descriptor renderer.
export function updateDeoptComponent(block: Block, item: any, index: number): boolean {
	const slot = block.slots[0] as ChildSlot | undefined;
	const child = slot?.block;
	if (
		child == null ||
		block.body !== deoptItemBody ||
		block.extra !== block.forSlot!.env ||
		slot!.__kind !== 'childSlot' ||
		slot!.forSlot !== null ||
		slot!.implicitSignal !== undefined ||
		item?.$$kind !== ELEMENT_TAG ||
		block.pending ||
		block.pendingMode !== null ||
		block.renderStatus !== RENDER_VALID ||
		block.deoptNode !== null ||
		block.$$ctxDirect !== null ||
		NATIVE_READ_DRIVER ||
		(WIP_CAPTURE !== null && WIP_CAPTURE.rootTransaction !== true) ||
		signalDocumentEnabled ||
		block.idState.renderOwner?.signalOwner !== undefined ||
		(hydrating && CURSOR !== null)
	)
		return false;
	// The ordinary render below writes the same index if this returns false.
	block.itemIndex = index;
	const previousScope = CURRENT_SCOPE;
	const previousBlock = CURRENT_BLOCK;
	CURRENT_SCOPE = block;
	CURRENT_BLOCK = block;
	try {
		// A scoped descriptor resolves its fields in the scope that reads them.
		const comp = item.type;
		if (comp !== slot!.currentComp) return false;
		block.currentRenderMode = previousBlock?.currentRenderMode ?? 'urgent';
		block.currentRenderDeferred = previousBlock?.currentRenderDeferred ?? false;
		const props = item.props;
		if (
			(MEMO_BAIL && MEMO_BAIL(child, comp, props)) ||
			(props === child.props && tryImplicitBail(child))
		)
			return true;
		if (
			TRANSITION_JOURNAL &&
			ROOT_RENDER_TRANSACTION !== null &&
			!ROOT_RENDER_ROLLBACK &&
			block.props !== item
		)
			TRANSITION_JOURNAL.push(JOURNAL_INPUTS, block, block.props, block.extra);
		block.props = item;
		if (child.props !== props) journalRootProperty(child, 'props', child.props);
		child.props = props;
		renderBlock(child);
		return true;
	} finally {
		CURRENT_SCOPE = previousScope;
		CURRENT_BLOCK = previousBlock;
	}
}

/** A visible primary accepts its DOM and captured work as one boundary. */
export function renderVisibleTry(state: TrySlot, source?: Block): void {
	const block = state.tryBlock!;
	block.body = state.tryBody;
	block.extra = state.env;
	if (source !== undefined) {
		// Independent descendants otherwise bypass tryBlock's rollback window.
		// Preserve an already queued urgent update, and invalidate only the path
		// to this primary so unrelated sibling boundaries retain their bailouts.
		if (block.pendingMode !== 'urgent') block.pendingMode = source.pendingMode ?? 'urgent';
		block.pendingDeferred = source.pendingDeferred;
		invalidateRender(source, block);
	}
	const journalCheckpoint = armTransitionJournal(state);
	const previousCapture = WIP_CAPTURE;
	// The window records into its enclosing capture and checkpoints it: success
	// costs nothing, a drop truncates (dropCaptureWindow). Native reads still
	// validate per window, in a capture of its own.
	const window =
		journalCheckpoint < 0 || previousCapture === null || NATIVE_READ_DRIVER
			? null
			: openCaptureWindow(previousCapture);
	const capture = journalCheckpoint < 0 || window !== null ? null : createOffscreenCapture();
	// A transition hold replays the root journal, including touched effect cells.
	// An urgent update superseding an existing hold can instead show @pending
	// without replaying that journal; a propagating boundary may do likewise in
	// its ancestor. A queued transition child rendered by an urgent ancestor is
	// urgent too (renderBlockInner overrides its pendingMode). Keep the old
	// snapshot for these cold paths and detached renders without a root transaction.
	const effectDeps =
		(capture !== null || window !== null) &&
		(ROOT_RENDER_TRANSACTION === null ||
			state.propagateSuspense ||
			(block.pendingMode ?? CURRENT_BLOCK?.currentRenderMode) !== 'transition' ||
			(block.pending &&
				block.pendingMode === 'transition' &&
				CURRENT_BLOCK !== null &&
				CURRENT_BLOCK.currentRenderMode === 'urgent' &&
				blockIsAncestor(CURRENT_BLOCK, block) &&
				TRANSITION_ROOT_DRIVER))
			? snapshotSubtreeEffectDeps(block)
			: null;
	const refDetachCheckpoint = refDetachQueue.length;
	let didThrow = false;
	let renderError: unknown;
	// Render-phase updates drained during hydration re-render a try body that
	// is still hydrating.
	const hydration = hydrating ? CURSOR : null;
	const transaction = ROOT_RENDER_TRANSACTION;
	const opsFrom = transaction === null ? 0 : transaction.ops.length;
	const retiredFrom = transaction?.retired?.size ?? 0;
	if (capture !== null) WIP_CAPTURE = capture;
	try {
		if (hydration !== null) hydration.renderTryBody(block, state.catchBody !== null);
		else renderBlock(block);
	} catch (error) {
		didThrow = true;
		renderError = error;
	} finally {
		WIP_CAPTURE = previousCapture;
	}
	try {
		if (didThrow) {
			if (capture !== null || window !== null) {
				refDetachQueue.splice(refDetachCheckpoint);
				if (effectDeps !== null) restoreSubtreeEffectDeps(block, effectDeps);
				if (window !== null) dropCaptureWindow(window);
				else discardOffscreenCapture(capture);
			}
			if (isHostContextRequest(renderError) || isAdoptionControl(renderError)) throw renderError;
			if (isSuspenseException(renderError)) {
				if (state.propagateSuspense) throw renderError;
				handleSuspense(state, renderError.thenable, block, journalCheckpoint);
			} else {
				// The catch arm replaces the body, so none of the work its render queued
				// reaches the page: its bag writes, structure and resources (#2043).
				// Hints it requested went in when it requested them, as React's do.
				if (transaction !== null && transaction === ROOT_RENDER_TRANSACTION && !transaction.aborted)
					dropRootOps(transaction, opsFrom, retiredFrom);
				switchToCatch(state, renderError, true);
			}
		} else {
			if (capture !== null) spliceOffscreenCapture(capture);
			// Ready content supersedes the old wakeable. A render that skipped the
			// batches this boundary holds is still the prior screen and keeps the hold.
			if (!TRANSITION_ROOT_DRIVER || !TRANSITION_ROOT_DRIVER.holdsUnrendered(state)) {
				releaseHeldTransition(state);
				state.pendingThenable = null;
			}
		}
	} finally {
		disarmTransitionJournal(journalCheckpoint);
	}
}

function acceptInitialHydrationQuery(
	state: TrySlot,
	initial: InitialSuspenseHydration,
	query: NonNullable<InitialSuspenseHydration['query']>,
): void {
	if (
		query.refined ||
		initial.query !== query ||
		state.pendingThenable !== query.waiting ||
		initialSuspenseHydrations?.get(state) !== initial
	)
		return;
	journalRootProperty(query, 'refined', undefined);
	query.refined = true;
}

export function renderInitialSuspenseHydration(
	state: TrySlot,
	initial: InitialSuspenseHydration,
	updated = false,
	queryCapture?: InitialHydrationQueryCapture,
	refineQuery?: InitialSuspenseHydration['query'],
): void {
	if (refineQuery !== undefined) {
		if (!refineQuery.refined) {
			if (WIP_CAPTURE === null) acceptInitialHydrationQuery(state, initial, refineQuery);
			else
				(WIP_CAPTURE.renderCleanups ??= []).push((discarded) => {
					if (!discarded) acceptInitialHydrationQuery(state, initial, refineQuery);
				});
		}
		// Preserve the original wake, which retries with the latest committed environment.
		if (HYDRATION_PASS !== null) HYDRATION_PASS.node = getNextSibling(state.end);
		return;
	}
	if (state.pendingThenable !== null && ROOT_RENDER_TRANSACTION?.rootRequest === true)
		journalObjectOnce(state);
	state.pendingThenable = null;
	if (updated) {
		// New inputs reached the arm while its hydration was suspended, or its
		// streamed content had not arrived. The server HTML predates them, so, as
		// React client-renders a dehydrated boundary that an update reaches, the
		// arm renders on the client from client data, reporting nothing, and its
		// obsolete wakeable is ignored.
		if (initial.waits !== undefined) {
			(state.start as Comment & { [STREAM_RETRY_PROP]?: (() => void) | undefined })[
				STREAM_RETRY_PROP
			] = undefined;
			claimStreamedIds(state, initial.waits.getAttribute(STREAM_BOUNDARY_ATTR)!);
		}
		markArmDiscard(state);
		clientRenderDehydratedTry(state, HYDRATION_PASS);
		return;
	}
	if (initial.waits !== undefined) {
		queryCapture ??= initial.queryCapture;
		if (queryCapture !== undefined) initial.queryCapture = queryCapture;
		const taken = waitForStreamedArm(state, initial);
		if (taken === null) return;
		initial = taken;
	}
	state.idState.next = initial.idStart;
	const firstAttempt = state.branch === -1;
	const block = TRY_OPS!.createBody(state, initial.start, initial.end);
	state.block = block;
	TRY_OPS!.setBranch(state, 1);
	const hydration = new HydrationCapability(block, initial.first, null);
	hydration.defers = true;
	if (initial.seedRaw !== null) hydration.seeds = parseSeedJson(initial.seedRaw);
	// This capability owns one exact arm, never the surrounding root siblings.
	hydration.rootClaimed = true;
	const previousHydration = HYDRATION_PASS;
	if (previousHydration?.retryPresentation !== undefined)
		hydration.retryPresentation = previousHydration.retryPresentation;
	const previousCapture = WIP_CAPTURE;
	const capture = createOffscreenCapture();
	// What the attempt queued for its root's commit goes with a discarded one.
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && previousCapture !== null)
		hydration.recoverHostEvent = (error) =>
			TRY_OPS!.inBoundary(state, recoverHydrationEvent, error);
	const opsMark = transaction === null ? 0 : transaction.ops.length;
	const retiredMark = transaction?.retired?.size ?? 0;
	swapHydration(hydration);
	WIP_CAPTURE = capture;
	const previousNative = setNativeAdoptionResolver(null);
	const diagnostics = holdDiagnostics();
	let suspended: TrackedThenable<unknown> | null = null;
	let finishQuery: ReturnType<InitialHydrationQueryCapture> = undefined;
	let failed = false;
	let failure: unknown;
	try {
		if (initial.nativeRaw !== null) {
			hydration.nativeAdoption = ownNativeAdoption(block, initial.nativeRaw);
			setNativeAdoptionResolver(hydration.nativeAdoption.resolve);
		}
		finishQuery = firstAttempt && state.env !== undefined ? queryCapture?.(state.env) : undefined;
		renderBlock(block);
		if (hydration.deferred !== null) claimDeferred(hydration);
		drainHydrationRenderPhaseUpdates(block, true);
		settleTexts(hydration);
		passSeeds(hydration, previousHydration);
		state.hasResolved = true;
	} catch (error) {
		failed = true;
		failure = hydrationFailure(hydration, error);
		const finish = finishQuery;
		finishQuery = undefined;
		if (isSuspenseException(error)) {
			suspended = error.thenable;
			// Finish the exact authored read before disposing this attempt can release its owner.
			const retains = finish?.(suspended);
			if (retains !== undefined) initial.query = { waiting: suspended, retains };
		} else finish?.();
		// The next attempt finds the server arm as the server rendered it.
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.ROLLBACK_HYDRATION);
		if (transaction !== null) dropRootOps(transaction, opsMark, retiredMark);
		// None of this attempt's refs or effects committed. Dispose its scopes
		// without detaching the actual server nodes that the next attempt adopts.
		const refs: SuspenseRefEntry[] = [];
		collectVisibleSubtreeRefs(block, refs);
		const previousRetained = RETAINED_SIGNAL_OWNERS;
		// A retry, or the client render that replaces a mismatched attempt, claims
		// the attempt's query owners rather than loading them again.
		if (
			(suspended !== null || failure instanceof HydrationMismatch) &&
			state.parentBlock.idState.renderOwner?.signalOwner !== undefined
		) {
			retainSignalRetryScope(block, block, state, true);
			// An item which threw before linking itself into the list still lives
			// in the root creation journal, not yet in the reconciler's item chain.
			for (const created of ROOT_RENDER_TRANSACTION?.created ?? [])
				if (!created.disposed && blockIsAncestorOf(block, created))
					retainSignalRetryScope(created, block, state);
			RETAINED_SIGNAL_OWNERS = state.retrySignalOwners;
		} else if (failure === INITIAL_ADOPTION_INPUT_CHANGED) supersedeSignalRetryOwners(state);
		else if (state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
		try {
			withRefDetachSuppression(refs, () => unmountBlock(block, false));
		} finally {
			RETAINED_SIGNAL_OWNERS = previousRetained;
		}
		state.block = null;
		state.tryBlock = null;
		discardOffscreenCapture(capture);
	} finally {
		finishQuery?.();
		// The attempt that commits, or the catch arm that replaces this one,
		// reports what it finds. An attempt that found a mismatch is final: the
		// arm renders on the client, and its diagnostics describe why.
		releaseDiagnostics(diagnostics, failed && !(failure instanceof HydrationMismatch));
		// The arm's client render reads client data, and a retry seeds afresh.
		// Seeds an attempt that a catch arm replaces settled stay with the
		// enclosing hydration, whose own fallback discards them.
		if (
			failure instanceof HydrationMismatch ||
			failure === INITIAL_ADOPTION_INPUT_CHANGED ||
			suspended !== null
		)
			discardSeeds(hydration);
		else if (failed) passSeeds(hydration, previousHydration);
		setNativeAdoptionResolver(previousNative);
		WIP_CAPTURE = previousCapture;
		swapHydration(previousHydration);
		if (previousHydration !== null) previousHydration.node = getNextSibling(state.end);
		else clearHydrationThrow();
	}
	if (!failed) {
		if (state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
		retireInitialSuspenseHydration(
			state,
			capture.hostEvents !== undefined && transaction?.rootRequest === true ? initial : undefined,
		);
		// An enclosing boundary may still suspend after this arm rendered. Leave
		// its server metadata and ranges replayable until that capture commits.
		(capture.renderCleanups ??= []).push((discarded) => {
			if (discarded) return;
			finishInitialSuspenseHydration(initial);
		});
		spliceOffscreenCapture(capture);
		return;
	}
	if (suspended !== null) {
		state.pendingThenable = suspended;
		resumeOnSettle(suspended, () => {
			if (
				state.parentBlock.disposed ||
				state.pendingThenable !== suspended ||
				initialSuspenseHydrations?.get(state) !== initial
			)
				return;
			TRY_OPS!.inBoundary(state, retryInitialSuspenseHydration, initial);
		});
		return;
	}
	if (failure === INITIAL_ADOPTION_INPUT_CHANGED) {
		// The comparator accepted before the arm could observe this input. A
		// reentrant change invalidated it at the actual read, so use the same
		// silent client fallback as inputs changed before the attempt began.
		markArmDiscard(state);
		clientRenderDehydratedTry(state, previousHydration);
		return;
	}
	retireInitialSuspenseHydration(state);
	if (failure instanceof HydrationMismatch) {
		// The arm's own close matched before this attempt, so the mismatch lies
		// inside it: as React does for a Suspense boundary, discard its server DOM
		// and render it on the client rather than fail a root that may have
		// committed already.
		markArmDiscard(state);
		if (!clientRenderDehydratedTry(state, previousHydration))
			noteRecoverableHydrationError(() => failure, state.parentBlock);
		return;
	}
	if (isAdoptionControl(failure) || isHostContextRequest(failure)) throw failure;
	// A client error replaces the old server primary with the catch arm.
	discardServerArm(state);
	try {
		TRY_OPS!.catchError(state, failure, true);
		if (WIP_CAPTURE === null) finishInitialSuspenseHydration(initial);
		else
			(WIP_CAPTURE.renderCleanups ??= []).push((discarded) => {
				if (!discarded) finishInitialSuspenseHydration(initial);
			});
	} finally {
		if (previousHydration !== null) previousHydration.node = getNextSibling(state.end);
	}
}

function recoverHydrationEvent(state: TrySlot, error: unknown): void {
	const failure = hydrationHostFailure(error);
	markArmDiscard(state);
	if (!clientRenderDehydratedTry(state, null))
		noteRecoverableHydrationError(() => failure, state.parentBlock);
}

export function commitResumeInner(state: TrySlot): void {
	if (state.parentBlock.disposed) return;
	let deferredNativeAcceptance = false;
	if (NATIVE_READ_DRIVER && state.hiddenDom !== null) {
		const staged = state.stagedCapture;
		if (staged === null || !NATIVE_READ_DRIVER.validateCapture(staged)) {
			// Keep the fallback until the next candidate has actually passed native
			// validation. The existing hidden-render path already stages its DOM,
			// effects and refs without deleting that fallback first.
			const previousReplay = RESUME_REPLAY;
			RESUME_REPLAY = true;
			if (state.transitionHeld && state.tryBlock !== null)
				state.tryBlock.pendingMode = 'transition';
			try {
				// This retry has already reached its commit window. Preserve its render
				// priority above, but do not stage it through the same reveal timer again.
				attemptHiddenReveal(state, 'urgent');
				if (!deferringStagedRevealEffects && ROOT_RENDER_TRANSACTION === null) commitEffects();
			} finally {
				RESUME_REPLAY = previousReplay;
			}
			return;
		}
		if (WIP_CAPTURE === null)
			deferredNativeAcceptance = acceptNativeCapture(staged, state.parentBlock.idState.renderOwner);
	}
	const stagedCapture = state.stagedCapture;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (
		stagedCapture?.hostEvents !== undefined &&
		transaction !== null &&
		!transaction.aborted &&
		!ROOT_RENDER_ROLLBACK &&
		transaction.owner === state.parentBlock.idState.renderOwner
	) {
		// A sibling can release this reveal inside its root render. Preserve the
		// parked owner and its actions until the transferred host events are accepted.
		journalRootReveal(state);
	}
	const wasPending = state.branch === 2;
	const hiddenActivity = findHiddenActivity(state.parentBlock);
	const wasHeld = state.transitionHeld;
	let releaseHeld = wasHeld;
	let eventReveal: HydrationEventReveal | undefined;
	if (wasHeld) state.transitionHeld = false;
	// Leave the coordination sets — this boundary is committing now (a re-suspend
	// during the re-render re-adds it via handleSuspense → enterHeldTransition).
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	try {
		const tryBlock = state.tryBlock;
		if (tryBlock && !tryBlock.disposed) {
			const reconnectEffects = state.hiddenDom !== null;
			state.stagedCapture = null;
			state.stagedEffectDeps = null;
			if (state.hiddenDom) {
				if (state.block && state.block !== tryBlock) {
					const fallback = state.block;
					// Publish that no visible fallback is owned before its cleanup can
					// synchronously unmount or replace this boundary.
					state.block = null;
					unmountBlock(fallback);
					if (
						state.parentBlock.disposed ||
						tryBlock.disposed ||
						state.tryBlock !== tryBlock ||
						state.block !== null
					) {
						discardOffscreenCapture(stagedCapture);
						return;
					}
				}
				showTryBlock(state);
			}
			state.block = tryBlock;
			setTryBranch(state, 1);
			tryBlock.body = state.tryBody;
			// Preserve transition priority on the retry render — the retry is a
			// continuation of the same transition, so a re-suspend on a different
			// promise should also keep the prior DOM (and isPending stays true).
			if (wasHeld) tryBlock.pendingMode = 'transition';
			// Reveal: clear the hidden-subtree inactive flag (set on hide) so its effects
			// re-enqueue + re-fire (recreate) during this resume render.
			tryBlock.inactive = false;
			if (stagedCapture !== null) {
				// attemptHiddenReveal already completed this exact transition render while
				// the fallback was visible. Commit its deferred effects/refs/store checks now
				// that the entangled group is revealing; re-rendering would both duplicate
				// render work and lose mount-only ref attaches captured by that hidden pass.
				tryBlock.pendingMode = null;
				tryBlock.pendingDeferred = false;
				// Ref attach closures captured by a hidden pass can be stale after a
				// later same-node ref supersession. Reveal uses the current manifest.
				if (state.detachedRefs !== null) stagedCapture.refs.length = 0;
				if (stagedCapture.hostEvents !== undefined && ROOT_RENDER_TRANSACTION !== null) {
					eventReveal = { state, capture: stagedCapture, releasedHold: false };
					(ROOT_RENDER_TRANSACTION.hostEventReveals ??= []).push(eventReveal);
				}
				spliceOffscreenCapture(stagedCapture, deferredNativeAcceptance);
				state.hasResolved = true;
			} else {
				// Mark the replay window: useThenable's fresh-thenable reuse leniency
				// and the waterfall diagnostic apply only while a resolved suspension
				// is being replayed (ordinary updates must keep replacing thenables).
				// A held boundary replaying its body is the other way it can end up
				// half-updated: the resources that just resolved patch their nodes,
				// and then a still-pending one behind a data dependency suspends
				// again. The effects and refs of that attempt are already discarded
				// below; its DOM writes need the same treatment.
				const journalCheckpoint = armTransitionJournal(state);
				const previousCapture = WIP_CAPTURE;
				// Within a root render the replay checkpoints that render's capture. A
				// reveal that reconnects effects does so against queues of its own.
				const window =
					previousCapture === null || NATIVE_READ_DRIVER || reconnectEffects
						? null
						: openCaptureWindow(previousCapture);
				const resumeCapture = window === null ? createOffscreenCapture() : previousCapture!;
				const effectDeps = snapshotSubtreeEffectDeps(tryBlock);
				const refDetachCheckpoint = refDetachQueue.length;
				const prevReplay = RESUME_REPLAY;
				RESUME_REPLAY = true;
				WIP_CAPTURE = resumeCapture;
				let didThrow = false;
				let renderError: unknown = null;
				let invalidNativeReads = false;
				try {
					if (reconnectEffects) {
						renderWithEffectReconnect(tryBlock, resumeCapture);
					} else {
						renderBlock(tryBlock);
					}
					if (NATIVE_READ_DRIVER) {
						invalidNativeReads = !NATIVE_READ_DRIVER.validateCapture(resumeCapture);
						if (!invalidNativeReads && previousCapture === null)
							deferredNativeAcceptance = acceptNativeCapture(
								resumeCapture,
								state.parentBlock.idState.renderOwner,
							);
					}
				} catch (err) {
					didThrow = true;
					renderError = err;
				} finally {
					WIP_CAPTURE = previousCapture;
					RESUME_REPLAY = prevReplay;
					// A completed replay has nothing to undo, so close its window here
					// where the unwind is already guaranteed. A suspended one keeps it
					// open: handleSuspense below is what replays it.
					if (!didThrow && !invalidNativeReads) disarmTransitionJournal(journalCheckpoint);
				}
				if (invalidNativeReads) {
					try {
						rollbackTransitionJournal(journalCheckpoint, tryBlock);
						refDetachQueue.splice(refDetachCheckpoint);
						restoreSubtreeEffectDeps(tryBlock, effectDeps);
						discardOffscreenCapture(resumeCapture);
						if (wasHeld) {
							state.transitionHeld = true;
							HELD_TRANSITIONS.add(state);
							// This candidate never accepted or released the old hold.
							releaseHeld = false;
						}
						invalidateRender(tryBlock, tryBlock);
						scheduleRender(tryBlock);
					} finally {
						disarmTransitionJournal(journalCheckpoint);
					}
					return;
				}
				if (!didThrow) {
					if (state.detachedRefs !== null) {
						refDetachQueue.splice(refDetachCheckpoint);
						resumeCapture.refs.length = window === null ? 0 : window.refs;
					}
					if (window === null) spliceOffscreenCapture(resumeCapture, deferredNativeAcceptance);
					state.hasResolved = true;
				} else {
					// The journal has to outlive handleSuspense, which is what replays it,
					// so it is closed here rather than around the render — in a finally, or
					// a throw out of switchToCatch would strand the window open and let the
					// next boundary undo more than its own writes.
					try {
						refDetachQueue.splice(refDetachCheckpoint);
						restoreSubtreeEffectDeps(tryBlock, effectDeps);
						if (window !== null) dropCaptureWindow(window);
						else discardOffscreenCapture(resumeCapture);
						if (isSuspenseException(renderError)) {
							handleSuspense(state, renderError.thenable, tryBlock, journalCheckpoint);
						} else {
							// A resume runs outside the normal scheduler error drain. Use
							// the same reporting path when its committed retry reaches catch.
							handleResumeError(tryBlock, renderError);
						}
					} finally {
						disarmTransitionJournal(journalCheckpoint);
					}
					if (state.parentBlock.disposed) return;
				}
			}
			if (state.branch === 1) {
				if (wasPending) recordSuspenseCommit(state);
				publishHiddenRevealActions(state);
				// Reveal: re-attach the host refs detached on hide (same preserved nodes),
				// before commitEffects fires recreated layout effects. Enumerating now
				// ensures an aborted A→B hidden retry never resurrects stale ref A.
				queueCurrentHiddenRefs(state);
			}
		} else {
			mountTry(state);
		}
		// Commit the resume's effects on BOTH paths (the retry runs in a thenable
		// microtask, outside the normal flush): a full reveal RECREATES the destroyed
		// layout effects (ReactSuspenseEffectsSemantics); a re-suspend (one of several
		// promises resolved, another still pending) enqueued effects for the now-hidden
		// subtree that the effect drains must SKIP (inactive) and CLEAR — without draining here
		// the LAYOUT queue stays non-empty and the scheduler never goes quiescent.
		// A framed resume drains them once its render commits (inBoundaryRender).
		if (!deferringStagedRevealEffects && ROOT_RENDER_TRANSACTION === null) commitEffects();
	} finally {
		if (hiddenActivity !== null) SCHEDULED_VISIBILITY_DRIVER!.rehide!(hiddenActivity);
		if (releaseHeld) {
			if (eventReveal !== undefined) {
				eventReveal.releasedHold = true;
				// A reentrant rollback may already have restored the parked slot.
				if (state.stagedCapture === eventReveal.capture) state.transitionHeld = false;
			}
			tickTransitionCount(-1);
			releaseTransitionHookHolder(state);
		}
	}
}

/**
 * Reconnect committed effects at the exact memo/implicit-bail position in the
 * reveal render. That preserves source-sibling enqueue order without invoking an
 * equal-props component body: effects before this bail are already queued, these
 * retained effects are appended now, and effects in later siblings follow them.
 */
export function reconnectBailedEffects(block: Block): void {
	if (!EFFECT_RECONNECT_CONTEXT) return;
	const context = EFFECT_RECONNECT_CONTEXT;
	if (block !== context.root && !blockIsAncestorOf(context.root, block)) return;

	const disconnected: Array<{ scope: Scope; effect: EffectSlot; replay: PendingEffect[] | null }> =
		[];
	const visit = (scope: Scope): void => {
		const effects = scope.effectSlots;
		if (effects !== null) {
			for (let i = 0; i < effects.length; i++) {
				const effect = effects[i];
				if (context.queuedSlots.has(effect)) continue;
				const replay = context.insertionReplays?.get(effect);
				if (replay !== undefined) {
					disconnected.push({ scope, effect, replay });
					continue;
				}
				if (effect.active && effect.disconnected && effect.connectedFn !== null) {
					disconnected.push({ scope, effect, replay: null });
				}
			}
		}
		forEachSubtreeChild(scope, visit);
	};
	visit(block);
	// The collector preserves each scope's declaration order and the live block
	// structure's registered order. Do not sort by a slot's most recent enqueue:
	// staggered dependency updates would turn commit time into a false source-order
	// key and reconnect earlier-declared effects after later ones.
	for (let i = 0; i < disconnected.length; i++) {
		const { scope, effect, replay } = disconnected[i];
		const queue = context.queues[effect.phase];
		if (replay !== null) {
			// A completed memo/cached child can survive a later sibling's suspend.
			// Its insertion effect has not committed, so replay the retained body at
			// this bail position; a real rerender would have queued a fresher body.
			const last = replay[replay.length - 1];
			if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(effect);
			effect.active = last.fn !== null;
			effect.deps = last.fn === null ? undefined : last.args;
			const revision = ++effect.revision;
			// Plain-TypeScript custom-hook composition can enqueue several bodies
			// through one effective slot. They share a revision and all must commit.
			for (let j = 0; j < replay.length; j++) {
				queue.push({ ...replay[j], revision, seq: commitSeq++ });
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileQueueWork(queue[queue.length - 1]);
			}
		} else {
			queue.push({
				scope,
				slot: effect.slot,
				fn: effect.connectedFn!,
				order: effect.order,
				revision: effect.revision,
				args: effect.connectedArgs,
				phase: effect.phase,
				seq: commitSeq++,
			});
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileQueueWork(queue[queue.length - 1]);
		}
		markEffectReconnectQueued(effect, effect.phase, queue);
	}
}

export function attemptHiddenReveal(
	state: TrySlot,
	scheduledMode?: 'urgent' | 'transition',
	reason: 'update' | 'parent' | 'retry' = 'update',
): void {
	const hiddenActivity = findHiddenActivity(state.tryBlock);
	const previousReplay = RESUME_REPLAY;
	if (reason === 'retry') RESUME_REPLAY = true;
	try {
		inBoundaryRender(state, attemptHiddenRevealInner, scheduledMode, reason);
	} finally {
		RESUME_REPLAY = previousReplay;
		if (hiddenActivity !== null) SCHEDULED_VISIBILITY_DRIVER!.rehide!(hiddenActivity);
	}
}

function attemptHiddenRevealInner(
	state: TrySlot,
	scheduledMode?: 'urgent' | 'transition',
	reason: 'update' | 'parent' | 'retry' = 'update',
): void {
	const retryOnly = reason === 'retry';
	let tryBlock = state.tryBlock;
	if (tryBlock === null || tryBlock.disposed || state.hiddenDom === null) return;
	// A nested boundary cannot reveal independently through an ancestor's hidden
	// primary. Retry the outer transaction; its render will revisit this boundary
	// and either reveal both atomically or keep the whole subtree hidden.
	const hiddenAncestor = findSuspenseHiddenTry(tryBlock.parentBlock);
	if (hiddenAncestor !== null) {
		attemptHiddenRevealInner(hiddenAncestor, scheduledMode, reason);
		return;
	}
	cancelSuspenseRetry(state);
	// A fresh retry invalidates any readiness proved by an earlier attempt even
	// when that attempt had no retained capture (e.g. an ordinary thenable settle
	// added this boundary to STAGED_REVEALS). It becomes ready again only after the
	// new inputs complete below.
	STAGED_REVEALS.delete(state);
	if (state.stagedCapture !== null) {
		// A newer parent render supersedes commit work staged by an earlier hidden
		// attempt. Its effects/store checks never became visible, so discard them;
		// the fresh render below becomes the only candidate for this boundary.
		const supersededCapture = state.stagedCapture;
		const supersededEffectDeps = state.stagedEffectDeps;
		state.stagedCapture = null;
		state.stagedEffectDeps = null;
		if (supersededEffectDeps !== null) {
			restoreSubtreeEffectDeps(tryBlock, supersededEffectDeps);
		}
		discardOffscreenCapture(supersededCapture);
		deactivateScope(tryBlock, false);
	}
	if (ROOT_RENDER_TRANSACTION !== null && !ROOT_RENDER_ROLLBACK) journalRootReveal(state);
	const effectDeps = snapshotSubtreeEffectDeps(tryBlock);
	if (reason === 'parent' && !RESUME_REPLAY && !state.hasResolved) {
		// A completed speculative retry still is not a mount. New props must
		// initialize state/ref/memo/reducer hooks from the current inputs. Keep
		// promise replays and updates from inside the primary intact: discarding
		// a spawned deferred-value task would restart its initial preview forever.
		let uncommitted = true;
		for (const effect of effectDeps.keys()) {
			// Insertion lifetimes can already own an external renderer root while
			// its DOM primary is pending. Such a lifetime has actually committed
			// and must survive retries just like other preserved mounted content.
			if (effect.phase === INSERTION && effect.connectedFn !== null) {
				uncommitted = false;
				break;
			}
		}
		if (uncommitted) {
			tryBlock = restartUncommittedTry(state);
			if (tryBlock === null) return;
			effectDeps.clear();
		}
	}
	showTryBlock(state);
	tryBlock.body = state.tryBody;
	tryBlock.extra = state.env;
	tryBlock.inactive = false;
	const retryMode =
		scheduledMode ??
		tryBlock.pendingMode ??
		CURRENT_BLOCK?.currentRenderMode ??
		('urgent' as const);
	const stagesHeldTransition = retryMode === 'transition' && HELD_TRANSITIONS.has(state);
	// Every hidden retry is speculative until its whole body completes. Capture
	// commit work even for urgent retries: a ref/effect can mount before a later
	// sibling suspends, and must not leak while the fallback remains visible.
	// A hidden retry reconnects effects against its own queues, so it keeps a
	// capture of its own rather than a window into its render's.
	const hiddenCapture = createOffscreenCapture();
	let deferredNativeAcceptance = false;
	const previousCapture = WIP_CAPTURE;
	const refDetachCheckpoint = refDetachQueue.length;
	WIP_CAPTURE = hiddenCapture;
	let didThrow = false;
	let thrown: unknown = null;
	try {
		renderWithEffectReconnect(tryBlock, hiddenCapture);
	} catch (err) {
		didThrow = true;
		thrown = err;
	} finally {
		WIP_CAPTURE = previousCapture;
	}
	// The subtree's refs were already detached when its fallback appeared. Ref
	// identity changes during speculative retries must not detach again, and their
	// opaque attach closures are replaced by a current-manifest snapshot on reveal.
	refDetachQueue.splice(refDetachCheckpoint);
	hiddenCapture.refs.length = 0;
	if (didThrow) {
		// A suspended/errored retry did not commit. Its captured effect/ref/store
		// work and ref-identity detaches belong to that abandoned attempt, so none
		// may escape into the parent commit while the fallback remains visible.
		restoreSubtreeEffectDeps(tryBlock, effectDeps);
		discardOffscreenCapture(hiddenCapture);
		if (isSuspenseException(thrown)) {
			deactivateScope(tryBlock, false);
			// Still suspended — hide the try DOM again (the pending arm never moved)
			// and keep/refresh the resume wiring for the (possibly new) thenable.
			hideTryBlock(state);
			tryBlock.inactive = true;
			attachResume(state, thrown.thenable);
		} else if (retryOnly) {
			// A rejected wakeable or render error is still a retry-only commit.
			// Keep its exact reason, error UI and report private until the budget
			// expires. Newer urgent inputs can supersede the failed attempt.
			hideTryBlock(state);
			tryBlock.inactive = true;
			state.pendingThenable = null;
			queueSuspenseRetry(state, { error: thrown });
		} else {
			handleResumeError(tryBlock, thrown);
			// A saved-DOM retry can run directly from a thenable microtask, outside
			// the scheduler's normal render→commit drain. Its terminal catch arm is a
			// real commit and must publish refs/effects now. Parent/drain-driven hidden
			// attempts already have an enclosing commit and leave it there, as does a
			// framed retry (inBoundaryRender).
			if (!inFlush && CURRENT_BLOCK === null && ROOT_RENDER_TRANSACTION === null) commitEffects();
		}
		return;
	}
	// A transition-priority update can supersede the inputs of one member of
	// an entangled group after the timeout has already exposed its fallback.
	// Rendering the fresh inputs proves this boundary is data-ready, but it
	// must not reveal ahead of siblings that are still held. Park the updated
	// primary again and stage its commit work in the same barrier used by
	// thenable resumes. An urgent update remains a true supersession and takes
	// the immediate reveal path below.
	if (stagesHeldTransition || retryOnly) {
		state.pendingThenable = null;
		state.stagedCapture = hiddenCapture;
		state.stagedEffectDeps = effectDeps;
		hideTryBlock(state);
		tryBlock.inactive = true;
		if (stagesHeldTransition) {
			STAGED_REVEALS.add(state);
			queueMicrotask(flushStagedRevealsIfReady);
		} else {
			queueSuspenseRetry(state);
		}
		return;
	}
	if (NATIVE_READ_DRIVER) {
		if (!NATIVE_READ_DRIVER.validateCapture(hiddenCapture)) {
			restoreSubtreeEffectDeps(tryBlock, effectDeps);
			discardOffscreenCapture(hiddenCapture);
			hideTryBlock(state);
			tryBlock.inactive = true;
			invalidateRender(tryBlock, tryBlock);
			scheduleRender(tryBlock);
			return;
		}
		if (WIP_CAPTURE === null)
			deferredNativeAcceptance = acceptNativeCapture(
				hiddenCapture,
				state.parentBlock.idState.renderOwner,
			);
	}
	try {
		// Success — reveal without the suspending promise ever resolving.
		if (state.block !== null && state.block !== tryBlock) {
			const fallback = state.block;
			state.block = null;
			unmountBlock(fallback);
			if (
				state.parentBlock.disposed ||
				tryBlock.disposed ||
				state.tryBlock !== tryBlock ||
				state.block !== null
			) {
				discardOffscreenCapture(hiddenCapture);
				return;
			}
		}
		state.block = tryBlock;
		setTryBranch(state, 1);
		state.hasResolved = true;
		// Invalidate the wired resume: when the original thenable eventually
		// settles, its retry sees a mismatched pendingThenable and no-ops.
		state.pendingThenable = null;
		spliceOffscreenCapture(hiddenCapture, deferredNativeAcceptance);
		recordSuspenseCommit(state);
		publishHiddenRevealActions(state);
		queueCurrentHiddenRefs(state);
		if (state.transitionTimeoutId !== null) {
			clearTimeout(state.transitionTimeoutId);
			state.transitionTimeoutId = null;
		}
		if (state.transitionHeld) {
			state.transitionHeld = false;
			tickTransitionCount(-1);
			releaseTransitionHookHolder(state);
		}
		if (HELD_TRANSITIONS.has(state)) {
			HELD_TRANSITIONS.delete(state);
			STAGED_REVEALS.delete(state);
			// Mid-flush: defer the staged-batch check so this drain doesn't
			// re-enter commitResume for entangled siblings.
			queueMicrotask(flushStagedRevealsIfReady);
		}
	} catch (err) {
		switchToCatch(state, err);
	}
}

/** Rebase speculative effect enqueue order onto final source/tree commit order. */
export function rebaseOffscreenEffectSeq(capture: OffscreenCapture): void {
	const effects = capture.effects[INSERTION].concat(
		capture.effects[LAYOUT],
		capture.effects[PASSIVE],
	).sort((a, b) => a.seq - b.seq);
	for (let i = 0; i < effects.length; i++) effects[i].seq = commitSeq++;
}

/** Render a lite arm's body in its Scope, within its owning Block's render. */
export function renderLiteArm(scope: Scope, body: ComponentBody, env: any[] | undefined): void {
	const previous = CURRENT_SCOPE;
	CURRENT_SCOPE = scope;
	try {
		(body as (p: any, s: Scope, e: any) => unknown)(undefined, scope, env);
	} finally {
		CURRENT_SCOPE = previous;
	}
	scope.mounted = true;
}

/** Hidden content is its own suspense boundary; visible content still propagates. */
export function renderHiddenActivity(
	state: ActivitySlot,
	replay = false,
	block = state.block!,
): void {
	const previousReplay = RESUME_REPLAY;
	if (replay) RESUME_REPLAY = true;
	const insertionQueue = (WIP_CAPTURE === null ? effectQueues : WIP_CAPTURE.effects)[INSERTION];
	const insertionCheckpoint = insertionQueue.length;
	const insertionDeps = state.hasInsertionEffects
		? snapshotSubtreeEffectDeps(block, INSERTION)
		: null;
	try {
		if (state.pendingInsertions === null) renderBlock(block);
		else renderWithEffectReconnect(block, WIP_CAPTURE, state.pendingInsertions);
		state.pendingThenable = null;
		state.pendingInsertions = null;
	} catch (error) {
		if (!isSuspenseException(error)) throw error;
		// An independently scheduled descendant still belongs to its nearest
		// Suspense boundary. Only capture here when this Activity owns the throw;
		// nested Suspense keeps its normal fallback/retry transaction.
		for (
			let current: Block | null = block;
			current !== null && current !== state.block;
			current = current.parentBlock
		) {
			if (current.rare?.suspenseHandler) throw error;
		}
		let rolledBack: Set<EffectSlot> | null = null;
		if (insertionQueue.length > insertionCheckpoint) {
			const next: InsertionEffectReplays = new Map();
			for (let i = insertionCheckpoint; i < insertionQueue.length; i++) {
				const entry = insertionQueue[i];
				const effect = entry.scope.hooks?.get(entry.slot) as EffectSlot | undefined;
				if (effect?.effect !== true) continue;
				if (EFFECT_RECONNECT_CONTEXT) (rolledBack ??= new Set()).add(effect);
				// A later render/presence transition may already have superseded an
				// earlier enqueue in this attempt. Never revive that stale revision.
				if (effect.revision !== entry.revision || blockSubtreeDisposed(entry.scope.block)) continue;
				const entries = next.get(effect);
				if (entries === undefined) next.set(effect, [entry]);
				else entries.push(entry);
			}
			insertionQueue.length = insertionCheckpoint;
			// A nested hidden Activity can take over work retained by an outer
			// failed attempt. Its pending body now owns those entries; an ancestor
			// memo/context-refresh walk must not replay them before this one resolves.
			for (const effect of next.keys()) invalidateInsertionReplay(effect);
			if (state.pendingInsertions === null) state.pendingInsertions = next.size === 0 ? null : next;
			else for (const [effect, entries] of next) state.pendingInsertions.set(effect, entries);
		}
		if (insertionDeps !== null || state.pendingInsertions !== null) {
			restoreSubtreeEffectDeps(block, insertionDeps ?? new Map(), INSERTION);
		}
		if (rolledBack !== null) forgetEffectReconnectQueued(rolledBack, INSERTION, insertionQueue);
		suspendHiddenActivity(state, error.thenable);
	} finally {
		RESUME_REPLAY = previousReplay;
	}
}

/** Mount certified host-only rows without the full component render machinery. */
export function mountFastHostItems<T>(
	parentScope: Scope,
	state: ForSlot,
	parentNode: Node,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags: number | undefined,
	deps: any[] | undefined,
	mapped: boolean,
): void {
	const parentBlock = parentScope.block;
	const renderMode = parentBlock.currentRenderMode ?? 'urgent';
	const deferred = parentBlock.currentRenderDeferred;
	const previousScope = CURRENT_SCOPE;
	const previousBlock = CURRENT_BLOCK;
	let previous: Block | null = null;
	let current: Block | null = null;
	if (TRANSITION_JOURNAL) journalForSlot(state);
	if (ROOT_RENDER_TRANSACTION !== null && state.env !== deps)
		journalRootProperty(state, 'env', state.env);
	state.env = deps;
	if (((flags || 0) & 4) !== 0 && deps !== undefined) {
		if (ROOT_RENDER_TRANSACTION !== null && state.cachedDeps !== deps)
			journalRootProperty(state, 'cachedDeps', state.cachedDeps);
		state.cachedDeps = deps;
	}
	if (mapped) {
		if (state.mappedNative !== true) journalRootProperty(state, 'mappedNative', state.mappedNative);
		state.mappedNative = true;
	}
	// A committed list's rows keep their roots detached until they land before
	// its end at commit (DETACHED_ROOT).
	const next =
		ROOT_RENDER_TRANSACTION === null
			? null
			: listNext(state, parentBlock, ROOT_RENDER_TRANSACTION.ops.length);
	const rows = next === null ? null : listRoots(next, state.end);
	const anchor = rows === null ? state.end : (DETACHED_ROOT ?? newDetachedRoot());
	try {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			const sourceKey = getKey(item, index);
			const key = mapped ? 'k' + String(sourceKey) : sourceKey;
			const block = createBlock(
				'control-flow',
				parentBlock,
				parentNode,
				null,
				anchor,
				itemBody as ComponentBody,
				item,
				deps,
				null,
			);
			current = block;
			block.forSlot = state;
			block.key = key;
			block.itemIndex = index;
			block.currentRenderMode = renderMode;
			block.currentRenderDeferred = deferred;
			CURRENT_SCOPE = block;
			CURRENT_BLOCK = block;
			// Give each row the native frame renderBlock would. A native row body
			// otherwise opens one implicitly that nothing closes, leaving the
			// signal write guard active after the render returns.
			if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.beginRender(block);
			(itemBody as any)(item, block, deps);
			CURRENT_SCOPE = previousScope;
			CURRENT_BLOCK = previousBlock;
			if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.endRender(block, true, false);
			block.mounted = true;
			if (rows !== null) rows.push(block);
			else {
				const root = anchor.previousSibling!;
				block.startMarker = root;
				block.endMarker = root;
			}
			state.items.set(key, block);
			block.prevSibling = previous;
			if (previous !== null) previous.nextSibling = block;
			else state.head = block;
			previous = block;
			current = null;
		}
		state.tail = previous;
		state.size = items.length;
	} catch (error) {
		CURRENT_SCOPE = previousScope;
		CURRENT_BLOCK = previousBlock;
		if (current !== null) {
			if (NATIVE_READ_DRIVER)
				NATIVE_READ_DRIVER.endRender(current, false, isSuspenseException(error));
			// A value-position child can throw or suspend after commitBag inserted
			// its host. The still-unregistered row owns that host and any nested
			// child scopes, so dispose it before unwinding the completed prefix.
			// commitBag self-marked a detached row already.
			if (current.slots[0] !== undefined && rows === null) {
				const root = anchor.previousSibling;
				if (root !== null && root !== state.start) {
					current.startMarker = root;
					current.endMarker = root;
				}
			}
			unmountBlock(current, true);
		}
		while (previous !== null) {
			const block = previous;
			previous = block.prevSibling;
			state.items.delete(block.key);
			unmountBlock(block, true);
		}
		state.head = null;
		state.tail = null;
		state.size = 0;
		throw error;
	}
}

/** Keep direct row calls while preserving their scope for native reads and journals. */
export function renderLiteListItem(
	block: Block,
	body: ComponentBody,
	env: any[] | undefined,
): void {
	if (!TRANSITION_JOURNAL && !NATIVE_READ_DRIVER) {
		body(block.props, block, env);
		return;
	}
	const previousScope = CURRENT_SCOPE;
	CURRENT_SCOPE = block;
	const nativeToken = !NATIVE_READ_DRIVER ? -1 : beginActiveNativeReadScope(block);
	try {
		body(block.props, block, env);
	} finally {
		if (nativeToken >= 0) NATIVE_READ_DRIVER!.endScope(nativeToken);
		CURRENT_SCOPE = previousScope;
	}
}
