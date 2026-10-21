// Blocks and Scopes
//
// BlockImpl, ScopeImpl and LiteBlockImpl, Block creation, render-phase updates,
// a Block's returned output, and unmounting with teardown error routing. The
// render module renders a Block's body (renderBlockInner).

import { teardownPortalState, releasePortalTarget } from './portals.js';
import { hydrating } from '../hydration-flag.js';
import { hasOwnProp } from '../has-own.js';
import {
	__profileBlockCreated,
	__profileQueueWork,
	__profileCount,
	ProfileCounter,
	__profileHasComponentMetadata,
	__profileBlockUnmounted,
	__profileQueueCleanup,
} from '../profiling.js';
import { __devtoolsUnregisterRoot } from '../devtools-hook.js';
import { ELEMENT_TAG } from '../runtime-tags.js';
import type { SignalRendererOwnerIdentity } from '../signals/types.js';
import { withProfileComponentOverride } from './profile-probes.js';
import type {
	ComponentBody,
	Cleanup,
	HookSlot,
	PendingEffectEvent,
	Scope,
	CompilerMemoRegion,
	ChildScope,
	OutputHandler,
	RootIdState,
	Block,
	EffectSlot,
	QueuedCell,
	SlotNext,
	ViewTransitionProps,
	SuspenseRefEntry,
	OffscreenCapture,
	ElementDescriptor,
	TrySlot,
	TryHandler,
	ActivitySlot,
} from './types.js';
import {
	withRefDetachSuppression,
	TRANSITION_ROOT_DRIVER,
	schedulePassiveFlush,
	NATIVE_READ_DRIVER,
	reportCaughtError,
	reportUncaughtError,
} from './drivers.js';
import { RENDERER_INVOCATION_SITE } from './signal-owners.js';
import {
	VIEW_TRANSITION_DRIVER,
	retireRendererSignalOwner,
	runEffectLifecycleCallback,
	runEffectCleanupCallback,
	QUEUE,
	QUEUE_REINDEX_EPOCH,
	inFlush,
	TRANSITION_QUEUE,
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	retireRootBlock,
	isCreatedInRootRender,
	createdInRootRender,
	type EffectEventCommitAction,
	DRAIN_ID,
	RENDERED_CUES,
	renderingFocus,
} from './engine.js';
import { PASSIVE, passiveScheduled, blockIsAncestorOf, pendingPassiveUnmounts } from './effects.js';
import type { TrackedThenable, WarmEntry } from './use.js';
import type { HookUpdate } from './transitions.js';
import {
	RENDERER_REGION_OWNER_COUNT,
	type Context,
	type DEFAULT_CTX,
	rendererRegionTryHandler,
	promoteMemoAncestry,
	type DirectContextReads,
} from './context.js';
import { CURSOR } from './hydration.js';
import { findTryHandler } from './suspense.js';
import {
	RETAINED_SIGNAL_OWNERS,
	TRANSITION_JOURNAL,
	ROOT_RENDER_TRANSACTION,
	EFFECT_EVENT_RENDER_TARGET,
	EFFECT_EVENT_ACTION_TARGET,
} from './render.js';
import { elementKeyWasProvided } from './elements.js';
import { componentSlot, clearChildContent, HMR } from './component-slots.js';
import { childSlot } from './child-slots.js';
import {
	markerlessBranchRoots,
	owningBlock,
	UNMOUNT_LITE_ARM,
	replaceSharedBlockBoundary,
	sharesBlockBoundary,
} from './branches.js';
import { collectVisibleSubtreeRefs, detachDeoptTreeRefs } from './activity.js';
import { type ForSlot, removeRange, RANGE_CLEAR_MIN_ITEMS } from './lists.js';
import {
	JOURNAL_PROP,
	queueFrontier,
	usesFrontier,
	queueRootDeletion,
	dropRootOps,
	defersRootUnmount,
	queueRootUnmount,
	journalObjectOnce,
	rollbackTransitionJournal,
} from './commit.js';
import { nextSiblingGetter, getFirstChild, getNextSibling } from './templates.js';
import { retireHostRange } from './events.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

export type BlockKind = 'root' | 'control-flow' | 'dynamic' | 'portal';

export const RENDER_VALID = 0;
export const RENDER_INVALID = 1;
export const RENDER_RETRYING = 2;

// Client-only roots need a namespace beyond their root-local useId counter: two
// createRoot() calls can otherwise both emit `:in-0:` into the same document.
// hydrateRoot deliberately does NOT consume this counter — its prefix/counter
// must remain byte-identical to the server render it adopts.
let nextClientRootId = 0;
// A client root, and each boundary arm the client renders in place of the
// server's, takes one id once.
export function takeClientRootId(): string {
	return (nextClientRootId++).toString(36);
}
// Split cues (splitTransitionCue) an urgent ancestor rendered during drain RENDERED_CUE_DRAIN.
export let RENDERED_CUE_DRAIN = 0;

// ---------------------------------------------------------------------------
// Block + Scope creation
// ---------------------------------------------------------------------------

/**
 * Block class — concrete shape backing the `Block` interface. Allocated via
 * `new` so V8 derives the hidden class from this single constructor, instead
 * of synthesising it from an object-literal site (which V8 can also do but
 * with a less predictable optimisation profile when the literal has many
 * fields). Compiled bodies stamp their dynamic per-call-site keys on the
 * `slots[0]` binding bag, NOT on the Block/Scope instance (see Scope.slots),
 * so every BlockImpl instance shares one hidden class outright. Feature-only
 * fields also start as undefined here, rather than transitioning the shape
 * when a feature first uses them. State that only boundaries, use(),
 * useEffectEvent, ViewTransition, fetch-tree warming or nested commit updates
 * need lives on the lazily allocated `rare` record (BlockRare): every Block
 * pays one pointer for it, and only the Blocks using those features allocate it.
 *
 * The constructor's size is itself a hot-path cost. Moving those fields to
 * `rare` cut its bytecode from 437 to 371 bytes and made cold memo-wall mounts
 * about 5% faster; three dummy fields more (386 bytes) gave that gain back,
 * consistent with V8 inlining a hot callee only within a bytecode budget. Add
 * a field here only when every Block needs it.
 *
 * Type-only declarations leave the fixed-order constructor assignments as the
 * only runtime field definitions, including in consumers that compile source
 * with native class-field semantics. Item-only fields
 * (prev/next sibling, key, itemIndex) sit on every Block as null/0 so root
 * and dynamic blocks share the same shape with for-of item blocks.
 */
