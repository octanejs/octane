// Scheduler, root transactions and the commit pipeline
//
// The update queue and flush, root render transactions and their journal, the
// commit and effect pipeline, transition scheduling, the ViewTransition commit
// and root creation. These functions assign each other's module-scope bindings,
// which only the declaring module may do, so they share this module. It
// evaluates after the drivers it reads.

import {
	drainRefDetaches,
	storeSyncQueue,
	placeCommitRefs,
	LAYOUT_CASCADE_LIMIT,
	refDetachQueue,
	type RefStateUpdate,
	blockSubtreeDisposed,
	discardSubtreeRefAttachesFrom,
	attachRef,
	type FragmentInstance,
} from './refs.js';
import { hydrationStarted, hydrating } from '../hydration-flag.js';
import { renderSlice } from '../render-slice.js';
import { type BindingHandoff, releaseBindingHandoff } from '../dom-binding-handoff.js';
import { bumpContextEpoch } from '../context-epoch.js';
import { postHostTask } from '../host-task.js';
import { hasPendingHostBudget } from '../host-budget.js';
import {
	__profileEffect,
	__profileRootRolledBack,
	__profileJournalRolledBack,
	__profileRootEnter,
	__profileRootCommitted,
	__profileRootExit,
	__profileDrain,
	__profileFlushPriority,
	__profileDrainEnd,
	__profileCount,
	ProfileCounter,
	__profileFlush,
	__profileSchedule,
	__profileTrackComponent,
} from '../profiling.js';
import {
	__devtoolsSetTransitionCount,
	__devtoolsNotifyFlush,
	__devtoolsSetNameResolver,
	__devtoolsSetChildWalker,
	__devtoolsRegisterRoot,
	__devtoolsUnregisterRoot,
} from '../devtools-hook.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { rebaseNativeRead } from '../signals/native-read-client.js';
import type { NativeReadWitness } from '../signals/native-read-collector.js';
import { type PendingSlotLike, pendingSignals } from '../signals/transition-state.js';
import {
	nativeProducerPublication,
	nativeSignalHydration as NATIVE_SIGNAL_HYDRATION,
	registerNativeReadRebase,
	beginNativeBatch,
	endNativeBatch,
	runNativeBatch,
} from '../signals/read-protocol.js';
import {
	type NativeAdoptionState,
	type NativeSignalManifest,
	createNativeAdoptionState,
	parseNativeSignalManifest,
} from '../signals/native-read-seeds.js';
import { retireSignalOwnerIdentity } from '../signals/owner-context.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import type { SignalOwner, SignalRendererOwnerIdentity } from '../signals/types.js';
import { inspectDevtoolsChildScopes, inspectDevtoolsName } from './profile-probes.js';
import type {
	ComponentBody,
	EffectFn,
	Cleanup,
	HookSlot,
	Scope,
	OutputHandler,
	RootIdState,
	Block,
	EffectSlot,
	PendingEffect,
	TransitionActionBatch,
	RootRenderOwner,
	RootRenderTransaction,
	SlotNext,
	ViewTransitionProps,
	StoreInst,
	RefAttach,
	SuspenseRefEntry,
	OffscreenCapture,
	HydrateSlot,
	TrySlot,
	TryHandler,
	ActivitySlot,
	RootContainer,
} from './types.js';
import {
	drainRefAttaches,
	withRefDetachSuppression,
	TRANSITION_TASK_DRIVER,
	TRANSITION_ROOT_DRIVER,
	SCHEDULED_VISIBILITY_DRIVER,
	activityRefState,
	drainEffectEventUpdates,
	drainMutationEffects,
	runLayoutEffects,
	drainDeferredPassiveUnmounts,
	schedulePassiveFlush,
	NATIVE_READ_DRIVER,
	resolveSlot,
	CONTROLLED_RESTORE_DRIVER,
	drainControlledSyncs,
	publishManualFormPending,
	installManualFormPending,
	SIGNAL_COMMIT_RETRY,
	HYDRATION_DRIVER,
	registerRootOptions,
	reportCaughtError,
	reportUncaughtError,
	publishInlineCaughtErrorReports,
	ensureTransitionDrivers,
	ensureScheduledVisibilityDriver,
	MANUAL_HOOK_DRIVER,
	noop,
} from './drivers.js';
import {
	clearSignalRetryOwners,
	runWithBlockSignalOwner,
	acceptNativeCapture,
	captureRenderPhaseUpdate,
	renderBlock,
} from './signal-owners.js';
import {
	PASSIVE,
	INSERTION,
	LAYOUT,
	effectQueues,
	passiveScheduled,
	inNestedUpdateCallback,
	discardSubtreeRefAttaches,
	type DeferredLayoutDriver,
	type DeferredLayoutCapture,
	captureDeferredPassives,
	restoreDeferredPassives,
	releaseDeferredPassives,
	drainPassiveEffects,
	hasPendingWork,
	hasScheduledWork,
	blockIsAncestorOf,
	compareEffectPostOrder,
	compareRefPostOrder,
	fireEffectCleanup,
	nativeEffectPublicationCurrent,
	drainEffectEventCommitActions,
	pendingPassiveUnmounts,
	checkStoreChanged,
	drainQueuedStoreSyncs,
} from './effects.js';
import {
	type VTHandle,
	vtStartNative,
	type VTOwner,
	type VTDocument,
	type VtRec,
	type VtGroup,
	type ViewTransitionDriver,
	VT_REGISTRY,
	VT_DIRTY,
	VT_CAPTURE,
	vtScopeName,
	vtProps,
	vtGetName,
	vtScopeForBlock,
	vtCaptureElements,
	vtReleaseScopeBoundary,
	vtMarkDirtyFromCurrentBlock,
	vtRevertNames,
	vtCreateRecord,
	vtFireCallback,
	vtObserveChanges,
	vtWaitForResources,
	vtReportError,
	vtPruneStaticDimensions,
	vtOwnerDocument,
	vtBeginCapture,
	vtRegisterHandle,
	vtCompleteCapture,
	vtFinishHandle,
	vtQueuedOwners,
	vtActiveHandles,
	vtWaitForHandles,
	vtInterruptPreparing,
	vtInterrupt,
	queueAllTransition,
	queuedTransitionCue,
	vtHasActiveHandles,
	vtNativeAvailable,
	vtWouldWrap,
	vtDrainPassivesBeforeCapture,
	vtPrepareGroup,
	vtFinalizeGroup,
	vtPreview,
	vtLeaving,
	vtPendingCaptureElements,
} from './view-transition.js';
import {
	ensureHooks,
	registerHookCleanup,
	missingSlot,
	slotStack,
	type StateSlot,
	type StateSetter,
	commitHookCells,
	foldHookQueue,
	queueHookUpdate,
	markRootUpdated,
	inInactiveSubtree,
	useEffect,
	type MemoHookEntry,
	publishMemoEntry,
	usesSubslots,
	enqueueStoreSync,
	subscribeToStore,
} from './hooks.js';
import { type WarmEntry, warmCacheForOwner, blockIsAncestor } from './use.js';
import {
	createTransitionActionBatch,
	inCommitCallback,
	transitionActionBatchForUpdate,
	transitionBatchReady,
	noteTransitionBlock,
	FLUSHED_TRANSITION_BATCHES,
	CONSUMED_TRANSITION_BLOCKS,
	clearFlushedTransitions,
	scheduleTransitionBatch,
	flushTransitionActionBatchIfReady,
	TRANSITION_LISTENERS,
	addTransitionHookToBatch,
	publishTransitionHookBatch,
	finishTransitionHookBatch,
	type TransitionHold,
	raiseHeldTransitionBatch,
	releaseTransitionHookHolder,
	HELD_TRANSITIONS,
	type WarmHarvestEntry,
	rootTransitionBatch,
	type queueTransitionBlock,
	markTransitionCue,
	queueTransitionFall,
	cancelTransitionFall,
	startTransition,
	type TransitionHookSlot,
	reportTransitionError,
	type DeferredSlot,
	postDeferredSwaps,
} from './transitions.js';
import { CURSOR } from './hydration.js';
import { type PortalSlot, installPortalEvents } from './portals.js';
import {
	blockRare,
	createBlock,
	invalidateRender,
	LiteBlockImpl,
	unmountBlock,
	resetScopeChildren,
} from './block.js';
import {
	type hideTryContentAndMountPending,
	type findScheduledVisibilityOwner,
	findHiddenActivity,
	findTryHandler,
	handleRenderError,
} from './suspense.js';
import {
	RETAINED_SIGNAL_OWNERS,
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	CURRENT_WARM_EPISODE,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
	beginRootRender,
	endRootRender,
	landRenderSliceWrites,
	preserveRootCreatedDom,
	effectEventQueue,
	effectEventCommitActions,
	WIP_CAPTURE,
	type renderVisibleTry,
	type attemptHiddenReveal,
	renderHiddenActivity,
} from './render.js';
import {
	type Root,
	type RootOptions,
	type InlineCaughtErrorReport,
	ROOT_RENDERABLE_BODY,
	frontierRootMount,
	clearRootContainer,
	releaseRootContainer,
	warnRootRenderSecondArgument,
} from './roots.js';
import { PRESENTATION_HYDRATION, PRESENTATION_PREPARATIONS } from './hydration-presentation.js';
import { isElementDescriptor } from './elements.js';
import {
	componentSourceLoc,
	warnRootUnmountArgument,
	warnRootLifecycleUnmount,
	validateRootHtmlNesting,
} from './diagnostics.js';
import {
	spliceOffscreenCapture,
	discardOffscreenCapture,
	HMR,
	type HmrMeta,
} from './component-slots.js';
import {
	rehideActivityAfterDescendantRender,
	forEachSubtreeChild,
	collectVisibleSubtreeRefs,
} from './activity.js';
import {
	JOURNAL_PROP,
	JOURNAL_CREATED,
	JOURNAL_UNDO,
	JOURNAL_EVENT_OWNER,
	BAG_SIZE,
	BAG_POOL,
	queueFrontier,
	noteFrontierMember,
	queueRootDeletion,
	dropRootOps,
	journalObjectOnce,
	rollbackTransitionJournal,
	type FocusSelectionSnapshot,
	captureFocusSelection,
	type FocusSelectionBatch,
	captureQueuedFocusSelection,
	restoreQueuedFocusSelection,
	restoreFocusedMovements,
} from './commit.js';
import { getFirstChild } from './templates.js';
import { type SubmitDispatchRec, settleSubmitTransition, flushFormResets } from './actions.js';
import {
	retireHostRange,
	_portalEventRanges,
	_eventRoots,
	unregisterDelegationTarget,
	_dispatchDepth,
	CAPTURE_SLOTS,
	type PortalEventBoundary,
	ACTIVE_SUBMIT_DISPATCH,
} from './events.js';
import { hasControlledSyncs } from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

export let VIEW_TRANSITION_DRIVER: ViewTransitionDriver | null = null;
/** Renderer listeners own update priority, not delegated DOM propagation. */
export let RENDERER_DISCRETE_EVENT_DEPTH = 0;
export let DEFERRED_LAYOUT_DRIVER: DeferredLayoutDriver | null = null;
// A ViewTransition's drain renders without committing: its root transactions
// commit inside the native update callback (vtFlush).
let HOLDING_ROOT_COMMITS = false;
let drainStoreSyncs: typeof drainQueuedStoreSyncs = noop;
// Hydration-only state: client paths read it behind `hydrationStarted`.
export let NATIVE_ADOPTION_RELEASES: NativeAdoptionState[] | null = null;

