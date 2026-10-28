// Optional-capability drivers
//
// The module-scope slots that core code tests by truthiness to reach an
// optional capability, and every function that assigns one. A bundle that never
// installs a capability never writes its slot, and oxc then drops the code the
// slot guards, but only in reads below the slot's declaration. This module
// evaluates before every module that reads them, so every read is below its
// slot. ESM lets only the declaring module assign a binding, so each installer
// lives here too.

import { startHydration } from '../hydration-flag.js';
import { RESTORE_EVENT_LIST } from '../event-names.js';
import { __devtoolsSetNativeReadInspector } from '../devtools-hook.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { type NativeReadDriver, createNativeReadDriver } from '../signals/native-read-client.js';
import {
	registerSignalDeclarationStage,
	supplyNativeAdoptionMiss,
} from '../signals/read-protocol.js';
import { signalOwnerUse } from '../signals/owner-context.js';
import { enableSignalDocument } from '../signals/document-owner.js';
import type {
	HookSlot,
	EffectEventCell,
	Scope,
	Block,
	RootRenderOwner,
	RootRenderTransaction,
	RefAttach,
	SuspenseRefEntry,
	OffscreenCapture,
} from './types.js';
import {
	currentSignalDeclarationStage,
	inspectNativeReadScope,
	replayNativeUnpublishedRefs,
	retainNativeRetryReads,
} from './signal-owners.js';
import {
	withoutRefDetachSuppression,
	blockSubtreeDisposed,
	type ActivityRefState,
	type FragmentInstance,
} from './refs.js';
import {
	scheduleNativeRead,
	releaseNativeAdoptions,
	EFFECT_EVENT_LIFECYCLE_DEPTH,
	type TransitionTaskDriver,
	unsuspendTransitionHolder,
	retryTransitionHolder,
	wakeHeldTransitions,
	COMMIT_OP,
	journalRootProperty,
	journalUndo,
	retireDetachedBindingLeases,
	unmountPresentationRefs,
	releaseRootLeases,
	acceptHydrationHostEvents,
	refAttachQueue,
	upgradeTransitionBlock,
	adoptTransitionQueue,
	settleTransitionFalls,
	type ScheduledVisibilityDriver,
	holdsNativeRead,
	drainQueuedRefAttaches,
	drainRegisteredPassivePhase,
} from './engine.js';
import {
	scheduleRegisteredPassiveFlush,
	drainQueuedEffectEventUpdates,
	drainRegisteredMutationEffects,
	runRegisteredLayoutEffects,
	drainRegisteredPassiveUnmounts,
} from './effects.js';
import {
	ensureHooks,
	registerHookCleanup,
	missingSlot,
	slotStack,
	resolveCustomSlot,
} from './hooks.js';
import {
	type TransitionRootDriver,
	installPendingSignalHost,
	transitionMemoCells,
	foldTransitionUpdate,
	queueTransitionUpdate,
	dropTransitionRender,
	holdsUnrenderedTransition,
	discardHeldRoot,
	queueTransitionBlock,
	splitsTransitionCue,
	splitTransitionCue,
	armTransitionFalls,
	cancelTransitionFall,
} from './transitions.js';
import { blockRare, enqueueEffectEventUpdate, keepTransitionWork } from './block.js';
import { hideTryContentAndMountPending, findScheduledVisibilityOwner } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	WIP_CAPTURE,
	renderVisibleTry,
	attemptHiddenReveal,
} from './render.js';
import {
	type RootOptions,
	type RootErrorHandlers,
	registeredReportCaughtError,
	registeredPublishInlineCaughtErrorReports,
	registeredReportUncaughtError,
} from './roots.js';
import {
	PresentationAdoptionMiss,
	presentationMiss,
	currentPresentations,
	retryPresentations,
	presentationRange,
} from './hydration-presentation.js';
import { retryPendingCommit, bindImplicitSignalChild } from './signal-bindings.js';
import {
	registerActivityRef,
	registerActivityInsertionEffect,
	registerActivityPortal,
	detachRegisteredSubtreeRefs,
} from './activity.js';
import { withRegisteredRefDetachSuppression, JOURNAL_OPS } from './commit.js';
import { publishRegisteredManualFormPending } from './actions.js';
import { delegateEvents } from './events.js';
import type { tryMemoBail } from './component-slots.js';
import {
	reconcileDeoptHost,
	hostElementBody,
	adoptsPureHost,
	landHostPair,
	unchangedScopedHostDescriptor,
	buildDeoptAdoptQueue,
	placeUpgradedList,
} from './deopt.js';
import {
	maybeFlushDiscrete,
	UNCONTROLLED,
	type ControlledState,
	type DevFormCheck,
	controlledDelivery,
	beginControlledDelivery,
	DEV_FORM_CHECK_MARK,
	DEV_FORM_CHECK_GENERATION,
	renderControlledState,
	drainQueuedControlledSyncs,
	restoreControlledStates,
	maybeEnqueueRestore,
} from './forms.js';
import { installRootRollback } from '../rollback-flag.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// Ref queues own commit and subtree visibility work. Install before either
// queue publishes its first entry, including deferred or unpublished refs.
export let drainRefAttaches: typeof drainQueuedRefAttaches = noop;
export let detachSubtreeRefs: typeof detachRegisteredSubtreeRefs = noop;
export let withRefDetachSuppression: typeof withRegisteredRefDetachSuppression =
	withoutRefDetachSuppression;