export class BlockImpl {
	// Hot fields first (touched by every renderBlock / reconcile iteration).
	declare body: ComponentBody;
	declare props: any;
	declare extra: any;
	declare outputHandler: OutputHandler | null;
	declare memoInChain: boolean;
	declare parentNode: Node;
	declare parentBlock: Block | null;
	declare idState: RootIdState;
	declare startMarker: Node | null;
	declare endMarker: Node | null;
	declare exclusiveMarkers: boolean;
	declare itemIndex: number;
	declare createdStamp: number;
	// Scheduler / lifecycle.
	declare pending: boolean;
	declare disposed: boolean;
	declare mounted: boolean;
	declare renderStatus: number;
	declare pendingMode: 'urgent' | 'transition' | null;
	declare currentRenderMode: 'urgent' | 'transition' | null;
	declare pendingDeferred: boolean;
	declare currentRenderDeferred: boolean;
	declare inactive: boolean;
	// Hooks + cleanups (per-block state).
	declare hooks: Map<HookSlot, any> | null;
	declare cleanups: Cleanup[] | null;
	declare effectSlots: EffectSlot[] | null;
	declare children: ChildScope[] | null;
	declare _slots: any[] | null;
	declare refFields: string[] | null;
	declare signalInstanceParent: Scope | null;
	declare signalInstanceSite: string | undefined;
	declare signalInstanceValue: unknown;
	declare signalInstanceHasKey: boolean;
	declare signalInstanceResolved: string | undefined;
	declare signalTokenEscaped: boolean;
	declare signalOwner: SignalRendererOwnerIdentity | false | null | undefined;
	declare $$ctxValues: Map<Context<any>, any> | null;
	// Contexts whose value this block's subtree consumes — stamped on this block
	// AND its memo ancestors by useContextInternal. The TRANSITIVE signal: a
	// changed version here means "a consumer somewhere at/below me needs the new
	// value", so the memo bailout descends rather than skipping.
	declare $$ctxReads: Map<Context<any>, any> | null;
	// Contexts this block's OWN render directly read (its own body, or an inline
	// lite descendant that shares this block). The DIRECT signal: a changed
	// version here means THIS block must re-run; if only $$ctxReads changed, the
	// block can bail its body and refresh just its consuming child blocks.
	declare $$ctxDirect: DirectContextReads | null;
	// Epoch stamp for the dependency collections — see Block.$$ctxDepsEpoch. Number so the
	// "unverified" poison (-1) stays inside the same monomorphic field type.
	declare $$ctxDepsEpoch: number;
	// Resolved-provider cache for `use(ctx)` — see Scope.$$ctxCache.
	declare $$ctxCache: Context<any> | Map<Context<any>, Scope | typeof DEFAULT_CTX> | null;
	declare $$ctxCacheOwner: Scope | typeof DEFAULT_CTX | null;
	// Armed for React's IMPLICIT same-element bailout (beginWork's
	// oldProps === newProps skip). Set at value-position component mounts
	// (childSlot) — the only sites that can receive a cached descriptor back.
	// Arming makes the block a stamping target (like __memo) so the bail's lazy
	// consumer refresh has the context deps it needs.
	declare $$implicitBail: boolean;
	// Render-loop guard bookkeeping (see the Block interface).
	declare drainStamp: number;
	declare drainRenders: number;
	declare crossRenderUpdate: boolean;
	// De-opt host node managed by this Block (deoptItemBody / hostElementBody), reused
	// across renders. Null for all other blocks; declared so the shape stays monomorphic.
	declare deoptNode: Node | null;
	// A de-opt descriptor with a `ref` was stamped in this subtree (see Block).
	declare deoptRefs: boolean;
	// Per-scope dense slot array (binding bag + control-flow/component/child slots),
	// indexed by compile-time slot index. Keeps the scope shape monomorphic.
	declare slots: any[];
	declare compilerMemo: CompilerMemoRegion | null;
	// For-block item bookkeeping.
	declare forSlot: ForSlot | null;
	declare prevSibling: Block | null;
	declare nextSibling: Block | null;
	declare key: any;
	// Scope contract: a Block is its own scope.
	declare parent: Scope | null;
	declare block: Block;
	// Metadata.
	declare kind: BlockKind;
	// Optional render state written by every render. Keep these on the common
	// Block shape: otherwise ordinary renders fork its V8 map.
	declare __warmEpisode: number | undefined;
	declare __thenableDone: boolean | undefined;
	// Feature-only state, allocated by the first feature that needs it.
	declare rare: BlockRare | null;

	constructor(
		kind: BlockKind,
		parentBlock: Block | null,
		parentNode: Node,
		startMarker: Node | null,
		endMarker: Node | null,
		body: ComponentBody,
		props: any,
		extra: any,
		outputHandler: OutputHandler | null,
	) {
		this.body = body;
		this.props = props;
		this.extra = extra;
		this.outputHandler = outputHandler;
		// Self-or-ancestor memo flag — OR of our own memo marker with the parent's
		// flag, so the whole property is resolved in O(1) at creation instead of
		// re-walked on every context read.
		this.memoInChain =
			(body as any)?.__memo === true || (parentBlock !== null && parentBlock.memoInChain === true);
		this.parentNode = parentNode;
		this.parentBlock = parentBlock;
		this.idState = parentBlock?.idState ?? { prefix: '', next: 0 };
		this.startMarker = startMarker;
		this.endMarker = endMarker;
		this.exclusiveMarkers = false;
		this.itemIndex = 0;
		this.pending = false;
		this.disposed = false;
		this.mounted = false;
		this.renderStatus = RENDER_VALID;
		this.pendingMode = null;
		this.currentRenderMode = null;
		this.pendingDeferred = false;
		this.currentRenderDeferred = false;
		this.inactive = false;
		this.hooks = null;
		this.cleanups = null;
		this.effectSlots = null;
		this.children = null;
		this._slots = null;
		this.refFields = null;
		this.$$ctxValues = null;
		this.$$ctxReads = null;
		this.$$ctxDirect = null;
		this.$$ctxDepsEpoch = -1;
		this.$$ctxCache = null;
		this.$$ctxCacheOwner = null;
		this.$$implicitBail = false;
		this.drainStamp = 0;
		this.drainRenders = 0;
		this.crossRenderUpdate = false;
		this.deoptNode = null;
		this.deoptRefs = false;
		// Slot zero starts unmounted; a one-slot body keeps a one-entry backing store.
		this.slots = [undefined];
		this.compilerMemo = null;
		this.forSlot = null;
		this.prevSibling = null;
		this.nextSibling = null;
		this.key = null;
		this.parent = null;
		this.block = this as unknown as Block;
		this.kind = kind;
		// Keep its original position after kind; optional fields follow it.
		this.createdStamp = 0;
		this.__warmEpisode = undefined;
		this.__thenableDone = undefined;
		this.rare = null;
		this.signalInstanceParent = null;
		this.signalInstanceSite = undefined;
		this.signalInstanceValue = undefined;
		this.signalInstanceHasKey = false;
		this.signalInstanceResolved = undefined;
		this.signalTokenEscaped = false;
		this.signalOwner = undefined;
	}
}

/**
 * Per-Block state that only some features use. A Block holds `rare: null` until
 * the first such use allocates this record (blockRare), so ordinary Blocks stay
 * small. blockRare is the record's only allocation site and writes every key in
 * one order, so every record shares one hidden class. Readers that walk
 * parentBlock chains also meet LiteBlockImpl proxies, which carry `rare: null`.
 */
export interface BlockRare {
	// Try/Suspense/Activity boundary registration on the boundary's own blocks.
	tryHandler: TryHandler | undefined;
	suspenseHandler:
		((thenable: TrackedThenable<unknown>, sourceBlock: Block) => void) | null | undefined;
	trySlot: TrySlot | undefined;
	activitySlot: ActivitySlot | undefined;
	// `use(thenable)` state: entries plus the per-render call-order counter, which
	// renderBlockInner resets to 0 at the start of every render of this Block.
	thenables: TrackedThenable<unknown>[] | undefined;
	thenableIdx: number;
	// Thenables a compiler use() batch suspended on before its unwraps ran: the
	// held one at twice its call position, then the fresh one a replay dropped.
	// They share the lifetime of `thenables`.
	batchThenables: TrackedThenable<unknown>[] | undefined;
	// Fetch-tree warming cache for this render episode.
	warmCache: Map<HookSlot, WarmEntry[]> | undefined;
	warmCacheEpisode: number | undefined;
	// Nested-update loop guard for updates scheduled from commit callbacks
	// (effects, refs, store checks), scoped to one externally-started update
	// chain: its chain id, update count, and a pending maximum-depth error. A
	// Block without this record has never updated from a commit callback, which
	// the guard treats as a fresh chain with a zero count and no pending error.
	updateChain: number;
	updateCount: number;
	updateError: boolean;
	// useEffectEvent updates publish only for the latest render of this Block that
	// completed: `eventRender` versions each render attempt and `eventCommitted`
	// records the last one that completed. Zero means the Block has never called
	// useEffectEvent, so components without the hook stay free of aborted-render
	// filtering and of this record.
	eventRender: number;
	eventCommitted: number;
	// A `<ViewTransition>` component's current props (docs/view-transitions-plan.md).
	vt: ViewTransitionProps | null;
}

/** The Block's feature-only record, allocated on first use. Never call it on a LiteBlockImpl. */
export function blockRare(block: Block): BlockRare {
	return (block.rare ??= {
		tryHandler: undefined,
		suspenseHandler: undefined,
		trySlot: undefined,
		activitySlot: undefined,
		thenables: undefined,
		thenableIdx: 0,
		batchThenables: undefined,
		warmCache: undefined,
		warmCacheEpisode: undefined,
		updateChain: -1,
		updateCount: 0,
		updateError: false,
		eventRender: 0,
		eventCommitted: 0,
		vt: null,
	});
}

/**
 * Plain (non-Block) child Scope. Allocated once per (parent, call-site)
 * pair and reused across re-renders. Class-not-literal so V8 hands every
 * such scope the same hidden class — paired with the BlockImpl shape, the
 * Scope-typed read sites (unmountScope, fireCleanupsOnly, hook lookups via
 * `scope.hooks`) see exactly two stable classes instead of class-vs-literal.
 *
 * Field order matches the prior object-literal at withScope so existing
 * code that walked the keys (now via the indexed `_slots` array — see
 * registerSlot / unmountScope) sees identical structure.
 */
