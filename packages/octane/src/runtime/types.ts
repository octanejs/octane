// Shared runtime types
//
// Interfaces that several concept modules name: Block, Scope, the slot records,
// root render transactions and offscreen captures. Types compile away, so this
// module never loads. A type that one module alone names stays with that
// module.

import type { BindingHandoff } from '../dom-binding-handoff.js';
import type { ControlHandoff } from '../signals/control-handoff.js';
import type {
	HydrationStrategy,
	HydrationRuntimeGate,
	HydrationPrefetchWaitReason,
} from '../hydration/types.js';
import type { HydrationIntentBoundary, HydrationReplayIntent } from '../hydration/event-capture.js';
import type { ELEMENT_TAG } from '../runtime-tags.js';
import type { NativeReadRetry } from '../signals/native-read-retry.js';
import type { PendingSlotLike } from '../signals/transition-state.js';
import type { SignalRendererOwnerIdentity, SignalOwner, ScopeSeed } from '../signals/types.js';
import type { SignalRetryNode, OpaqueSignalKeys } from './signal-owners.js';
import type { FragmentInstance } from './refs.js';
import type { EffectEventCommitAction } from './engine.js';
import type { EffectDepsSnapshot } from './effects.js';
import type {
	ViewTransitionClassValue,
	ViewTransitionRef,
	ViewTransitionInstance,
} from './view-transition.js';
import type { TrackedThenable } from './use.js';
import type { HookUpdate, TransitionHookSlot } from './transitions.js';
import type { Context, DEFAULT_CTX, DirectContextReads } from './context.js';
import type { PortalSlot } from './portals.js';
import type { BlockKind, BlockRare, SLOT_FLAG_TEARDOWN } from './block.js';
import type {
	InternalHydrateProps,
	HydrateInitialCaptures,
	teardownHydrateBoundary,
} from './hydrate-boundary.js';
import type { SuspenseHiddenDom, teardownTrySlot, InsertionEffectReplays } from './suspense.js';
import type { PresentationHydrationFrame } from './hydration-presentation.js';
import type { Fragment } from './elements.js';
import type { ActivityHiddenDom } from './activity.js';
import type { ForSlot } from './lists.js';

// Bundler integrations replace the reserved constant in both normal and profile
// builds. Each use retains a typeof guard so the unbundled source/dist entry stays
// importable; using the define directly (instead of through a local const) lets
// Vite/Rspack erase the branch and its profiling import from normal bundles.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentBody<P = any, E = any> = (props: P, scope: Scope, extra: E) => void;
declare const EFFECT_CLEANUP_VOID_ONLY: unique symbol;
type EffectCleanup = () => void | { [EFFECT_CLEANUP_VOID_ONLY]: never };
export type EffectFn = () => void | EffectCleanup;
export type Cleanup = () => void;
export type HookSlot = symbol | number;

/** @internal Cross-renderer parent ownership carried on compiler-created region props. */
export interface RendererRegionOwnerBridge {
	readonly active: boolean;
	readContext<T>(context: Context<T>): T;
	routeError(error: unknown): boolean;
	routeSuspense(thenable: PromiseLike<unknown>): boolean;
	registerDispose(dispose: () => void): () => void;
	/**
	 * Resolve a foreign (host-renderer) context object to a root-local Octane
	 * mirror context. `use()`/`useContext()` consult this on their cold
	 * unknown-usable path when the reading component lives under an owned root;
	 * the returned mirror then flows through the ordinary Octane context reader
	 * (local-provider-first, memo dependency recording, owner fallback).
	 * Returning null declines the object and restores the normal diagnostic.
	 */
	resolveForeignContext?(context: object): Context<any> | null;
}

export interface EffectEventCell {
	impl: (...args: any[]) => any;
	active: boolean;
}

export interface PendingEffectEvent {
	cell: EffectEventCell;
	nextImpl: (...args: any[]) => any;
	block: Block;
	renderVersion: number;
}