export function retireRendererSignalOwner(owner: SignalOwner): void {
	// Renderer deletion is lifecycle work, even when an enclosing native render
	// discovered it. Keep authored writes guarded; pause only this disposal.
	EFFECT_EVENT_LIFECYCLE_DEPTH++;
	const frame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
	try {
		retireSignalOwnerIdentity(owner);
	} finally {
		if (frame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(frame);
		EFFECT_EVENT_LIFECYCLE_DEPTH--;
	}
}

export function scheduleNativeRead(target: Block): void {
	// The adapter records the real owning Block separately from lightweight
	// Scope proxies. Native reads and suspended retry leases share this path.
	invalidateRender(target, target);
	// Native reads belong to a versioned publication frame. Invalidating an
	// already-held primary retries that frame coherently; it does not supersede
	// the user's transition like an urgent hook/store update.
	// `X && X.y` rather than `X?.y`: a minifier folds the guard when the driver is unused.
	const retainPriority =
		SCHEDULED_VISIBILITY_DRIVER && SCHEDULED_VISIBILITY_DRIVER.holdsNativeRead(target)
			? true
			: false;
	if (retainPriority) TRANSITION_DEPTH++;
	try {
		// A notification delivered during a flush, such as an accepted render
		// publishing its redeclared derived$ or query$, is a consequence of that
		// flush. Like an update from a layout effect, it spends the flush's
		// nested-update budget, so a render whose acceptance changes what it reads
		// fails with the depth error instead of rendering again without end.
		scheduleRender(
			target,
			inFlush,
			false,
			nativeProducerPublication &&
				!inFlush &&
				!inCommitCallback() &&
				_dispatchDepth === 0 &&
				RENDERER_DISCRETE_EVENT_DEPTH === 0,
		);
	} finally {
		if (retainPriority) TRANSITION_DEPTH--;
	}
}

export function ownNativeAdoption(
	scope: Scope,
	manifest: NativeSignalManifest | string,
	consume?: () => void,
): NativeAdoptionState {
	const renderOwner = scope.block.idState.renderOwner;
	const initial = renderOwner?.initialDocumentSignals;
	const signalOwner = renderOwner?.signalOwner;
	const initialScopeKey =
		((signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner)
			?.scopeKey ?? 'octane:document';
	let state: NativeAdoptionState | null | undefined = NATIVE_SIGNAL_HYDRATION
		? createNativeAdoptionState(
				typeof manifest === 'string' ? parseNativeSignalManifest(manifest) : manifest,
				initial,
				initialScopeKey,
			)
		: undefined;
	// The signal engine can arrive inside this attempt after a lazy import.
	// Delay only that case; loaded signal apps still validate before adopting.
	const adoption: NativeAdoptionState = state ?? {
		resolve(owner) {
			if (state === null || !NATIVE_SIGNAL_HYDRATION) return undefined;
			state ??= createNativeAdoptionState(
				typeof manifest === 'string' ? parseNativeSignalManifest(manifest) : manifest,
				initial,
				initialScopeKey,
			);
			return state.resolve(owner);
		},
		release() {
			state?.release();
			state = null;
		},
	};
	// Release moves an unchanged committed read live instead of rendering again.
	registerNativeReadRebase(rebaseNativeRead);
	registerHookCleanup(scope, () => {
		adoption.release();
		if (!ROOT_RENDER_ROLLBACK || scope.block.idState.renderOwner?.disposed) consume?.();
	});
	const finish = (discarded: boolean): void => {
		if (discarded) adoption.release();
		else {
			// Keep historical reads alive through the accepted ref/layout callbacks.
			// Release then schedules ordinary live reconciliation as the next render
			// for each reader whose live value differs from what it presented.
			(NATIVE_ADOPTION_RELEASES ??= []).push(adoption);
			consume?.();
		}
	};
	if (WIP_CAPTURE === null) finish(false);
	else (WIP_CAPTURE.renderCleanups ??= []).push(finish);
	return adoption;
}

export function releaseNativeAdoptions(): void {
	const pending = NATIVE_ADOPTION_RELEASES;
	if (pending === null) return;
	NATIVE_ADOPTION_RELEASES = null;
	for (const adoption of pending) adoption.release();
}
// Compiler-emitted child-only warm plans register on the synchronous component
// render stack. A descendant's first pending batch runs the active plans while
// every ancestor frame and its props are still live; render entry/exit
// checkpoints below provide stack discipline. Flat [block, plan, props] triples
// avoid allocating a record for every render that has reachable async children.
export const ACTIVE_WARM_PLANS: any[] = [];
export const DOM_ROOT_DISPOSERS = new WeakMap<Block, () => void>();
// Public root diagnostics need to distinguish an ordinary imperative unmount
// from one requested by an effect setup/cleanup while commit lifecycle work is active.
// Passive effects may drain outside `inFlush`, so that scheduler flag alone is
// insufficient for the observable root warning.
export let EFFECT_BODY_DEPTH = 0;
export let CURRENT_EFFECT_PHASE = -1;
// Recovery starts after all callbacks in the current commit/passive pass finish.
// Successful commits allocate no error queue.
let EFFECT_COMMIT_DEPTH = 0;
let COMMIT_PHASE_ERRORS: Array<{
	block: Block | null;
	error: unknown;
	handler?: TryHandler | null | undefined;
}> | null = null;
// Callback refs are commit-phase callbacks too. Track them separately from
// effect callbacks so an attach that repeatedly schedules its owner participates
// in the same bounded nested-update policy without conflating arbitrary commit
// plumbing (notably useSyncExternalStore consistency checks) with user callbacks.
export let REF_CALLBACK_DEPTH = 0;
// Octane discovers deletion destroys while reconciling a parent, but those
// callbacks are semantically mutation-phase work. Effect Events may be called
// from them even though CURRENT_SCOPE still reflects the eager parent render.
export let EFFECT_EVENT_LIFECYCLE_DEPTH = 0;

export function runEffectLifecycleCallback(callback: Cleanup, scope: Scope | null = null): void {
	EFFECT_EVENT_LIFECYCLE_DEPTH++;
	const nativeFrame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
	try {
		if (signalDocumentEnabled || scope?.block.idState.renderOwner?.signalOwner !== undefined)
			runWithBlockSignalOwner(scope, callback);
		else callback();
	} finally {
		if (nativeFrame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(nativeFrame);
		EFFECT_EVENT_LIFECYCLE_DEPTH--;
	}
}

// Layout/passive/insertion cleanups are commit callbacks just like their setup
// bodies. Keep their scheduled updates in the same bounded nested-update chain,
// while leaving runEffectLifecycleCallback's Effect Event permission intact.
export function runEffectCleanupCallback(
	callback: Cleanup,
	phase: number = -1,
	scope: Scope | null = null,
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileEffect(phase, true, callback, scope);
	const previousPhase = CURRENT_EFFECT_PHASE;
	CURRENT_EFFECT_PHASE = phase;
	EFFECT_BODY_DEPTH++;
	try {
		runEffectLifecycleCallback(callback, scope);
	} finally {
		EFFECT_BODY_DEPTH--;
		CURRENT_EFFECT_PHASE = previousPhase;
	}
}

// ---------------------------------------------------------------------------
// Scheduler — React-18-shaped automatic batching: urgent work flushes in a
// microtask, transition work in a later host task (TRANSITION_QUEUE)
// ---------------------------------------------------------------------------

export const QUEUE: Block[] = [];
// Destructive drains compact or clear QUEUE while user render code may re-enter
// another drain. Readers use this epoch to discard cursors into the old layout.
export let QUEUE_REINDEX_EPOCH = 0;
export let scheduled = false;
// A root's hydration attempt requests the flush here; per-update schedulers
// set the flag inline rather than add a call.
export function requestFlush(): void {
	scheduled = true;
	queueMicrotask(flush);
}
export let syncFlush = false; // flushSync sets this to drain the queue synchronously
// True while a flush (drainQueue/commitEffects) is on the stack. A flushSync
// that lands during it — a handler's own flushSync, or maybeFlushDiscrete when a
// controlled restore is pending for a DISCRETE event the browser dispatches
// SYNCHRONOUSLY inside a commit-phase DOM mutation (Chrome fires `blur`/
// `focusout`/`change` from removeChild when the focused element's subtree is
// torn down) — must NOT drain re-entrantly: the outer removal walk
// holds cached sibling pointers, and a nested commit mutating the same range
// corrupts it (removeChild: "not a child"). React's rule ("flushSync was called
// from inside a lifecycle method… cannot flush when already rendering"): run
// the callback, let the ambient flush pick up whatever it scheduled.
export let inFlush = false;
// Transition-priority renders and native producer refreshes wait here for a host
// task of their own instead of the microtask flush (#1864, G1), as React renders
// a transition lane in a Scheduler task. The urgent commit before them can then
// paint and the host can deliver input first, and a burst of ready
// continuations (an Action backlog, a transition started after each `await`)
// renders once rather than once per microtask hop. The microtask flush never
// drains this queue; the task, flushSync and act() do. An urgent update to a
// waiting block moves it onto the microtask flush. A pending cue for a waiting
// block does not: the block is queued in both places, and the microtask flush
// renders only its cue (renderTransitionCue).
export const TRANSITION_QUEUE: Block[] = [];
// Blocks whose pending cue was scheduled outside a flush (markTransitionCue); the
// microtask flush renders them at urgent priority (splitTransitionCue). They hold
// until a drain empties or reindexes QUEUE, while TRANSITION_CUE_EPOCH is current.
export const TRANSITION_CUES: Block[] = [];
// The live posted task's id, or 0. A flush that absorbs the queue retires that
// task, so transitions scheduled afterwards post a task of their own rather than
// joining one posted before input that arrived in between.
let transitionTask = 0;
let transitionTaskIds = 0;
// Transition completions waiting for the drain that renders their work
// (queueTransitionFall), as pairs: the batch, then its synchronous callback's
// submit record (or null), or undefined for an async Action, whose settle
// released the rest already. A drain that adopts the queue arms them
// (armTransitionFalls), and the armed pairs settle once that drain's renders are
// done (settleTransitionFalls).
export const TRANSITION_FALLS: Array<TransitionActionBatch | SubmitDispatchRec | null | undefined> =
	[];
export const ARMED_TRANSITION_FALLS: typeof TRANSITION_FALLS = [];
export let TRANSITION_FALL_DRAIN = 0;
export let TRANSITION_FALL_FROM = 0;
// Set while a posted transition task runs (the transition flush, or the
// useDeferredValue swap). That task already follows the urgent commit, so
// transition work it schedules, including from the passive effects drained
// before its render, joins its own flush rather than posting another task.
export let TRANSITION_TASK_ACTIVE = false;

/**
 * The task path, installed by transitions or native component readers. An
 * application using neither capability does not retain the queue or its poster.
 */
export interface TransitionTaskDriver {
	queue: typeof queueTransitionBlock;
	adopt: typeof adoptTransitionQueue;
	upgrade: typeof upgradeTransitionBlock;
}

/** Depth of nested startTransition() calls currently on the call stack. */
export let TRANSITION_DEPTH = 0;
/**
 * Number of async transition actions whose returned promise has not yet settled.
 * `TRANSITION_DEPTH` only covers the SYNCHRONOUS slice of a `startTransition`
 * callback; for an `async` action it is already 0 by the time the continuation
 * after the first `await` runs, so post-await setters would otherwise schedule
 * at urgent priority. Keeping this count elevated across the in-flight window
 * preserves Octane's automatic post-await transition priority. Caveat: it's a
 * process-global window, so an unrelated update outside a delegated event,
 * flushSync or commit callback (see inCommitCallback) while an async action is
 * pending is also tagged transition — perfect per-action scoping would need
 * AsyncContext, which isn't available in the browser target.
 */
export let ASYNC_TRANSITION_COUNT = 0;

/**
 * @internal Adapt a renderer-owned discrete native listener to the DOM scheduler.
 * Its ordinary updates remain urgent during an async Action and commit before
 * the listener returns; task-held transitions keep their own scheduling.
 */
export function __createDiscreteEventListener(listener: EventListener): EventListener {
	return (event) => {
		const batch = beginNativeBatch();
		RENDERER_DISCRETE_EVENT_DEPTH++;
		try {
			listener(event);
		} finally {
			try {
				endNativeBatch(batch);
			} finally {
				RENDERER_DISCRETE_EVENT_DEPTH--;
			}
		}
		if (!inFlush) flush();
	};
}

/** Slots whose batches finished, promoted by the next commit (promotePendingSignals). */
export let PENDING_SIGNAL_PROMOTIONS: PendingSlotLike[] | null = null;

export function queuePendingSignalPromotion(slots: PendingSlotLike[]): void {
	if (PENDING_SIGNAL_PROMOTIONS === null) PENDING_SIGNAL_PROMOTIONS = slots;
	else PENDING_SIGNAL_PROMOTIONS.push(...slots);
	// A flush promotes them with the commit it drains.
	if (!inFlush && CURRENT_BLOCK === null) promotePendingSignals();
	else if (!scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
}

function promotePendingSignals(): void {
	const slots = PENDING_SIGNAL_PROMOTIONS;
	if (slots === null) return;
	PENDING_SIGNAL_PROMOTIONS = null;
	pendingSignals!.promote(slots);
}

/**
 * Ordinary state updates dispatched during the synchronous slice of an async
 * transition Action must not become committed UI before the Action settles.
 * React renders those updates in a transition lane while an urgent render
 * exposes `isPending` against the last committed state. Their hook updates are
 * queued under this batch, which no render folds until the returned promise
 * settles (transitionBatchReady). Synchronous transitions flush their batch
 * before returning and therefore keep their existing scheduling behavior.
 *
 * `useOptimistic` deliberately does not use this batch: optimistic values are
 * the explicit in-flight surface and must remain visible while the Action is
 * pending.
 */
export let ACTIVE_TRANSITION_ACTION_BATCH: TransitionActionBatch | null = null;
/** The entangled batch shared by explicit transitions while an Action is awaiting. */
export let IN_FLIGHT_TRANSITION_ACTION_BATCH: TransitionActionBatch | null = null;

export function flushTransitionActionBatch(batch: TransitionActionBatch): void {
	if (batch.flushed) return;
	batch.flushed = true;
	if (IN_FLIGHT_TRANSITION_ACTION_BATCH === batch) {
		IN_FLIGHT_TRANSITION_ACTION_BATCH = null;
	}
	// An entangled batch renders once the batch it joined has every member.
	const root = rootTransitionBatch(batch);
	if (root !== batch) root.waiting--;
	if (transitionBatchReady(root)) scheduleTransitionBatch(root);
}
/**
 * True only while useDeferredValue's spawned swap dispatches its re-render
 * (the posted task's startTransition(scheduleRender) call — see
 * spawnDeferredSwap). scheduleRender copies it onto the scheduled block as
 * `pendingDeferred`: the "deferred lane" bit that lets a useDeferredValue
 * mounting inside that pass skip its own preview state (React's
 * anti-waterfall — only the first level defers).
 */
let DEFERRED_SPAWN = false;
/**
 * Outstanding transition WORK count — incremented when startTransition fires,
 * decremented when its renders commit (and again for any tryBlock that holds
 * the transition pending while suspended). Optimistic lifetimes subscribe to
 * this global count; useTransition tracks only its hook-owned Action batches.
 */
export let TRANSITION_PENDING_COUNT = 0;
/**
 * Batches each holder keeps waiting: a Suspense boundary or root whose
 * dropped render suspended on them (dropTransitionRender). A held batch keeps
 * its hooks pending and no render folds it until its holder retries it
 * (retryTransitionHolder).
 */
export let TRANSITION_HOLDERS: Map<object, TransitionHold> | null = null;
/** Holders a new update woke, retried in the transition task once that update committed. */
let WOKEN_TRANSITION_HOLDERS: Set<object> | null = null;
/** Released batches waiting for that task, as (batch, render, fall) triples (retryTransitionBatch). */
let RETRIED_TRANSITION_BATCHES: Array<TransitionActionBatch | boolean> | null = null;

export function holdTransitionBatch(holder: object, batch: TransitionActionBatch): void {
	const holders = (TRANSITION_HOLDERS ??= new Map());
	let hold = holders.get(holder);
	if (hold === undefined) holders.set(holder, (hold = { batches: new Set(), suspends: true }));
	else if (!hold.suspends) {
		// The holder suspended its retried work again.
		hold.suspends = true;
		for (const held of hold.batches) held.suspended++;
	}
	if (hold.batches.has(batch)) return;
	hold.batches.add(batch);
	batch.pendingHolds = (batch.pendingHolds ?? 0) + 1;
	if (hold.suspends) batch.suspended++;
	raiseHeldTransitionBatch(batch);
}

/**
 * Render a batch a hold released, and queue its falling edge with that render.
 * Inside a render or flush, the urgent work there commits first: the retry
 * waits for the transition task, as React renders the transition lane later.
 */
export function retryTransitionBatch(
	batch: TransitionActionBatch,
	render: boolean,
	fall: boolean,
): void {
	if (inFlush || CURRENT_BLOCK !== null) {
		(RETRIED_TRANSITION_BATCHES ??= []).push(batch, render, fall);
		scheduleTransitionTask();
		return;
	}
	TRANSITION_DEPTH++;
	try {
		if (render && transitionBatchReady(batch)) {
			if (TRANSITION_CELL_HARVEST !== null) reapplyTransitionMemoCells();
			scheduleTransitionBatch(batch);
		}
		if (fall) queueTransitionFall(batch, undefined);
	} finally {
		TRANSITION_DEPTH--;
	}
}

/**
 * A boundary that shows its timeout fallback lets the held work commit around
 * it. That work renders in the transition task, after the fallback's commit and
 * its effects, as React renders a transition lane after the commit before it.
 */
export function unsuspendTransitionHolder(holder: object): void {
	const hold = TRANSITION_HOLDERS?.get(holder);
	if (hold === undefined || !hold.suspends) return;
	hold.suspends = false;
	for (const batch of hold.batches)
		if (--batch.suspended === 0) {
			(RETRIED_TRANSITION_BATCHES ??= []).push(batch, true, false);
			scheduleTransitionTask();
		}
}
// useTransition/useOptimistic listeners are runtime-owned publication work.
// When a transition boundary changes the pending count while another component
// is rendering, their scheduled refreshes must not be diagnosed as userland
// cross-component render updates. Keep this depth scoped to listener invocation;
// startTransition's user callback runs only after tickTransitionCount returns.
let TRANSITION_LISTENER_PUBLISH_DEPTH = 0;

/** The scheduled Block drainQueue is rendering, while transitions are in use. */
export let TRANSITION_ORIGIN: Block | null = null;

/** Values dropped transition renders created, adoptable by a later transition render. */
export let TRANSITION_HARVEST: WarmHarvestEntry[] | null = null;
/** Inline memo cells a dropped render published: (cells, base, published, restored). */
let TRANSITION_CELL_HARVEST: any[] | null = null;

export function harvestTransitionWarmValues(origin: Block): void {
	const owner = origin.idState.renderOwner;
	const harvest = (scope: Scope): void => {
		const cache = scope.block.rare?.warmCache;
		if (cache !== undefined) {
			for (const [slot, list] of cache) {
				for (let i = 0; i < list.length; i++) {
					const entry = list[i];
					if (entry.available) {
						const harvested: WarmHarvestEntry = {
							slot,
							deps: entry.deps,
							value: entry.value,
							taken: false,
							owner,
						};
						if (entry.nativeWitness !== undefined) harvested.nativeWitness = entry.nativeWitness;
						(TRANSITION_HARVEST ??= []).push(harvested);
					}
				}
			}
		}
		forEachSubtreeChild(scope, harvest);
	};
	harvest(origin);
}

/**
 * A retry publishes the inline memo cells its dropped round computed again,
 * oldest first, wherever no later render replaced the restored values: the
 * compiled cache check computes before it publishes, so these cells cannot be
 * adopted on a miss the way hook-map entries are.
 */
function reapplyTransitionMemoCells(): void {
	const harvest = TRANSITION_CELL_HARVEST!;
	TRANSITION_CELL_HARVEST = null;
	for (let i = harvest.length - 4; i >= 0; i -= 4) {
		const cells = harvest[i] as any[];
		const base = harvest[i + 1] as number;
		const published = harvest[i + 2] as any[];
		const restored = harvest[i + 3] as any[];
		let unchanged = true;
		for (let j = 0; unchanged && j < restored.length; j++)
			unchanged = Object.is(cells[base + j], restored[j]);
		if (unchanged) for (let j = 0; j < published.length; j++) cells[base + j] = published[j];
	}
}

/** Restore the memo entries and cells a transaction replaced, newest first. */
export function restoreTransitionMemos(transaction: RootRenderTransaction, harvest: boolean): void {
	const memos = transaction.memos;
	if (memos === null) return;
	transaction.memos = null;
	for (let i = memos.length - 3; i >= 0; i -= 3) {
		const target = memos[i];
		const key = memos[i + 1];
		const previous = memos[i + 2];
		if (Array.isArray(target)) {
			if (harvest)
				(TRANSITION_CELL_HARVEST ??= []).push(
					target,
					key,
					target.slice(key, key + previous.length),
					previous,
				);
			for (let j = 0; j < previous.length; j++) target[key + j] = previous[j];
			continue;
		}
		const published = target.get(key) as MemoHookEntry | undefined;
		if (harvest && published !== undefined && published.deps !== undefined) {
			const harvested: WarmHarvestEntry = {
				slot: key,
				deps: published.deps,
				value: published.value,
				taken: false,
				owner: transaction.owner,
			};
			if (published.nativeWitness !== undefined) harvested.nativeWitness = published.nativeWitness;
			(TRANSITION_HARVEST ??= []).push(harvested);
			WARM_EVER = true;
		}
		if (previous === undefined) target.delete(key);
		else target.set(key, previous);
	}
}

/**
 * Render the work `holder` held at transition priority, publishing its falling
 * edge with it: a render that suspends again holds it again. A root also
 * retries its latest request, which the held state may sit below. Returns
 * whether `holder` held anything.
 */
export function retryTransitionHolder(holder: TrySlot | RootRenderOwner): boolean {
	if (TRANSITION_HOLDERS?.has(holder) !== true) return false;
	if ((holder as TrySlot).__kind === 'trySlotSlot') return releaseTransitionHookHolder(holder);
	tickTransitionCount(-1);
	releaseTransitionHookHolder(holder);
	TRANSITION_DEPTH++;
	try {
		(holder as RootRenderOwner).retry();
	} finally {
		TRANSITION_DEPTH--;
	}
	return true;
}

/**
 * A new update can unblock a held transition (React's markRootUpdated). Render
 * it again in the transition task, after the update commits on its own. A
 * boundary keeps isPending until it commits that work.
 */
export function wakeHeldTransitions(block: Block): void {
	const owner = block.idState.renderOwner;
	for (const holder of TRANSITION_HOLDERS!.keys()) {
		if (
			(holder as TrySlot).__kind === 'trySlotSlot'
				? (holder as TrySlot).parentBlock.idState.renderOwner === owner
				: holder === owner
		)
			(WOKEN_TRANSITION_HOLDERS ??= new Set()).add(holder);
	}
	if (WOKEN_TRANSITION_HOLDERS !== null) scheduleTransitionTask();
}

/** The transition task renders the work held back while urgent work committed. */
function retryWokenTransitions(): void {
	const woken = WOKEN_TRANSITION_HOLDERS;
	WOKEN_TRANSITION_HOLDERS = null;
	if (woken !== null) {
		for (const holder of woken) {
			if ((holder as TrySlot).__kind === 'trySlotSlot') unsuspendTransitionHolder(holder);
			else retryTransitionHolder(holder as RootRenderOwner);
		}
	}
	const retried = RETRIED_TRANSITION_BATCHES;
	RETRIED_TRANSITION_BATCHES = null;
	if (retried !== null) {
		for (let i = 0; i < retried.length; i += 3)
			retryTransitionBatch(
				retried[i] as TransitionActionBatch,
				retried[i + 1] as boolean,
				retried[i + 2] as boolean,
			);
	}
}

/**
 * The root whose commit ops are running, and the generation they commit for.
 * A same-component root.render from a mutation-phase callback (a custom
 * element's) supersedes retry generations, not this commit: it refreshes the
 * generation, and the commit finishes first, as React's does.
 */
export let COMMITTING_OWNER: RootRenderOwner | null = null;
let COMMITTING_GENERATION = 0;
/** The index of the commit op running, recorded by the refs it queues (RefAttach.op). */
export let COMMIT_OP = 0;

export interface RootRenderFrame {
	transaction: RootRenderTransaction;
	previous: RootRenderTransaction | null;
	log: any[] | null;
	bags: Map<object, number> | null;
	checkpoint: number;
	bagWindow: number;
	depth: number;
	capture: OffscreenCapture | null;
	discardStamp: number;
	opsCheckpoint: number;
}
export let ROOT_RENDER_TRANSACTIONS: RootRenderTransaction[] = [];
export let ROOT_RENDER_ROLLBACK = false;

/** @internal Opaque retry episode, without retaining an abandoned Scope. */
export function getRootRenderRetryKey(scope: Scope, retryOnly = false): object | null {
	const owner = scope.block.idState.renderOwner;
	if (owner === undefined || owner.disposed || (retryOnly && !owner.transaction?.rootRequest))
		return null;
	return (owner.retryKey ??= {});
}

export function journalUndo(undo: () => void): void {
	TRANSITION_JOURNAL!.push(JOURNAL_UNDO, undo, null, null);
}

export function journalRootProperty(target: object, key: PropertyKey, oldValue: unknown): void {
	if (ROOT_RENDER_TRANSACTION === null || ROOT_RENDER_ROLLBACK) return;
	TRANSITION_JOURNAL!.push(JOURNAL_PROP, target, key, oldValue);
}

/**
 * Save a structurally changed slot's record. Its DOM changes at commit, or in
 * DOM the render created (#2043), so a dropped render left the range as it was.
 */
export function journalRootSlot(state: object): void {
	if (ROOT_RENDER_TRANSACTION === null || ROOT_RENDER_TRANSACTION.aborted || ROOT_RENDER_ROLLBACK)
		return;
	journalObjectOnce(state);
}

/**
 * Whether hydration runs in a root's hydrating attempt. An attempt that
 * suspends rolls back and retries over the server DOM, so what it changes
 * there joins the root journal and its diagnostics wait for its commit: the
 * attempt that commits reports them once. Strict presentation adoption never
 * undoes the early owner's live DOM (see journalRootSlot).
 */
export function inRootHydrationAttempt(): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	return (
		transaction !== null &&
		transaction.hydrating === true &&
		!transaction.aborted &&
		!ROOT_RENDER_ROLLBACK &&
		PRESENTATION_HYDRATION?.revision === undefined
	);
}

/** A queued deletion is already absent from this root's logical render tree. */
export function retireRootBlock(block: Block): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (
		transaction === null ||
		transaction.aborted ||
		ROOT_RENDER_ROLLBACK ||
		block.idState.renderOwner !== transaction.owner
	)
		return;
	retireBlocks(block, transaction, true);
}

/**
 * Add `first` (and with `!single`, its following list rows) to the
 * transaction's retired set. The scheduler skips queued work at or below a
 * retired Block (drainQueue), and a held ViewTransition reads the set for what
 * leaves (vtPreview). A Block with no pending work, scope state, children or
 * signal authority can have none queued, so it stays out unless the
 * ViewTransition driver is installed. One loop: a bulk clear visits every row.
 */
export function retireBlocks(
	first: Block | null,
	transaction: RootRenderTransaction,
	single: boolean,
): void {
	// A truthiness read, which an application without the driver folds away.
	const all = VIEW_TRANSITION_DRIVER ? true : false;
	for (let block = first; block !== null; block = single ? null : block.nextSibling) {
		if (
			!all &&
			!block.pending &&
			block.rare?.updateError !== true &&
			block.hooks === null &&
			block.effectSlots === null &&
			block.cleanups === null &&
			block.children === null &&
			block._slots === null &&
			block.signalOwner === undefined &&
			!block.signalTokenEscaped
		)
			continue;
		(transaction.retired ??= new Set()).add(block);
		if (block.pending) {
			journalRootProperty(block, 'pending', block.pending);
			block.pending = false;
		}
	}
}

/**
 * Land a fresh run's rows, whose members applySlotNext then rehomes. Each node
 * goes in on its own, as React places each new row: a custom element in a
 * row connects before the next row arrives.
 */
export function placeRun(parent: Node, frag: DocumentFragment, anchor: Node): void {
	const from = frag;
	const into = parent;
	for (let node = from.firstChild; node !== null; node = from.firstChild)
		into.insertBefore(node, anchor);
	(frag as any).$$next = undefined;
}

export function isCreatedInRootRender(transaction: RootRenderTransaction, block: Block): boolean {
	return block.createdStamp === transaction.createdStamp;
}

/** A rolled-back attempt's Block: its scope goes; its DOM never reached the page. */
export function undoCreatedInRootRender(block: Block): void {
	const refCheckpoint = refDetachQueue.length;
	unmountBlock(block, false);
	refDetachQueue.length = refCheckpoint;
}

export function createdInRootRender(block: Block): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	// isCreatedInRootRender, inline: every mounted Block passes here.
	if (
		transaction === null ||
		ROOT_RENDER_ROLLBACK ||
		block.createdStamp === transaction.createdStamp
	)
		return;
	// Child Blocks inherit their parent's renderOwner; root/hydration entry uses
	// that root's owner. Reentrant frames reuse owner.transaction, so a Block
	// cannot be created by two live transactions with different stamps.
	block.createdStamp = transaction.createdStamp;
	// A Block that hydration creates adopts server DOM, which a rollback keeps
	// for the next attempt, as a root's hydrating attempt does (undoCreatedInRootRender).
	if (
		(hydrationStarted && PRESENTATION_HYDRATION?.revision !== undefined) ||
		(block.kind !== 'portal' && !transaction.hydrating && hydrating && CURSOR !== null)
	)
		preserveRootCreatedDom(block);
	(transaction.created ??= []).push(block);
	// The root window discards a Block together with a parent this attempt also
	// created, so it needs no creation entry. The parent's creation undo unmounts
	// the subtree it can reach, and rollbackRootRender sweeps `created` for the
	// rest, such as a portal whose content suspended before its slot was
	// registered, or an arm a restored slot no longer names. When that parent is
	// its own parentBlock, renderBlockInner skips its render entries too: the
	// parent's entries invalidate the committed path above it. A nested boundary
	// window replays only its own entries and has no sweep, so it keeps them all,
	// as do hydration and adopted DOM, where ROOT_DISCARD_STAMP is -1. A hookless
	// child's stand-in is not a Block; its owner's teardown reaches what is
	// created below it.
	let parent = TRANSITION_JOURNAL_DEPTH === 1 ? block.parentBlock : null;
	if (parent instanceof LiteBlockImpl) parent = parent.ownerBlock;
	if (parent === null || parent.createdStamp !== ROOT_DISCARD_STAMP)
		TRANSITION_JOURNAL!.push(JOURNAL_CREATED, block, null, null);
}

export function rollbackRootRender(transaction: RootRenderTransaction): void {
	if (transaction.aborted) return;
	transaction.aborted = true;
	// Its hook-cell folds never publish: their updates stay queued.
	transaction.cells = null;
	if (
		transaction.owner.retrySignalOwners !== undefined &&
		transaction.owner.retrySignalOwners !== RETAINED_SIGNAL_OWNERS
	)
		clearSignalRetryOwners(transaction.owner);
	const frame = beginRootRender(transaction.owner);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileRootRolledBack();
	const previousRollback = ROOT_RENDER_ROLLBACK;
	ROOT_RENDER_ROLLBACK = true;
	try {
		const owner = transaction.owner.current;
		if (owner !== null) rollbackTransitionJournal(0, owner);
		else {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileJournalRolledBack(transaction.log.length / 4);
			for (let i = transaction.log.length - 4; i >= 0; i -= 4) {
				if (transaction.log[i] === JOURNAL_UNDO) transaction.log[i + 1]();
				else if (transaction.log[i] === JOURNAL_CREATED)
					undoCreatedInRootRender(transaction.log[i + 1]);
				else if (transaction.log[i] === JOURNAL_EVENT_OWNER)
					transaction.log[i + 1].$$signalOwner = transaction.log[i + 2];
			}
			transaction.log.length = 0;
		}
		// After the replay, which can restore a bag's queued state.
		dropRootOps(transaction, 0, 0);
		// A Block discarded with its parent has no creation entry
		// (createdInRootRender). Unmount any its parent's undo did not reach.
		const created = transaction.created;
		if (created !== null)
			for (let i = created.length - 1; i >= 0; i--)
				if (!created[i].disposed) undoCreatedInRootRender(created[i]);
		discardOffscreenCapture(transaction.capture);
	} finally {
		ROOT_RENDER_ROLLBACK = previousRollback;
		endRootRender(frame);
	}
}

export function retireDetachedBindingLeases(owner: RootRenderOwner): void {
	for (const lease of owner.bindingLeases!) {
		// An invalid accepted host fences its original live scope. Replacement
		// retires that scope even if its externally moved host remains contained.
		const preparation =
			lease.host !== undefined && !lease.active()
				? PRESENTATION_PREPARATIONS.get(lease)
				: undefined;
		if (
			preparation !== undefined
				? !preparation.scope.block.disposed
				: owner.bindingContainer!.contains(lease.anchor)
		)
			continue;
		retireBindingLease(owner, lease);
	}
}

/** End an early binding's lease: its cleanup runs once and it stops presenting. */
export function retireBindingLease(owner: RootRenderOwner, lease: BindingHandoff): void {
	if (!owner.bindingLeases!.delete(lease)) return;
	PRESENTATION_PREPARATIONS.delete(lease);
	releaseBindingHandoff(lease);
	try {
		lease.retire();
	} catch (error) {
		if (!reportUncaughtError(owner.current, error)) console.error(error);
	}
}

/**
 * An explicit unmount must not first accept a speculative early takeover that
 * interrupting a deferred native update would publish: the refs of each
 * prepared presentation, which the unmount detaches without publishing.
 */
export function unmountPresentationRefs(owner: RootRenderOwner): SuspenseRefEntry[] | null {
	let refs: SuspenseRefEntry[] | null = null;
	for (const lease of owner.bindingLeases!) {
		const frame = PRESENTATION_PREPARATIONS.get(lease);
		if (frame?.revision !== undefined) collectVisibleSubtreeRefs(frame.scope, (refs ??= []));
	}
	return refs;
}

/** An unmounted root ends its leases: offered controls return, early bindings retire. */
export function releaseRootLeases(owner: RootRenderOwner, root: Block | null): void {
	if (owner.controlLeases !== undefined) {
		for (const lease of owner.controlLeases.values())
			if (lease !== undefined) lease.owner = undefined;
		owner.controlLeases.clear();
	}
	if (owner.bindingLeases !== undefined) {
		for (const lease of owner.bindingLeases) {
			releaseBindingHandoff(lease);
			PRESENTATION_PREPARATIONS.delete(lease);
			try {
				if (!owner.preservePresentation) lease.retire();
			} catch (error) {
				if (!reportUncaughtError(root, error)) console.error(error);
			}
		}
		owner.bindingLeases.clear();
	}
}

/**
 * Commit every finished root render, in order. Each runs its queued commit ops
 * in render order (the mutation phase); a deletion cleanup that unmounts the
 * root ends that commit, as its remaining entries name dead DOM.
 */
export function commitRootRenders(): void {
	if (HOLDING_ROOT_COMMITS) {
		if (renderSlice) landRenderSliceWrites(renderSlice);
		return;
	}
	// Finished transitions' signals promote before this commit accepts the
	// renders that read them; committed readers hear of it once it ends.
	const promoting = PENDING_SIGNAL_PROMOTIONS !== null;
	const signals = promoting ? beginNativeBatch() : null;
	try {
		if (promoting) promotePendingSignals();
		const transactions = ROOT_RENDER_TRANSACTIONS;
		if (transactions.length !== 0) ROOT_RENDER_TRANSACTIONS = [];
		for (const transaction of transactions) {
			// A root still rendering (a nested flushSync) commits when its render ends.
			if (transaction.rendering !== 0) {
				ROOT_RENDER_TRANSACTIONS.push(transaction);
				continue;
			}
			const owner = transaction.owner;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileRootEnter(transaction, owner);
			try {
				// A hold reached outside a drained origin (dropTransitionRender).
				if (transaction.holders !== null && TRANSITION_ROOT_DRIVER)
					TRANSITION_ROOT_DRIVER.drop(transaction);
				if (transaction.aborted || owner.disposed) {
					if (owner.transaction === transaction) owner.transaction = null;
					continue;
				}
				// This is the native acceptance point. Validate before any deletion,
				// ref, or effect callback can observe the render. A later callback
				// write starts another transaction and does not revoke this snapshot.
				if (
					(hydrationStarted && !HYDRATION_DRIVER!.currentPresentations(transaction.capture)) ||
					(NATIVE_READ_DRIVER && !NATIVE_READ_DRIVER.validateCapture(transaction.capture))
				) {
					const presentationChanged = hydrationStarted
						? !HYDRATION_DRIVER!.currentPresentations(transaction.capture)
						: false;
					rollbackRootRender(transaction);
					if (owner.transaction === transaction) owner.transaction = null;
					if (!owner.disposed) {
						owner.wakeable = null;
						owner.generation++;
						if (presentationChanged) HYDRATION_DRIVER!.retryPresentations(transaction.capture);
						else owner.retry();
					}
					continue;
				}
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileRootCommitted(transaction);
				if (owner.transaction === transaction) owner.transaction = null;
				// The root request committed, unless a held transition keeps it waiting.
				if (transaction.rootRequest && TRANSITION_HOLDERS?.has(owner) !== true) {
					owner.wakeable = null;
					owner.generation++;
				}
				if (owner.wakeable === null) {
					owner.retryKey = null;
					owner.nativeRetry?.clear();
					// Claimed owners belong to accepted scopes. Unvisited branches from
					// an earlier pending attempt have no continuing consumer.
					if (owner.retrySignalOwners !== undefined) clearSignalRetryOwners(owner);
				}
				const deferredNativeAcceptance = acceptNativeCapture(transaction.capture, owner, true);
				if (transaction.cells !== null) commitHookCells(transaction.cells);
				// Values dropped rounds created were for work that has now committed.
				if (
					transaction.batches !== null &&
					(TRANSITION_HOLDERS === null || TRANSITION_HOLDERS.size === 0)
				)
					TRANSITION_HARVEST = TRANSITION_CELL_HARVEST = null;
				// The mutation phase precedes the incoming ref/layout publication.
				let acceptedGeneration = owner.generation;
				const ops = transaction.ops;
				// A ref a commit op queues joins the render's at the op's place.
				const refsAt = refAttachQueue.length;
				if (ops.length !== 0) {
					const previousOwner = COMMITTING_OWNER;
					const previousGeneration = COMMITTING_GENERATION;
					COMMITTING_OWNER = owner;
					COMMITTING_GENERATION = acceptedGeneration;
					try {
						for (let i = 0; i < ops.length; i += 2) {
							if (owner.disposed || owner.generation !== COMMITTING_GENERATION) break;
							const target = ops[i + 1];
							COMMIT_OP = i;
							try {
								// A commit function's `careful` flag, as bagDone passes it.
								ops[i](
									target,
									TRANSITION_JOURNAL !== null ||
										(_dispatchDepth !== 0 && CAPTURE_SLOTS.length !== 0),
								);
							} catch (error) {
								// React routes a commit-phase error to the nearest boundary and keeps
								// committing; the failed bag's state was cleared before its first write.
								// A structural entry's cleanups already route their own errors.
								if (typeof target?.$ !== 'number') throw error;
								if (SIGNAL_COMMIT_RETRY ? !SIGNAL_COMMIT_RETRY(target, error) : true)
									reportEffectError(target.next[target.$ & BAG_SIZE].block, error);
							}
							// While the pool is short, an idle bag returns its cells and holds `C`
							// again: a queued bag's entry always names its staged cells. Only a bag
							// has `$`; any other target, null included, compares undefined.
							if (BAG_POOL.length < 8 && target?.$ <= BAG_SIZE) {
								const next = target.next;
								BAG_POOL.push(next);
								target.next = next[target.$ + 2];
							}
						}
						acceptedGeneration = COMMITTING_GENERATION;
					} finally {
						ops.length = 0;
						COMMITTING_OWNER = previousOwner;
						COMMITTING_GENERATION = previousGeneration;
						COMMIT_OP = 0;
						// Everything this commit retired has left the document (retireEventHostTree).
						if (previousOwner === null) retiringHostsSince = 0;
					}
				}
				if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.pruneDeferredRefs(owner);
				if (owner.disposed || owner.generation !== acceptedGeneration) {
					discardOffscreenCapture(transaction.capture);
					continue;
				}
				const split = refAttachQueue.length;
				spliceOffscreenCapture(transaction.capture, deferredNativeAcceptance);
				if (split > refsAt) placeCommitRefs(refsAt, split);
				if (hydrationStarted && owner.bindingLeases !== undefined && owner.bindingLeases.size > 0) {
					// A successful replacement may remove a still-dormant leased view.
					HYDRATION_DRIVER!.retireDetachedBindingLeases(owner);
				}
			} finally {
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileRootExit();
				// Committed or dropped, its queue is empty: the owner's next transaction
				// reuses it rather than allocating one.
				if (transaction.ops.length === 0 && owner.transaction !== transaction)
					owner.spareOps = transaction.ops;
			}
		}
	} finally {
		if (promoting) endNativeBatch(signals);
	}
	if (renderSlice) landRenderSliceWrites(renderSlice);
}
/** True while the wrapped drain (the update callback's flushWork) runs. */
export let VT_DRAIN = false;

/**
 * Transition types staged by addTransitionType() for the CURRENT transition
 * batch — captured (and reset) by the flush that commits the batch, whether
 * wrapped (vtFlush hands them to class resolution + callbacks) or not.
 */
let VT_PENDING_TYPES: string[] = [];

export function vtScheduleQueuedWork(): void {
	if ((QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) && !scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
}

// An Action cue alone, even one that keeps transition priority, publishes
// before native capture. Only this optional capability owns it.
export let VT_ACTION_CUE = false;

/** Install the concrete driver only when a ViewTransition-facing API survives. */
export function ensureViewTransitionDriver(): ViewTransitionDriver {
	if (VIEW_TRANSITION_DRIVER) return VIEW_TRANSITION_DRIVER;
	const driver: ViewTransitionDriver = {
		addType(type) {
			if (VT_PENDING_TYPES.indexOf(type) === -1) VT_PENDING_TYPES.push(type);
		},
		routeFlush() {
			// A previous commit's passives can add urgent work or another owner.
			// Choose priority and affected native handles only after they run.
			if (VT_CAPTURE === null && QUEUE.length > 0 && !vtDrainPassivesBeforeCapture()) {
				vtInterrupt();
				return false;
			}
			if (VT_CAPTURE !== null) {
				if (
					(DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.holdsPendingQueue()) ||
					queueAllTransition()
				)
					return true;
				if (QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) vtInterruptPreparing();
				return false;
			}
			if (!vtHasActiveHandles()) {
				if (!vtWouldWrap()) return false;
				vtFlush();
				return true;
			}
			// A flush with nothing to render mutates nothing an animation captured.
			if (QUEUE.length === 0 && ROOT_RENDER_TRANSACTIONS.length === 0) return false;
			const owners = vtQueuedOwners();
			const handles = vtActiveHandles(owners);
			if (handles.size > 0) {
				if (queueAllTransition()) return vtWaitForHandles(handles, owners);
				vtInterruptPreparing(owners);
				return false;
			}
			if (!vtWouldWrap()) return false;
			vtFlush();
			return true;
		},
		markActionCue() {
			if (!syncFlush && !inFlush) VT_ACTION_CUE = true;
		},
		endCue() {
			VT_ACTION_CUE = false;
		},
		shouldClearTypesAfterFlush() {
			VT_ACTION_CUE = false;
			if (VT_PENDING_TYPES.length === 0) return false;
			for (let i = 0; i < QUEUE.length; i++) {
				// A pending cue leaves the types for its transition's task.
				if (QUEUE[i].pendingMode === 'transition' && !queuedTransitionCue(QUEUE[i])) return true;
			}
			return false;
		},
		clearTypes() {
			VT_PENDING_TYPES = [];
		},
		interrupt: vtInterruptPreparing,
		refreshPendingOwner(owner) {
			const transaction = owner.transaction;
			if (transaction !== null && transaction.heldGeneration !== undefined)
				transaction.heldGeneration = owner.generation;
		},
		wouldWrap: vtWouldWrap,
		wrapResume(work, getBlocks) {
			if (inFlush || VT_DRAIN || (hydrating && CURSOR !== null) || typeof document === 'undefined')
				return false;
			// A resume commits pending render work in its layout drain too. Flush
			// the previous commit's passives before choosing either owners or waits,
			// then include every sibling update those passives scheduled. Transitions
			// waiting for their task join the commit that drains here, so one view
			// transition captures them; they are adopted only by a drain that runs.
			const passivesSettled = vtDrainPassivesBeforeCapture();
			const capture = VT_CAPTURE;
			const resumed = getBlocks?.() ?? [];
			const queued = TRANSITION_QUEUE.length === 0 ? QUEUE : QUEUE.concat(TRANSITION_QUEUE);
			const blocks = queued.length === 0 ? resumed : [...new Set([...resumed, ...queued])];
			const owners = vtQueuedOwners(blocks);
			if (!passivesSettled || (QUEUE.length > 0 && !queueAllTransition())) {
				// An urgent sibling keeps its priority. A still-open passive cascade
				// can touch further owners, so only that fallback interrupts all scopes.
				if (passivesSettled) vtInterruptPreparing(owners);
				else vtInterrupt();
				adoptTransitionQueue(true);
				work();
				flushWork();
				return true;
			}
			const handles = vtActiveHandles(owners);
			if (capture !== null || handles.size > 0) {
				vtWaitForHandles(handles, owners);
				const resume = (): void => {
					if (!driver.wrapResume(work, getBlocks)) work();
				};
				const waits: Promise<void>[] = [];
				if (capture !== null) waits.push(capture.ready);
				for (const handle of handles) waits.push(handle.finished);
				Promise.allSettled(waits).then(resume);
				return true;
			}
			if (!vtNativeAvailable(owners)) return false;
			vtFlush(
				() => {
					adoptTransitionQueue(true);
					work();
					if (QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) flushWork();
				},
				owners,
				blocks,
			);
			return true;
		},
		unregister(block) {
			if (block.rare !== null && block.rare.vt !== null) {
				vtReleaseScopeBoundary(block);
				VT_REGISTRY.delete(block);
			}
		},
		markDirty() {
			if (VT_DRAIN) vtMarkDirtyFromCurrentBlock();
		},
		queueAllTransition,
		renderBoundary(block, props) {
			const rare = blockRare(block);
			if (TRANSITION_JOURNAL !== null) journalRootProperty(rare, 'vt', rare.vt);
			if (rare.vt === null) {
				// Visibility snapshots decide activation: retained Activity boundaries
				// can enter/exit without changing this mounted-boundary registration.
				rare.vt = props;
				VT_REGISTRY.add(block);
			} else {
				rare.vt = props;
			}
		},
	};
	VIEW_TRANSITION_DRIVER = driver;
	return driver;
}

export function tickTransitionCount(delta: number): void {
	TRANSITION_PENDING_COUNT += delta;
	if (TRANSITION_PENDING_COUNT < 0) TRANSITION_PENDING_COUNT = 0;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__devtoolsSetTransitionCount(TRANSITION_PENDING_COUNT);
	TRANSITION_LISTENER_PUBLISH_DEPTH++;
	try {
		for (const fn of TRANSITION_LISTENERS) {
			try {
				fn();
			} catch (err) {
				console.error(err);
			}
		}
	} finally {
		TRANSITION_LISTENER_PUBLISH_DEPTH--;
	}
}
// Commit actions that must run after the callback bodies above publish. Activity
// uses this for visible→hidden deactivation+DOM hiding so its cleanup sees the
// fresh body while the range is still connected. Actions share the render/WIP
// transaction below, so an aborted enclosing render drops them. An inline catch
// can return a report for this commit's post-layout phase, after its refs connect.
export type EffectEventCommitAction = () => InlineCaughtErrorReport | void;
export const refAttachQueue: RefAttach[] = [];
// A Fragment can re-point its ref during a render-phase replay before the mount
// commit drains. Preserve that existing live-read contract with a shared callback
// trampoline. The common drain remains branch-free, and Fragment instances do not
// allocate a getter closure.
export function attachLiveFragmentRef(instance: FragmentInstance): void {
	// Portal slots mount after the fragment binding but before commit. Publish all
	// logically owned child handles before handing the instance to its callback.
	instance._reapply();
	attachRef(instance._currentRef, instance);
}

/** @internal Preserve the owning renderer's scheduler without racing a staged commit. */
export function scheduleRenderCleanup(
	schedule: (callback: () => void) => void,
	receiver: unknown,
	cleanup: () => void,
	onDiscard?: () => void,
): void {
	if (WIP_CAPTURE === null) {
		schedule.call(receiver, cleanup);
	} else {
		(WIP_CAPTURE.renderCleanups ??= []).push((discarded) => {
			// Release abandoned cross-renderer ownership before a native wakeable
			// can retry, even when the other renderer delays its own abort work.
			try {
				if (discarded) onDiscard?.();
			} finally {
				schedule.call(receiver, cleanup);
			}
		});
	}
}

// Live fragment refs need a commit-time child diff even before a listener or
// observer is installed: each current first-level host child exposes its owning
// FragmentInstances through `reactFragments`. Apps without fragment refs keep
// the same single-size-check commit fast path.
export const activeFragments = new Set<FragmentInstance>();

function reapplyFragmentBindings(): void {
	if (activeFragments.size === 0) return;
	for (const fi of activeFragments) fi._reapply();
}

// ─────────────────────────────────────────────────────────────────────────────
// React-parity act() environment flag.
//
// `IS_OCTANE_ACT_ENVIRONMENT` is the opt-in dev signal that scheduler updates
// happening outside `act(...)` should be reported. Test setups flip it on once
// (mirrors React's IS_REACT_ACT_ENVIRONMENT). `actScopeDepth` counts how deep
// we are inside an active `act()` call; non-zero suppresses the warning.
// `syncFlush` (set by flushSync) also suppresses — code inside flushSync is by
// definition handling its own scheduling.
// ─────────────────────────────────────────────────────────────────────────────
let IS_OCTANE_ACT_ENVIRONMENT = false;
export let actScopeDepth = 0;
// Active callback transactions are distinct from the asynchronous drain of an
// already-returned synchronous act call. Only the former batch nested helpers.
let actCallbackDepth = 0;
let asyncActCallbackDepth = 0;
let actErrors: unknown[] | null = null;

/** Whether a testing helper is executing within an active act callback. */
export function isInActScope(): boolean {
	return actCallbackDepth !== 0 || asyncActCallbackDepth !== 0;
}

/**
 * Test-environment opt-in. When true, scheduleRender() calls that happen
 * outside a flushSync or an act() callback emit a console.error mirroring
 * React's "An update to X was not wrapped in act(...)" message. Default
 * false so production / non-test code never warns.
 */
export function setIsOctaneActEnvironment(value: boolean): void {
	IS_OCTANE_ACT_ENVIRONMENT = value;
}

function isActEnvironment(): boolean {
	return (
		IS_OCTANE_ACT_ENVIRONMENT ||
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT === true
	);
}

const NESTED_UPDATE_LIMIT = 50;
const ACT_DRAIN_LIMIT = NESTED_UPDATE_LIMIT + 50;
let UPDATE_CHAIN_ID = 0;
// The synchronous-callback budget (BlockRare.updateCount) has its own chain.
// It restarts with every user update chain and after any outermost commit when
// no synchronous-callback update was scheduled since the previous one. That is
// React's rule: commitRootImpl resets nestedUpdateCount when a commit leaves no
// sync work. The flag also sees a passive effect's own flushSync update, which
// lands between outermost commits. Each passive-driven commit therefore gets a
// fresh budget, while UPDATE_CHAIN_ID keeps the passive warning counting the
// whole cascade.
let NESTED_UPDATE_CHAIN_ID = 0;
let NESTED_UPDATE_SCHEDULED = false;
// Passive effects drained before a render join it, so a passive cascade that
// re-measures in a layout effect would spend one sync update per step on the
// same chain. When a block exhausts its budget while passive effects wait, they
// are held for this chain (see scheduleRender) until a commit settles without them.
let HELD_PASSIVE_CHAIN = -1;
let PASSIVE_UPDATE_COUNTS: WeakMap<Block, { chain: number; count: number }> | null = null;

function warnPassiveUpdateDepth(): void {
	console.error(
		'Maximum update depth exceeded. Check the dependencies of effects that schedule state updates.',
	);
}

function countPassiveUpdate(block: Block): void {
	if (process.env.NODE_ENV === 'production') return;
	const counts = (PASSIVE_UPDATE_COUNTS ??= new WeakMap());
	let state = counts.get(block);
	if (state === undefined || state.chain !== UPDATE_CHAIN_ID) {
		state = { chain: UPDATE_CHAIN_ID, count: 0 };
		counts.set(block, state);
	}
	if (++state.count === NESTED_UPDATE_LIMIT + 1) warnPassiveUpdateDepth();
}

function settleNestedUpdateChain(): void {
	// A hold that ends in a settled commit proves the exhausted budget was spent
	// by a passive cascade riding along with each re-measure. React warns about
	// that cascade without throwing, and so does Octane.
	if (process.env.NODE_ENV !== 'production' && HELD_PASSIVE_CHAIN === NESTED_UPDATE_CHAIN_ID)
		warnPassiveUpdateDepth();
	NESTED_UPDATE_CHAIN_ID++;
}

export class MaximumUpdateDepthError extends Error {}

// Development attribution for a block whose nested-update budget was spent by a
// layout snapshot that changed on every pass, or by signals its accepted renders
// changed (cell null). Tagged with its update chain so a later, unrelated loop
// on the same block keeps the generic message.
export let UPDATE_DEPTH_CAUSES: WeakMap<
	Block,
	{ cell: object | null; chain: number; message: string }
> | null = null;

export function maximumUpdateDepthError(block?: Block): Error {
	const error = new MaximumUpdateDepthError(formatClientError(1));
	if (process.env.NODE_ENV !== 'production' && block !== undefined) {
		const cause = UPDATE_DEPTH_CAUSES?.get(block);
		if (cause !== undefined) {
			UPDATE_DEPTH_CAUSES!.delete(block);
			if (cause.chain === block.rare?.updateChain) error.message += ` ${cause.message}`;
		}
	}
	return error;
}

/** Spend one commit-callback update from the block's nested-update budget. */
function countNestedUpdate(block: Block, flushed: boolean | undefined): void {
	const rare = blockRare(block);
	if (rare.updateChain !== NESTED_UPDATE_CHAIN_ID) {
		rare.updateChain = NESTED_UPDATE_CHAIN_ID;
		rare.updateCount = 0;
	}
	if (++rare.updateCount > NESTED_UPDATE_LIMIT) {
		// Exhausted while passive effects wait to join the next render: hold
		// them so that render carries only this budget's updates. A passive
		// cascade re-measuring once per step settles, and its commit starts a
		// fresh chain. A real loop schedules again and throws below. Only an
		// outermost commit can settle the chain and release the hold, so work
		// driven from a passive effect (flushSync there) keeps the plain error.
		if (
			rare.updateCount === NESTED_UPDATE_LIMIT + 1 &&
			EFFECT_COMMIT_DEPTH <= 1 &&
			CURRENT_EFFECT_PHASE !== PASSIVE &&
			(effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0)
		) {
			HELD_PASSIVE_CHAIN = NESTED_UPDATE_CHAIN_ID;
		} else {
			HELD_PASSIVE_CHAIN = -1;
			rare.updateError = true;
			if (process.env.NODE_ENV !== 'production' && flushed) attributeSignalUpdateDepth(block);
		}
	}
}

function attributeSignalUpdateDepth(block: Block): void {
	const source = componentSourceLoc(block.body);
	(UPDATE_DEPTH_CAUSES ??= new WeakMap()).set(block, {
		cell: null,
		chain: block.rare?.updateChain ?? -1,
		message:
			`Signals read by ${componentName(block)}${source ? ` (${source})` : ''} changed every time ` +
			'its render was accepted. A component-local derived$ or query$ runs again on every render ' +
			'when it captures a value created during render, such as an inline object or function, and ' +
			'a result that never compares equal, such as a new object or error, notifies its readers ' +
			'again. Create the captured value outside the component or keep it stable across renders.',
	});
}

let CROSS_RENDER_WARNINGS: WeakMap<ComponentBody, WeakSet<ComponentBody>> | null = null;

export function componentName(block: Block): string {
	let body = block.body as ComponentBody & { displayName?: string };
	// A displayName assigned to the public wrapper is user-authored and wins
	// over the wrapped body's fallback name.
	if (body.displayName) return body.displayName;
	// The dev compiler installs an identity-stable HMR wrapper around exported
	// components. Diagnostics should name the authored body it delegates to, not
	// the generated `wrapper` implementation.
	const hmr = (body as any)[HMR] as HmrMeta | undefined;
	if (hmr !== undefined) body = hmr.fn as typeof body;
	return body.displayName || body.name || 'Unknown';
}

/** DEV-only: the body that each hookless child's scope renders (componentSlotLite). */
export const LITE_BODIES: WeakMap<Scope, ComponentBody> | null =
	process.env.NODE_ENV === 'production' ? null : /* @__PURE__ */ new WeakMap();

function warnCrossComponentRenderUpdate(target: Block, source: Block): void {
	if (process.env.NODE_ENV === 'production') return;
	// A hookless child renders in its parent's block, under its own scope.
	const lite =
		CURRENT_SCOPE !== null && CURRENT_SCOPE !== source
			? LITE_BODIES!.get(CURRENT_SCOPE)
			: undefined;
	const body = lite ?? source.body;
	const warnings = (CROSS_RENDER_WARNINGS ??= new WeakMap());
	let sources = warnings.get(target.body);
	if (sources === undefined) warnings.set(target.body, (sources = new WeakSet()));
	if (sources.has(body)) return;
	sources.add(body);
	console.error(
		`Cannot update a component (\`${componentName(target)}\`) while rendering a different component ` +
			`(\`${componentName(lite === undefined ? source : ({ body } as Block))}\`). ` +
			'Move the update out of the rendering component body.',
	);
}

/**
 * `flushed`: a signal notification delivered during a flush (see scheduleNativeRead).
 * `cue`: useTransition or useActionState raising isPending, or useOptimistic
 * showing a value. These renders are the transition's in-flight surface, which
 * React renders in an urgent lane: they keep the microtask flush and render at
 * urgent priority there (splitTransitionCue), so they commit before the
 * transition work they announce, over its committed state. That work keeps its
 * task even when it belongs to the cue's own block (upgradeTransitionBlock).
 * `background`: a native producer refresh shares task admission without
 * changing its existing render/Suspense priority.
 */
export function scheduleRender(
	block: Block,
	flushed?: boolean,
	cue?: boolean,
	background?: boolean,
): void {
	if (block.disposed) return;
	if (process.env.NODE_ENV !== 'production' && CURRENT_EFFECT_PHASE === INSERTION) {
		console.error(
			'useInsertionEffect must not schedule state updates. Move this work to a layout or passive effect.',
		);
	}
	// Test-env warning: a state update happened with no flushSync or act()
	// scope around it. The test will likely assert on stale DOM and fail
	// confusingly; surface the cause directly.
	if (
		process.env.NODE_ENV !== 'production' &&
		isActEnvironment() &&
		actScopeDepth === 0 &&
		!syncFlush
	) {
		// eslint-disable-next-line no-console
		console.error(
			`An update to ${componentName(block)} was not wrapped in act(...).\n\n` +
				'When testing, code that causes state updates should be wrapped into act(...):\n\n' +
				'  act(() => {\n' +
				'    /* fire events that update state */\n' +
				'  });\n' +
				'  /* assert on the output */\n\n' +
				"This ensures you're testing the behavior the user would see in the browser.",
		);
	}
	// Capture the caller's priority — setters inside startTransition() see
	// TRANSITION_DEPTH > 0 and tag the render as 'transition'. An urgent setter
	// arriving for a block already queued at 'transition' upgrades it.
	// A RENDER-PHASE self-update (setState while this block's own body is on the
	// stack — CURRENT_BLOCK is only non-null inside renderBlock) inherits the
	// in-progress render's priority AND deferred bit instead of defaulting to
	// urgent. React parity: render-phase updates render in the current pass's
	// lanes, so a transition render that syncs state from props replays at
	// transition priority (and useDeferredValue in the replay doesn't defer) —
	// per ReactDeferredValue-test.js:232.
	const renderPhaseSelf = CURRENT_BLOCK === block;
	// A deletion is discovered while reconciling the deleting parent's output, so
	// CURRENT_BLOCK still names that parent while the removed subtree's destroys and
	// cleanups run (the same reason Effect Events are permitted from them). Those
	// are mutation-phase callbacks — React runs them in commitDeletionEffects — so
	// an update they schedule for a surviving component is legal, not a render-phase
	// cross-component update.
	// A hookless child renders inside its parent's block (componentSlotLite), with
	// its own scope: a parent setter it calls is another component's update too.
	const renderPhaseOther =
		CURRENT_BLOCK !== null &&
		(!renderPhaseSelf || CURRENT_SCOPE !== block) &&
		TRANSITION_LISTENER_PUBLISH_DEPTH === 0 &&
		EFFECT_EVENT_LIFECYCLE_DEPTH === 0;
	if (renderPhaseOther) {
		block.crossRenderUpdate = true;
		warnCrossComponentRenderUpdate(block, CURRENT_BLOCK!);
	}
	const mode: 'urgent' | 'transition' =
		TRANSITION_DEPTH > 0 ||
		(renderPhaseSelf && block.currentRenderMode === 'transition') ||
		(!syncFlush &&
			_dispatchDepth === 0 &&
			ASYNC_TRANSITION_COUNT > 0 &&
			RENDERER_DISCRETE_EVENT_DEPTH === 0 &&
			!inCommitCallback())
			? 'transition'
			: 'urgent';
	const deferred = DEFERRED_SPAWN || (renderPhaseSelf && block.currentRenderDeferred);
	if (DEFERRED_LAYOUT_DRIVER) DEFERRED_LAYOUT_DRIVER.schedulePending(block);
	if (block.pending) {
		if (!background && TRANSITION_QUEUE.length !== 0)
			TRANSITION_TASK_DRIVER!.upgrade(block, mode, cue);
		if (mode === 'urgent') {
			block.pendingMode = 'urgent';
			block.pendingDeferred = false;
		}
		return;
	}
	if (CURRENT_EFFECT_PHASE === PASSIVE && (!syncFlush || inFlush)) {
		// Passive cascades yield between commits. Warn in development, but let a
		// finite chain converge; synchronous callbacks retain the hard loop guard.
		// A flushSync drain that runs pending passives before its render (inFlush)
		// does not make their updates synchronous, as in React. A flushSync that a
		// passive effect calls from a post-paint or act() drain still does: its
		// callback runs before inFlush is set.
		countPassiveUpdate(block);
	} else if (flushed || inNestedUpdateCallback()) {
		NESTED_UPDATE_SCHEDULED = true;
		countNestedUpdate(block, flushed);
	} else if (CURRENT_BLOCK === null) {
		// A user/root update starts a new chain. This prevents fifty unrelated
		// events, roots, or wide-batch members from sharing the recursion budget
		// while preserving the count across scheduler drains for callback-scheduled
		// work. Updates scheduled while rendering inherit the active chain: otherwise an
		// effect -> render-phase update -> effect cycle could reset its budget on
		// every pass. Pure render-phase loops retain the separate drain guard below.
		// The block's recorded chain predates the new id, so its next commit
		// callback update restarts the count; clear any pending error now. A Block
		// without the record already reads as a fresh chain.
		UPDATE_CHAIN_ID++;
		++NESTED_UPDATE_CHAIN_ID;
		if (block.rare !== null) {
			block.rare.updateCount = 0;
			block.rare.updateError = false;
		}
	}
	block.pending = true;
	block.pendingMode = mode;
	block.pendingDeferred = deferred;
	if (
		(background || mode === 'transition') &&
		TRANSITION_TASK_DRIVER &&
		TRANSITION_TASK_DRIVER.queue(block, cue)
	)
		return;
	QUEUE.push(block);
	if (syncFlush) return;
	if (!scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
}

/**
 * An urgent update moves a waiting block onto the microtask flush, transition
 * work included. A pending cue does not: outside a flush, the block renders its
 * cue in the microtask flush over its committed cells and keeps its transition
 * render for the task, in whichever order the two arrive (renderTransitionCue).
 * The cue therefore commits the previous transition state, as React renders
 * `isPending` in an urgent lane before the transition lane.
 */
export function upgradeTransitionBlock(
	block: Block,
	mode: 'urgent' | 'transition',
	cue?: boolean,
): void {
	// flushSync adopts the whole queue itself.
	if (syncFlush) return;
	if (mode === 'transition' && !inFlush && CURRENT_BLOCK === null && !TRANSITION_TASK_ACTIVE) {
		// Outside a flush a transition-priority block is queued in exactly one
		// place, or in both once its cue and its transition work are split.
		const waiting = TRANSITION_QUEUE.indexOf(block) !== -1;
		if (cue) {
			if (!waiting || QUEUE.indexOf(block) !== -1) return;
			QUEUE.push(block);
			if (!scheduled) {
				scheduled = true;
				queueMicrotask(flush);
			}
		} else if (!waiting && block.pendingMode === 'transition') {
			// A block queued for an urgent update renders this work with it, as it
			// would after the work started waiting.
			TRANSITION_QUEUE.push(block);
			scheduleTransitionTask();
		}
		return;
	}
	if (mode !== 'urgent' && !cue) return;
	const index = TRANSITION_QUEUE.indexOf(block);
	if (index === -1) return;
	TRANSITION_QUEUE.splice(index, 1);
	QUEUE.push(block);
	if (!scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
	// Nothing is left for the task: retire it. Waiting completions keep a task.
	if (TRANSITION_QUEUE.length === 0) adoptTransitionQueue();
}

export function scheduleTransitionTask(): void {
	if (transitionTask !== 0) return;
	const id = (transitionTask = ++transitionTaskIds);
	postHostTask(() => {
		if (transitionTask !== id) return;
		TRANSITION_TASK_ACTIVE = true;
		try {
			if (WOKEN_TRANSITION_HOLDERS || RETRIED_TRANSITION_BATCHES) retryWokenTransitions();
			adoptTransitionQueue(true);
			flush();
		} finally {
			TRANSITION_TASK_ACTIVE = false;
		}
	});
}

/**
 * Move waiting transition renders onto the flush about to run. A flush that
 * drains them (`drain`: the task, flushSync, act(), and the discrete-event and
 * view-transition flushes) also arms their completions. An urgent flush that
 * only takes them over leaves those completions a task of their own, as React
 * keeps `setPending(false)` in the transition lane.
 */
export function adoptTransitionQueue(drain?: boolean): void {
	transitionTask = 0;
	for (let i = 0; i < TRANSITION_QUEUE.length; i++) QUEUE.push(TRANSITION_QUEUE[i]);
	TRANSITION_QUEUE.length = 0;
	// Rendered-cue marks only matter while their blocks wait; release the blocks.
	RENDERED_CUES.length = 0;
	if (TRANSITION_FALLS.length !== 0) {
		if (drain === true) TRANSITION_ROOT_DRIVER!.armFalls();
		else scheduleTransitionTask();
	}
	// Woken holds retry in a task of their own, after this drain's commit.
	if (WOKEN_TRANSITION_HOLDERS || RETRIED_TRANSITION_BATCHES) scheduleTransitionTask();
}

/**
 * Settle the armed completions once the drain's renders have decided their
 * holds (drainQueue), returning whether that queued more renders. A hook whose
 * block rendered nothing in the drain publishes its falling edge here, and that
 * render joins the same commit (renderTransitionFall). A root that suspended
 * discards the drain's renders in it, including a falling edge already shown
 * and any this would queue, so such a completion waits for the next task.
 */
export function settleTransitionFalls(): boolean {
	const armed = ARMED_TRANSITION_FALLS;
	if (armed.length === 0) return false;
	const from = QUEUE.length;
	for (let i = 0; i < armed.length; i += 2) {
		const batch = armed[i] as TransitionActionBatch;
		const submit = armed[i + 1] as SubmitDispatchRec | null | undefined;
		if (batch.falling) {
			if (discardsTransitionFall(batch)) {
				cancelTransitionFall(batch);
				TRANSITION_FALLS.push(batch, submit);
				scheduleTransitionTask();
				continue;
			}
			batch.falling = false;
		}
		if (submit !== undefined) {
			tickTransitionCount(-1);
			if (submit !== null) settleSubmitTransition(submit);
			flushFormResets();
		}
		batch.workComplete = true;
		// The falling edge is transition work: if its render suspends, it holds.
		TRANSITION_DEPTH++;
		finishTransitionHookBatch(batch);
		TRANSITION_DEPTH--;
	}
	armed.length = 0;
	TRANSITION_FALL_DRAIN = DRAIN_ID;
	TRANSITION_FALL_FROM = from;
	return QUEUE.length !== from;
}

/** Whether a suspended root discarded this drain's renders of a hook of the batch. */
function discardsTransitionFall(batch: TransitionActionBatch): boolean {
	return (
		batch.hook!.block.idState.renderOwner?.transaction?.aborted === true ||
		batch.hooks?.some((hook) => hook.block.idState.renderOwner?.transaction?.aborted === true) ===
			true
	);
}

// Monotonic id per drainQueue pass, paired with Block.drainStamp/drainRenders
// for the render-phase-update loop guard. 25 matches React's cap.
export let DRAIN_ID = 0;
export const RENDER_PHASE_UPDATE_LIMIT = 25;
export const RENDERED_CUES: Block[] = [];

function belongsToBlockTree(block: Block, root: Block): boolean {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current === root) return true;
	}
	return false;
}

/**
 * Hydration is one synchronous commit. A render-phase state update must therefore
 * replay before adoption finishes; otherwise the first attempt compares its
 * throwaway value against converged server HTML and publishes a false mismatch.
 * Drain only this root's queued descendants, leaving pre-existing work for other
 * roots in the ordinary scheduler queue.
 *
 * Under `holdCrossRenderUpdates` (hydration), an update that a render
 * scheduled for another component (crossRenderUpdate) stays queued too. The
 * server ignores such an update, so its HTML shows the state before it, as
 * React's does, and React applies it only after the hydration it interrupted
 * commits: replaying it here would hydrate the updated output against server
 * DOM that never rendered it.
 */
export function drainHydrationRenderPhaseUpdates(
	root: Block,
	holdCrossRenderUpdates = false,
): void {
	let renders: Map<Block, number> | null = null;
	let read = 0;
	let write = 0;
	let reindexEpoch = QUEUE_REINDEX_EPOCH;
	try {
		// Partition in place while reading the live length: target renders can
		// append more target (or foreign) work, which belongs to this same pass.
		while (read < QUEUE.length) {
			const block = QUEUE[read++];
			if (!belongsToBlockTree(block, root) || (holdCrossRenderUpdates && block.crossRenderUpdate)) {
				QUEUE[write++] = block;
				continue;
			}
			if ((!block.pending && !block.rare?.updateError) || block.disposed) continue;
			try {
				if (block.rare?.updateError) {
					block.rare.updateError = false;
					throw maximumUpdateDepthError(block);
				}

				const seen = (renders ??= new Map()).get(block) ?? 0;
				const crossRenderUpdate = block.crossRenderUpdate;
				if (seen >= (crossRenderUpdate ? NESTED_UPDATE_LIMIT : RENDER_PHASE_UPDATE_LIMIT)) {
					throw crossRenderUpdate ? maximumUpdateDepthError() : new Error(formatClientError(9));
				}
				renders.set(block, seen + 1);
				block.crossRenderUpdate = false;
				renderBlock(block);
			} catch (error) {
				handleRenderError(block, error);
			}
			// User render code can synchronously enter another hydration or flushSync.
			// Its dense queue layout supersedes every cursor from this traversal.
			if (reindexEpoch !== QUEUE_REINDEX_EPOCH) {
				reindexEpoch = QUEUE_REINDEX_EPOCH;
				read = 0;
				write = 0;
			}
		}
	} finally {
		if (reindexEpoch === QUEUE_REINDEX_EPOCH) {
			// If rendering aborts, keep the unread suffix after the foreign entries
			// already retained. Both groups preserve their original relative order.
			while (read < QUEUE.length) {
				QUEUE[write++] = QUEUE[read++];
			}
			QUEUE.length = write;
			QUEUE_REINDEX_EPOCH++;
		}
	}
}

// Sort a render wave shallow-first so an ancestor can consume or remove queued
// descendants before their standalone updates. No user code runs during this
// sort. Negative drain stamps temporarily reuse the loop-guard fields for depth;
// the positive drain id resets them to a render count before executing a block.
// Cache every real ancestor for this wave, including unqueued intermediates.
// Two walks over each unknown path avoid allocating a path stack or collections.
function sortWaveByDepth(wave: Block[], drainId: number): Block[] {
	const stamp = -drainId;
	for (let i = 0; i < wave.length; i++) {
		const start = wave[i];
		if (start.drainStamp === stamp) continue;
		let current: Block | null = start;
		let depth = 0;
		while (current !== null && current.drainStamp !== stamp) {
			depth++;
			current = current.parentBlock;
		}
		depth += current === null ? -1 : current.drainRenders;
		current = start;
		while (current !== null && current.drainStamp !== stamp) {
			// Lite ancestry proxies intentionally have no scheduler fields.
			if (current.drainStamp !== undefined) {
				current.drainStamp = stamp;
				current.drainRenders = depth;
			}
			depth--;
			current = current.parentBlock;
		}
	}
	wave.sort(compareWaveDepth);
	return wave;
}

function compareWaveDepth(a: Block, b: Block): number {
	return a.drainRenders - b.drainRenders;
}

// Visibility-owner scheduling is optional: roots without Suspense or hidden
// Activity must not retain either feature's concrete reveal implementation.
export interface ScheduledVisibilityDriver {
	find: typeof findScheduledVisibilityOwner;
	holdsNativeRead: typeof holdsNativeRead;
	reveal: typeof attemptHiddenReveal;
	hidePending: typeof hideTryContentAndMountPending;
	visible: typeof renderVisibleTry;
	// A hidden Activity's re-hide and re-render, set by activityBlock
	// (ensureActivityVisibilityDriver) before it hides one. A Suspense boundary
	// reaches them only through a hidden Activity it found, so roots that never
	// render <Activity> do not retain them.
	rehide: typeof rehideActivityAfterDescendantRender | null;
	retryActivity: typeof renderHiddenActivity | null;
}

/** activityBlock only: it is the one place an Activity becomes hidden. */
export function ensureActivityVisibilityDriver(): void {
	ensureScheduledVisibilityDriver();
	const driver = SCHEDULED_VISIBILITY_DRIVER!;
	driver.rehide = rehideActivityAfterDescendantRender;
	driver.retryActivity = renderHiddenActivity;
}

export function holdsNativeRead(block: Block): boolean {
	for (const state of HELD_TRANSITIONS) {
		const primary = state.tryBlock;
		if (
			state.transitionHeld &&
			state.hiddenDom === null &&
			primary !== null &&
			(primary === block || blockIsAncestorOf(primary, block) || blockIsAncestorOf(block, primary))
		)
			return true;
	}
	return false;
}

// Drain QUEUE. Order ancestors before descendants so a parent's cascade coalesces
// queued descendants regardless of the order their setStates ran. The flush is
// synchronous, so we sort and drain the LIVE array in place — no per-flush snapshot
// allocation, no O(n) shift re-indexing. The sort runs only on batches (>1 block),
// so the common single-update flush reorders nothing and pays no depth-walk.
// Returns the unhandled render error(s) to surface after commit — multiple
// failed roots in one flush aggregate like React (AggregateError).
function drainQueue(): { err: any } | null {
	let pendingError: { err: any; all: any[] } | null = null;
	let activitiesToRehide: Set<ActivitySlot> | null = null;
	const drainId = ++DRAIN_ID;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileDrain(drainId);
	if (QUEUE.length > 1) sortWaveByDepth(QUEUE, drainId);
	// Iterate by index. A render may enqueue MORE work (e.g. a setState during
	// render) — it appends to QUEUE, and `i < QUEUE.length` is re-evaluated every
	// step, so those are drained in this same pass. The loop only exits once i has
	// reached the (possibly grown) end, so the truncation below clears only
	// fully-processed blocks. Re-entrant additions render in append order rather
	// than re-sorted, which at worst costs a redundant render in a rare case.
	// Transition completions settle at the end, once this pass has decided their
	// holds, and the renders they schedule join it (settleTransitionFalls).
	for (
		let i = 0;
		i < QUEUE.length || (TRANSITION_ROOT_DRIVER && TRANSITION_ROOT_DRIVER.settleFalls());
		i++
	) {
		const block = QUEUE[i];
		// Skip if an ancestor's cascade already re-rendered this block this flush
		// (renderBlock cleared its `pending`) — avoids a redundant standalone render.
		// A max-depth flag is not redundant work, however: it must still surface
		// after an ancestor coalesces the flagged child's pending render.
		if (!block.pending && !block.rare?.updateError) continue;
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileFlushPriority(
				block.pendingDeferred ? 2 : block.pendingMode === 'transition' ? 1 : 0,
			);
		block.pending = false;
		if (block.disposed) {
			if (block.rare !== null) block.rare.updateError = false;
			continue;
		}
		// Every queued origin in this root belongs to the same commit attempt.
		// Once one suspends, later siblings must not publish a partial screen.
		const rootTransaction = block.idState.renderOwner?.transaction;
		if (rootTransaction?.aborted === true) continue;
		const retired = rootTransaction?.retired;
		if (retired !== null && retired !== undefined && retired.size !== 0) {
			// Retained DOM is still connected for rollback and deletion cleanups,
			// but queued descendants of a retired subtree must not render. Only
			// roots with an actual deferred deletion pay this ancestor walk.
			let current: Block | null = block;
			while (current !== null && !retired.has(current)) current = current.parentBlock;
			if (current !== null) continue;
		}
		const crossRenderUpdate = block.crossRenderUpdate;
		block.crossRenderUpdate = false;
		// A pending cue whose transition work waits for the task renders alone.
		const render =
			(TRANSITION_ROOT_DRIVER ? TRANSITION_ROOT_DRIVER.splitCue(block, i) : undefined) ??
			renderBlock;
		const visibilityOwner = SCHEDULED_VISIBILITY_DRIVER
			? SCHEDULED_VISIBILITY_DRIVER.find(block, true, block.pendingMode ?? 'urgent')
			: null;
		let hiddenActivity: ActivitySlot | null = null;
		let hiddenTry: TrySlot | null = null;
		let visibleTry: TrySlot | null = null;
		if (visibilityOwner !== null) {
			if (visibilityOwner.__kind === 'trySlotSlot') {
				if (visibilityOwner.hiddenDom === null) visibleTry = visibilityOwner;
				else hiddenTry = visibilityOwner;
			} else hiddenActivity = visibilityOwner;
		}
		const rootFrame = beginRootRender(block.idState.renderOwner);
		// The root an error no boundary handled tears down, once its frame closes.
		let uncaughtRoot: Block | null = null;
		let uncaught: unknown;
		try {
			// A first render scheduled by startTransition runs after makeRoot's
			// construction window. Its hooks and partial DOM still belong to this
			// uncommitted attempt, and must be discarded if it suspends.
			if (block.kind === 'root' && !block.mounted) {
				createdInRootRender(block);
				frontierRootMount(block);
			}
			if (block.rare?.updateError) {
				block.rare.updateError = false;
				throw maximumUpdateDepthError(block);
			}
			// Guarded render-phase updates (derived state) converge in a couple of
			// passes; an unguarded one re-queues its own block forever. Cap per-block
			// renders within one drain so the loop throws (catchable by @try /
			// ErrorBoundary, like React's equivalent) instead of hanging. A hidden
			// boundary retry must obey the same limit as an ordinary render.
			if (block.drainStamp === drainId) {
				if (
					++block.drainRenders >
					(crossRenderUpdate ? NESTED_UPDATE_LIMIT : RENDER_PHASE_UPDATE_LIMIT)
				) {
					throw crossRenderUpdate ? maximumUpdateDepthError() : new Error(formatClientError(9));
				}
			} else {
				block.drainStamp = drainId;
				block.drainRenders = 1;
			}
			// An update to a block inside a SUSPENSE-HIDDEN subtree (its boundary's
			// committed host content is hidden while the fallback shows) must retry
			// the WHOLE boundary. The hidden render and fallback/reveal decision stay
			// one transaction. React parity: setState on a suspended component
			// retries the render; if it no longer suspends (an external store flipped
			// before the suspending promise resolved), the boundary reveals now.
			if (hiddenTry !== null) {
				SCHEDULED_VISIBILITY_DRIVER!.reveal(hiddenTry, block.pendingMode ?? 'urgent');
				continue;
			}
			if (hiddenActivity !== null && hiddenActivity.pendingThenable !== null) {
				SCHEDULED_VISIBILITY_DRIVER!.retryActivity!(hiddenActivity, true);
				continue;
			}
			// A hold drops the transaction for the batches this origin folds.
			if (TRANSITION_ROOT_DRIVER) TRANSITION_ORIGIN = block;
			if (hiddenActivity !== null)
				SCHEDULED_VISIBILITY_DRIVER!.retryActivity!(hiddenActivity, false, block);
			else if (visibleTry !== null) SCHEDULED_VISIBILITY_DRIVER!.visible(visibleTry, block);
			else {
				const owner = block.idState.renderOwner;
				if (owner !== undefined && owner.current === block && owner.request !== null) {
					const request = owner.request;
					owner.request = null;
					const mode = block.pendingMode ?? 'urgent';
					block.pendingMode = null;
					request(mode);
				} else render(block);
			}
		} catch (err) {
			try {
				handleRenderError(block, err);
			} catch (unhandled) {
				const transaction = block.idState.renderOwner?.transaction;
				if (transaction != null) {
					rollbackRootRender(transaction);
					transaction.holders = null;
				}
				// No tryBlock claimed this error. Don't let it abandon the rest of
				// the queue or skip commit — that would strand unrelated roots
				// batched into the same flush and drop their already-rendered
				// effects. A root created with onUncaughtError consumes its own
				// report; otherwise collect them all — a multi-root flush with
				// several unhandled errors surfaces an AggregateError (React
				// parity), a single one rethrows as-is.
				const reported =
					hydrationStarted &&
					HYDRATION_DRIVER!.isPresentationMiss(unhandled) &&
					Object.prototype.hasOwnProperty.call(unhandled, 'failure')
						? unhandled.failure
						: unhandled;
				if (!reportUncaughtError(block, reported)) {
					if (pendingError === null) pendingError = { err: reported, all: [reported] };
					else {
						pendingError.all.push(reported);
						pendingError.err =
							typeof AggregateError === 'function'
								? new AggregateError(pendingError.all, formatClientError(13))
								: pendingError.all[0];
					}
				}
				// React 19 contract: an error no boundary handles unmounts the
				// ENTIRE tree of the failed root — known-broken UI never stays on
				// screen (ReactIncrementalErrorHandling:1338/:712). Only the
				// offending root is torn down; unrelated roots keep draining.
				// onUncaughtError replaces the report, not the recovery.
				let root: Block = block;
				while (root.parentBlock !== null) root = root.parentBlock;
				if (root.kind === 'root' && !root.disposed) {
					uncaughtRoot = root;
					uncaught = unhandled;
				}
			}
		} finally {
			// A transition render that suspended into a hold drops its transaction
			// before the drain settles its completions (dropTransitionRender).
			const transaction = ROOT_RENDER_TRANSACTION;
			if (TRANSITION_ROOT_DRIVER && transaction !== null && transaction.holders !== null)
				TRANSITION_ROOT_DRIVER.drop(transaction);
			TRANSITION_ORIGIN = null;
			endRootRender(rootFrame);
			// The failed attempt writes nothing while its frame is open: the
			// teardown of its committed tree runs after it closes.
			if (uncaughtRoot !== null && !uncaughtRoot.disposed) {
				if (
					hydrationStarted &&
					HYDRATION_DRIVER!.isPresentationMiss(uncaught) &&
					uncaughtRoot.idState.renderOwner !== undefined
				) {
					uncaughtRoot.idState.renderOwner.preservePresentation = true;
					DOM_ROOT_DISPOSERS.get(uncaughtRoot)?.();
				} else unmountBlock(uncaughtRoot);
			}
			// A descendant render can replace an Activity's direct host root. The
			// Activity itself did not render, so reapply its visual hide after the
			// complete attempt (including a captured error or Suspense retry).
			if (hiddenActivity !== null) (activitiesToRehide ??= new Set()).add(hiddenActivity);
		}
	}
	QUEUE.length = 0;
	QUEUE_REINDEX_EPOCH++;
	if (HOLDING_ROOT_COMMITS) {
		// The held commit re-scans these once it lands (commitHeldRootRenders).
		if (activitiesToRehide !== null)
			for (const activity of activitiesToRehide) (HELD_REHIDES ??= new Set()).add(activity);
		if (renderSlice) landRenderSliceWrites(renderSlice);
	} else {
		commitRootRenders();
		// Several sibling setters can share one hidden range. Re-scan it once after
		// the wave's commit inserted its content, before refs or layout effects can
		// observe it. No Activity update means no collection on the ordinary path.
		if (activitiesToRehide !== null) {
			for (const activity of activitiesToRehide) SCHEDULED_VISIBILITY_DRIVER!.rehide!(activity);
		}
		// Batches that finished during that commit.
		if (PENDING_SIGNAL_PROMOTIONS !== null) promotePendingSignals();
	}
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileDrainEnd();
	return pendingError;
}

export function flush(): void {
	scheduled = false;
	// Re-entrancy backstop (see `inFlush`): a flush landing inside an active
	// flush re-arms the scheduler instead of draining over the outer walk.
	if (inFlush) {
		if ((QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) && !scheduled) {
			scheduled = true;
			queueMicrotask(flush);
		}
		return;
	}
	// A discrete event can synchronously drain work after its microtask was
	// armed. An empty render queue alone is not enough: first mounts/hydration
	// still need their commit, and refs/Fragment bindings are intentionally not
	// included in hasPendingWork(). Retained Actions and ViewTransition also
	// carry flush-finalization work outside those queues. Transition renders
	// waiting for their task are not this flush's work.
	if (
		!hasScheduledWork() &&
		refDetachQueue.length === 0 &&
		refAttachQueue.length === 0 &&
		activeFragments.size === 0 &&
		FLUSHED_TRANSITION_BATCHES.length === 0 &&
		!VIEW_TRANSITION_DRIVER
	) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__devtoolsNotifyFlush();
		return;
	}
	// The optional driver owns all concrete ViewTransition state/implementation.
	// A client that never retains the feature sees only this null check.
	try {
		if (VIEW_TRANSITION_DRIVER && VIEW_TRANSITION_DRIVER.routeFlush()) return;
		flushWork();
	} catch (error) {
		// Promise-driven renders can run before act's task checkpoint. Preserve
		// their errors for the awaited act result instead of reporting an uncaught
		// microtask error while resolving the test helper successfully.
		if (actScopeDepth === 0) throw error;
		(actErrors ??= []).push(error);
	}
}

// The scheduler already captures document focus once per render pass. Reuse
// that snapshot while moving keyed nodes so ordinary unfocused reconciliation
// never performs an extra activeElement read.
export let renderingFocus: FocusSelectionBatch = null;
export let renderingFocusMoves: Array<{
	snapshot: FocusSelectionSnapshot;
	ancestors: Array<{ element: HTMLElement; left: number; top: number }>;
}> | null = null;

function drainQueueWithFocus(snapshots: FocusSelectionBatch): { err: any } | null {
	if (snapshots === null && renderingFocus === null) return drainQueue();
	const previous = renderingFocus;
	const previousMoves = renderingFocusMoves;
	renderingFocus = snapshots;
	renderingFocusMoves = null;
	try {
		return drainQueue();
	} finally {
		try {
			restoreFocusedMovements();
		} finally {
			renderingFocusMoves = previousMoves;
			renderingFocus = previous;
		}
	}
}

export function captureFocusedMovement(
	parent: Node,
	snapshots: Exclude<FocusSelectionBatch, null>,
): void {
	let snapshot: FocusSelectionSnapshot | null = null;
	if (Array.isArray(snapshots)) {
		for (let i = 0; i < snapshots.length; i++) {
			if (snapshots[i].focused.ownerDocument === parent.ownerDocument) {
				snapshot = snapshots[i];
				break;
			}
		}
	} else if (snapshots.focused.ownerDocument === parent.ownerDocument) {
		snapshot = snapshots;
	}
	if (snapshot === null || !parent.contains(snapshot.focused)) return;
	if (renderingFocusMoves !== null) {
		for (let i = 0; i < renderingFocusMoves.length; i++) {
			if (renderingFocusMoves[i].snapshot === snapshot) return;
		}
	}
	const ancestors: Array<{ element: HTMLElement; left: number; top: number }> = [];
	for (
		let ancestor = snapshot.focused.parentElement;
		ancestor !== null;
		ancestor = ancestor.parentElement
	) {
		ancestors.push({
			element: ancestor,
			left: ancestor.scrollLeft,
			top: ancestor.scrollTop,
		});
	}
	(renderingFocusMoves ??= []).push({ snapshot, ancestors });
}

function drainLayoutUpdates(pendingError: { err: any } | null): { err: any } | null {
	for (
		let guard = 0;
		(QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) && guard < LAYOUT_CASCADE_LIMIT;
		guard++
	) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.CASCADE_LAYOUT);
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.CASCADE_LAYOUT_DEPTH, guard + 1);
		// Layout-driven updates belong to the same commit, including when the
		// scheduler started it. Publish their final DOM before observer delivery.
		drainPassivesBeforeRender();
		const focused = QUEUE.length === 0 ? null : captureQueuedFocusSelection();
		const error = drainQueueWithFocus(focused);
		if (focused !== null) restoreQueuedFocusSelection(focused);
		if (error !== null && pendingError === null) pendingError = error;
		commitEffects();
	}
	return pendingError;
}