export class ScopeImpl {
	declare block: Block;
	declare parent: Scope | null;
	declare hooks: Map<HookSlot, any> | null;
	declare cleanups: Cleanup[] | null;
	declare effectSlots: EffectSlot[] | null;
	declare children: ChildScope[] | null;
	declare _slots: any[] | null;
	declare refFields: string[] | null;
	declare $$ctxValues: Map<Context<any>, any> | null;
	declare $$ctxReads: Map<Context<any>, any> | null;
	declare $$ctxCache: Context<any> | Map<Context<any>, Scope | typeof DEFAULT_CTX> | null;
	declare $$ctxCacheOwner: Scope | typeof DEFAULT_CTX | null;
	declare mounted: boolean;
	// Per-scope dense slot array (binding bag + control-flow/component/child slots),
	// indexed by compile-time slot index. Keeps the scope shape monomorphic.
	declare slots: any[];
	declare compilerMemo: CompilerMemoRegion | null;
	declare signalInstanceParent: Scope | null;
	declare signalInstanceSite: string | undefined;
	declare signalInstanceValue: unknown;
	declare signalInstanceHasKey: boolean;
	declare signalInstanceResolved: string | undefined;
	declare signalTokenEscaped: boolean;
	declare signalOwner: SignalRendererOwnerIdentity | false | null | undefined;

	constructor(parent: Scope, block: Block) {
		this.block = block;
		this.parent = parent;
		this.hooks = null;
		this.cleanups = null;
		this.effectSlots = null;
		this.children = null;
		this._slots = null;
		this.refFields = null;
		this.$$ctxValues = null;
		this.$$ctxReads = null;
		this.$$ctxCache = null;
		this.$$ctxCacheOwner = null;
		this.mounted = false;
		this.slots = [undefined];
		this.compilerMemo = null;
		this.signalInstanceParent = null;
		this.signalInstanceSite = undefined;
		this.signalInstanceValue = undefined;
		this.signalInstanceHasKey = false;
		this.signalInstanceResolved = undefined;
		this.signalTokenEscaped = false;
		this.signalOwner = undefined;
	}
}

export function createBlock(
	kind: BlockKind,
	parentBlock: Block | null,
	parentNode: Node,
	startMarker: Node | null,
	endMarker: Node | null,
	body: ComponentBody,
	props: any,
	extra?: any,
	outputHandler: OutputHandler | null = null,
): Block {
	const block = new BlockImpl(
		kind,
		parentBlock,
		parentNode,
		startMarker,
		endMarker,
		body,
		props,
		extra,
		outputHandler,
	) as unknown as Block;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBlockCreated();
	if (parentBlock !== null && block.idState.renderOwner === ROOT_RENDER_TRANSACTION?.owner) {
		createdInRootRender(block);
		// noteFrontierMember, inlined: a fresh run creates one Block per row.
		if (parentNode.nodeType === 11) {
			const next: SlotNext | undefined = (parentNode as any).$$next;
			if (next !== undefined) next.members!.push(block, parentNode);
		}
	}
	return block;
}

/** A cell before its first render-phase update, restored when that render throws. */
export type RenderPhaseSnapshot = {
	value: unknown;
	base: unknown;
	last: HookUpdate | null;
};

/** The abandoned render's folds of these cells must not publish at commit either. */
export function discardHookFolds(updates: Map<QueuedCell, RenderPhaseSnapshot>): void {
	const cells = ROOT_RENDER_TRANSACTION?.cells;
	if (cells === null || cells === undefined) return;
	let kept = 0;
	for (let i = 0; i < cells.length; i += 5) {
		const cell = cells[i] as QueuedCell;
		if (updates.has(cell)) {
			cell.stamp = 0;
			continue;
		}
		for (let j = 0; j < 5; j++) cells[kept + j] = cells[i + j];
		cell.at = kept;
		kept += 5;
	}
	cells.length = kept;
}

export function restoreRenderPhaseUpdate(cell: QueuedCell, snapshot: RenderPhaseSnapshot): void {
	cell.value = snapshot.value;
	cell.base = snapshot.base;
	const last = snapshot.last;
	if (last === null) cell.queue = null;
	else last.next = null;
	cell.last = last;
}

export function enqueueEffectEventUpdate(entry: PendingEffectEvent): void {
	EFFECT_EVENT_RENDER_TARGET.push(entry);
}

export function enqueueEffectEventCommitAction(action: EffectEventCommitAction): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileQueueWork(action);
	EFFECT_EVENT_ACTION_TARGET.push(action);
}

/**
 * Props advance before a body renders. An incomplete attempt therefore cannot
 * reuse equal props as proof of completed output. Invalidate its logical path,
 * including ancestors absent from an independently scheduled child's stack.
 * Lifetime and hook state remain mounted; untouched sibling caches stay valid.
 */
export function invalidateRender(block: Block, owner: Block | null = null): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.ROLLBACK_INVALIDATED);
	if (block.disposed) return;
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		// Lite component scopes carry a DOM/context proxy in this chain, not a
		// schedulable Block. Their real owning ancestor controls the retry.
		if (current.block === current) {
			current.renderStatus = RENDER_INVALID;
			if (current.forSlot !== null) current.forSlot.cachedDeps = null;
		}
		// Hidden work belongs to that visibility owner, not its already-committed
		// outer tree. A later enclosing rollback may invalidate a longer path.
		if (current === owner || (owner === null && current.inactive)) break;
	}
}

export function recordCapturedRender(capture: OffscreenCapture, block: Block): void {
	if (capture.rootTransaction === true) return;
	const root = (capture.renderRoot ??= block);
	// An independently mounted root can run synchronously inside another root's
	// speculative render. Its completed work is not owned by this capture.
	if (block === root || blockIsAncestorOf(root, block)) {
		(capture.renderedBlocks ??= new Set()).add(block);
	}
}

/**
 * An urgent render folds only urgent hook updates, so a Block whose transition
 * work waits keeps that work queued through it: an urgent ancestor rendering the
 * Block, or its split pending cue. Leave the Block pending at transition priority.
 */
export function keepTransitionWork(
	block: Block,
	pendingDeferred: boolean,
	queueEpoch: number,
): void {
	if (block.disposed || (block.pending && block.pendingMode === 'urgent')) return;
	block.pending = true;
	block.pendingMode = 'transition';
	block.pendingDeferred = pendingDeferred;
	// A nested flush can consume/reindex the queue while this urgent body runs.
	// Its old queue position is otherwise retained, so ordinary cascades need no
	// membership scan or extra queue entry.
	if (queueEpoch !== QUEUE_REINDEX_EPOCH && !QUEUE.includes(block)) QUEUE.push(block);
	// This render published the pending cue of a block whose transition waits for
	// the task, so the block's own queue entry in this drain need not render it again.
	if (TRANSITION_QUEUE.length !== 0 && TRANSITION_QUEUE.indexOf(block) !== -1) {
		if (RENDERED_CUE_DRAIN !== DRAIN_ID) {
			RENDERED_CUE_DRAIN = DRAIN_ID;
			RENDERED_CUES.length = 0;
		}
		RENDERED_CUES.push(block);
	}
}

// Generic JavaScript-return reconciliation is passed only to Blocks whose body
// may return a renderable. Compiled-void Blocks carry a null handler, allowing
// production bundles containing only `@{}` output to tree-shake this whole
// return/descriptor/childSlot path.
export let RETURNED_OUTPUT_SCOPE: Scope | null = null;

export function setReturnedOutputOwner(state: any, returned: boolean): void {
	if (state.returnedOutput === returned) return;
	if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
		TRANSITION_JOURNAL.push(JOURNAL_PROP, state, 'returnedOutput', state.returnedOutput);
	}
	state.returnedOutput = returned;
}

