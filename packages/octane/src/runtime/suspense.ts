// Suspense, @try and error boundaries
//
// Try and error slots, catching render and effect errors, suspending, hiding
// and revealing content, retries, resuming, and initial Suspense hydration.

import { HYDRATE_STREAM_ERROR_ATTR, reserveHydrationIds } from './hydrate-boundary.js';
import { hydrationStarted, hydrating } from '../hydration-flag.js';
import {
	STREAM_BOUNDARY_ATTR,
	SUSPENSE_RESOLVED_SEED_ATTR,
	SUSPENSE_RESOLVED_NATIVE_ATTR,
} from '../constants.js';
import {
	__profileBoundary,
	__profileCount,
	ProfileCounter,
	__profileQueueWork,
	__profileSchedule,
} from '../profiling.js';
import { __devtoolsClearBoundary, __devtoolsSetBoundaryState } from '../devtools-hook.js';
import { markComponentFlags, COMPONENT_FLAG_BOUNDARY } from '../component-flags.js';
import { formatClientError } from '../error-codes.client.generated.js';
import {
	BOUNDARY_STREAMED,
	BOUNDARY_CONTENT,
	boundaryIdCount,
	BOUNDARY_CLIENT,
	BOUNDARY_CLIENT_CAUGHT,
	BOUNDARY_CLIENT_ERROR,
	BOUNDARY_CLIENT_SUSPENDED,
} from '../hydration-protocol.js';
import { SUSPENSE_TAG } from '../runtime-tags.js';
import { STREAM_RETRY_PROP } from '../stream-protocol.js';
import { setNativeAdoptionResolver } from '../signals/read-protocol.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import { styleName } from '../css.js';
import type {
	ComponentBody,
	Scope,
	RootIdState,
	Block,
	EffectSlot,
	PendingEffect,
	RootRenderTransaction,
	SlotNext,
	ViewTransitionProps,
	Phase,
	SuspenseRefEntry,
	OffscreenCapture,
	UncommittedRefAttaches,
	TrySlot,
	TryHandler,
	ActivitySlot,
} from './types.js';
import {
	detachSubtreeRefs,
	withRefDetachSuppression,
	TRANSITION_ROOT_DRIVER,
	SCHEDULED_VISIBILITY_DRIVER,
	ROOT_ERROR_HANDLERS,
	reportCaughtError,
	reportUncaughtError,
	ensureScheduledVisibilityDriver,
	queueRefAttach,
	noop,
} from './drivers.js';
import {
	handOverSignalRetryScope,
	clearSignalRetryOwners,
	supersedeSignalRetryOwners,
	takeNativeFreshArm,
	renderBlock,
} from './signal-owners.js';
import { blockSubtreeDisposed } from './refs.js';
import {
	VIEW_TRANSITION_DRIVER,
	inFlush,
	type RootRenderFrame,
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	rollbackRootRender,
	tickTransitionCount,
	actScopeDepth,
	componentName,
	scheduleRender,
	flush,
	commitEffects,
	reportEffectError,
	endDetachedBoundaryRender,
} from './engine.js';
import {
	type EffectDepsSnapshot,
	LAYOUT,
	PASSIVE,
	effectQueues,
	discardSubtreeRefAttaches,
	blockIsAncestorOf,
} from './effects.js';
import { initializeViewTransitionComponent } from './view-transition.js';
import { HIDDEN_REVEAL_ACTIONS, depsChanged } from './hooks.js';
import {
	type TrackedThenable,
	isSuspenseException,
	resumeOnSettle,
	blockIsAncestor,
} from './use.js';
import { releaseTransitionHookHolder, HELD_TRANSITIONS, STAGED_REVEALS } from './transitions.js';
import {
	RENDERER_REGION_OWNER_COUNT,
	rendererRegionOwnerForBlock,
	rendererRegionTryHandler,
	rendererRegionSuspenseHandler,
	isHostContextRequest,
} from './context.js';
import {
	noteHydrationThrow,
	clearHydrationThrow,
	HYDRATION_PASS,
	CURSOR,
	swapHydration,
	type HydrationCapability,
	initialSuspenseHydrationRenderer,
} from './hydration.js';
import {
	takeClientRootId,
	blockRare,
	createBlock,
	invalidateRender,
	unmountBlock,
	registerSlot,
	SLOT_FLAG_TEARDOWN,
} from './block.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_BAGS,
	ROOT_RENDER_TRANSACTION,
	beginRootRender,
	suspendRootRender,
	effectEventCommitActions,
	WIP_CAPTURE,
	renderVisibleTry,
	renderInitialSuspenseHydration,
	commitResumeInner,
	attemptHiddenReveal,
	rebaseOffscreenEffectSeq,
} from './render.js';
import { registeredEnqueueInlineCaughtError, noteRecoverableHydrationError } from './roots.js';
import { isAdoptionControl, markHydrationDiscard } from './hydration-presentation.js';
import { applyStyleValue, applyStyleProperty } from './host-props.js';
import type { OctaneNode } from './elements.js';
import { childrenTryBlock, discardOffscreenCapture } from './component-slots.js';
import { childSlot } from './child-slots.js';
import { freshSlotEnd, settleFreshSlot } from './branches.js';
import { forEachSubtreeChild, collectVisibleSubtreeRefs, deactivateScope } from './activity.js';
import { removeRange } from './lists.js';
import {
	JOURNAL_BAG,
	JOURNAL_PROP,
	BAG_SIZE,
	slotNext,
	slotFrontier,
	queueFrontier,
	noteFrontierMember,
	usesFrontier,
	applySlotNext,
	journalBag,
	journalObjectOnce,
	rollbackTransitionJournal,
} from './commit.js';
import { getNextSibling } from './templates.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

export let EFFECT_RECONNECT_CONTEXT: EffectReconnectContext | null = null;
let flushingStagedReveals = false;
export let deferringStagedRevealEffects = false;
// Ordinary roots also capture commit work. Keep their generic publication path
// independent of Suspense until a boundary actually records a visibility change.
export let PUBLISH_SUSPENSE_COMMIT: ((state: TrySlot) => void) | null = null;

/**
 * `<Suspense fallback={…}>…</Suspense>` — the JSX component form of
 * `@try { … } @pending { fallback }`, for authors writing JSX rather than the
 * template directives (e.g. porting React / react-query code). A thin built-in
 * over the same `tryBlock` primitive the directives compile to: the children
 * render as the try body, and `fallback` renders as the pending body whenever a
 * descendant suspends (via `use(thenable)`).
 */
// `children` is typed as a renderable (`unknown`), not `ComponentBody`: the
// compiler lowers directive/JSX children to a body, but JSX-form usage types
// children as element values (`Octane.JSX.Element`), and the de-opt path
// renders element descriptors directly.
export const Suspense: ComponentBody<{ fallback?: unknown; children: unknown }> =
	/* @__PURE__ */ markComponentFlags<ComponentBody<{ fallback?: unknown; children: unknown }>>(
		function Suspense(props, scope) {
			const pendingBody: ComponentBody = (_p, s) => {
				childSlot(s, 1, s.block.parentNode, props.fallback, s.block.endMarker);
			};
			childrenTryBlock(scope, props, null, pendingBody);
		},
		COMPONENT_FLAG_BOUNDARY,
		'Suspense',
		SUSPENSE_TAG,
	);

export const ViewTransition: ComponentBody<ViewTransitionProps> =
	/* @__PURE__ */ initializeViewTransitionComponent();

const CATCH_ENTRY = /* @__PURE__ */ Symbol('octane.catch-entry');

function catchProps(error: unknown, reset: () => void, entered: boolean) {
	return { err: error, reset, [CATCH_ENTRY]: entered };
}

/** Run binding-owned error reporting once, synchronously, in the active catch arm. */
export function __runOnCatch(callback: () => void): void {
	const props = CURRENT_SCOPE === CURRENT_BLOCK ? CURRENT_BLOCK?.props : null;
	if (props == null || typeof props[CATCH_ENTRY] !== 'boolean') {
		throw new Error(formatClientError(350));
	}
	if (props[CATCH_ENTRY]) {
		props[CATCH_ENTRY] = false;
		callback();
	}
}

/**
 * `<ErrorBoundary fallback={…}>…</ErrorBoundary>` — the JSX component form of
 * `@try { … } @catch (e) { fallback }`. `fallback` is either a renderable or a
 * `(error, reset) => renderable` render prop (react-error-boundary style). When a
 * descendant throws during render/effects, the boundary swaps to the fallback.
 * Suspensions propagate to an enclosing Suspense boundary instead.
 */
export const ErrorBoundary: ComponentBody<{
	fallback?: unknown | ((error: unknown, reset: () => void) => unknown);
	resetRef?: { current: (() => void) | null };
	// Renderable, not ComponentBody — same reasoning as Suspense above.
	children: unknown;
}> = /* @__PURE__ */ markComponentFlags<
	ComponentBody<{
		fallback?: unknown | ((error: unknown, reset: () => void) => unknown);
		resetRef?: { current: (() => void) | null };
		children: unknown;
	}>
>(
	function ErrorBoundary(props, scope) {
		const catchBody: ComponentBody<{ err: unknown; reset: () => void }> = (catchProps, s) => {
			const fb =
				typeof props.fallback === 'function'
					? (props.fallback as (e: unknown, r: () => void) => unknown)(
							catchProps.err,
							catchProps.reset,
						)
					: props.fallback;
			childSlot(s, 1, s.block.parentNode, fb, s.block.endMarker);
		};
		const reset = childrenTryBlock(scope, props, catchBody, null, true);
		const previousResetRef = scope.slots[1] as { current: (() => void) | null } | undefined;
		if (previousResetRef !== props.resetRef) {
			if (previousResetRef?.current === reset) previousResetRef.current = null;
			scope.slots[1] = props.resetRef;
		}
		if (props.resetRef) props.resetRef.current = reset;
	},
	COMPONENT_FLAG_BOUNDARY,
	'ErrorBoundary',
);

/**
 * The virtual-TSX (IDE / tsrx-tsc) name for `@try { … } @catch (e) { … }`: the
 * shared tsrx transform's type-only output emits the catch clause as
 * `fallback={(error, _reset) => …}`. Runtime compilation never references this
 * name (`@try` lowers to `tryBlock`), so this exists for TYPES: the
 * function-typed `fallback` (unlike `ErrorBoundary`'s renderable-or-render-prop
 * union, which collapses to `unknown`) gives the emitted arrow contextual
 * parameter types, so authored `@catch` bindings type-check under
 * `noImplicitAny`. `content` is the transform's expression-position prop form of
 * children. The virtual TSX now imports the renderer-neutral stand-in from
 * `octane/tsrx-boundary`; this export remains for existing imports.
 */
export const TsrxErrorBoundary = ErrorBoundary as unknown as (props: {
	fallback?: (error: unknown, reset: () => void) => unknown;
	content?: unknown;
	children?: unknown;
}) => OctaneNode;

// Optional visibility overlays must not add a WeakMap lookup to ordinary text
// or style updates. Their writers are installed only while hidden hosts exist.
export let hiddenTextWriter: ((node: Text, value: string) => boolean) | null = null;
export let hiddenStyleWriter:
	((el: HTMLElement | SVGElement, value: any, previous: any, property?: string) => boolean) | null =
	null;

// ---------------------------------------------------------------------------
// Control flow: tryBlock — error boundary, catches render + effect errors
// ---------------------------------------------------------------------------

/**
 * An already-visible transition shell stays mounted until its replacement is
 * ready, matching React. Initial/new boundaries can still show their fallback.
 *
 * `setTransitionFallbackTimeout(ms)` is an explicit Octane extension: a finite
 * non-negative timeout opts into replacing held content with @pending. Infinity
 * restores the default, with no timeout allocated for a held transition.
 */
let TRANSITION_FALLBACK_TIMEOUT_MS = Infinity;

export function setTransitionFallbackTimeout(ms: number): void {
	TRANSITION_FALLBACK_TIMEOUT_MS = ms;
}

export function getTransitionFallbackTimeout(): number {
	return TRANSITION_FALLBACK_TIMEOUT_MS;
}

// The retry-only commit window is global, but pending commits belong to
// individual roots. Octane uses 100ms (React uses 300ms). Rendering a retry
// still happens promptly, including discovering dependent requests; only
// publishing its completed work waits.
const SUSPENSE_RETRY_THROTTLE_MS = 100;
let mostRecentSuspenseCommit = -Infinity;
interface SuspenseRetryError {
	error: unknown;
}
interface SuspenseRetryBatch {
	states: Map<TrySlot, OffscreenCapture | SuspenseRetryError | null>;
	timer: ReturnType<typeof setTimeout> | null;
	queued: boolean;
	flushing: boolean;
	/** Cold observers recheck readiness after a commit or a superseding render. */
	afterCommit?: Array<() => void> | undefined;
}
const SUSPENSE_RETRIES = new Map<Block, SuspenseRetryBatch>();
let flushingSuspenseRetries = false;

function suspenseRetryRoot(block: Block): Block {
	while (block.parentBlock !== null) block = block.parentBlock;
	return block;
}

export function suspenseRetryBatchForSubtree(block: Block): SuspenseRetryBatch | null {
	if (SUSPENSE_RETRIES.size === 0) return null;
	const batch = SUSPENSE_RETRIES.get(suspenseRetryRoot(block));
	if (batch !== undefined) {
		for (const state of batch.states.keys()) {
			if (state.parentBlock === block || blockIsAncestorOf(block, state.parentBlock)) return batch;
		}
	}
	return null;
}

function notifySuspenseRetryObservers(batch: SuspenseRetryBatch): void {
	const observers = batch.afterCommit;
	if (observers === undefined) return;
	batch.afterCommit = undefined;
	// Cancellation can happen mid-render. Observe its outcome only after that
	// render's commit, and never retain abandoned Hydrate owners in a live batch.
	queueMicrotask(() => {
		for (const observer of observers) observer();
	});
}

function releaseSuspenseRetryBatch(root: Block, batch: SuspenseRetryBatch): void {
	if (batch.states.size !== 0 || batch.flushing) return;
	if (batch.timer !== null) clearTimeout(batch.timer);
	SUSPENSE_RETRIES.delete(root);
	// No extra root walk on ordinary scheduled renders once the last pending
	// retry commits or is canceled. The existing visibility driver owns the hook.
	if (SUSPENSE_RETRIES.size === 0) SCHEDULED_VISIBILITY_DRIVER!.find = findScheduledVisibilityOwner;
}

export function cancelSuspenseRetry(state: TrySlot): void {
	if (SUSPENSE_RETRIES.size === 0) return;
	const root = suspenseRetryRoot(state.parentBlock);
	const batch = SUSPENSE_RETRIES.get(root);
	if (batch === undefined || !batch.states.delete(state)) return;
	releaseSuspenseRetryBatch(root, batch);
	notifySuspenseRetryObservers(batch);
}

function scheduleSuspenseRetryBatch(root: Block, batch: SuspenseRetryBatch): void {
	if (batch.queued || batch.flushing) return;
	batch.queued = true;
	queueMicrotask(() => {
		batch.queued = false;
		if (SUSPENSE_RETRIES.get(root) !== batch) return;
		if (batch.timer !== null) clearTimeout(batch.timer);
		batch.timer = null;
		const remaining = mostRecentSuspenseCommit + SUSPENSE_RETRY_THROTTLE_MS - performance.now();
		if (actScopeDepth !== 0 || remaining <= 10) {
			flushSuspenseRetryBatch(root, batch);
		} else {
			// Do not recalculate at fire time: another root can commit a fallback
			// meanwhile without postponing this root's already-scheduled reveal.
			batch.timer = setTimeout(() => flushSuspenseRetryBatch(root, batch), remaining);
		}
	});
}

export function queueSuspenseRetry(state: TrySlot, error?: SuspenseRetryError): void {
	const root = suspenseRetryRoot(state.parentBlock);
	let batch = SUSPENSE_RETRIES.get(root);
	if (batch === undefined) {
		batch = { states: new Map(), timer: null, queued: false, flushing: false };
		SUSPENSE_RETRIES.set(root, batch);
		SCHEDULED_VISIBILITY_DRIVER!.find = findHiddenOwnerWithSuspenseRetries;
	}
	batch.states.set(state, error ?? state.stagedCapture);
	scheduleSuspenseRetryBatch(root, batch);
}