// Optional capabilities install these drivers and stages. An application that
// never uses one never assigns its variable, so its minifier can drop the code
// the variable guards. Vite emits top-level `let` as `var` (Rolldown's
// `topLevelVar`), and oxc drops that code only when the never-assigned `var` is
// declared above every read and each read tests its truthiness: `if (D)`,
// `D && D.f()`, or `D ? D.f() : x`. `D !== null`, `D?.f()`, and a plain local
// copy keep the code, so a local copy that must stay is `D ? D : null`. Hence
// these declarations sit here, away from their features. Read every optional
// driver in this module that way, NATIVE_READ_DRIVER included.
export let TRANSITION_TASK_DRIVER: TransitionTaskDriver | null = null;
export let TRANSITION_ROOT_DRIVER: TransitionRootDriver | null = null;
export let SCHEDULED_VISIBILITY_DRIVER: ScheduledVisibilityDriver | null = null;

// The root render journal. A root render updates its scopes' records in place
// while its DOM writes wait for the commit (#2043), so only a feature that can
// drop a render needs those updates undone: Suspense and use(), lazy,
// hydration, native-read validation and ViewTransition holds. Each installs
// the journal before its first render (rollback-flag.ts). Without one,
// nothing assigns the state below, so every journal write folds away, and a
// render ends in its commit or in its root's teardown: an uncaught error or an
// unmount, which needs nothing undone (rollbackRootRender).
/** Flat undo log, four slots per entry: kind, target, a, b. */
export let TRANSITION_JOURNAL: any[] | null = null;
/** Bags already captured in the open window, so each is snapshotted once. */
export let TRANSITION_JOURNAL_BAGS: Map<object, number> | null = null;
export let TRANSITION_JOURNAL_CHECKPOINT = 0;
/** Bag snapshots use one stamp per rollback window, including nested boundaries. */
export let TRANSITION_JOURNAL_BAG_WINDOW = 0;
let NEXT_TRANSITION_JOURNAL_BAG_WINDOW = 0;
/** Open windows: 1 in a root render. Boundaries nest, and only the outermost may drop the log. */
export let TRANSITION_JOURNAL_DEPTH = 0;
/** Ops length when the innermost open window began; 0 for the root window. */
export let OPS_CHECKPOINT = 0;
const OPS_CHECKPOINTS: number[] = [];
const TRANSITION_JOURNAL_WINDOWS: number[] = [];
const TRANSITION_JOURNAL_BAG_WINDOWS: number[] = [];
/** A rollback is replaying the journal: what it undoes journals and queues nothing. */
export let ROOT_RENDER_ROLLBACK = false;
/** The windows root render frames interrupted, six slots each; frames nest. */
const ROOT_JOURNAL_FRAMES: any[] = [];

/** Open a root render frame's journal window, saving the one it interrupts (beginRootRender). */
export function enterRootJournal(transaction: RootRenderTransaction): void {
	ROOT_JOURNAL_FRAMES.push(
		TRANSITION_JOURNAL,
		TRANSITION_JOURNAL_BAGS,
		TRANSITION_JOURNAL_CHECKPOINT,
		TRANSITION_JOURNAL_BAG_WINDOW,
		TRANSITION_JOURNAL_DEPTH,
		OPS_CHECKPOINT,
	);
	if (transaction.log === null) {
		transaction.log = [];
		transaction.bags = new Map();
		transaction.bagWindow = ++NEXT_TRANSITION_JOURNAL_BAG_WINDOW;
	}
	TRANSITION_JOURNAL = transaction.log;
	TRANSITION_JOURNAL_BAGS = transaction.bags;
	TRANSITION_JOURNAL_CHECKPOINT = 0;
	TRANSITION_JOURNAL_BAG_WINDOW = transaction.bagWindow;
	TRANSITION_JOURNAL_DEPTH = 1;
	OPS_CHECKPOINT = 0;
}