export function renderReturnedValue(block: Block, out: unknown, reset?: true): void {
	const previous = RETURNED_OUTPUT_SCOPE;
	RETURNED_OUTPUT_SCOPE = block;
	try {
		// Shared imperative bodies request a fresh native slot through this
		// injected handler, keeping disposal out of compiled-void consumers.
		if (reset === true) {
			const state = block.slots[0];
			if (state !== undefined) disposeReturnSlot(block, state);
			return;
		}
		// A single-root fragment descriptor (its renderer is `$$singleRoot`) mounts
		// MARKERLESS via componentSlot's singleRoot path — the element self-delimits,
		// so the DOM is byte-identical to `@{}`'s inline render (no extra markers).
		// Anything else (multi-root, arrays, strings, conditionals) → childSlot.
		const isComponentDescriptor =
			out !== null &&
			(out as any).$$kind === ELEMENT_TAG &&
			(out as any).key == null &&
			typeof (out as any).type === 'function';
		const existingRet = block.slots[0] as any;
		// Hydrating, a returned single-root component renders in the range that
		// bounds the block's output (bordersOutput), as the server rendered it. A
		// renderer is the returning component's own JSX, which the server renders
		// inline, so at a root, whose output has no range, it renders in place.
		const returnHydration = hydrating ? CURSOR : null;
		const borrows =
			returnHydration !== null &&
			existingRet === undefined &&
			(bordersOutput(block) ||
				(isComponentDescriptor &&
					(out as ElementDescriptor).__octaneInvocationSite === RENDERER_INVOCATION_SITE &&
					block.startMarker === null &&
					block.endMarker === null));
		let replacedStart: Node | null = null;
		let replacedEnd: Node | null = null;
		// A kind flip over committed DOM (usesFrontier) and its unwind point.
		let frontier: SlotNext | null = null;
		let domParent: Node = block.parentNode;
		let anchor: Node | null = block.endMarker;
		let journalAt = 0;
		let opsAt = 0;
		let retiredAt = 0;
		const useSingleRoot =
			isComponentDescriptor &&
			((out as any).type.$$singleRoot === true ||
				(borrows && block.startMarker === null) ||
				(hydrating ? CURSOR?.passthroughRanges === true : false) ||
				// STICKY regime: a return slot mounted through the componentSlot route
				// (most importantly by the passthrough-hydration branch above, whose
				// condition is false again once hydration ends) keeps that route while
				// the returned component identity is unchanged. Falling through to the
				// childSlot route would dispose the slot for a mere kind flip — tearing
				// down the very subtree hydration just adopted on its FIRST update. An
				// identity change still disposes below (matching remount semantics).
				(existingRet !== undefined &&
					existingRet.__kind === 'componentSlotSlot' &&
					existingRet.currentComp === (out as any).type));
		// The private return slot holds EITHER a componentSlotSlot (singleRoot
		// path) or a childSlot. A re-render can flip which applies: a body that
		// returns `<SingleRootComp/>` one render and `null` / a portal / an array
		// the next (a placeholder toggling on/off, a menu opening/closing). The two
		// shapes are incompatible, so tear the old one down before the other path
		// reads it as its own kind (else e.g. childSlot would touch a
		// componentSlotSlot and crash).
		if (
			existingRet !== undefined &&
			existingRet.__kind !== (useSingleRoot ? 'componentSlotSlot' : 'childSlot')
		) {
			if (
				ROOT_RENDER_TRANSACTION !== null &&
				!existingRet.inherited &&
				!existingRet.borrowed &&
				existingRet.ownerHost == null
			) {
				const first =
					existingRet.start ??
					existingRet.hostNode ??
					existingRet.text ??
					existingRet.block?.startMarker ??
					existingRet.end ??
					null;
				const last = existingRet.end ?? existingRet.block?.endMarker ?? first;
				if (sharesBlockBoundary(block, first, last)) {
					replacedStart = first;
					replacedEnd = last;
				}
			}
			if (usesFrontier(block, block.parentNode)) {
				// Over committed DOM the incoming slot renders in a fragment of its own
				// and takes the outgoing slot's place at commit. If it throws, the flip
				// unwinds like a rollback window and the outgoing slot stays.
				const transaction = ROOT_RENDER_TRANSACTION!;
				journalAt = TRANSITION_JOURNAL!.length;
				opsAt = transaction.ops.length;
				retiredAt = transaction.retired?.size ?? 0;
				const frag = queueFrontier(block, block.parentNode, block.endMarker);
				frontier = (frag as any).$$next as SlotNext;
				disposeReturnSlot(block, existingRet, frontier.out);
				frontier.follows = true;
				anchor = document.createComment('');
				frag.appendChild(anchor);
				domParent = frag;
			} else {
				disposeReturnSlot(block, existingRet);
				// Slot teardown runs user cleanups. A synchronous owning-root unmount must
				// not let this render publish a replacement into the disposed container.
				if (block.disposed) return;
			}
		}
		try {
			if (useSingleRoot) {
				const d = out as ElementDescriptor;
				// A value-position mount, as childSlot's are: the body may return one it
				// received (`return props.content`), which a cached region skips with the
				// body. Arm it as childSlot does, through the Block it inherits from.
				if (!block.memoInChain) promoteMemoAncestry(block);
				if (
					typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
					__OCTANE_PROFILE_ENABLED__ &&
					!__profileHasComponentMetadata(d.type as Function)
				) {
					withProfileComponentOverride(d.type as Function, null, () =>
						componentSlot(
							block,
							0,
							domParent,
							d.type as ComponentBody,
							d.props,
							d.__octaneInvocationSite,
							anchor,
							true,
							borrows || undefined,
							d.key ?? undefined,
							returnHydration !== null && elementKeyWasProvided(d),
						),
					);
				} else {
					componentSlot(
						block,
						0,
						domParent,
						d.type as ComponentBody,
						d.props,
						d.__octaneInvocationSite,
						anchor,
						true,
						borrows || undefined,
						d.key ?? undefined,
						returnHydration !== null && elementKeyWasProvided(d),
					);
				}
			} else {
				childSlot(block, 0, domParent, out, anchor);
			}
		} catch (error) {
			if (frontier !== null) {
				rollbackTransitionJournal(journalAt, block);
				dropRootOps(ROOT_RENDER_TRANSACTION!, opsAt, retiredAt);
			}
			throw error;
		}
		if (replacedStart !== null) {
			const incoming = block.slots[0] as any;
			const first =
				incoming.start ??
				incoming.hostNode ??
				incoming.text ??
				incoming.block?.startMarker ??
				incoming.end ??
				null;
			const last = incoming.end ?? incoming.block?.endMarker ?? first;
			if (frontier === null)
				replaceSharedBlockBoundary(block, replacedStart, replacedEnd, first, last);
			else frontier.bound = [block, replacedStart, replacedEnd, first, last];
		}
		if (frontier !== null) {
			// A single-root call that rendered at the fragment's end inserts before
			// the Block's end, as an in-place mount does.
			markerlessBranchRoots(block, domParent, anchor, block.endMarker);
			domParent.removeChild(anchor!);
		}
		const state = block.slots[0] as any;
		if (!block.disposed && state !== undefined && state.returnedOutput !== true) {
			// New returned children claim ownership on mount. Keep that common path
			// inline; shared-body handoffs use the cold journal helper.
			if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
				TRANSITION_JOURNAL.push(JOURNAL_PROP, state, 'returnedOutput', state.returnedOutput);
			}
			state.returnedOutput = true;
		}
	} finally {
		RETURNED_OUTPUT_SCOPE = previous;
	}
}

/**
 * Whether a range of `block`'s own bounds its output, so its return slot
 * borrows that range (protocol 3): the component's frame, or the range it
 * shares with a returning parent, a list item or an M3 parent. A root's output
 * has none, nor has a single-root block. Hydrating, neither has the client-built
 * range of a call the server did not frame.
 */
export function bordersOutput(block: Block): boolean {
	const start = block.startMarker;
	const end = block.endMarker;
	return (
		start !== null && end !== null && start !== end && start.nodeType === 8 && end.nodeType === 8
	);
}