function findHiddenOwnerWithSuspenseRetries(
	block: Block | null,
	includeActivity: false,
): TrySlot | null;
function findHiddenOwnerWithSuspenseRetries(
	block: Block | null,
	includeActivity: true,
	visibleMode?: 'urgent' | 'transition',
): ScheduledVisibilityOwner | null;
function findHiddenOwnerWithSuspenseRetries(
	block: Block | null,
	includeActivity: boolean,
	visibleMode?: 'urgent' | 'transition',
): ScheduledVisibilityOwner | null {
	if (block !== null) {
		const root = suspenseRetryRoot(block);
		const batch = SUSPENSE_RETRIES.get(root);
		// New work in THIS root supersedes its completed retry render, even if
		// it only updates a sibling. Coalesce after the synchronous render, using
		// the most recent visibility change; independent roots keep their timer.
		if (batch !== undefined) scheduleSuspenseRetryBatch(root, batch);
	}
	return includeActivity
		? findScheduledVisibilityOwner(block, true, visibleMode)
		: findScheduledVisibilityOwner(block, false);
}

/**
 * The boundary whose hydration failed, while its client render runs. Like
 * React's dehydrated boundary, it already counts as showing a fallback, so the
 * `@pending` arm that render shows does not restart the retry throttle.
 */
let DEHYDRATED_TRY: TrySlot | null = null;

export function recordSuspenseCommit(state: TrySlot): void {
	if (state.parentBlock.disposed || state === DEHYDRATED_TRY) return;
	if (WIP_CAPTURE !== null) {
		PUBLISH_SUSPENSE_COMMIT ??= recordSuspenseCommit;
		(WIP_CAPTURE.suspenseCommits ??= new Set()).add(state);
		return;
	}
	// A nested fallback inside an uncommitted Suspense primary is speculative.
	// Hidden Activity is different: its committed fallbacks still advance React's
	// retry window, even though Activity owns an additional visibility hide.
	if (findSuspenseHiddenTry(state.parentBlock) !== null) return;
	mostRecentSuspenseCommit = performance.now();
}

function flushSuspenseRetryBatch(root: Block, batch: SuspenseRetryBatch): void {
	if (SUSPENSE_RETRIES.get(root) !== batch) return;
	if (batch.timer !== null) clearTimeout(batch.timer);
	batch.timer = null;
	const run = (): void => {
		if (SUSPENSE_RETRIES.get(root) !== batch) return;
		batch.flushing = true;
		const entries = [...batch.states].sort(([a], [b]) => compareStagedRevealDomOrder(a, b));
		const previousDeferral = deferringStagedRevealEffects;
		const previousFlushing = flushingSuspenseRetries;
		deferringStagedRevealEffects = true;
		flushingSuspenseRetries = true;
		try {
			for (const [state, capture] of entries) {
				// Cleanup/ref callbacks can supersede or unmount a later sibling.
				// Its old completed render must never publish over that newer work.
				if (!batch.states.has(state) || batch.states.get(state) !== capture) continue;
				batch.states.delete(state);
				if (state.parentBlock.disposed || state.branch !== 2 || state.pendingThenable !== null)
					continue;
				if (capture !== null && 'error' in capture) {
					// Preserve the failed attempt's exact reason. Re-rendering here
					// could lose a one-shot error (e.g. a thenable subscription throw).
					handleResumeError(state.tryBlock ?? state.parentBlock, capture.error);
				} else {
					if (capture !== null) rebaseOffscreenEffectSeq(capture);
					commitResume(state);
				}
			}
		} finally {
			deferringStagedRevealEffects = previousDeferral;
			flushingSuspenseRetries = previousFlushing;
			batch.flushing = false;
			releaseSuspenseRetryBatch(root, batch);
			if (batch.states.size !== 0) scheduleSuspenseRetryBatch(root, batch);
			if (!previousDeferral) commitEffects();
			notifySuspenseRetryObservers(batch);
		}
	};
	// The root's complete reveal is one view transition and one lifecycle commit.
	if (
		!VIEW_TRANSITION_DRIVER ||
		!VIEW_TRANSITION_DRIVER.wrapResume(run, () =>
			[...batch.states.keys()].map((state) => state.parentBlock),
		)
	)
		run();
}

interface HiddenDisplay {
	owners: number;
	importantOwners: number;
	value: string;
	priority: string;
	hadStyle: boolean;
}

interface HiddenText {
	owners: number;
	data: string;
}

export interface SuspenseHiddenDom {
	displays: Set<HTMLElement>;
	texts: Set<Text>;
	active: boolean;
}

// Activity and nested Suspense boundaries can own the same physical host
// (notably a portal range). Capture authored state only for the first owner and
// restore it only after the last owner reveals, independent of hide/reveal order.
export const HIDDEN_DISPLAYS = new WeakMap<HTMLElement, HiddenDisplay>();
const HIDDEN_TEXTS = new WeakMap<Text, HiddenText>();
export let hiddenDisplayNodes = 0;
let hiddenTextNodes = 0;
let HIDDEN_ACTIVITY_NODES: WeakMap<Node, number> | null = null;
let hiddenActivityNodeOwners = 0;

export function retainHiddenActivityNode(node: Node): void {
	const hidden = (HIDDEN_ACTIVITY_NODES ??= new WeakMap<Node, number>());
	hidden.set(node, (hidden.get(node) ?? 0) + 1);
	hiddenActivityNodeOwners++;
}

export function releaseHiddenActivityNode(node: Node): void {
	const hidden = HIDDEN_ACTIVITY_NODES;
	const owners = hidden?.get(node);
	if (owners === undefined) return;
	if (owners === 1) hidden!.delete(node);
	else hidden!.set(node, owners - 1);
	hiddenActivityNodeOwners--;
}

/** Activity hides exclude their preserved hosts from every Fragment-ref API. */
export function fragmentHostVisible(node: Node): boolean {
	if (hiddenActivityNodeOwners === 0) return true;
	const hidden = HIDDEN_ACTIVITY_NODES!;
	for (let current: Node | null = node; current !== null; current = current.parentNode) {
		if (hidden.has(current)) return false;
	}
	return true;
}

export function enforceHiddenDisplay(el: HTMLElement): void {
	const hidden = HIDDEN_DISPLAYS.get(el);
	const priority = hidden !== undefined && hidden.importantOwners > 0 ? 'important' : '';
	const style = el.style;
	if (
		style.getPropertyValue('display') !== 'none' ||
		style.getPropertyPriority('display') !== priority
	)
		style.setProperty('display', 'none', priority);
}

function restoreHiddenDisplayValue(el: HTMLElement | SVGElement, display: HiddenDisplay): void {
	if (display.value === '') el.style.removeProperty('display');
	else el.style.setProperty('display', display.value, display.priority);
	if (!display.hadStyle && el.getAttribute('style') === '') el.removeAttribute('style');
}

/**
 * Apply an authored style against its real previous value, underneath the hide.
 * The style setters call this before they journal. A root render's write lands
 * at its commit, so the render leaves the hidden host as it is and a dropped
 * render writes nothing (#2043); only the binding cache its caller moves needs
 * a snapshot. Any other write, a commit function's included, lands now.
 */
function writeHiddenStyle(
	el: HTMLElement | SVGElement,
	value: any,
	previous: any,
	property?: string,
): boolean {
	if (!HIDDEN_DISPLAYS.has(el as HTMLElement)) return false;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		if (TRANSITION_JOURNAL !== null) journalBag();
		transaction.ops.push(commitHiddenStyle, [el, value, previous, property, CURRENT_SCOPE]);
	} else {
		if (TRANSITION_JOURNAL !== null) journalBag();
		commitHiddenStyle([el, value, previous, property, null]);
	}
	return true;
}

/**
 * Write a hidden host's authored style under its hide. A reveal earlier in the
 * same commit may have released the host: the write is then an ordinary one.
 * A queued write's error reaches its scope's boundary, as a commit function's
 * does.
 */
function commitHiddenStyle([el, value, previous, property, scope]: [
	HTMLElement | SVGElement,
	any,
	any,
	string | undefined,
	Scope | null,
]): void {
	const hidden = HIDDEN_DISPLAYS.get(el as HTMLElement);
	if (hidden !== undefined && TRANSITION_JOURNAL !== null) {
		TRANSITION_JOURNAL.push(
			JOURNAL_PROP,
			hidden,
			'value',
			hidden.value,
			JOURNAL_PROP,
			hidden,
			'priority',
			hidden.priority,
			JOURNAL_PROP,
			hidden,
			'hadStyle',
			hidden.hadStyle,
		);
	}
	if (hidden !== undefined) restoreHiddenDisplayValue(el, hidden);
	try {
		if (property === undefined) applyStyleValue(el, el.style, value, previous);
		else if (value == null || typeof value === 'boolean')
			el.style.removeProperty(styleName(property));
		else applyStyleProperty(el, el.style, property, value);
	} catch (error) {
		if (scope === null) throw error;
		reportEffectError(scope.block, error);
	} finally {
		if (hidden !== undefined) {
			hidden.value = el.style.getPropertyValue('display');
			hidden.priority = el.style.getPropertyPriority('display');
			hidden.hadStyle = el.hasAttribute('style');
			enforceHiddenDisplay(el as HTMLElement);
		}
	}
}

function writeHiddenText(node: Text, value: string): boolean {
	const hidden = HIDDEN_TEXTS.get(node);
	if (hidden === undefined) return false;
	if (TRANSITION_JOURNAL !== null)
		TRANSITION_JOURNAL.push(JOURNAL_PROP, hidden, 'data', hidden.data);
	hidden.data = value;
	return true;
}

export function retainHiddenDisplay(el: HTMLElement, important: boolean): void {
	const existing = HIDDEN_DISPLAYS.get(el);
	if (existing === undefined) {
		hiddenDisplayNodes++;
		hiddenStyleWriter = writeHiddenStyle;
		HIDDEN_DISPLAYS.set(el, {
			owners: 1,
			importantOwners: important ? 1 : 0,
			value: el.style.getPropertyValue('display'),
			priority: el.style.getPropertyPriority('display'),
			hadStyle: el.hasAttribute('style'),
		});
	} else {
		existing.owners++;
		if (important) existing.importantOwners++;
	}
	enforceHiddenDisplay(el);
}

export function releaseHiddenDisplay(el: HTMLElement, important: boolean, restore = true): void {
	const display = HIDDEN_DISPLAYS.get(el);
	if (display === undefined) return;
	if (important) display.importantOwners--;
	if (--display.owners === 0) {
		HIDDEN_DISPLAYS.delete(el);
		if (--hiddenDisplayNodes === 0) hiddenStyleWriter = null;
		if (restore) restoreHiddenDisplayValue(el, display);
	} else {
		enforceHiddenDisplay(el);
	}
}

export function enforceHiddenText(text: Text): void {
	if (text.data !== '') text.data = '';
}

export function retainHiddenText(text: Text): void {
	const existing = HIDDEN_TEXTS.get(text);
	if (existing === undefined) {
		hiddenTextNodes++;
		hiddenTextWriter = writeHiddenText;
		HIDDEN_TEXTS.set(text, { owners: 1, data: text.data });
	} else existing.owners++;
}

export function releaseHiddenText(text: Text, restore = true): void {
	const saved = HIDDEN_TEXTS.get(text);
	if (saved === undefined) return;
	if (--saved.owners === 0) {
		HIDDEN_TEXTS.delete(text);
		if (--hiddenTextNodes === 0) hiddenTextWriter = null;
		if (restore) text.data = saved.data;
	} else {
		enforceHiddenText(text);
	}
}

// Keep Suspense-specific teardown out of the always-live generic slot walk.
// The visible arm must still unmount before its preserved hidden primary.
export function teardownTrySlot(state: TrySlot, detachDom: boolean): void {
	if (state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
	if (hydrationStarted) initialSuspenseHydrations?.delete(state);
	cancelSuspenseRetry(state);
	HIDDEN_REVEAL_ACTIONS?.delete(state);
	if (state.block !== null) unmountBlock(state.block, detachDom);
	discardOffscreenCapture(state.stagedCapture);
	state.stagedCapture = null;
	state.stagedEffectDeps = null;
	const hadDetachedRefs = state.detachedRefs !== null;
	state.detachedRefs = null;
	state.pendingThenable = null;
	if (state.tryBlock !== null && state.tryBlock !== state.block) {
		const hiddenTry = state.tryBlock;
		let suppressedRefs: SuspenseRefEntry[] | null = null;
		if (hadDetachedRefs) {
			suppressedRefs = [];
			collectVisibleSubtreeRefs(hiddenTry, suppressedRefs);
		}
		showTryBlock(state);
		withRefDetachSuppression(suppressedRefs, () => {
			unmountBlock(hiddenTry, true);
		});
		state.tryBlock = null;
	}
	// Disposal releases the pending cue and the transition work it held as well
	// as group membership. Removing only the member strands later transitions.
	releaseHeldTransition(state);
	setTryBranch(state, -1);
	state.block = null;
}

/** Catch-only JSX boundaries never preserve a hidden Suspense primary. */
export interface ErrorSlot {
	__kind: 'errorSlotSlot';
	__flags: typeof SLOT_FLAG_TEARDOWN;
	__teardown: typeof teardownErrorSlot;
	start: Comment;
	end: Comment;
	branch: -1 | 0 | 1 | 2;
	block: Block | null;
	tryBody: ComponentBody;
	catchBody: ComponentBody;
	env: any[] | undefined;
	hasResolved: boolean;
	err: any;
	detachedRefs: null;
	domParent: Node;
	parentBlock: Block;
	idState: RootIdState;
	passthrough: boolean;
	reset: () => void;
	next: SlotNext | null;
}

function teardownErrorSlot(state: ErrorSlot, detachDom: boolean): void {
	if (state.block !== null) unmountBlock(state.block, detachDom);
	state.block = null;
	setTryBranch(state, -1);
}

/**
 * Detached retry/error callbacks still publish through the owning root journal.
 * Their arms build off-document (insertArmPair), so a dropped render restores
 * only the slot's record.
 */
function beginDetachedBoundaryRender(state: TrySlot | ErrorSlot): RootRenderFrame | null {
	const frame =
		WIP_CAPTURE === null ? beginRootRender(state.parentBlock.idState.renderOwner) : null;
	if (ROOT_RENDER_TRANSACTION === null || ROOT_RENDER_ROLLBACK) return frame;
	if (frame === null) journalObjectOnce(state);
	else {
		// A frame of its own opens a window nothing has snapshotted in yet: one
		// snapshot per resume, with no lookup.
		TRANSITION_JOURNAL_BAGS!.set(state, TRANSITION_JOURNAL!.length);
		TRANSITION_JOURNAL!.push(JOURNAL_BAG, state, { ...state }, null);
	}
	return frame;
}

/**
 * Insert an arm's marker pair before `before` and return the arm's parent. A
 * root render that changes a committed boundary (usesFrontier) builds the arm
 * in the slot's frontier, which its commit inserts before `before`, so a
 * dropped render leaves the boundary untouched. A fresh arm the same render
 * supersedes leaves the fragment with its own unmount. Hydration and a
 * boundary this render created write in place.
 */
function insertArmPair(state: TrySlot | ErrorSlot, start: Node, end: Node, before: Node): Node {
	const live = before.parentNode!;
	// Hydration's discarded server arm opened the slot's frontier already.
	const parent =
		live === state.domParent &&
		((hydrationStarted && state.next !== null && state.next.tx === ROOT_RENDER_TRANSACTION) ||
			usesFrontier(state.parentBlock, live))
			? slotFrontier(state, state.parentBlock, live, before)
			: live;
	const at = parent === live ? before : null;
	parent.insertBefore(start, at);
	parent.insertBefore(end, at);
	return parent;
}

/**
 * Hydration renders `state`'s arm on the client instead of adopting the
 * server's content in the boundary's range. That content leaves at commit,
 * where the arm, built in the slot's frontier (insertArmPair), lands. A
 * dropped render leaves the server's in place.
 */
export function discardServerArm(state: TrySlot | ErrorSlot): void {
	const first = getNextSibling(state.start);
	const end = state.end;
	if (ROOT_RENDER_TRANSACTION === null) {
		removeRange(first, end);
		return;
	}
	const next = slotNext(state);
	if (first !== end) next.out.push(null, first, end.previousSibling);
}

// Single mutation point for boundary branches. The bare assignment is the hot
// path; the devtools probe is fully behind the profile gate (dead-code
// eliminated in non-profile builds), so this adds only a boolean-guarded call
// over the plain assignment and no allocation/closure when unobserved. A catch
// arm ends the caught error's unwinding (HYDRATION_THROWN) and marks the root
// render as one that caught an error (RootRenderTransaction.caught).
export function setTryBranch(slot: TrySlot | ErrorSlot, next: -1 | 0 | 1 | 2): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBoundary(slot.branch, next);
	slot.branch = next;
	if (next === 0 && slot.catchBody !== null) {
		clearHydrationThrow();
		if (ROOT_RENDER_TRANSACTION !== null) ROOT_RENDER_TRANSACTION.caught = true;
	}
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		if (next === -1) {
			__devtoolsClearBoundary(slot);
		} else {
			const label =
				slot.parentBlock !== null && slot.parentBlock !== undefined
					? componentName(slot.parentBlock)
					: 'Suspense';
			__devtoolsSetBoundaryState(slot, next, slot.hasResolved, label);
		}
	}
}