/** Restore the window the closing root render frame interrupted (endRootRender). */
export function exitRootJournal(): void {
	const frames = ROOT_JOURNAL_FRAMES;
	// A frame that began before the journal was installed entered no window.
	// Frames nest, so every frame entered since has already left.
	if (frames.length === 0) return;
	OPS_CHECKPOINT = frames.pop();
	TRANSITION_JOURNAL_DEPTH = frames.pop();
	TRANSITION_JOURNAL_BAG_WINDOW = frames.pop();
	TRANSITION_JOURNAL_CHECKPOINT = frames.pop();
	TRANSITION_JOURNAL_BAGS = frames.pop();
	TRANSITION_JOURNAL = frames.pop();
}

/** Open a nested window and return the checkpoint to roll back to (armTransitionJournal). */
export function openJournalWindow(): number {
	TRANSITION_JOURNAL ??= [];
	TRANSITION_JOURNAL_BAGS ??= new Map();
	TRANSITION_JOURNAL_WINDOWS.push(TRANSITION_JOURNAL_CHECKPOINT);
	TRANSITION_JOURNAL_BAG_WINDOWS.push(TRANSITION_JOURNAL_BAG_WINDOW);
	TRANSITION_JOURNAL_CHECKPOINT = TRANSITION_JOURNAL.length;
	TRANSITION_JOURNAL_BAG_WINDOW = ++NEXT_TRANSITION_JOURNAL_BAG_WINDOW;
	TRANSITION_JOURNAL_DEPTH++;
	const checkpoint = TRANSITION_JOURNAL.length;
	OPS_CHECKPOINTS.push(OPS_CHECKPOINT);
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null) {
		OPS_CHECKPOINT = transaction.ops.length;
		TRANSITION_JOURNAL.push(
			JOURNAL_OPS,
			transaction,
			OPS_CHECKPOINT,
			transaction.retired?.size ?? 0,
		);
	}
	return checkpoint;
}

/** Close the window openJournalWindow opened (disarmTransitionJournal). */
export function closeJournalWindow(): void {
	TRANSITION_JOURNAL_CHECKPOINT = TRANSITION_JOURNAL_WINDOWS.pop()!;
	TRANSITION_JOURNAL_BAG_WINDOW = TRANSITION_JOURNAL_BAG_WINDOWS.pop()!;
	OPS_CHECKPOINT = OPS_CHECKPOINTS.pop()!;
	if (--TRANSITION_JOURNAL_DEPTH === 0) {
		TRANSITION_JOURNAL = null;
		TRANSITION_JOURNAL_BAGS = null;
	}
}

/** Mark a rollback's replay (rollbackRootRender), returning the previous mark. */
export function markRootRenderRollback(rolling: boolean): boolean {
	const previous = ROOT_RENDER_ROLLBACK;
	ROOT_RENDER_ROLLBACK = rolling;
	return previous;
}
// Record actual committed ref identities only when an Activity is in use. A
// hidden render may already have replaced its manifest's ref before cleanup;
// the committed identity is the one that must be disconnected exactly once.
export let activityRefState: WeakMap<Element | FragmentInstance, ActivityRefState> | null = null;
// Cells install their own commit drains so apps without these hooks can omit them.
// Captured updates already passed cell creation and use the same live drains.
export let drainEffectEventUpdates: typeof drainQueuedEffectEventUpdates = noop;
// Only enqueueEffect publishes effect slots, so only it installs their commit
// work, with live calls so the first effects may appear during a ref callback.
export let drainMutationEffects: typeof drainRegisteredMutationEffects = () => null;
export let runLayoutEffects: typeof runRegisteredLayoutEffects = noop;
export let drainPassivePhase: typeof drainRegisteredPassivePhase = noop;
export let drainDeferredPassiveUnmounts: typeof drainRegisteredPassiveUnmounts = noop;
export let schedulePassiveFlush: typeof scheduleRegisteredPassiveFlush = noop;
export function installEffectDrivers(): void {
	drainMutationEffects = drainRegisteredMutationEffects;
	runLayoutEffects = runRegisteredLayoutEffects;
	drainPassivePhase = drainRegisteredPassivePhase;
	drainDeferredPassiveUnmounts = drainRegisteredPassiveUnmounts;
	schedulePassiveFlush = scheduleRegisteredPassiveFlush;
}