// Tear down a block's private return slot when renderBlock's return value flips
// between the singleRoot componentSlot shape and the general childSlot shape. Fires
// the content's cleanups, removes its DOM + the slot's own markers, and drops the
// registry entry so the newly-chosen path rebuilds (and unmountScope won't
// double-process a now-stale slot of the wrong kind). Shared-body handoffs
// also use this path to replace native control-flow output with a different kind.
export function disposeReturnSlot(block: Block, state: any, out?: any[]): void {
	const kind = state.__kind;
	// A branch slot's arm is a Block, or a lite arm's stand-in with the same bound.
	const arm = state.block ?? state.lite?.block;
	// A nested sole-root branch can replace its host without refreshing the
	// outer slot's cached tail. Snapshot/remove only the live owned range.
	const end =
		(kind === 'ifBlockSlot' || kind === 'switchBlockSlot') &&
		state.start === null &&
		arm?.endMarker != null
			? arm.endMarker
			: state.end;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		const parent: Node = state.ownerHost ?? block.parentNode;
		const borrowed = state.inherited === true || state.borrowed === true;
		let first: Node | null =
			state.ownerHost != null || (borrowed && state.start === null)
				? getFirstChild(parent)
				: borrowed
					? getNextSibling(state.start)
					: (state.start ?? state.hostNode ?? state.text ?? arm?.startMarker ?? end ?? null);
		if (borrowed && first === end) first = null;
		const last: Node | null =
			first === null
				? null
				: state.ownerHost != null || (borrowed && end === null)
					? parent.lastChild
					: borrowed
						? end.previousSibling
						: (end ?? arm?.endMarker ?? first);
		journalObjectOnce(state);
		const retiredBlock = state.block ?? state.portal?.block ?? state.lite?.block;
		if (retiredBlock != null) retireRootBlock(retiredBlock);
		if (state.forSlot != null) {
			for (let item = state.forSlot.head; item !== null; item = item.nextSibling) {
				retireRootBlock(item);
			}
			if (state.forSlot.emptyBlock !== null) retireRootBlock(state.forSlot.emptyBlock);
		}
		// Keep the retired slot intact for connected-DOM cleanup. Only its
		// registry entry changes while the new return shape renders alongside it.
		if (out === undefined) queueRootDeletion(state, first, last);
		else out.push(state, first, last);
		journalRootProperty(block.slots, 0, block.slots[0]);
		const registry = block._slots;
		if (registry !== null) {
			const index = registry.indexOf(state);
			if (index !== -1) {
				journalUndo(() => registry.splice(index, 0, state));
				registry.splice(index, 1);
			}
		}
		block.slots[0] = undefined as any;
		return;
	}
	if (kind === 'childSlot') {
		if (state.portal) {
			teardownPortalState(state.portal);
			state.portal = null;
		}
		if (state.forSlot) {
			for (let b: Block | null = state.forSlot.head; b !== null; b = b.nextSibling)
				unmountBlock(b, true);
			if (state.forSlot.emptyBlock) unmountBlock(state.forSlot.emptyBlock, true);
			state.forSlot = null;
		}
		// Fires the content's cleanups and sweeps the nodes between the markers.
		clearChildContent(state);
		if (!state.borrowed) {
			(state.start as ChildNode | null)?.remove();
			(end as ChildNode | null)?.remove();
		}
	} else {
		// Component and native control-flow slots release their child lifetime.
		// An inherited/borrowed outer pair still belongs to its owning Block.
		if (kind === 'componentSlotSlot') {
			if (state.block) unmountBlock(state.block, true);
		} else {
			unmountSlot(state, true);
		}
		if (!state.inherited && !state.borrowed) {
			(state.start as ChildNode | null)?.remove?.();
			(end as ChildNode | null)?.remove?.();
		}
	}
	const reg = block._slots;
	if (reg !== null) {
		const i = reg.indexOf(state);
		if (i !== -1) reg.splice(i, 1);
	}
	block.slots[0] = undefined as any;
}

/**
 * Lite component slot: allocates ONLY a per-call-site Scope — no Block, no
 * Comment markers, no CompSlot wrapper. Emitted by octane/compiler at call
 * sites whose callee is a same-module FunctionDeclaration that:
 *   - calls no hooks (lexical free-identifier check)
 *   - has no `use(...)`, no @try, no `children` param
 *   - has no unknown free function calls (catches transitive hooks via helpers)
 * AND the call site itself has no `key=`, no spread props, no JSX children.
 *
 * The Scope shape matches ScopeImpl exactly, so V8 hands every lite scope the
 * same hidden class as the withScope branch and the cross-cutting Scope-typed
 * read sites (unmountScope, useContextInternal) stay clean.
 *
 * Recursion is safe: each call site allocates its OWN Scope (no aliasing of
 * slot-key namespace across recursion depths) — unlike Design (b) same-scope
 * dispatch, which would clobber `_if$N` etc. across nested recursive calls.
 */
/**
 * Minimal block-shaped object carrying the DOM insertion context for a lite
 * component body. The compiled body reads `__s.block.parentNode` and
 * `__s.block.endMarker` to position its cloned template; without these the
 * body would insert at the PARENT block's range (breaking nesting).
 *
 * Why not reuse BlockImpl: lite components don't
 * need scheduling, suspense, key, or marker bookkeeping. Carrying just the
 * DOM context and inherited ownership keeps the lite path lean. Real Blocks
 * created below this proxy must share its root's ID allocator and render owner;
 * otherwise their independent updates would lose the enclosing root transaction.
 */
export class LiteBlockImpl {
	declare parentNode: Node;
	declare endMarker: Node | null;
	declare parentBlock: Block;
	// Parent chains never change. Cache their nearest real Block so recursive
	// lite bodies do not repeat an ancestor walk at every structural slot.
	declare ownerBlock: Block;
	declare memoInChain: boolean;
	declare $$ctxValues: Map<Context<any>, any> | null;
	declare idState: RootIdState;
	// Signal-instance fields exist on every Block stand-in: signal key walks
	// read them polymorphically through scope.block and parentBlock chains.
	// stampSignalInstance gives it its lite scope's recipe, so descendant walks
	// keep that level. It has no forSlot field: signal readers test forSlot
	// loosely, so a stand-in never counts as a list row.
	declare signalInstanceParent: Scope | null;
	declare signalInstanceSite: string | undefined;
	declare signalInstanceValue: unknown;
	declare signalInstanceHasKey: boolean;
	declare signalInstanceResolved: string | undefined;
	// A lite component's stand-in has no range of its own (undefined), so a sole
	// component root inside it declines to borrow one. A lite control-flow arm's
	// stand-in carries its arm's bound exactly as an arm Block would: null until
	// its first render publishes the bound (renderMarkerlessArm).
	declare startMarker: Node | null | undefined;
	// Boundary, thenable and transition state never lives on a stand-in. Readers
	// that walk parentBlock chains see `rare === null` here and move on.
	declare rare: null;

	constructor(parentNode: Node, endMarker: Node | null, parentBlock: Block) {
		this.parentNode = parentNode;
		this.endMarker = endMarker;
		this.parentBlock = parentBlock;
		this.ownerBlock = parentBlock instanceof LiteBlockImpl ? parentBlock.ownerBlock : parentBlock;
		this.memoInChain = parentBlock.memoInChain;
		this.$$ctxValues = null;
		this.idState = parentBlock.idState;
		this.signalInstanceParent = null;
		this.signalInstanceSite = undefined;
		this.signalInstanceValue = undefined;
		this.signalInstanceHasKey = false;
		this.signalInstanceResolved = undefined;
		this.startMarker = undefined;
		this.rare = null;
	}
}

// ── Teardown error routing (React's captureCommitPhaseError for deletions) ──
// The handler is resolved ONCE at the outermost unmount entry, from the deletion
// root's PARENT chain — a boundary inside the deleted range is itself dying and
// cannot handle anything. Cleanup throws are COLLECTED during the walk and
// dispatched only after the outermost unmount returns: invoking a boundary
// mid-teardown would re-enter reconciliation over a half-torn tree (React
// likewise schedules the boundary update rather than running it inline).
// queueRefDetach captures the live handler per entry, so a commit-time ref
// detach throw (drainRefDetaches) routes to the same boundary.
let TEARDOWN_DEPTH = 0;
export let TEARDOWN_HANDLER: TryHandler | null = null;
/** The outermost deleted block — root-callback routing for teardown errors. */
export let TEARDOWN_BLOCK: Block | null = null;
let TEARDOWN_ERRORS: any[] | null = null;

function reportTeardownError(err: any): void {
	if (TEARDOWN_HANDLER !== null) (TEARDOWN_ERRORS ??= []).push(err);
	else if (!reportUncaughtError(TEARDOWN_BLOCK, err)) console.error(err);
}

function dispatchTeardownErrors(): void {
	const errs = TEARDOWN_ERRORS;
	const h = TEARDOWN_HANDLER;
	const blk = TEARDOWN_BLOCK;
	TEARDOWN_ERRORS = null;
	TEARDOWN_HANDLER = null;
	TEARDOWN_BLOCK = null;
	if (errs !== null && h !== null) {
		for (let i = 0; i < errs.length; i++) {
			reportCaughtError(blk, errs[i], h(errs[i]));
		}
	}
}