function rethrowAfterControlledRestore(error: unknown): never {
	try {
		if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.restore();
	} finally {
		// A restoration failure must not replace the render/commit failure.
		throw error;
	}
}

/**
 * The flush body proper — render+mutate drain plus the effect commit. Shared
 * verbatim by the plain flush() path and the view-transition update callback
 * (vtFlush), so both drain with identical semantics.
 */
function flushWork(): void {
	try {
		inFlush = true;
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileFlush();
		// Batches flushed so far belong to the drain below, unless their renders
		// still wait for the transition task (FLUSHED_TRANSITION_BATCHES).
		const flushedTransitions = FLUSHED_TRANSITION_BATCHES.length > 0;
		// addTransitionType types belong to the transition batch this drain commits:
		// an UNWRAPPED drain (no boundary, no startViewTransition, flushSync) that
		// contains transition work consumes them too — they must not leak into a
		// later, unrelated wrapped flush. (vtFlush captures them before its update
		// callback runs flushWork, so the wrapped path never reaches this.)
		const clearViewTransitionTypes =
			!!VIEW_TRANSITION_DRIVER && VIEW_TRANSITION_DRIVER.shouldClearTypesAfterFlush();
		try {
			// React parity: pending PASSIVE effects from an earlier commit flush BEFORE the next
			// render begins (React's flushPassiveEffects-at-render-start). Without this, a
			// cascade that mounts new children (e.g. a layout-effect-driven Presence reveal)
			// merges the earlier commit's passive effects (e.g. an event dispatch) into the same
			// drain as the new children's listener-attach effects — re-ordering them child-first
			// and letting a child observe an event announcing its own mount.
			if (QUEUE.length > 0) drainPassivesBeforeRender();
			const focused = QUEUE.length === 0 ? null : captureQueuedFocusSelection();
			let pendingError = drainQueueWithFocus(focused);
			if (focused !== null) restoreQueuedFocusSelection(focused);
			commitEffects();
			if (
				!HOLDING_ROOT_COMMITS &&
				(!DEFERRED_LAYOUT_DRIVER || !DEFERRED_LAYOUT_DRIVER.capturing()) &&
				(QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0)
			)
				pendingError = drainLayoutUpdates(pendingError);
			if (pendingError !== null) throw pendingError.err;
		} finally {
			inFlush = false;
			if (
				(flushedTransitions || FLUSHED_TRANSITION_BATCHES.length > 0) &&
				TRANSITION_QUEUE.length === 0
			)
				clearFlushedTransitions();
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__devtoolsNotifyFlush();
			if (clearViewTransitionTypes) VIEW_TRANSITION_DRIVER!.clearTypes();
		}
	} catch (error) {
		rethrowAfterControlledRestore(error);
	}
	if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.restore();
}