function clearPassthroughTry(state: TrySlot): void {
	const visible = state.block;
	const persistent = state.tryBlock;
	if (visible !== null) unmountBlock(visible);
	if (persistent !== null && persistent !== visible) unmountBlock(persistent);
	state.block = null;
	state.tryBlock = null;
}

/**
 * A passthrough boundary's new arm, which renders into the boundary's parent
 * without markers of its own. Under a committed parent, or as the fallback that
 * replaces server content (`fresh`), it builds off-document, and its commit
 * appends it as the arm it replaces leaves.
 */
function passthroughArm(state: TrySlot, body: ComponentBody, props: any, fresh = false): Block {
	const block = createBlock(
		'control-flow',
		state.parentBlock,
		state.domParent,
		null,
		null,
		body,
		props,
		state.env,
	);
	if (fresh ? ROOT_RENDER_TRANSACTION !== null : usesFrontier(state.parentBlock, state.domParent)) {
		const frag = queueFrontier(block, state.domParent, null);
		block.parentNode = frag;
		noteFrontierMember(frag, block);
	}
	return (state.block = block);
}

function mountPassthroughCatch(
	state: TrySlot,
	error: unknown,
	reportInline = false,
	freshFallback = false,
): void {
	if (isAdoptionControl(error)) throw error;
	clearPassthroughTry(state);
	state.pendingThenable = null;
	setTryBranch(state, 0);
	state.err = error;
	if (state.catchBody === null) throw error;
	// A fallback for server content lands after that content has left
	// (removeOwnedContent).
	const hydration = freshFallback && hydrating ? CURSOR : null;
	const block = passthroughArm(
		state,
		state.catchBody,
		catchProps(error, state.reset, true),
		hydration !== null,
	);
	try {
		if (hydration !== null) hydration.suspend(() => renderBlock(block));
		else renderBlock(block);
	} finally {
		if (reportInline && ROOT_ERROR_HANDLERS) registeredEnqueueInlineCaughtError(state);
	}
}

function mountPassthroughPending(state: TrySlot, thenable: TrackedThenable<unknown>): void {
	clearPassthroughTry(state);
	setTryBranch(state, 2);
	state.pendingThenable = thenable;
	if (state.pendingBody !== null) renderBlock(passthroughArm(state, state.pendingBody, undefined));
	const retry = () => {
		if (state.pendingThenable !== thenable || state.parentBlock.disposed) return;
		state.pendingThenable = null;
		setTryBranch(state, -1);
		scheduleRender(state.parentBlock);
	};
	resumeOnSettle(thenable, retry);
}

function renderPassthroughTry(state: TrySlot): void {
	if (state.branch === 0 && state.block !== null) {
		state.block.body = state.catchBody!;
		state.block.props = catchProps(state.err, state.reset, false);
		state.block.extra = state.env;
		renderBlock(state.block);
		return;
	}
	if (state.branch === 2) {
		if (state.block !== null && state.pendingBody !== null) {
			state.block.body = state.pendingBody;
			state.block.extra = state.env;
			renderBlock(state.block);
		}
		return;
	}
	let block = state.tryBlock;
	if (block === null || block.disposed) {
		if (state.block !== null) unmountBlock(state.block);
		block = state.tryBlock = passthroughArm(state, state.tryBody, undefined);
		setTryBranch(state, 1);
		const rare = blockRare(block);
		rare.tryHandler = (error: unknown) => {
			try {
				mountPassthroughCatch(state, error);
			} catch (propagated) {
				const parent = findTryHandler(state.parentBlock);
				if (parent !== null) parent(propagated);
				else console.error(propagated);
			}
		};
		if (!state.propagateSuspense) {
			rare.suspenseHandler = (thenable: TrackedThenable<unknown>) => {
				mountPassthroughPending(state, thenable);
			};
		}
	} else {
		block.body = state.tryBody;
		block.extra = state.env;
	}
	const hydration = hydrating ? CURSOR : null;
	const beforeOwner = hydration?.passthroughRanges === true;
	try {
		if (hydration !== null) hydration.renderTryBody(block, state.catchBody !== null);
		else renderBlock(block);
		state.hasResolved = true;
	} catch (error) {
		if (isSuspenseException(error)) {
			if (state.propagateSuspense || (beforeOwner && !hydration!.passthroughRanges)) throw error;
			mountPassthroughPending(state, error.thenable);
		} else {
			mountPassthroughCatch(state, error, true, beforeOwner && !hydration!.passthroughRanges);
		}
	}
}

/**
 * Exact imported JSX ErrorBoundary lowering. Unlike @try, these boundaries
 * only catch application errors: suspension belongs to an enclosing Suspense.
 * Keeping their state independent lets catch-only applications discard the
 * hidden-primary, transition-hold, and off-screen rendering implementations.
 */