export function unmountBlock(block: Block, detachDom: boolean = true): void {
	if (block.disposed) return;
	if (
		ROOT_RENDER_ROLLBACK &&
		ROOT_RENDER_TRANSACTION !== null &&
		(ROOT_RENDER_TRANSACTION.retainedCreated?.has(block) ||
			(ROOT_RENDER_TRANSACTION.hydrating && block.kind !== 'portal'))
	)
		detachDom = false;
	if (defersRootUnmount(block)) {
		queueRootUnmount(
			block,
			block.exclusiveMarkers || (!detachDom && block.startMarker !== block.endMarker),
		);
		return;
	}
	if (TEARDOWN_DEPTH === 0) {
		// rendererRegionTryHandler's test, inline: a document with no region bridge.
		TEARDOWN_HANDLER =
			findTryHandler(block.parentBlock) ??
			(RENDERER_REGION_OWNER_COUNT === 0 ? null : rendererRegionTryHandler(block));
		TEARDOWN_BLOCK = block;
	}
	TEARDOWN_DEPTH++;
	try {
		unmountBlockInner(block, detachDom);
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
}

function unmountBlockInner(block: Block, detachDom: boolean): void {
	block.disposed = true;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		__profileBlockUnmounted();
		if (block.kind === 'root') __devtoolsUnregisterRoot(block);
	}
	const owner = block.idState.renderOwner;
	if (owner?.current === block) {
		owner.generation++;
		owner.wakeable = null;
		owner.request = null;
		if (TRANSITION_ROOT_DRIVER) TRANSITION_ROOT_DRIVER.discard(owner);
	}
	// An installed ViewTransition driver unregisters eagerly (its wrapped flush
	// also prunes lazily; the disposed stamp above drives exit detection).
	if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.unregister(block);
	// De-opt-managed host subtree (deoptItemBody item / hostElementBody element):
	// detach its stamped refs so a `ref={obj}` / callback ref doesn't keep pointing
	// at the removed node. Runs even when detachDom is false — those callers
	// (batchClearItems, clearChildContent) remove the DOM themselves, but the
	// teardown is just as permanent. Before unmountScope: a deleted host's ref
	// detaches before its component descendants' cleanups (React's pre-order
	// deletion walk). `deoptRefs` gates the walk: it is set (and propagated up
	// the parentBlock chain) whenever a descriptor carrying a ref is stamped
	// anywhere in this block's subtree, so a ref-free region skips the
	// whole-DOM descriptor scan.
	if (block.deoptNode !== null && block.deoptRefs)
		detachDeoptTreeRefs(block.deoptNode, null, true, block);
	// When THIS call removes the block's entire DOM range below, descendants must
	// not detach their own ranges first: every non-portal descendant's DOM lies
	// inside this range (portals always self-detach — unmountScopeChildrenAndSlotsOnly
	// forces their flag), so one wholesale removal replaces O(nodes) removeChild
	// calls, and every deletion cleanup observes the subtree still attached —
	// React's commitDeletionEffects order, which runs all destroys before it
	// detaches the single host. A cleanup that itself moves or removes the
	// block's markers forfeits the removal (the loop below guards on the live
	// parent), exactly as it would have forfeited its own range before.
	const removesOwnDom =
		detachDom &&
		(block.kind === 'root' ||
			(block.startMarker !== null &&
				block.endMarker !== null &&
				block.startMarker.parentNode !== null));
	// Depth-first cleanup of all scopes reachable from this block.
	unmountScope(block, detachDom && !removesOwnDom);
	if (NATIVE_READ_DRIVER && owner?.current === block) NATIVE_READ_DRIVER.clearDeferredRefs(owner);
	if (!detachDom) return;
	// Remove DOM range.
	if (block.startMarker && block.endMarker) {
		const parent = block.startMarker.parentNode;
		if (parent) {
			// Borrowed (slot) markers stay put — remove only the content between
			// them. Owned markers are removed inclusively with the content.
			const excl = block.exclusiveMarkers;
			let n: Node | null = excl ? getNextSibling(block.startMarker) : block.startMarker;
			const stop = excl ? block.endMarker : getNextSibling(block.endMarker);
			while (n && n !== stop) {
				const next: Node | null = getNextSibling(n);
				parent.removeChild(n);
				n = next;
			}
		}
	} else if (block.kind === 'root') {
		// Root block — clear the whole container.
		let c: Node | null;
		while ((c = getFirstChild(block.parentNode)) !== null) {
			block.parentNode.removeChild(c);
		}
	}
	// else: a non-root block with no markers produced no DOM (e.g. a singleRoot
	// component that suspended/threw before inserting) — nothing to remove.
}

/**
 * Register a slot object as owned by `scope`. Called from each slot-creation
 * site in runtime.ts (portal, componentSlot, trySlot, ifBlock, switchBlock,
 * forBlock, activityBlock, childSlot). The lazy `_slots` array lets
 * `unmountScope` walk slots in O(slot) instead of `for (key in scope)`
 * enumerating the entire hidden-class chain (~25-30 keys per Block at ~57k key
 * visits in a 2047-component tree).
 *
 * Invariant: every slot whose teardown requires recursing into a child Block
 * MUST be registered here (one creation site per slot kind); the
 * octane/compiler compiler never creates slot objects directly.
 */
export function registerSlot(scope: Scope, slot: any): void {
	const slots = scope._slots;
	const transaction = ROOT_RENDER_TRANSACTION;
	// Every new slot under a preexisting owner must be removed on rollback,
	// including slots in incomplete or newly created child scopes. Only an owner
	// created in this attempt goes away with them. Lite scopes use their owner's stamp.
	if (transaction !== null && !isCreatedInRootRender(transaction, owningBlock(scope.block))) {
		journalUndo(() => {
			unmountSlot(slot, true);
			const index = scope.slots.indexOf(slot);
			if (index !== -1) scope.slots[index] = undefined;
			if (slots === null) scope._slots = null;
			else {
				const index = slots.indexOf(slot);
				if (index !== -1) slots.splice(index, 1);
			}
		});
	}
	if (slots === null) scope._slots = [slot];
	else slots.push(slot);
}

// Slot-owned lifecycle work is carried as a capability instead of making the
// generic unmount walk reference a concrete feature implementation. Feature
// graphs such as deferred hydration can then disappear when their public API is
// not retained by the application bundle.
export const SLOT_FLAG_TEARDOWN = 1 << 0;

function unmountScope(scope: Scope, detachDom: boolean = true): void {
	// Fire THIS scope's teardown BEFORE recursing into children, so deletion
	// cleanups run parent → child — matching React's commitDeletionEffects
	// pre-order walk (ReactEffectOrdering-test.js:37/:64). The DOM range is
	// still attached here (unmountBlock removes it after this returns), so a
	// layout-effect cleanup can still observe its children's nodes — exactly as
	// in React, where the destroy runs while the subtree is still mounted.
	//
	// Effect destroys first, PHASE-CORRECT (React's commitDeletionEffectsOnFiber,
	// FunctionComponent): walk the scope's effect slots in hook DECLARATION order
	// — React's forward effect-list walk, so insertion and layout destroys fire
	// synchronously in their declared interleaving — and DEFER passive destroys
	// to the passive flush (React runs those in commitPassiveUnmountEffects,
	// after the sync phase). scope.effectSlots, not scope.cleanups: cleanups
	// registration is phase-EXECUTION order, which loses the declared order and
	// can't tell a passive destroy from a ref teardown.
	const effects = scope.effectSlots;
	if (effects !== null) {
		for (let i = 0; i < effects.length; i++) {
			const slot = effects[i];
			// Retire this call site's queued entries. The drains skip a disposed
			// Block's, but a lite Scope's stand-in is never disposed.
			slot.revision++;
			const cleanup = slot.cleanup;
			if (cleanup === undefined) continue;
			slot.cleanup = undefined;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileQueueCleanup(cleanup, slot.phase === PASSIVE ? TEARDOWN_BLOCK : scope);
			if (slot.phase === PASSIVE) {
				pendingPassiveUnmounts.push(cleanup, TEARDOWN_HANDLER, TEARDOWN_BLOCK);
				// Arm the post-paint drain for unmounts OUTSIDE a commit
				// (root.unmount()); a commit-driven unmount would re-arm in
				// commitEffects anyway, deduped by the flag.
				if (!passiveScheduled) schedulePassiveFlush();
			} else {
				try {
					runEffectCleanupCallback(cleanup, slot.phase, scope);
				} catch (err) {
					reportTeardownError(err);
				}
			}
		}
	}
	// Then the scope's remaining cleanups (ref detaches, listener teardown, slot
	// state) in REVERSE registration order.
	// Suppress queued ref detaches while unwinding an ABORTED mount (the scope's
	// render never completed — `mounted` is only set at the successful end of
	// renderBlock/componentSlotLite): its deferred ref attaches were — or will
	// be — skipped by drainRefAttaches' disposed-subtree guard, so firing
	// `ref(null)` would invoke a callback ref for work that never existed
	// (React never invokes refs for uncommitted work; ReactErrorBoundaries:1158).
	// De-opt refs are unaffected: their detaches queue from detachDeoptTreeRefs
	// walks outside this cleanups loop.
	let abortedRefs: SuspenseRefEntry[] | null = null;
	if ((scope as any).mounted !== true) {
		abortedRefs = [];
		collectVisibleSubtreeRefs(scope, abortedRefs);
	}
	withRefDetachSuppression(abortedRefs, () => {
		unmountScopeChildrenAndSlots(scope, detachDom);
	});
}