/** Activities a held drain re-hides once its commit lands (drainQueue). */
let HELD_REHIDES: Set<ActivitySlot> | null = null;

/**
 * Release what a ViewTransition's drain held, for its native update: a root
 * unmounted or replaced while the commit waited drops its render. A render
 * the update's own callbacks start joins what stays.
 */
function releaseHeldRootRenders(held: RootRenderTransaction[]): RootRenderTransaction[] {
	const live: RootRenderTransaction[] = [];
	for (const transaction of held) {
		transaction.held = false;
		const owner = transaction.owner;
		if (owner.disposed || owner.generation !== transaction.heldGeneration) {
			if (!transaction.aborted) {
				rollbackRootRender(transaction);
				if (owner.transaction === transaction) owner.transaction = null;
			}
			continue;
		}
		// An early presentation that changed while the commit waited prepares
		// again before the update's own callbacks can join its render.
		if (
			hydrationStarted &&
			transaction.capture.presentations !== undefined &&
			(!HYDRATION_DRIVER!.currentPresentations(transaction.capture) ||
				(NATIVE_READ_DRIVER && !NATIVE_READ_DRIVER.validateCapture(transaction.capture)))
		) {
			rollbackRootRender(transaction);
			if (owner.transaction === transaction) owner.transaction = null;
			owner.generation++;
			HYDRATION_DRIVER!.retryPresentations(transaction.capture);
			// Rollback restored the preceding root props as well as child scopes.
			// Reapply this still-current public request, including its gate.
			if (transaction.rootRequest) owner.retry();
			continue;
		}
		live.push(transaction);
	}
	return live;
}

/**
 * Commit what a ViewTransition's drain held, inside its native update. Its
 * layout phase waits in `layout` (completeDeferredLayouts).
 */
function commitHeldRootRenders(held: RootRenderTransaction[], layout: DeferredLayoutCapture): void {
	const later = ROOT_RENDER_TRANSACTIONS;
	ROOT_RENDER_TRANSACTIONS = held;
	const focus = held.length === 0 ? null : captureHeldFocusSelection(held);
	const previous = renderingFocus;
	const previousMoves = renderingFocusMoves;
	renderingFocus = focus;
	renderingFocusMoves = null;
	try {
		commitRootRenders();
	} finally {
		try {
			restoreFocusedMovements();
		} finally {
			renderingFocusMoves = previousMoves;
			renderingFocus = previous;
			ROOT_RENDER_TRANSACTIONS = later.concat(ROOT_RENDER_TRANSACTIONS);
		}
	}
	if (focus !== null) restoreQueuedFocusSelection(focus);
	const rehides = HELD_REHIDES;
	HELD_REHIDES = null;
	if (rehides !== null)
		for (const activity of rehides) SCHEDULED_VISIBILITY_DRIVER!.rehide!(activity);
	if (PENDING_SIGNAL_PROMOTIONS !== null) promotePendingSignals();
	// A custom-element callback may synchronously replace a root during the
	// mutation phase. Accept that root's work before resource readiness.
	acceptDeferredRootTransactions(layout);
}