// Native reads are a compiler-selected capability. Ordinary applications keep
// only driver tests at renderer boundaries, which their minifier removes; no
// Alien graph, consumer maps, callbacks, or per-Scope fields are allocated by
// the default runtime.
export let NATIVE_READ_DRIVER: NativeReadDriver | null = null;
// Until withSlot first runs, the private path stack is empty. Direct component
// hooks use their own slot; only custom-hook callers retain path composition.
export let resolveSlot = (slot: HookSlot | undefined): HookSlot | undefined => slot;
// Only controlled bindings install event restoration. Keeping its concrete
// entry points at that owner lets event-only applications drop the restore
// graph without adding a wrapper call to dispatch. Read the live capability:
// a native target listener can arm the first control after root capture.
export let CONTROLLED_RESTORE_DRIVER: {
	begin: typeof beginControlledDelivery;
	delivery: typeof controlledDelivery;
	enqueue: typeof maybeEnqueueRestore;
	finish: typeof maybeFlushDiscrete;
	restore: typeof restoreControlledStates;
} | null = null;
// Install before queued work drains or a submit transition publishes pending status.
// Keep the call targets stable after installation, including after rollback.
export let drainControlledSyncs: typeof drainQueuedControlledSyncs = noop;
export let publishManualFormPending: typeof publishRegisteredManualFormPending = noop;
export function installManualFormPending(): void {
	publishManualFormPending = publishRegisteredManualFormPending;
}
/**
 * The host element descriptor renderer. Host descriptors are built only by an
 * element factory (createHostElement, a scoped element record, the public
 * factories) or by compiled JSX whose tag can resolve to a host string, and
 * each installs this first (enableHostDescriptors). Renderable values reach
 * the renderer only through it, so a bundle whose values are compiled bodies,
 * component descriptors, text, arrays and empties retains neither the renderer
 * nor the generic attribute and controlled-form writers it calls.
 */
export interface HostDescriptorDriver {
	/** Reconcile a host descriptor against the node at its position. */
	reconcile: typeof reconcileDeoptHost;
	/** The stable body of a host descriptor whose subtree needs Blocks. */
	body: typeof hostElementBody;
	/** Whether a raw host element can become a descriptor's Block's element. */
	adopts: typeof adoptsPureHost;
	/** Place an adopted host's new marker pair around it at commit. */
	landPair: typeof landHostPair;
	/** Whether a deferred host shell still resolves to its committed record. */
	unchanged: typeof unchangedScopedHostDescriptor;
	/** An upgraded host's raw children, keyed for its first list to adopt. */
	adoptQueue: typeof buildDeoptAdoptQueue;
	/** Commit an upgraded host's first list over the children it adopted. */
	placeUpgraded: typeof placeUpgradedList;
}
export let HOST_DESCRIPTORS: HostDescriptorDriver | null = null;
/** @internal Installed by every site that can create a host element descriptor. */
export function enableHostDescriptors(): void {
	HOST_DESCRIPTORS ??= {
		reconcile: reconcileDeoptHost,
		body: hostElementBody,
		adopts: adoptsPureHost,
		landPair: landHostPair,
		unchanged: unchangedScopedHostDescriptor,
		adoptQueue: buildDeoptAdoptQueue,
		placeUpgraded: placeUpgradedList,
	};
}
// Only memo() marks a memo boundary, so it installs the bail that compares the
// boundary's props, and applications without memo() skip that call per update.
export let MEMO_BAIL: typeof tryMemoBail | null = null;
export function installMemoBail(bail: typeof tryMemoBail): void {
	MEMO_BAIL = bail;
}
export let SIGNAL_CHILD: typeof bindImplicitSignalChild | null = null;
// A signal binding's commit-time read can find its handle pending since render.
// Signal bindings install the retry; other bundles report every commit error.
export let SIGNAL_COMMIT_RETRY: typeof retryPendingCommit | null = null;

/**
 * Hydration work that outlives a pass: preserved `<Hydrate>` activations,
 * native-signal adoptions released at commit, and early binding presentations
 * with their leases. Only the hydration entry points install it
 * (installHydrationDriver), and client paths reach it only behind
 * `hydrationStarted`, so a bundle that never hydrates references none of these
 * implementations, whether or not its minifier folds the flag. It holds only
 * what every client path reaches. The presentation ABI that compiled binding
 * views call (beginPresentationHydration and its writers) keeps its bodies out
 * of the driver, so that hydrating bundles without binding views keep none.
 */