export function errorBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	tryBody: ComponentBody,
	catchBody: ComponentBody,
	anchor?: Node | null,
	env?: any[],
): () => void {
	// Wait for a queued parent self-update's replay, as tryBlock does.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return noop;
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	let state = parentScope.slots[slotKey] as ErrorSlot | undefined;
	// A boundary new under committed DOM builds in a frontier, as tryBlock's does.
	if (
		state === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentBlock.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentBlock, domParent, anchor);
		if (end !== null) {
			try {
				return errorBlock(parentScope, slotKey, end.parentNode!, tryBody, catchBody, end, env);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
		}
	}
	if (state === undefined) {
		const passthrough = hydration?.passthroughRanges === true;
		// As the server frames every boundary, a missing range is a mismatch,
		// unless the client built the range around the slot (branchOpen).
		const open = passthrough
			? null
			: (hydration?.branchOpen(anchor ?? null, domParent, parentScope, slotKey) ?? null);
		let start: Comment;
		let end: Comment;
		if (passthrough) {
			start = document.createComment('passthrough-try');
			end = document.createComment('/passthrough-try');
		} else if (open !== null) {
			start = open;
			end = hydration!.close(open);
		} else if (hydration !== null) {
			return hydration.suspend(() =>
				errorBlock(parentScope, slotKey, domParent, tryBody, catchBody, anchor, env),
			);
		} else {
			start = document.createComment('try');
			end = document.createComment('/try');
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		let newState: ErrorSlot;
		newState = {
			__kind: 'errorSlotSlot',
			__flags: SLOT_FLAG_TEARDOWN,
			__teardown: teardownErrorSlot,
			start,
			end,
			branch: -1,
			block: null,
			tryBody,
			catchBody,
			env,
			hasResolved: false,
			err: null,
			detachedRefs: null,
			domParent,
			parentBlock,
			idState: parentBlock.idState,
			passthrough,
			reset: () => requestReset(newState),
			next: null,
		};
		parentScope.slots[slotKey] = newState;
		registerSlot(parentScope, newState);
		if (domParent.nodeType === 11) noteFrontierMember(domParent, newState);
		state = newState;
	} else {
		// The env tuple carries the parent render's captured values, including the
		// fallback's. A descendant's later throw must not read a rolled-back render's.
		if (state.env !== env) journalRootProperty(state, 'env', state.env);
		state.tryBody = tryBody;
		state.catchBody = catchBody;
		state.env = env;
	}

	if (state.branch === 0) {
		const caught = state.block!;
		caught.body = state.catchBody;
		caught.props = catchProps(state.err, state.reset, false);
		caught.extra = state.env;
		renderBlock(caught);
	} else if (state.branch === 1 && state.block !== null) {
		const current = state.block;
		current.body = state.tryBody;
		current.extra = state.env;
		try {
			if (hydration !== null) hydration.renderTryBody(current, true);
			else renderBlock(current);
		} catch (error) {
			if (isHostContextRequest(error) || isSuspenseException(error) || isAdoptionControl(error))
				throw error;
			switchErrorToCatch(state, error, true);
		}
	} else mountErrorBoundary(state, hydration);
	// Hydration: park past the boundary's range, as every slot does, so a
	// following sibling adopts its own server content.
	if (!state.passthrough) hydration?.parkPast(state.end, parentScope);
	return state.reset;
}

/** Mount the boundary's try body, or its catch arm when the body throws. */
function mountErrorBoundary(state: ErrorSlot, hydration: HydrationCapability | null): void {
	if (state.block !== null) {
		const previous = state.block;
		state.block = null;
		unmountBlock(previous);
		if (state.parentBlock.disposed || state.block !== null) return;
	}
	// Only the boundary's first render adopts the server's range.
	const adopting = hydration !== null && state.branch === -1;
	setTryBranch(state, 1);
	let armParent = state.domParent;
	let start: Node | null = null;
	let end: Node | null = null;
	let freshBoundary = false;
	if (!state.passthrough) {
		const freshIds = adopting ? takeNativeFreshArm(hydration, state, state.idState) : null;
		if (freshIds !== null) {
			state.idState = freshIds;
			freshBoundary = true;
		}
		if (adopting && !freshBoundary) {
			[start, end] = hydration!.beginTryArm(state.start, state.end);
		} else {
			start = document.createComment('try-b');
			end = document.createComment('/try-b');
			armParent = insertArmPair(state, start, end, state.end);
		}
	}
	const body = createBlock(
		'control-flow',
		state.parentBlock,
		armParent,
		start,
		end,
		state.tryBody,
		undefined,
		state.env,
	);
	body.idState = state.idState;
	if (hydrationStarted && start === state.start) body.exclusiveMarkers = true;
	blockRare(body).tryHandler = (error: unknown) => {
		switchErrorToCatch(state, error);
		return state.block;
	};
	state.block = body;
	try {
		if (freshBoundary) hydration!.suspend(() => hydration!.renderTryBody(body, true));
		else if (hydration !== null) hydration.renderTryBody(body, true);
		else renderBlock(body);
		state.hasResolved = true;
	} catch (error) {
		if (isHostContextRequest(error) || isSuspenseException(error) || isAdoptionControl(error))
			throw error;
		switchErrorToCatch(state, error, true);
	}
}

function switchErrorToCatch(state: ErrorSlot, error: any, reportInline = false): void {
	if (isAdoptionControl(error)) throw error;
	const frame = beginDetachedBoundaryRender(state);
	try {
		switchErrorToCatchInner(state, error, reportInline);
	} catch (failure) {
		if (frame !== null) rollbackRootRender(frame.transaction);
		throw failure;
	} finally {
		endDetachedBoundaryRender(frame);
	}
}

function switchErrorToCatchInner(state: ErrorSlot, error: any, reportInline: boolean): void {
	const hydration = hydrating ? CURSOR : null;
	const previous = state.block;
	if (previous !== null) {
		state.block = null;
		// Hydrating, the body adopted server DOM, which its commit discards.
		unmountBlock(previous, hydration === null);
		if (state.parentBlock.disposed || state.block !== null) return;
	}
	state.hasResolved = false;
	setTryBranch(state, 0);
	state.err = error;
	let armParent = state.domParent;
	let start: Node | null = null;
	let end: Node | null = null;
	if (!state.passthrough) {
		start = document.createComment('catch-b');
		end = document.createComment('/catch-b');
		if (hydration !== null && hydration.isClose(state.end)) {
			discardServerArm(state);
			hydration.rebuiltSlot(state.end);
		}
		armParent = insertArmPair(state, start, end, state.end);
	}
	const caught = createBlock(
		'control-flow',
		state.parentBlock,
		armParent,
		start,
		end,
		state.catchBody,
		catchProps(error, state.reset, true),
		state.env,
	);
	caught.idState = state.idState;
	state.block = caught;
	let control = false;
	try {
		if (!state.passthrough && hydration !== null) {
			hydration.suspend(() => renderBlock(caught));
		} else {
			renderBlock(caught);
		}
	} catch (nextError) {
		if (forwardFallbackSuspension(caught, nextError)) return;
		// Hydration control flow passes through every application boundary.
		if (isAdoptionControl(nextError)) {
			control = true;
			throw nextError;
		}
		if (state.block !== null) {
			unmountBlock(state.block);
			state.block = null;
		}
		if (CURRENT_BLOCK !== null && findTryHandler(state.parentBlock) !== null) throw nextError;
		const parent = findTryHandler(state.parentBlock);
		if (parent !== null) parent(nextError);
		else console.error('catch body threw, no outer tryBlock:', nextError);
	} finally {
		if (reportInline && !control && ROOT_ERROR_HANDLERS) registeredEnqueueInlineCaughtError(state);
	}
}

export function tryBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	tryBody: ComponentBody,
	catchBody: ComponentBody | null,
	pendingBody: ComponentBody | null,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see TrySlot.env.
	env?: any[],
	// JSX ErrorBoundary must not become a catch-only Suspense boundary.
	propagateSuspense = false,
): () => void {
	// Slot arguments can queue a parent self-update. Like every other slot, wait
	// for the replay: mounting now would put this range before earlier siblings
	// that share its anchor, and could commit @catch or @pending, or suspend the
	// parent, from state the replay discards. Compiled callers ignore the reset.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return noop;
	// A catch arm handles application errors, not suspension. With no authored
	// pending arm, leave the previous screen to an enclosing Suspense or root.
	propagateSuspense ||= pendingBody === null;
	// A committed Suspense primary needs the same off-screen swap capability for
	// urgent branch replacements as transitions use: probe the replacement before
	// disposing browser-owned state, then either commit it or show @pending while
	// the old arm stays connected and hidden.
	if (pendingBody !== null) {
		ensureScheduledVisibilityDriver();
	}
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	if (hydrationStarted && TRY_OPS === null)
		TRY_OPS = {
			createBody: createTryBody,
			setBranch: setTryBranch,
			mount: mountTry,
			catchError: switchToCatch,
			inBoundary: inBoundaryRender,
			resumeError: handleResumeError,
			hiddenActivity: findHiddenActivity,
			take: takeInitialSuspenseHydration,
		};
	let state = parentScope.slots[slotKey] as TrySlot | undefined;
	if (
		state === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentBlock.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentBlock, domParent, anchor);
		if (end !== null) {
			try {
				return tryBlock(
					parentScope,
					slotKey,
					end.parentNode!,
					tryBody,
					catchBody,
					pendingBody,
					end,
					env,
					propagateSuspense,
				);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
		}
	}
	let supersedesInputs = false;
	// A boundary whose hydration has not finished yet.
	let initial =
		state === undefined || !hydrationStarted ? undefined : initialSuspenseHydrations?.get(state);
	let updated = false;
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		const passthrough = hydration?.passthroughRanges === true;
		// Hydration: the server (Phase 4) awaited use() and wrapped the resolved
		// SUCCESS arm (or @catch arm) in a `<!--[-->…<!--]-->` range. Adopt it as the
		// slot; mountTry brackets the content and the seeded use() values let the try
		// body render its success arm synchronously. `resolveHydrationOpen` also covers
		// the SOLE-hole case (a @try that is the only thing a component/arm renders —
		// the router `Match` shape `<Context> @try {…}`), where the anchor is the
		// enclosing scope's end marker and the cursor is parked on the @try's open.
		// As the server frames every boundary, a missing range is a mismatch,
		// unless the client built the range around the slot (branchOpen).
		const open = passthrough
			? null
			: (hydration?.branchOpen(anchor ?? null, domParent, parentScope, slotKey) ?? null);
		if (passthrough) {
			start = document.createComment('passthrough-try');
			end = document.createComment('/passthrough-try');
		} else if (open !== null) {
			start = open;
			end = hydration!.close(open);
		} else if (hydration !== null) {
			return hydration.suspend(() =>
				tryBlock(
					parentScope,
					slotKey,
					domParent,
					tryBody,
					catchBody,
					pendingBody,
					anchor,
					env,
					propagateSuspense,
				),
			);
		} else {
			start = document.createComment('try');
			end = document.createComment('/try');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (e.g. when this slot lives in a mixed-children
			// template and must sit before its in-template static-sibling anchor).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		let newState: TrySlot;
		newState = {
			__kind: 'trySlotSlot',
			__flags: SLOT_FLAG_TEARDOWN,
			__teardown: teardownTrySlot,
			start,
			end,
			branch: -1,
			block: null,
			tryBlock: null,
			hiddenDom: null,
			tryBody,
			catchBody,
			pendingBody,
			propagateSuspense,
			env,
			hasResolved: false,
			err: null,
			pendingThenable: null,
			stagedCapture: null,
			stagedEffectDeps: null,
			transitionHeld: false,
			transitionTimeoutId: null,
			detachedRefs: null,
			domParent,
			parentBlock,
			idState: parentBlock.idState,
			passthrough,
			reset: () => requestReset(newState),
			next: null,
		};
		parentScope.slots[slotKey] = newState;
		registerSlot(parentScope, newState);
		if (domParent.nodeType === 11) noteFrontierMember(domParent, newState);
		state = newState;
	} else {
		const retains = state.branch === 2 || state.retrySignalOwners !== undefined;
		const changed =
			(retains || initial !== undefined) &&
			(state.tryBody !== tryBody || (state.env !== env && depsChanged(state.env, env)));
		supersedesInputs = retains && changed;
		// New inputs, not the retry its wakeable scheduled, reached a boundary
		// whose hydration is suspended: as React does, it renders on the client.
		updated = initial !== undefined && changed;
		if (supersedesInputs) supersedeSignalRetryOwners(state);
		// A boundary can retry after its parent's render rolls back, e.g. when the
		// wakeable it was pending on settles. It must render the committed inputs.
		if (state.tryBody !== tryBody) journalRootProperty(state, 'tryBody', state.tryBody);
		if (state.catchBody !== catchBody) journalRootProperty(state, 'catchBody', state.catchBody);
		if (state.pendingBody !== pendingBody)
			journalRootProperty(state, 'pendingBody', state.pendingBody);
		state.tryBody = tryBody;
		state.catchBody = catchBody;
		state.pendingBody = pendingBody;
		state.propagateSuspense = propagateSuspense;
		// The boundary's own hold must keep these candidate inputs for retry. A
		// dropped transition restores the environment with the rest of its root.
		if (state.env !== env) journalRootProperty(state, 'env', state.env);
		state.env = env;
	}
	const s = state;
	// A boundary the server left to the client renders there (claimClientArm).
	if (
		hydrationStarted &&
		initial === undefined &&
		hydration !== null &&
		s.branch === -1 &&
		!s.passthrough &&
		claimClientArm(hydration, s)
	)
		return s.reset;
	if (initial === undefined && hydration !== null && s.branch === -1 && !s.propagateSuspense) {
		initial = takeInitialSuspenseHydration(s, hydration) ?? undefined;
		if (initial !== undefined) (initialSuspenseHydrations ??= new WeakMap()).set(s, initial);
	}
	if (initial !== undefined) {
		initialSuspenseHydrationRenderer!(s, initial, updated);
	} else if (s.passthrough) {
		renderPassthroughTry(s);
		return s.reset;
	} else if (s.branch === 0) {
		// Already showing catch — re-render with current err (props identity unchanged).
		s.block!.body = s.catchBody!;
		s.block!.props = catchProps(s.err, s.reset, false);
		s.block!.extra = s.env;
		renderBlock(s.block!);
	} else if (s.branch === 2 && s.tryBlock && !s.tryBlock.disposed && s.hiddenDom) {
		// Changed parent inputs replace an uncommitted primary; unchanged inputs
		// retry its preserved tree and native query owners without restarting them.
		attemptHiddenReveal(s, undefined, supersedesInputs ? 'parent' : 'update');
		// The fresh attempt may still be pending. Keep the already-mounted fallback
		// block (and its local state/focus), but render it with the latest helper and
		// captured environment so fallback text and actions cannot lag the request.
		if (s.branch === 2) refreshPendingBody(s);
	} else if (s.branch === 2) {
		// First-attempt hydration intentionally discards its adopted try block rather
		// than parking server DOM. A later prop update therefore has no hidden block
		// to retry; mount the current body immediately instead of waiting forever for
		// the obsolete hydration promise.
		mountTry(s);
	} else if (s.branch === 1 && s.tryBlock) {
		renderVisibleTry(s);
	} else {
		mountTry(s);
	}
	// Hydration: whichever arm rendered, park past the boundary's range, as every
	// slot does, so a following sibling adopts its own server content.
	hydration?.parkPast(s.end, parentScope);
	return s.reset;
}

function createTryBody(
	state: TrySlot,
	start: Node,
	end: Node,
	parent: Node = state.domParent,
): Block {
	const block = createBlock(
		'control-flow',
		state.parentBlock,
		parent,
		start,
		end,
		state.tryBody,
		undefined,
		state.env,
	);
	block.idState = state.idState;
	// A body that hydrated borrows the boundary's range (armRange).
	if (hydrationStarted && start === state.start) block.exclusiveMarkers = true;
	const rare = blockRare(block);
	rare.trySlot = state;
	rare.tryHandler = (error: unknown) => {
		switchToCatch(state, error);
		return state.block;
	};
	if (!state.propagateSuspense) {
		rare.suspenseHandler = (thenable: TrackedThenable<any>, sourceBlock: Block) => {
			handleSuspense(state, thenable, sourceBlock);
		};
	}
	state.tryBlock = block;
	return block;
}

/** New inputs abandon an initial primary that has never committed, not its fallback. */
export function restartUncommittedTry(state: TrySlot): Block | null {
	HIDDEN_REVEAL_ACTIONS?.delete(state);
	const old = state.tryBlock!;
	const refs: SuspenseRefEntry[] = [];
	collectVisibleSubtreeRefs(old, refs);
	showTryBlock(state);
	state.tryBlock = null;
	// Like a retry of a discarded hydration attempt; see supersedeSignalRetryOwners.
	if (signalDocumentEnabled || state.idState.renderOwner?.signalOwner !== undefined)
		handOverSignalRetryScope(old, old, state);
	supersedeSignalRetryOwners(state);
	// Neither these refs nor the primary's captured effects ever committed.
	// Its hook registrations still need real teardown (e.g. transition listeners).
	withRefDetachSuppression(refs, () => unmountBlock(old));
	if (state.parentBlock.disposed || state.tryBlock !== null || state.branch !== 2) return null;
	return mountHiddenTryBody(state);
}

/** Mount a discarded primary hidden and retry it, in one render (attachResume). */
function remountHiddenPrimary(state: TrySlot): void {
	mountHiddenTryBody(state);
	if (state.hiddenDom !== null) attemptHiddenReveal(state, 'urgent', 'retry');
	else commitResume(state);
}

/** A new primary can render speculatively without destroying its visible fallback. */
function mountHiddenTryBody(state: TrySlot): Block {
	const start = document.createComment('try-b');
	const end = document.createComment('/try-b');
	// Before the visible fallback, wherever it is.
	const armParent = insertArmPair(state, start, end, state.block?.startMarker ?? state.end);
	const block = createTryBody(state, start, end, armParent);
	state.detachedRefs = [];
	hideTryBlock(state);
	return block;
}

export interface InitialSuspenseHydration {
	metadata: ChildNode[];
	consume?: () => void;
	/**
	 * The template sentinel of a streamed boundary whose content had not arrived
	 * when hydration reached it (waitForStreamedArm), and the hydration that
	 * reached it, which reads the rest of the record once it has.
	 */
	waits?: Element;
	reader?: HydrationCapability;
	/** The range the body adopts (armRange), and its first server node. */
	start: Node;
	end: Node;
	first: Node | null;
	idStart: number;
	seedRaw: string | null;
	nativeRaw: string | null;
}

// Server metadata gives each resolved arm an independent adoption scope. The
// map retains only boundaries whose first client attempt has not completed.
export let initialSuspenseHydrations: WeakMap<TrySlot, InitialSuspenseHydration> | null = null;
// Transfer streamed payloads off the document-global stash as soon as hydration
// claims them. A weak DOM owner survives discarded nested attempts, but cannot
// retain a removed boundary for the remaining lifetime of the page.
let initialStreamedPayloads: WeakMap<
	Comment,
	{
		seedRaw: string | null;
		nativeRaw: string | null;
	}
> | null = null;

/**
 * The boundary operations that hydration performs on a Suspense or @try arm.
 * tryBlock, which alone creates a TrySlot, installs them once hydration has
 * started, so hydrating bundles that render no boundary do not ship the
 * boundary machinery that hydration would otherwise name directly.
 */
interface TryOps {
	createBody: typeof createTryBody;
	setBranch: typeof setTryBranch;
	mount: typeof mountTry;
	catchError: typeof switchToCatch;
	/** A boundary's retry, which runs as its root's render. */
	inBoundary: typeof inBoundaryRender;
	resumeError: typeof handleResumeError;
	hiddenActivity: typeof findHiddenActivity;
	/** The record a streamed boundary takes once its content arrived (waitForStreamedArm). */
	take: typeof takeInitialSuspenseHydration;
}
export let TRY_OPS: TryOps | null = null;

function takeInitialSuspenseHydration(
	state: TrySlot,
	hydration: HydrationCapability,
): InitialSuspenseHydration | null {
	// The boundary's open says what its server range holds (hydration-protocol.ts).
	const open = state.start as Comment;
	const binding = hydration.bindingTryState(open);
	const text = binding ?? open.data;
	let cursor = getNextSibling(open);
	const metadata: ChildNode[] = [];
	// A binding view's comment that says what the server rendered leads its arm.
	if (binding !== null && cursor?.nodeType === 8) {
		metadata.push(cursor);
		cursor = getNextSibling(cursor);
	}
	if (text.startsWith(BOUNDARY_STREAMED)) {
		// A sentinel still leads a pending boundary, whose fallback stays until its
		// content arrives (waitForStreamedArm).
		if (cursor?.nodeType === 1 && (cursor as Element).hasAttribute(STREAM_BOUNDARY_ATTR))
			return {
				metadata,
				start: open,
				end: state.end,
				first: null,
				idStart: 0,
				seedRaw: null,
				nativeRaw: null,
				waits: cursor as Element,
				reader: hydration,
			};
		const boundaryId = text.slice(BOUNDARY_STREAMED.length);
		const stash = typeof window !== 'undefined' ? (window as any).$OCTS : undefined;
		let payload = initialStreamedPayloads?.get(open);
		if (payload === undefined) {
			payload = {
				seedRaw: typeof stash?.[boundaryId] === 'string' ? stash[boundaryId] : null,
				nativeRaw:
					typeof stash?.[boundaryId + '$signals'] === 'string'
						? stash[boundaryId + '$signals']
						: null,
			};
			(initialStreamedPayloads ??= new WeakMap()).set(open, payload);
			if (stash !== undefined) {
				delete stash[boundaryId];
				delete stash[boundaryId + '$signals'];
			}
		}
		claimStreamedIds(state, boundaryId);
		const [start, end] = hydration.armRange(open, cursor, state.end);
		return {
			metadata,
			start,
			end,
			first: start === open ? cursor : getNextSibling(start),
			idStart: 0,
			...payload,
			consume: () => {
				initialStreamedPayloads?.delete(open);
			},
		};
	}
	const count = text.startsWith(BOUNDARY_CONTENT) ? boundaryIdCount(text) : -1;
	if (count < 0) return null;
	let seedRaw: string | null = null;
	let nativeRaw: string | null = null;
	for (const attr of [SUSPENSE_RESOLVED_SEED_ATTR, SUSPENSE_RESOLVED_NATIVE_ATTR]) {
		if (cursor?.nodeType !== 1) continue;
		const script = cursor as Element;
		if (
			script.localName !== 'script' ||
			script.getAttribute('type') !== 'application/json' ||
			!script.hasAttribute(attr)
		)
			continue;
		if (attr === SUSPENSE_RESOLVED_SEED_ATTR) seedRaw = script.textContent;
		else nativeRaw = script.textContent;
		metadata.push(script);
		cursor = getNextSibling(script);
	}
	const [start, end] = hydration.armRange(open, cursor, state.end);
	const rootIds = state.idState;
	const idStart = rootIds.next;
	reserveHydrationIds(rootIds, count);
	state.idState = {
		prefix: rootIds.prefix,
		next: idStart,
		limit: idStart + count,
		overflow: rootIds,
		renderOwner: rootIds.renderOwner,
	};
	return {
		metadata,
		start,
		end,
		first: start === open ? cursor : getNextSibling(start),
		idStart,
		seedRaw,
		nativeRaw,
	};
}

/** The ids of streamed boundary `id`, which the server's segment used. */
export function claimStreamedIds(state: TrySlot, id: string): void {
	const parentIds = state.parentBlock.idState;
	state.idState = {
		prefix: parentIds.prefix + 'b' + id + '-',
		next: 0,
		renderOwner: parentIds.renderOwner,
		signalState: parentIds.signalState,
	};
}

/**
 * Whether `state`, a streamed boundary that hydration reached before its
 * content arrived (InitialSuspenseHydration.waits), still waits. As React
 * leaves a pending dehydrated boundary, it keeps the server's fallback until
 * the stream swaps its content in or marks it errored, whose call to the retry
 * left on its open (STREAM_RETRY_PROP) retries it. Otherwise the boundary
 * takes its content's record, or, errored, renders on the client and reports
 * once, as React does. A server-rendered catch also retries on the client, but
 * is not a hydration failure. Returns the record to hydrate, or null.
 */
export function waitForStreamedArm(
	state: TrySlot,
	initial: InitialSuspenseHydration,
): InitialSuspenseHydration | null {
	const sentinel = initial.waits!;
	const open = state.start as Comment & { [STREAM_RETRY_PROP]?: (() => void) | undefined };
	const revealed = sentinel.parentNode === null;
	if (revealed || sentinel.hasAttribute(HYDRATE_STREAM_ERROR_ATTR))
		open[STREAM_RETRY_PROP] = undefined;
	else {
		const wait = new Promise<void>((resolve) => (open[STREAM_RETRY_PROP] = resolve));
		state.pendingThenable = wait as TrackedThenable<void>;
		resumeOnSettle(wait, () => {
			if (
				!state.parentBlock.disposed &&
				state.pendingThenable === wait &&
				initialSuspenseHydrations?.get(state) === initial
			)
				TRY_OPS!.inBoundary(state, retryInitialSuspenseHydration, initial);
		});
		return null;
	}
	initialSuspenseHydrations!.delete(state);
	const caught = revealed
		? initial.reader!.streamedArmMarker(open)?.nodeType === 8
		: sentinel.getAttribute(HYDRATE_STREAM_ERROR_ATTR) === BOUNDARY_CLIENT_CAUGHT;
	const taken = revealed && !caught ? TRY_OPS!.take(state, initial.reader!) : null;
	if (taken === null) {
		claimStreamedIds(state, sentinel.getAttribute(STREAM_BOUNDARY_ATTR)!);
		markArmDiscard(state);
		if (!clientRenderDehydratedTry(state, HYDRATION_PASS) && !caught)
			noteRecoverableHydrationError(() => new Error(formatClientError(347)), state.parentBlock);
		return null;
	}
	initialSuspenseHydrations!.set(state, taken);
	return taken;
}

export function finishInitialSuspenseHydration(initial: InitialSuspenseHydration): void {
	for (const node of initial.metadata) node.remove();
	initial.consume?.();
}

/**
 * Render a fallback owner (a Suspense arm or a Hydrate island) on the client
 * after its hydration failed. Returns whether a catch arm caught an error in
 * that render: as React's boundaries do, the owner then reports the caught
 * error alone, not its failed hydration (RootRenderTransaction.caught). An
 * error that escapes the render was thrown by client-rendered content, never
 * while hydrating (HYDRATION_THROWN).
 */
export function catchesInHydrationFallback(render: () => void): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	const caughtBefore = transaction?.caught === true;
	if (transaction !== null) transaction.caught = false;
	let caught = false;
	try {
		render();
	} catch (error) {
		noteHydrationThrow(error, null);
		throw error;
	} finally {
		if (transaction !== null) {
			caught = transaction.caught === true;
			transaction.caught = caught || caughtBefore;
		}
	}
	return caught;
}