// Keep an aborted mount's exact-host ref suppression active for the complete
// recursive teardown. A child may have finished rendering and queued an attach
// before a later sibling aborts its parent; that child's attach never commits,
// so its recursive cleanup must not manufacture a matching detach.
function runScopeCleanups(scope: Scope, retireUnowned: boolean): void {
	const c = scope.cleanups;
	if (c !== null)
		for (let i = c.length - 1; i >= 0; i--) {
			try {
				runEffectLifecycleCallback(c[i], scope);
			} catch (err) {
				// Route to the boundary enclosing the DELETION (collected + dispatched
				// after the walk — see reportTeardownError); React parity: an error in a
				// deletion-phase cleanup reaches the nearest still-mounted boundary
				// instead of being swallowed (ReactErrorBoundaries:1927).
				reportTeardownError(err);
			}
		}
	const signalOwner = scope.signalOwner;
	if (signalOwner) {
		if (RETAINED_SIGNAL_OWNERS?.owners.has(signalOwner)) return;
		if (retireUnowned) scope.signalOwner = null;
		else scope.signalOwner = undefined;
		retireRendererSignalOwner(signalOwner);
	} else if (
		retireUnowned &&
		(signalOwner === false || (signalOwner === undefined && scope.signalTokenEscaped))
	) {
		retireUnownedSignalScope(scope);
	}
}

function retireUnownedSignalScope(scope: Scope): void {
	// Resolve after the cleanups, which may read the first handle. Null records retirement without allocating speculative authority.
	const owner = scope.signalOwner;
	if (owner === false || (owner === undefined && scope.signalTokenEscaped))
		scope.signalOwner = null;
	else if (owner) {
		scope.signalOwner = null;
		retireRendererSignalOwner(owner);
	}
}

function unmountScopeChildrenAndSlots(
	scope: Scope,
	detachDom: boolean,
	retireUnowned = true,
): void {
	runScopeCleanups(scope, retireUnowned);
	unmountScopeChildrenAndSlotsOnly(scope, detachDom);
}

// Split from the current scope's own cleanup list so HMR can preserve the
// component's hook-owned subscriptions while fully deleting rendered children.
// Ordinary unmount still calls both halves above in the established order.
function unmountScopeChildrenAndSlotsOnly(scope: Scope, detachDom: boolean): void {
	// Then recurse into child scopes and slot-stashed child Blocks (ifBlock /
	// forBlock / componentSlot / portal), parent → child, siblings in the order
	// they registered (ChildScope.at), so their teardown follows the tree.
	const children = scope.children;
	const slots = scope._slots;
	let c = 0;
	if (slots !== null) {
		for (let i = 0, n = slots.length; i < n; i++) {
			if (children !== null)
				for (; c < children.length && children[c].at <= i; c++)
					unmountScope(children[c].scope, detachDom);
			unmountSlot(slots[i], detachDom);
		}
	}
	if (children !== null)
		for (; c < children.length; c++) unmountScope(children[c].scope, detachDom);
}

export function unmountSlot(val: any, detachDom: boolean): void {
	if ((val.__flags & SLOT_FLAG_TEARDOWN) !== 0) val.__teardown(val, detachDom);
	// Read __kind ONCE per slot — the property access is megamorphic across
	// six slot shapes, so caching the local saves three repeat IC walks.
	const k = val.__kind;
	if (k === 'ifBlockSlot' || k === 'switchBlockSlot' || k === 'activityBlockSlot') {
		if (val.block) unmountBlock(val.block, detachDom);
		else if (val.lite != null) UNMOUNT_LITE_ARM!(val, detachDom);
	} else if (k === 'forBlockSlot') {
		// Item Blocks form an intrusive chain (head → nextSibling) — walk it
		// instead of the keyed Map's iterator (zero-alloc, monomorphic).
		for (let b: Block | null = val.head; b !== null; b = b.nextSibling) unmountBlock(b, detachDom);
		// An @empty branch (if any) hangs off the same slot.
		if (val.emptyBlock) unmountBlock(val.emptyBlock, detachDom);
	} else if (k === 'childSlot') {
		// A `{expr}` value slot holds EITHER a component Block (a component /
		// host-with-components value) OR a `forSlot` keyed list (an array value,
		// e.g. `{items.map(...)}`). Tear down whichever is live so the subtree's
		// cleanups fire on unmount (the array branch was previously unhandled).
		if (val.block) unmountBlock(val.block, detachDom);
		if (val.forSlot) {
			for (let b: Block | null = val.forSlot.head; b !== null; b = b.nextSibling)
				unmountBlock(b, detachDom);
			if (val.forSlot.emptyBlock) unmountBlock(val.forSlot.emptyBlock, detachDom);
		}
		// A `{createPortal(...)}` value hole — its content lives in a foreign
		// target, so (like portalSlotSlot) it must always self-detach.
		if (val.portal) teardownPortalState(val.portal);
		// A pure-host de-opt node managed directly by the slot (no Block):
		// this wholesale unmount is the only teardown it gets, so detach its
		// stamped refs here (the Block/forSlot cases above handle theirs via
		// unmountBlock's deoptNode hook).
		if (val.hostNode != null) detachDeoptTreeRefs(val.hostNode, null);
	} else {
		// componentSlotSlot | portalSlotSlot | optional boundary slots
		// Portal DOM lives in a FOREIGN target — the root-level batched clear
		// never reaches it, so portals must always self-detach individually.
		const childDetach = k === 'portalSlotSlot' ? true : detachDom;
		if (val.block) unmountBlock(val.block, childDetach);
		if (k === 'portalSlotSlot') releasePortalTarget(val);
	}
}

/**
 * Rebuild one hot component's compiled output without replacing its Block.
 *
 * Compiler bodies use `slots[0]` as their mount/update discriminator and cache
 * the exact template/binding layout in that scope. A newly compiled body cannot
 * safely read the old layout: static edits would never touch the DOM, while an
 * added binding/component can read a bag field that did not exist. Hot refresh
 * therefore tears down the rendered structure and hands the new body an empty
 * slot array, while retaining the Block and its Symbol.for-keyed hook cells.
 *
 * Hook-owned subscriptions stay registered; render-owned cleanup entries are
 * fired because their refs/head/fragment/host state belongs to the outgoing
 * DOM. Effects and memo callbacks have their deps invalidated so edited
 * closures publish on the refresh even when their authored dependency arrays
 * are unchanged. This is called only from HMR.update(), never a normal render.
 */