export interface Scope {
	block: Block;
	parent: Scope | null;
	/**
	 * An event handler published this scope as its signal authority. Deletion then
	 * records retirement for a scope that never resolved an owner, so a handler
	 * queued past the deletion cannot mint fresh instance state for it.
	 */
	signalTokenEscaped: boolean;
	/**
	 * The renderer signal owner this scope resolved (scopeSignalOwner), false when
	 * it borrows an enclosing row's owner, or null once retired. Undefined until
	 * a render or handler first resolves it.
	 */
	signalOwner: SignalRendererOwnerIdentity | false | null | undefined;
	/**
	 * Hook slot map. Lazily allocated on the first hook call via `ensureHooks`.
	 * For-of item bodies that never call a hook (the common case in
	 * js-framework-benchmark-shaped lists) keep this as `null` for their
	 * lifetime — saving the Map allocation per Block on mass-mount paths.
	 * Reads use optional chaining (`scope.hooks?.get(slot)`) which returns
	 * `undefined` when null, identical to a Map.get miss.
	 */
	hooks: Map<HookSlot, any> | null;
	/**
	 * Teardown callbacks (ref detaches, listener removal, slot cleanup). Lazily allocated by
	 * `pushCleanup` — most scopes never register one, so the array is only paid for on demand,
	 * matching `hooks` / `effectSlots` / `_slots`.
	 */
	cleanups: Cleanup[] | null;
	/**
	 * This scope's effect slots in hook DECLARATION order (first-enqueue order —
	 * the order the hooks ran in the scope's first render). unmountScope walks it
	 * to reproduce React's deletion contract (commitDeletionEffectsOnFiber's
	 * forward effect-list walk): insertion + layout destroys fire synchronously in
	 * the declared interleaving, passive destroys are DEFERRED to the passive
	 * flush. A flat array (not the hooks Map) so teardown is an indexed walk with
	 * no iterator allocation and no filtering past state/memo/ref slots. Null on
	 * effect-less scopes — the common case on mass-mount paths.
	 */
	effectSlots: EffectSlot[] | null;
	/**
	 * Per-call-site child scopes, stored as `[key, scope]` pairs in a flat array
	 * (NOT a Map): iteration is a plain indexed for-loop, and lookups are linear
	 * scans — faster than `Map.get` for the typical N ≤ 8 case (most components
	 * have a handful of static sub-component calls at most).
	 *
	 * Lazily allocated when the first child scope registers: a leaf component has none.
	 */
	children: ChildScope[] | null;
	mounted: boolean;
	/**
	 * Slot objects owned by this scope (ifBlockSlot, forBlockSlot, etc.).
	 * Lazily allocated by registerSlot at the slot's first creation site;
	 * walked directly by unmountScope so teardown doesn't have to enumerate
	 * the entire hidden-class chain looking for `_xxx$N` slot keys.
	 * Null on scopes with no slots — the common case for leaf components.
	 */
	_slots: any[] | null;
	/**
	 * Compiled REF MANIFEST (compiled-output plan, ref-manifest phase): a
	 * module-scope constant the mount path stamps when the body has ref-carrying
	 * bindings — flat triads of [kind, bagField, elBagField]: 'r' = element ref
	 * (`ref={…}`), 's' = spread (its committed object may carry a ref), 'f' =
	 * `<Fragment ref>` (the FragmentInstance field; third slot unused). The
	 * suspense-hide walk (detachSubtreeRefs) reads slots[0] through it — which
	 * is what lets ref-carrying bag fields take 1-char names and ride the
	 * positional arity factories (previously they kept long `_ref$N` names for
	 * a key-prefix scan, forcing the whole bag onto the bagOf spill). Null on
	 * ref-less bodies — the common case.
	 */
	refFields: string[] | null;
	/**
	 * Per-scope context Provider map. Pre-initialised to null on both Scope
	 * and Block so the field's hidden-class position is stable across all
	 * instances — Provider stamping was previously a late `??=` add that
	 * fragmented the post-render shape tree of every Block under a Provider
	 * ancestor.
	 */
	$$ctxValues: Map<Context<any>, any> | null;
	/** Context dependencies recorded during this scope's render (memo invalidation). */
	$$ctxReads: Map<Context<any>, any> | null;
	/**
	 * Resolved-provider cache for `use(ctx)`. Maps a context to the ancestor
	 * scope/block whose `$$ctxValues` satisfies it for THIS consumer (or the
	 * DEFAULT_CTX sentinel when none does). The mapping is invariant across a
	 * consumer's lifetime — parent chains are fixed at creation, a provider scope
	 * never drops a context it stamped, and a closer provider can't appear above a
	 * surviving consumer — so only the provider's VALUE varies, read live from the
	 * cached scope. Collapses useContextInternal's O(depth) walk to an O(1) read.
	 * The first context and its resolved owner live inline; only a second distinct
	 * context allocates a Map. The owner is never the value itself, so Provider
	 * updates remain visible on subsequent reads.
	 */
	$$ctxCache: Context<any> | Map<Context<any>, Scope | typeof DEFAULT_CTX> | null;
	$$ctxCacheOwner: Scope | typeof DEFAULT_CTX | null;
	// Per-scope dense slot array. Holds, by COMPILE-TIME index, this scope's binding
	// bag (slot 0) and every control-flow / component / child slot state — plus the
	// runtime-internal slots (`__ret`, `__kids`, `_item`, `_children`, `_fb`). Indexing
	// (vs. the old `scope[`_for$N`]` dynamic string keys) keeps the Scope object shape
	// MONOMORPHIC: bindings no longer mutate the scope's hidden class per component.
	slots: any[];
	/** Lazy compiler-owned memo regions, independent of the dense DOM/control slots. */
	compilerMemo: CompilerMemoRegion | null;
	/**
	 * Signal-instance key recipe, split across fields so stamping a scope costs
	 * five stores instead of a record allocation plus a WeakMap entry. Last
	 * writer wins: a recipe stamp clears `signalInstanceResolved`, and a direct
	 * resolved-key stamp leaves the recipe fields alone (the resolved check runs
	 * first). A scope is unstamped iff `signalInstanceParent === null` and
	 * `signalInstanceResolved === undefined`.
	 */
	signalInstanceParent: Scope | null;
	signalInstanceSite: string | undefined;
	signalInstanceValue: unknown;
	signalInstanceHasKey: boolean;
	signalInstanceResolved: string | undefined;
	/**
	 * DEV ONLY (set by `dev`-compiled bodies; `undefined` in production): a structured
	 * hydration source-location table — `{ slotIndex: [line, column] }` — plus `locFile`,
	 * the module's source file name. Read by hydration-mismatch warnings (`siteLoc`) to
	 * report `App.tsrx:42:5`, and reusable by a future Chrome-DevTools element→source layer.
	 * Absent (never allocated) in prod, so the Scope shape stays monomorphic there.
	 */
	locs?: Record<number, [number, number]>;
	locFile?: string;
}

// A compiled body normally owns the only region in its Scope. Context Providers
// and loaded/lazy bodies can run a second body in that same Scope, so their
// per-body caches live in a lazily allocated overflow Map instead of aliasing.
// The fixed record keeps all four fields in-object with one stable V8 map.
export type CompilerMemoRegion = {
	bodyId: number;
	auto: any[] | undefined;
	hooks: any[] | undefined;
	overflow: Map<number, CompilerMemoRegion> | null;
};

export interface ChildScope {
	// withScope uses Symbol per call-site; componentSlotLite uses its numeric slot
	// index (identity-equality is identical to symbols/strings for the linear-scan
	// lookup, and the key is only an identity tag — unmount walks `children` directly).
	key: symbol | string | number;
	scope: Scope;
	/** The parent's `_slots` length at registration: walks visit it before that slot. */
	at: number;
}
export interface SignalRetryOwners {
	paths: SignalRetryNode;
	owners: Set<SignalRendererOwnerIdentity>;
}
export interface SignalRetryLocation {
	parent: Scope;
	slot: number;
	kind: string;
	branch: unknown;
	component: unknown;
	key: unknown;
}

export type OutputHandler = (block: Block, value: unknown, reset?: true) => void;

export interface RootIdState {
	prefix: string;
	next: number;
	/** Shared deterministic namespace for lazily used module-signal instances. */
	signalState?:
		{ prefix: string; next: number; opaqueKeys?: Map<string, OpaqueSignalKeys> } | undefined;
	/** Shared render ownership; descendants already carry this root-local record. */
	renderOwner?: RootRenderOwner | undefined;
	/** Exclusive end of an SSR-reserved deferred-boundary range. */
	limit?: number;
	/** Root allocator used if a hydration mismatch consumes beyond that range. */
	overflow?: RootIdState;
}