/**
 * Render a Suspense arm whose hydration failed on the client, after its server
 * DOM was discarded (catchesInHydrationFallback). It is a dehydrated boundary
 * meanwhile (DEHYDRATED_TRY).
 */
function renderDehydratedTry(state: TrySlot, claimsRetryOwners = false): boolean {
	const previous = DEHYDRATED_TRY;
	DEHYDRATED_TRY = state;
	try {
		return catchesInHydrationFallback(() => TRY_OPS!.mount(state, claimsRetryOwners));
	} finally {
		DEHYDRATED_TRY = previous;
	}
}

/**
 * Render `state` on the client, as a dehydrated boundary is, when the
 * server left it to the client. Its `[$!rN` open (hydration-protocol.ts)
 * says the server's render threw, suspended, read values it cannot send, or
 * rendered an authored catch. A streamed `[$?id` boundary can likewise show
 * an errored fallback or a revealed catch. Octane cannot adopt these arms, so
 * the boundary claims its own id namespace (the N ids the server's render
 * reserved, or the stream's), and its commit replaces the server's content.
 * Leaving a sentinel would let a later stream swap overwrite client-owned
 * DOM. One the server marked errored (`e`, or `$OCTRX`) or suspended (`s`)
 * reports once, as React does, unless a catch arm caught an error in its
 * client render, which React reports alone. Returns whether `state` is one.
 * Only tryBlock calls it, behind `hydrationStarted`, so neither a client-only
 * bundle nor a hydrating one without boundaries ships it. The client render,
 * which swaps the hydration flags, stays on the capability (clientRender).
 */
function claimClientArm(hydration: HydrationCapability, state: TrySlot): boolean {
	const open = hydration.clientTryState(state.start);
	// Whether the server's render threw rather than suspended; null reports nothing.
	let errored: boolean | null = null;
	if (open.startsWith(BOUNDARY_CLIENT)) {
		const count = boundaryIdCount(open);
		if (count < 0) return false;
		reserveHydrationIds(state.idState, count);
		state.idState = {
			prefix: state.idState.prefix + 'n' + takeClientRootId() + '-',
			next: 0,
			renderOwner: state.idState.renderOwner,
		};
		const reason = open.charAt(BOUNDARY_CLIENT.length);
		if (reason === BOUNDARY_CLIENT_ERROR || reason === BOUNDARY_CLIENT_SUSPENDED)
			errored = reason === BOUNDARY_CLIENT_ERROR;
	} else if (open.startsWith(BOUNDARY_STREAMED)) {
		// A pending boundary waits for its content instead (waitForStreamedArm).
		const marker = hydration.streamedArmMarker(state.start);
		if (marker === null) return false;
		if (marker.nodeType === 1) {
			const reason = (marker as Element).getAttribute(HYDRATE_STREAM_ERROR_ATTR);
			if (reason === null) return false;
			if (reason !== BOUNDARY_CLIENT_CAUGHT) errored = true;
		}
		claimStreamedIds(state, open.slice(BOUNDARY_STREAMED.length));
	} else return false;
	hydration.clientRender(state, errored);
	return true;
}

/** Captured intent aimed at the server content of `state`, which its fallback discards, is dropped. */
export function markArmDiscard(state: TrySlot): void {
	markHydrationDiscard(
		state.parentBlock.idState.renderOwner,
		state.domParent,
		getNextSibling(state.start),
		state.end,
	);
}

/**
 * Discard the server DOM of a Suspense arm whose hydration failed or was
 * overtaken by an update, and render the arm on the client, as React does for
 * a dehydrated boundary. Returns whether a catch arm caught an error in that
 * render (renderDehydratedTry).
 */
export function clientRenderDehydratedTry(
	state: TrySlot,
	outer: HydrationCapability | null,
): boolean {
	initialSuspenseHydrations?.delete(state);
	// This discards the arm's metadata too. Leave a streamed payload with its
	// weak marker owner: a discarded enclosing attempt leaves the marker, and
	// hydrates the arm from it again, and a commit drops both together.
	discardServerArm(state);
	swapHydration(null);
	const previousNative = setNativeAdoptionResolver(null);
	try {
		return renderDehydratedTry(state, true);
	} finally {
		setNativeAdoptionResolver(previousNative);
		swapHydration(outer);
		// Outside any hydration, an error that escaped the client render ends here.
		if (outer !== null) outer.node = getNextSibling(state.end);
		else clearHydrationThrow();
		// Owners that the client render did not claim retire, unless it suspended
		// and retains its own for the retry.
		if (state.branch !== 2 && state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
	}
}

/**
 * Retry the hydration of a boundary whose attempt suspended. Only the
 * boundary renders, over its server arm, with the inputs and context it
 * holds: its parent does not render again. A retry inside a hidden Activity
 * stays hidden, and an error no boundary catches is its root's.
 */
export function retryInitialSuspenseHydration(
	state: TrySlot,
	initial: InitialSuspenseHydration,
): void {
	const hiddenActivity = TRY_OPS!.hiddenActivity(state.parentBlock);
	try {
		renderInitialSuspenseHydration(state, initial);
	} catch (error) {
		TRY_OPS!.resumeError(state.parentBlock, error);
	} finally {
		if (hiddenActivity !== null) SCHEDULED_VISIBILITY_DRIVER!.rehide!(hiddenActivity);
	}
}

/**
 * Mount the try body afresh. `claimsRetryOwners`: the query owners that a
 * discarded hydration attempt retained stay for this render to claim.
 */
export function mountTry(state: TrySlot, claimsRetryOwners = false): void {
	if (!claimsRetryOwners && state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
	cancelSuspenseRetry(state);
	HIDDEN_REVEAL_ACTIONS?.delete(state);
	const wasPending = state.branch === 2;
	const hydration = hydrating ? CURSOR : null;
	// Only a boundary's first render adopts the server's range.
	const adopting = hydration !== null && state.branch === -1;
	discardOffscreenCapture(state.stagedCapture);
	state.stagedCapture = null;
	state.stagedEffectDeps = null;
	state.detachedRefs = null;
	// Fresh start. If there's leftover state from a prior cycle (e.g. after
	// catch reset), clear it first. Compare `block` against the tryBlock we are
	// about to unmount so a visible try body isn't sent through unmountBlock a
	// second time (it's idempotent, but the second pass is pure waste).
	const oldTry = state.tryBlock;
	if (oldTry) {
		showTryBlock(state);
		unmountBlock(oldTry);
		state.tryBlock = null;
	}
	if (state.block && state.block !== oldTry) {
		unmountBlock(state.block);
	}
	state.block = null;
	state.hiddenDom = null;
	state.hasResolved = false;
	setTryBranch(state, 1);
	let bStart: Node;
	let bEnd: Node;
	let armParent = state.domParent;
	if (adopting) {
		// ADOPT the server's content, which the seeded use() values let the try
		// body render its success arm over.
		[bStart, bEnd] = hydration!.beginTryArm(state.start, state.end);
	} else {
		bStart = document.createComment('try-b');
		bEnd = document.createComment('/try-b');
		armParent = insertArmPair(state, bStart, bEnd, state.end);
	}
	const b = createTryBody(state, bStart, bEnd, armParent);
	state.block = b;
	try {
		if (hydration !== null) hydration.renderTryBody(b, state.catchBody !== null);
		else renderBlock(b);
		state.hasResolved = true;
		if (wasPending) recordSuspenseCommit(state);
	} catch (err) {
		// §6.3 control signal — bypass the local boundary (see the try-body
		// re-render catch above); the renderer-region owner handles it.
		if (isHostContextRequest(err) || isAdoptionControl(err)) throw err;
		if (isSuspenseException(err)) {
			if (state.propagateSuspense) throw err;
			handleSuspense(state, err.thenable, b);
		} else {
			if (state.tryBlock) {
				// Tear down the aborted try render's bookkeeping. Server DOM it adopted
				// leaves when the catch arm's commit discards it.
				unmountBlock(state.tryBlock, !adopting);
				state.tryBlock = null;
				state.block = null;
			}
			switchToCatch(state, err, true);
		}
	}
}

/**
 * Hide the try block's committed host range without disconnecting it. Elements
 * receive React's `display:none !important` treatment and direct text children
 * are blanked because they have no box to style. Keeping the nodes connected is
 * load-bearing browser state: removal resets scroll positions and other
 * platform-owned state even when the same node is inserted again later.
 *
 * The block, hooks, bindings, and DOM identities remain intact. Effects and refs
 * are handled separately by hideTryContentAndMountPending. Focus remains owned by
 * the connected hidden host, matching React DOM's hideInstance behavior.
 */
function hideBlockHostRange(block: Block, hidden: SuspenseHiddenDom): void {
	let node = getNextSibling(block.startMarker!) as ChildNode | null;
	while (node !== null && node !== block.endMarker) {
		if (node.nodeType === 1) {
			const el = node as HTMLElement;
			if (!hidden.displays.has(el)) {
				hidden.displays.add(el);
				retainHiddenDisplay(el, true);
			} else {
				enforceHiddenDisplay(el);
			}
		} else if (node.nodeType === 3) {
			const text = node as Text;
			if (!hidden.texts.has(text)) {
				hidden.texts.add(text);
				retainHiddenText(text);
			}
			enforceHiddenText(text);
		}
		node = getNextSibling(node) as ChildNode | null;
	}
}

function hideSuspensePortalRanges(scope: Scope, hidden: SuspenseHiddenDom): void {
	forEachSubtreeChild(scope, (child) => {
		const childBlock = child.block === child ? (child as Block) : null;
		if (childBlock?.kind === 'portal') hideBlockHostRange(childBlock, hidden);
		hideSuspensePortalRanges(child, hidden);
	});
}

/**
 * Hide the try block's range. A root render queues the hide for its commit,
 * after the content it built (HIDE), so a dropped render touches no DOM.
 */
export function hideTryBlock(state: TrySlot): void {
	const block = state.tryBlock;
	if (block === null || state.hiddenDom !== null) return;
	const hidden: SuspenseHiddenDom = {
		displays: new Set(),
		texts: new Set(),
		active: true,
	};
	// A body that hydrated borrows the boundary's range (armRange). The commit
	// that hides it gives it a range of its own first, so the arm that shows
	// beside it lies outside the body.
	const owns = hydrationStarted ? block.startMarker === state.start : false;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		journalRootProperty(state, 'hiddenDom', null);
		state.hiddenDom = hidden;
		if (owns) transaction.ops.push(ownTryBodyRange, state);
		transaction.ops.push(rehideTryBlock, state);
		return;
	}
	if (owns) ownTryBodyRange(state);
	state.hiddenDom = hidden;
	if (TRANSITION_JOURNAL !== null) {
		journalUndo(() => {
			if (state.hiddenDom === hidden) state.hiddenDom = null;
			releaseTryHide(hidden);
		});
	}
	hideBlockHostRange(block, hidden);
	hideSuspensePortalRanges(block, hidden);
}

/**
 * Give a body that borrows its boundary's range a pair of its own around its
 * content, as a client mount's body has. The arm beside it may have landed
 * already, before the boundary's end.
 */
function ownTryBodyRange(state: TrySlot): void {
	const block = state.tryBlock;
	if (block === null || block.disposed || block.startMarker !== state.start) return;
	const parent = state.start.parentNode!;
	const arm = state.block;
	const start = document.createComment('try-b');
	const end = document.createComment('/try-b');
	parent.insertBefore(start, getNextSibling(state.start));
	parent.insertBefore(
		end,
		arm !== null && arm !== block && arm.startMarker?.parentNode === parent
			? arm.startMarker
			: state.end,
	);
	block.startMarker = start;
	block.endMarker = end;
	block.exclusiveMarkers = false;
}

function rehideTryBlock(state: TrySlot): void {
	const hidden = state.hiddenDom;
	const block = state.tryBlock;
	if (hidden === null || !hidden.active || block === null || block.disposed) return;
	hideBlockHostRange(block, hidden);
	hideSuspensePortalRanges(block, hidden);
}

/**
 * Restore the host display/text state captured by hideTryBlock. A root render
 * queues the reveal (UNHIDE) where it starts, ahead of the content it patches.
 */
export function showTryBlock(state: TrySlot): void {
	const hidden = state.hiddenDom;
	if (hidden === null) return;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		journalRootProperty(state, 'hiddenDom', hidden);
		state.hiddenDom = null;
		transaction.ops.push(releaseTryHide, hidden);
		return;
	}
	state.hiddenDom = null;
	if (TRANSITION_JOURNAL !== null) {
		journalUndo(() => {
			state.hiddenDom = hidden;
			if (hidden.active) return;
			hidden.active = true;
			for (const el of hidden.displays) retainHiddenDisplay(el, true);
			for (const text of hidden.texts) {
				retainHiddenText(text);
				enforceHiddenText(text);
			}
		});
	}
	releaseTryHide(hidden);
}

function releaseTryHide(hidden: SuspenseHiddenDom): void {
	if (!hidden.active) return;
	hidden.active = false;
	for (const el of hidden.displays) releaseHiddenDisplay(el, true);
	for (const text of hidden.texts) releaseHiddenText(text);
}

/**
 * Decrement the transition counter we held open during a suspended transition.
 * Called from any path where the transition is now resolved or superseded.
 * No-op if no hold is currently held.
 */
export function releaseHeldTransition(state: TrySlot): void {
	if (state.transitionHeld) {
		state.transitionHeld = false;
		tickTransitionCount(-1);
		// An urgent supersede, error or unmount ends this boundary's hold. Its
		// transition work stays queued, and renders again without it.
		if (TRANSITION_ROOT_DRIVER) TRANSITION_ROOT_DRIVER.retry(state);
	}
	// This boundary stopped holding without a normal reveal (urgent supersede): drop it
	// from the entangled group so siblings staged behind it aren't left waiting.
	abandonHeldTransition(state);
	// Drop the fallback timeout too — an urgent setState clobbered the
	// transition, so the prior DOM is being replaced eagerly and a timeout-
	// driven @pending swap would race with the urgent commit.
	if (state.transitionTimeoutId !== null) {
		clearTimeout(state.transitionTimeoutId);
		state.transitionTimeoutId = null;
	}
}