function captureHeldFocusSelection(held: RootRenderTransaction[]): FocusSelectionBatch {
	let snapshots: FocusSelectionBatch = null;
	const documents: Document[] = [];
	for (const transaction of held) {
		const doc = transaction.owner.current?.parentNode.ownerDocument;
		if (doc == null || documents.includes(doc)) continue;
		documents.push(doc);
		const snapshot = captureFocusSelection(doc);
		if (snapshot === null) continue;
		if (snapshots === null) snapshots = snapshot;
		else if (Array.isArray(snapshots)) snapshots.push(snapshot);
		else snapshots = [snapshots, snapshot];
	}
	return snapshots;
}

/** One logical batch publishes once, even when several native scopes capture it. */
function vtFlush(
	work: () => void = flushWork,
	queuedOwners?: Set<VTOwner> | null,
	queuedBlocks?: readonly Block[],
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.VIEW_TRANSITION_FLUSH);
	// Both callers settle prior passives before choosing priority and owners.
	// Do not drain again after an explicit resume batch has been snapshotted.
	// `vtQueuedOwners` returns null for an unknown owner, so only an omitted
	// argument takes the default.
	if (queuedOwners === undefined) queuedOwners = vtQueuedOwners();
	if (queuedBlocks === undefined) queuedBlocks = QUEUE.slice();
	const parent = QUEUE[0]?.parentNode;
	const defaultOwner = (
		parent?.nodeType === 9 ? parent : (parent?.ownerDocument ?? document)
	) as VTOwner;
	const types = VT_PENDING_TYPES;
	VT_PENDING_TYPES = [];
	const groups = new Map<VTOwner, VtGroup>();
	// A portal may first reveal its destination during preparation. Retain old
	// metadata, but defer layout/CSS reads for owners outside the queued batch.
	let unmeasured: Map<
		VTOwner,
		Array<{ block: Block; props: ViewTransitionProps | null; els: Element[]; name: string | null }>
	> | null = null;
	let discoveredOwners: Set<VTOwner> | null = null;
	let hasScopedBoundary = false;
	const getGroup = (owner: VTOwner): VtGroup => {
		let group = groups.get(owner);
		if (group !== undefined) return group;
		group = {
			owner,
			recs: [],
			records: new Map(),
			styles: new Map(),
			visibleBefore: new Set(),
			planned: new Map(),
			acts: [],
			animations: [],
			cleanups: [],
			warnedNames: new Set(),
			handle: null,
			session: null,
			arrived: false,
			settled: false,
			interrupted: false,
			skipRequested: false,
			restoreRoot: null,
			// A newly mounted/replaced scope has no old root to snapshot. Never
			// promote its contents to a document animation as a fallback.
			valid:
				typeof owner.startViewTransition === 'function' &&
				(owner.nodeType === 9 ||
					(owner.isConnected && (owner as Element).getAttribute('vt-scope') === 'element')),
		};
		groups.set(owner, group);
		return group;
	};
	for (const block of VT_REGISTRY) {
		if (block.disposed) {
			VT_REGISTRY.delete(block);
			continue;
		}
		if (vtProps(block)?.scope === 'element') hasScopedBoundary = true;
		const owner = vtScopeForBlock(block);
		if (owner === null) continue;
		if (queuedOwners !== null && !queuedOwners.has(owner)) {
			if (typeof owner.startViewTransition !== 'function') continue;
			const els = vtCaptureElements(block, owner);
			if (els.length === 0) continue;
			const props = vtProps(block);
			const name =
				props?.name != null && props.name !== 'auto'
					? props.name
					: props?.scope === 'element'
						? null
						: vtGetName(block, props);
			const before = (unmeasured ??= new Map()).get(owner);
			const record = { block, props, els, name };
			if (before === undefined) unmeasured.set(owner, [record]);
			else before.push(record);
			continue;
		}
		const group = getGroup(owner);
		if (!group.valid) continue;
		const els = vtCaptureElements(block, owner);
		if (els.length === 0) continue;
		group.visibleBefore.add(block);
		const rec = vtCreateRecord(block, els, group.styles);
		group.recs.push(rec);
		group.records.set(block, rec);
	}
	VT_DIRTY.clear();
	let interrupted = false;
	let workDone = false;
	let updateDone = false;
	let drainError: { error: unknown } | null = null;
	const rethrowDrainError = (): void => {
		if (drainError !== null) throw drainError.error;
	};
	let layoutCapture: DeferredLayoutCapture | null = null;
	let passivesReleased = false;
	let cancelWait: (() => void) | null = null;
	let resolveUpdate!: () => void;
	let rejectUpdate!: (error: unknown) => void;
	const updateResult = new Promise<void>((resolve, reject) => {
		resolveUpdate = resolve;
		rejectUpdate = reject;
	});
	// A native start may throw before returning a consumer of this promise.
	updateResult.catch(() => {});
	const capture = vtBeginCapture(interrupt);
	// The batch renders now and commits in the native update. Until then its
	// root transactions are held, so the old capture reads the DOM as it was.
	let held: RootRenderTransaction[] = [];
	// An interruption the drain itself causes waits for the drain's end.
	let draining = true;
	let interruptRequested = false;
	HOLDING_ROOT_COMMITS = true;
	VT_DRAIN = true;
	try {
		work();
	} catch (error) {
		drainError = { error };
	} finally {
		HOLDING_ROOT_COMMITS = false;
		held = ROOT_RENDER_TRANSACTIONS;
		ROOT_RENDER_TRANSACTIONS = [];
		for (const transaction of held) {
			transaction.held = true;
			transaction.heldGeneration = transaction.owner.generation;
		}
		try {
			// Plan against the DOM the held commit will leave.
			const preview = vtPreview(held);
			for (const block of VT_REGISTRY) {
				if (block.disposed) continue;
				if (vtProps(block)?.scope === 'element') hasScopedBoundary = true;
				const owner = vtScopeForBlock(block);
				if (
					owner === null ||
					(queuedOwners !== null &&
						!queuedOwners.has(owner) &&
						!queuedBlocks.some((source) => blockIsAncestorOf(source, block)))
				)
					continue;
				if (vtPendingCaptureElements(block, owner, preview).length > 0)
					getGroup(owner).planned.set(block, vtProps(block));
			}
			if (unmeasured !== null)
				for (const owner of groups.keys())
					if (unmeasured.has(owner)) (discoveredOwners ??= new Set()).add(owner);
			if (discoveredOwners !== null) {
				// Existing destination boundaries survive even when they belong to
				// another root and were not themselves rendered by this batch.
				for (const block of VT_REGISTRY) {
					if (block.disposed) continue;
					const owner = vtScopeForBlock(block);
					if (
						owner !== null &&
						discoveredOwners.has(owner) &&
						vtPendingCaptureElements(block, owner, preview).length > 0
					)
						groups.get(owner)!.planned.set(block, vtProps(block));
				}
			}
			for (const group of groups.values()) {
				if (
					group.owner.nodeType !== 9 &&
					(!group.owner.isConnected ||
						vtLeaving(group.owner, preview) ||
						(group.owner as Element).getAttribute('vt-scope') !== 'element')
				)
					group.valid = false;
			}
		} catch (error) {
			drainError ??= { error };
		} finally {
			VT_DRAIN = false;
			draining = false;
		}
	}
	if (discoveredOwners !== null) {
		// Measure the committed old hosts using saved ownership/props rather
		// than the blocks' already-rendered next state.
		for (const owner of discoveredOwners) {
			const group = groups.get(owner)!;
			if (!group.valid) continue;
			for (const before of unmeasured!.get(owner)!) {
				const rec = vtCreateRecord(
					before.block,
					before.els,
					group.styles,
					before.props,
					owner,
					before.name ?? vtScopeName(owner as HTMLElement),
				);
				group.visibleBefore.add(before.block);
				group.recs.push(rec);
				group.records.set(before.block, rec);
			}
		}
	}
	unmeasured = null;
	// Keep the document API's no-boundary skip behavior. A declaration with
	// no usable host must not turn into this document fallback.
	if (groups.size === 0 && !hasScopedBoundary) getGroup(defaultOwner);
	const participants = [...groups.values()].filter(
		(group) =>
			group.valid && (!hasScopedBoundary || group.recs.length > 0 || group.planned.size > 0),
	);
	const documents = new Map<VTDocument, VtRec[]>();
	const captureOwners = new Set(participants.map((group) => group.owner));
	for (const group of participants) {
		const owner = vtOwnerDocument(group.owner);
		const recs = documents.get(owner);
		if (recs === undefined) documents.set(owner, [...group.recs]);
		else recs.push(...group.recs);
	}
	const restore = (group: VtGroup): void => {
		vtRevertNames(group.recs);
		group.restoreRoot?.();
		group.restoreRoot = null;
	};
	const commit = (): Map<VTDocument, MutationRecord[]> => {
		const mutations = new Map<VTDocument, MutationRecord[]>();
		if (workDone) return mutations;
		workDone = true;
		for (const group of participants) restore(group);
		const observers = [...documents].map(
			([owner, recs]) => [owner, vtObserveChanges(owner, recs)] as const,
		);
		VT_DRAIN = true;
		layoutCapture = beginDeferredLayoutCapture(
			() => vtInterrupt(),
			participants.length > 0 && !passivesReleased,
		);
		const previousFlush = inFlush;
		inFlush = true;
		held = releaseHeldRootRenders(held);
		try {
			try {
				commitHeldRootRenders(held, layoutCapture);
			} finally {
				commitEffects();
			}
		} catch (error) {
			drainError ??= { error };
		} finally {
			inFlush = previousFlush;
			endDeferredLayoutCapture(layoutCapture);
			VT_DRAIN = false;
		}
		for (const [owner, observe] of observers) mutations.set(owner, observe());
		return mutations;
	};
	const completeLayout = (): void => {
		if (layoutCapture === null || layoutCapture.completed) return;
		const observers = [...documents].map(([owner, recs]) => vtObserveChanges(owner, recs));
		VT_DRAIN = true;
		try {
			completeDeferredLayouts(layoutCapture, interrupted);
		} catch (error) {
			drainError ??= { error };
		} finally {
			VT_DRAIN = false;
			for (const observe of observers) observe();
		}
	};
	const releasePassives = (): void => {
		if (passivesReleased) return;
		passivesReleased = true;
		if (layoutCapture !== null) releaseDeferredPassives(layoutCapture);
	};
	const update = (): void => {
		if (updateDone) return;
		updateDone = true;
		const before = [...documents.keys()].map((owner) => ({
			owner,
			fontsLoaded: owner.fonts?.status === 'loaded',
			navigation: (
				owner.defaultView as
					| (Window & {
							navigation?: { transition?: { finished: Promise<unknown> } | null };
					  })
					| null
			)?.navigation?.transition,
		}));
		const mutations = commit();
		const resources: Promise<void>[] = [];
		for (const item of before) {
			const waiting = vtWaitForResources(
				item.owner,
				item.fontsLoaded,
				mutations.get(item.owner) ?? [],
				captureOwners,
			);
			if (waiting !== null) resources.push(waiting);
		}
		const finalize = (): void => {
			if (!interrupted) {
				let blocksByOwner: Map<VTOwner, Block[]> | undefined;
				if (participants.length > 1) {
					blocksByOwner = new Map();
					for (const group of participants) blocksByOwner.set(group.owner, []);
					for (const block of VT_REGISTRY) {
						if (block.disposed) continue;
						const owner = vtScopeForBlock(block);
						if (owner !== null) blocksByOwner.get(owner)?.push(block);
					}
				}
				for (const group of participants) {
					if (!group.interrupted && !group.settled)
						vtFinalizeGroup(group, types, blocksByOwner?.get(group.owner));
				}
			}
			if (drainError !== null) throw drainError.error;
		};
		const afterResources = (): void | Promise<void> => {
			completeLayout();
			if (interrupted) return;
			const navigation = before.flatMap((item) =>
				item.navigation == null ? [] : [item.navigation.finished],
			);
			if (navigation.length > 0) return Promise.allSettled(navigation).then(finalize);
			finalize();
		};
		try {
			const waiting =
				resources.length > 0
					? Promise.allSettled(resources).then(afterResources)
					: afterResources();
			if (waiting === undefined) {
				resolveUpdate();
				return;
			}
			Promise.race([
				waiting,
				new Promise<void>((resolve) => {
					cancelWait = resolve;
				}),
			]).then(
				() => {
					cancelWait = null;
					resolveUpdate();
				},
				(error) => {
					cancelWait = null;
					rejectUpdate(error);
				},
			);
		} catch (error) {
			rejectUpdate(error);
		}
	};
	function interrupt(): void {
		if (draining) {
			interruptRequested = true;
			return;
		}
		if (interrupted) return;
		interrupted = true;
		cancelWait?.();
		commit();
		completeLayout();
		releasePassives();
		for (const group of participants) {
			group.interrupted = true;
			group.skipRequested = true;
			restore(group);
			group.handle?.skipTransition();
		}
		resolveUpdate();
		vtCompleteCapture(capture);
	}
	// The tree was prepared before any native capture, so a render error is
	// already known here. It belongs to the caller exactly as on an unwrapped
	// commit (uncaught, or collected by act()); publish the prepared work and
	// rethrow rather than starting an animation whose rejection would demote
	// the error to a recoverable report.
	if (drainError !== null || interruptRequested) {
		interrupt();
		if (drainError === null) return;
		throw drainError.error;
	}
	if (participants.length === 0) {
		commit();
		completeLayout();
		resolveUpdate();
		vtCompleteCapture(capture);
		rethrowDrainError();
		return;
	}
	let pendingReady = participants.length;
	let pendingFinished = participants.length;
	let documentsStarted = false;
	let elementsStarted = false;
	const ready = (): void => {
		if (--pendingReady === 0) vtCompleteCapture(capture);
	};
	const finish = (group: VtGroup): void => {
		if (group.settled) return;
		group.settled = true;
		restore(group);
		for (const cleanup of group.cleanups) {
			try {
				cleanup();
			} catch (error) {
				vtReportError(error, group.recs, group.skipRequested);
			}
		}
		group.cleanups.length = 0;
		for (const animation of group.animations) {
			try {
				animation.cancel();
			} catch (error) {
				vtReportError(error, group.recs, group.skipRequested);
			}
		}
		group.animations.length = 0;
		if (group.session !== null) vtFinishHandle(group.session);
		if (--pendingFinished === 0) releasePassives();
	};
	const progress = (): void => {
		if (!elementsStarted) return;
		// A document callback can block a later element callback. Enter every
		// element callback before starting documents, then publish the shared plan.
		if (!documentsStarted) {
			if (participants.some((group) => group.owner.nodeType !== 9 && !group.arrived)) return;
			documentsStarted = true;
			for (const group of participants) if (group.owner.nodeType === 9) start(group);
		}
		if (participants.every((group) => group.arrived)) {
			if (participants.every((group) => group.settled)) interrupt();
			else update();
		}
	};
	const start = (group: VtGroup): void => {
		let reported = false;
		let reportedError: unknown;
		const report = (error: unknown): void => {
			if (reported && error === reportedError) return;
			reported = true;
			reportedError = error;
			vtReportError(error, group.recs, group.skipRequested, group.planned.keys());
		};
		let handle: VTHandle;
		try {
			handle = vtStartNative(
				group.owner,
				() => {
					group.arrived = true;
					progress();
					return updateResult;
				},
				types,
			);
		} catch (error) {
			report(error);
			group.arrived = true;
			group.interrupted = true;
			restore(group);
			ready();
			finish(group);
			progress();
			return;
		}
		group.handle = handle;
		const session = (group.session = vtRegisterHandle(group.owner, handle, () => {
			group.interrupted = true;
			group.skipRequested = true;
			restore(group);
			releasePassives();
		}));
		if (group.skipRequested || interrupted) handle.skipTransition();
		handle.ready
			.then(
				() => {
					restore(group);
					if (group.interrupted || group.settled) return;
					capture.committed = true;
					session.release = releasePassives;
					for (const activation of group.acts) {
						if (group.interrupted || group.settled) break;
						const cleanup = vtFireCallback(activation.kind, activation.rec, types);
						if (cleanup !== undefined) group.cleanups.push(cleanup);
					}
					const owner = vtOwnerDocument(group.owner);
					const root =
						group.owner.nodeType === 9 ? owner.documentElement : (group.owner as Element);
					for (const animation of root.getAnimations?.({ subtree: true }) ?? []) {
						const effect = animation.effect as (KeyframeEffect & { pseudoElement?: string }) | null;
						if (effect?.target === root && effect.pseudoElement?.startsWith('::view-transition')) {
							group.animations.push(animation);
							vtPruneStaticDimensions(effect, owner);
						}
					}
				},
				(error) => {
					group.arrived = true;
					group.interrupted = true;
					restore(group);
					progress();
					report(drainError === null ? error : drainError.error);
				},
			)
			.catch(report)
			.then(ready);
		handle.finished.then(
			() => finish(group),
			(error) => {
				finish(group);
				report(drainError === null ? error : drainError.error);
			},
		);
	};
	const startCaptures = (): void => {
		if (interrupted) return;
		// Preparation can move a portal into an owner that was absent from the
		// queued tree. Keep its DOM plan private until that owner is available.
		const handles = vtActiveHandles(captureOwners);
		if (handles.size > 0) {
			vtWaitForHandles(handles, captureOwners);
			Promise.allSettled([...handles].map((handle) => handle.finished)).then(startCaptures);
			return;
		}
		for (const group of participants) vtPrepareGroup(group, types);
		for (const group of participants) if (group.owner.nodeType !== 9) start(group);
		elementsStarted = true;
		progress();
		if (participants.every((group) => group.settled) && drainError !== null) throw drainError.error;
	};
	startCaptures();
}

/** Drain pending passive effects ahead of a render pass (see flush()). */
function drainPassivesBeforeRender(): void {
	if (effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) {
		if (DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.holdPassivesBeforeRender()) return;
		drainPassiveEffects();
	}
}

/**
 * Runs `fn` and synchronously drains scheduled renders and insertion/layout work.
 * Newly queued passive effects retain Octane's post-paint scheduling. Bypasses the microtask-batched flush — used by the benchmark
 * timing rig to measure operation wall-clock without microtask coalescing. Also the
 * controlled-restore commit path: maybeFlushDiscrete flushes through here at the
 * outermost boundary of a discrete event that armed a controlled `value`/`checked`
 * restore, so the restore compares the DOM against freshly committed state.
 */
export function flushSync<T>(fn: () => T): T {
	if (
		process.env.NODE_ENV !== 'production' &&
		(CURRENT_BLOCK !== null || EFFECT_BODY_DEPTH > 0 || REF_CALLBACK_DEPTH > 0)
	) {
		console.error(
			'flushSync was called while rendering or running a lifecycle callback. Move the call to an event or scheduled task.',
		);
	}
	// Already inside a flush — a DISCRETE event the browser dispatched
	// synchronously from a commit-phase DOM mutation (maybeFlushDiscrete), or a
	// user flushSync inside a lifecycle. React cannot flush while already
	// rendering: run the callback and let the AMBIENT flush drain whatever it
	// schedules — drainQueue picks up mid-pass appends, and the microtask
	// scheduler backstops work queued after the render pass (see `inFlush`).
	if (inFlush) return runNativeBatch(fn);
	// A preparing view transition is skipped so the sync drain can commit now.
	// A running animation survives; the urgent update changes the live DOM under it.
	if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.interrupt();
	const prevSync = syncFlush;
	syncFlush = true;
	let result: T;
	try {
		try {
			result = runNativeBatch(fn);
			// flushSync drains both priorities, including transitions waiting for their task.
			if (TRANSITION_TASK_DRIVER) TRANSITION_TASK_DRIVER.adopt(true);
			// `inFlush` guards only the DRAIN below, not fn(): a nested flushSync
			// inside fn still flushes inline (React isn't "rendering" during the
			// callback), while one landing inside the drain defers (guard above).
			inFlush = true;
			// The drain is a commit of its own, outside the phase of an effect that
			// called flushSync: its ref callbacks and store checks are not passive work.
			const effectPhase = CURRENT_EFFECT_PHASE;
			CURRENT_EFFECT_PHASE = -1;
			let pendingError: { err: any } | null = null;
			try {
				// Drain anything scheduled by fn (same depth-sorted, coalescing drain as flush()).
				// Octane drains insertion + layout synchronously. Newly queued passive
				// effects retain the documented post-paint policy in commitEffects.
				if (QUEUE.length > 0) drainPassivesBeforeRender();
				const focused = QUEUE.length === 0 ? null : captureQueuedFocusSelection();
				pendingError = drainQueueWithFocus(focused);
				if (focused !== null) restoreQueuedFocusSelection(focused);
				commitEffects();
				// A sync-committed effect (a LAYOUT effect calling setState) can schedule MORE
				// renders. While `syncFlush` is set, scheduleRender pushes to QUEUE without arming a
				// microtask. React's flushSync drains such layout-effect cascades SYNCHRONOUSLY —
				// needed so derived layout state (e.g. a presence/exit-animation gate) is committed
				// before flushSync returns. Revisiting a block does not prove a loop:
				// finite layout measurements can update the same parent several times.
				// Drain those passes before DOM observers can see intermediate state.
				// The existing nested-update guard and LAYOUT_CASCADE_LIMIT bound loops;
				// any remaining work retains its per-chain count in the async scheduler.
				if (QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) {
					pendingError = drainLayoutUpdates(pendingError);
				}
			} finally {
				inFlush = false;
				if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.endCue();
				if (FLUSHED_TRANSITION_BATCHES.length !== 0 || CONSUMED_TRANSITION_BLOCKS !== null)
					clearFlushedTransitions();
				CURRENT_EFFECT_PHASE = effectPhase;
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__devtoolsNotifyFlush();
			}
			if ((QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) && !scheduled) {
				scheduled = true;
				queueMicrotask(flush);
			}
			if (pendingError !== null) throw pendingError.err;
		} finally {
			syncFlush = prevSync;
		}
	} catch (error) {
		rethrowAfterControlledRestore(error);
	}
	if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.restore();
	return result;
}

export function drainQueuedRefDetaches(): void {
	if (refDetachQueue.length === 0) return;
	const q = refDetachQueue.splice(0);
	for (let i = 0; i < q.length; i += 4) {
		try {
			REF_CALLBACK_DEPTH++;
			try {
				attachRef(q[i], null, q[i + 1]);
			} finally {
				REF_CALLBACK_DEPTH--;
			}
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			// A throwing ref detach must not abort the commit (the remaining detaches
			// + attaches still run) — route to the deletion's boundary like React,
			// reporting through the owning root's callbacks either way.
			const handler = q[i + 2] as TryHandler | null;
			const owner = q[i + 3] as Block | null;
			if (handler !== null) {
				reportCaughtError(owner, err, handler(err));
			} else if (!reportUncaughtError(owner, err)) console.error(err);
		}
	}
}

/** Drain queued mount ref attaches in React's post-order (descendant-before-ancestor). */
export function drainQueuedRefAttaches(): void {
	if (refAttachQueue.length === 0) return;
	const q = refAttachQueue.splice(0);
	// ES stable sort preserves the queue's DFS/source order for disjoint subtrees;
	// comparePostOrder moves only descendants ahead of their queued ancestors.
	// Entries with one immediate parent are siblings (or on the same block), so
	// every comparison is zero and their existing queue order is already final.
	if (q.length > 1) {
		const parent = q[0].block?.parentBlock ?? null;
		for (let i = 1; i < q.length; i++) {
			if ((q[i].block?.parentBlock ?? null) !== parent) {
				q.sort(compareRefPostOrder);
				break;
			}
		}
	}
	for (const r of q) {
		// Skip attaches whose owning subtree was unmounted earlier in THIS flush
		// (e.g. a try boundary caught a mount-time throw and ran unmountBlock +
		// the ref-detach cleanup). Without this guard the deferred attach would
		// re-run on a torn-down node — firing a callback ref on a dead element and
		// resurrecting an object ref the cleanup just nulled.
		if (blockSubtreeDisposed(r.block)) continue;
		if (NATIVE_READ_DRIVER && !NATIVE_READ_DRIVER.publicationCurrent(r)) {
			NATIVE_READ_DRIVER.deferRef(
				r,
				r.el,
				r.ref === attachLiveFragmentRef ? (r.el as FragmentInstance)._currentRef : r.ref,
			);
			continue;
		}
		const activity = activityRefState ? activityRefState.get(r.el) : undefined;
		if (activity !== undefined && findHiddenActivity(r.block) !== null) {
			activity.hidden = true;
			continue;
		}
		try {
			if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.forgetUnpublishedRef(r.el);
			REF_CALLBACK_DEPTH++;
			try {
				attachRef(r.ref, r.el);
			} finally {
				REF_CALLBACK_DEPTH--;
			}
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			const handler = findTryHandler(r.block);
			if (handler) {
				reportCaughtError(r.block, err, handler(err));
			} else if (!reportUncaughtError(r.block, err)) console.error(err);
		}
	}
}
let refStateUpdates: Map<StateSlot<unknown>, RefStateUpdate> | null = null;
let collectingRefStateUpdates = false;

function drainCommitRefs(
	initialUpdates: Map<StateSlot<unknown>, RefStateUpdate> | null = null,
): void {
	const previousUpdates = refStateUpdates;
	const previousCollecting = collectingRefStateUpdates;
	refStateUpdates = initialUpdates;
	collectingRefStateUpdates = true;
	try {
		drainRefDetaches();
		drainRefAttaches();
	} finally {
		const updates = refStateUpdates as Map<StateSlot<unknown>, RefStateUpdate> | null;
		refStateUpdates = previousUpdates;
		collectingRefStateUpdates = previousCollecting;
		if (updates !== null) {
			// These are still ref-caused updates even though the callbacks have
			// returned. Preserve their recursion budget and profiling provenance.
			REF_CALLBACK_DEPTH++;
			try {
				for (const [state, update] of updates) {
					if (update.block.disposed || Object.is(state.value, update.previous)) continue;
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(update.block, 'state', update.profileSlot);
					scheduleRender(update.block);
				}
			} finally {
				REF_CALLBACK_DEPTH--;
			}
		}
	}
}

// Optional commit-phase capture. Ordinary renders allocate nothing and take
// only the null guards below. A captured mutation phase has already committed
// its DOM; its layout phase must complete before another commit starts effects.
let DEFERRED_LAYOUT_CAPTURE: DeferredLayoutCapture | null = null;
let PENDING_DEFERRED_LAYOUT: DeferredLayoutCapture | null = null;
let COMPLETING_DEFERRED_LAYOUT: DeferredLayoutCapture | null = null;
let DEFERRED_LAYOUT_HELD_WORK: Set<Block> | null = null;