export interface HydrationDriver {
	/** Publish resumed-arm handlers before a root's mutation callbacks. */
	acceptHostEvents: typeof acceptHydrationHostEvents;
	/** A commit's accepted native-signal adoptions end after its layout phase. */
	releaseNativeAdoptions(): void;
	/** Whether every early presentation a capture prepared is still current. */
	currentPresentations(capture: OffscreenCapture): boolean;
	retryPresentations(capture: OffscreenCapture): void;
	/** A committed root retires the leases of early bindings it removed. */
	retireDetachedBindingLeases(owner: RootRenderOwner): void;
	/** An unmounting root's prepared presentations' refs, or null. */
	unmountPresentationRefs(owner: RootRenderOwner): SuspenseRefEntry[] | null;
	/** An unmounted root ends its control and binding leases. */
	releaseRootLeases(owner: RootRenderOwner, root: Block | null): void;
	isPresentationMiss(error: unknown): error is PresentationAdoptionMiss;
	/** An early presentation refuses its takeover (PresentationAdoptionMiss). */
	presentationMiss(retry?: boolean): never;
	/** The lease's range a binding text or slot of an early presentation adopts. */
	presentationRange: typeof presentationRange;
}
export let HYDRATION_DRIVER: HydrationDriver | null = null;

// Only root entry points whose ABI permits options install this. Besides
// registering callbacks, its presence means a root may have an explicit signal
// owner; default-options-only applications cannot have one.
export let ROOT_ERROR_HANDLERS: WeakMap<Block, RootErrorHandlers> | null = null;
export let registerRootOptions: typeof registerEnabledRootErrorHandlers | null = null;
export function installRootOptions(): void {
	registerRootOptions = registerEnabledRootErrorHandlers;
}
export let reportCaughtError: typeof registeredReportCaughtError = noop;
export let reportUncaughtError: typeof registeredReportUncaughtError = () => false;
export let publishInlineCaughtErrorReports: typeof registeredPublishInlineCaughtErrorReports = noop;

// Potential bindings retain invocation identities before a late signal module
// arrives. They do not create document/instance owners until a genuine facade or
// handle enables the shared document capability.
export let SIGNAL_BINDINGS_ENABLED = false;

/** @internal Compiler/runtime module-signal capability version 1. */
export function enableSignalBindings(abi = 1, potentialOnly = false): void {
	if (abi !== 1) throw new TypeError(formatClientError(74));
	SIGNAL_BINDINGS_ENABLED = true;
	signalOwnerUse.active = true;
	SIGNAL_CHILD = bindImplicitSignalChild;
	SIGNAL_COMMIT_RETRY = retryPendingCommit;
	if (!potentialOnly) enableSignalDocument(abi);
}

export function ensureNativeReadDriver(): NativeReadDriver {
	if (NATIVE_READ_DRIVER) return NATIVE_READ_DRIVER;
	// A render whose native reads changed before its commit is dropped.
	installRootRollback();
	// Native producers share the landed host-task queue without installing
	// the transition root or offscreen-rendering capabilities.
	TRANSITION_TASK_DRIVER ??= {
		queue: queueTransitionBlock,
		adopt: adoptTransitionQueue,
		upgrade: upgradeTransitionBlock,
	};
	registerSignalDeclarationStage(currentSignalDeclarationStage);
	NATIVE_READ_DRIVER = createNativeReadDriver({
		capture: () => WIP_CAPTURE,
		cleanup: registerHookCleanup,
		schedule: scheduleNativeRead,
		suspended: retainNativeRetryReads,
		replayRefs: (capture, owner) =>
			replayNativeUnpublishedRefs(capture as OffscreenCapture, owner as RootRenderOwner),
		refDisposed: (entry) => blockSubtreeDisposed((entry as RefAttach).block),
	});
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__devtoolsSetNativeReadInspector(inspectNativeReadScope);
	return NATIVE_READ_DRIVER;
}

export function ensureTransitionDrivers(): void {
	if (!TRANSITION_ROOT_DRIVER) {
		TRANSITION_ROOT_DRIVER = {
			fold: foldTransitionUpdate,
			queue: queueTransitionUpdate,
			memoCells: transitionMemoCells,
			keep: keepTransitionWork,
			splitCue: splitTransitionCue,
			splitsCue: splitsTransitionCue,
			armFalls: armTransitionFalls,
			settleFalls: settleTransitionFalls,
			cancelFall: cancelTransitionFall,
			drop: dropTransitionRender,
			retry: retryTransitionHolder,
			unsuspend: unsuspendTransitionHolder,
			holdsUnrendered: holdsUnrenderedTransition,
			wake: wakeHeldTransitions,
			discard: discardHeldRoot,
		};
		installPendingSignalHost();
	}
	TRANSITION_TASK_DRIVER ??= {
		queue: queueTransitionBlock,
		adopt: adoptTransitionQueue,
		upgrade: upgradeTransitionBlock,
	};
}