export interface Block extends Scope {
	kind: BlockKind;
	parentBlock: Block | null;
	parentNode: Node;
	/** Root-owned useId namespace/counter, shared by every descendant block. */
	idState: RootIdState;
	startMarker: Node | null;
	endMarker: Node | null;
	/**
	 * When true, start/end are BORROWED from an enclosing slot (e.g. an `@if`
	 * branch that reuses the if-slot's permanent markers instead of minting its
	 * own `br`/`/br` pair). DOM teardown then removes the content BETWEEN the
	 * markers but leaves the markers themselves for the owning slot/parent.
	 */
	exclusiveMarkers: boolean;
	body: ComponentBody;
	props: any;
	extra: any;
	outputHandler: OutputHandler | null;
	/**
	 * False proves neither this block nor any ancestor is memoized or armed for
	 * implicit bailout. Inherited on creation and promoted through retained
	 * descendants when a boundary gains memo/implicit metadata. True remains
	 * conservative across body changes and rollback.
	 */
	memoInChain: boolean;
	pending: boolean;
	disposed: boolean;
	/**
	 * RENDER_VALID / RENDER_INVALID / RENDER_RETRYING, separate from mount lifetime.
	 * Kept numeric because nested renders can invalidate an active retry in place.
	 */
	renderStatus: number;
	/**
	 * The single pure-host DOM node this Block manages on the de-opt path, REUSED
	 * across re-renders so DOM-resident state survives (no rebuild). Set by
	 * `deoptItemBody` (a `.map()` item that is a host element) and by `hostElementBody`
	 * (the host-element-with-component-children renderer). Null for every other Block.
	 */
	deoptNode: Node | null;
	/**
	 * True when a de-opt descriptor carrying a `ref` was stamped anywhere in this
	 * block's subtree. Set at stamp time and propagated up the parentBlock chain
	 * (monotone — never cleared). Gates the teardown ref-detach walk over
	 * `deoptNode`: a region that never stamped a ref has nothing to detach, so
	 * the per-DOM-node descriptor scan is skipped entirely.
	 */
	deoptRefs: boolean;
	/** Set on item Blocks: pointer to the enclosing for-block's slot. */
	forSlot: ForSlot | null;
	/** Item position within the enclosing for-block. 0 for non-item blocks. */
	itemIndex: number;
	/** Root-render transaction that created this block (0 outside a transaction). */
	createdStamp: number;
	/**
	 * Doubly-linked-list pointers for for-block item blocks. Maintained by
	 * reconcileKeyed so move/remove are O(1) pointer ops instead of array
	 * splice. The list head/tail live on ForSlot. Always present (null on
	 * non-item blocks) to keep Block monomorphic — V8 transitioning between
	 * hidden classes for the rare "is this an item?" case was measurably worse
	 * than carrying a couple of null pointers everywhere.
	 */
	prevSibling: Block | null;
	nextSibling: Block | null;
	/** Cached key for this item Block. null on non-item blocks. */
	key: any;
	/**
	 * Feature-only state (BlockRare): boundary handlers and slots, use()
	 * thenables, fetch-tree warming, the commit-callback loop guard,
	 * useEffectEvent versions and `<ViewTransition>` props. Null until the first
	 * of those features touches this Block, and always null on LiteBlockImpl.
	 */
	rare: BlockRare | null;
	/**
	 * Render priority for the next scheduled render: 'transition' (queued from
	 * inside startTransition — suspending shouldn't swap to fallback if prior
	 * UI is committed) or 'urgent' (default). Read & cleared when the render
	 * is dispatched.
	 */
	pendingMode: 'urgent' | 'transition' | null;
	/** The render mode in effect during the body's *current* execution. */
	currentRenderMode: 'urgent' | 'transition' | null;
	/**
	 * "Deferred lane" bit riding alongside pendingMode: true when the next
	 * scheduled render was spawned by useDeferredValue's deferred swap. Read &
	 * cleared with pendingMode when the render is dispatched.
	 */
	pendingDeferred: boolean;
	/**
	 * True while the body executes inside a useDeferredValue-spawned deferred
	 * pass (inherited by nested renders, like currentRenderMode). Drives React's
	 * anti-waterfall rule: only the FIRST useDeferredValue level defers — a hook
	 * mounting inside an already-deferred pass adopts its final value directly.
	 */
	currentRenderDeferred: boolean;
	/**
	 * Set on a block inside a HIDDEN `<Activity>` subtree. While inactive, the
	 * block still renders (state + DOM are produced/updated) but its effects do
	 * NOT run (enqueueEffect skips when any ancestor is inactive); on reveal the
	 * flag is cleared and a re-render re-fires the effects.
	 */
	inactive: boolean;
	/** Direct (own) context reads this render — drives memo invalidation alongside $$ctxReads. */
	$$ctxDirect: DirectContextReads | null;
	/**
	 * The context epoch at which this block's $$ctxReads/$$ctxDirect
	 * entries were last known consistent with live context versions: sampled when
	 * renderBlock clears the dependencies (this render repopulates them at current
	 * versions) and re-stamped after a bailout verifies every recorded entry.
	 * While it equals the current epoch NO context anywhere has changed since, so
	 * the per-bail version scans are provably redundant. restampCtxDeps poisons it
	 * (-1) when it merges a stale version into this block's map, so a still-pending
	 * consumer refresh can never be masked by the fast path.
	 */
	$$ctxDepsEpoch: number;
	/**
	 * Armed for React's IMPLICIT same-element bailout (beginWork's
	 * oldProps === newProps skip). Set at value-position component mounts
	 * (childSlot); makes the block a context-stamping target like `__memo` so
	 * the bail's lazy consumer refresh is sound.
	 */
	$$implicitBail: boolean;
	/**
	 * Render-loop guard: the drainQueue pass this block last rendered in, and how
	 * many times it rendered within that pass. A block that keeps re-queueing
	 * itself from its own render body (an unguarded render-phase setState) is a
	 * non-converging loop — drainQueue throws after RENDER_PHASE_UPDATE_LIMIT,
	 * mirroring React's "Too many re-renders". Negative stamps are transient
	 * scheduler-sort epochs: drainRenders holds depth until the first render
	 * resets it under the positive drain id.
	 */
	drainStamp: number;
	drainRenders: number;
	/** True when the queued render came from a different component's render body. */
	crossRenderUpdate: boolean;
}