export function handleSuspense(
	state: TrySlot,
	thenable: TrackedThenable<any>,
	sourceBlock: Block,
	// Journal position to restore if this suspend turns into a hold. `-1` from
	// every caller that renders outside an armed window (a fresh mount or a
	// retry, neither of which has committed content to keep whole).
	journalCheckpoint = -1,
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.BOUNDARY_SUSPEND);
	// Ordinary roots do not need hidden-subtree ancestry walks. Install this
	// capability before the first boundary can preserve a suspended primary.
	ensureScheduledVisibilityDriver();
	// Transition-priority suspends on an ALREADY-committed try block keep the
	// prior DOM visible — matches React's `useTransition` contract that the
	// previous screen stays mounted until the new tree is fully ready. We also
	// hold the transition counter open until the suspended render resumes, so
	// `useTransition`'s isPending stays true the whole time.
	//
	// The hold fires for the boundary's OWN body re-suspend AND for a DESCENDANT
	// re-suspend (a child component that re-rendered on its own — its own
	// scheduleRender — and suspended during a transition). `handleSuspense` is
	// only invoked for suspends routed to THIS boundary's `rare.suspenseHandler`
	// (the nearest enclosing tryBlock), so `sourceBlock` is always this
	// boundary's body OR a descendant within its subtree — we don't need to test
	// which. What we DO require is that the resolved try content is currently
	// committed AND intact:
	//   - branch === 1: the try body (not @pending / @catch) is the visible arm.
	//   - hiddenDom === null: that DOM is live and visible, not already hidden
	//     behind a committed fallback.
	// Both together guarantee the prior committed DOM is on screen and untouched.
	// For `use(thenable)` / `useSuspenseQuery` the suspend is thrown during the
	// descendant's setup BEFORE it patches any of its own JSX (the body aborts
	// before its childSlot/componentSlot commit), so no committed DOM was
	// mid-mutated — holding it as-is is correct. attachResume re-renders the held
	// tryBlock on resolve, which re-renders the descendant by key with its hook
	// state intact (same preserved-state contract the connected-hide path documents
	// below). A NON-transition descendant re-suspend skips this branch and falls
	// through to connected hide + @pending.
	// An urgent render supersedes the pending transition, even when it also
	// suspends. The fallback must become visible and the old pending cue end.
	const isTransition = sourceBlock.currentRenderMode === 'transition';
	if (isTransition && state.hasResolved && state.branch === 1 && state.hiddenDom === null) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.BOUNDARY_HOLD);
		// The body got part of the way through patching this boundary before the
		// suspend, so put back what it changed. Nothing has been painted since —
		// the render and this undo are the same synchronous flush — so the
		// boundary simply never shows half of the new screen.
		rollbackTransitionJournal(journalCheckpoint, state.tryBlock ?? sourceBlock);
		// The hold drops the root transaction when its render folded transition
		// hook work: this boundary then holds those batches (dropTransitionRender).
		if (ROOT_RENDER_TRANSACTION !== null && !ROOT_RENDER_ROLLBACK)
			(ROOT_RENDER_TRANSACTION.holders ??= []).push(state);
		if (!state.transitionHeld) {
			state.transitionHeld = true;
			tickTransitionCount(+1);
		}
		// Join the entangled-transition group so its reveal is coordinated with any
		// sibling boundaries suspended in the same transition (commit-barrier above).
		enterHeldTransition(state);
		// An explicitly configured finite timeout opts into a fallback swap. The
		// counter stays held — `isPending` remains true through the fallback
		// window because the transition is still in progress, semantically. On
		// retry resolve, the timeout is cleared and the hidden tryBlock is
		// revealed. The default Infinity keeps the visible shell indefinitely.
		//
		// If the held content re-suspends on a DIFFERENT thenable (e.g. the
		// transition changed the value to 2, holding on d2; then a further transition
		// changed it to 3, re-suspending on d3), the still-pending timeout is
		// watching the OLD thenable — at fire time its `pendingThenable === thenable`
		// guard would be stale and it would no-op, leaving the boundary held with
		// no safety valve. Re-arm the timeout for the NEW thenable so the
		// "eventually show fallback" budget tracks the content actually in flight.
		if (
			state.pendingBody !== null &&
			TRANSITION_FALLBACK_TIMEOUT_MS !== Infinity &&
			TRANSITION_FALLBACK_TIMEOUT_MS >= 0 &&
			(state.transitionTimeoutId === null || state.pendingThenable !== thenable)
		) {
			if (state.transitionTimeoutId !== null) {
				clearTimeout(state.transitionTimeoutId);
				state.transitionTimeoutId = null;
			}
			state.transitionTimeoutId = setTimeout(() => {
				state.transitionTimeoutId = null;
				// Only swap if we're still in the same suspended-transition state
				// (a fresher render or a resolve may have already moved us).
				if (state.pendingThenable === thenable && state.transitionHeld && state.branch === 1) {
					swapToPendingFallback(state);
				}
			}, TRANSITION_FALLBACK_TIMEOUT_MS);
		}
		attachResume(state, thenable);
		return;
	}

	// PRESERVE the try-body block's hooks Map, `_b.*` bindings, and connected DOM
	// (via hideTryBlock) — whether the suspend came from the try-body block
	// itself OR a nested descendant block (e.g. a child component that re-renders
	// on its own and then suspends). The old nested-case behavior unmounted the
	// whole try subtree, discarding every descendant `scope.hooks` Map, so
	// useState / useMemo / useRef silently reset on resume — a latent data-loss
	// bug. Keeping the same blocks means the resume path (attachResume)
	// re-renders the held tryBlock, which reconciles descendants by key with
	// their state intact — React's committed-state-preserved-while-suspended
	// contract. (The transition HOLD path keeps content visible and does NOT
	// come here, so its effects correctly stay live.)
	if (!isTransition) releaseHeldTransition(state);
	hideTryContentAndMountPending(state, thenable);
}

/**
 * The first ordinary suspension has no offscreen capture. Earlier siblings may
 * already have queued fresh lifecycle work, but only their previous connected
 * effects belong to the preserved primary. Cancel those pending revisions and
 * revisit their bodies on reveal; unchanged memo siblings remain reusable.
 */
function invalidatePendingSuspenseEffects(owner: Block): void {
	const queues = WIP_CAPTURE === null ? effectQueues : WIP_CAPTURE.effects;
	for (let phase = LAYOUT; phase <= PASSIVE; phase++) {
		const queue = queues[phase];
		for (let i = 0; i < queue.length; i++) {
			const pending = queue[i];
			const block = pending.scope.block;
			if (block.disposed || (block !== owner && !blockIsAncestorOf(owner, block))) continue;
			const effect = pending.scope.hooks?.get(pending.slot) as EffectSlot | undefined;
			if (effect === undefined || effect.revision !== pending.revision) continue;
			if (ROOT_RENDER_TRANSACTION !== null) journalObjectOnce(effect);
			effect.revision++;
			effect.active = effect.connectedFn !== null;
			effect.deps = effect.connectedFn === null ? undefined : effect.connectedArgs;
			invalidateRender(block, owner);
		}
	}
}

/**
 * Hide the try content behind the @pending fallback. The single hide-and-mount
 * sequence shared by handleSuspense's suspend path and swapToPendingFallback:
 *
 *  1. Hide the tryBlock in place — its hooks Map, `_b.*` bindings, DOM identity,
 *     and browser-owned state remain preserved for the resume reveal.
 *  2. React parity: while the boundary shows its fallback, the hidden subtree's
 *     layout effects are DESTROYED and RECREATED on reveal. Passive effects stay
 *     subscribed until actual deletion. The phase-selective deactivateScope walk
 *     clears layout deps so the resume re-render re-enqueues them.
 *  3. Detach the hidden subtree's host refs (object → null, callbacks called
 *     with null), recreated on reveal — React cycles refs across a suspend like
 *     layout effects. Only on the FIRST hide; a re-suspend during a partial
 *     resolve must not re-detach.
 *  4. Mark the hidden subtree inactive (the <Activity> mechanism) so the drains
 *     SKIPS any effects the just-aborted (re-)suspending render enqueued for it —
 *     otherwise a boundary that re-suspends DURING a resume (e.g. one of several
 *     promises resolves but another is still pending) leaves stale layout effects
 *     in the queue, and the scheduler never goes quiescent. Cleared on reveal
 *     (attachResume) so effects re-fire; inactive also blocks further enqueues.
 *  5. A re-suspend while ALREADY pending (branch === 2, a @pending body mounted)
 *     must REPLACE the prior pending body, not stack a second one. The existing
 *     pending block lives in `state.block` (it is never the tryBlock once we've
 *     hidden); unmount it so its DOM is removed exactly once before the
 *     fresh @pending body mounts. Without this, two consecutive suspends on the
 *     same boundary (e.g. two sequential useSuspenseQuery calls) leave both
 *     fallbacks — and ultimately the resolved content alongside a stuck fallback
 *     — in the DOM at once. The tryBlock is preserved separately (hiddenDom), so
 *     this never touches it.
 *  6. Mount the fresh @pending body between minted `pend-b` markers. Application
 *     errors unwind to @catch; suspension belongs to an enclosing boundary.
 *
 * Returns false when the pending arm did not finish or its owner was replaced
 * or disposed. Callers must not publish that fallback or wire a new resume.
 */
export function hideTryContentAndMountPending(
	state: TrySlot,
	resumeThenable?: TrackedThenable<any>,
): boolean {
	const frame = beginDetachedBoundaryRender(state);
	try {
		return hideTryContentAndMountPendingInner(state, resumeThenable);
	} catch (failure) {
		if (frame !== null) rollbackRootRender(frame.transaction);
		throw failure;
	} finally {
		endDetachedBoundaryRender(frame);
	}
}

function hideTryContentAndMountPendingInner(
	state: TrySlot,
	resumeThenable?: TrackedThenable<any>,
): boolean {
	const wasPending = state.branch === 2;
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null && !state.hasResolved && state.tryBlock !== null) {
		// A suspension during the first hydration attempt has no committed client
		// subtree to preserve. The try block currently owns the adopted server arm;
		// hiding that adopted DOM for a later reveal would retain the abandoned server
		// arm and then mount the resolved client arm alongside it. Discard the
		// adoption attempt, whose server arm the fallback replaces at commit, and
		// let the retry mount one fresh client arm after the fallback. Keep the
		// outer try markers as the cursor boundary for any following hydrating
		// sibling.
		const abandonedTry = state.tryBlock;
		unmountBlock(abandonedTry, false);
		discardServerArm(state);
		state.tryBlock = null;
		if (state.block === abandonedTry) state.block = null;
		hydration.node = state.end;
	} else {
		hideTryBlock(state);
	}
	// Publish fallback ownership before any cleanup/ref callback can run user code.
	// A reentrant root unmount must see the preserved primary as `tryBlock` only,
	// not as the visible arm, so its already-detached refs are not detached twice.
	const previousArm = state.block !== null && state.block !== state.tryBlock ? state.block : null;
	state.block = null;
	setTryBranch(state, 2);
	if (previousArm !== null) {
		unmountBlock(previousArm);
		if (state.parentBlock.disposed || state.block !== null || state.branch !== 2) return false;
	}
	if (state.tryBlock) {
		const persistent = state.tryBlock;
		// A ref mounted before the suspending sibling queued an attach but has not
		// reached the commit phase. The fallback commit must discard that work;
		// reveal will enumerate the primary's current manifests and attach them. The
		// exact canceled pairs also tell the detach walk which current refs never
		// committed, without retaining a witness for every callback ref in the app.
		const uncommittedRefs = discardSubtreeRefAttaches(persistent);
		// Inside a primary whose hide already detached it, nothing here is attached
		// (React skips the disappear pass for an Offscreen hidden by an ancestor).
		// Take the reveal sentinel with the hide itself, not the deferred action:
		// an abandoned enclosing retry drops that action but keeps this primary
		// hidden, and its reveal must still attach refs from current manifests.
		if (state.detachedRefs === null && enclosingPrimaryDetachedRefs(state.parentBlock)) {
			if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK)
				TRANSITION_JOURNAL.push(JOURNAL_PROP, state, 'detachedRefs', null);
			state.detachedRefs = [];
		}
		invalidatePendingSuspenseEffects(persistent);
		journalRootProperty(persistent, 'inactive', persistent.inactive);
		persistent.inactive = true;
		// The fallback's native reads must be accepted before an outgoing cleanup
		// can write. Its sampled callbacks retain that accepted value; a cleanup
		// write schedules the next transaction. The capture also drops this action
		// if an enclosing render is abandoned before any lifecycle work runs.
		const action = () => deactivateSuspensePrimary(state, persistent, uncommittedRefs);
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileQueueWork(action);
		if (WIP_CAPTURE === null) effectEventCommitActions.push(action);
		else {
			// A later sibling can suspend after this nested fallback was selected.
			// Its body's Effect Event rollback must not erase the hide that the
			// enclosing capture still commits. An abandoned capture drops it instead.
			(WIP_CAPTURE.renderCleanups ??= []).push((discarded) => {
				if (!discarded) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileQueueWork(action);
					effectEventCommitActions.push(action);
				}
			});
		}
	}
	if (!mountPendingBody(state)) return false;
	if (state.parentBlock.disposed || state.branch !== 2) return false;
	if (!wasPending) recordSuspenseCommit(state);
	// A custom thenable may synchronously invoke its listener. Install ownership
	// only after the pending arm is coherent, then re-check for reentrant teardown.
	if (resumeThenable !== undefined) attachResume(state, resumeThenable);
	return !state.parentBlock.disposed && state.branch === 2;
}

/** Whether an enclosing Suspense primary's committed hide owns this block's refs. */
function enclosingPrimaryDetachedRefs(block: Block | null): boolean {
	for (let p = block; p !== null; p = p.parentBlock) {
		const slot = p.rare?.trySlot;
		if (slot !== undefined && slot.tryBlock === p && slot.detachedRefs !== null) return true;
	}
	return false;
}

function deactivateSuspensePrimary(
	state: TrySlot,
	persistent: Block,
	uncommittedRefs: UncommittedRefAttaches,
): void {
	if (blockSubtreeDisposed(persistent) || state.tryBlock !== persistent || state.branch !== 2)
		return;
	const owner = state.parentBlock.idState.renderOwner;
	const generation = owner?.generation;
	deactivateScope(persistent, false);
	// Cleanup/ref callbacks can replace the root without synchronously disposing
	// this Block. A public replacement cancels the remainder of this publication.
	if (
		blockSubtreeDisposed(persistent) ||
		state.tryBlock !== persistent ||
		state.branch !== 2 ||
		owner?.generation !== generation
	)
		return;
	if (state.detachedRefs === null) {
		state.detachedRefs = [];
		// Nested hidden primaries already own their detach. Current visible arms
		// and the canceled-attach index prevent double detaches or phantom refs.
		detachSubtreeRefs(persistent, state.detachedRefs, true, false, uncommittedRefs);
	}
	if (
		blockSubtreeDisposed(persistent) ||
		state.tryBlock !== persistent ||
		owner?.generation !== generation
	)
		return;
	// A ref callback may have synchronously rendered this hidden primary again.
	discardSubtreeRefAttaches(persistent, uncommittedRefs);
}

/** Mount the current @pending helper without changing the preserved try body. */
function mountPendingBody(state: TrySlot): boolean {
	if (state.pendingBody) {
		const bStart = document.createComment('pend-b');
		const bEnd = document.createComment('/pend-b');
		const b = createBlock(
			'control-flow',
			state.parentBlock,
			insertArmPair(state, bStart, bEnd, state.end),
			bStart,
			bEnd,
			state.pendingBody,
			undefined,
			state.env,
		);
		b.idState = state.idState;
		blockRare(b).trySlot = state;
		state.block = b;
		try {
			renderBlock(b);
		} catch (err) {
			if (forwardFallbackSuspension(b, err)) return false;
			if (state.block) {
				unmountBlock(state.block);
				state.block = null;
			}
			switchToCatch(state, err);
			return false;
		}
	}
	return true;
}

/** Re-render an already-visible @pending arm with the latest parent environment. */
function refreshPendingBody(state: TrySlot): void {
	if (state.branch !== 2) return;
	const pendingBlock = state.block !== state.tryBlock ? state.block : null;
	if (state.pendingBody === null) {
		if (pendingBlock) unmountBlock(pendingBlock);
		state.block = null;
		return;
	}
	if (pendingBlock === null) {
		mountPendingBody(state);
		return;
	}
	pendingBlock.body = state.pendingBody;
	pendingBlock.extra = state.env;
	try {
		renderBlock(pendingBlock);
	} catch (err) {
		if (forwardFallbackSuspension(pendingBlock, err)) return;
		unmountBlock(pendingBlock);
		state.block = null;
		switchToCatch(state, err);
	}
}