function ensureDeferredLayoutDriver(): void {
	if (!DEFERRED_LAYOUT_DRIVER) {
		DEFERRED_LAYOUT_DRIVER = {
			beforeCommit() {
				const pending = PENDING_DEFERRED_LAYOUT;
				if (pending === null || DEFERRED_LAYOUT_CAPTURE !== null) return;
				try {
					pending.onInterrupt?.();
				} finally {
					completeDeferredLayouts(pending, true);
				}
			},
			capturing: () => DEFERRED_LAYOUT_CAPTURE !== null,
			defer(mutationBatch, caughtReports) {
				const capture = DEFERRED_LAYOUT_CAPTURE;
				if (capture === null) return false;
				deferCommitLayout(capture, mutationBatch, caughtReports);
				return true;
			},
			schedulePending(block) {
				// A new ref/layout write promotes an already queued block into this
				// synchronous cascade. Untouched foreign work keeps its later batch.
				const capture = DEFERRED_LAYOUT_CAPTURE;
				if (capture !== null) (capture.pendingWork ??= new Set()).add(block);
				else if (PENDING_DEFERRED_LAYOUT?.pendingWork?.delete(block) && !scheduled) {
					// The original microtask yielded for resources. A later write to
					// that same pending block must arm a fresh interruption check.
					scheduled = true;
					queueMicrotask(flush);
				}
				if (DEFERRED_LAYOUT_HELD_WORK?.delete(block)) QUEUE.push(block);
			},
			discardRefs(root, uncommitted) {
				const capture = PENDING_DEFERRED_LAYOUT;
				if (capture !== null) discardSubtreeRefAttachesFrom(capture.refs, root, uncommitted);
			},
			holdPassivesBeforeRender() {
				const capture = COMPLETING_DEFERRED_LAYOUT;
				if (capture === null) return false;
				captureDeferredPassives(capture);
				return true;
			},
			holdsPendingQueue() {
				const capture = PENDING_DEFERRED_LAYOUT;
				if (
					capture === null ||
					capture.completed ||
					(QUEUE.length === 0 && ROOT_RENDER_TRANSACTIONS.length === 0)
				)
					return false;
				for (const block of QUEUE) if (capture.pendingWork?.has(block) !== true) return false;
				for (const transaction of ROOT_RENDER_TRANSACTIONS)
					if (capture.transactions?.has(transaction) !== true) return false;
				return true;
			},
			recordRootTransaction(transaction) {
				const capture = DEFERRED_LAYOUT_CAPTURE;
				if (capture !== null) (capture.transactions ??= new Set()).add(transaction);
			},
		};
	}
}

function beginDeferredLayoutCapture(
	onInterrupt?: () => void,
	retainPassives = false,
): DeferredLayoutCapture {
	ensureDeferredLayoutDriver();
	const previous = PENDING_DEFERRED_LAYOUT;
	if (previous !== null && DEFERRED_LAYOUT_CAPTURE === null) {
		try {
			previous.onInterrupt?.();
		} finally {
			completeDeferredLayouts(previous, true);
		}
	}
	const capture: DeferredLayoutCapture = {
		commits: [],
		refs: [],
		refUpdates: null,
		stores: [],
		adoptions: [],
		passives: [],
		passiveUnmounts: [],
		retainPassives,
		onInterrupt,
		pendingWork: null,
		transactions: null,
		completed: false,
	};
	DEFERRED_LAYOUT_CAPTURE = capture;
	PENDING_DEFERRED_LAYOUT = capture;
	return capture;
}

function endDeferredLayoutCapture(capture: DeferredLayoutCapture): void {
	if (DEFERRED_LAYOUT_CAPTURE === capture) DEFERRED_LAYOUT_CAPTURE = null;
}

function deferCommitLayout(
	capture: DeferredLayoutCapture,
	mutationBatch: PendingEffect[] | null,
	caughtReports: InlineCaughtErrorReport[] | null,
): void {
	if (mutationBatch !== null || caughtReports !== null)
		capture.commits.push({ mutationBatch, caughtReports });
	// Detaches remain in the mutation phase. Keep ref-caused state writes
	// coalesced with the eventual attaches without retaining ambient state over
	// the asynchronous readiness interval.
	const previousUpdates = refStateUpdates;
	const previousCollecting = collectingRefStateUpdates;
	refStateUpdates = capture.refUpdates;
	collectingRefStateUpdates = true;
	try {
		drainRefDetaches();
	} finally {
		capture.refUpdates = refStateUpdates;
		refStateUpdates = previousUpdates;
		collectingRefStateUpdates = previousCollecting;
		for (const ref of refAttachQueue) capture.refs.push(ref);
		refAttachQueue.length = 0;
		for (const store of storeSyncQueue) capture.stores.push(store);
		storeSyncQueue.length = 0;
		if (hydrationStarted && NATIVE_ADOPTION_RELEASES !== null) {
			for (const adoption of NATIVE_ADOPTION_RELEASES) capture.adoptions.push(adoption);
			NATIVE_ADOPTION_RELEASES = null;
		}
		captureDeferredPassives(capture);
	}
}

/** Accept only roots rendered synchronously by this native mutation phase. */
/** Commit one root's finished transaction now, leaving the others queued. */
function commitRootAlone(transaction: RootRenderTransaction): void {
	const others = ROOT_RENDER_TRANSACTIONS.filter((queued) => queued !== transaction);
	ROOT_RENDER_TRANSACTIONS = [transaction];
	try {
		commitRootRenders();
	} finally {
		ROOT_RENDER_TRANSACTIONS = others.concat(ROOT_RENDER_TRANSACTIONS);
	}
}

function acceptDeferredRootTransactions(capture: DeferredLayoutCapture): void {
	if (capture.transactions === null || ROOT_RENDER_TRANSACTIONS.length === 0) return;
	const foreign: RootRenderTransaction[] = [];
	const owned: RootRenderTransaction[] = [];
	for (const transaction of ROOT_RENDER_TRANSACTIONS) {
		if (capture.transactions.has(transaction)) owned.push(transaction);
		else foreign.push(transaction);
	}
	if (owned.length === 0) return;
	ROOT_RENDER_TRANSACTIONS = owned;
	try {
		commitRootRenders();
	} finally {
		ROOT_RENDER_TRANSACTIONS = foreign.concat(ROOT_RENDER_TRANSACTIONS);
	}
}

/** Complete at most once, either after readiness or before interrupting work. */
function completeDeferredLayouts(capture: DeferredLayoutCapture, interrupted = false): void {
	if (capture.completed) {
		if (interrupted) releaseDeferredPassives(capture);
		return;
	}
	try {
		capture.completed = true;
		if (interrupted) capture.retainPassives = false;
		if (PENDING_DEFERRED_LAYOUT === capture) PENDING_DEFERRED_LAYOUT = null;
		const previousFlush = inFlush;
		inFlush = true;
		const previousCompleting = COMPLETING_DEFERRED_LAYOUT;
		const previousHeldWork = DEFERRED_LAYOUT_HELD_WORK;
		const heldWork: Block[] = [];
		if (!interrupted) {
			const queued = QUEUE.splice(0);
			for (const block of queued) {
				if (capture.pendingWork?.has(block)) QUEUE.push(block);
				else heldWork.push(block);
			}
		}
		capture.pendingWork = null;
		const heldTransactions: RootRenderTransaction[] = [];
		if (!interrupted) {
			const transactions = ROOT_RENDER_TRANSACTIONS;
			ROOT_RENDER_TRANSACTIONS = [];
			for (const transaction of transactions) {
				if (capture.transactions?.has(transaction)) ROOT_RENDER_TRANSACTIONS.push(transaction);
				else heldTransactions.push(transaction);
			}
			QUEUE_REINDEX_EPOCH++;
			COMPLETING_DEFERRED_LAYOUT = capture;
			DEFERRED_LAYOUT_HELD_WORK = new Set(heldWork);
		}
		const nativeFrame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
		// These are the commit's own refs and layout effects, so they run outside any
		// transition, as in commitEffects. An interruption from a commit flushed
		// inside startTransition must not stage their updates into that transition.
		const transitionDepth = TRANSITION_DEPTH;
		const actionBatch = ACTIVE_TRANSITION_ACTION_BATCH;
		TRANSITION_DEPTH = 0;
		ACTIVE_TRANSITION_ACTION_BATCH = null;
		EFFECT_COMMIT_DEPTH++;
		try {
			// A direct root commit can arrive while readiness was pending. Its live
			// ref attaches must stay after those from the already committed mutation.
			const laterRefs = refAttachQueue.splice(0);
			for (const ref of capture.refs) refAttachQueue.push(ref);
			capture.refs.length = 0;
			try {
				drainCommitRefs(capture.refUpdates);
			} finally {
				capture.refUpdates = null;
				for (const ref of laterRefs) refAttachQueue.push(ref);
			}
			reapplyFragmentBindings();
			for (const commit of capture.commits) {
				if (commit.mutationBatch !== null) runLayoutEffects(commit.mutationBatch);
				if (commit.caughtReports !== null) publishInlineCaughtErrorReports(commit.caughtReports);
			}
			capture.commits.length = 0;
			for (const adoption of capture.adoptions) adoption.release();
			capture.adoptions.length = 0;
			const laterStores = storeSyncQueue.splice(0);
			for (const store of capture.stores) storeSyncQueue.push(store);
			capture.stores.length = 0;
			try {
				drainStoreSyncs();
			} finally {
				for (const store of laterStores) storeSyncQueue.push(store);
			}
			if (interrupted) restoreDeferredPassives(capture);
			if (QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0) {
				const error = drainLayoutUpdates(null);
				if (error !== null) throw error.err;
			}
		} finally {
			capture.commits.length = 0;
			capture.refs.length = 0;
			capture.refUpdates = null;
			// A throwing layout callback must not strand resource leases or passive
			// cleanup. Return unfinished queues to the normal recovery commit.
			if (hydrationStarted && capture.adoptions.length > 0) {
				const pending = (NATIVE_ADOPTION_RELEASES ??= []);
				for (const adoption of capture.adoptions) pending.push(adoption);
				capture.adoptions.length = 0;
			}
			for (const store of capture.stores) storeSyncQueue.push(store);
			capture.stores.length = 0;
			if (capture.retainPassives) captureDeferredPassives(capture);
			else restoreDeferredPassives(capture);
			if (!interrupted) {
				for (const block of heldWork) {
					if (DEFERRED_LAYOUT_HELD_WORK!.has(block) && block.pending && !block.disposed)
						QUEUE.push(block);
				}
				ROOT_RENDER_TRANSACTIONS = heldTransactions.concat(ROOT_RENDER_TRANSACTIONS);
				QUEUE_REINDEX_EPOCH++;
			}
			COMPLETING_DEFERRED_LAYOUT = previousCompleting;
			DEFERRED_LAYOUT_HELD_WORK = previousHeldWork;
			TRANSITION_DEPTH = transitionDepth;
			ACTIVE_TRANSITION_ACTION_BATCH = actionBatch;
			try {
				if (nativeFrame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(nativeFrame);
			} finally {
				try {
					finishEffectCommit();
				} finally {
					inFlush = previousFlush;
				}
			}
		}
	} catch (error) {
		rethrowAfterControlledRestore(error);
	}
	if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.restore();
}

export function commitEffects(): void {
	if (HOLDING_ROOT_COMMITS) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.COMMIT_EFFECTS);
	// No-work fast path: every commit queue the drains below consume is empty —
	// the common case for a hydration adoption or an effect-free app's flush.
	// One combined check (module-scope length reads, same emptiness conditions
	// each drain tests individually) keeps the whole drain pipeline off this
	// path; only the passive hand-off below can still apply. INVARIANT: a drain
	// added to this function must also add its has-work condition here, or its
	// work is silently skipped whenever the other queues are empty.
	if (
		effectEventQueue.length === 0 &&
		effectEventCommitActions.length === 0 &&
		effectQueues[INSERTION].length === 0 &&
		effectQueues[LAYOUT].length === 0 &&
		refDetachQueue.length === 0 &&
		refAttachQueue.length === 0 &&
		storeSyncQueue.length === 0 &&
		(!hydrationStarted || NATIVE_ADOPTION_RELEASES === null) &&
		activeFragments.size === 0 &&
		!hasControlledSyncs()
	) {
		if (DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.defer(null, null)) return;
		if (
			DEFERRED_LAYOUT_DRIVER &&
			(effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0)
		)
			DEFERRED_LAYOUT_DRIVER.beforeCommit();
		if (
			(effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) &&
			!passiveScheduled
		) {
			schedulePassiveFlush();
		}
		// Close this commit's share of the sync-callback chain inline: commits
		// are hot, and only a settled hold needs the out-of-line path.
		if (EFFECT_COMMIT_DEPTH === 0) {
			if (NESTED_UPDATE_SCHEDULED) NESTED_UPDATE_SCHEDULED = false;
			else if (HELD_PASSIVE_CHAIN === NESTED_UPDATE_CHAIN_ID) settleNestedUpdateChain();
			else NESTED_UPDATE_CHAIN_ID++;
		}
		return;
	}
	if (DEFERRED_LAYOUT_DRIVER) DEFERRED_LAYOUT_DRIVER.beforeCommit();
	const nativeFrame = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.pauseLifecycle() : -1;
	// Like React, a commit clears the ambient transition: one flushed inside a
	// startTransition callback does not make its callbacks' updates transitions
	// or stage them into that Action. See inCommitCallback.
	const transitionDepth = TRANSITION_DEPTH;
	const actionBatch = ACTIVE_TRANSITION_ACTION_BATCH;
	TRANSITION_DEPTH = 0;
	ACTIVE_TRANSITION_ACTION_BATCH = null;
	EFFECT_COMMIT_DEPTH++;
	try {
		// React publishes every Effect Event body before any insertion/layout effect
		// can call an already-registered wrapper. Entries from failed or suspended
		// renders are filtered by their block's completed render version.
		drainEffectEventUpdates();
		// Activity visible→hidden work is transactionally deferred until the event
		// bodies above publish. Its layout cleanup therefore sees the fresh body while
		// the preserved DOM range is still connected, then the action hides that range.
		const caughtReports = drainEffectEventCommitActions();
		// Controlled-form commit work FIRST: select projections must see the
		// options this render just built, and the dev missing-onInput check must
		// see the element's full listener set (see drainControlledSyncs).
		drainControlledSyncs();
		// Mutation phase (React's commitMutationEffects): a per-scope walk over the
		// merged insertion+layout queues — each scope's insertion destroys, insertion
		// bodies, then its layout DESTROYS. Layout bodies wait for the layout phase
		// below; the returned batch carries them across the ref work.
		const mutationBatch = drainMutationEffects();
		if (DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.defer(mutationBatch, caughtReports))
			return;
		// Teardown ref detaches fire before this commit's attaches (mutation → layout),
		// so a ref moving between elements cycles null → new-node in one commit.
		drainCommitRefs();
		reapplyFragmentBindings();
		// Layout phase (React's commitLayoutEffects): bodies only — every layout
		// cleanup already fired in the mutation walk, ref attaches just landed, so a
		// layout body sees populated refs and connected DOM.
		if (mutationBatch !== null) runLayoutEffects(mutationBatch);
		if (caughtReports !== null) publishInlineCaughtErrorReports(caughtReports);
		if (hydrationStarted) HYDRATION_DRIVER!.releaseNativeAdoptions();
		// After layout effects (so a sibling layout effect that mutates+notifies the
		// store has already run), reconcile each uSES consumer's committed snapshot
		// against the store and re-render any that tore. Mirrors React draining its
		// store-consistency checks right after commitLayoutEffects.
		drainStoreSyncs();
		if (
			(effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) &&
			!passiveScheduled
		) {
			schedulePassiveFlush();
		}
		// Only an outermost commit closes the chain. Commits nested in another
		// commit or in a passive drain (flushSync from a passive effect) never reset it.
		if (EFFECT_COMMIT_DEPTH === 1) {
			if (NESTED_UPDATE_SCHEDULED) NESTED_UPDATE_SCHEDULED = false;
			else if (HELD_PASSIVE_CHAIN === NESTED_UPDATE_CHAIN_ID) settleNestedUpdateChain();
			else NESTED_UPDATE_CHAIN_ID++;
		}
	} finally {
		TRANSITION_DEPTH = transitionDepth;
		ACTIVE_TRANSITION_ACTION_BATCH = actionBatch;
		if (nativeFrame >= 0) NATIVE_READ_DRIVER!.resumeLifecycle(nativeFrame);
		finishEffectCommit();
	}
}

function throwPendingActErrors(): void {
	const errors = actErrors;
	actErrors = null;
	if (errors !== null)
		throw errors.length === 1 ? errors[0] : new AggregateError(errors, formatClientError(64));
}

function mergePendingActErrors(error: unknown): unknown {
	const errors = actErrors;
	actErrors = null;
	return errors === null ? error : new AggregateError([...errors, error], formatClientError(64));
}

function actCheckpoint(): Promise<void> {
	// A task runs after the entire promise queue, regardless of middleware chain
	// depth. MessageChannel also remains live when a test freezes timeout clocks.
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			channel.port2.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}

/**
 * Wrap test code that triggers updates so all of
 * the scheduled work commits before the assertion phase runs.
 *
 * Two callback modes:
 *  - SYNC callback → all scheduled work (renders + INSERTION/LAYOUT/PASSIVE
 *    effects) is flushed SYNCHRONOUSLY before act returns, so
 *    `act(() => setState(...)); expect(...)` works WITHOUT awaiting — the
 *    dominant pattern in ported React test suites. Nested callbacks join the
 *    outer callback's transaction. The returned promise also drains promise
 *    work and carries the callback's result. Callback and render errors reject
 *    it rather than escaping through the scheduler.
 *  - ASYNC callback (returns a thenable) → awaited, then the scheduler is
 *    drained across microtask ticks until quiescent (renders, effects,
 *    microtask chains from `use(promise)` / transition retries, and
 *    transition renders and useDeferredValue swaps, which wait for their own
 *    host task).
 *
 * While the act() scope is active, scheduleRender's "update outside act(...)"
 * dev warning is suppressed (see `IS_OCTANE_ACT_ENVIRONMENT` and
 * `setIsOctaneActEnvironment`).
 *
 * Complete promise checkpoints, bounded by ACT_DRAIN_LIMIT iterations,
 * drains cascades like `use(promise)` → status flip → retry → renderBlock
 * that wouldn't settle in a single tick.
 */
export function act<T>(fn: () => T | Promise<T>): Promise<T> {
	const nested = isInActScope();
	actScopeDepth++;
	actCallbackDepth++;
	let result: T | Promise<T>;
	try {
		result = fn();
	} catch (err) {
		actScopeDepth--;
		return Promise.reject(mergePendingActErrors(err));
	} finally {
		actCallbackDepth--;
	}
	if (result !== null && typeof result === 'object' && typeof (result as any).then === 'function') {
		asyncActCallbackDepth++;
		return (async () => {
			try {
				let value: T;
				try {
					value = await (result as Promise<T>);
				} finally {
					asyncActCallbackDepth--;
				}
				if (nested) return value;
				for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
					await actCheckpoint();
					throwPendingActErrors();
					const hadWork =
						hasPendingWork() ||
						DEFERRED_SWAPS !== null ||
						transitionTask !== 0 ||
						hasPendingHostBudget();
					drainPassiveEffects();
					if (!hadWork && !hasPendingWork()) return value;
				}
				throw new Error(formatClientError(14, ACT_DRAIN_LIMIT));
			} catch (error) {
				throw mergePendingActErrors(error);
			} finally {
				actScopeDepth--;
			}
		})();
	}
	if (nested) {
		actScopeDepth--;
		return Promise.resolve(result as T);
	}
	// Sync callback: flush synchronously BEFORE returning (flushSync drains the
	// render queue + commit-phase effects; drainPassiveEffects the post-paint
	// queue) so assertions immediately after a non-awaited act() observe
	// committed state — React's sync-act contract. Work driven by MICROTASKS
	// the callback queued (an in-flight thenable from `use(promise)`, an
	// awaited async validation) can't be reached synchronously; the returned
	// promise continues the async drain for callers that DO await.
	try {
		for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
			// A transition-lane drain that would be wrapped in a view transition must
			// route through flush() — flushSync is the urgent path and deliberately
			// SKIPS the wrap. Under the test mock, startViewTransition runs its update
			// callback synchronously, so this stays a synchronous drain; a REAL async
			// startViewTransition under sync act() cannot be awaited here (use the
			// async act form, which drains through the scheduled microtask flush).
			// Transitions waiting for their task join this drain, wrapped or not.
			if (TRANSITION_TASK_DRIVER) TRANSITION_TASK_DRIVER.adopt(true);
			if (VIEW_TRANSITION_DRIVER && VIEW_TRANSITION_DRIVER.wouldWrap()) flush();
			else flushSync(() => {});
			throwPendingActErrors();
			drainPassiveEffects();
			if (!hasPendingWork()) break;
			if (i === ACT_DRAIN_LIMIT - 1) {
				throw new Error(formatClientError(14, ACT_DRAIN_LIMIT));
			}
		}
	} catch (err) {
		// Flush/commit failures follow the same thenable contract as callback
		// failures. Balance the scope here because the async continuation below
		// is never created on this path.
		actScopeDepth--;
		return Promise.reject(mergePendingActErrors(err));
	}
	return (async () => {
		try {
			for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
				await actCheckpoint();
				throwPendingActErrors();
				const hadWork =
					hasPendingWork() ||
					DEFERRED_SWAPS !== null ||
					transitionTask !== 0 ||
					hasPendingHostBudget();
				drainPassiveEffects();
				if (!hadWork && !hasPendingWork()) return result as T;
			}
			throw new Error(formatClientError(14, ACT_DRAIN_LIMIT));
		} catch (error) {
			throw mergePendingActErrors(error);
		} finally {
			actScopeDepth--;
		}
	})();
}

function finishEffectCommit(): void {
	if (--EFFECT_COMMIT_DEPTH !== 0 || COMMIT_PHASE_ERRORS === null) return;
	const errors = COMMIT_PHASE_ERRORS;
	COMMIT_PHASE_ERRORS = null;
	for (const { block, error, handler } of errors) reportEffectError(block, error, handler);
}

export function reportEffectError(
	block: Block | null,
	error: unknown,
	capturedHandler?: TryHandler | null,
): void {
	if (EFFECT_COMMIT_DEPTH > 0) {
		(COMMIT_PHASE_ERRORS ??= []).push({ block, error, handler: capturedHandler });
		return;
	}
	const handler = capturedHandler === undefined ? findTryHandler(block) : capturedHandler;
	if (handler !== null) {
		reportCaughtError(block, error, handler(error));
		return;
	}
	let root = block;
	while (root !== null && root.parentBlock !== null) root = root.parentBlock;
	if (root !== null && root.kind === 'root' && !root.disposed) {
		unmountBlock(root);
		// Layout/passive failures can occur after this commit's normal ref drain.
		// Complete deletion before the error callback observes the failed root.
		drainRefDetaches();
	}
	if (!reportUncaughtError(block, error)) console.error(error);
}

/** Run a queued effect's body and stash its returned cleanup on the slot. */
export function runEffectBody(e: PendingEffect): void {
	if (e.fn === null) return;
	let cleanup: void | Cleanup;
	const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
	if (slot === undefined || slot.revision !== e.revision) return;
	if (!nativeEffectPublicationCurrent(e, slot)) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileEffect(e.phase, false, e);
	slot.connectedFn = e.fn;
	slot.connectedArgs = e.args;
	slot.disconnected = false;
	try {
		const previousPhase = CURRENT_EFFECT_PHASE;
		CURRENT_EFFECT_PHASE = e.phase;
		EFFECT_BODY_DEPTH++;
		try {
			// Spread deps as positional args (see PendingEffect.args). A no-deps
			// effect has args === undefined, which apply accepts as zero arguments.
			// eslint-disable-next-line prefer-spread
			cleanup =
				signalDocumentEnabled || e.scope.block.idState.renderOwner?.signalOwner !== undefined
					? runWithBlockSignalOwner(e.scope, () => e.fn!.apply(null, e.args as []))
					: e.fn.apply(null, e.args as []);
		} finally {
			EFFECT_BODY_DEPTH--;
			CURRENT_EFFECT_PHASE = previousPhase;
		}
	} catch (err) {
		if (err instanceof MaximumUpdateDepthError) throw err;
		// Route effect errors to the nearest enclosing tryBlock, if any.
		reportEffectError(e.scope.block, err);
		return;
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		cleanup !== undefined &&
		typeof cleanup !== 'function'
	) {
		const name =
			e.phase === PASSIVE
				? 'useEffect'
				: e.phase === LAYOUT
					? 'useLayoutEffect'
					: 'useInsertionEffect';
		const thenable = cleanup !== null && typeof (cleanup as any).then === 'function';
		console.error(
			name +
				' must return a cleanup function or nothing.' +
				(thenable
					? ' Start asynchronous work inside the effect and return its cleanup separately.'
					: ''),
		);
	}
	if (typeof cleanup === 'function') {
		// The slot owns its LATEST cleanup: unmountScope's effect-slot walk (and
		// deactivateScope's hide walk) read + clear it, so a dep-changed effect's
		// stale cleanup can never replay at teardown.
		slot.cleanup = cleanup;
	}
}

/**
 * Passive phase — React's flushPassiveEffects: first the DEFERRED destroys of
 * unmounted scopes (commitPassiveUnmountEffects processes deletions in the
 * same pass), then commit-wide cleanups-before-bodies over the queued entries.
 * Snapshot-and-splice up front for the same re-entrancy contract as
 * drainMutationEffects (see its comment).
 */
export function drainRegisteredPassivePhase(): void {
	// Held passives wait for the queued render that settles the exhausted chain;
	// its commit re-arms the post-paint drain (see scheduleRender).
	if (HELD_PASSIVE_CHAIN === NESTED_UPDATE_CHAIN_ID) {
		if (QUEUE.length !== 0) return;
		// That render already ran, in a commit nested inside a deferred layout
		// completion, so no outermost commit closed the chain. Close it here
		// rather than strand the held effects.
		settleNestedUpdateChain();
	}
	EFFECT_COMMIT_DEPTH++;
	try {
		drainDeferredPassiveUnmounts();
		const pending = effectQueues[PASSIVE];
		if (pending.length === 0) return;
		const q = pending.splice(0);
		q.sort(compareEffectPostOrder);
		for (let i = 0; i < q.length; i++) {
			const e = q[i];
			if (e.scope.block.disposed || (e.fn !== null && inInactiveSubtree(e.scope.block))) continue;
			fireEffectCleanup(e);
		}
		for (let i = 0; i < q.length; i++) {
			const e = q[i];
			if (e.scope.block.disposed || inInactiveSubtree(e.scope.block)) continue;
			runEffectBody(e);
		}
	} finally {
		finishEffectCommit();
	}
}

// Only bindings opting into committed state allocate this companion setter.
// Keeping it outside the ordinary state cell preserves every useState record's shape.
const COMMITTED_STATE_SETTERS = /* @__PURE__ */ new WeakMap<StateSetter<any>, StateSetter<any>>();