export interface EffectSlot {
	deps: any[] | undefined;
	cleanup: Cleanup | undefined;
	/** Render token of the latest completed attempt that reached this call site. */
	renderVersion: number;
	/** Invalidates queued work superseded by a later render or presence transition. */
	revision: number;
	/** Whether the latest completed render reached this registered call site. */
	active: boolean;
	/** Stable first-enqueue order within the owning scope. */
	order: number;
	/** Hook key retained so a bailed Suspense descendant can reconnect at commit. */
	slot: HookSlot;
	/** Last effect body and args that actually reached commit. */
	connectedFn: EffectFn | null;
	connectedArgs: any[] | undefined;
	/** True after Suspense/Activity disconnected this committed effect. */
	disconnected: boolean;
	/** Discriminant so deactivateScope can find effect slots among state/memo/ref. */
	effect: true;
	/**
	 * The slot's phase (INSERTION/LAYOUT/PASSIVE), fixed at creation (a hook slot
	 * is one call site, and a call site has one phase). deactivateScope uses it to
	 * spare INSERTION effects on hide: React never disconnects insertion effects
	 * for a hidden (<Activity>/suspended) tree — they own injected styles that
	 * must persist — only a real unmount cleans them up.
	 */
	phase: Phase;
}

export interface PendingEffect {
	scope: Scope;
	slot: HookSlot;
	/** Null for a conditional call site that disappeared and only needs teardown. */
	fn: EffectFn | null;
	/** Stable first-enqueue order of the owning slot within its scope. */
	order: number;
	/** Slot revision this entry belongs to; stale entries are ignored at drain. */
	revision: number;
	/**
	 * The effect's deps array, spread as positional arguments to the body when it
	 * runs (`fn.apply(null, args)`). This is a deliberate superset of React: a
	 * body written as a pure function of its deps — `(a, b) => …` — captures
	 * nothing from the render scope, so the compiler can hoist it to module scope
	 * (one allocation, no stale-closure retention). Zero-arg React-style bodies
	 * still work (extra args are ignored). `undefined` for the no-deps form.
	 */
	args: any[] | undefined;
	/**
	 * The effect's phase, copied from its slot. The mutation-phase drain merges
	 * the INSERTION and LAYOUT queues into one per-scope walk (see
	 * drainMutationEffects) and needs the phase per entry without a hooks-map
	 * lookup.
	 */
	phase: Phase;
	/**
	 * Monotonic enqueue sequence (DFS pre-order, since rendering is top-down). Used
	 * by the commit drains to reconstruct React's exact commit order: TRUE post-order —
	 * descendant-before-ancestor (via the parentBlock chain), and disjoint subtrees
	 * in enqueue order. A plain depth sort fires deepest-first GLOBALLY, which gets
	 * the parent/child relationship right but mis-orders a shallow node in an earlier
	 * sibling subtree against a deeper node in a later one; React walks the tree, so
	 * sibling order wins over raw depth. Without correct order, a parent layout
	 * effect that reads refs/measurements from child layout effects (react-aria
	 * FocusScope, react-redux subscribers, react-spring measurements …) sees stale
	 * state.
	 */
	seq: number;
}

/**
 * React's update-queue model on one tree. `value` is what the last committed
 * render showed. `queue` holds every update that render did not fold into
 * `base`, oldest first: from the first update it skipped onward, applied or
 * not, updates stay queued so a later render rebases them over `base` in
 * order (processUpdateQueue). An empty queue means `base` equals `value`.
 * A render folds into the root transaction (foldHookQueue) and the commit
 * publishes the result (commitHookCells); a dropped render publishes nothing,
 * so a held transition is simply updates that have not been processed yet.
 */
export interface QueuedCell {
	value: any;
	base: any;
	queue: HookUpdate | null;
	last: HookUpdate | null;
	/** The root transaction holding this cell's uncommitted fold, and its offset there. */
	stamp: number;
	at: number;
}

export interface TransitionActionBatch {
	/** Blocks whose hook cells queued this batch's updates; they render when it is ready. */
	blocks: Block[];
	pendingActions: number;
	closed: boolean;
	flushed: boolean;
	/** The root transaction and drained origin that last folded this batch (noteTransitionBatch). */
	stamp: number;
	origin: Block | null;
	/** Whether a dropped render held this batch before (dropTransitionRender). */
	held: boolean;
	/** The batch this one entangled into by sharing a hook cell, and its own members. */
	merged: TransitionActionBatch | null;
	members: TransitionActionBatch[] | null;
	/** Members not yet flushed: the batch cannot render without them. */
	waiting: number;
	/** Set once its work and every hold are over (finishTransitionHookBatch). */
	finished: boolean;
	/** Holds keeping it from rendering (TransitionHold.suspends). */
	suspended: number;
	/** Profile builds only: queued updates as (cell, block, cause, slot) quadruples. */
	profile?: unknown[];
	/**
	 * Only hook-started actions own pending indicators. Nearly every batch has
	 * exactly one starting hook, so the first is a plain field and only a second
	 * distinct hook (a nested start from another component) allocates the list.
	 */
	hook: TransitionHookSlot | null;
	hooks: TransitionHookSlot[] | null;
	/** True while this batch is counted in its hooks' pending batch counts. */
	hooksPending: boolean;
	/** Armed to finish with the drain rendering its work (armTransitionFall). */
	falling: boolean;
	/** QUEUE_REINDEX_EPOCH when its hooks last raised isPending (queueTransitionFall). */
	cueEpoch: number;
	pendingHolds?: number;
	workComplete?: boolean;
	/**
	 * Signal nodes pending in this batch (signals/pending.ts), promoted once it
	 * and every batch entangled into it finish; null once they have been.
	 */
	signals?: PendingSlotLike[] | null | undefined;
}

export interface RootRenderOwner {
	current: Block | null;
	/** Shared document/account data owner; distinct from this root's presentation owner. */
	signalOwner?: SignalOwner | undefined;
	/** Immutable initial-response history, borrowed by deferred and streamed adoptions. */
	initialDocumentSignals?: ScopeSeed | undefined;
	bindingLeases?: Set<BindingHandoff>;
	controlLeases?: Map<Element, ControlHandoff | undefined>;
	preservePresentation?: boolean;
	/**
	 * Installed while the client render that replaces a failed hydration has
	 * yet to commit (installHydrationFallback). A mount calls it where it would
	 * clear the container, for the frontier it renders in, so the server DOM
	 * stays until it commits, and with `failed` when it ends in an uncaught error.
	 */
	hydrationFallback?: ((failed: boolean) => SlotNext | null) | undefined;
	bindingContainer?: Node;
	adopt?: ((block: Block) => void) | undefined;
	retry: () => void;
	request: ((mode: 'urgent' | 'transition') => void) | null;
	generation: number;
	wakeable: PromiseLike<unknown> | null;
	/** Lazily allocated only by adapters carrying metadata across fresh retry scopes. */
	retryKey: object | null;
	/** Actual first-mount signal state retained only for the current retry episode. */
	retrySignalOwners?: SignalRetryOwners | undefined;
	/** Only native suspended readers allocate a retry lease outside their discarded Scopes. */
	nativeRetry?: NativeReadRetry;
	transaction: RootRenderTransaction | null;
	disposed: boolean;
	/** A finished transaction's empty commit queue, which the next one reuses. */
	spareOps: any[] | null;
}

