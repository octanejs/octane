// Block and scope storage. Keep constructor shape, initialization order and valid render identity together.

import { type SignalRendererOwnerIdentity } from '../signals/types.js';
import type {
	ComponentBody,
	OutputHandler,
	Block,
	RootIdState,
	HookSlot,
	Cleanup,
	EffectSlot,
	ChildScope,
	Scope,
	Context,
	CompilerMemoRegion,
	ForSlot,
	BlockKind,
	BlockRare,
} from '../runtime.js';

export const RENDER_VALID = 0;

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
	declare $$ctxDirect: Map<Context<any>, any> | null;
	// Epoch stamp for the two dep maps — see Block.$$ctxDepsEpoch. Number so the
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
		this.slots = [];
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
		this.slots = [];
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

// Sentinel cached in a consumer's resolved-provider slots to mean "no provider —
// use the context's default". Distinct from `undefined` (a cache miss) so a
// resolved default is an O(1) hit rather than a re-walk to the root every read.
export const DEFAULT_CTX: unique symbol = Symbol('octane.ctx.default');