/**
 * @internal Binding state whose third setter accepts a state value/updater and
 * commits the ordinary scheduled batch before an external integration callback.
 * The batch can include eligible work in other roots and previously queued
 * effects, even if the state update is a no-op. Unrelated transitions waiting
 * for their host task are not adopted. Normal ViewTransition routing decides
 * which active owners an urgent update affects. An ambient render or commit
 * owns updates made during it.
 */
export function __useCommittedState<T>(
	initial: T | (() => T),
	slot: HookSlot | undefined,
): [T, StateSetter<T>, StateSetter<T>] {
	const state = readStateHook(initial, slot, false);
	const setter = state.setter;
	let committed = COMMITTED_STATE_SETTERS.get(setter);
	if (committed === undefined) {
		const block = CURRENT_BLOCK!;
		committed = (next: T | ((previous: T) => T)) => {
			if (block.disposed) return;
			// A nested commit can invalidate the active DOM walk. Its ambient
			// render/commit already owns this update, just as it owns flushSync's.
			if (CURRENT_BLOCK !== null || inFlush) {
				setter(next);
				return;
			}
			const previousSync = syncFlush;
			const previousTransition = TRANSITION_DEPTH;
			const previousAction = ACTIVE_TRANSITION_ACTION_BATCH;
			syncFlush = true;
			TRANSITION_DEPTH = 0;
			ACTIVE_TRANSITION_ACTION_BATCH = null;
			try {
				setter(next);
				syncFlush = false;
				// The setter suppressed scheduling while it forced urgent priority.
				// If this owner was already waiting for a transition task, perform the
				// same per-owner upgrade an ordinary urgent setter would have made.
				if (block.pending && block.pendingMode === 'urgent' && TRANSITION_QUEUE.length !== 0)
					TRANSITION_TASK_DRIVER!.upgrade(block, 'urgent');
				flush();
			} finally {
				syncFlush = previousSync;
				TRANSITION_DEPTH = previousTransition;
				ACTIVE_TRANSITION_ACTION_BATCH = previousAction;
			}
		};
		COMMITTED_STATE_SETTERS.set(setter, committed);
	}
	return [state.queue === null ? state.value : foldHookQueue(state, null), setter, committed];
}

/** Both tuple forms consume the same resolved cell without a second hook lookup. */
export function readStateHook<T>(
	initial: T | (() => T) | undefined,
	slot: HookSlot | undefined,
	loneArgument: boolean,
): StateSlot<T> {
	// Compiled base calls supply the slot separately, padding omitted initial
	// values with undefined. Manual providers retain the legacy lone-slot form;
	// automatic aliases (including bound/forwarding functions) receive authored
	// args, so their lone Symbol is an initial value. An explicit second argument
	// also stays unambiguous when a binding forwards undefined.
	if (
		slot === undefined &&
		typeof initial === 'symbol' &&
		loneArgument &&
		(slotStack.length === 0 || (MANUAL_HOOK_DRIVER && MANUAL_HOOK_DRIVER.active))
	) {
		slot = initial as unknown as symbol;
		initial = undefined as T;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useState');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as StateSlot<T> | undefined;
	if (s === undefined) {
		const initVal = typeof initial === 'function' ? (initial as () => T)() : (initial as T);
		s = {
			value: initVal,
			base: initVal,
			queue: null,
			last: null,
			stamp: 0,
			at: 0,
			setter: (next) => {
				if (block.disposed) return;
				const cell = s!;
				// The idle eager path: compute now, bail when equal, and write an urgent
				// value directly. Once work is queued, a functional update must observe
				// the next render's inputs instead.
				if (cell.queue === null && !(block.pending && typeof next === 'function')) {
					let computed: T;
					try {
						computed = typeof next === 'function' ? (next as (p: T) => T)(cell.value) : next;
					} catch {
						// An eager computation is only an optimization. Retry a failure in
						// render so the component's error boundary owns the exception.
						queueHookUpdate(
							cell,
							block,
							transitionActionBatchForUpdate(block),
							next,
							'state',
							slot,
						);
						return;
					}
					// Select after evaluating the updater: user code can open an Action.
					// A handler or flushSync outside any Action selects none (inline).
					const batch =
						ACTIVE_TRANSITION_ACTION_BATCH === null && (_dispatchDepth > 0 || syncFlush)
							? null
							: transitionActionBatchForUpdate(block);
					if (Object.is(computed, cell.value)) return;
					if (batch === null) {
						if (collectingRefStateUpdates && REF_CALLBACK_DEPTH > 0) {
							const updates = (refStateUpdates ??= new Map());
							const state = cell as StateSlot<unknown>;
							if (!updates.has(state)) {
								const update: RefStateUpdate = { block, previous: cell.value };
								if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
									update.profileSlot = slot;
								updates.set(state, update);
							}
							cell.value = computed;
							return;
						}
						if (CURRENT_BLOCK === block) captureRenderPhaseUpdate(cell);
						cell.value = computed;
						if (
							!block.disposed &&
							typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
							__OCTANE_PROFILE_ENABLED__
						)
							__profileSchedule(block, 'state', slot);
						scheduleRender(block);
						if (TRANSITION_HOLDERS !== null && TRANSITION_HOLDERS.size !== 0)
							markRootUpdated(block);
						return;
					}
					queueHookUpdate(cell, block, batch, next, 'state', slot);
					return;
				}
				queueHookUpdate(cell, block, transitionActionBatchForUpdate(block), next, 'state', slot);
			},
			getter: undefined,
		};
		ensureHooks(scope).set(slot, s);
	}
	return s;
}

// Development only: consecutive unequal measurements per snapshot cell within
// one nested-update chain. A snapshot that settles between passes resets its count.
export let LAYOUT_SNAPSHOT_CHANGES: WeakMap<object, { chain: number; count: number }> | null = null;

export function countLayoutSnapshotChange(cell: object, block: Block): void {
	const changes = (LAYOUT_SNAPSHOT_CHANGES ??= new WeakMap());
	let record = changes.get(cell);
	if (record === undefined || record.chain !== NESTED_UPDATE_CHAIN_ID) {
		record = { chain: NESTED_UPDATE_CHAIN_ID, count: 0 };
		changes.set(cell, record);
	}
	// Name the hook only once it has changed on every pass that could have spent
	// the nested-update budget. The generic depth error reports it.
	if (++record.count === NESTED_UPDATE_LIMIT) {
		const source = componentSourceLoc(block.body);
		(UPDATE_DEPTH_CAUSES ??= new WeakMap()).set(block, {
			cell,
			chain: NESTED_UPDATE_CHAIN_ID,
			message: `useLayoutSnapshot in ${componentName(block)}${source ? ` (${source})` : ''} did not converge.`,
		});
	}
}

/**
 * React 18+ `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`.
 *
 * Mirrors React's contract: subscribe is called on mount with an
 * `onStoreChange` callback; the returned function unsubscribes on unmount
 * (and on subscribe identity change). `getSnapshot()` is called on every
 * render to return the current snapshot. When the store calls
 * `onStoreChange`, the component re-renders and `getSnapshot()` runs again.
 *
 * `getServerSnapshot` IS used: on the server it supplies the SSR snapshot, and
 * during client hydration the first read uses it (see below) so the adopted DOM
 * matches the server value before the commit-time store-sync reconciles any
 * client/server difference. Client-only builds discard the capability method
 * that supplies this state.
 *
 * Implementation. A single identity-stable `inst` cell (StoreInst) holds the
 * last-COMMITTED snapshot, the latest getSnapshot, the block's forceUpdate, and a
 * stable onStoreChange handler. Two derived sub-slots host it: `<slot>:uses:inst`
 * (the cell, in the hooks map) and `<slot>:uses:effect` (the passive subscribe
 * effect). The value-sync that reconciles the render-read snapshot at commit does
 * NOT go through a layout effect — it rides the dedicated, sort-free
 * `storeSyncQueue` (drainStoreSyncs, run after the layout phase). Two payoffs:
 *
 *  1. The commit-sync entry carries no cleanup and never reorders, so the generic
 *     effect machinery (deps compare, PendingEffect alloc, post-order sort,
 *     per-entry cleanup/finalizer bookkeeping) is skipped for it.
 *  2. The enqueue is GATED: a re-render whose snapshot is Object.is-unchanged (and
 *     whose store wasn't swapped) enqueues NOTHING, even with a fresh inline
 *     getSnapshot every render (the dominant zustand/query pattern). getSnapshot is
 *     refreshed in RENDER instead of at commit, so onStoreChange always dedups
 *     against the freshest read while unchanged renders stay allocation-free.
 *
 * DIVERGENCE FROM REACT (documented in docs/react-parity-migration-plan.md):
 * React's updateSyncExternalStore re-pushes updateStoreInstance whenever
 * `inst.getSnapshot !== getSnapshot`, giving a commit-time snapshot re-read even
 * when the value was unchanged. We drop that: a store that mutates WITHOUT
 * notifying in the render→commit window is no longer caught on a render where ONLY
 * getSnapshot identity changed. Octane's synchronous renderer closes React's
 * motivating concurrent-interleaving window, and any store that actually notifies
 * is unaffected (onStoreChange uses the render-fresh getSnapshot).
 */
/** External stores expose one live snapshot; their writes cannot be deferred. */
function scheduleStoreRender(block: Block): void {
	const depth = TRANSITION_DEPTH;
	const asyncCount = ASYNC_TRANSITION_COUNT;
	TRANSITION_DEPTH = 0;
	ASYNC_TRANSITION_COUNT = 0;
	try {
		scheduleRender(block);
	} finally {
		TRANSITION_DEPTH = depth;
		ASYNC_TRANSITION_COUNT = asyncCount;
	}
}

let DID_WARN_UNCACHED_SNAPSHOT = false;

export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot?: () => T,
	slot?: HookSlot,
): T;
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	serverSnapshotOrSlot: (() => T) | HookSlot | undefined = undefined,
	lastSlot?: HookSlot,
): T {
	// React-19 shape: `useSyncExternalStore(subscribe, getSnapshot,
	// getServerSnapshot?)`. The compiler appends the hook slot as the
	// LAST argument. Count arguments, including an explicitly passed undefined,
	// to distinguish an authored server snapshot from the trailing slot without
	// materializing a rest array on every render.
	const count = arguments.length;
	let slot = (count > 4 ? arguments[count - 1] : count === 4 ? lastSlot : serverSnapshotOrSlot) as
		HookSlot | undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useSyncExternalStore');
	const getServerSnapshot = count >= 4 ? (serverSnapshotOrSlot as () => T) : undefined;
	const subs = usesSubslots(slot);

	// Fresh read on every render — the anti-tearing snapshot. DURING HYDRATION the
	// first read uses getServerSnapshot (if provided) so the adopted DOM matches the
	// server value; the commit-time store-sync then re-checks getSnapshot() and
	// forces an update if the client value differs (React's hydrate-then-sync).
	// The capability branch is inert, and its implementation is dropped, in client-only builds.
	const readSnapshot =
		hydrating && CURSOR !== null && getServerSnapshot !== undefined
			? getServerSnapshot
			: getSnapshot;
	const value = readSnapshot();
	if (
		process.env.NODE_ENV !== 'production' &&
		!DID_WARN_UNCACHED_SNAPSHOT &&
		!Object.is(value, readSnapshot())
	) {
		DID_WARN_UNCACHED_SNAPSHOT = true;
		console.error(
			'The ' +
				(readSnapshot === getSnapshot ? 'getSnapshot' : 'getServerSnapshot') +
				' result must be cached to avoid an infinite update loop.',
		);
	}

	const scope = CURRENT_SCOPE!;
	let inst = scope.hooks?.get(subs.inst) as StoreInst<T> | undefined;
	if (inst === undefined) {
		drainStoreSyncs = drainQueuedStoreSyncs;
		// MOUNT — create the stable cell once (useEffectEvent's mount-once pattern).
		// forceUpdate schedules the block directly (identical to a useState setter,
		// which also captures CURRENT_BLOCK at mount and calls scheduleRender —
		// disposed blocks no-op via scheduleRender's guard).
		const block = CURRENT_BLOCK!;
		const created: StoreInst<T> = {
			value,
			getSnapshot,
			pending: value,
			subscribe,
			effectDeps: null,
			forceUpdate:
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
					? () => {
							if (!block.disposed) __profileSchedule(block, 'external-store', slot);
							scheduleStoreRender(block);
						}
					: () => scheduleStoreRender(block),
			onStoreChange: () => {
				if (block.disposed) return;
				// An urgent, non-deferred render already queued for this owner will
				// read every reached store again. Repeated notifications in the same
				// task need not run selectors merely to rediscover that pending work.
				// Do not skip transition/deferred upgrades or render-phase diagnostics;
				// renderBlock also clears pending before the body, so a notification
				// after its snapshot read can still request a replay. Profiling and
				// unwrapped-act diagnostics retain the ordinary scheduling path.
				if (
					CURRENT_BLOCK === null &&
					block.pending &&
					block.pendingMode === 'urgent' &&
					!block.pendingDeferred &&
					!(typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) &&
					(process.env.NODE_ENV === 'production' ||
						!isActEnvironment() ||
						actScopeDepth !== 0 ||
						syncFlush)
				) {
					return;
				}
				if (checkStoreChanged(created)) created.forceUpdate();
			},
			block,
			queued: false,
		};
		inst = created;
		created.effectDeps = [created, subscribe];
		ensureHooks(scope).set(subs.inst, inst);
		// Always enqueue on mount: the first commit must run the tear check — for
		// hydrate-then-sync, and for any store mutation in the render→commit window.
		enqueueStoreSync(inst, value, subscribe);
	} else {
		// UPDATE — advance getSnapshot in RENDER (not at commit) so onStoreChange
		// dedups against the freshest read; this is what lets an unchanged snapshot
		// with an unstable inline getSnapshot enqueue nothing. Queue a commit-sync
		// ONLY when the read snapshot moved off the last-committed value, or the store
		// was swapped — an unchanged snapshot pushes nothing (the optimization).
		inst.getSnapshot = getSnapshot;
		if (!Object.is(value, inst.value) || subscribe !== inst.subscribe) {
			enqueueStoreSync(inst, value, subscribe);
		}
	}

	// Subscription lifecycle stays a real passive effect — it owns the unsubscribe
	// cleanup (re-subscribe on store swap, unsubscribe on unmount) a bare queue
	// entry can't carry. inst is identity-stable, so the deps `[inst, subscribe]`
	// fire exactly when the old `[subscribe]` deps did. Body is the module-level
	// deps-as-args fn (cast: EffectFn is nominally zero-arg, but the effect drain applies
	// the deps positionally — see subscribeToStore). Keep the pair immutable once
	// passed to the effect slot; a failed swap may leave this pointer on inst, but
	// the next render compares subscribe again before sharing it with useEffect.
	if (inst.effectDeps![1] !== subscribe) inst.effectDeps = [inst, subscribe];
	useEffect(subscribeToStore as unknown as EffectFn, inst.effectDeps!, subs.effect);

	return value;
}

/**
 * The speculative renderer owns scopes only until the early lease is accepted.
 * The attempt changed no server DOM, so its retry adopts afresh.
 */
export function discardHydratePresentation(state: HydrateSlot, capture: OffscreenCapture): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.ROLLBACK_HYDRATION);
	const refs: SuspenseRefEntry[] = [];
	collectVisibleSubtreeRefs(state.block, refs);
	discardOffscreenCapture(capture);
	for (const frame of capture.presentations ?? [])
		if (PRESENTATION_PREPARATIONS.get(frame.lease) === frame)
			PRESENTATION_PREPARATIONS.delete(frame.lease);
	// These scopes never acquired the visible DOM. In a new root transaction,
	// ordinary unmount(false) means deferred parent-owned deletion, not rollback.
	const previousRollback = ROOT_RENDER_ROLLBACK;
	ROOT_RENDER_ROLLBACK = true;
	try {
		withRefDetachSuppression(refs, () => resetScopeChildren(state.block, false));
	} finally {
		ROOT_RENDER_ROLLBACK = previousRollback;
	}
	state.block.mounted = false;
	state.block.deoptNode = null;
	state.hydrated = false;
	state.serverActivationStarted = false;
}
export let CURRENT_WARM: Map<HookSlot, WarmEntry[]> | null = null;
export let CURRENT_WARM_CLAIMS: Set<object> | null = null;
/** Flips true forever on first warm — gates useMemo's ancestor walk so apps
 * that never warm never pay for it. */
export let WARM_EVER = false;

// A real memo that executes while an ancestor warm plan is live represents one
// concrete component occurrence. Retain an unavailable entry for this episode
// so a later sibling's suspension does not speculatively refetch it. Repeated
// same-site instances intentionally append repeated entries; a warm walk claims
// them in traversal order.
export function recordRealWarmMemo(slot: HookSlot, deps: any[], source: MemoHookEntry): boolean {
	const block = CURRENT_BLOCK;
	if (block === null) return false;
	let owner: Block | null = null;
	for (let i = 0; i < ACTIVE_WARM_PLANS.length; i += 3) {
		const planBlock = ACTIVE_WARM_PLANS[i] as Block;
		if (!blockIsAncestor(planBlock, block)) continue;
		owner = planBlock;
		break;
	}
	if (owner === null) return false;
	const cache = warmCacheForOwner(owner);
	let list = cache.get(slot);
	if (list === undefined) {
		list = [];
		cache.set(slot, list);
	}
	const entry: WarmEntry = { deps, value: undefined, available: false, source };
	list.push(entry);
	source.warmRecord = entry;
	WARM_EVER = true;
	return true;
}

/** Activate every registered plan that encloses the throwing batch. The cache
 * lives on the outermost participating block, making warmed entries visible to
 * adjacent descendants as well as the source branch. */
export function runActiveWarmPlans(local?: () => void): void {
	const block = CURRENT_BLOCK!;
	// Render checkpoints restore the registration stack after nested renders.
	// Freeze its current end so a plan cannot activate newly registered work here.
	const end = ACTIVE_WARM_PLANS.length;
	let first = 0;
	let owner = block;
	for (; first < end; first += 3) {
		const planBlock = ACTIVE_WARM_PLANS[first] as Block;
		if (blockIsAncestor(planBlock, block)) {
			owner = planBlock;
			break;
		}
	}
	if (first === end && local === undefined) return;
	// Cache above adjacent siblings, reusing an enclosing owner's current cache.
	const cache = warmCacheForOwner(owner);
	WARM_EVER = true;
	const previous = CURRENT_WARM;
	const previousClaims = CURRENT_WARM_CLAIMS;
	CURRENT_WARM = cache;
	try {
		for (let i = first; i < end; i += 3) {
			if (i !== first && !blockIsAncestor(ACTIVE_WARM_PLANS[i] as Block, block)) continue;
			CURRENT_WARM_CLAIMS = new Set();
			try {
				(ACTIVE_WARM_PLANS[i + 1] as (props: any) => void)(ACTIVE_WARM_PLANS[i + 2]);
			} catch {
				// Each speculative plan is independent. One throwing getter or
				// creation must not prevent adjacent plans from warming.
			}
		}
		if (local !== undefined) {
			CURRENT_WARM_CLAIMS = new Set();
			try {
				local();
			} catch {
				// Speculative and independent from the registered ancestor plans.
			}
		}
	} catch {
		// Warming is speculative; failed bookkeeping must not break its render.
	} finally {
		CURRENT_WARM = previous;
		CURRENT_WARM_CLAIMS = previousClaims;
	}
}

export function publishNativeMemoEntry<T>(
	scope: Scope,
	slot: HookSlot,
	deps: any[] | undefined,
	value: T,
	witness: NativeReadWitness | null,
): T {
	publishMemoEntry(scope, slot, deps, value, witness);
	// A native creation can suspend on its own, without any descendant warm
	// plan. Opted-in first mounts use the same occurrence queue as warming;
	// ordinary useMemo and already-mounted scopes allocate nothing here.
	const entry = scope.hooks!.get(slot) as MemoHookEntry;
	if (!scope.mounted && deps !== undefined && entry.warmRecord === undefined) {
		let owner = CURRENT_BLOCK!;
		while (!owner.rare?.suspenseHandler && owner.parentBlock !== null) owner = owner.parentBlock;
		const cache = warmCacheForOwner(owner);
		let list = cache.get(slot);
		if (list === undefined) cache.set(slot, (list = []));
		const record: WarmEntry = { deps, value: undefined, available: false, source: entry };
		list.push(record);
		entry.warmRecord = record;
		entry.warmEpisode = CURRENT_WARM_EPISODE;
		WARM_EVER = true;
	}
	return value;
}

// Epoch of this task's first removed host root (retireEventHostTree); 0 when none
// is pending. Older stamps belong to nodes already detached and are ignored.
export let retiringHostsSince = 0;

/**
 * Take a subtree that a committed deletion is about to detach out of delegated
 * dispatch. Detaching a focused host dispatches focusout synchronously, and so
 * does a deletion cleanup that moves focus, so a deletion stamps the top-level
 * nodes it detaches before any of its cleanups run: a host below a stamp starts
 * no handler, whichever component owns it. Every stamped node is detached
 * within the same task, so the stamp only needs to outlive the task.
 */
export function retireEventHostTree(node: Node): void {
	(node as any).$$retiredEpoch = ++eventRootEpoch;
	if (retiringHostsSince === 0) {
		retiringHostsSince = eventRootEpoch;
		// A commit detaches what it retires before it ends, and resets the epoch
		// then (commitRootRenders); a retirement outside one lasts its task.
		if (COMMITTING_OWNER === null)
			queueMicrotask(() => {
				retiringHostsSince = 0;
			});
	}
}
export let portalEventTargetCount = 0;
export let eventRootEpoch = 0;

export function changeEventRootMembership(target: Node, delta: number): void {
	const previous = _eventRoots.get(target);
	_eventRoots.set(target, {
		count: (previous?.count || 0) + delta,
		since: ++eventRootEpoch,
		previous,
	});
	if (previous !== undefined) {
		// A native event keeps its original route even if a handler unmounts or
		// remounts a root. Retain membership history through this native delivery,
		// then release it. Only root lifecycle changes allocate/schedule here;
		// events retain a number, never a snapshot holding root DOM nodes alive.
		setTimeout(() => {
			const current = _eventRoots.get(target);
			if (current !== undefined) current.previous = undefined;
		}, 0);
	}
}

export function registerPortalEventRange(target: Node, portal: PortalSlot): void {
	installPortalEvents();
	let ranges = _portalEventRanges.get(target);
	if (ranges === undefined) {
		ranges = new Set();
		_portalEventRanges.set(target, ranges);
		portalEventTargetCount++;
		eventRootEpoch++;
	}
	ranges.add(portal);
	(portal.start as PortalEventBoundary).$$portalEventRange = portal;
	(portal.end as PortalEventBoundary).$$portalEventStart = portal.start as PortalEventBoundary;
}

export function unregisterPortalEventRange(target: Node, portal: PortalSlot): void {
	const start = portal.start as PortalEventBoundary | null;
	const end = portal.end as PortalEventBoundary | null;
	// Clear, never `delete`: deleting an expando from a DOM wrapper drops it into
	// dictionary mode (a fresh property dictionary per marker, every teardown).
	// resolvePortalEventOwner reads both fields with `!== undefined`.
	if (start?.$$portalEventRange === portal) start.$$portalEventRange = undefined;
	if (end?.$$portalEventStart === start) end.$$portalEventStart = undefined;
	const ranges = _portalEventRanges.get(target);
	if (ranges === undefined) return;
	ranges.delete(portal);
	if (ranges.size === 0) {
		_portalEventRanges.delete(target);
		portalEventTargetCount--;
		eventRootEpoch++;
	}
}

export function endDetachedBoundaryRender(frame: RootRenderFrame | null): void {
	if (frame === null) return;
	endRootRender(frame);
	// A catch reached from deletion cleanup can open a new transaction during
	// the flush. Finish its teardown before the interrupted commit publishes refs
	// or effects from the now-abandoned replacement.
	if (ROOT_RENDER_TRANSACTION === null) commitRootRenders();
	// A timeout or passive error can enter without any scheduled Block. Its
	// captured ref/effect work still needs the existing commit drain to run. A
	// held drain's commit runs that work itself.
	if (!syncFlush && !scheduled && !HOLDING_ROOT_COMMITS) {
		scheduled = true;
		queueMicrotask(flush);
	}
}

export function runTransition(fn: () => void | Promise<unknown>, hook?: TransitionHookSlot): void {
	// Install the optional off-screen swap graph before any listener or user
	// update can observe transition priority.
	ensureTransitionDrivers();
	// Bump the priority flag FIRST so any scheduleRender calls fired by the
	// listener notification (and by fn itself) are tagged as transition.
	TRANSITION_DEPTH++;
	const parentActionBatch = ACTIVE_TRANSITION_ACTION_BATCH;
	const pendingActionBatch = IN_FLIGHT_TRANSITION_ACTION_BATCH;
	const actionBatch = parentActionBatch ?? pendingActionBatch ?? createTransitionActionBatch();
	const ownsActionBatch = parentActionBatch === null && pendingActionBatch === null;
	ACTIVE_TRANSITION_ACTION_BATCH = actionBatch;
	if (hook !== undefined) {
		addTransitionHookToBatch(actionBatch, hook);
		publishTransitionHookBatch(actionBatch);
	}
	// A transition started synchronously during a form's submit dispatch
	// entangles with that form's status (manual-action useFormStatus activation —
	// see publishManualFormPending). Registered here; every settle path below
	// notifies the record exactly once.
	const submitRec = ACTIVE_SUBMIT_DISPATCH;
	if (submitRec !== null) {
		if (publishManualFormPending === noop) installManualFormPending();
		submitRec.transitions++;
	}
	let result: unknown;
	try {
		tickTransitionCount(+1);
		try {
			result = fn();
			if (result != null && typeof (result as { then?: unknown }).then === 'function') {
				actionBatch.pendingActions++;
				IN_FLIGHT_TRANSITION_ACTION_BATCH = actionBatch;
			}
			if (ownsActionBatch) {
				actionBatch.closed = true;
				flushTransitionActionBatchIfReady(actionBatch);
			}
		} catch (error) {
			if (ownsActionBatch) {
				actionBatch.closed = true;
				flushTransitionActionBatchIfReady(actionBatch);
			}
			throw error;
		} finally {
			ACTIVE_TRANSITION_ACTION_BATCH = parentActionBatch;
			TRANSITION_DEPTH--;
		}
	} catch (err) {
		tickTransitionCount(-1);
		if (submitRec !== null) settleSubmitTransition(submitRec);
		// Don't strand resets queued before the throw — they'd fire on an unrelated
		// later transition's settle otherwise. (flushFormResets self-guards if an
		// outer transition window is still open.)
		flushFormResets();
		actionBatch.workComplete = true;
		finishTransitionHookBatch(actionBatch);
		reportTransitionError(err, hook);
		return;
	}
	if (result != null && typeof (result as { then?: unknown }).then === 'function') {
		// React 19 Actions parity: an async callback returns a promise. Keep the
		// transition pending until that promise settles — the awaited
		// continuation (and any setters after `await`) resumes on a later
		// microtask, AFTER a fixed queueMicrotask decrement would have already
		// dropped isPending. Decrement exactly once on settle (fulfil OR reject).
		// ASYNC_TRANSITION_COUNT stays elevated across the same window so setters
		// fired after the `await` schedule at transition priority (TRANSITION_DEPTH
		// is already 0 by then — the synchronous slice has returned).
		ASYNC_TRANSITION_COUNT++;
		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			actionBatch.pendingActions--;
			flushTransitionActionBatchIfReady(actionBatch);
			// Notify pending listeners while the async priority window is still
			// active, so their render cannot upgrade the just-promoted Action batch
			// to urgent before a suspending transition render gets to hold its DOM.
			tickTransitionCount(-1);
			ASYNC_TRANSITION_COUNT--;
			if (submitRec !== null) settleSubmitTransition(submitRec);
			// The action window (may have) closed — apply queued requestFormReset()s.
			flushFormResets();
			// isPending falls with the render of the Action's promoted updates.
			queueTransitionFall(actionBatch, undefined);
		};
		(result as Promise<unknown>).then(settle, (error) => {
			settle();
			reportTransitionError(error, hook);
		});
	} else {
		// Synchronous callback: decrement once the drain that renders the queued
		// work this transition produced has decided its holds — a render that held
		// the transition open by suspending incremented the count itself via
		// handleSuspense, so the net count stays > 0 (settleTransitionFalls).
		queueTransitionFall(actionBatch, submitRec);
	}
}