export interface HydrationEventReveal {
	state: TrySlot;
	capture: OffscreenCapture;
	releasedHold: boolean;
}

export interface RootRenderTransaction {
	owner: RootRenderOwner;
	log: any[];
	bags: Map<object, number>;
	capture: OffscreenCapture;
	created: Block[] | null;
	createdStamp: number;
	bagWindow: number;
	retainedCreated: Set<Block> | null;
	/** Blocks this render deleted, still connected until commit. Truncated on drop. */
	retired: Set<Block> | null;
	/**
	 * The commit queue: `(fn, target)` pairs that commitRootRenders runs in render
	 * order, before refs and layout effects. A template queues `(C, bag)`
	 * (bagDone); a slot whose structure changed queues `(applySlotNext, slot)`
	 * when it starts reconciling, ahead of its descendants' entries. A dropped
	 * window truncates the queue and touches no DOM (dropRootOps).
	 */
	ops: any[];
	/** Open render frames; a nested flushSync must not commit a render still running. */
	rendering: number;
	/** Hook-cell folds published at commit, five slots each (foldHookQueue). */
	cells: any[] | null;
	/** Transition batches folded into this transaction (noteTransitionBatch). */
	batches: TransitionActionBatch[] | null;
	/** Boundaries or the root that held a transition render; it drops at the origin's end. */
	holders: Array<TrySlot | RootRenderOwner> | null;
	/** Memo entries and cells transition renders replaced, three slots each (setMemoEntry). */
	memos: any[] | null;
	/** Text nodes with a write in `ops`; the DOM does not show that write yet (renderText). */
	texts: Set<Text> | null;
	aborted: boolean;
	rootRequest: boolean;
	/** Parked reveals whose staged host events this root must accept. */
	hostEventReveals?: HydrationEventReveal[];
	hydrating?: boolean;
	/** A ViewTransition holds its commit for the native update (vtFlush). */
	held?: boolean;
	/** The owner generation that commit was prepared for (refreshPendingOwner). */
	heldGeneration?: number;
	/**
	 * A catch arm caught an error in this render (setTryBranch), or its root
	 * reported one that none caught (handleResumeError). The client render that
	 * replaces a failed hydration then commits without reporting that failure,
	 * as React's does.
	 */
	caught?: boolean;
	/**
	 * The client render that replaces a failed hydration: the server's
	 * independent island wrappers that no Hydrate in it has adopted yet
	 * (keptHydrationIsland).
	 */
	keptIslands?: Element[];
}

/**
 * A slot's pending structure in the open root render (#2043). The slot's own
 * fields are what the DOM shows; `next` holds what this render changed. It is
 * allocated the first time a root render changes the slot, stamped with that
 * transaction so a record a dropped render left behind is replaced rather than
 * reused, and applied by the slot's `(applySlotNext, slot)` commit entry.
 */
export interface SlotNext {
	tx: RootRenderTransaction;
	/**
	 * Outgoing content, three entries each: its owner (a Block, a lite arm's
	 * Scope, a slot, a cleanup callback or null), then its first and last node.
	 */
	out: any[];
	/**
	 * The frontier: incoming content built off-document, which commit inserts
	 * into `parent` before `before` (slotFrontier).
	 */
	frag: DocumentFragment | null;
	/** A branch arm's lone root, rendered detached: commit inserts it as it would `frag`. */
	root: Node | null;
	parent: Node | null;
	before: Node | null;
	/** Blocks, lite stand-ins and try slots created directly in `frag`. */
	members: any[] | null;
	/** The Block whose slot this is: a deletion cleanup can dispose it first. */
	owner: Block | null;
	/**
	 * The incoming content replaces the last outgoing range and lands where
	 * that range stands at commit, wherever an earlier entry moved it.
	 */
	follows: boolean;
	/**
	 * Where a sole-root ancestor shares the replaced range's bound: the slot's
	 * parent Block (possibly a lite stand-in), that bound, and the incoming one
	 * it moves to at commit (replaceSharedBlockBoundary).
	 */
	bound: any[] | null;
}

export interface ViewTransitionProps {
	name?: string;
	/** Create an element scope from one persistent host. Omitted boundaries inherit their scope. */
	scope?: 'element';
	ref?: ViewTransitionRef;
	enter?: ViewTransitionClassValue;
	exit?: ViewTransitionClassValue;
	update?: ViewTransitionClassValue;
	share?: ViewTransitionClassValue;
	/**
	 * Parent enter/exit relays (React's enableViewTransitionParentEnterExit —
	 * experimental-channel behavior): a nested boundary inside a unit that
	 * entered/exited as a whole activates its parentEnter/parentExit when every
	 * strict intermediate boundary also relays (declares parentEnter/parentExit
	 * or the matching handler, not resolving 'none') and the unit's outermost
	 * boundary genuinely enters/exits (not 'none', not consumed by a share).
	 */
	parentEnter?: ViewTransitionClassValue;
	parentExit?: ViewTransitionClassValue;
	default?: ViewTransitionClassValue;
	onEnter?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	onExit?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	onUpdate?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	onShare?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	onParentEnter?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	onParentExit?: (instance: ViewTransitionInstance, types: string[]) => void | (() => void);
	children?: unknown;
}
export type Phase = 0 | 1 | 2;