/**
 * Hide the held tryBlock in place (preserving its hook state, DOM identity, and
 * browser-owned state in `hiddenDom`) and mount the @pending body after it. Used by the
 * explicit transition-fallback timeout extension. The retry path reveals hiddenDom on
 * resolve, so this is recoverable. (The resume listener is already attached —
 * the hold began in handleSuspense — so unlike the suspend path there is no
 * attachResume here.)
 *
 * No-op when no pending body was compiled OR when state has already moved
 * (e.g. resolve raced the timeout).
 */
function swapToPendingFallback(state: TrySlot): void {
	if (!state.pendingBody || state.branch !== 1 || !state.tryBlock) return;
	// Once the fallback shows, the held-whole contract is over for this
	// boundary: the held transition renders next, so the shell commits the new
	// values around the opted-in fallback, and the hidden primary retries
	// against the data in flight. isPending stays raised until it reveals.
	if (TRANSITION_ROOT_DRIVER) TRANSITION_ROOT_DRIVER.unsuspend(state);
	hideTryContentAndMountPending(state);
}

// Commit a resolved boundary's reveal: show its held/hidden DOM, re-render the
// try body, re-attach host refs, and drain its effects. Runs in a thenable microtask
// (outside the normal flush) OR from the entangled-batch flush. Releases the transition
// hold; a re-suspend during the re-render re-acquires it via handleSuspense.
//
// View transitions: a standalone reveal (fallback → content swap) is exactly
// the commit a `<ViewTransition>` around/inside a Suspense boundary animates —
// route it through the controller (the wrapping boundary update-activates on
// the swap; boundaries INSIDE the revealed content enter). The entangled batch
// wraps ONCE at flushStagedReveals (flushingStagedReveals gates the per-
// boundary wrap here).
function commitResume(state: TrySlot): void {
	if (
		!flushingStagedReveals &&
		!flushingSuspenseRetries &&
		VIEW_TRANSITION_DRIVER &&
		VIEW_TRANSITION_DRIVER.wrapResume(
			() => inBoundaryRender(state, commitResumeInner),
			() => [state.parentBlock],
		)
	)
		return;
	inBoundaryRender(state, commitResumeInner);
}

/**
 * Run a boundary's resume or hidden retry as its root's render, so its commit,
 * not its render, writes the DOM, and a suspended retry touches none. One that
 * runs inside a render already joins that render's transaction.
 */
export function inBoundaryRender<A extends unknown[]>(
	state: TrySlot,
	run: (state: TrySlot, ...args: A) => void,
	...args: A
): void {
	const frame = ROOT_RENDER_TRANSACTION === null ? beginDetachedBoundaryRender(state) : null;
	try {
		run(state, ...args);
	} catch (error) {
		if (frame !== null) rollbackRootRender(frame.transaction);
		throw error;
	} finally {
		endDetachedBoundaryRender(frame);
	}
	if (frame !== null && !deferringStagedRevealEffects) commitEffects();
}

export type ScheduledVisibilityOwner = TrySlot | ActivitySlot;

export function findScheduledVisibilityOwner(
	block: Block | null,
	includeActivity: false,
): TrySlot | null;
export function findScheduledVisibilityOwner(
	block: Block | null,
	includeActivity: true,
	visibleMode?: 'urgent' | 'transition',
): ScheduledVisibilityOwner | null;
/**
 * Find the visibility boundary that owns an independently scheduled render.
 * Hidden Suspense owns the whole retry transaction and wins over Activity.
 * Passing the queued priority also includes visible primaries that can hold
 * their prior output. Callers inspecting only hidden ownership omit that mode.
 * All cases share one allocation-free ancestor walk.
 *
 * The pending arm's own block also carries `rare.trySlot`, but only the TRY block
 * matches `slot.tryBlock === p`, so updates inside the fallback render normally.
 */
export function findScheduledVisibilityOwner(
	block: Block | null,
	includeActivity: boolean,
	visibleMode: 'urgent' | 'transition' | null = null,
): ScheduledVisibilityOwner | null {
	let activity: ActivitySlot | null = null;
	let visible: TrySlot | null = null;
	for (let p: Block | null = block; p !== null; p = p.parentBlock) {
		if (includeActivity && activity === null && p.inactive) {
			const candidate = p.rare?.activitySlot;
			if (candidate !== undefined && candidate.block === p && candidate.hidden) {
				activity = candidate;
			}
		}
		const slot = p.rare?.trySlot;
		if (slot === undefined || slot.tryBlock !== p) continue;
		if (slot.hiddenDom !== null) return slot;
		if (
			visibleMode !== null &&
			!slot.propagateSuspense &&
			slot.hasResolved &&
			slot.branch === 1 &&
			(slot.transitionHeld || visibleMode === 'transition')
		)
			visible = slot;
	}
	// Hidden ownership wins. A transition starts at the outermost resolved
	// primary so earlier inner success can still be undone if a later sibling
	// suspends the outer boundary. During an urgent retry only existing holds
	// qualify; unrelated visible boundaries retain their direct update path.
	return activity ?? visible;
}

/** Nearest enclosing SUSPENSE-HIDDEN boundary, if one owns this render. */
export function findSuspenseHiddenTry(block: Block | null): TrySlot | null {
	return findScheduledVisibilityOwner(block, false);
}

/** Nearest hidden Activity that owns connected DOM in this block's ancestry. */
export function findHiddenActivity(block: Block | null): ActivitySlot | null {
	for (let p: Block | null = block; p !== null; p = p.parentBlock) {
		if (!p.inactive) continue;
		const candidate = p.rare?.activitySlot;
		if (candidate !== undefined && candidate.block === p && candidate.hidden) return candidate;
	}
	return null;
}

/**
 * Re-attempt a suspense-hidden boundary's try body because state INSIDE the
 * hidden subtree changed (a setState / external-store update scheduled a render
 * in a hidden block). React parity: an update to a suspended component
 * RETRIES the render — if it no longer suspends (e.g. a store flipped to ready
 * before the suspending promise resolved), the boundary reveals now, without
 * that promise ever settling.
 *
 * Reveal the primary synchronously before its speculative render so authored
 * display patches and newly-created top-level hosts apply normally (the pending
 * arm stays put; nothing paints mid-flush), then either commit
 * the reveal (drop the pending arm, reactivate effects + refs — the
 * commitResume choreography) or hide it again and stay on the fallback.
 */
export function snapshotSubtreeEffectDeps(scope: Scope, phase?: Phase): EffectDepsSnapshot {
	const snapshot: EffectDepsSnapshot = new Map();
	const visit = (current: Scope): void => {
		const effects = current.effectSlots;
		if (effects !== null) {
			for (let i = 0; i < effects.length; i++) {
				const effect = effects[i];
				if (phase === undefined || effect.phase === phase) {
					snapshot.set(effect, {
						deps: effect.deps,
						revision: effect.revision,
						active: effect.active,
					});
				}
			}
		}
		forEachSubtreeChild(current, visit);
	};
	visit(scope);
	return snapshot;
}

/** Roll hook-cell deps back after a speculative render whose captured commit was discarded. */
export function restoreSubtreeEffectDeps(
	scope: Scope,
	snapshot: EffectDepsSnapshot,
	phase?: Phase,
): void {
	const visit = (current: Scope): void => {
		const effects = current.effectSlots;
		if (effects !== null) {
			for (let i = 0; i < effects.length; i++) {
				const effect = effects[i];
				if (phase !== undefined && effect.phase !== phase) continue;
				const previous = snapshot.get(effect);
				if (previous === undefined) {
					// A slot created only by the discarded attempt remains reusable,
					// but none of that attempt's commit work is still pending.
					effect.deps = undefined;
					effect.revision = 0;
					effect.active = false;
				} else {
					effect.deps = previous.deps;
					effect.revision = previous.revision;
					effect.active = previous.active;
				}
			}
		}
		forEachSubtreeChild(current, visit);
	};
	visit(scope);
}

export type InsertionEffectReplays = Map<EffectSlot, PendingEffect[]>;

export interface EffectReconnectContext {
	root: Block;
	queues: [PendingEffect[], PendingEffect[], PendingEffect[]];
	queuedSlots: Set<EffectSlot>;
	insertionReplays: InsertionEffectReplays | null;
	parent: EffectReconnectContext | null;
}

/** A real hook reach/omission supersedes saved work, even when it queues nothing. */
export function invalidateInsertionReplay(effect: EffectSlot): void {
	if (!EFFECT_RECONNECT_CONTEXT) return;
	for (
		let context: EffectReconnectContext | null = EFFECT_RECONNECT_CONTEXT;
		context !== null;
		context = context.parent
	) {
		context.insertionReplays?.delete(effect);
	}
}

/** Keep nested reveal contexts aware of effects enqueued by an inner render. */
export function markEffectReconnectQueued(
	effect: EffectSlot,
	phase: Phase,
	target: PendingEffect[],
): void {
	if (!EFFECT_RECONNECT_CONTEXT) return;
	for (
		let context: EffectReconnectContext | null = EFFECT_RECONNECT_CONTEXT;
		context !== null;
		context = context.parent
	) {
		if (context.queues[phase] === target) context.queuedSlots.add(effect);
	}
}

/** An inner suspended attempt must not leave an outer reveal's dedupe armed. */
export function forgetEffectReconnectQueued(
	effects: Set<EffectSlot>,
	phase: Phase,
	target: PendingEffect[],
): void {
	if (!EFFECT_RECONNECT_CONTEXT) return;
	for (
		let context: EffectReconnectContext | null = EFFECT_RECONNECT_CONTEXT;
		context !== null;
		context = context.parent
	) {
		if (context.queues[phase] !== target) continue;
		for (const effect of effects) context.queuedSlots.delete(effect);
		// Work preceding the failed attempt still owns its queue position. Restore
		// only entries that survived both queue truncation and hook-cell rollback.
		for (let i = 0; i < target.length; i++) {
			const entry = target[i];
			const effect = entry.scope.hooks?.get(entry.slot) as EffectSlot | undefined;
			if (effect !== undefined && effects.has(effect) && effect.revision === entry.revision) {
				context.queuedSlots.add(effect);
			}
		}
	}
}

/** Render a reconnecting reveal while leaving ordinary renders allocation-free. */
export function renderWithEffectReconnect(
	block: Block,
	capture: OffscreenCapture | null,
	insertionReplays: InsertionEffectReplays | null = null,
): void {
	const queues = capture === null ? effectQueues : capture.effects;
	const queuedSlots = new Set<EffectSlot>();
	for (let phase = 0; phase < queues.length; phase++) {
		const queue = queues[phase];
		for (let i = 0; i < queue.length; i++) {
			const pending = queue[i];
			const effect = pending.scope.hooks?.get(pending.slot) as EffectSlot | undefined;
			if (effect?.effect === true && effect.revision === pending.revision) queuedSlots.add(effect);
		}
	}
	const parent = EFFECT_RECONNECT_CONTEXT;
	EFFECT_RECONNECT_CONTEXT = { root: block, queues, queuedSlots, insertionReplays, parent };
	try {
		renderBlock(block);
	} finally {
		EFFECT_RECONNECT_CONTEXT = parent;
	}
}

/**
 * A hidden retry can mount a ref and then suspend later, or supersede that ref on
 * the same preserved node in a subsequent retry. Captured attach closures are
 * therefore never authoritative. At reveal, enumerate the committed manifests
 * and attach exactly the refs in the subtree's current visible branches.
 */
export function queueCurrentHiddenRefs(state: TrySlot): void {
	if (state.detachedRefs === null || state.tryBlock === null) return;
	state.detachedRefs = null;
	const refs: SuspenseRefEntry[] = [];
	collectVisibleSubtreeRefs(state.tryBlock, refs);
	for (let i = 0; i < refs.length; i++) {
		const entry = refs[i];
		queueRefAttach(entry.scope, entry.ref, entry.el);
	}
}

/**
 * A parent render can reveal this boundary and then roll back when a later
 * sibling suspends the root. The journal restores the hidden display and the
 * fallback's deferred unmount, so the boundary record must return with them.
 * Otherwise it treats the re-hidden primary as visible and orphans the fallback.
 * A restart disposes an uncommitted primary for good; the restored record then
 * names a disposed primary, which the next render or retry replaces.
 */
export function journalRootReveal(state: TrySlot): void {
	journalObjectOnce(state);
	// Updates parked while hidden are committed work that only a reveal publishes.
	const parked = HIDDEN_REVEAL_ACTIONS?.get(state);
	if (parked !== undefined)
		journalUndo(() => {
			HIDDEN_REVEAL_ACTIONS!.set(state, parked);
		});
}

/** Register a boundary as holding prior content for an in-flight transition. */
function enterHeldTransition(state: TrySlot): void {
	HELD_TRANSITIONS.add(state);
	STAGED_REVEALS.delete(state); // a re-suspend means it is no longer data-ready
}

/**
 * Remove a boundary from the coordination sets when it stops holding WITHOUT a normal
 * reveal — urgent supersede, error, or unmount. If the remaining held boundaries are
 * now all fully staged, commit them (don't strand them waiting on a boundary that left).
 */
function abandonHeldTransition(state: TrySlot): void {
	if (!HELD_TRANSITIONS.has(state)) return;
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	flushStagedRevealsIfReady();
}

/** Commit a staged group once exact membership shows every held boundary is ready. */
export function flushStagedRevealsIfReady(): void {
	// Stale readiness can never satisfy the barrier. Defensive pruning covers
	// terminal paths as well as superseding hidden retries; then require exact set
	// membership rather than relying on equal cardinality alone.
	for (const state of STAGED_REVEALS) {
		if (!HELD_TRANSITIONS.has(state)) STAGED_REVEALS.delete(state);
	}
	if (STAGED_REVEALS.size === 0 || STAGED_REVEALS.size !== HELD_TRANSITIONS.size) return;
	for (const state of HELD_TRANSITIONS) {
		if (!STAGED_REVEALS.has(state)) return;
	}
	flushStagedReveals();
}

function compareStagedRevealDomOrder(a: TrySlot, b: TrySlot): number {
	if (a === b) return 0;
	const position = a.start.compareDocumentPosition(b.start);
	if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
	if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
	return 0;
}

function flushStagedReveals(): void {
	if (flushingStagedReveals) return; // re-entrancy guard (a reveal may abandon a sibling)
	// A boundary holding a dropped transition reveals by rendering it again:
	// the batches' Blocks re-render at transition priority and reach every held
	// boundary in one flush. A boundary the timeout already hid keeps the
	// hidden-retry path instead.
	if (TRANSITION_ROOT_DRIVER) {
		let retried = false;
		for (const state of STAGED_REVEALS)
			if (state.hiddenDom === null && TRANSITION_ROOT_DRIVER.retry(state)) retried = true;
		if (retried) {
			STAGED_REVEALS.clear();
			flush();
			return;
		}
	}
	flushingStagedReveals = true;
	try {
		const run = (): void => {
			const batch = [...STAGED_REVEALS];
			STAGED_REVEALS.clear();
			// Only fallback-hidden members have completed rollback-safe render
			// captures. A pre-timeout visible hold remains within Octane's documented
			// per-swap/global-WIP limitation and may discover another suspension while
			// committing, so do not promise lifecycle-atomic batching for a mixed batch.
			const deferEffects = batch.every((state) => state.stagedCapture !== null);
			if (deferEffects) {
				// Promise resolution order is not source order. Commit left-to-right and
				// rebase each capture's effect sequence. Ref captures splice in this same
				// sorted order and retain it through their stable post-order sort.
				batch.sort(compareStagedRevealDomOrder);
				for (const state of batch) rebaseOffscreenEffectSeq(state.stagedCapture!);
			}
			const previousDeferral = deferringStagedRevealEffects;
			deferringStagedRevealEffects = deferEffects;
			try {
				for (const s of batch) {
					// A prior reveal in this batch may have torn down a later one (a boundary that
					// renders a sibling boundary). Skip any that were disposed meanwhile.
					if (s.tryBlock !== null && s.tryBlock.disposed) continue;
					commitResume(s);
				}
			} finally {
				deferringStagedRevealEffects = previousDeferral;
				if (deferEffects) {
					// For fully rendered hidden captures, the reveal barrier includes the
					// public lifecycle boundary: refs/layout run only after every member's
					// DOM commits, in one globally sorted commit batch.
					commitEffects();
				}
			}
		};
		// The staged group animates as ONE view transition (the per-boundary wrap
		// in commitResume is gated off by flushingStagedReveals). Fully captured
		// fallback-hidden members also share the lifecycle commit above; a mixed
		// pre-timeout batch retains the documented per-swap limitation.
		if (
			!VIEW_TRANSITION_DRIVER ||
			!VIEW_TRANSITION_DRIVER.wrapResume(run, () =>
				[...STAGED_REVEALS].map((state) => state.parentBlock),
			)
		)
			run();
	} finally {
		flushingStagedReveals = false;
	}
}