export function useTransition(
	slot?: HookSlot,
): [boolean, (fn: () => void | Promise<unknown>) => void];
export function useTransition(
	slot?: HookSlot,
): [boolean, (fn: () => void | Promise<unknown>) => void] {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useTransition');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as TransitionHookSlot | undefined;
	if (s === undefined) {
		const hook: TransitionHookSlot = {
			isPending: false,
			block,
			pendingBatches: 0,
			tentative: false,
			start: (fn) => {
				if (!block.disposed) runTransition(fn, hook);
			},
			publish: (pending) => {
				hook.tentative = false;
				if (hook.isPending === pending || block.disposed) return;
				hook.isPending = pending;
				TRANSITION_LISTENER_PUBLISH_DEPTH++;
				try {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'transition-pending', slot);
					// The rising edge is a pending cue; the falling edge is transition work.
					if (pending) markTransitionCue(block);
					scheduleRender(block, false, pending);
				} finally {
					TRANSITION_LISTENER_PUBLISH_DEPTH--;
				}
			},
		};
		s = hook;
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			hook.profileSlot = slot;
		ensureHooks(scope).set(slot, hook);
		// An in-flight batch keeps referencing an unmounted hook until it
		// finishes; publish() ignores a disposed block, and the batch releases the
		// reference when its Action settles. No unmount-time cleanup is needed.
	}
	if (s.error !== undefined) {
		const error = s.error.value;
		s.error = undefined;
		throw error;
	}
	return [s.isPending, s.start];
}

/**
 * Slots whose deferred swap waits for the posted host task, or null when none
 * is queued (spawnDeferredSwap). Async act() keeps draining while it is set.
 */
let DEFERRED_SWAPS: Array<DeferredSlot<any>> | null = null;

/**
 * Schedule the deferred current→next swap in a later host task (#1864). A
 * microtask swap shared the urgent commit's checkpoint, so the browser could
 * neither paint that commit nor deliver the next keystroke before the
 * expensive deferred render. The post is armed from a microtask, after the
 * spawning commit and its layout effects, so the swap queues behind any task
 * that commit posted, as React's Scheduler task does. Urgent renders before
 * the task only retarget `s.next`: a fast typist's skipped values never render
 * deferred.
 *
 * The task does not make the deferred render interruptible. Once it starts it
 * renders and commits to completion (there is no time-slicing), so input that
 * arrives during it waits. The re-render runs at transition priority and won't
 * tear down the prior DOM if the swapped-in value suspends. DEFERRED_SPAWN
 * tags the pass as a DEFERRED render (Block.pendingDeferred) so a
 * useDeferredValue mounting inside it adopts its final value directly instead
 * of waterfalling its own preview (React: only the first level defers).
 */
export function spawnDeferredSwap<T>(s: DeferredSlot<T>): void {
	s.scheduled = true;
	if (DEFERRED_SWAPS !== null) {
		DEFERRED_SWAPS.push(s);
		return;
	}
	DEFERRED_SWAPS = [s];
	queueMicrotask(postDeferredSwaps);
}

export function runDeferredSwaps(): void {
	const slots = DEFERRED_SWAPS;
	DEFERRED_SWAPS = null;
	if (slots === null) return;
	// Every swap schedules its render here, so they all join the one flush
	// that ends this task rather than posting another.
	TRANSITION_TASK_ACTIVE = true;
	try {
		for (let i = 0; i < slots.length; i++) swapDeferredValue(slots[i]);
	} finally {
		TRANSITION_TASK_ACTIVE = false;
	}
}

function swapDeferredValue<T>(s: DeferredSlot<T>): void {
	// A slot that unmounted, or whose spawning render was rolled back, since
	// the spawn has nothing to swap. A duplicate entry finds `scheduled` clear.
	if (!s.scheduled || s.block.disposed) return;
	s.scheduled = false;
	if (Object.is(s.value, s.next)) return;
	// Set the flag INSIDE the callback so it wraps only the scheduleRender
	// for the deferred block: startTransition synchronously notifies
	// useTransition listeners (tickTransitionCount) BEFORE running fn, and
	// those listeners scheduleRender their own blocks — which must NOT be
	// tagged as deferred passes.
	startTransition(() => {
		DEFERRED_SPAWN = true;
		try {
			// A hold of this transition renders the swap again when it retries.
			const batch = ACTIVE_TRANSITION_ACTION_BATCH!;
			noteTransitionBlock(rootTransitionBatch(batch), s.block);
			s.swap = batch;
			s.swapValue = s.next;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
				__profileSchedule(s.block, 'deferred-value', s.profileSlot);
				scheduleRender(s.block);
			} else scheduleRender(s.block);
		} finally {
			DEFERRED_SPAWN = false;
		}
	});
}

/** Disconnect the committed identities, including refs replaced by this render. */
export function hideActivityRefs(activity: ActivitySlot): void {
	if (!activity.hasRefs) return;
	const block = activity.block!;
	const state = activityRefState!;
	const refs: SuspenseRefEntry[] = [];
	// A render can clear a ref prop before disappearance commits. Include its
	// still-connected identity even when the current manifest now says null.
	collectVisibleSubtreeRefs(block, refs, state);
	for (const entry of refs) {
		if (blockSubtreeDisposed(entry.scope.block)) continue;
		let record = state.get(entry.el);
		if (record === undefined) {
			record = { connected: null, hidden: false };
			state.set(entry.el, record);
		}
		const connected = record.connected;
		// Publish hidden ownership before invoking user code: a cleanup may
		// synchronously unmount this tree or an independent root.
		record.hidden = true;
		if (connected !== null) {
			try {
				REF_CALLBACK_DEPTH++;
				try {
					attachRef(connected, null, entry.el);
				} finally {
					REF_CALLBACK_DEPTH--;
				}
			} catch (err) {
				if (err instanceof MaximumUpdateDepthError) throw err;
				const handler = findTryHandler(entry.scope.block);
				if (handler !== null) {
					reportCaughtError(entry.scope.block, err, handler(err));
				} else if (!reportUncaughtError(entry.scope.block, err)) console.error(err);
			}
		}
	}
	discardSubtreeRefAttaches(block);
}

// Shared Root factory behind both `createRoot` and `hydrateRoot`. The
// `rootBlock`/`currentBody` parameters are the live state captured by the
// returned closures: `createRoot` starts them `null` (the block is created
// lazily on the first `.render()`), while `hydrateRoot` passes in the
// already-hydrated block + its body so the FIRST post-hydration `.render()`
// with the SAME component hits the same-body fast path (props update) and never
// wipes the adopted server DOM. This factory NEVER touches the hydration-only
// capability state — that runs once, inside `hydrateRoot`. Keeping that state out
// of this shared factory preserves client-only dead-code elimination.
export function makeRoot(
	container: RootContainer,
	rootBlock: Block | null,
	currentBody: ComponentBody | null,
	currentKey: any,
	idState: RootIdState,
	outputHandler: OutputHandler | null,
	ownerToken: object | null,
	signalOwner: SignalOwner | undefined,
	errorOptions?: RootOptions,
): Root {
	let root!: Root;
	let unmounted = false;
	let nestedRootRenderChain = -1;
	let nestedRootRenderCount = 0;
	const registerRootDisposer = (block: Block): void => {
		let disposing = false;
		DOM_ROOT_DISPOSERS.set(block, () => {
			if (disposing || rootBlock !== block) return;
			disposing = true;
			try {
				root.unmount();
			} finally {
				disposing = false;
			}
		});
	};
	const renderOwner: RootRenderOwner = {
		current: rootBlock,
		signalOwner,
		retry: noop,
		request: null,
		generation: 0,
		wakeable: null,
		retryKey: null,
		transaction: null,
		disposed: false,
		spareOps: [],
	};
	idState.renderOwner = renderOwner;
	const renderResolved = (
		body: ComponentBody,
		props: any,
		nextKey: any,
		mode?: 'urgent' | 'transition',
	): void => {
		if (unmounted) return;
		// Root render entry can carry contexts bumped outside provideContext —
		// react-hosted mirrors publish version bumps between React commits, then
		// commit through root.render → this path. Advance the shared epoch so the
		// $$ctxDepsEpoch fast path can never mask those stale recorded versions.
		// ponytail: process-global catch-all — every root.render stales all stamps
		// and defeats compilerCacheContext's previous===current guard for one
		// rescan cycle, even with no context change (react islands pay it per
		// commit). Upgrade: bump at the publish site (react/index.ts) so the
		// epoch tracks only real bumps; kept here because src/react is out of
		// scope and the catch-all also covers unknown external bumpers.
		bumpContextEpoch();
		// Same component as the live root (incl. a just-hydrated root): update
		// props in place and schedule. This is a NORMAL client render — `hydrating`
		// is already false, so renderBlock reuses the adopted DOM, not rebuilds it.
		if (
			rootBlock &&
			!rootBlock.disposed &&
			currentBody === body &&
			Object.is(currentKey, nextKey)
		) {
			const block = rootBlock;
			renderOwner.request = (renderMode) => {
				renderOwner.transaction!.rootRequest = true;
				const previousProps = block.props;
				if (previousProps !== props) journalRootProperty(block, 'props', previousProps);
				block.props = props;
				block.pendingMode = renderMode;
				renderBlock(block);
			};
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileSchedule(rootBlock, 'root-render');
			scheduleRender(rootBlock);
			return;
		}
		if (
			mode === undefined &&
			rootBlock !== null &&
			!rootBlock.disposed &&
			(TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0)
		) {
			renderOwner.request = (nextMode) => renderResolved(body, props, nextKey, nextMode);
			scheduleRender(rootBlock);
			return;
		}
		// A direct synchronous mount/replacement mutates before the scheduler's
		// commit guard. Finish any earlier deferred layout while its DOM is intact.
		// Transition-priority requests remain queued and retain their own capture.
		if (
			!inFlush &&
			CURRENT_BLOCK === null &&
			mode === undefined &&
			TRANSITION_DEPTH === 0 &&
			ASYNC_TRANSITION_COUNT === 0
		) {
			if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.interrupt();
			if (unmounted) return;
		}
		let frame = beginRootRender(renderOwner);
		renderOwner.transaction!.rootRequest = true;
		const previousRoot = rootBlock;
		const previousBody = currentBody;
		const previousKey = currentKey;
		const staged =
			container.nodeType !== 9 &&
			previousRoot !== null &&
			previousRoot.mounted &&
			!previousRoot.disposed &&
			!isCreatedInRootRender(renderOwner.transaction!, previousRoot);
		const oldFirst = staged ? getFirstChild(container) : null;
		const oldLast = staged ? container.lastChild : null;
		journalUndo(() => {
			rootBlock = previousRoot;
			currentBody = previousBody;
			currentKey = previousKey;
			renderOwner.current = previousRoot;
			if (previousRoot !== null) registerRootDisposer(previousRoot);
		});
		try {
			if (rootBlock) {
				DOM_ROOT_DISPOSERS.delete(rootBlock);
				if (!staged) unmountBlock(rootBlock);
				rootBlock = null;
				currentBody = null;
				currentKey = null;
			}
			let start: Comment | null = null;
			let end: Comment | null = null;
			// A mount builds off-document and lands at its commit as one insert: at
			// once for a synchronous mount, with a later commit for one inside a
			// render, a commit callback or a transition. The container's previous
			// content still leaves first.
			let frontier: SlotNext | null = null;
			if (staged) {
				// A genuine root identity change mounts once beside the outgoing
				// screen, built off-document: its commit inserts it after the outgoing
				// screen, whose focused hosts stay connected until then.
				start = document.createComment('root');
				end = document.createComment('/root');
				frontier = (queueFrontier(null, container, null) as any).$$next as SlotNext;
				frontier.frag!.append(start, end);
			} else if (renderOwner.hydrationFallback !== undefined) {
				frontier = renderOwner.hydrationFallback(false);
			} else {
				// A client root builds off-document, a document container included,
				// even while another root hydrates around it (its Blocks render with
				// that adoption suspended).
				frontier = (queueFrontier(null, container, null) as any).$$next as SlotNext;
				// The container's previous content leaves as the mount lands, all but
				// a document's doctype (clearRootContainer).
				frontier.out.push(() => clearRootContainer(container), null, null);
			}
			rootBlock = createBlock(
				'root',
				null,
				frontier === null ? container : frontier.frag!,
				start,
				end,
				body,
				props,
				undefined,
				outputHandler,
			);
			if (frontier !== null) {
				frontier.owner = rootBlock;
				noteFrontierMember(frontier.frag!, rootBlock);
			}
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileTrackComponent(rootBlock, body);
			rootBlock.idState = idState;
			renderOwner.current = rootBlock;
			createdInRootRender(rootBlock);
			if (registerRootOptions) registerRootOptions(rootBlock, errorOptions);
			registerRootDisposer(rootBlock);
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
				__devtoolsSetNameResolver(inspectDevtoolsName);
				__devtoolsSetChildWalker(inspectDevtoolsChildScopes);
				__devtoolsRegisterRoot(
					rootBlock as unknown as import('../devtools-hook.js').DevtoolsScopeLike,
				);
			}
			currentBody = body;
			currentKey = nextKey;
			// React parity: render() inside a transition never commits synchronously
			// — schedule at transition priority so the commit is view-transition-
			// wrappable (boundaries mounting WITH the initial content enter-animate,
			// e.g. a Suspense fallback appearing under a <ViewTransition>).
			if (mode === undefined && (TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0)) {
				rootBlock.pending = true;
				// A renderer event commits its implicit Action-window mount at the
				// listener boundary; an explicit transition still owns its task.
				rootBlock.pendingMode =
					TRANSITION_DEPTH === 0 && RENDERER_DISCRETE_EVENT_DEPTH > 0 ? 'urgent' : 'transition';
				if (
					TRANSITION_TASK_DRIVER &&
					rootBlock.pendingMode === 'transition' &&
					TRANSITION_TASK_DRIVER.queue(rootBlock)
				)
					return;
				QUEUE.push(rootBlock);
				if (!syncFlush && !scheduled) {
					scheduled = true;
					queueMicrotask(flush);
				}
				return;
			}
			const mountedRoot = rootBlock;
			mountedRoot.pendingMode = mode ?? null;
			try {
				renderBlock(mountedRoot);
				// Mount-time self-updates are part of this first commit. Replay before
				// queued effects can publish the discarded initial state.
				if (QUEUE.length > 0) drainHydrationRenderPhaseUpdates(mountedRoot);
				if (process.env.NODE_ENV !== 'production') {
					validateRootHtmlNesting(container, body, frontier?.frag ?? container);
				}
			} catch (error) {
				let failed = false;
				try {
					handleRenderError(mountedRoot, error);
				} catch (unhandled) {
					failed = true;
					error = unhandled;
					const transaction = renderOwner.transaction;
					if (transaction !== null) rollbackRootRender(transaction);
					// Match the scheduled-render failure path: discard the failed tree
					// before surfacing the error, but keep the public root reusable for a
					// later recovery render. In particular, effects registered before the
					// throw belong to an aborted render and must never reach a later flush.
					// A root created with onUncaughtError consumes its own report here
					// too — the synchronous first mount is still "the flush" for this
					// render, so the option must not behave differently from a scheduled
					// render's unhandled error.
					if (rootBlock !== null && !rootBlock.disposed) unmountBlock(rootBlock);
				}
				// The render closes before the root releases the DOM it leaves:
				// rendering writes none.
				endRootRender(frame);
				frame = null;
				if (!failed) {
					if (renderOwner.wakeable === null) root.unmount();
					return;
				}
				renderOwner.hydrationFallback?.(true);
				if (!reportUncaughtError(mountedRoot, error)) throw error;
				return;
			}
			if (staged) {
				retireRootBlock(previousRoot!);
				queueRootDeletion(previousRoot, oldFirst, oldLast);
			}
			// First render commits effects on next microtask flush.
			if (!syncFlush && !scheduled) {
				scheduled = true;
				queueMicrotask(flush);
			}
		} finally {
			endRootRender(frame);
			if (ROOT_RENDER_TRANSACTION === null) {
				if (!inFlush) commitRootRenders();
				// A mount from a commit callback lands with the flush's next commit,
				// unless a deferred layout holds that flush: then it lands now.
				else if (
					DEFERRED_LAYOUT_DRIVER &&
					DEFERRED_LAYOUT_DRIVER.holdsPendingQueue() &&
					renderOwner.transaction !== null
				)
					commitRootAlone(renderOwner.transaction);
			}
		}
	};
	root = {
		render(bodyOrElement: unknown, props?: any) {
			if (unmounted) throw new Error(formatClientError(29));
			if (
				!inFlush &&
				CURRENT_BLOCK === null &&
				!inNestedUpdateCallback() &&
				TRANSITION_DEPTH === 0 &&
				ASYNC_TRANSITION_COUNT === 0
			) {
				if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.interrupt();
				if (unmounted) return;
			}
			if (inNestedUpdateCallback() || CURRENT_BLOCK !== null) {
				if (nestedRootRenderChain !== UPDATE_CHAIN_ID) {
					nestedRootRenderChain = UPDATE_CHAIN_ID;
					nestedRootRenderCount = 0;
				}
				if (++nestedRootRenderCount > NESTED_UPDATE_LIMIT) {
					// Surface the failure through the ordinary render-error path on the
					// next drain. Throwing directly here could be swallowed by effect
					// error routing or unwind an active render replacement half-finished.
					if (rootBlock !== null && !rootBlock.disposed) {
						blockRare(rootBlock).updateError = true;
						scheduleRender(rootBlock);
					}
					return;
				}
			} else {
				UPDATE_CHAIN_ID++;
				NESTED_UPDATE_CHAIN_ID++;
				nestedRootRenderChain = UPDATE_CHAIN_ID;
				nestedRootRenderCount = 0;
			}
			// React-style `render(<App foo={x}/>)` arrives as an element descriptor:
			// unwrap to (type, props). The `render(body, props)` form passes through.
			let body: ComponentBody;
			let nextKey: any = null;
			if (isElementDescriptor(bodyOrElement)) {
				if (arguments.length > 1) warnRootRenderSecondArgument(props, container);
				nextKey = bodyOrElement.key ?? null;
				if (typeof bodyOrElement.type === 'function') {
					body = bodyOrElement.type as ComponentBody;
					props = bodyOrElement.props;
				} else {
					// Host JSX at a root is a normal React renderable. Feed the whole
					// descriptor to the return-value reconciler instead of calling its tag.
					body = ROOT_RENDERABLE_BODY;
					props = bodyOrElement;
				}
			} else if (typeof bodyOrElement === 'function') {
				// OCTANE API: a compiled component body plus props is a supported root
				// overload, unlike React where a bare function is an invalid child.
				body = bodyOrElement as ComponentBody;
			} else {
				body = ROOT_RENDERABLE_BODY;
				if (typeof bodyOrElement === 'symbol') {
					if (process.env.NODE_ENV !== 'production') {
						console.error(
							`Symbols are not valid as an Octane child.\n  root.render(${String(bodyOrElement)})`,
						);
					}
					props = null;
				} else {
					props = bodyOrElement;
				}
			}
			// A same-component props refresh can update the retained screen while
			// its state transition still waits. Keep that wakeup, but retry it using
			// the new props below. Identity changes discard the old held state.
			const keepTransition =
				TRANSITION_HOLDERS?.has(renderOwner) === true &&
				rootBlock !== null &&
				!rootBlock.disposed &&
				currentBody === body &&
				Object.is(currentKey, nextKey);
			if (!keepTransition) {
				if (TRANSITION_ROOT_DRIVER) TRANSITION_ROOT_DRIVER.discard(renderOwner);
				renderOwner.generation++;
				renderOwner.wakeable = null;
			}
			if (
				rootBlock !== null &&
				!rootBlock.disposed &&
				currentBody === body &&
				Object.is(currentKey, nextKey)
			) {
				// A same-component request supersedes retry generations without
				// invalidating a prepared commit for that still-current root.
				// Identity replacements and unmounts never refresh its receipt.
				if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.refreshPendingOwner(renderOwner);
				if (COMMITTING_OWNER === renderOwner) COMMITTING_GENERATION = renderOwner.generation;
			}
			renderOwner.nativeRetry?.clear();
			if (renderOwner.retrySignalOwners !== undefined) clearSignalRetryOwners(renderOwner);
			renderOwner.retryKey = null;
			renderOwner.request = null;
			if (renderOwner.transaction?.aborted === true) renderOwner.transaction = null;
			renderOwner.retry = () => renderResolved(body, props, nextKey);
			renderResolved(body, props, nextKey);
		},
		unmount() {
			if (arguments.length > 0) warnRootUnmountArgument();
			if (unmounted) return;
			// Interrupting a deferred native update can publish it synchronously.
			// An explicit unmount must not first accept a speculative early takeover.
			// Only a hydrateRoot root holds leases.
			const presentationRefs =
				hydrationStarted && renderOwner.bindingLeases !== undefined
					? HYDRATION_DRIVER!.unmountPresentationRefs(renderOwner)
					: null;
			if (presentationRefs !== null) renderOwner.generation++;
			// Public unmount owns a synchronous subscription/ref teardown even when
			// the preceding mutation was waiting for resources before layout.
			if (
				!inFlush &&
				CURRENT_BLOCK === null &&
				!inNestedUpdateCallback() &&
				EFFECT_EVENT_LIFECYCLE_DEPTH === 0
			) {
				if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.interrupt();
				if (unmounted) return;
			}
			// A public, externally initiated unmount is a new update boundary. Its
			// effect cleanups may schedule other live roots, and must not inherit a
			// nearly-exhausted chain from earlier work. Nested unmounts during an
			// active render/commit lifecycle keep the current chain instead.
			if (
				!inFlush &&
				CURRENT_BLOCK === null &&
				!inNestedUpdateCallback() &&
				EFFECT_EVENT_LIFECYCLE_DEPTH === 0
			) {
				UPDATE_CHAIN_ID++;
				NESTED_UPDATE_CHAIN_ID++;
			}
			if (
				process.env.NODE_ENV !== 'production' &&
				!renderOwner.preservePresentation &&
				(inFlush ||
					CURRENT_BLOCK !== null ||
					EFFECT_BODY_DEPTH > 0 ||
					EFFECT_EVENT_LIFECYCLE_DEPTH > 0)
			) {
				warnRootLifecycleUnmount();
			}
			unmounted = true;
			renderOwner.disposed = true;
			if (hydrationStarted) HYDRATION_DRIVER!.releaseRootLeases(renderOwner, rootBlock);
			renderOwner.nativeRetry?.clear();
			if (renderOwner.retrySignalOwners !== undefined) clearSignalRetryOwners(renderOwner);
			renderOwner.retry = noop;
			if (TRANSITION_ROOT_DRIVER) TRANSITION_ROOT_DRIVER.discard(renderOwner);
			renderOwner.generation++;
			renderOwner.wakeable = null;
			renderOwner.request = null;
			if (renderOwner.transaction !== null) rollbackRootRender(renderOwner.transaction);
			try {
				if (rootBlock) {
					DOM_ROOT_DISPOSERS.delete(rootBlock);
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__devtoolsUnregisterRoot(
							rootBlock as unknown as import('../devtools-hook.js').DevtoolsScopeLike,
						);
					// Skip the per-Block DOM walk recursion (~3 removeChild ops × every
					// Block in the tree). Run cleanups + scope teardown only, then clear
					// the container in one shot. Portals self-detach during the recursive
					// teardown because their DOM lives in a foreign target — see the
					// portalSlotSlot branch in unmountScope. This also deliberately makes
					// unmount safe after external DOM removal instead of surfacing the
					// renderer-specific NotFoundError React happens to expose. Its content
					// retires before any cleanup runs, even a presentation left in place:
					// its handlers belong to this root.
					retireHostRange(getFirstChild(container), null);
					withRefDetachSuppression(presentationRefs, () => unmountBlock(rootBlock!, false));
					// Root unmount runs outside any flush, so no commit follows — drain the
					// teardown ref detaches queued above directly.
					drainRefDetaches();
					if (!renderOwner.preservePresentation) clearRootContainer(container);
					// Public unmount ends the subscription lifetime synchronously.
					// Normal reconciler deletions retain their deferred passive phase.
					drainDeferredPassiveUnmounts();
					rootBlock = null;
					currentBody = null;
					currentKey = null;
				}
			} finally {
				// An unresolved wakeable may retain its ping indefinitely. Leave it
				// only the disposed owner token, not a tree, hydration closure or props.
				idState.signalState?.opaqueKeys?.clear();
				if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.clearDeferredRefs(renderOwner);
				renderOwner.current = null;
				renderOwner.retry = noop;
				renderOwner.adopt = undefined;
				renderOwner.initialDocumentSignals = undefined;
				renderOwner.retryKey = null;
				renderOwner.transaction = null;
				unregisterDelegationTarget(container, true);
				releaseRootContainer(container, ownerToken);
			}
		},
	};
	if (rootBlock !== null) {
		registerRootDisposer(rootBlock);
		// Only hydrateRoot starts with an existing block. A suspended adoption
		// retries with fresh scopes while keeping the same server nodes and Root.
		renderOwner.adopt = (block) => {
			if (rootBlock !== null) DOM_ROOT_DISPOSERS.delete(rootBlock);
			rootBlock = block;
			renderOwner.current = block;
			registerRootDisposer(block);
		};
	}
	return root;
}