export function ensureScheduledVisibilityDriver(): void {
	SCHEDULED_VISIBILITY_DRIVER ??= {
		find: findScheduledVisibilityOwner,
		holdsNativeRead,
		reveal: attemptHiddenReveal,
		hidePending: hideTryContentAndMountPending,
		visible: renderVisibleTry,
		rehide: null,
		retryActivity: null,
	};
}

/**
 * Compiler-emitted on a host element's ref MOUNT. Defers the attach until commit
 * (drainRefAttaches) so the node is connected when a callback ref fires and
 * ref.current is set before layout effects run. Each entry records its owning
 * `block`; drainRefAttaches preserves enqueue order for disjoint subtrees and
 * only reorders ancestor/descendant pairs for child-before-parent ordering.
 * Ref identity UPDATES queue here too (paired with a queueRefDetach of the old
 * ref), so within one commit every detach drains before every attach — a ref
 * hopping between elements never ends null, whichever binding updates first.
 */
export function queueRefAttach(scope: Scope, ref: any, el: Element | FragmentInstance): void {
	if (drainRefAttaches === noop) {
		drainRefAttaches = drainQueuedRefAttaches;
		detachSubtreeRefs = detachRegisteredSubtreeRefs;
		withRefDetachSuppression = withRegisteredRefDetachSuppression;
	}

	activityRefCreated?.(scope.block, el);
	const transaction = ROOT_RENDER_TRANSACTION;
	const entry: RefAttach = {
		ref,
		el,
		block: scope.block,
		op: transaction !== null ? transaction.ops.length : COMMIT_OP,
	};
	(WIP_CAPTURE !== null ? WIP_CAPTURE.refs : refAttachQueue).push(entry);
	if (WIP_CAPTURE === null && NATIVE_READ_DRIVER) {
		const owner = scope.block.idState.renderOwner;
		if (owner !== undefined) NATIVE_READ_DRIVER.stampQueuedPublication(owner, entry);
	}
}
// Only manual-slot provider invocations install this capability. Ordinary custom
// hooks keep their authored arguments; an actual provider adapter consumes the
// pending call-site slot even when reached through a bound or forwarding alias.
export let MANUAL_HOOK_DRIVER: { pending: HookSlot | undefined; active: boolean } | null = null;

/** @internal Invoke a provider that owns the trailing hook-slot ABI. */
export function invokeManualHook<T>(
	fn: (...args: any[]) => T,
	receiver: unknown,
	args: IArguments,
): T {
	// Hoisted provider declarations need no module initialization. Establish
	// their capability on first invocation, including inside an existing call.
	const driver = (MANUAL_HOOK_DRIVER ??= {
		pending: slotStack[slotStack.length - 1],
		active: false,
	});
	const pending = driver.pending;
	const active = driver.active;
	driver.pending = undefined;
	driver.active = true;
	try {
		if (pending === undefined) return Reflect.apply(fn, receiver, args);
		// Forward the wrapper's arguments object directly for common arities.
		// Only larger calls need an array to append the compiler's slot.
		switch (args.length) {
			case 0:
				return fn.call(receiver, pending);
			case 1:
				return fn.call(receiver, args[0], pending);
			case 2:
				return fn.call(receiver, args[0], args[1], pending);
			case 3:
				return fn.call(receiver, args[0], args[1], args[2], pending);
			case 4:
				return fn.call(receiver, args[0], args[1], args[2], args[3], pending);
			default: {
				const forwarded = new Array(args.length + 1);
				for (let index = 0; index < args.length; index++) forwarded[index] = args[index];
				forwarded[args.length] = pending;
				return fn.apply(receiver, forwarded);
			}
		}
	} finally {
		driver.pending = pending;
		driver.active = active;
	}
}