// ─────────────────────────────────────────────────────────────────────────────
// useSyncExternalStore commit-sync queue (React's `updateStoreInstance` shape).
//
// A uSES consumer must, at COMMIT, reconcile the snapshot it read during render
// against the store as it stands at commit time — a store that mutated in the
// render→commit window would otherwise leave the committed DOM torn. React does
// this by pushing the fiber onto a per-root store-consistency list drained after
// the layout effects (updateStoreInstance); we mirror it with a dedicated,
// SORT-FREE queue instead of routing each consumer through the generic layout
// effect (enqueueEffect → depsChanged → PendingEffect alloc → the commit drain's
// post-order sort + per-entry hooks-map/cleanup/finalizer bookkeeping).
//
// The win is twofold: (1) the entries carry no cleanup and never reorder, so the
// heavyweight effect machinery is pure overhead for them; (2) the enqueue is
// GATED (see enqueueStoreSync) — a re-render whose snapshot is Object.is-unchanged
// pushes NOTHING, so the dominant zustand/query pattern (a fresh inline
// getSnapshot every render over an unchanged snapshot) drops from one layout
// entry per consumer per parent re-render to zero. Subscription lifecycle stays a
// real passive `useEffect` (it owns cleanup/unmount); only the value-sync moves
// here. See useSyncExternalStore for the full contract.
export interface StoreInst<T> {
	/** The last-COMMITTED snapshot. onStoreChange dedups notifies against this. */
	value: T;
	/** Latest getSnapshot — updated in RENDER (see the render-phase gate) so the
	 *  subscription handler always compares against the freshest read. */
	getSnapshot: () => T;
	/** The snapshot read during the render that queued this entry; committed to
	 *  `value` at drain (React binds it as updateStoreInstance's nextSnapshot arg). */
	pending: T;
	/** The subscribe last seen at enqueue — a store swap re-arms the tear check. */
	subscribe: (onStoreChange: () => void) => () => void;
	/** Immutable passive-effect deps, replaced only when subscribe changes. */
	effectDeps: [StoreInst<T>, (onStoreChange: () => void) => () => void] | null;
	/** Force a re-render of the owning block (same path as a useState setter). */
	forceUpdate: () => void;
	/** Stable notify handler handed to subscribe(); re-renders iff the snapshot
	 *  changed (Object.is dedup). Stable across re-subscribes by design. */
	onStoreChange: () => void;
	/** Owning block — drainStoreSyncs skips disposed/hidden blocks like the effect drains. */
	block: Block;
	/** True while this inst sits in the sync queue — prevents a second push when a
	 *  block renders twice before its single commit (last render's `pending` wins). */
	queued: boolean;
}

// Deferred ref attaches (React-19 timing parity). On mount the whole subtree is
// built and inserted before its DOM is connected to the document, so attaching a
// ref inline would hand a callback ref / measure a node that is NOT yet
// connected. Instead the compiler enqueues mount ref attaches here; they drain
// during commit, AFTER all renders/DOM insertion and BEFORE layout effects, so
// callback refs see a connected node and ref.current is populated by the time a
// layout effect runs — matching React's commit-phase ref attachment.
export interface RefAttach {
	/** Exact queued ref; initial Fragment mounts use the live-ref trampoline below. */
	ref: any;
	el: Element | FragmentInstance;
	block: Block | null;
	/**
	 * Its place in its root render: how many commit ops that render had queued,
	 * or the index of the commit op that queued it.
	 */
	op: number;
}

export interface SuspenseRefEntry {
	ref: any;
	el: Element | FragmentInstance;
	/** Owning scope preserves child-before-parent commit ordering and error routing. */
	scope: Scope;
}

// Effect capture for a render that may not commit: a root transaction or a hidden
// boundary's retry. Its effects and ref attaches must NOT fire until it commits, and
// belong to content that never lands if it is dropped. While `WIP_CAPTURE` is set,
// enqueueEffect/queueRefAttach redirect into it instead of the live queues; on commit
// the captured entries are spliced back so the normal pipeline drains them (child-first,
// after the new nodes are connected). The render is synchronous and single-threaded, so
// every effect enqueued while the buffer is set belongs to it.
export interface OffscreenCapture {
	/** Root journals already record render validity without a second subtree set. */
	rootTransaction: boolean;
	/** Executed bodies whose output/commit work is reusable only if this capture survives. */
	renderRoot: Block | null;
	renderedBlocks: Set<Block> | null;
	effects: [PendingEffect[], PendingEffect[], PendingEffect[]];
	events: PendingEffectEvent[];
	eventActions: EffectEventCommitAction[];
	refs: RefAttach[];
	detaches: any[] | undefined;
	// uSES store-syncs enqueued during this off-screen render (see storeSyncQueue).
	// Spliced into the live queue on commit, dropped on dispose — a WIP that never
	// lands must not mutate a committed inst (its inst is fresh anyway, per the
	// fresh-block render, so dropping is both correct and cheap).
	stores: StoreInst<any>[];
	/** Suspense visibility changes become recent only when this capture commits. */
	suspenseCommits: Set<TrySlot> | undefined;
	/** Speculative renderer transactions are released only after commit or discard. */
	renderCleanups: Array<(discarded: boolean) => void> | undefined;
	/** Only a structural binding lease records current-tree adoption receipts. */
	presentations?: PresentationHydrationFrame[];
	/** Host events become observable at root acceptance, before mutation callbacks. */
	hostEvents?:
		Array<(() => void | (() => void)) & { recover?: (error: unknown) => void }> | undefined;
}

// A target has one effective ref binding; array refs remain one composite value.
// If render-phase replays queue several identities for the same target, the last
// canceled attach is the manifest's current ref and therefore the only one the
// hide walk can attempt to detach.
export type UncommittedRefAttaches = Map<Element | FragmentInstance, any>;

export interface HydrateSlot {
	__kind: 'hydrateBlockSlot';
	__flags: typeof SLOT_FLAG_TEARDOWN;
	__teardown: typeof teardownHydrateBoundary;
	block: Block;
	wrapper: HTMLDivElement;
	/** Independent children belong to their own root, not a parent-owned range. */
	start: Comment | null;
	end: Comment | null;
	parentBlock: Block;
	props: InternalHydrateProps;
	/** Changed direct context reads, retained before render dependency reset. */
	contextChanged: boolean;
	boundaryId: string;
	intentBoundary: HydrationIntentBoundary;
	delegatedDynamicIntent: boolean;
	serverPreserved: boolean;
	seedRaw: string | null;
	/** Ready native values are scoped to this independently activated island. */
	nativeSeedRaw?: string | undefined;
	idState: RootIdState;
	/** One-shot result of the client-only function form of `when`. */
	dynamicStrategy: HydrationStrategy | null;
	/** Most recently observed effective strategy, used for post-hydration notification. */
	strategy: HydrationStrategy | null;
	gate: HydrationRuntimeGate | null;
	strategyCleanup: (() => void) | null;
	prefetchCleanup: (() => void) | null;
	prefetchAbort: AbortController | null;
	prefetchStarted: boolean;
	prefetchPromise: Promise<void> | null;
	preloadPromise: Promise<void> | null;
	loadedBody: ComponentBody | null;
	/** Allocated only when procedural prefetch subscribes through waitFor(). */
	hydrationWaiters: Set<(reason: HydrationPrefetchWaitReason) => void> | null;
	/** Invalidates async completions from an earlier hydration request. */
	activationGeneration: number;
	activationRequested: boolean;
	activationReady: boolean;
	/** An SSR activation attempt currently owns the try slot's suspended retry. */
	serverActivationStarted: boolean;
	hydrated: boolean;
	didNotify: boolean;
	hasError: boolean;
	error: unknown;
	replays: HydrationReplayIntent[];
	independent: boolean;
	/** Server-claim captures, retained only until a preserved boundary activates. */
	initialCaptures: HydrateInitialCaptures | null;
	/** A root render's client fallback, built off-document (fallBackOffDocument). */
	next: SlotNext | null;
}