export function resetHmrBlock(block: Block): void {
	if (TEARDOWN_DEPTH === 0) {
		TEARDOWN_HANDLER = findTryHandler(block.parentBlock) ?? rendererRegionTryHandler(block);
		TEARDOWN_BLOCK = block;
	}
	TEARDOWN_DEPTH++;
	let abortedRefs: SuspenseRefEntry[] | null = null;
	if (!block.mounted) {
		abortedRefs = [];
		collectVisibleSubtreeRefs(block, abortedRefs);
	}
	try {
		withRefDetachSuppression(abortedRefs, () => {
			if (block.deoptNode !== null) detachDeoptTreeRefs(block.deoptNode, null);
			const cleanups = block.cleanups;
			let preserved: Cleanup[] | null = null;
			if (cleanups !== null) {
				for (let i = cleanups.length - 1; i >= 0; i--) {
					const cleanup = cleanups[i] as Cleanup & { [HMR]?: true };
					if (cleanup[HMR] === true) continue;
					try {
						runEffectLifecycleCallback(cleanup, block);
					} catch (err) {
						reportTeardownError(err);
					}
				}
				for (let i = 0; i < cleanups.length; i++) {
					const cleanup = cleanups[i] as Cleanup & { [HMR]?: true };
					if (cleanup[HMR] === true) (preserved ??= []).push(cleanup);
				}
			}

			// The outgoing DOM stays until the re-render's commit (clearHmrRange).
			unmountScopeChildrenAndSlotsOnly(block, false);

			block.children = null;
			block.cleanups = preserved;
			block._slots = null;
			block.refFields = null;
			block.slots = [];
			block.compilerMemo = null;
			block.deoptNode = null;
		});

		const hooks = block.hooks;
		if (hooks !== null) {
			for (const value of hooks.values()) {
				if (value !== null && typeof value === 'object' && hasOwnProp.call(value, 'deps')) {
					value.deps = undefined;
				}
			}
		}
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
}

/**
 * Tear down everything a scope rendered and hand it back empty, so a caller can re-render it from
 * scratch in the same Block. Used when a scope's children switch dialect: the outgoing dialect's
 * `slots`/`_slots`/child-scope state is meaningless to the incoming one, and leaving it in place
 * would have the incoming dialect adopt records of the wrong kind.
 *
 * The scope's own hook state goes with it. That is correct for the one caller — a Provider keeps
 * no hooks of its own, so every hook in the map belongs to the children being replaced.
 */
export function resetScopeChildren(scope: Scope, detachDom = true): void {
	// This deletion runs mid-render rather than through `unmountBlock`, so it has to install the
	// same teardown bracket that path does — otherwise a cleanup that throws would find no handler
	// and be logged instead of reaching the boundary enclosing the deletion.
	const block = scope.block;
	if (TEARDOWN_DEPTH === 0) {
		TEARDOWN_HANDLER = findTryHandler(block.parentBlock) ?? rendererRegionTryHandler(block);
		TEARDOWN_BLOCK = block;
	}
	TEARDOWN_DEPTH++;
	// The bracket spans the WHOLE reset, not just the teardown call: a queued error is dispatched
	// when the depth returns to zero, and its handler re-renders the enclosing boundary. Running
	// that while the scope is half torn down would have the handler walk a scope whose DOM range
	// and slot arrays disagree, so the scope is left consistent first.
	try {
		// The same Scope is reused by the new dialect/adoption attempt. Preserve
		// the existing owner cleanup but do not tombstone an unowned invocation.
		unmountScopeChildrenAndSlots(scope, detachDom, false);

		// Child scopes and slots detach their own DOM above, but a compiled body also creates host
		// nodes directly in the Block's range. Clear whatever is left of it. `removeRange` stops
		// BEFORE the end marker, so borrowed markers survive for their owning slot; a null start or
		// end means the Block runs to that edge of its parent (marker elision).
		const start = block.startMarker;
		if (detachDom)
			removeRange(
				start !== null ? getNextSibling(start) : getFirstChild(block.parentNode),
				block.endMarker,
			);

		// Drop the collections rather than emptying them: the lazily-allocated ones go back to null,
		// and `slots` gets a fresh array (compiled bodies index it directly, so it stays non-null).
		scope.children = null;
		scope.cleanups = null;
		scope._slots = null;
		scope.effectSlots = null;
		scope.hooks = null;
		scope.slots = [];
		scope.compilerMemo = null;
		// The compiled ref manifest describes the OUTGOING body's binding bag. A compiled body
		// re-stamps its own on mount, but the descriptor dialect never does — it would leave the
		// old manifest pointed at a `childSlot` record, which `detachSubtreeRefs` would then read
		// as a bag.
		scope.refFields = null;
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
}

/**
 * Release a lite arm's Scope. A rollback can restore a slot that names an arm
 * the attempt already released, and the owner's undo then releases it again,
 * so a released Scope keeps nothing left to release.
 */
export function releaseLiteArm(scope: Scope): void {
	// A lite arm's stand-in always has its owner's Block above it.
	const parent = scope.block.parentBlock!;
	if (TEARDOWN_DEPTH === 0) {
		TEARDOWN_HANDLER = findTryHandler(parent) ?? rendererRegionTryHandler(parent);
		TEARDOWN_BLOCK = owningBlock(parent);
	}
	TEARDOWN_DEPTH++;
	try {
		unmountScope(scope, false);
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
	scope.cleanups = null;
	scope.children = null;
	scope._slots = null;
}

/** Dispose a list's rows from `first` on, then remove everything between its markers. */
export function clearItems(first: Block | null, start: Comment, end: Comment, size: number): void {
	// One teardown bracket spans the items and their DOM, as in unmountBlock: a
	// cleanup error dispatches to its boundary only after the list is cleared, so a
	// boundary re-render cannot dispose the list while this still writes through it.
	if (first !== null && TEARDOWN_DEPTH === 0) {
		TEARDOWN_HANDLER =
			findTryHandler(first.parentBlock) ??
			(RENDERER_REGION_OWNER_COUNT === 0 ? null : rendererRegionTryHandler(first));
		TEARDOWN_BLOCK = first;
	}
	TEARDOWN_DEPTH++;
	try {
		// Retire every row before any row's cleanup can move focus off another. Only
		// captured focus (or no capture at all) can make a row dispatch, and a node
		// outside code put between the rows keeps its own handlers.
		if (renderingFocus !== null || !inFlush)
			for (let b: Block | null = first; b !== null; b = b.nextSibling)
				if (b.startMarker != null) retireHostRange(b.startMarker, b.endMarker);
		// Dispose the items before their DOM leaves, like every other deletion:
		// cleanups observe attached hosts. Walk the intrusive item chain (head →
		// nextSibling) rather than the Map's iterator: zero allocation and a
		// monomorphic pointer chase. A cleared row keeps its links, so the chain
		// still covers exactly the old items here.
		for (let b: Block | null = first; b !== null; b = b.nextSibling) {
			if (
				b.cleanups !== null ||
				b.children !== null ||
				b._slots !== null ||
				b.hooks !== null ||
				b.effectSlots !== null ||
				b.refFields !== null ||
				// A row's signal authority, or a token its handlers escaped with,
				// retires with it (runScopeCleanups).
				b.signalOwner !== undefined ||
				b.signalTokenEscaped
			) {
				unmountBlock(b, false);
			} else {
				// Pure-host de-opt item (deoptItemBody with no component descendants):
				// nothing to unmount scope-wise, but its subtree may carry stamped refs
				// that must not keep pointing at the batch-removed DOM. Guarded so the
				// common template-row clear stays a single null check; `deoptRefs`
				// additionally skips the subtree scan for ref-free items.
				if (b.deoptNode !== null && b.deoptRefs) detachDeoptTreeRefs(b.deoptNode, null);
				b.disposed = true;
			}
		}
		// A commit's earlier deletion cleanup can have unmounted the list itself.
		const p = start.parentNode;
		if (p === null) return;
		// Clear wholesale only while exactly these rows lie between the markers:
		// outside code may have added a node there since the render.
		// getNextSibling, inlined: this visits every row.
		const read = nextSiblingGetter;
		let node: Node | null = getNextSibling(start);
		for (let b: Block | null = first; b !== null && node !== null; b = b.nextSibling) {
			const last = b.endMarker;
			node =
				node !== b.startMarker || last === null
					? null
					: read !== undefined
						? read.call(last)
						: last.nextSibling;
		}
		if (node !== end) {
			for (let b: Block | null = first; b !== null; b = b.nextSibling)
				if (b.startMarker != null && b.startMarker.parentNode === p)
					removeRange(b.startMarker, getNextSibling(b.endMarker!));
		} else if (start.previousSibling === null && getNextSibling(end) === null) {
			// forBlock owns the parent — nuke everything in one DOM op, then re-add markers.
			(p as Element).textContent = '';
			p.appendChild(start);
			p.appendChild(end);
		} else if (size < RANGE_CLEAR_MIN_ITEMS) {
			// Shared parent (other JSX interleaved) — detach the marker span directly.
			// Each removal takes a whole item subtree, so this is one call per ITEM,
			// not per node.
			removeRange(getNextSibling(start), end);
		} else {
			// Large shared-parent clear — one bulk DOM call amortizes the Range setup.
			const range = document.createRange();
			range.setStartAfter(start);
			range.setEndBefore(end);
			range.deleteContents();
		}
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
}