export function withSlot<T>(sym: HookSlot, fn: (...a: any[]) => T, ...args: any[]): T;
export function withSlot<T>(sym: HookSlot, fn: (...a: any[]) => T, ...args: any[]): T {
	resolveSlot = resolveCustomSlot;
	const driver = MANUAL_HOOK_DRIVER;
	const pending = driver?.pending;
	const active = driver?.active ?? false;
	if (driver !== null) {
		driver.pending = sym;
		driver.active = false;
	}
	slotStack.push(sym);
	try {
		return fn(...args);
	} finally {
		slotStack.pop();
		if (MANUAL_HOOK_DRIVER !== null) {
			// A provider can first be invoked inside this call. In that case the
			// previous path predates the capability and has no manual body active.
			MANUAL_HOOK_DRIVER.pending = driver === null ? slotStack[slotStack.length - 1] : pending;
			MANUAL_HOOK_DRIVER.active = active;
		}
	}
}

export let EFFECT_EVENT_INVOCATION_DEPTH = 0;

/**
 * React 19 `useEffectEvent` — returns a fresh wrapper each render whose shared
 * cell invokes the latest COMMITTED `fn`. Effect Events are non-reactive (the
 * compiler omits them from inferred dependencies), but their wrapper identity
 * is intentionally not stable. Publishing the cell in commit prevents a
 * suspended or failed render from leaking an uncommitted closure.
 */
export function useEffectEvent<F extends (...args: any[]) => any>(fn: F, slot?: HookSlot): F;
export function useEffectEvent<F extends (...args: any[]) => any>(fn: F, slot?: HookSlot): F {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useEffectEvent');
	const scope = CURRENT_SCOPE!;
	// The rendering Block versions the attempt. A lite Scope's stand-in never
	// renders on its own, so its version would never commit.
	const block = CURRENT_BLOCK!;
	const rare = blockRare(block);
	if (rare.eventRender === 0) rare.eventRender = 1;
	let s = scope.hooks?.get(slot) as EffectEventCell | undefined;
	if (s === undefined) {
		drainEffectEventUpdates = drainQueuedEffectEventUpdates;
		s = { impl: fn, active: true };
		ensureHooks(scope).set(slot, s);
		const cell = s;
		registerHookCleanup(scope, () => {
			cell.active = false;
		});
	} else {
		enqueueEffectEventUpdate({
			cell: s,
			nextImpl: fn,
			block,
			renderVersion: rare.eventRender,
		});
	}
	const cell = s;
	return ((...args: any[]) => {
		if (CURRENT_SCOPE !== null && EFFECT_EVENT_LIFECYCLE_DEPTH === 0) {
			throw new Error(formatClientError(11));
		}
		EFFECT_EVENT_INVOCATION_DEPTH++;
		try {
			return cell.impl.apply(undefined, args);
		} finally {
			EFFECT_EVENT_INVOCATION_DEPTH--;
		}
	}) as F;
}

/**
 * Hydration entry points only: this runtime is about to hydrate, so install
 * the driver for hydration state that outlives a pass (HydrationDriver) and
 * set the sticky flag that guards it. Only a pass installs a native adoption
 * resolver, under which a signal read the server did not serialize throws
 * NativeAdoptionMiss, so the class is supplied here too.
 */
export function installHydrationDriver(): void {
	startHydration();
	// A hydration attempt that misses or suspends is dropped and retried.
	installRootRollback();
	supplyNativeAdoptionMiss();
	HYDRATION_DRIVER ??= {
		acceptHostEvents: acceptHydrationHostEvents,
		releaseNativeAdoptions,
		currentPresentations,
		retryPresentations,
		retireDetachedBindingLeases,
		unmountPresentationRefs,
		releaseRootLeases,
		isPresentationMiss: (error): error is PresentationAdoptionMiss =>
			error instanceof PresentationAdoptionMiss,
		presentationMiss,
		presentationRange,
	};
}

let activityRefCreated: ((block: Block, target: Element | FragmentInstance) => void) | null = null;
export let activityInsertionEffectCreated: ((block: Block) => void) | null = null;
export let activityRefOwners: WeakMap<Block, boolean> | null = null;
let liveActivityCount = 0;

export function noop(): void {}

export function queueControlledCommit<T>(queue: T[], item: T): void {
	if (drainControlledSyncs === noop) drainControlledSyncs = drainQueuedControlledSyncs;
	queue.push(item);
	if (ROOT_RENDER_TRANSACTION !== null)
		journalUndo(() => {
			const index = queue.lastIndexOf(item);
			if (index !== -1) queue.splice(index, 1);
		});
}

let devFormLifetimes: WeakMap<Scope, { active: boolean }> | undefined;