/**
 * Wire up a `.then` listener that retries the try body when the thenable
 * settles. Dedupes by `pendingThenable` so two suspends on the same promise
 * don't queue two retries.
 */
export function attachResume(state: TrySlot, thenable: TrackedThenable<any>): void {
	if (state.pendingThenable === thenable) return;
	state.pendingThenable = thenable;
	const retry = () => {
		if (state.pendingThenable !== thenable) return; // superseded by a fresher suspend
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.BOUNDARY_RETRY);
		state.pendingThenable = null;
		// Cancel any pending transition-fallback timeout — the promise resolved
		// before the timeout would have swapped to @pending, so the prior DOM
		// stays put and the just-resolved render commits over it directly.
		if (state.transitionTimeoutId !== null) {
			clearTimeout(state.transitionTimeoutId);
			state.transitionTimeoutId = null;
		}
		const persistent = state.tryBlock;
		if (persistent !== null && !persistent.disposed) {
			const hiddenAncestor = findSuspenseHiddenTry(persistent.parentBlock);
			if (hiddenAncestor !== null) {
				attemptHiddenReveal(
					hiddenAncestor,
					HELD_TRANSITIONS.has(hiddenAncestor) ? 'transition' : 'urgent',
					HELD_TRANSITIONS.has(hiddenAncestor) ? 'update' : 'retry',
				);
				return;
			}
		}
		// Entangled-transition commit barrier: a boundary holding prior content for an
		// in-flight transition does not reveal the moment one input resolves. A hidden
		// primary proves its whole body below; visible holds retain the documented
		// per-swap limitation. The boundary stays held (and isPending stays true) until
		// the staged group flushes.
		if (HELD_TRANSITIONS.has(state)) {
			// Once the timeout has exposed @pending, settling one thenable is not
			// sufficient proof that this member is reveal-ready: a later dependent
			// use() may still suspend. Retry the hidden primary under the hidden
			// capture and enter STAGED_REVEALS only if the whole body completes.
			if (state.hiddenDom !== null) {
				attemptHiddenReveal(state, 'transition');
				return;
			}
			STAGED_REVEALS.add(state);
			if (STAGED_REVEALS.size < HELD_TRANSITIONS.size) return; // others still pending
			flushStagedReveals();
			return;
		}
		if (state.branch === 2 && (state.tryBlock === null || state.tryBlock.disposed)) {
			// Failed initial adoption discarded its primary. Start client recovery
			// now, including dependent data discovery, but retain the fallback until
			// the completed retry can commit under the same root-owned budget. The
			// new hidden primary lands with that retry's commit.
			inBoundaryRender(state, remountHiddenPrimary);
			return;
		}
		if (state.hiddenDom !== null) {
			attemptHiddenReveal(state, 'urgent', 'retry');
		} else {
			commitResume(state);
		}
	};
	resumeOnSettle(thenable, retry);
}

function requestReset(state: TrySlot | ErrorSlot): void {
	if (state.parentBlock.disposed || state.branch !== 0) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.BOUNDARY_RESET);
	// React parity for catch reset(): don't synchronously re-run the try body.
	// Rewind slot state and schedule the parent — sibling setState calls in
	// the SAME event handler then batch into one commit, so when mountTry
	// re-runs the body it sees fresh closure values (e.g. throwIt=false)
	// instead of immediately re-throwing. Matches TsrxErrorBoundary's
	// `() => this.setState({ error: null })` semantics: clear the error flag,
	// then let the normal commit cycle decide what to render. The currently
	// visible catch block stays mounted for one tick; mountTry's teardown
	// (state.block != null branch) removes it on the next render.
	setTryBranch(state, -1);
	state.err = null;
	state.hasResolved = false;
	state.detachedRefs = null;
	if (
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		!state.parentBlock.disposed
	)
		__profileSchedule(state.parentBlock, 'error-boundary-reset');
	scheduleRender(state.parentBlock);
}

/** A suspending fallback belongs to the outer boundary, not its own catch arm. */
function forwardFallbackSuspension(fallbackBlock: Block, error: unknown): boolean {
	if (!isSuspenseException(error)) return false;
	// Preserve the fallback's block and hooks so the enclosing Suspense can hide
	// and retry it. Only an application error tears down a failed fallback.
	// Unwind active render frames before an outer boundary changes their DOM;
	// detached retries and finite-timeout fallbacks have no render stack to unwind.
	if (CURRENT_BLOCK !== null) throw error;
	// Fallback blocks have no handlers of their own. Start from the block that
	// actually rendered, so a timeout does not inherit an old transition priority.
	handleResumeError(fallbackBlock, error);
	return true;
}

export function switchToCatch(state: TrySlot, err: any, reportInline = false): void {
	if (isAdoptionControl(err)) throw err;
	const frame = beginDetachedBoundaryRender(state);
	try {
		switchToCatchInner(state, err, reportInline);
	} catch (failure) {
		if (frame !== null) rollbackRootRender(frame.transaction);
		throw failure;
	} finally {
		endDetachedBoundaryRender(frame);
	}
}

/**
 * Drop the commit work queued for a try body the catch arm replaces: its bags'
 * writes and its slots' structure, from any render of it in this transaction
 * (#2043). None of it may reach the page.
 */
function dropBodyOps(transaction: RootRenderTransaction, body: Block): void {
	const ops = transaction.ops;
	for (let i = 0; i < ops.length; i += 2) {
		const target = ops[i + 1];
		const slot = ops[i] === applySlotNext;
		const owner: Block | null | undefined = slot
			? target.next?.owner
			: typeof target?.$ === 'number' && target.$ > BAG_SIZE
				? target.next[target.$ & BAG_SIZE]?.block
				: null;
		if (owner == null || !blockIsAncestor(body, owner)) continue;
		if (slot) target.next = null;
		else target.$ &= BAG_SIZE;
		ops[i] = noop;
		ops[i + 1] = null;
	}
}

function switchToCatchInner(state: TrySlot, err: any, reportInline: boolean): void {
	if (state.retrySignalOwners !== undefined) clearSignalRetryOwners(state);
	cancelSuspenseRetry(state);
	HIDDEN_REVEAL_ACTIONS?.delete(state);
	const hydration = hydrating ? CURSOR : null;
	discardOffscreenCapture(state.stagedCapture);
	state.stagedCapture = null;
	state.stagedEffectDeps = null;
	const hadDetachedRefs = state.detachedRefs !== null;
	state.detachedRefs = null;
	// Cancel any pending transition-fallback timeout — catch is a terminal
	// state, so a timeout-driven swap to @pending would conflict with the
	// catch branch about to mount.
	if (state.transitionTimeoutId !== null) {
		clearTimeout(state.transitionTimeoutId);
		state.transitionTimeoutId = null;
	}
	// Catch is a fresh terminal state — discard any preserved try-body hook
	// state. `reset()` will mountTry fresh from the catch arm if user retries.
	// Compare `block` against the tryBlock we just unmounted so a visible try
	// body isn't sent through unmountBlock a second time (it's idempotent, but
	// the second pass is pure waste).
	const oldTry = state.tryBlock;
	const priorVisible = state.block;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (oldTry !== null && transaction !== null && !transaction.aborted)
		dropBodyOps(transaction, oldTry);
	if (oldTry) {
		let suppressedRefs: SuspenseRefEntry[] | null = null;
		if (hadDetachedRefs) {
			suppressedRefs = [];
			collectVisibleSubtreeRefs(oldTry, suppressedRefs);
		}
		showTryBlock(state);
		// A fallback-visible primary already cycled its refs during hide. Permanent
		// catch teardown must not invoke those callbacks or React-19 cleanup
		// functions again; refs in the visible pending/catch arm still detach below.
		// Publish the terminal ownership change before cleanup callbacks can
		// synchronously unmount or replace the boundary.
		state.tryBlock = null;
		// Hydrating, the body adopted server DOM, which its commit discards.
		withRefDetachSuppression(suppressedRefs, () => {
			unmountBlock(oldTry, hydration === null);
		});
		if (state.parentBlock.disposed || state.tryBlock !== null || state.block !== priorVisible) {
			return;
		}
	}
	state.hiddenDom = null;
	if (state.block && state.block !== oldTry) {
		const visible = state.block;
		state.block = null;
		unmountBlock(visible, hydration === null);
		if (state.parentBlock.disposed || state.block !== null) return;
	} else {
		state.block = null;
	}
	state.hasResolved = false;
	state.pendingThenable = null;
	if (state.transitionHeld) {
		state.transitionHeld = false;
		tickTransitionCount(-1);
		releaseTransitionHookHolder(state);
	}
	// Errored out of the held group — drop it so staged siblings aren't stranded.
	abandonHeldTransition(state);
	// No catch arm — bubble to the next enclosing tryBlock (or surface).
	if (state.catchBody === null) {
		// Mid-render (a component render stack is live): RETHROW instead of
		// delegating synchronously. The outer boundary's switch sweeps the DOM
		// of every frame between the throw site and itself — if we called its
		// handler here and returned, those still-on-stack frames would keep
		// rendering into the swept range (stale anchors → NotFoundError, and the
		// bookkeeping error would REPLACE the original). The rethrow unwinds
		// them; the outer boundary catches it at its own tryBlock frame.
		if (CURRENT_BLOCK !== null) {
			throw err;
		}
		// Detached context (resume microtask, effect commit): no render frames
		// to unwind. The enclosing boundary catches it, or the root reports it.
		handleResumeError(state.parentBlock, err);
		return;
	}
	setTryBranch(state, 0);
	state.err = err;
	const bStart = document.createComment('catch-b');
	const bEnd = document.createComment('/catch-b');
	if (hydration !== null && hydration.isClose(state.end)) {
		// Hydrating, but the server rendered a DIFFERENT arm in this slot (the
		// try body threw on the CLIENT), so the catch arm is a client-fresh
		// build. The aborted try adoption kept the server range: the catch arm's
		// commit discards it, and the cursor parks past the slot so FOLLOWING
		// siblings keep adopting from an aligned position. Only an adopted slot
		// pair bounds server DOM.
		discardServerArm(state);
		hydration.rebuiltSlot(state.end);
	}
	const armParent = insertArmPair(state, bStart, bEnd, state.end);
	const reset = () => requestReset(state);
	const b = createBlock(
		'control-flow',
		state.parentBlock,
		armParent,
		bStart,
		bEnd,
		state.catchBody,
		catchProps(err, reset, true),
		state.env,
	);
	b.idState = state.idState;
	state.block = b;
	let control = false;
	try {
		// A client-fresh catch build during hydration must not read the adoption
		// cursor — the server rendered the try arm here, so adopting would consume
		// (and warn about) another slot's server DOM. Suspend for the subtree.
		if (hydration !== null) hydration.suspend(() => renderBlock(b));
		else renderBlock(b);
	} catch (e2) {
		if (forwardFallbackSuspension(b, e2)) return;
		// Hydration control flow passes through every application boundary.
		if (isAdoptionControl(e2)) {
			control = true;
			throw e2;
		}
		// Catch body itself threw — bubble to next enclosing tryBlock.
		if (state.block) {
			unmountBlock(state.block);
			state.block = null;
		}
		// Mid-render (a component render stack is live) with an outer boundary to
		// take the error: RETHROW instead of delegating synchronously — the same
		// rule as the no-catch-arm path above. The outer boundary's switch sweeps
		// the DOM of every frame between this boundary and itself; delegating here
		// and returning would let those still-on-stack frames keep rendering into
		// the swept range (stale anchors → NotFoundError, and the bookkeeping
		// error would REPLACE the original). The rethrow unwinds them; the outer
		// boundary catches it at its own tryBlock frame. With NO outer handler the
		// error must not escape to the render caller: fall through to the
		// console.error surface below (the boundary's content is already torn
		// down — no content, no fallback).
		if (CURRENT_BLOCK !== null && findTryHandler(state.parentBlock) !== null) throw e2;
		const parent = findTryHandler(state.parentBlock);
		if (parent) parent(e2);
		else console.error('catch body threw, no outer tryBlock:', e2);
	} finally {
		if (reportInline && !control && ROOT_ERROR_HANDLERS) registeredEnqueueInlineCaughtError(state);
	}
}

/** Walk Block.parentBlock chain looking for a `rare.tryHandler` registration. */
export function findTryHandler(block: Block | null): TryHandler | null {
	const origin = block;
	let b: Block | null = block;
	while (b) {
		const h = b.rare?.tryHandler;
		// Suspense-only slots route wakeables, but do not claim application errors.
		// Skipping them also keeps root error reporting on the uncaught channel.
		if (h && b.rare!.trySlot?.catchBody !== null) return h;
		b = b.parentBlock;
	}
	return RENDERER_REGION_OWNER_COUNT === 0 ? null : rendererRegionTryHandler(origin);
}

/**
 * Route an error thrown by `renderBlock` during scheduled re-renders.
 * Suspense exceptions go to the nearest tryBlock's `rare.suspenseHandler`;
 * everything else goes to `rare.tryHandler`. An unowned suspension retries through
 * its client root; an unclaimed application error is rethrown to the caller.
 */
export function handleRenderError(block: Block, err: any): void {
	if (isAdoptionControl(err)) throw err;
	// §6.3 HostContextRequest: a foreign-context read the owner could not
	// satisfy synchronously. This is a hosted-root control signal, NOT an
	// application failure — it must bypass the island's own @catch/@pending
	// arms and reach the owner, which settles the carried thenable once the
	// authoritative host value has committed and then retries the root.
	if (isHostContextRequest(err)) {
		const bridge = rendererRegionOwnerForBlock(block);
		if (bridge !== null && bridge.routeSuspense(err.thenable)) return;
		err = new Error(formatClientError(27));
	}
	if (isSuspenseException(err)) {
		let b: Block | null = block;
		while (b) {
			const h = b.rare?.suspenseHandler;
			if (h) {
				h(err.thenable, block);
				return;
			}
			b = b.parentBlock;
		}
		const external = rendererRegionSuspenseHandler(block);
		if (external !== null) {
			external(err.thenable);
			return;
		}
		if (suspendRootRender(block, err.thenable)) return;
		throw err;
	}
	const h = findTryHandler(block);
	if (h) {
		reportCaughtError(block, err, h(err));
	} else throw err;
}

/** A detached retry has no scheduler drain to report and dispose a failed root. */
export function handleResumeError(block: Block, error: unknown): void {
	try {
		handleRenderError(block, error);
	} catch (unhandled) {
		// Parent-driven retries still unwind through their normal render owner.
		if (CURRENT_BLOCK !== null || inFlush) throw unhandled;
		const root = suspenseRetryRoot(block);
		if (!reportUncaughtError(block, unhandled)) console.error(unhandled);
		// The root reports this error alone, not a hydration failure it replaced.
		if (ROOT_RENDER_TRANSACTION !== null) ROOT_RENDER_TRANSACTION.caught = true;
		if (root.kind === 'root' && !root.disposed) unmountBlock(root);
	}
}