export type HostPropSource = readonly [
	isSpread: boolean,
	sourceOrName: unknown,
	value?: unknown,
	merge?: boolean | undefined,
];
export interface ElementDescriptor<P = any> {
	$$kind: typeof ELEMENT_TAG;
	// A compiled ComponentBody (the fast/common case, e.g. `root.render(<App/>)`)
	// OR a host tag string (`'li'`) — the latter is produced when host JSX appears
	// at a VALUE position (a `.map(...)` callback, a function return, an array
	// literal) and is rendered by the runtime de-opt path (see `renderDeopt`).
	type: ComponentBody<P> | string | typeof Fragment;
	props: P;
	// React-style `key`, lifted out of props. Consulted by the de-opt list path
	// when this descriptor is an item of an array child.
	key: any;
	// React 19 treats refs as ordinary props. Keep the deprecated element-level
	// alias too so code which still inspects `element.ref` observes the same value.
	ref: any;
	// Children passed to `createElement(type, props, ...children)` (host de-opt).
	// `null` for the component-value form (children flow through the component).
	children: any;
	/** @internal Compiler-stable component invocation identity. */
	__octaneInvocationSite?: string;
}

// ---------------------------------------------------------------------------
// Renderable expression hole — `{expr}` (no string cast) as element content
// ---------------------------------------------------------------------------
//
// `{x as string}` (and string literals / template literals) compile to the fast
// text binding (`htext`/`setText`). A bare `{x}` is a RENDERABLE hole, matching
// Ripple: it renders a component/children-function or an element descriptor,
// and coerces a primitive to text. The compiler routes these through a compCall
// entry tagged `isChild`, emitting `childSlot(...)` instead of `componentSlot`.
//
// childSlot owns ONE `<!--[-->`/`<!--]-->` marker pair (the same shape the
// server emits via `ssrBlock`/`ssrComponent` for every renderable hole, so
// hydration alignment is uniform whether the value is a component or a
// primitive). Between the markers it holds EITHER a Block (function /
// ElementDescriptor) or a single Text node (primitive). A value whose mode
// flips across renders tears the old content down — cleanups fire, content
// nodes are removed — and rebuilds in place, keeping the markers.
//
// Exception: a client mount whose FIRST value is a lone pure-host descriptor
// (e.g. `createElement('div')` returned from a component, or rendered at a
// root) is ANCHORLESS — no markers at all, the element self-delimits (`end`
// is null; mirrors componentSlot's singleRoot regime). A later mode flip
// promotes the slot to the marked regime by minting the pair in place.

export interface ChildSlot {
	__kind: 'childSlot';
	/**
	 * Lower-bound marker. Null on the client text/empty path — a single `Text`
	 * node is tracked directly via `text` and needs no start marker. Lazily
	 * created the first time the slot hosts a (possibly multi-node) component, so
	 * `clearChildContent` can sweep the component's range. Always present after
	 * hydration (adopted from the server's `<!--[-->`).
	 */
	start: Comment | null;
	/**
	 * Upper-bound marker / insertion anchor. Null in ANCHORLESS mode: a client
	 * mount whose first value is a LONE PURE-HOST descriptor mints NO markers at
	 * all — the element self-delimits (mirroring componentSlot's singleRoot
	 * regime), so a host descriptor returned at a root / return slot IS
	 * `container.firstChild` (React parity). A later render that flips the
	 * value's mode promotes the slot to the marked regime by minting the pair
	 * on demand around the host node (see childSlot). Non-null in every other
	 * regime (and always after hydration).
	 */
	end: Comment | null;
	/**
	 * OWNS-PARENT mode (marker-elision M2): the slot exclusively owns ALL
	 * children of this element (a de-opt host handed its entire content to one
	 * childSlot). No markers are ever minted — inserts append (null anchor) and
	 * clears remove every child of the element. Mutually exclusive with the
	 * marked regime; hydration never enters it (adoption wins at mount).
	 */
	ownerHost: Element | null;
	/**
	 * Hydration compaction: this slot's pair is borrowed from its sole-range
	 * parent. Teardown may clear between the comments but must never remove the
	 * comments themselves.
	 */
	borrowed: boolean;
	/** Compiler proof that this renderable hole is the body's entire output. */
	compactable: boolean;
	block: Block | null;
	text: Text | null;
	currentComp: ComponentBody | null;
	// True when `currentComp` is a render-FUNCTION child rather than a component
	// reference. Render bodies can change identity every parent render, so reconcile
	// them by SLOT. Tagged compiler children additionally bail when the SAME function
	// is passed through unchanged (see the component path below).
	currentIsBodyFn: boolean;
	// Non-null while the slot is rendering an ARRAY value via the de-opt keyed
	// list path (reuses reconcileKeyed). Torn down when the value stops being an
	// array. Lets `{items.map(...)}` / `{props.rows}` / any array-of-elements
	// child render soundly without compile-time pattern matching.
	forSlot: ForSlot | null;
	// The single pure-host (no component descendants) DOM node currently rendered at
	// this slot, REUSED across re-renders by the de-opt reconciler so DOM-resident
	// state survives. Null when the slot holds a component/text/array instead.
	hostNode: Node | null;
	// Non-null while the slot's value is a `createPortal(...)` descriptor — its
	// content lives in a foreign target, so the slot's own markers stay empty. Torn
	// down when the value stops being a portal. Lets a portal render at any value
	// position (component return, ternary, fragment root, render-fn result).
	portal: PortalSlot | null;
	/** Pending structure in the open root render (SlotNext). */
	next: SlotNext | null;
	/** Cold capability path for a signal passed through an otherwise-unmarked prop. */
	implicitSignal?: unknown;
}