function devFormLifetime(owner: Scope): { active: boolean } {
	const lifetimes = (devFormLifetimes ??= new WeakMap());
	let lifetime = lifetimes.get(owner);
	if (lifetime === undefined || !lifetime.active) {
		lifetime = { active: !owner.block.disposed };
		lifetimes.set(owner, lifetime);
		if (lifetime.active) {
			const current = lifetime;
			if (ROOT_RENDER_TRANSACTION !== null && owner.cleanups === null)
				journalRootProperty(owner, 'cleanups', null);
			const cleanups = (owner.cleanups ??= []);
			const retire = () => {
				current.active = false;
			};
			cleanups.push(retire);
			// A rollback can restore the cleanup list without running this callback.
			if (ROOT_RENDER_TRANSACTION !== null)
				journalUndo(() => {
					retire();
					const index = cleanups.lastIndexOf(retire);
					if (index !== -1) cleanups.splice(index, 1);
				});
		}
	}
	return lifetime;
}

export function queueDevFormCheck(queue: DevFormCheck[], el: Element, owner: Scope | null): void {
	if (drainControlledSyncs === noop) drainControlledSyncs = drainQueuedControlledSyncs;
	const check = { element: el, lifetime: owner === null ? null : devFormLifetime(owner) };
	queue.push(check);
	if (ROOT_RENDER_TRANSACTION !== null) {
		const host = el as any;
		const generation = DEV_FORM_CHECK_GENERATION;
		journalUndo(() => {
			const index = queue.lastIndexOf(check);
			if (index !== -1) queue.splice(index, 1);
			// The element can be retried in this same diagnostic generation. Roll back
			// the stamp alongside the queue entry so that retry is not deduplicated.
			if (host[DEV_FORM_CHECK_MARK] === generation) delete host[DEV_FORM_CHECK_MARK];
		});
	}
}

export function armControlledBase(el: Element): ControlledState {
	let ctrl = renderControlledState(el);
	if (ctrl === undefined) {
		CONTROLLED_RESTORE_DRIVER ??= {
			begin: beginControlledDelivery,
			delivery: controlledDelivery,
			enqueue: maybeEnqueueRestore,
			finish: maybeFlushDiscrete,
			restore: restoreControlledStates,
		};
		ctrl = {
			v: UNCONTROLLED,
			c: -1,
			sv: null,
			sawV: false,
			sawC: false,
			sawDC: false,
			dvv: UNCONTROLLED,
			composing: false,
			compositionEndTask: undefined,
			queued: false,
			formSeen: false,
			formMultiple: false,
			formChildren: false,
		};
		(el as any).$$ctrl = ctrl;
		// The restore pass rides the delegated dispatchers — an armed control
		// must hear its native edit events even when NO component listens
		// (React attaches root listeners eagerly; octane delegates lazily).
		delegateEvents(RESTORE_EVENT_LIST);
	}
	return ctrl;
}

// Only applications using Activity retain portal visibility bookkeeping.
export let activityPortalCreated: ((block: Block) => void) | null = null;

export function retainActivityTracking(): void {
	liveActivityCount++;
	activityPortalCreated ??= registerActivityPortal;
	activityRefCreated ??= registerActivityRef;
	activityInsertionEffectCreated ??= registerActivityInsertionEffect;
	activityRefState ??= new WeakMap();
	activityRefOwners ??= new WeakMap();
}

export function releaseActivityTracking(): void {
	if (--liveActivityCount !== 0) return;
	activityRefCreated = null;
	activityInsertionEffectCreated = null;
	activityPortalCreated = null;
	const refs = activityRefState;
	// The block's cleanup runs before descendant ref teardowns. Keep their
	// committed records until this synchronous deletion/commit finishes, then
	// remove the optional hooks entirely. A new Activity cancels this release.
	queueMicrotask(() => {
		if (liveActivityCount === 0 && activityRefState === refs) {
			activityRefState = null;
			activityRefOwners = null;
		}
	});
}

function registerEnabledRootErrorHandlers(root: Block, options: RootOptions | undefined): void {
	if (options === undefined) return;
	const { onCaughtError, onUncaughtError, onRecoverableError } = options;
	if (
		onCaughtError === undefined &&
		onUncaughtError === undefined &&
		onRecoverableError === undefined
	) {
		return;
	}
	if (ROOT_ERROR_HANDLERS === null) {
		reportCaughtError = registeredReportCaughtError;
		reportUncaughtError = registeredReportUncaughtError;
		publishInlineCaughtErrorReports = registeredPublishInlineCaughtErrorReports;
	}
	(ROOT_ERROR_HANDLERS ??= new WeakMap()).set(root, {
		onCaughtError,
		onUncaughtError,
		onRecoverableError,
	});
}