export interface TrySlot {
	/** Only an initial hydrated primary discarded by suspension needs transfer. */
	retrySignalOwners?: SignalRetryOwners | undefined;
	__kind: 'trySlotSlot';
	__flags: typeof SLOT_FLAG_TEARDOWN;
	__teardown: typeof teardownTrySlot;
	start: Comment;
	end: Comment;
	// -1 init, 0 catch, 1 try (resolved), 2 pending
	branch: -1 | 0 | 1 | 2;
	/**
	 * Currently-visible block (try body, pending fallback, or catch body).
	 * NOT necessarily the same as `tryBlock` — when pending is shown, `block`
	 * is the pending block and `tryBlock` is preserved off-screen.
	 */
	block: Block | null;
	/**
	 * Persistent try-body block. Survives suspend/resume cycles so its
	 * `scope.hooks` (useState/useMemo/useRef state) replays just like React's
	 * WIP-fiber-discard-but-keep-memoizedState contract. Cleared by `catch`
	 * and by `reset()` since those are explicit fresh starts.
	 */
	tryBlock: Block | null;
	/** Connected host content hidden during suspend; restored on resume. */
	hiddenDom: SuspenseHiddenDom | null;
	tryBody: ComponentBody;
	catchBody: ComponentBody | null;
	pendingBody: ComponentBody | null;
	/**
	 * JSX ErrorBoundary catches errors but lets suspensions reach an enclosing
	 * Suspense boundary. Compiler-authored @try blocks keep their existing
	 * no-@pending behavior when this is false.
	 */
	propagateSuspense: boolean;
	/**
	 * Hoisted-helper env tuple (compiled-output Phase 2): the construct's
	 * captured parent locals, shared by the try/pending/catch helpers and
	 * refreshed by the compiled call site every parent render. Stamped as
	 * `block.extra` wherever an arm block is created or re-rendered.
	 */
	env: any[] | undefined;
	/**
	 * True once the try body has committed at least once. Load-bearing: gates
	 * the transition-hold path in handleSuspense — a boundary with no committed
	 * content must show @pending, not hold prior DOM it never had.
	 */
	hasResolved: boolean;
	err: any;
	/** The thenable we're currently waiting on (so duplicate listeners don't fire). */
	pendingThenable: TrackedThenable<any> | null;
	/** Commit work from a successful hidden transition retry, held until its group reveals. */
	stagedCapture: OffscreenCapture | null;
	/** Effect deps from before `stagedCapture`, restored if it is superseded. */
	stagedEffectDeps: EffectDepsSnapshot | null;
	/**
	 * True if a transition-priority render suspended on this try block AND we
	 * incremented TRANSITION_PENDING_COUNT to keep useTransition's isPending
	 * latched true. Released when the suspended thenable resolves (in retry).
	 */
	transitionHeld: boolean;
	/**
	 * Pending setTimeout id for the transition-suspense fallback. When a
	 * transition-priority render suspends on an already-committed try block
	 * we hold the prior DOM. A fallback swap is scheduled only for the explicit
	 * finite-timeout extension — see TRANSITION_FALLBACK_TIMEOUT_MS.
	 *
	 * Cleared (clearTimeout) on retry resolve, on switchToCatch, and on
	 * scope teardown so we don't leak callbacks past the slot's lifetime.
	 */
	transitionTimeoutId: any | null;
	/**
	 * Host refs detached when this boundary suspended (object refs set to null,
	 * callback refs invoked with null). React treats ref attachment like a layout
	 * effect — destroyed on hide, recreated on reveal — even though the DOM node is
	 * preserved. Captured on the FIRST hide (a re-suspend during a partial resolve
	 * doesn't re-detach). A primary hiding inside an already-hidden primary takes
	 * the sentinel without detaching: the enclosing hide owns those refs. The list
	 * keeps the detached identities alive as a hide sentinel; reveal re-enumerates
	 * the CURRENT ref manifests so superseded refs cannot reattach. null = nothing
	 * detached.
	 */
	detachedRefs: SuspenseRefEntry[] | null;
	domParent: Node;
	parentBlock: Block;
	/**
	 * useId state shared by every arm. Streamed boundaries replace the inherited
	 * root state with an opaque boundary namespace during hydration, preserving
	 * the inherited signal namespace independently of the DOM ID prefix.
	 */
	idState: RootIdState;
	/** Logical boundary above a selected hydration-container owner. */
	passthrough: boolean;
	/** Stable boundary reset dispatcher; remains safe after unmount. */
	reset: () => void;
	/** The arms a root render builds off-document (insertArmPair). */
	next: SlotNext | null;
}

/** DOM handlers return their own surviving catch block; external bridges return void. */
export type TryHandler = (err: any) => Block | null | void;

export interface ActivitySlot {
	__kind: 'activityBlockSlot';
	block: Block | null;
	hidden: boolean;
	/** Hidden-host ownership is released even when a hidden Activity unmounts. */
	fragmentVisibilityCleanupRegistered: boolean;
	/** Invalidates a queued visible→hidden commit when a newer render wins. */
	commitVersion: number;
	/** The visible effects still need their commit-phase deactivation. */
	deactivationPending: boolean;
	/** A hidden Activity contains suspension without hiding its visible siblings. */
	pendingThenable: TrackedThenable<unknown> | null;
	suspend: ((thenable: TrackedThenable<unknown>) => void) | null;
	/** Monotone gate: ref-free Activities never walk host-ref manifests. */
	hasRefs: boolean;
	/** Insertion-effect rollback is paid only by Activities that contain them. */
	hasInsertionEffects: boolean;
	pendingInsertions: InsertionEffectReplays | null;
	/** Allocated on first hide; scratch sets are reused across visibility updates. */
	hiddenDom: ActivityHiddenDom | null;
	/** Logical portal descendants, including portals nested under host elements. */
	portals: Set<Block> | null;
}

// One live public root owns a container at a time. React still returns a second
// root for a duplicate createRoot call, but publishes a diagnostic because two
// independent owners can otherwise race over the same DOM. Tokens make release
// safe when an older duplicate root unmounts after the newer one was created.
export type RootContainer = Element | Document | DocumentFragment;
