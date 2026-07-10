/**
 * octane runtime — template-clone renderer with React-shape state model.
 *
 * Architecture overview: see /README.md (project positioning + `.tsrx` syntax) and
 * the section headers throughout this file — the comments here are the design spec.
 *
 * Block = mount/unmount boundary (Root / control-flow / dynamic / portal).
 * Scope = per-call-site hook bag inside a Block.
 * Hooks key by compile-time Symbol per call site (conditional-safe).
 * State: React-shape immutable values + setters that schedule the enclosing Block.
 * Updates: microtask-flushed queue with automatic batching.
 * Effects: three-phase pipeline (insertion sync → layout sync → passive post-paint).
 * Reconciliation: LIS-based keyed list inside forBlock (ported from Ripple's patchKeyedChildrenComplex).
 */

import {
	SUSPENSE_SCRIPT_ATTR,
	STREAM_SEED_COMMENT,
	HYDRATION_START,
	HYDRATION_END,
	HYDRATION_TEXT_SEP,
	POSITIVE_NUMERIC_ATTR_PROPS,
	BOOLEAN_ATTR_PROPS,
	VALID_ATTR_NAME,
	isEnumeratedBooleanAttr,
	UNDEFINED_SENTINEL_KEY,
	cssStyleValue,
	ATTRIBUTE_ALIASES,
	SVG_ONLY_TAGS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentBody<P = any, E = any> = (props: P, scope: Scope, extra: E) => void;
type EffectFn = () => void | (() => void);
type Cleanup = () => void;

export interface Scope {
	block: Block;
	parent: Scope | null;
	/**
	 * Hook slot map. Lazily allocated on the first hook call via `ensureHooks`.
	 * For-of item bodies that never call a hook (the common case in
	 * js-framework-benchmark-shaped lists) keep this as `null` for their
	 * lifetime — saving the Map allocation per Block on mass-mount paths.
	 * Reads use optional chaining (`scope.hooks?.get(slot)`) which returns
	 * `undefined` when null, identical to a Map.get miss.
	 */
	hooks: Map<symbol, any> | null;
	cleanups: Cleanup[];
	/**
	 * Per-call-site child scopes, stored as `[key, scope]` pairs in a flat array
	 * (NOT a Map): iteration is a plain indexed for-loop, and lookups are linear
	 * scans — faster than `Map.get` for the typical N ≤ 8 case (most components
	 * have a handful of static sub-component calls at most).
	 */
	children: ChildScope[];
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
	 * Lazily minted on a consumer's first `use()`, so non-consumer blocks (the
	 * vast majority) carry just this one null field, not a per-context slot set.
	 */
	$$ctxCache: Map<Context<any>, any> | null;
	// Per-scope dense slot array. Holds, by COMPILE-TIME index, this scope's binding
	// bag (slot 0) and every control-flow / component / child slot state — plus the
	// runtime-internal slots (`__ret`, `__kids`, `_item`, `_children`, `_fb`). Indexing
	// (vs. the old `scope[`_for$N`]` dynamic string keys) keeps the Scope object shape
	// MONOMORPHIC: bindings no longer mutate the scope's hidden class per component.
	slots: any[];
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

interface ChildScope {
	// withScope uses Symbol per call-site; componentSlotLite uses its numeric slot
	// index (identity-equality is identical to symbols/strings for the linear-scan
	// lookup, and the key is only an identity tag — unmount walks `children` directly).
	key: symbol | string | number;
	scope: Scope;
}

/**
 * Lazy allocator for the per-scope hook map. Returns the existing Map or
 * creates one on first use. Hook write sites should call this; hook read
 * sites use `scope.hooks?.get(slot)` directly (undefined return matches a
 * Map-miss).
 */
function ensureHooks(scope: Scope): Map<symbol, any> {
	return scope.hooks ?? (scope.hooks = new Map());
}

/**
 * DEV ONLY: format the source location of a slot (`childSlot`/`componentSlot`/control-flow/
 * text-hole, keyed by its slot index) as `App.tsrx:42:5`, for hydration-mismatch warnings.
 * Returns `''` when no dev LOC table is present (prod, or a slot without a recorded
 * position) so callers degrade gracefully. The structured table (`scope.locs`) stays
 * available for a future DevTools element→source layer. Used by the P2/P3 mismatch paths.
 */
function siteLoc(scope: Scope, slotKey: number): string {
	const locs = scope.locs;
	if (locs === undefined) return '';
	const lc = locs[slotKey];
	if (lc === undefined) return '';
	return `${scope.locFile ?? '<unknown>'}:${lc[0]}:${lc[1]}`;
}

// ---------------------------------------------------------------------------
// Hydration VALUE-mismatch reporting (P2). When the server-rendered text/attribute
// at a dynamic site differs from the client's computed value, the runtime PATCHES the
// DOM to the client value (React-recoverable; runs in dev AND prod) and, in dev, warns
// with a source location. `suppressHydrationWarning` on the owning element (React's
// shallow semantics) suppresses BOTH: the warning is skipped and the SERVER value is
// kept (the documented escape hatch for intentional server/client differences).
// ---------------------------------------------------------------------------

/**
 * Has the owning element opted out of hydration-mismatch handling? The compiler stamps a
 * non-enumerable-ish `__oct_suppress` JS property (NOT a DOM attribute — it isn't
 * serialized) on elements written as `<el suppressHydrationWarning>`. Read in dev AND prod
 * because suppression changes the recovery (keep the server value), not just the warning.
 */
function isHydrationSuppressed(el: Node | null): boolean {
	return el !== null && (el as any).__oct_suppress === true;
}

/**
 * Shared preamble for the hydration VALUE-mismatch write sites (`setAttribute` /
 * `setClassName` / `setClassAttr` / `setStyle`): decides whether the site must pay the
 * server-value read + compare at all. Only two things ever require it: the element
 * opted out via `suppressHydrationWarning` (read in dev AND prod — suppression keeps
 * the SERVER value, changing the recovery, not just the warning), or a dev source loc
 * is stamped (`__oct_loc` exists only in dev-compiled output, so a non-suppressed prod
 * hydration pays nothing for the warning path). Returns the disposition:
 *   0 — plain apply: no compare needed, the client write itself patches/recovers.
 *   1 — suppressed: compare, and on divergence KEEP the server value (skip the write).
 *   2 — dev-warn: compare, warn on divergence, then apply the client value.
 */
function hydrationMismatchMode(el: Element): 0 | 1 | 2 {
	if (isHydrationSuppressed(el)) return 1;
	return (el as any).__oct_loc !== undefined ? 2 : 0;
}

/**
 * DEV-only hydration-mismatch warning. Gated on `loc` being non-empty — the dev source
 * location (`el.__oct_loc` / `siteLoc(...)`) only exists in `dev`-compiled output, so in
 * production `loc` is empty and this no-ops (the patch/recovery already ran regardless).
 */
function warnHydrationValueMismatch(
	loc: string | undefined,
	what: string,
	serverVal: unknown,
	clientVal: unknown,
): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (!loc) return;
	console.error(
		`Octane hydration mismatch at ${loc}: server rendered ${what} ` +
			`${JSON.stringify(serverVal)} but the client rendered ${JSON.stringify(clientVal)}. ` +
			`The client value was used. If this difference is intentional (e.g. a timestamp or ` +
			`random id), add suppressHydrationWarning to the element.`,
	);
}

/** DEV-only human-readable description of the server node at the cursor (for warnings). */
function describeHydrationNode(node: Node | null): string {
	if (node === null) return 'nothing';
	if (node.nodeType === 1) return `<${(node as Element).localName}>`;
	if (node.nodeType === 3) return `text ${JSON.stringify((node as Text).nodeValue)}`;
	if (node.nodeType === 8) {
		const d = (node as Comment).data;
		if (d === HYDRATION_START) return 'a control-flow block';
		if (d === HYDRATION_END) return 'the end of the parent block (fewer nodes than expected)';
		return 'a comment';
	}
	return 'a node';
}

/**
 * DEV-only STRUCTURAL hydration-mismatch warning (wrong tag / swapped branch / list shape /
 * component-vs-host). Callers pre-gate on `loc` truthiness so production pays no diagnostic
 * argument construction (describeHydrationNode etc.) — the internal `!loc` return stays as
 * defense-in-depth. The recovery at the call site runs in dev AND prod regardless.
 */
function warnHydrationStructuralMismatch(
	loc: string | undefined,
	expected: string,
	actual: string,
): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (!loc) return;
	console.error(
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
			`rendered ${actual}. The mismatched subtree was rebuilt on the client.`,
	);
}

/**
 * Does the adopted server node match the template's shape? Compares nodeType, element tag,
 * and the template's STATIC attributes (baked into the template by both client + server from
 * the same JSX, so a differing/absent one means a DIFFERENT branch — e.g. `@switch` cases all
 * `<span>` but with a different `class`). DYNAMIC attrs are NOT in the template, so they
 * aren't checked here — a value divergence on those is handled by `setAttribute` (P2).
 *
 * It then recurses into the NESTED STATIC element structure, catching same-root branches that
 * differ only in nested static markup (`<div><span/></div>` vs `<div><p/></div>`). The recursion
 * BAILS (treats as a match) the moment a comment (a `<!>` hole placeholder / `<!--[-->` marker)
 * or a text↔element shift appears: template holes don't align 1:1 with server content (a text
 * hole is 0-or-1 node; a control-flow hole is a marker range), so anything hole-bearing can't
 * be compared positionally and is left to the per-site recovery. This makes the check safe
 * (never false-flags a hole-bearing template) while still catching pure-static divergences.
 */
function hydrationNodeMatches(server: Node, template: Node): boolean {
	if (server.nodeType !== template.nodeType) return false;
	if (server.nodeType !== 1) return true;
	const s = server as Element;
	const t = template as Element;
	if (s.localName !== t.localName) return false;
	const tAttrs = t.attributes;
	for (let i = 0; i < tAttrs.length; i++) {
		const a = tAttrs[i];
		if (s.getAttribute(a.name) !== a.value) return false;
	}
	let sc = s.firstChild;
	let tc = t.firstChild;
	while (sc !== null && tc !== null) {
		if (sc.nodeType === 8 || tc.nodeType === 8) return true; // hole / marker — stop comparing
		if (sc.nodeType !== tc.nodeType) return true; // text↔element shift — ambiguous, stop
		if (tc.nodeType === 1 && !hydrationNodeMatches(sc, tc)) return false;
		sc = sc.nextSibling;
		tc = tc.nextSibling;
	}
	return true; // any leftover could be holes — assume a match
}

/** Remove the server nodes from `start` to `end` (inclusive). Used to discard a divergent range. */
function removeHydrationRange(start: Node, end: Node): void {
	let n: Node | null = start;
	while (n !== null) {
		const next: Node | null = n === end ? null : n.nextSibling;
		(n as ChildNode).remove();
		n = next;
	}
}

type BlockKind = 'root' | 'control-flow' | 'dynamic' | 'portal';

export interface Block extends Scope {
	kind: BlockKind;
	parentBlock: Block | null;
	parentNode: Node;
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
	/**
	 * True when this block OR any ancestor is a `memo()` block. Monotone up the
	 * parentBlock chain (computed once at creation), so `useContextInternal` can
	 * skip its memo-ancestor stamping walk entirely on the common no-memo tree —
	 * the walk only ever stamps memo blocks, so if there are none above us it is
	 * pure overhead (~ancestor-depth iterations per `use()` call).
	 */
	memoInChain: boolean;
	pending: boolean;
	disposed: boolean;
	/**
	 * The single pure-host DOM node this Block manages on the de-opt path, REUSED
	 * across re-renders so DOM-resident state survives (no rebuild). Set by
	 * `deoptItemBody` (a `.map()` item that is a host element) and by `hostElementBody`
	 * (the host-element-with-component-children renderer). Null for every other Block.
	 */
	deoptNode: Node | null;
	/** Set on item Blocks: pointer to the enclosing for-block's slot. */
	forSlot: ForSlot | null;
	/** Item position within the enclosing for-block. 0 for non-item blocks. */
	itemIndex: number;
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
	$$ctxDirect: Map<Context<any>, any> | null;
	/**
	 * Armed for React's IMPLICIT same-element bailout (beginWork's
	 * oldProps === newProps skip). Set at value-position component mounts
	 * (childSlot); makes the block a context-stamping target like `__memo` so
	 * the bail's lazy consumer refresh is sound.
	 */
	$$implicitBail: boolean;
	/** Per-render `use(thenable)` call-order counter; reset at the top of renderBlock. */
	__thenableIdx: number;
	/**
	 * Render-loop guard: the drainQueue pass this block last rendered in, and how
	 * many times it rendered within that pass. A block that keeps re-queueing
	 * itself from its own render body (an unguarded render-phase setState) is a
	 * non-converging loop — drainQueue throws after RENDER_PHASE_UPDATE_LIMIT,
	 * mirroring React's "Too many re-renders".
	 */
	drainStamp: number;
	drainRenders: number;
}

interface EffectSlot {
	deps: any[] | undefined;
	cleanup: Cleanup | undefined;
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
	/**
	 * True once a per-slot finalizer has been registered in scope.cleanups (on the
	 * slot's first body run, in drainPhase). The finalizer fires slot.cleanup
	 * exactly once at unmount; registering on first RUN (not slot creation) keeps
	 * scope.cleanups ordered by phase-execution order (insertion→layout→passive)
	 * so unmount tears down in the correct reverse order.
	 */
	finalized?: boolean;
}

interface PendingEffect {
	scope: Scope;
	slot: symbol;
	fn: EffectFn;
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
	 * Monotonic enqueue sequence (DFS pre-order, since rendering is top-down). Used
	 * by drainPhase to reconstruct React's exact commit order: TRUE post-order —
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

// ---------------------------------------------------------------------------
// Current-scope/block stacks
// ---------------------------------------------------------------------------

let CURRENT_SCOPE: Scope | null = null;
let CURRENT_BLOCK: Block | null = null;

// ---------------------------------------------------------------------------
// Scheduler — microtask-flushed queue with React-18-shaped automatic batching
// ---------------------------------------------------------------------------

const QUEUE: Block[] = [];
let scheduled = false;
let syncFlush = false; // flushSync sets this to drain the queue synchronously
// True while a flush (drainQueue/commitEffects) is on the stack. A flushSync
// that lands during it — most commonly maybeFlushDiscrete for a DISCRETE event
// the browser dispatches SYNCHRONOUSLY inside a commit-phase DOM mutation
// (Chrome fires `blur`/`focusout` from removeChild when the focused element's
// subtree is torn down) — must NOT drain re-entrantly: the outer removal walk
// holds cached sibling pointers, and a nested commit mutating the same range
// corrupts it (removeChild: "not a child"). React's rule ("flushSync was called
// from inside a lifecycle method… cannot flush when already rendering"): run
// the callback, let the ambient flush pick up whatever it scheduled.
let inFlush = false;

// ---------------------------------------------------------------------------
// Transitions — React 18 priority lanes, simplified to two levels.
// ---------------------------------------------------------------------------

/** Depth of nested startTransition() calls currently on the call stack. */
let TRANSITION_DEPTH = 0;
/**
 * Number of async transition actions whose returned promise has not yet settled.
 * `TRANSITION_DEPTH` only covers the SYNCHRONOUS slice of a `startTransition`
 * callback; for an `async` action it is already 0 by the time the continuation
 * after the first `await` runs, so post-await setters would otherwise schedule
 * at urgent priority. Keeping this count elevated across the in-flight window
 * makes those setters transition-priority (React 19 Actions). Caveat: it's a
 * process-global window, so an unrelated urgent update fired while an async
 * action is pending is also tagged transition — perfect per-action scoping
 * would need AsyncContext, which isn't available in the browser target.
 */
let ASYNC_TRANSITION_COUNT = 0;
/**
 * True only while useDeferredValue's spawned swap dispatches its re-render
 * (the microtask's startTransition(scheduleRender) call — see
 * spawnDeferredSwap). scheduleRender copies it onto the scheduled block as
 * `pendingDeferred`: the "deferred lane" bit that lets a useDeferredValue
 * mounting inside that pass skip its own preview state (React's
 * anti-waterfall — only the first level defers).
 */
let DEFERRED_SPAWN = false;
/**
 * Outstanding transition WORK count — incremented when startTransition fires,
 * decremented when its renders commit (and again for any tryBlock that holds
 * the transition pending while suspended). useTransition's isPending tracks
 * this via TRANSITION_LISTENERS.
 */
let TRANSITION_PENDING_COUNT = 0;
const TRANSITION_LISTENERS = new Set<() => void>();

// ── Global commit coordination (entangled transitions) ──────────────────────
// React commits a transition's whole tree atomically: when one startTransition
// fans out to several Suspense boundaries that all suspend, the prior content of
// EVERY boundary stays on screen until ALL their data is ready, then they reveal
// together — the user never sees a half-updated screen mid-transition. octane
// commits per-boundary, so without coordination boundary A would reveal the moment
// its own promise resolves while sibling B is still pending.
//
// `HELD_TRANSITIONS` is the set of boundaries currently holding prior content for an
// in-flight transition (transitionHeld === true). `STAGED_REVEALS` is the subset
// whose data has resolved but whose reveal is DEFERRED waiting for the rest. When
// `STAGED_REVEALS.size === HELD_TRANSITIONS.size` every held boundary is data-ready,
// so we flush them all in one batch (`flushStagedReveals`). Abandoning a held
// boundary (urgent supersede / error / unmount) removes it and re-checks, so the
// remaining group isn't stranded waiting on a boundary that will never resolve.
const HELD_TRANSITIONS = new Set<TrySlot>();
const STAGED_REVEALS = new Set<TrySlot>();
let flushingStagedReveals = false;

function tickTransitionCount(delta: number): void {
	TRANSITION_PENDING_COUNT += delta;
	if (TRANSITION_PENDING_COUNT < 0) TRANSITION_PENDING_COUNT = 0;
	for (const fn of TRANSITION_LISTENERS) {
		try {
			fn();
		} catch (err) {
			console.error(err);
		}
	}
}

const INSERTION = 0,
	LAYOUT = 1,
	PASSIVE = 2;
type Phase = 0 | 1 | 2;

const effectQueues: [PendingEffect[], PendingEffect[], PendingEffect[]] = [[], [], []];
let passiveScheduled = false;
// Monotonic enqueue counter — tags each PendingEffect AND deferred ref attach with its
// DFS pre-order position so the commit drains them in React's post-order (see
// PendingEffect.seq / comparePostOrder). Shared so refs and effects sequence consistently.
let commitSeq = 0;

// ─────────────────────────────────────────────────────────────────────────────
// useSyncExternalStore commit-sync queue (React's `updateStoreInstance` shape).
//
// A uSES consumer must, at COMMIT, reconcile the snapshot it read during render
// against the store as it stands at commit time — a store that mutated in the
// render→commit window would otherwise leave the committed DOM torn. React does
// this by pushing the fiber onto a per-root store-consistency list drained after
// the layout effects (updateStoreInstance); we mirror it with a dedicated,
// SORT-FREE queue instead of routing each consumer through the generic layout
// effect (enqueueEffect → depsChanged → PendingEffect alloc → drainPhase's
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
interface StoreInst<T> {
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
	/** Force a re-render of the owning block (same path as a useState setter). */
	forceUpdate: () => void;
	/** Stable notify handler handed to subscribe(); re-renders iff the snapshot
	 *  changed (Object.is dedup). Stable across re-subscribes by design. */
	onStoreChange: () => void;
	/** Owning block — drainStoreSyncs skips disposed/hidden blocks like drainPhase. */
	block: Block;
	/** True while this inst sits in the sync queue — prevents a second push when a
	 *  block renders twice before its single commit (last render's `pending` wins). */
	queued: boolean;
}

// Pending store-syncs to reconcile at the next commit (drained in commitEffects
// after drainPhase(LAYOUT)). Populated at RENDER time, so — like effects — pushes
// during an off-screen (WIP) render are redirected into WIP_CAPTURE.stores and
// spliced back only if that render commits (see renderOffscreen/commitOffscreen).
const storeSyncQueue: StoreInst<any>[] = [];

// Deferred ref attaches (React-19 timing parity). On mount the whole subtree is
// built and inserted before its DOM is connected to the document, so attaching a
// ref inline would hand a callback ref / measure a node that is NOT yet
// connected. Instead the compiler enqueues mount ref attaches here; they drain
// during commit, AFTER all renders/DOM insertion and BEFORE layout effects, so
// callback refs see a connected node and ref.current is populated by the time a
// layout effect runs — matching React's commit-phase ref attachment.
interface RefAttach {
	fn: () => void;
	/** Enqueue sequence (DFS pre-order) — see commitSeq / comparePostOrder. */
	seq: number;
	block: Block | null;
}
const refAttachQueue: RefAttach[] = [];

// Off-screen (WIP) effect capture. While a transition swaps in a NEW subtree that
// may suspend, that subtree is rendered "off-screen" (its DOM kept out of the slot's
// committed range until it completes — see renderOffscreen). Its effects and ref
// attaches must NOT fire at the normal commit: the nodes aren't committed yet, and if
// the WIP suspends they belong to content that never lands. While `WIP_CAPTURE` is set,
// enqueueEffect/queueRefAttach redirect into it instead of the live queues; on commit
// the captured entries are spliced back so the normal pipeline drains them (child-first,
// after the new nodes are connected). The off-screen render is synchronous and
// single-threaded, so every effect enqueued while the buffer is set belongs to the WIP.
interface OffscreenCapture {
	effects: [PendingEffect[], PendingEffect[], PendingEffect[]];
	refs: RefAttach[];
	// uSES store-syncs enqueued during this off-screen render (see storeSyncQueue).
	// Spliced into the live queue on commit, dropped on dispose — a WIP that never
	// lands must not mutate a committed inst (its inst is fresh anyway, per the
	// fresh-block render, so dropping is both correct and cheap).
	stores: StoreInst<any>[];
}
let WIP_CAPTURE: OffscreenCapture | null = null;

// A subtree rendered off-screen by `renderOffscreen` (its DOM sits between owned
// `start`/`end` markers, outside the committed slot range, with its effects captured).
interface OffscreenWip {
	block: Block;
	start: Comment;
	end: Comment;
	capture: OffscreenCapture;
	domParent: Node;
}

// FragmentInstances that currently hold event listeners and/or observers. After
// each commit we re-apply their stored bindings to their CURRENT children, so a
// child that mounts into a fragment later picks up the listeners/observers added
// earlier — React's `commitNewChildToFragmentInstance` future-children contract.
// Empty for any app that doesn't use fragment-ref listeners (the common case),
// so the per-commit cost is a single `size` check.
const activeFragments = new Set<FragmentInstance>();

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
let actScopeDepth = 0;

/**
 * Test-environment opt-in. When true, scheduleRender() calls that happen
 * outside a flushSync or an act() callback emit a console.error mirroring
 * React's "An update to X was not wrapped in act(...)" message. Default
 * false so production / non-test code never warns.
 */
export function setIsOctaneActEnvironment(value: boolean): void {
	IS_OCTANE_ACT_ENVIRONMENT = value;
}

function scheduleRender(block: Block): void {
	if (block.disposed) return;
	// Test-env warning: a state update happened with no flushSync or act()
	// scope around it. The test will likely assert on stale DOM and fail
	// confusingly; surface the cause directly.
	if (
		process.env.NODE_ENV !== 'production' &&
		IS_OCTANE_ACT_ENVIRONMENT &&
		actScopeDepth === 0 &&
		!syncFlush
	) {
		// eslint-disable-next-line no-console
		console.error(
			'An update to a component was not wrapped in act(...).\n\n' +
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
	const mode: 'urgent' | 'transition' =
		TRANSITION_DEPTH > 0 ||
		ASYNC_TRANSITION_COUNT > 0 ||
		(renderPhaseSelf && block.currentRenderMode === 'transition')
			? 'transition'
			: 'urgent';
	const deferred = DEFERRED_SPAWN || (renderPhaseSelf && block.currentRenderDeferred);
	if (block.pending) {
		if (mode === 'urgent') {
			block.pendingMode = 'urgent';
			block.pendingDeferred = false;
		}
		return;
	}
	block.pending = true;
	block.pendingMode = mode;
	block.pendingDeferred = deferred;
	QUEUE.push(block);
	if (syncFlush) return;
	if (!scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
}

// Monotonic id per drainQueue pass, paired with Block.drainStamp/drainRenders
// for the render-phase-update loop guard. 25 matches React's cap.
let DRAIN_ID = 0;
const RENDER_PHASE_UPDATE_LIMIT = 25;

// Block-tree depth (root = 0), by walking the parentBlock chain. Used to drain
// the render queue ancestors-first so cascade coalescing is order-independent.
function blockDepth(b: Block): number {
	let d = 0;
	for (let p = b.parentBlock; p !== null; p = p.parentBlock) d++;
	return d;
}

// Sort a render wave shallow-first (ancestors before descendants). If A is an
// ancestor of B then depth(A) < depth(B), so A renders first and its cascade can
// clear B's `pending` (skipping B's redundant standalone render) regardless of
// the order their setStates were queued. Depths are precomputed so the comparator
// doesn't re-walk the chain on every compare.
function sortWaveByDepth(wave: Block[]): Block[] {
	const depth = new Map<Block, number>();
	for (let i = 0; i < wave.length; i++) depth.set(wave[i], blockDepth(wave[i]));
	wave.sort((a, b) => depth.get(a)! - depth.get(b)!);
	return wave;
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
	const drainId = ++DRAIN_ID;
	if (QUEUE.length > 1) sortWaveByDepth(QUEUE);
	// Iterate by index. A render may enqueue MORE work (e.g. a setState during
	// render) — it appends to QUEUE, and `i < QUEUE.length` is re-evaluated every
	// step, so those are drained in this same pass. The loop only exits once i has
	// reached the (possibly grown) end, so the truncation below clears only
	// fully-processed blocks. Re-entrant additions render in append order rather
	// than re-sorted, which at worst costs a redundant render in a rare case.
	for (let i = 0; i < QUEUE.length; i++) {
		const block = QUEUE[i];
		// Skip if an ancestor's cascade already re-rendered this block this flush
		// (renderBlock cleared its `pending`) — avoids a redundant standalone render.
		if (!block.pending) continue;
		block.pending = false;
		if (block.disposed) continue;
		try {
			// An update to a block inside a SUSPENSE-HIDDEN subtree (its boundary's
			// try content is soft-detached into savedDom while the fallback shows):
			// don't render it in place — its geometry is detached, and a fresh mount
			// inside it would insert against dismembered parents. Instead re-attempt
			// the WHOLE boundary. React parity: setState on a suspended component
			// retries the render; if it no longer suspends (an external store flipped
			// before the suspending promise resolved), the boundary reveals now.
			const hiddenTry = findSuspenseHiddenTry(block);
			if (hiddenTry !== null) {
				attemptHiddenReveal(hiddenTry);
				continue;
			}
			// Guarded render-phase updates (derived state) converge in a couple of
			// passes; an unguarded one re-queues its own block forever. Cap per-block
			// renders within one drain so the loop throws (catchable by @try /
			// ErrorBoundary, like React's equivalent) instead of hanging.
			if (block.drainStamp === drainId) {
				if (++block.drainRenders > RENDER_PHASE_UPDATE_LIMIT) {
					throw new Error(
						'Too many re-renders. Octane limits the number of renders to prevent an infinite loop.',
					);
				}
			} else {
				block.drainStamp = drainId;
				block.drainRenders = 1;
			}
			renderBlock(block);
		} catch (err) {
			try {
				handleRenderError(block, err);
			} catch (unhandled) {
				// No tryBlock claimed this error. Don't let it abandon the rest of
				// the queue or skip commit — that would strand unrelated roots
				// batched into the same flush and drop their already-rendered
				// effects. Collect them all; a multi-root flush with several
				// unhandled errors surfaces an AggregateError (React parity), a
				// single one rethrows as-is.
				if (pendingError === null) pendingError = { err: unhandled, all: [unhandled] };
				else {
					pendingError.all.push(unhandled);
					pendingError.err =
						typeof AggregateError === 'function'
							? new AggregateError(
									pendingError.all,
									'Multiple errors were thrown during the render flush.',
								)
							: pendingError.all[0];
				}
				// React 19 contract: an error no boundary handles unmounts the
				// ENTIRE tree of the failed root — known-broken UI never stays on
				// screen (ReactIncrementalErrorHandling:1338/:712). Only the
				// offending root is torn down; unrelated roots keep draining.
				let root: Block = block;
				while (root.parentBlock !== null) root = root.parentBlock;
				if (root.kind === 'root' && !root.disposed) unmountBlock(root);
			}
		}
	}
	QUEUE.length = 0;
	return pendingError;
}

function flush(): void {
	scheduled = false;
	// Re-entrancy backstop (see `inFlush`): a flush landing inside an active
	// flush re-arms the scheduler instead of draining over the outer walk.
	if (inFlush) {
		if (QUEUE.length > 0 && !scheduled) {
			scheduled = true;
			queueMicrotask(flush);
		}
		return;
	}
	inFlush = true;
	try {
		// React parity: pending PASSIVE effects from an earlier commit flush BEFORE the next
		// render begins (React's flushPassiveEffects-at-render-start). Without this, a
		// cascade that mounts new children (e.g. a layout-effect-driven Presence reveal)
		// merges the earlier commit's passive effects (e.g. an event dispatch) into the same
		// drain as the new children's listener-attach effects — re-ordering them child-first
		// and letting a child observe an event announcing its own mount.
		if (QUEUE.length > 0) drainPassivesBeforeRender();
		const pendingError = drainQueue();
		commitEffects();
		if (pendingError !== null) throw pendingError.err;
	} finally {
		inFlush = false;
	}
}

/** Drain pending passive effects ahead of a render pass (see flush()). */
function drainPassivesBeforeRender(): void {
	if (effectQueues[PASSIVE].length > 0) drainPassiveEffects();
}

/**
 * React-DOM parity. Runs `fn` and synchronously drains any renders/effects it scheduled
 * before returning. Bypasses the microtask-batched flush — used by the benchmark
 * timing rig to measure operation wall-clock without microtask coalescing. Also the
 * discrete-event commit path: maybeFlushDiscrete flushes through here so
 * click/keydown/input handlers commit before the browser regains control.
 */
export function flushSync<T>(fn: () => T): T {
	// Already inside a flush — a DISCRETE event the browser dispatched
	// synchronously from a commit-phase DOM mutation (maybeFlushDiscrete), or a
	// user flushSync inside a lifecycle. React cannot flush while already
	// rendering: run the callback and let the AMBIENT flush drain whatever it
	// schedules — drainQueue picks up mid-pass appends, and the microtask
	// scheduler backstops work queued after the render pass (see `inFlush`).
	if (inFlush) return fn();
	const prevSync = syncFlush;
	syncFlush = true;
	try {
		const result = fn();
		// `inFlush` guards only the DRAIN below, not fn(): a nested flushSync
		// inside fn still flushes inline (React isn't "rendering" during the
		// callback), while one landing inside the drain defers (guard above).
		inFlush = true;
		let pendingError: { err: any } | null = null;
		try {
			// Drain anything scheduled by fn (same depth-sorted, coalescing drain as flush()).
			// Match React semantics: flushSync drains insertion + layout synchronously, but
			// passive effects (useEffect) still fire AFTER paint via the regular scheduler —
			// exactly what commitEffects already does.
			if (QUEUE.length > 0) drainPassivesBeforeRender();
			pendingError = drainQueue();
			commitEffects();
			// A sync-committed effect (a LAYOUT effect calling setState) can schedule MORE
			// renders. While `syncFlush` is set, scheduleRender pushes to QUEUE without arming a
			// microtask. React's flushSync drains such layout-effect cascades SYNCHRONOUSLY —
			// needed so derived layout state (e.g. a presence/exit-animation gate) is committed
			// before flushSync returns. But octane also deliberately FORGIVES non-convergent
			// cascades (an unstable `useSyncExternalStore` getSnapshot re-scheduling its component
			// from every layout pass — React throws "maximum update depth"/"getSnapshot should be
			// cached"; octane must neither hang nor burst-render). Discriminate by CONVERGENCE:
			// keep draining while each pass schedules only blocks not yet seen in this flushSync
			// (a finite cascade propagating through the tree — it exhausts quickly since
			// Object.is-equal setStates bail); the moment a block re-schedules ITSELF a second
			// time, the cascade is non-convergent — stop and hand the remainder to the async
			// scheduler, which advances it lazily (one render per microtask), exactly the
			// pre-existing behavior divergent stores rely on. LAYOUT_CASCADE_LIMIT backstops
			// pathological wide-but-finite chains.
			if (QUEUE.length > 0) {
				const seen = new Set<Block>(QUEUE);
				let defer = false;
				for (let guard = 0; QUEUE.length > 0 && !defer && guard < LAYOUT_CASCADE_LIMIT; guard++) {
					// Each convergence iteration is a new render pass — flush pending passives
					// first (React's rule; see flush()).
					drainPassivesBeforeRender();
					const err = drainQueue();
					if (err !== null && pendingError === null) pendingError = err;
					commitEffects();
					for (let i = 0; i < QUEUE.length; i++) {
						const b = QUEUE[i];
						if (seen.has(b)) {
							defer = true;
							break;
						}
						seen.add(b);
					}
				}
			}
		} finally {
			inFlush = false;
		}
		if (QUEUE.length > 0 && !scheduled) {
			scheduled = true;
			queueMicrotask(flush);
		}
		if (pendingError !== null) throw pendingError.err;
		return result;
	} finally {
		syncFlush = prevSync;
	}
}

// Backstop bound on synchronous render→layout-effect→render passes inside flushSync (the
// convergence check above is the primary brake; this catches wide-but-finite chains).
const LAYOUT_CASCADE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Effect commit pipeline (insertion → layout → passive)
// ---------------------------------------------------------------------------

/**
 * Compiler-emitted on a host element's ref MOUNT. Defers the attach until commit
 * (drainRefAttaches) so the node is connected when a callback ref fires and
 * ref.current is set before layout effects run. Each entry records its owning
 * `block` plus an enqueue-order `seq`; drainRefAttaches sorts with
 * comparePostOrder (post-order via the parentBlock chain, seq as tiebreak) for
 * child-before-parent ordering, matching effect ordering. Ref identity UPDATES
 * queue here too (paired with a queueRefDetach of the old ref), so within one
 * commit every detach drains before every attach — a ref hopping between
 * elements never ends null, whichever binding updates first.
 */
export function queueRefAttach(scope: Scope, fn: () => void): void {
	(WIP_CAPTURE !== null ? WIP_CAPTURE.refs : refAttachQueue).push({
		fn,
		seq: commitSeq++,
		block: scope.block,
	});
}

/**
 * Deferred de-opt host ref DETACHES, queued by detachDeoptTreeRefs during teardown
 * (item removal, list clear, wholesale unmount, mode-switch rebuild) and drained at
 * commit BEFORE the mount attaches — React's mutation-before-layout phasing. Flat
 * [ref, el, ref, el, …] pairs: `el` is the node the ref was attached to, so a
 * callback ref shared across elements releases the RIGHT per-element cleanup.
 * Deliberately NOT the attach queue: attaches skip disposed subtrees
 * (blockSubtreeDisposed), while a teardown detach must fire precisely BECAUSE its
 * subtree is disposed.
 */
const refDetachQueue: any[] = [];

/**
 * Queue a teardown ref detach for commit (compiled `ref` binding / spread-ref /
 * hostComponent / fragment-ref unmount cleanups, and the de-opt teardown walk).
 * Unmount cleanups run mid-render (unmountScope), and a ref can be a setState
 * function whose value feeds back into what an owner renders — firing `ref(null)`
 * synchronously lets that null-update render before the replacement element's
 * deferred attach, oscillating forever when the teardown was a rebuild. Deferring
 * to commit puts the null and the new element in the SAME batch (React's
 * mutation→layout phasing). `el` is the element the ref was attached to, so a
 * callback ref shared across elements releases ITS element's React-19 cleanup.
 */
export function queueRefDetach(ref: any, el: Element | FragmentInstance | null): void {
	if (ref == null || SUPPRESS_UNCOMMITTED_REF_DETACH) return;
	// Capture the active teardown boundary (if we're inside an unmount walk) so a
	// throwing detach at drain time routes there — React's safelyDetachRef →
	// captureCommitPhaseError (ReactErrorBoundaries:2782).
	refDetachQueue.push(ref, el, TEARDOWN_HANDLER);
}

// See unmountScope — true while running the cleanups of a block whose deferred
// ref attaches never committed (aborted mount).
let SUPPRESS_UNCOMMITTED_REF_DETACH = false;

function drainRefDetaches(): void {
	if (refDetachQueue.length === 0) return;
	const q = refDetachQueue.splice(0);
	for (let i = 0; i < q.length; i += 3) {
		try {
			attachRef(q[i], null, q[i + 1]);
		} catch (err) {
			// A throwing ref detach must not abort the commit (the remaining detaches
			// + attaches still run) — route to the deletion's boundary like React.
			const handler = q[i + 2] as ((e: any) => void) | null;
			if (handler !== null) handler(err);
			else console.error(err);
		}
	}
}

/** Drain queued mount ref attaches in React's post-order (descendant-before-ancestor). */
function drainRefAttaches(): void {
	if (refAttachQueue.length === 0) return;
	const q = refAttachQueue.splice(0);
	// Post-order, same as effects (refs attach child-first, siblings in tree order).
	q.sort((a, b) => comparePostOrder(a.block, a.seq, b.block, b.seq));
	for (const r of q) {
		// Skip attaches whose owning subtree was unmounted earlier in THIS flush
		// (e.g. a try boundary caught a mount-time throw and ran unmountBlock +
		// the ref-detach cleanup). Without this guard the deferred attach would
		// re-run on a torn-down node — firing a callback ref on a dead element and
		// resurrecting an object ref the cleanup just nulled.
		if (blockSubtreeDisposed(r.block)) continue;
		r.fn();
	}
}

/** True if `block` or any of its ancestors has been disposed (unmounted). */
function blockSubtreeDisposed(block: Block | null): boolean {
	let b: Block | null = block;
	while (b !== null) {
		if (b.disposed) return true;
		b = b.parentBlock;
	}
	return false;
}

function commitEffects(): void {
	// Controlled-form commit work FIRST: select projections must see the
	// options this render just built, and the dev missing-onInput check must
	// see the element's full listener set (see drainControlledSyncs).
	drainControlledSyncs();
	drainPhase(INSERTION);
	// Teardown ref detaches fire before this commit's attaches (mutation → layout),
	// so a ref moving between elements cycles null → new-node in one commit.
	drainRefDetaches();
	drainRefAttaches();
	reapplyFragmentBindings();
	drainPhase(LAYOUT);
	// After layout effects (so a sibling layout effect that mutates+notifies the
	// store has already run), reconcile each uSES consumer's committed snapshot
	// against the store and re-render any that tore. Mirrors React draining its
	// store-consistency checks right after commitLayoutEffects.
	drainStoreSyncs();
	if (effectQueues[PASSIVE].length && !passiveScheduled) {
		passiveScheduled = true;
		schedulePostPaint(() => {
			passiveScheduled = false;
			drainPhase(PASSIVE);
		});
	}
}

/**
 * Test/test-environment helper — synchronously drain any queued passive
 * (`useEffect`) bodies that would normally fire after paint. Idempotent.
 * Real apps should not call this; rely on the normal post-paint scheduler.
 */
export function drainPassiveEffects(): void {
	// Cancel any scheduler-side passive drain that hadn't fired yet — we're
	// about to drain inline.
	passiveScheduled = false;
	drainPhase(PASSIVE);
}

/**
 * True if there's a queued render or any uncommitted effect. Used by `act`,
 * and exported (tier 2, binding infrastructure) so @octanejs/testing-library's
 * synchronous settle can loop to EXACT quiescence instead of a fixed bound.
 * Purely promise-driven work (use(promise), async transitions) is not "pending"
 * by this definition — it needs `waitFor`/async `act`.
 */
export function hasPendingWork(): boolean {
	return (
		QUEUE.length > 0 ||
		effectQueues[INSERTION].length > 0 ||
		effectQueues[LAYOUT].length > 0 ||
		effectQueues[PASSIVE].length > 0 ||
		storeSyncQueue.length > 0 ||
		hasControlledSyncs()
	);
}

/**
 * React-parity `act(...)`. Wrap test code that triggers updates so all of
 * the scheduled work commits before the assertion phase runs.
 *
 * TWO modes, matching React exactly:
 *  - SYNC callback → all scheduled work (renders + INSERTION/LAYOUT/PASSIVE
 *    effects) is flushed SYNCHRONOUSLY before act returns, so
 *    `act(() => setState(...)); expect(...)` works WITHOUT awaiting — the
 *    dominant pattern in ported React test suites. The returned (already
 *    resolved) promise still carries the callback's result; a callback throw
 *    REJECTS the promise rather than throwing synchronously (React's act is
 *    a thenable with the same contract).
 *  - ASYNC callback (returns a thenable) → awaited, then the scheduler is
 *    drained across microtask ticks until quiescent (renders, effects, and
 *    microtask chains from `use(promise)` / transition retries).
 *
 * While the act() scope is active, scheduleRender's "update outside act(...)"
 * dev warning is suppressed (see `IS_OCTANE_ACT_ENVIRONMENT` and
 * `setIsOctaneActEnvironment`).
 *
 * The async double-loop (5 microtask ticks × up to 50 outer iterations)
 * drains cascades like `use(promise)` → status flip → retry → renderBlock
 * that wouldn't settle in a single tick.
 */
export function act<T>(fn: () => T | Promise<T>): Promise<T> {
	actScopeDepth++;
	let result: T | Promise<T>;
	try {
		result = fn();
	} catch (err) {
		actScopeDepth--;
		return Promise.reject(err);
	}
	if (result !== null && typeof result === 'object' && typeof (result as any).then === 'function') {
		return (async () => {
			try {
				const value = await (result as Promise<T>);
				for (let i = 0; i < 50; i++) {
					for (let j = 0; j < 5; j++) await Promise.resolve();
					drainPassiveEffects();
					if (!hasPendingWork()) return value;
				}
				throw new Error(
					'act(): scheduler did not stabilize after 50 iterations — likely an infinite render loop',
				);
			} finally {
				actScopeDepth--;
			}
		})();
	}
	// Sync callback: flush synchronously BEFORE returning (flushSync drains the
	// render queue + commit-phase effects; drainPassiveEffects the post-paint
	// queue) so assertions immediately after a non-awaited act() observe
	// committed state — React's sync-act contract. Work driven by MICROTASKS
	// the callback queued (an in-flight thenable from `use(promise)`, an
	// awaited async validation) can't be reached synchronously; the returned
	// promise continues the async drain for callers that DO await.
	for (let i = 0; i < 50; i++) {
		flushSync(() => {});
		drainPassiveEffects();
		if (!hasPendingWork()) break;
		if (i === 49) {
			actScopeDepth--;
			return Promise.reject(
				new Error(
					'act(): scheduler did not stabilize after 50 iterations — likely an infinite render loop',
				),
			);
		}
	}
	return (async () => {
		try {
			for (let i = 0; i < 50; i++) {
				for (let j = 0; j < 5; j++) await Promise.resolve();
				drainPassiveEffects();
				if (!hasPendingWork()) return result as T;
			}
			throw new Error(
				'act(): scheduler did not stabilize after 50 iterations — likely an infinite render loop',
			);
		} finally {
			actScopeDepth--;
		}
	})();
}

/** True if `anc` is a STRICT ancestor of `node` in the Block tree. */
function blockIsAncestorOf(anc: Block, node: Block): boolean {
	for (let b: Block | null = node.parentBlock; b !== null; b = b.parentBlock) {
		if (b === anc) return true;
	}
	return false;
}

// React's commit order is a post-order tree walk: a node's descendants fire before it,
// and disjoint subtrees fire in tree order. We reconstruct that from the flat queues:
// descendant-before-ancestor via the parentBlock chain; everything else (disjoint
// subtrees, and multiple entries on the SAME block) falls back to enqueue order, which
// IS tree order because rendering is top-down DFS pre-order. This is correct where a
// plain depth sort was not — a shallow node in an earlier sibling subtree must fire
// before a deeper node in a LATER sibling subtree, which depth alone gets backwards.
// Shared by the effect queues AND the deferred ref-attach queue so both commit in order.
function comparePostOrder(
	aBlock: Block | null,
	aSeq: number,
	bBlock: Block | null,
	bSeq: number,
): number {
	if (aBlock !== bBlock && aBlock !== null && bBlock !== null) {
		if (blockIsAncestorOf(aBlock, bBlock)) return 1; // a is ancestor of b → a fires AFTER b
		if (blockIsAncestorOf(bBlock, aBlock)) return -1; // b is ancestor of a → a fires BEFORE b
	}
	return aSeq - bSeq;
}
function compareEffectPostOrder(a: PendingEffect, b: PendingEffect): number {
	return comparePostOrder(a.scope.block, a.seq, b.scope.block, b.seq);
}

function drainPhase(phase: Phase): void {
	const pending = effectQueues[phase];
	if (pending.length === 0) return;
	// Take ownership of the current batch UP-FRONT (React's flushPassiveEffects nulls
	// rootWithPendingPassiveEffects before running any effect): an effect body may
	// synchronously dispatch a DISCRETE event (e.g. Radix's form bubble inputs
	// dispatching `click`) whose handler flushes and re-enters drainPhase. A live-array
	// walk would let that re-entrant call re-run entries the outer walk already
	// executed — double-firing effects, unboundedly when the effect re-dispatches.
	// With a snapshot, the re-entrant call sees only effects enqueued DURING this
	// drain (nested-update work, which it runs like React's nested passive flush);
	// anything enqueued later re-arms via the normal commit scheduling.
	const q = pending.splice(0);
	// React parity: fire in post-order (child-before-parent, siblings in tree order).
	// Stable sort preserves enqueue order for entries the comparator treats as equal.
	q.sort(compareEffectPostOrder);
	// Cleanups first (in registration order), then bodies. React's contract.
	// Skip entries whose subtree was hidden by <Activity> after they were queued
	// but before this drain: deactivateScope already fired their cleanups, and the
	// body must not run while hidden (it re-enqueues on reveal). See
	// inInactiveSubtree. INSERTION entries are exempt — they stay connected and
	// keep firing while hidden (deactivateScope spares them too).
	const skipInactive = phase !== INSERTION;
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.scope.block.disposed || (skipInactive && inInactiveSubtree(e.scope.block))) continue;
		const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
		if (slot && slot.cleanup) {
			try {
				slot.cleanup();
			} catch (err) {
				console.error(err);
			}
			slot.cleanup = undefined;
		}
	}
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.scope.block.disposed || (skipInactive && inInactiveSubtree(e.scope.block))) continue;
		let cleanup: void | Cleanup;
		try {
			// Spread deps as positional args (see PendingEffect.args). A no-deps
			// effect has args === undefined, so the body is called with zero args.
			// eslint-disable-next-line prefer-spread
			cleanup = e.fn.apply(null, (e.args ?? []) as []);
		} catch (err) {
			// Route effect errors to the nearest enclosing tryBlock, if any.
			const handler = findTryHandler(e.scope.block);
			if (handler) handler(err);
			else console.error(err);
			continue;
		}
		const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
		if (slot) {
			if (typeof cleanup === 'function') slot.cleanup = cleanup;
			// Register ONE stable finalizer per effect slot, on its FIRST run, in
			// phase-execution order. The finalizer fires the slot's CURRENT cleanup
			// once at unmount. Registering here (not on each drain) is what stops
			// the old double-fire bug: previously every returned cleanup was pushed
			// into scope.cleanups, so a dep-changed effect's stale cleanups replayed
			// at unmount. The slot owns its latest cleanup; the finalizer reads it.
			if (!slot.finalized) {
				slot.finalized = true;
				e.scope.cleanups.push(() => {
					const c = slot.cleanup;
					if (c) {
						slot.cleanup = undefined;
						c();
					}
				});
			}
		}
	}
}

// True if the store's current snapshot differs from the inst's last-committed
// value. A throwing getSnapshot is treated as "changed" so the render-phase read
// re-runs and surfaces the error (React's behavior). Hoisted (not a per-render
// closure) — the inst carries everything it needs.
function checkStoreChanged(inst: StoreInst<any>): boolean {
	try {
		return !Object.is(inst.value, inst.getSnapshot());
	} catch {
		return true;
	}
}

// Commit-phase drain of the uSES store-sync queue (see storeSyncQueue). Runs in
// commitEffects AFTER drainPhase(LAYOUT). For each queued consumer: promote the
// render-read snapshot to the committed `value`, then tear-check against the store
// as of NOW — if a mutation slipped into the render→commit window (e.g. a sibling
// layout effect that mutated+notified), force a re-render so the DOM catches up.
// No sort (order is irrelevant: each entry only touches its own inst) and no
// cleanup bookkeeping — the whole point of not routing these through drainPhase.
function drainStoreSyncs(): void {
	if (storeSyncQueue.length === 0) return;
	// Snapshot-and-clear up front (like drainPhase): a forced re-render below could
	// synchronously re-enter this drain; it must see only entries queued AFTER this
	// point, never re-process the batch we already own.
	const q = storeSyncQueue.splice(0);
	for (let i = 0; i < q.length; i++) {
		const inst = q[i];
		inst.queued = false;
		// Skip a consumer whose block was unmounted, or hidden by <Activity>, between
		// enqueue and now — same guards drainPhase applies to effects.
		if (inst.block.disposed || inInactiveSubtree(inst.block)) continue;
		inst.value = inst.pending;
		if (checkStoreChanged(inst)) inst.forceUpdate();
	}
}

// `schedulePostPaint` — fires after the next paint (React's scheduler trick).
let _postPaintCbs: Array<() => void> = [];
/** Swap out the pending post-paint callbacks and run them (both delivery paths). */
function drainPostPaint(): void {
	const cbs = _postPaintCbs;
	_postPaintCbs = [];
	for (let i = 0; i < cbs.length; i++) cbs[i]();
}
let _channel: MessageChannel | null = null;
if (typeof MessageChannel !== 'undefined') {
	_channel = new MessageChannel();
	_channel.port1.onmessage = drainPostPaint;
}
function schedulePostPaint(cb: () => void): void {
	_postPaintCbs.push(cb);
	if (_channel) {
		// rAF lands before paint; MessageChannel posts a macrotask after paint.
		requestAnimationFrame(() => _channel!.port2.postMessage(0));
	} else {
		requestAnimationFrame(() => setTimeout(drainPostPaint, 0));
	}
}

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
 * so every BlockImpl instance shares one hidden class outright.
 *
 * All fields initialised in a single, fixed order. Item-only fields
 * (prev/next sibling, key, itemIndex) sit on every Block as null/0 so root
 * and dynamic blocks share the same shape with for-of item blocks.
 */
class BlockImpl {
	// Hot fields first (touched by every renderBlock / reconcile iteration).
	body: ComponentBody;
	props: any;
	extra: any;
	memoInChain: boolean;
	parentNode: Node;
	parentBlock: Block | null;
	startMarker: Node | null;
	endMarker: Node | null;
	exclusiveMarkers: boolean;
	itemIndex: number;
	// Scheduler / lifecycle.
	pending: boolean;
	disposed: boolean;
	mounted: boolean;
	pendingMode: 'urgent' | 'transition' | null;
	currentRenderMode: 'urgent' | 'transition' | null;
	pendingDeferred: boolean;
	currentRenderDeferred: boolean;
	inactive: boolean;
	// Hooks + cleanups (per-block state).
	hooks: Map<symbol, any> | null;
	cleanups: Cleanup[];
	children: ChildScope[];
	_slots: any[] | null;
	refFields: string[] | null;
	$$ctxValues: Map<Context<any>, any> | null;
	// Contexts whose value this block's subtree consumes — stamped on this block
	// AND its memo ancestors by useContextInternal. The TRANSITIVE signal: a
	// changed version here means "a consumer somewhere at/below me needs the new
	// value", so the memo bailout descends rather than skipping.
	$$ctxReads: Map<Context<any>, any> | null;
	// Contexts this block's OWN render directly read (its own body, or an inline
	// lite descendant that shares this block). The DIRECT signal: a changed
	// version here means THIS block must re-run; if only $$ctxReads changed, the
	// block can bail its body and refresh just its consuming child blocks.
	$$ctxDirect: Map<Context<any>, any> | null;
	// Resolved-provider cache for `use(ctx)` — see Scope.$$ctxCache.
	$$ctxCache: Map<Context<any>, any> | null;
	// Armed for React's IMPLICIT same-element bailout (beginWork's
	// oldProps === newProps skip). Set at value-position component mounts
	// (childSlot) — the only sites that can receive a cached descriptor back.
	// Arming makes the block a stamping target (like __memo) so the bail's lazy
	// consumer refresh has the context deps it needs.
	$$implicitBail: boolean;
	// __thenableIdx is reset every renderBlock so pre-init costs nothing.
	__thenableIdx: number;
	// Render-loop guard bookkeeping (see the Block interface).
	drainStamp: number;
	drainRenders: number;
	// De-opt host node managed by this Block (deoptItemBody / hostElementBody), reused
	// across renders. Null for all other blocks; declared so the shape stays monomorphic.
	deoptNode: Node | null;
	// Per-scope dense slot array (binding bag + control-flow/component/child slots),
	// indexed by compile-time slot index. Keeps the scope shape monomorphic.
	slots: any[];
	// For-block item bookkeeping.
	forSlot: ForSlot | null;
	prevSibling: Block | null;
	nextSibling: Block | null;
	key: any;
	// Scope contract: a Block is its own scope.
	parent: Scope | null;
	block: Block;
	// Metadata.
	kind: BlockKind;

	constructor(
		kind: BlockKind,
		parentBlock: Block | null,
		parentNode: Node,
		startMarker: Node | null,
		endMarker: Node | null,
		body: ComponentBody,
		props: any,
		extra: any,
	) {
		this.body = body;
		this.props = props;
		this.extra = extra;
		// Self-or-ancestor memo flag — OR of our own memo marker with the parent's
		// flag, so the whole property is resolved in O(1) at creation instead of
		// re-walked on every context read.
		this.memoInChain =
			(body as any)?.__memo === true || (parentBlock !== null && parentBlock.memoInChain === true);
		this.parentNode = parentNode;
		this.parentBlock = parentBlock;
		this.startMarker = startMarker;
		this.endMarker = endMarker;
		this.exclusiveMarkers = false;
		this.itemIndex = 0;
		this.pending = false;
		this.disposed = false;
		this.mounted = false;
		this.pendingMode = null;
		this.currentRenderMode = null;
		this.pendingDeferred = false;
		this.currentRenderDeferred = false;
		this.inactive = false;
		this.hooks = null;
		this.cleanups = [];
		this.children = [];
		this._slots = null;
		this.refFields = null;
		this.$$ctxValues = null;
		this.$$ctxReads = null;
		this.$$ctxDirect = null;
		this.$$ctxCache = null;
		this.$$implicitBail = false;
		this.__thenableIdx = 0;
		this.drainStamp = 0;
		this.drainRenders = 0;
		this.deoptNode = null;
		this.slots = [];
		this.forSlot = null;
		this.prevSibling = null;
		this.nextSibling = null;
		this.key = null;
		this.parent = null;
		this.block = this as unknown as Block;
		this.kind = kind;
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
class ScopeImpl {
	block: Block;
	parent: Scope | null;
	hooks: Map<symbol, any> | null;
	cleanups: Cleanup[];
	children: ChildScope[];
	_slots: any[] | null;
	refFields: string[] | null;
	$$ctxValues: Map<Context<any>, any> | null;
	$$ctxReads: Map<Context<any>, any> | null;
	$$ctxCache: Map<Context<any>, any> | null;
	mounted: boolean;
	// Per-scope dense slot array (binding bag + control-flow/component/child slots),
	// indexed by compile-time slot index. Keeps the scope shape monomorphic.
	slots: any[];

	constructor(parent: Scope, block: Block) {
		this.block = block;
		this.parent = parent;
		this.hooks = null;
		this.cleanups = [];
		this.children = [];
		this._slots = null;
		this.refFields = null;
		this.slots = [];
		this.$$ctxValues = null;
		this.$$ctxReads = null;
		this.$$ctxCache = null;
		this.mounted = false;
	}
}

function createBlock(
	kind: BlockKind,
	parentBlock: Block | null,
	parentNode: Node,
	startMarker: Node | null,
	endMarker: Node | null,
	body: ComponentBody,
	props: any,
	extra?: any,
): Block {
	return new BlockImpl(
		kind,
		parentBlock,
		parentNode,
		startMarker,
		endMarker,
		body,
		props,
		extra,
	) as unknown as Block;
}

export function renderBlock(block: Block): void {
	const prevScope = CURRENT_SCOPE;
	const prevBlock = CURRENT_BLOCK;
	CURRENT_SCOPE = block;
	CURRENT_BLOCK = block;
	// Cascade coalescing: clear the queued flag now. A block dequeued by flush()
	// gets re-rendered here; a block reached as a descendant of some OTHER queued
	// block's cascade is also brought up to date here, so flush() can skip its
	// redundant standalone render (it checks `pending` before rendering). Cleared
	// at the TOP so a re-entrant setState during this render re-queues correctly.
	block.pending = false;
	// Reset the per-render `use(thenable)` call-order counter. Cached entries
	// in __thenables persist ONLY across the failed attempts of ONE suspension
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
	block.__thenableIdx = 0;
	{
		const tState = (block as any).__thenables as unknown[] | undefined;
		if (
			tState !== undefined &&
			tState.length !== 0 &&
			(!RESUME_REPLAY || (block as any).__thenableDone === true)
		) {
			tState.length = 0;
		}
		(block as any).__thenableDone = false;
	}
	// Clear last render's recorded context dependencies; this render repopulates
	// them (its own reads + descendant reads propagated up). Only memo blocks
	// ever hold a non-null map, so this is a no-op for the common case.
	if (block.$$ctxReads !== null) block.$$ctxReads.clear();
	if (block.$$ctxDirect !== null) block.$$ctxDirect.clear();
	// Capture the render priority. Explicit pendingMode (set by scheduleRender)
	// wins. Otherwise INHERIT from the outer block — re-entrant renders (try,
	// if, for, comp slots) called synchronously inside an outer body should
	// run at the outer body's priority so transitions propagate down naturally.
	block.currentRenderMode = block.pendingMode ?? prevBlock?.currentRenderMode ?? 'urgent';
	// The deferred bit rides the same channel: explicit when this block was
	// scheduled with a mode (pendingMode set), otherwise inherited from the
	// enclosing render so it reaches components mounting inside a deferred pass.
	block.currentRenderDeferred =
		block.pendingMode !== null
			? block.pendingDeferred
			: (prevBlock?.currentRenderDeferred ?? false);
	block.pendingMode = null;
	block.pendingDeferred = false;
	try {
		const out = (block.body as (p: any, s: Scope, e: any) => unknown)(
			block.props,
			block,
			block.extra,
		);
		// Return-based (React-style) body: it RETURNED a renderable instead of
		// imperatively rendering into `scope`. Mount the return via childSlot, which
		// reconciles by descriptor `type` identity across re-renders — same renderer →
		// patch its holes in place, different → swap. Because each compiled JSX fragment
		// lowers to a descriptor whose `type` is a compiled renderer (not a host-string),
		// this stays on the block reconcile path, NOT the de-opt host path — no VDOM diff.
		// Void bodies (the compiled `@{}` form, and all current components) return
		// `undefined` and skip this entirely.
		if (out !== undefined) {
			// A single-root fragment descriptor (its renderer is `$$singleRoot`) mounts
			// MARKERLESS via componentSlot's singleRoot path — the element self-delimits,
			// so the DOM is byte-identical to `@{}`'s inline render (no extra markers).
			// Anything else (multi-root, arrays, strings, conditionals) → childSlot.
			const useSingleRoot =
				out !== null &&
				(out as any).$$kind === ELEMENT_TAG &&
				typeof (out as any).type === 'function' &&
				(out as any).type.$$singleRoot === true;
			// The return slot (index 0) holds EITHER a componentSlotSlot (singleRoot
			// path) or a childSlot. A re-render can flip which applies: a body that
			// returns `<SingleRootComp/>` one render and `null` / a portal / an array
			// the next (a placeholder toggling on/off, a menu opening/closing). The two
			// shapes are incompatible, so tear the old one down before the other path
			// reads it as its own kind (else e.g. childSlot would touch a
			// componentSlotSlot and crash).
			const existingRet = block.slots[0] as any;
			if (
				existingRet !== undefined &&
				existingRet.__kind !== (useSingleRoot ? 'componentSlotSlot' : 'childSlot')
			) {
				disposeReturnSlot(block, existingRet);
			}
			if (useSingleRoot) {
				const d = out as ElementDescriptor;
				componentSlot(
					block,
					0,
					block.parentNode,
					d.type as ComponentBody,
					d.props,
					block.endMarker,
					d.key ?? undefined,
					true,
				);
			} else {
				childSlot(block, 0, block.parentNode, out, block.endMarker);
			}
		}
		if (!block.mounted) block.mounted = true;
		// Body completed without suspending: its use() episode is over — the
		// next render (replay or not) must not reuse these entries.
		(block as any).__thenableDone = true;
	} finally {
		CURRENT_SCOPE = prevScope;
		CURRENT_BLOCK = prevBlock;
	}
}

// Tear down a block's return slot (slot 0) when renderBlock's return value flips
// between the singleRoot componentSlot shape and the general childSlot shape. Fires
// the content's cleanups, removes its DOM + the slot's own markers, and drops the
// registry entry so the newly-chosen path rebuilds (and unmountScope won't
// double-process a now-stale slot of the wrong kind).
function disposeReturnSlot(block: Block, state: any): void {
	if (state.__kind === 'childSlot') {
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
		(state.start as ChildNode | null)?.remove();
		(state.end as ChildNode | null)?.remove();
	} else {
		// componentSlotSlot — unmountBlock removes its DOM (incl. any owned markers).
		if (state.block) unmountBlock(state.block, true);
		(state.start as ChildNode | null)?.remove?.();
		(state.end as ChildNode | null)?.remove?.();
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
 * Why not reuse BlockImpl: BlockImpl is 24 fields; lite components don't
 * need scheduling, suspense, key, or marker bookkeeping. Carrying just the
 * fields the body actually reads keeps the lite path lean. The two `block`
 * read sites in the body (`parentNode`, `endMarker`) plus the context-walk
 * Phase B read (`parentBlock`) are the only consumers.
 */
class LiteBlockImpl {
	parentNode: Node;
	endMarker: Node | null;
	parentBlock: Block | null;
	$$ctxValues: Map<Context<any>, any> | null;

	constructor(parentNode: Node, endMarker: Node | null, parentBlock: Block | null) {
		this.parentNode = parentNode;
		this.endMarker = endMarker;
		this.parentBlock = parentBlock;
		this.$$ctxValues = null;
	}
}

export function componentSlotLite<P>(
	parentScope: Scope,
	slotKey: number,
	host: Node,
	comp: ComponentBody<P>,
	props: P,
	anchor?: Node,
): void {
	let scope = parentScope.slots[slotKey] as Scope | undefined;
	// The server `<!--]-->` this call adopted as its range end (hydration first
	// render only) — consumed by the post-body cursor advance below.
	let adoptedClose: Node | null = null;
	if (scope === undefined) {
		scope = new ScopeImpl(parentScope, parentScope.block);
		// Lite scope's `block` exposes the host/anchor as the body's DOM context
		// — so the compiled body's `__s.block.parentNode.insertBefore(_root,
		// __s.block.endMarker)` plants content INSIDE the owning element rather
		// than spilling out to the parent block's range. `parentBlock` keeps the
		// context-walk Phase B chain pointing at the real ancestor Block.
		let endMarker = anchor ?? null;
		if (hydrating && isBlockOpen(anchor ?? null)) {
			// Hydration: the server wrapped this hookless component's output in a
			// `<!--[-->…<!--]-->` range (anchor resolved to the `<!--[-->`). Point the
			// cursor at the content so the body's clone() adopts the server DOM, and
			// use `<!--]-->` as the insert anchor so the body's
			// `insertBefore(content, endMarker)` is a no-op (content already there).
			endMarker = matchingClose(anchor as Node);
			adoptedClose = endMarker;
			hydrateNode = (anchor as Node).nextSibling;
		} else if (hydrating && !isBlockOpen(anchor ?? null)) {
			// Anchor-less (appended) component — the compiler dropped the `<!>`
			// placeholder because every child of `host` is a component — OR the anchor
			// is a non-open marker because this lite component is the SOLE hole of a
			// control-flow arm (a `@try { <Comp/> }` body), so its anchor is the arm's
			// end marker. In both cases the server still wrapped the output in a
			// `<!--[-->…<!--]-->` range and mountTry/renderBlock parked the cursor on
			// the `<!--[-->`. The FIRST appended child finds the cursor parked AFTER the
			// just-cloned (empty) host, so descend to host.firstChild; later siblings
			// (and the sole-hole case) already have the cursor on the open marker.
			let open: Node | null = hydrateNode;
			if (open === null || open.parentNode !== host) open = host.firstChild;
			if (open !== null && isBlockOpen(open)) {
				endMarker = matchingClose(open);
				adoptedClose = endMarker;
				hydrateNode = open.nextSibling;
			}
		}
		scope.block = new LiteBlockImpl(host, endMarker, parentScope.block) as unknown as Block;
		parentScope.slots[slotKey] = scope;
		// Register on parent.children so unmountScope(parent) walks into us.
		parentScope.children.push({ key: slotKey, scope });
	} else {
		// Re-render: the parent's host/anchor are stable across renders so no
		// need to rebuild the LiteBlockImpl. Skip the allocation on warm path.
	}
	const prevScope = CURRENT_SCOPE;
	CURRENT_SCOPE = scope;
	try {
		comp(props, scope, undefined);
		if (!scope.mounted) scope.mounted = true;
	} finally {
		CURRENT_SCOPE = prevScope;
	}
	// Hydration: advance the cursor PAST this component's adopted range so the
	// next SIBLING slot adopts from its own `<!--[-->`. The body leaves the
	// cursor ON its adopted root (clone() parks it there), so without this a
	// following sibling lite slot sees a non-marker node, adopts no range, and
	// its commitBag insert MOVES the previous sibling's root to the shared
	// anchor. Mirrors componentSlot's post-render advance.
	if (hydrating && adoptedClose !== null) hydrateNode = adoptedClose.nextSibling;
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
let TEARDOWN_HANDLER: ((err: any) => void) | null = null;
let TEARDOWN_ERRORS: any[] | null = null;

function reportTeardownError(err: any): void {
	if (TEARDOWN_HANDLER !== null) (TEARDOWN_ERRORS ??= []).push(err);
	else console.error(err);
}

function dispatchTeardownErrors(): void {
	const errs = TEARDOWN_ERRORS;
	const h = TEARDOWN_HANDLER;
	TEARDOWN_ERRORS = null;
	TEARDOWN_HANDLER = null;
	if (errs !== null && h !== null) {
		for (let i = 0; i < errs.length; i++) h(errs[i]);
	}
}

function unmountBlock(block: Block, detachDom: boolean = true): void {
	if (block.disposed) return;
	if (TEARDOWN_DEPTH === 0) TEARDOWN_HANDLER = findTryHandler(block.parentBlock);
	TEARDOWN_DEPTH++;
	try {
		unmountBlockInner(block, detachDom);
	} finally {
		if (--TEARDOWN_DEPTH === 0) dispatchTeardownErrors();
	}
}

function unmountBlockInner(block: Block, detachDom: boolean): void {
	block.disposed = true;
	// De-opt-managed host subtree (deoptItemBody item / hostElementBody element):
	// detach its stamped refs so a `ref={obj}` / callback ref doesn't keep pointing
	// at the removed node. Runs even when detachDom is false — those callers
	// (batchClearItems, clearChildContent) remove the DOM themselves, but the
	// teardown is just as permanent. Before unmountScope: a deleted host's ref
	// detaches before its component descendants' cleanups (React's pre-order
	// deletion walk).
	if (block.deoptNode !== null) detachDeoptTreeRefs(block.deoptNode, null);
	// Depth-first cleanup of all scopes reachable from this block.
	unmountScope(block, detachDom);
	if (!detachDom) return;
	// Remove DOM range.
	if (block.startMarker && block.endMarker) {
		const parent = block.startMarker.parentNode;
		if (parent) {
			// Borrowed (slot) markers stay put — remove only the content between
			// them. Owned markers are removed inclusively with the content.
			const excl = block.exclusiveMarkers;
			let n: Node | null = excl ? block.startMarker.nextSibling : block.startMarker;
			const stop = excl ? block.endMarker : block.endMarker.nextSibling;
			while (n && n !== stop) {
				const next: Node | null = n.nextSibling;
				parent.removeChild(n);
				n = next;
			}
		}
	} else if (block.kind === 'root') {
		// Root block — clear the whole container.
		while (block.parentNode.firstChild) {
			block.parentNode.removeChild(block.parentNode.firstChild);
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
function registerSlot(scope: Scope, slot: any): void {
	const slots = scope._slots;
	if (slots === null) scope._slots = [slot];
	else slots.push(slot);
}

function unmountScope(scope: Scope, detachDom: boolean = true): void {
	// Fire THIS scope's cleanups BEFORE recursing into children, so deletion
	// cleanups run parent → child — matching React's commitDeletionEffects
	// pre-order walk (ReactEffectOrdering-test.js:37/:64). Within the scope they
	// still fire in REVERSE-mount order (last useEffect's cleanup first). The DOM
	// range is still attached here (unmountBlock removes it after this returns),
	// so a parent layout-effect cleanup can still observe its children's nodes —
	// exactly as in React, where the parent's destroy runs while the subtree is
	// still mounted.
	const c = scope.cleanups;
	// Suppress queued ref detaches while unwinding an ABORTED mount (the scope's
	// render never completed — `mounted` is only set at the successful end of
	// renderBlock/componentSlotLite): its deferred ref attaches were — or will
	// be — skipped by drainRefAttaches' disposed-subtree guard, so firing
	// `ref(null)` would invoke a callback ref for work that never existed
	// (React never invokes refs for uncommitted work; ReactErrorBoundaries:1158).
	// De-opt refs are unaffected: their detaches queue from detachDeoptTreeRefs
	// walks outside this cleanups loop.
	const prevSuppress = SUPPRESS_UNCOMMITTED_REF_DETACH;
	SUPPRESS_UNCOMMITTED_REF_DETACH = (scope as any).mounted !== true;
	for (let i = c.length - 1; i >= 0; i--) {
		try {
			c[i]();
		} catch (err) {
			// Route to the boundary enclosing the DELETION (collected + dispatched
			// after the walk — see reportTeardownError); React parity: an error in a
			// deletion-phase cleanup reaches the nearest still-mounted boundary
			// instead of being swallowed (ReactErrorBoundaries:1927).
			reportTeardownError(err);
		}
	}
	SUPPRESS_UNCOMMITTED_REF_DETACH = prevSuppress;
	// Then recurse into child scopes (parent → child order).
	const children = scope.children;
	for (let i = 0, n = children.length; i < n; i++) unmountScope(children[i].scope, detachDom);
	// Walk slot-stashed child Blocks (ifBlock / forBlock / componentSlot / portal).
	const slots = scope._slots;
	if (slots !== null) {
		for (let i = 0, n = slots.length; i < n; i++) {
			const val = slots[i];
			// Read __kind ONCE per slot — the property access is megamorphic across
			// six slot shapes, so caching the local saves three repeat IC walks.
			const k = val.__kind;
			if (k === 'ifBlockSlot' || k === 'switchBlockSlot' || k === 'activityBlockSlot') {
				if (val.block) unmountBlock(val.block, detachDom);
			} else if (k === 'forBlockSlot') {
				// Item Blocks form an intrusive chain (head → nextSibling) — walk it
				// instead of the keyed Map's iterator (zero-alloc, monomorphic).
				for (let b: Block | null = val.head; b !== null; b = b.nextSibling)
					unmountBlock(b, detachDom);
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
				// componentSlotSlot | portalSlotSlot | trySlotSlot
				// Portal DOM lives in a FOREIGN target — the root-level batched clear
				// never reaches it, so portals must always self-detach individually.
				const childDetach = k === 'portalSlotSlot' ? true : detachDom;
				if (val.block) unmountBlock(val.block, childDetach);
				// trySlotSlot keeps an off-screen `tryBlock` ALIVE across suspend/
				// resume so its hooks Map survives replay. When the surrounding
				// scope is being torn down (e.g. an @if branch unmounts mid-pending,
				// or the whole component unmounts while still suspended), mark the
				// tryBlock disposed AND clear pendingThenable. That makes the
				// promise's .then-retry callback short-circuit (attachResume's retry
				// bails when pendingThenable was cleared; commitResume and
				// flushStagedReveals bail on a disposed tryBlock), preventing late
				// commits into a torn-down DOM range. We mark via `disposed = true`
				// rather than calling
				// unmountBlock because the tryBlock's DOM was already torn down by
				// its parent's unmount, and a second pass through unmountBlock
				// would re-walk the same scopes / double-fire cleanups.
				if (k === 'trySlotSlot') {
					if (val.tryBlock && val.tryBlock !== val.block) {
						val.tryBlock.disposed = true;
						val.pendingThenable = null;
					}
					// Unmounted while holding for a transition — leave the entangled group
					// so staged siblings aren't left waiting on a boundary that's now gone.
					abandonHeldTransition(val);
					// Cancel any in-flight transition-fallback timeout so the callback
					// can't fire after the slot's owning scope is gone.
					if (val.transitionTimeoutId !== null) {
						clearTimeout(val.transitionTimeoutId);
						val.transitionTimeoutId = null;
					}
				} else if (k === 'portalSlotSlot' && val.target) {
					unregisterDelegationTarget(val.target);
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Hooks — keyed by compile-time Symbol per call site
//
// The `slot` argument is COMPILER-INJECTED. octane/compiler appends a
// `Symbol.for(stableId)` to every hook call; the symbol is what gives the
// hook its per-call-site identity within a scope (and its cross-module
// identity for HMR state preservation). The public signature marks `slot`
// as OPTIONAL so authors writing `useState(0)` in their editor don't see a
// confusing "Expected 2 arguments, but got 1" diagnostic. At runtime the
// missingSlot guard throws if a hook is somehow called without the slot —
// almost always because the source was loaded outside the Vite plugin.
// ---------------------------------------------------------------------------

function missingSlot(name: string): never {
	throw new Error(
		`${name} was called without a slot symbol. The octane compiler injects ` +
			`per-call-site slot symbols; ensure your project loads this runtime ` +
			`through the Vite plugin (octane/compiler/vite). To call hooks by hand, ` +
			`pass a stable symbol, e.g. useState(0, Symbol.for('my-stable-id')).`,
	);
}

// withSlot — establishes hook call-site identity via a per-render PATH STACK, so a
// hook reached THROUGH a custom-hook wrapper combines the wrapper's call-site symbol
// with its own. The compiler wraps CUSTOM hook calls only, as
// `withSlot(sym, hook, ...args, sym)` — the hook + args pass through directly (no
// per-render closure to allocate), and the trailing `sym` is retained so library
// bindings that read the slot off their last argument keep working. BASE hooks keep
// the plain trailing-slot form (`useState(0, sym)`); inside a wrapper, resolveSlot
// folds the path in. Two calls to the same custom hook push DIFFERENT call-site
// symbols → different paths → independent state; a hook in a plain JS loop would
// repeat one call-site symbol, so the compiler rejects it (rejectHookInJsLoop in
// compile.js — the keyed `@for` template block is the supported loop: each item
// renders in its own scope).
const slotStack: symbol[] = [];
export function withSlot<T>(sym: symbol, fn: (...a: any[]) => T, ...args: any[]): T {
	slotStack.push(sym);
	try {
		return fn(...args);
	} finally {
		slotStack.pop();
	}
}
function currentPathSlot(): symbol | undefined {
	const n = slotStack.length;
	if (n === 0) return undefined;
	if (n === 1) return slotStack[0]; // top-level hook: single symbol, no combination
	let key = slotStack[0].description!;
	for (let i = 1; i < n; i++) key += '|' + slotStack[i].description;
	return Symbol.for(key);
}

// Resolve a base hook's effective slot by COMBINING its own per-call-site symbol
// (the compiler-injected trailing arg, when present) with the call-site PATH STACK
// (the symbols withSlot pushes for each enclosing custom-hook call). At the top
// level the stack is empty, so the hook's own slot is used unchanged — no behavior
// change for ordinary component hooks. Inside a withSlot-wrapped custom hook, the
// wrapper's call-site symbol is folded in, so the SAME custom hook used at two call
// sites (or reused) keeps its inner hooks independent. A base hook with no slot of
// its own (a hand-written or library-binding base hook) falls back to the path.
function resolveSlot(slot: symbol | undefined): symbol | undefined {
	const path = currentPathSlot();
	if (path === undefined) return slot;
	if (slot === undefined) return path;
	return Symbol.for(path.description + '|' + slot.description);
}

interface StateSlot<T> {
	value: T;
	setter: (next: T | ((prev: T) => T)) => void;
}

export function useState<T>(
	initial: T | (() => T),
	slot?: symbol,
): [T, (next: T | ((prev: T) => T)) => void] {
	// ABI: the compiler appends the slot as the LAST argument, so a zero-arg
	// `useState()` (state starts undefined — React parity) arrives as
	// `useState(slot)` with the symbol in the initial-value position. Same
	// trailing-symbol reinterpretation as resolveHookArgs. Unambiguous: a
	// symbol-valued initial from compiled code always arrives WITH a slot arg.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial as unknown as symbol;
		initial = undefined as T;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useState');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as StateSlot<T> | undefined;
	if (s === undefined) {
		const initVal = typeof initial === 'function' ? (initial as () => T)() : initial;
		s = {
			value: initVal,
			setter: (next) => {
				const computed = typeof next === 'function' ? (next as (p: T) => T)(s!.value) : next;
				if (Object.is(computed, s!.value)) return;
				s!.value = computed;
				scheduleRender(block);
			},
		};
		ensureHooks(scope).set(slot, s);
	}
	return [s.value, s.setter];
}

export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: symbol,
): [S, (action: A) => void] {
	// The compiler appends the hook slot symbol as the final argument. So the
	// React 2-arg form `useReducer(reducer, initialState)` arrives as
	// `(reducer, initialState, slot)` and the lazy 3-arg form
	// `useReducer(reducer, initialArg, init)` arrives as
	// `(reducer, initialArg, init, slot)`. Disambiguate by which trailing arg
	// is the symbol.
	let init: ((arg: I) => S) | undefined;
	if (typeof initOrSlot === 'symbol') {
		slot = initOrSlot;
	} else {
		init = initOrSlot;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useReducer');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as
		| { value: S; dispatch: (a: A) => void; reducer: (s: S, a: A) => S }
		| undefined;
	if (s === undefined) {
		// React parity: the initial state is `initialArg` used AS-IS. Lazy
		// initialization happens ONLY when the third `init` argument is supplied
		// (`init(initialArg)`). A function passed as `initialArg` in the 2-arg form
		// is stored as the state value verbatim — it is NOT called.
		const initVal = init !== undefined ? init(initialArg) : (initialArg as unknown as S);
		s = {
			value: initVal,
			reducer,
			// React parity: unlike useState's setter, dispatch does NOT eagerly bail
			// when the reducer returns the same state — a no-op action still renders
			// the component once (children then bail as usual). Per
			// ReactHooksWithNoopRenderer-test.js:3889.
			dispatch: (action) => {
				s!.value = s!.reducer(s!.value, action);
				scheduleRender(block);
			},
		};
		ensureHooks(scope).set(slot, s);
	} else {
		// Allow reducer reference to update across renders.
		s.reducer = reducer;
	}
	return [s.value, s.dispatch];
}

function depsChanged(prev: any[] | undefined, next: any[] | undefined): boolean {
	if (prev === undefined || next === undefined) return true;
	if (prev.length !== next.length) return true;
	for (let i = 0; i < prev.length; i++) {
		if (!Object.is(prev[i], next[i])) return true;
	}
	return false;
}

// True if `block` or any ancestor is in a hidden <Activity> subtree. Effects
// must not run inside such a subtree — neither freshly (enqueueEffect skips
// registration) NOR via an entry already sitting in a phase queue when the
// Activity hides between enqueue and drain (drainPhase skips execution). On
// reveal, deactivateScope has cleared each effect slot's deps, so the
// re-render re-enqueues and the effect finally fires.
function inInactiveSubtree(block: Block | null): boolean {
	for (let a = block; a !== null; a = a.parentBlock) {
		if (a.inactive) return true;
	}
	return false;
}

function enqueueEffect(slot: symbol, fn: EffectFn, deps: any[] | undefined, phase: Phase): void {
	const scope = CURRENT_SCOPE!;
	// Hidden <Activity> subtree: render (state + DOM) but DON'T run effects. Skip
	// BEFORE touching the slot so the effect is treated as fresh and re-fires when
	// the Activity becomes visible (deactivateScope also clears prior deps). Walk
	// ancestors so a visible inner block inside a hidden outer Activity is skipped
	// too. Effects are rare on the hot path, so this extra walk is cheap.
	// INSERTION effects are exempt (React: they stay connected while hidden and an
	// update in a hidden-but-rendered subtree still fires them — Activity-test.js:1428).
	if (phase !== INSERTION && inInactiveSubtree(scope.block)) return;
	const prev = scope.hooks?.get(slot) as EffectSlot | undefined;
	if (prev && !depsChanged(prev.deps, deps)) return;
	if (!prev) {
		ensureHooks(scope).set(slot, { deps, cleanup: undefined, effect: true, phase });
	} else {
		prev.deps = deps;
	}
	// Tag with the enqueue sequence (DFS pre-order). drainPhase turns this + the
	// parentBlock chain into React's post-order commit order — see PendingEffect.seq.
	const entry = { scope, slot, fn, args: deps, seq: commitSeq++ };
	(WIP_CAPTURE !== null ? WIP_CAPTURE.effects[phase] : effectQueues[phase]).push(entry);
}

// ABI: the compiler appends the hook slot as the LAST argument. When the user
// omits deps (`useEffect(fn)` / `useMemo(fn)`), the call arrives as `hook(fn, slot)`
// — the symbol lands in the deps position and the real slot param is undefined.
// Detect the trailing symbol and reinterpret so optional-deps forms work. A
// returned undefined deps means "run on every commit/render" (React parity for
// omitted deps). Shared by the effect hooks AND useMemo; useCallback keeps its own
// reinterpret fork (see its comment — it must forward the RAW slot to useMemo).
function resolveHookArgs(
	name: string,
	deps: any[] | symbol | undefined,
	slot: symbol | undefined,
): [any[] | undefined, symbol] {
	if (slot === undefined && typeof deps === 'symbol') {
		slot = deps;
		deps = undefined;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot(name);
	return [deps as any[] | undefined, slot];
}

export function useEffect(fn: EffectFn, deps?: any[], slot?: symbol): void {
	const [d, s] = resolveHookArgs('useEffect', deps, slot);
	enqueueEffect(s, fn, d, PASSIVE);
}
export function useLayoutEffect(fn: EffectFn, deps?: any[], slot?: symbol): void {
	const [d, s] = resolveHookArgs('useLayoutEffect', deps, slot);
	enqueueEffect(s, fn, d, LAYOUT);
}
export function useInsertionEffect(fn: EffectFn, deps?: any[], slot?: symbol): void {
	const [d, s] = resolveHookArgs('useInsertionEffect', deps, slot);
	enqueueEffect(s, fn, d, INSERTION);
}

export function useMemo<T>(compute: (...deps: any[]) => T, deps?: any[], slot?: symbol): T {
	const [d, s] = resolveHookArgs('useMemo', deps, slot);
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(s) as { deps: any[] | undefined; value: T } | undefined;
	// deps === undefined → recompute every render (React parity for omitted deps).
	if (prev && d !== undefined && !depsChanged(prev.deps, d)) return prev.value;
	// Parallel-use warming: before recomputing, adopt a prefetched creation for
	// this slot (started by warmMemo during a suspended ancestor's warm walk) —
	// the fetch is already in flight. Only compiler-warmed slots can hit;
	// WARM_EVER keeps the ancestor walk off apps that never warm.
	if (WARM_EVER && d !== undefined) {
		const adopted = adoptWarmValue(s, d);
		if (adopted !== WARM_MISS) {
			ensureHooks(scope).set(s, { deps: d, value: adopted });
			return adopted as T;
		}
	}
	// Spread deps as positional args (superset of React — see PendingEffect.args):
	// a factory written as a pure function of its deps is hoistable. Zero-arg
	// React-style factories ignore the extra args.
	// eslint-disable-next-line prefer-spread
	const value = compute.apply(null, (d ?? []) as []);
	ensureHooks(scope).set(s, { deps: d, value });
	return value;
}

export function useCallback<F extends (...args: any[]) => any>(
	fn: F,
	deps?: any[],
	slot?: symbol,
): F {
	// Trailing-symbol ABI (see resolveHookArgs): `useCallback(fn)` arrives as
	// `useCallback(fn, slot)`. Reinterpret the omitted-deps case HERE so the slot Symbol
	// can't leak into useMemo's `deps` array (it would in a custom-hook context, where
	// resolveSlot turns the otherwise-undefined slot into the path prefix, defeating
	// useMemo's own reinterpret guard). Forward the RAW slot — useMemo does the single
	// resolveSlot; resolving here too and passing the result would double-combine the
	// custom-hook path prefix into the wrong slot.
	if (slot === undefined && typeof deps === 'symbol') {
		slot = deps as unknown as symbol;
		deps = undefined;
	}
	// Guard here (rather than letting useMemo throw) so the diagnostic names useCallback.
	// resolveSlot is a read-only peek at the path stack, so this doesn't disturb useMemo's.
	if (resolveSlot(slot) === undefined) missingSlot('useCallback');
	return useMemo(() => fn, deps as any[] | undefined, slot);
}

export function useRef<T>(initial: T, slot?: symbol): { current: T } {
	// Zero-arg `useRef()` — same compiler-ABI trailing-symbol reinterpretation
	// as useState above.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial as unknown as symbol;
		initial = undefined as T;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useRef');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { current: T } | undefined;
	if (s === undefined) {
		s = { current: initial };
		ensureHooks(scope).set(slot, s);
	}
	return s;
}

/**
 * React's `useDebugValue(value, format?)` — a devtools-only label for custom
 * hooks. Octane has no devtools inspector, so it is a no-op; exported so custom
 * hooks ported from React run unchanged. Accepts (and ignores) the compiler's
 * trailing slot symbol like every other hook.
 */
export function useDebugValue(_value?: unknown, _format?: unknown, _slot?: symbol): void {}

/**
 * React's `useImperativeHandle(ref, factory, deps)` — exposes an imperative
 * API to a parent via the ref. Scheduled as a layout-phase effect so the
 * `ref.current` is populated before paint and before any layout effects in
 * ancestors that depend on the API. Cleared to null on unmount.
 */
export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null | undefined,
	factory: () => T,
	deps?: any[],
	slot?: symbol,
): void {
	const [resolvedDeps, resolvedSlot] = resolveHookArgs('useImperativeHandle', deps, slot);
	deps = resolvedDeps;
	slot = resolvedSlot;
	// Re-run when the deps OR the ref IDENTITY changes. React manages ref attachment
	// independently of deps — a swapped ref must detach the old (cleanup → setRef(null) on
	// the PREVIOUS ref) and populate the new one, even when deps are stable (e.g. `[]`).
	// Appending `ref` makes a ref change a dep change, so the prior run's cleanup (closed
	// over the old ref) fires before the new run sets the new ref. No-deps (`undefined` →
	// run every render) already re-attaches each render, so it's left as-is.
	const effectDeps = deps === undefined ? undefined : [...deps, ref];
	enqueueEffect(
		slot,
		() => {
			// React-19 callback-ref cleanup (refs-test.js:528): a callback ref may
			// RETURN a cleanup; detach then runs the cleanup INSTEAD of ref(null).
			// Handled locally (not via attachRef) because the handle value can be a
			// primitive, which attachRef's per-target WeakMap can't key.
			let cleanup: unknown;
			if (typeof ref === 'function') cleanup = (ref as any)(factory());
			else if (ref != null) (ref as { current: T | null }).current = factory();
			return () => {
				if (typeof cleanup === 'function') {
					cleanup();
					return;
				}
				if (typeof ref === 'function') (ref as any)(null);
				else if (ref != null) (ref as { current: T | null }).current = null;
			};
		},
		effectDeps,
		LAYOUT,
	);
}

// Per-call-site cache of the two derived sub-slot symbols a uSES call needs (the
// inst cell + the subscribe effect). Computing `Symbol.for(desc + …)` and hitting
// the global Symbol registry on EVERY render was pure overhead; the resolved slot
// is stable per call site (resolveSlot interns custom-hook call PATHS), so one
// lookup per site amortizes to nothing. Grows monotonically, bounded by resolved
// call paths — strictly fewer entries than the four registry symbols the old code
// re-derived every render.
const USES_SUBSLOTS = new Map<symbol, { inst: symbol; effect: symbol }>();
function usesSubslots(slot: symbol): { inst: symbol; effect: symbol } {
	let s = USES_SUBSLOTS.get(slot);
	if (s === undefined) {
		const desc = slot.description ?? '';
		s = { inst: Symbol.for(desc + ':uses:inst'), effect: Symbol.for(desc + ':uses:effect') };
		USES_SUBSLOTS.set(slot, s);
	}
	return s;
}

// Push (or refresh) a consumer's pending commit-sync onto the store-sync queue.
// GATED by the caller (mount, or a snapshot/subscribe change) so an unchanged
// render enqueues nothing. The `queued` flag collapses a double push when a block
// renders twice before its single commit — the later render's snapshot wins.
// Off-screen renders redirect into WIP_CAPTURE.stores (spliced back only if the
// WIP commits), exactly like enqueueEffect.
function enqueueStoreSync(
	inst: StoreInst<any>,
	value: any,
	subscribe: (cb: () => void) => () => void,
): void {
	inst.pending = value;
	inst.subscribe = subscribe;
	if (inst.queued) return;
	inst.queued = true;
	(WIP_CAPTURE !== null ? WIP_CAPTURE.stores : storeSyncQueue).push(inst);
}

// Passive-phase subscription body for uSES, written as a DEPS-AS-ARGS function
// (drainPhase applies the deps array positionally — a Ripple superset, see
// PendingEffect.args) so it lives at module scope with zero per-render capture.
// The PARAMETER ORDER MUST MATCH the deps array `[inst, subscribe]` at the call
// site — reordering the deps silently mis-binds these arguments. Re-fires only
// when inst (stable) or subscribe changes: on a store swap the effect slot's
// cleanup unsubscribes the old store first, then this re-subscribes to the new.
function subscribeToStore(
	inst: StoreInst<any>,
	subscribe: (cb: () => void) => () => void,
): Cleanup {
	// The store may have mutated between the render read and this subscription
	// taking effect; re-check immediately so an early notify isn't missed. Uses
	// inst.getSnapshot, which render already advanced to the latest closure.
	if (checkStoreChanged(inst)) inst.forceUpdate();
	// One stable handler across re-subscribes (inst.onStoreChange never changes) —
	// harmless here since stores key listeners by our Set membership, and the
	// swap-cleanup removes the old registration before we add the new one.
	return subscribe(inst.onStoreChange);
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
 * client/server difference. For a non-SSR build the `hydrating` guard
 * constant-folds the branch away.
 *
 * Implementation. A single identity-stable `inst` cell (StoreInst) holds the
 * last-COMMITTED snapshot, the latest getSnapshot, the block's forceUpdate, and a
 * stable onStoreChange handler. Two derived sub-slots host it: `<slot>:uses:inst`
 * (the cell, in the hooks map) and `<slot>:uses:effect` (the passive subscribe
 * effect). The value-sync that reconciles the render-read snapshot at commit does
 * NOT go through a layout effect — it rides the dedicated, sort-free
 * `storeSyncQueue` (drainStoreSyncs, run after drainPhase(LAYOUT)). Two payoffs:
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
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	...rest: any[]
): T {
	// React-19 shape: `useSyncExternalStore(subscribe, getSnapshot,
	// getServerSnapshot?)`. The compiler appends the hook-slot Symbol as the
	// LAST argument, so we detect the user-vs-compiler args by counting from
	// the end. One trailing Symbol → user passed no getServerSnapshot; one
	// trailing Symbol preceded by another arg → user passed getServerSnapshot.
	let slot = rest[rest.length - 1] as symbol | undefined;
	slot = resolveSlot(slot);
	if (typeof slot !== 'symbol') missingSlot('useSyncExternalStore');
	const getServerSnapshot = rest.length >= 2 ? (rest[0] as () => T) : undefined;
	const subs = usesSubslots(slot);

	// Fresh read on every render — the anti-tearing snapshot. DURING HYDRATION the
	// first read uses getServerSnapshot (if provided) so the adopted DOM matches the
	// server value; the commit-time store-sync then re-checks getSnapshot() and
	// forces an update if the client value differs (React's hydrate-then-sync).
	// `hydrating` constant-folds out for non-SSR builds (the hydration DCE contract).
	const value = hydrating && getServerSnapshot !== undefined ? getServerSnapshot() : getSnapshot();

	const scope = CURRENT_SCOPE!;
	let inst = scope.hooks?.get(subs.inst) as StoreInst<T> | undefined;
	if (inst === undefined) {
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
			forceUpdate: () => scheduleRender(block),
			onStoreChange: () => {
				if (checkStoreChanged(created)) created.forceUpdate();
			},
			block,
			queued: false,
		};
		inst = created;
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
	// deps-as-args fn (cast: EffectFn is nominally zero-arg, but drainPhase applies
	// the deps positionally — see subscribeToStore).
	useEffect(subscribeToStore as unknown as EffectFn, [inst, subscribe], subs.effect);

	return value;
}

/**
 * React 19 `useEffectEvent` — returns a stable function whose body always
 * reflects the latest version of `fn`. Use inside `useEffect` deps to escape
 * the "must re-create the effect just because a closure-captured value changed"
 * trap. The returned function has the same identity across renders; calling it
 * invokes the most-recent `fn` (i.e., it always sees fresh closure values).
 */
export function useEffectEvent<F extends (...args: any[]) => any>(fn: F, slot?: symbol): F {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useEffectEvent');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { current: F; stable: F } | undefined;
	if (s === undefined) {
		const stable = ((...args: any[]) => s!.current.apply(null, args)) as F;
		s = { current: fn, stable };
		ensureHooks(scope).set(slot, s);
	} else {
		s.current = fn;
	}
	return s.stable;
}

// ---------------------------------------------------------------------------
// Context — createContext + use() (React 19 shape; useContext provided as an alias)
// ---------------------------------------------------------------------------

const CONTEXT_TAG = Symbol.for('octane.context');

export interface Context<T> {
	$$kind: typeof CONTEXT_TAG;
	defaultValue: T;
	Provider: ComponentBody<{ value: T; children?: any }>;
	/**
	 * Monotonic version bumped whenever a Provider for this context commits a
	 * changed value. Consumers record the version they read at; the memo bailout
	 * (componentSlot) compares it so a context change forces a re-render through
	 * the push-cascade even when props are shallow-equal. See useContextInternal.
	 */
	$$version: number;
}

/**
 * Create a Context. Providers push the value into a Block-scoped slot; `use(ctx)`
 * walks the Block parent chain to find the nearest Provider for that context.
 */
export function createContext<T>(defaultValue: T): Context<T> {
	const ctx = { $$kind: CONTEXT_TAG, defaultValue, $$version: 0 } as Context<T>;
	// A Provider is a built-in component that stamps the value on its Block
	// and renders its `children` body inside its scope.
	ctx.Provider = function ProviderBody(props, scope) {
		// Stash on the scope (not block) so siblings of the Provider don't see it.
		// $$ctxValues is pre-initialised to null on every Scope/Block so this
		// assignment is a hidden-class-stable update (not a late stamp).
		if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
		// Bump the context version when an EXISTING value actually changes. This
		// runs before children() below, so the memo bailout downstream already
		// sees the new version when the cascade reaches it. First-set is NOT a
		// change: adding a Provider always creates a fresh scope for its
		// descendants, so a memoized consumer can't carry pre-Provider state — it's
		// always freshly mounted within the Provider's scope and reads the value
		// directly (no memo bailout to invalidate). (Bumping on first-set would
		// over-invalidate every memo'd consumer of this context elsewhere.)
		if (scope.$$ctxValues.has(ctx) && !Object.is(scope.$$ctxValues.get(ctx), props.value)) {
			ctx.$$version++;
		}
		scope.$$ctxValues.set(ctx, props.value);
		// Children between the Provider tags reach us in one of two shapes:
		//   - a compiled render-body FUNCTION — the `.tsrx` `{props.children}` lowering;
		//   - an element descriptor / renderable — a React-style `.tsx` parent, where
		//     `<Ctx.Provider>…</Ctx.Provider>` lowers to `createElement(Ctx.Provider,
		//     { value }, …children)` and `createElement` mirrors the positional children
		//     into `props.children` (a descriptor, an array, or text — never a function).
		// `childrenAsBody` normalizes either shape to a callable body, so both dialects
		// render their children inside the Provider's scope (and thus under its context).
		if (props.children != null) {
			childrenAsBody(props.children)(undefined, scope, undefined);
		}
	};
	return ctx;
}

/**
 * Programmatically provide a context value for a scope's descendants — the same
 * stamping `<Context.Provider value={…}>` performs, exposed for plain-TS
 * (non-template) components that render children and want to provide context to
 * them without authoring a `.tsrx` Provider wrapper. Call it during the component's
 * render, before rendering `children` into the same `scope`. (Used by runtime
 * component bindings — e.g. `@octanejs/motion`'s `MotionConfig` and variant
 * propagation.)
 */
export function provideContext<T>(scope: Scope, context: Context<T>, value: T): void {
	if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
	// Bump the version only when an existing value actually changes (see Provider).
	if (scope.$$ctxValues.has(context) && !Object.is(scope.$$ctxValues.get(context), value)) {
		context.$$version++;
	}
	scope.$$ctxValues.set(context, value);
}

// Marker for compiler-generated children-block render functions. `.tsrx` lowers a component's
// element/text children (`<C><D/></C>`) to a render function `__children$N(__props, __s, __extra)`,
// while a render-prop child (`<C>{(data) => …}</C>`) is passed through RAW. Both are
// `typeof === 'function'`, so React-ecosystem code that branches on `typeof children === 'function'`
// (function-as-child / render-prop APIs) cannot tell them apart. The compiler tags the FORMER with
// this symbol so `isChildrenBlock()` can exclude it. `Symbol.for` so the identity survives multiple
// runtime copies (e.g. a binding bundled against its own octane).
const CHILDREN_BLOCK: unique symbol = Symbol.for('octane.childrenBlock') as any;

/**
 * Compiler-emitted: tag a children-block render function so `isChildrenBlock` recognises it.
 * Returns the function for inline use (`{ children: markChildrenBlock(__children$N) }`).
 * @internal
 */
export function markChildrenBlock<T>(fn: T): T {
	if (typeof fn === 'function') {
		(fn as any)[CHILDREN_BLOCK] = true;
	}
	return fn;
}

/**
 * True when `value` is a compiler-generated children-block — a component's element/text children
 * that `.tsrx` lowered to a render function — as opposed to a user render-prop function or any other
 * value. Lets a binding with a function-as-child API tell `<C>{(x) => …}</C>` (call it) apart from
 * `<C><D/></C>` (render it): `typeof children === 'function' && !isChildrenBlock(children)`.
 */
export function isChildrenBlock(value: unknown): boolean {
	return typeof value === 'function' && (value as any)[CHILDREN_BLOCK] === true;
}

/**
 * The children reaching `<Suspense>` / `<ErrorBoundary>` are rendered as the try
 * BODY — `renderBlock` invokes it as `block.body(props, scope, extra)`. The `.tsrx`
 * `{props.children}` lowering passes a render FUNCTION (callable as-is), but a
 * React-style `.tsx` parent lowers element children (`<S><Child/></S>`) to a
 * `createElement` DESCRIPTOR — a plain renderable, not a function. Normalize either
 * shape to a callable body so the try-block primitive works whichever dialect (or
 * value-position `.map`) authored the parent.
 */
function childrenAsBody(children: unknown): ComponentBody {
	if (typeof children === 'function') return children as ComponentBody;
	return (_p, s) => {
		childSlot(s, 0, s.block.parentNode, children, s.block.endMarker);
	};
}

/**
 * `<Suspense fallback={…}>…</Suspense>` — the JSX component form of
 * `@try { … } @pending { fallback }`, for authors writing JSX rather than the
 * template directives (e.g. porting React / react-query code). A thin built-in
 * over the same `tryBlock` primitive the directives compile to: the children
 * render as the try body, and `fallback` renders as the pending body whenever a
 * descendant suspends (via `use(thenable)`).
 */
export const Suspense: ComponentBody<{ fallback?: unknown; children: ComponentBody }> = (
	props,
	scope,
) => {
	const block = scope.block;
	const pendingBody: ComponentBody = (_p, s) => {
		childSlot(s, 1, s.block.parentNode, props.fallback, s.block.endMarker);
	};
	tryBlock(
		scope,
		0,
		block.parentNode,
		childrenAsBody(props.children),
		null,
		pendingBody,
		block.endMarker,
	);
};

/**
 * `<ErrorBoundary fallback={…}>…</ErrorBoundary>` — the JSX component form of
 * `@try { … } @catch (e) { fallback }`. `fallback` is either a renderable or a
 * `(error, reset) => renderable` render prop (react-error-boundary style). When a
 * descendant throws during render/effects, the boundary swaps to the fallback.
 */
export const ErrorBoundary: ComponentBody<{
	fallback?: unknown | ((error: unknown, reset: () => void) => unknown);
	children: ComponentBody;
}> = (props, scope) => {
	const block = scope.block;
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
	tryBlock(
		scope,
		0,
		block.parentNode,
		childrenAsBody(props.children),
		catchBody,
		null,
		block.endMarker,
	);
};

/**
 * React 19's `use()` — accepts either a Context<T> or a thenable (Promise<T>).
 *
 * - `use(context)`: walks the Block tree from CURRENT_BLOCK upward to find a
 *   Provider's value (or the default).
 * - `use(thenable)`: if fulfilled, returns the value; if rejected, rethrows
 *   the reason (caught by the nearest tryBlock's catch); if pending, throws
 *   an internal SuspenseException (caught by the nearest tryBlock and routed
 *   to its `pending` body).
 *
 * The thenable mutates in place to gain `.status` / `.value` / `.reason`
 * fields the second time it's seen — matches React's `trackUsedThenable`.
 * Per-block `thenableState[]` keyed by call index lets the body replay
 * synchronously after the promise resolves.
 */
export function use<T>(usable: Context<T> | PromiseLike<T> | TrackedThenable<T>): T {
	if (usable && (usable as any).$$kind === CONTEXT_TAG) {
		return useContextInternal(usable as Context<T>);
	}
	if (usable == null || typeof (usable as any).then !== 'function') {
		throw new Error('use(): argument is not a Context nor a thenable');
	}
	return useThenable(usable as TrackedThenable<T>);
}

/**
 * React's `useContext(Context)` — reads the nearest Provider's value (or the
 * context default). A thin alias for the context branch of `use()`: context
 * reads carry no per-call-site state, so there is no hook slot and the compiler
 * needs no rewrite. Provided for React familiarity; `use(Context)` is the
 * React-19 idiom and remains the primary form.
 */
export function useContext<T>(context: Context<T>): T {
	return useContextInternal(context);
}

// Sentinel cached in a consumer's resolved-provider slots to mean "no provider —
// use the context's default". Distinct from `undefined` (a cache miss) so a
// resolved default is an O(1) hit rather than a re-walk to the root every read.
const DEFAULT_CTX: unique symbol = Symbol('octane.ctx.default');

function useContextInternal<T>(context: Context<T>): T {
	// Record the context dependency on every enclosing memo() block, with the
	// version read. The push-cascade re-renders a Provider's subtree top-down;
	// a memo bailout would otherwise sever that cascade and strand consumers
	// (the memo'd component itself, its lite descendants, AND deeper consumers)
	// with a stale value. Stamping memo ancestors lets the bailout detect the
	// version change and decline to skip. Only memo blocks are stamped, so this
	// costs nothing for the common no-memo tree.
	// Skip the walk entirely when no memo block sits at or above us — the loop
	// would stamp nothing. `memoInChain` is precomputed at block creation, so the
	// common no-memo tree pays a single boolean test instead of an ancestor walk
	// per `use()` call.
	if (CURRENT_BLOCK !== null && CURRENT_BLOCK.memoInChain) {
		// DIRECT read: the block whose render this read happened in (its own body,
		// or an inline lite descendant sharing the block) must re-run when this
		// context changes — it can't be skipped past.
		(CURRENT_BLOCK.$$ctxDirect ??= new Map()).set(context, context.$$version);
		// TRANSITIVE: stamp every memo (or implicit-bail-armed) ancestor so the
		// bailout knows a consumer lives below it and descends instead of skipping.
		for (let b: Block | null = CURRENT_BLOCK; b !== null; b = b.parentBlock) {
			if ((b.body as any)?.__memo === true || b.$$implicitBail === true) {
				(b.$$ctxReads ??= new Map()).set(context, context.$$version);
			}
		}
	}
	// Fast path: a prior read from this consumer already resolved the provider.
	// The (consumer → provider) mapping is invariant for the consumer's lifetime
	// (see Scope.$$ctxCache), so re-read the live value straight from the cached
	// scope and skip the ancestor walk entirely.
	const reader = CURRENT_SCOPE;
	if (reader !== null && reader.$$ctxCache !== null) {
		const hit = reader.$$ctxCache.get(context);
		if (hit !== undefined) {
			if (hit === DEFAULT_CTX) return context.defaultValue;
			// The cached resolver is always a live ancestor (resolution walks up;
			// you can't unmount an ancestor while a descendant renders) and a
			// provider scope's $$ctxValues retains its context for life (ProviderBody
			// only `.set`s — never deletes or re-nulls). So the map and key are
			// guaranteed present; read the live value with no recheck. A structural
			// change that could move a consumer's provider also re-mounts the
			// consumer (fresh cache), so a stale resolver can't be observed — see the
			// "provider remounts under a consumer" regression test.
			return (hit as Scope).$$ctxValues!.get(context) as T;
		}
	}

	let s: Scope | null = reader;
	while (s !== null) {
		const m = s.$$ctxValues;
		if (m !== null && m.has(context)) {
			if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, s);
			return m.get(context) as T;
		}
		s = s.parent;
	}
	let b: Block | null = CURRENT_BLOCK ? CURRENT_BLOCK.parentBlock : null;
	while (b !== null) {
		const m = b.$$ctxValues;
		if (m !== null && m.has(context)) {
			if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, b);
			return m.get(context) as T;
		}
		b = b.parentBlock;
	}
	if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, DEFAULT_CTX);
	return context.defaultValue;
}

// ---------------------------------------------------------------------------
// Suspense — use(thenable) and the SuspenseException sentinel.
// ---------------------------------------------------------------------------

interface TrackedThenable<T = any> extends PromiseLike<T> {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: any;
}

/**
 * Sentinel thrown by `use(pendingThenable)`. Intentionally NOT an Error so
 * userland try/catch is unlikely to swallow it — only our `tryBlock` knows
 * to look for it via `isSuspenseException`. Carries the thenable so the
 * boundary can attach a `then` listener and schedule a retry.
 */
class SuspenseException {
	readonly __isSuspense = true;
	constructor(public readonly thenable: TrackedThenable<any>) {}
}

function isSuspenseException(x: any): x is SuspenseException {
	return x !== null && typeof x === 'object' && (x as any).__isSuspense === true;
}

function useThenable<T>(thenable: TrackedThenable<T>): T {
	const block = CURRENT_BLOCK!;
	const state: TrackedThenable<any>[] = ((block as any).__thenables ??= []);
	const idx = block.__thenableIdx;
	block.__thenableIdx = idx + 1;

	// Hydration seeding (SSR Phase 4): the server already resolved this use() and
	// serialized the value. Adopt the next seeded value (use() calls hydrate in
	// the same render order the server produced them in) and mark the thenable
	// fulfilled, so this render and every later one return synchronously — no
	// re-suspend, no client re-fetch. Folds out for client-only builds.
	if (hydrating && hydrationSeeds !== null && hydrationSeedCursor < hydrationSeeds.length) {
		const value = hydrationSeeds[hydrationSeedCursor++] as T;
		thenable.status = 'fulfilled';
		thenable.value = value;
		state[idx] = thenable;
		return value;
	}

	const stored = state[idx];
	// Replay path: same promise as last attempt — fast lookup of the cached entry.
	if (stored === thenable) {
		if (thenable.status === 'fulfilled') return thenable.value as T;
		if (thenable.status === 'rejected') throw thenable.reason;
		// Still pending — re-throw without re-tagging (already wired up).
		throw new SuspenseException(thenable);
	}

	// Resume-replay leniency (React parity: ReactFiberThenable's "reuse the
	// previous thenable, and drop the new one"): the body is replaying after a
	// resolution, and an UNMEMOIZED creation minted a fresh promise for a slot
	// that already holds one. Components are assumed idempotent — keep the
	// stored thenable; the fresh one's fetch already fired (that duplicate
	// request is exactly what the compiler's use()-argument memoization
	// eliminates). Without this, a fresh promise per replay re-suspends
	// forever. Normal renders (updates with genuinely new promises) take the
	// replacement path below unchanged.
	if (stored !== undefined && RESUME_REPLAY) {
		warnUncachedUsePromise(block);
		if (stored.status === 'fulfilled') return stored.value as T;
		if (stored.status === 'rejected') throw stored.reason;
		throw new SuspenseException(stored);
	}

	// New thenable at this slot — tag status if untracked, attach listeners.
	state[idx] = thenable;
	trackThenable(thenable);
	if (thenable.status === 'fulfilled') return thenable.value as T;
	if (thenable.status === 'rejected') throw thenable.reason;
	// Waterfall diagnostic: a replay reached a use() slot this body had never
	// executed before (earlier slots have history, this one doesn't) and it is
	// pending — a sequential dependency the parallel-start transform could not
	// hoist. Informational, dev-compiled output only.
	if (RESUME_REPLAY && idx > 0 && state[idx - 1] !== undefined) warnUseWaterfall(block, idx);
	throw new SuspenseException(thenable);
}

// Tag a thenable's `status`/`value`/`reason` expandos and attach the settle
// listeners exactly once (a thenable that already carries a status — React 19
// cache() shape, or one we tagged earlier — is left untouched).
function trackThenable(thenable: TrackedThenable<any>): void {
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
// (docs/suspense-parallel-use-plan.md; emitted by the compiler's parallelUse
// pipeline as _$useBatch / _$warmMemo / _$warmChild.)
// ---------------------------------------------------------------------------

/**
 * True while commitResume replays a try body after a resolution. Gates the
 * fresh-thenable reuse leniency and the waterfall diagnostic in useThenable —
 * both are replay-only semantics; ordinary updates must keep replacing.
 */
let RESUME_REPLAY = false;

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
			'component, cache it, or enable the compiler`s parallelUse transform ' +
			'(which memoizes use() arguments per call site).',
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
			'use() (the parallelUse compiler transform does this automatically for ' +
			'independent arguments).',
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
 * `warm` is the compiler-built fetch-tree thunk: invoked only on the throwing
 * path (a resolved batch costs nothing), it prefetches provably-independent
 * descendant fetches via warmChild/warmMemo so the whole tree loads in
 * max(depth-of-true-dependencies) rounds instead of one round per component.
 */
export function useBatch(items: any[], warm?: () => void): void {
	// Hydrating: every use() adopts a server seed synchronously — nothing to
	// batch, and warming would duplicate fetches the server already resolved.
	if (hydrating && hydrationSeeds !== null) return;
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
		if (it.status === 'pending') (pending ??= []).push(it);
	}
	if (pending === null) return;
	if (warm !== undefined) runWarm(warm);
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

// ── Fetch-tree warming ──────────────────────────────────────────────────────
//
// A warm cache is a per-block Map<slot, Array<{deps, value}>> populated by
// warmMemo during a suspended body's warm walk and consumed by useMemo when
// the real descendant mounts (adoption = transfer, so entries don't outlive
// their one use). The cache lives on the block that ran the batch — every
// descendant mounts inside it, so adoption walks parentBlock links. Orphans
// (warmed but never adopted, e.g. a guard flipped) are bounded by the
// per-slot FIFO cap and die with the block.

interface WarmEntry {
	deps: any[];
	value: any;
}
let CURRENT_WARM: Map<symbol, WarmEntry[]> | null = null;
/** Flips true forever on first warm — gates useMemo's ancestor walk so apps
 * that never warm never pay for it. */
let WARM_EVER = false;
let WARM_DEPTH = 0;
const WARM_DEPTH_CAP = 64;
const WARM_SLOT_CAP = 64;
const WARM_MISS = Symbol('octane.warm.miss');

function runWarm(fn: () => void): void {
	// Reuse the nearest ancestor's cache when one exists: a descendant that
	// suspends mid-cascade re-warms its own subtree, and its entries must
	// dedup against what the ancestor's walk already started (one cache per
	// warming subtree, not per suspending block).
	let cache: Map<symbol, WarmEntry[]> | undefined;
	for (let b: Block | null = CURRENT_BLOCK; b !== null; b = b.parentBlock) {
		cache = (b as any).__warmCache;
		if (cache !== undefined) break;
	}
	if (cache === undefined) {
		cache = new Map();
		(CURRENT_BLOCK! as any).__warmCache = cache;
	}
	WARM_EVER = true;
	const prev = CURRENT_WARM;
	CURRENT_WARM = cache;
	try {
		fn();
	} catch {
		// Warming is speculative — it must never break the render that
		// triggered it. A throwing warm plan just means fewer prefetches.
	} finally {
		CURRENT_WARM = prev;
	}
}

/**
 * Start (and cache) one prefetched creation. Dedups on (slot, deps) so
 * re-warming during a second attempt never double-starts a fetch. The value
 * is status-tagged immediately so the real use() unwrap reads it directly.
 */
export function warmMemo(compute: () => any, deps: any[], slot: symbol): void {
	const cache = CURRENT_WARM;
	if (cache === null) return;
	let list = cache.get(slot);
	if (list !== undefined) {
		for (let i = 0; i < list.length; i++) {
			if (!depsChanged(list[i].deps, deps)) return; // already warmed
		}
	}
	let value: any;
	try {
		value = compute();
	} catch {
		return; // speculative — a throwing creation is simply not warmed
	}
	if (value != null && typeof value.then === 'function') trackThenable(value);
	if (list === undefined) {
		list = [];
		cache.set(slot, list);
	}
	list.push({ deps, value });
	if (list.length > WARM_SLOT_CAP) list.shift();
}

/**
 * Recurse the warm walk into a child component's compiled fetch plan
 * (`Comp.__warm`, emitted by the compiler when the child's reachability and
 * props are provably independent of suspended values). No-ops for components
 * without a plan. Depth-capped as a backstop for recursion the compiler
 * cannot prove finite.
 */
export function warmChild(comp: any, props: any): void {
	if (CURRENT_WARM === null || comp == null) return;
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

/** Adoption lookup for useMemo: nearest ancestor warm cache entry for this
 * slot with matching deps. Transfer semantics — the entry is removed. */
function adoptWarmValue(slot: symbol, deps: any[]): any {
	let b: Block | null = CURRENT_BLOCK;
	while (b !== null) {
		const cache: Map<symbol, WarmEntry[]> | undefined = (b as any).__warmCache;
		if (cache !== undefined) {
			const list = cache.get(slot);
			if (list !== undefined) {
				for (let i = 0; i < list.length; i++) {
					if (!depsChanged(list[i].deps, deps)) {
						const value = list[i].value;
						list.splice(i, 1);
						return value;
					}
				}
			}
		}
		b = b.parentBlock;
	}
	return WARM_MISS;
}

// ---------------------------------------------------------------------------
// lazy — React's code-splitting component wrapper.
// ---------------------------------------------------------------------------

/**
 * Resolve a lazy module payload to its component. Accepts React's canonical
 * `{ default: Component }` (a dynamic `import()` namespace) and — as a
 * pragmatic extension — a bare component function, so `lazy(() =>
 * import('./x').then((m) => m.Named))` works without a `{ default }` shim.
 */
function resolveLazyModule(mod: any): ComponentBody<any> {
	const comp = mod != null && mod.default !== undefined ? mod.default : mod;
	if (typeof comp !== 'function') {
		throw new Error(
			'lazy: expected the load() promise to resolve to a component function or a ' +
				"module with a component as its default export, got '" +
				typeof comp +
				"'",
		);
	}
	return comp as ComponentBody<any>;
}

/**
 * React's `lazy(load)` — code-splitting. Returns a component; the first time it
 * renders it calls `load()` (once, cached on the payload for every mount of this
 * lazy component) and SUSPENDS on the returned promise, exactly like a body that
 * opens with `use(loadPromise)`: the nearest `@try`/`<Suspense>` shows its
 * pending arm and retries when the module settles. Once fulfilled it tail-calls
 * the loaded component with the same `(props, scope, extra)`, so hooks, context,
 * children, and return-based bodies all behave as if the component were imported
 * statically. A rejected load throws the rejection reason on retry, routing to
 * the nearest `@catch` (React parity).
 *
 * The wrapper's identity is stable, so `componentSlot`'s `comp !==
 * state.currentComp` check never spuriously remounts, and `memo(lazy(...))`
 * composes (memoWrapper tail-calls this wrapper). The wrapper carries no
 * `$$singleRoot` flag — a value-position lazy mounts through childSlot's
 * marked path, which is correct for any root shape the loaded module may have.
 */
export function lazy<C extends ComponentBody<any>>(load: () => PromiseLike<{ default: C } | C>): C {
	let status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected' = 'uninitialized';
	let result: any = null; // fulfilled → component; rejected → the reason
	let thenable: TrackedThenable<any> | null = null;
	const lazyWrapper = (props: any, scope: Scope, extra: any): unknown => {
		if (status === 'fulfilled') return (result as ComponentBody<any>)(props, scope, extra);
		if (status === 'rejected') throw result;
		if (status === 'uninitialized') {
			status = 'pending';
			const p = load();
			thenable = p as TrackedThenable<any>;
			p.then(
				(mod: any) => {
					// This handler was attached FIRST, so by the time the boundary's retry
					// listener fires the payload is already fulfilled/rejected and the
					// re-render takes the synchronous branch above.
					try {
						result = resolveLazyModule(mod);
						status = 'fulfilled';
					} catch (err) {
						result = err;
						status = 'rejected';
					}
				},
				(err: any) => {
					result = err;
					status = 'rejected';
				},
			);
		}
		throw new SuspenseException(thenable!);
	};
	return lazyWrapper as unknown as C;
}

// Monotonic counter — produces stable cross-render IDs.
let _idCounter = 0;
export function useId(slot?: symbol): string {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useId');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { id: string } | undefined;
	if (s === undefined) {
		s = { id: ':in-' + (_idCounter++).toString(36) + ':' };
		ensureHooks(scope).set(slot, s);
	}
	return s.id;
}

// ---------------------------------------------------------------------------
// Templates: parse-once HTML → clone-per-instance
// ---------------------------------------------------------------------------

// Namespace flag: 0 = HTML, 1 = SVG, 2 = MathML. The compiler picks the
// constant; we never look at namespaceURI at runtime.
export function template(html: string, ns: number = 0, frag: number = 0): Element {
	const t = document.createElement('template');
	if (ns === 0) {
		t.innerHTML = html;
		const root = t.content.firstChild as Element;
		// Multi-root HTML templates arrive wrapped in a synthetic <octane-frag>. The
		// wrapper never exists in the server DOM (the roots render bare), so stamp it
		// for clone() to SKIP the structural hydration check — there is no 1:1 server
		// node to compare the wrapper against.
		if (root.nodeType === 1 && root.localName === 'octane-frag') {
			(root as any).__oct_frag = true;
		}
		return root;
	}
	// Wrap in <svg>/<math> so the HTML5 parser places descendants in the right
	// foreign-content namespace (Svelte/Ripple's trick — also works around
	// happy-dom which doesn't enter MathML foreign-content mode from a bare
	// <math> root). For multi-root templates (frag=1) return the wrapper itself
	// so the caller can drain its children — stamped like <octane-frag> above,
	// since the synthetic wrapper has no server counterpart either.
	const wrap = ns === 1 ? 'svg' : 'math';
	t.innerHTML = `<${wrap}>${html}</${wrap}>`;
	const wrapEl = t.content.firstChild as Element;
	if (frag) {
		(wrapEl as any).__oct_frag = true;
		return wrapEl;
	}
	return wrapEl.firstChild as Element;
}

// ---------------------------------------------------------------------------
// Hydration (SSR Phase 2). When `hydrating`, the compiled mount path ADOPTS the
// server-rendered DOM instead of cloning a fresh template: `clone()` returns the
// adopted server root, and `htext()` adopts the existing server text node rather
// than creating one. Element/attribute/event/ref bindings are unchanged — their
// template paths (`_root.firstChild.nextSibling…`) already align with the server
// DOM, because text lives INSIDE elements and so doesn't shift element siblings.
//
// Dead-code-elimination contract (mirrors Ripple/Svelte): `hydrating` is set
// `true` ONLY inside the `hydrateRoot()` entry. An app that never imports `hydrateRoot`
// lets the bundler tree-shake it, after which `hydrating` is provably always
// `false`, so it constant-folds and EVERY `if (hydrating)` branch below (in the
// hot-path clone/htext) is dropped — client-only builds pay zero hydration cost.
// Do NOT assign `hydrating = true` anywhere except `hydrateRoot()`, or this breaks.
// ---------------------------------------------------------------------------
let hydrating = false;
// The HYDRATION CURSOR (ported from Ripple's `hydrate_node`). While hydrating,
// this points at the server-rendered node the next adopt operation should claim.
// `clone()` adopts the cursor as a template root; the compiler-emitted cursor
// walk (`child`/`sibling` — used only for templates that contain control-flow /
// component holes, whose server DOM no longer matches the raw template paths)
// advances it node-by-node; block functions (forBlock/ifBlock/componentSlot/…)
// adopt the server `<!--[-->`/`<!--]-->` markers off it. For hole-free leaf
// templates the cursor is just the adopted root and the old raw path-walk
// (`_root.firstChild.nextSibling…`) still resolves bindings correctly.
let hydrateNode: Node | null = null;
// Server-resolved `use(thenable)` values (SSR Phase 4), parsed from the inline
// `<script data-octane-suspense>` in `hydrateRoot()` and consumed in render
// order by `useThenable` so a hydrating boundary returns synchronously. Both are
// touched ONLY under `if (hydrating)` and assigned ONLY in `hydrateRoot()`, so they
// constant-fold away with the rest of the hydration path in client-only builds.
let hydrationSeeds: unknown[] | null = null;
let hydrationSeedCursor = 0;

/**
 * Parse a seed-JSON payload (the shell's `data-octane-suspense` script or a
 * streamed boundary's `window.$OCTS[id]` stash). The reviver decodes the
 * server's `undefined` sentinel back to `undefined` (JSON has no `undefined`),
 * so a `use(thenable)` that resolved to `undefined` seeds as `undefined`, not
 * `null`. Returns null on malformed input (the caller re-suspends client-side).
 */
function parseSeedJson(raw: string): unknown[] | null {
	try {
		return JSON.parse(raw, (_key, value) =>
			value !== null && typeof value === 'object' && value[UNDEFINED_SENTINEL_KEY] === true
				? undefined
				: value,
		);
	} catch {
		return null;
	}
}

export function clone<T extends Node>(node: T, loc?: string): T {
	if (hydrating && hydrateNode !== null) {
		// STRUCTURAL CHECK: the server node at the cursor must match this template root's
		// shape (a swapped @if/@switch branch or a changed tag breaks this). On a mismatch,
		// REBUILD the subtree on the client — discard the divergent server node/range, fall
		// back to a fresh clone (whose markerless template routes nested slots to client
		// mount), and advance the cursor past the discarded range so siblings stay aligned.
		// The detection + rebuild run in dev AND prod (matching the other recovery sites);
		// `loc` is emitted only in dev, so warnHydrationStructuralMismatch's loc gate makes
		// the warning dev-only. Skipped for a synthetic multi-root wrapper (`__oct_frag`,
		// stamped by template()): the wrapper has no 1:1 server node to compare against.
		if (!(node as any).__oct_frag && !hydrationNodeMatches(hydrateNode, node)) {
			if (loc)
				warnHydrationStructuralMismatch(
					loc,
					describeHydrationNode(node),
					describeHydrationNode(hydrateNode),
				);
			const stale = hydrateNode;
			if (stale.nodeType === 8 && (stale as Comment).data === HYDRATION_END) {
				// The server rendered NOTHING at this slot (the cursor sits on the ENCLOSING
				// block's close marker — e.g. a client-only `@if` branch the server left empty).
				// Build fresh but consume nothing: don't remove the close marker (it delimits the
				// parent range) and don't advance, so the enclosing block finishes correctly.
				return node.cloneNode(true) as T;
			}
			if (isBlockOpen(stale)) {
				const close = matchingClose(stale);
				hydrateNode = close.nextSibling;
				removeHydrationRange(stale, close);
			} else {
				hydrateNode = stale.nextSibling;
				(stale as ChildNode).remove();
			}
			return node.cloneNode(true) as T;
		}
		// Multi-root template: the synthetic <octane-frag> wrapper has NO server
		// counterpart — the roots render BARE at the cursor level. Adopting the
		// cursor node itself would make the walk descend INTO the first root (and
		// the mount's drain would rip that root's children out). Instead return a
		// VIRTUAL wrapper whose `firstChild` is the cursor node, so both the raw
		// path walk (`_root.firstChild…`) and the hole-aware walk (`child(_root)`)
		// resolve to the server's first root — one level up, exactly where the
		// template wrapper's children sit. drainFrag() recognizes the marker and
		// skips the drain (the server content is already in place).
		if ((node as any).__oct_frag) {
			return { __oct_vfrag: true, firstChild: hydrateNode } as unknown as T;
		}
		// Adopt the server node at the cursor as this template's root. The cursor
		// stays put so a hole-template's subsequent child()/sibling() walk descends
		// into it; for a hole-free leaf the raw path-walk takes over from here.
		return hydrateNode as unknown as T;
	}
	return node.cloneNode(true) as T;
}

/**
 * Compiler-emitted for a multi-root template's mount: drain the cloned
 * <octane-frag> wrapper's children into the live parent. While hydrating, the
 * "wrapper" is clone()'s virtual stand-in for server content that is ALREADY
 * in place — nothing to move.
 */
export function drainFrag(root: Node, parent: Node, anchor: Node | null): void {
	if (hydrating && (root as any).__oct_vfrag === true) return;
	while (root.firstChild) parent.insertBefore(root.firstChild, anchor);
}

/**
 * Binding-bag arity factories (`bag0`…`bag16`, spill `bagOf`) — the compiled
 * mount path's SINGLE allocation+insert+commit call. Each body's mount fills
 * locals, then calls `_$bagN(__s, root, v0, v1, …)`; the factory builds
 * `{ a: v0, b: v1, … }` as one literal (final hidden class + real field values
 * at allocation — no per-field map transitions, and every bag of arity N
 * shares ONE hot allocation site), inserts `root` before the block's end
 * marker (`null` root = a multi-root body whose drainFrag already placed the
 * content), and commits `scope.slots[0]` LAST — a throw anywhere in the mount
 * path (a suspending `use()`, a child render throwing) happens BEFORE this
 * call, so the bag stays undefined and the next attempt re-mounts. Field names
 * are single characters because a minifier can never shorten object property
 * names — this is the compiled-output size contract with the compiler
 * (compile.js makeBag). Bodies with more than 16 fields pass one inline
 * literal (still real values, 1-char keys) through `bagOf`.
 */
function commitBag<T>(scope: Scope, root: Node | null, bag: T): T {
	if (root !== null) {
		const block = scope.block;
		block.parentNode.insertBefore(root, block.endMarker);
	}
	scope.slots[0] = bag;
	return bag;
}
/* prettier-ignore */ export function bag0(s: Scope, r: Node | null): any { return commitBag(s, r, {}); }
/* prettier-ignore */ export function bag1(s: Scope, r: Node | null, a: any): any { return commitBag(s, r, { a }); }
/* prettier-ignore */ export function bag2(s: Scope, r: Node | null, a: any, b: any): any { return commitBag(s, r, { a, b }); }
/* prettier-ignore */ export function bag3(s: Scope, r: Node | null, a: any, b: any, c: any): any { return commitBag(s, r, { a, b, c }); }
/* prettier-ignore */ export function bag4(s: Scope, r: Node | null, a: any, b: any, c: any, d: any): any { return commitBag(s, r, { a, b, c, d }); }
/* prettier-ignore */ export function bag5(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any): any { return commitBag(s, r, { a, b, c, d, e }); }
/* prettier-ignore */ export function bag6(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any): any { return commitBag(s, r, { a, b, c, d, e, f }); }
/* prettier-ignore */ export function bag7(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any): any { return commitBag(s, r, { a, b, c, d, e, f, g }); }
/* prettier-ignore */ export function bag8(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h }); }
/* prettier-ignore */ export function bag9(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i }); }
/* prettier-ignore */ export function bag10(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j }); }
/* prettier-ignore */ export function bag11(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k }); }
/* prettier-ignore */ export function bag12(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l }); }
/* prettier-ignore */ export function bag13(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m }); }
/* prettier-ignore */ export function bag14(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n }); }
/* prettier-ignore */ export function bag15(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any, o: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o }); }
/* prettier-ignore */ export function bag16(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any, o: any, p: any): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p }); }
/* prettier-ignore */ export function bagOf(s: Scope, r: Node | null, bag: any): any { return commitBag(s, r, bag); }

/**
 * Text-binding coercion, shared by htext / htextSwap / setText: null/undefined/
 * false render as '' and everything else stringifies (string fast path first —
 * `{x as string}` holes are overwhelmingly already strings). NOTE this is NOT
 * coerceChildText: a text *binding* renders `true` as "true", while a child
 * *slot* renders `true` as empty (React parity for renderable children).
 */
function coerceText(value: unknown): string {
	return value == null || value === false ? '' : typeof value === 'string' ? value : String(value);
}

/**
 * The HTML parser normalizes `\r` / `\r\n` in source markup to `\n`, so an
 * adopted server text node differing from the client value ONLY by that
 * normalization is NOT a real hydration mismatch (React parity) — adopt the
 * server node silently, no warn, no patch. Cheap gate: values without a CR
 * can't be a normalization artifact.
 */
function isCRLFNormalizedMatch(server: string | null, client: string): boolean {
	return (
		server !== null && client.indexOf('\r') !== -1 && server === client.replace(/\r\n?/g, '\n')
	);
}

/**
 * Compiler-emitted for a single-text-child binding's mount. Normally creates the
 * text node and appends it; while hydrating, ADOPTS the element's existing
 * (server-rendered) text node so the DOM isn't rebuilt. The prev-value the
 * compiler seeds alongside this makes the first update a no-op when the client
 * value matches the server text (avoiding a mismatch re-render).
 */
export function htext(el: Node, value: unknown): Text {
	// Coerce here (mirrors setText) rather than at every call site — keeps the
	// per-text-hole mount codegen to a bare `htext(el, _v)`. Mount-once, so folding
	// the coercion in costs nothing on the hot update path.
	const text = coerceText(value);
	if (hydrating) {
		const first = el.firstChild;
		if (first !== null && first.nodeType === 3) {
			// Adopt the server text node. On a VALUE mismatch, patch to the client value
			// (React-recoverable) unless the element opted out — then keep the server
			// value. Parser CR/CRLF→LF normalization is not a mismatch (React parity).
			const server = (first as Text).nodeValue;
			if (server !== text && !isCRLFNormalizedMatch(server, text) && !isHydrationSuppressed(el)) {
				warnHydrationValueMismatch((el as any).__oct_loc, 'text', server, text);
				(first as Text).nodeValue = text;
			}
			return first as Text;
		}
		// Server rendered an empty hole (value was ''/null) — create + adopt.
	}
	const t = document.createTextNode(text);
	el.appendChild(t);
	return t;
}

/**
 * Compiler-emitted mount for a `{x as string}` text hole that sits AMONG sibling
 * nodes (the `<!>` placeholder lives at a resolved position, `posNode`).
 *
 * `posNode` is resolved with the hole-aware `child`/`sibling` walk, so during
 * hydration it is the SERVER's text node at that logical position (the server
 * rendered the value directly, with no `<!>`), even when earlier siblings are
 * components / control-flow that expanded into `<!--[-->…<!--]-->` ranges. We
 * ADOPT it. While NOT hydrating, `posNode` is the cloned template's `<!>`
 * comment, which we replace 1-for-1 with a text node (position-preserving, so
 * later sibling walks are unaffected). This is the sibling-position analog of
 * `htext` (which handles the only-child fast path).
 */
export function htextSwap(posNode: Node | null, value: unknown): Text {
	// Coerce here (see htext) so the call site stays a bare `htextSwap(pos, _v)`.
	const text = coerceText(value);
	if (hydrating) {
		if (posNode !== null && posNode.nodeType === 3) {
			// Adopt the server text node. On a VALUE mismatch, patch to the client value
			// unless the owning element opted out (then keep the server value, React-
			// style). Parser CR/CRLF→LF normalization is not a mismatch (React parity).
			const server = (posNode as Text).nodeValue;
			if (server !== text && !isCRLFNormalizedMatch(server, text)) {
				const host = posNode.parentNode;
				if (!isHydrationSuppressed(host)) {
					warnHydrationValueMismatch(host && (host as any).__oct_loc, 'text', server, text);
					(posNode as Text).nodeValue = text;
				}
			}
			return posNode as Text;
		}
		// Server emitted no text node here (empty value, or it merged with an
		// adjacent static text run): insert a fresh node before the next logical
		// node without removing it.
		const t = document.createTextNode(text);
		if (posNode !== null && posNode.parentNode !== null) {
			posNode.parentNode.insertBefore(t, posNode);
		}
		return t;
	}
	// Fresh mount: posNode is the `<!>` placeholder — replace it in place.
	const t = document.createTextNode(text);
	const parent = posNode!.parentNode!;
	parent.insertBefore(t, posNode);
	parent.removeChild(posNode!);
	return t;
}

// ---------------------------------------------------------------------------
// Hydration navigation helpers. The compiler emits `child`/`sibling` instead of
// raw `.firstChild`/`.nextSibling` ONLY for templates containing control-flow /
// component holes — there the server DOM expands each hole into a
// `<!--[-->…<!--]-->` range, so a raw sibling walk would land on the wrong node.
// `child`/`sibling` are PURE navigators (they don't move the cursor): they treat
// a whole `<!--[-->…<!--]-->` block as ONE logical sibling, which exactly matches
// the single `<!>` placeholder the template uses for that hole — so octane's
// existing path+childIndex binding resolution keeps working unchanged on the
// server DOM. The `hydrateNode` cursor is set by each block call (forBlock /
// ifBlock / componentSlot, to its content start) for the child's `clone()` to
// adopt. When `hydrating` is false these are trivial DOM reads and the whole
// hydration path DCE-folds away for client-only builds.
// ---------------------------------------------------------------------------

/** True if `node` is a server block-open marker `<!--[-->`. */
function isBlockOpen(node: Node | null): node is Comment {
	return node !== null && node.nodeType === 8 && (node as Comment).data === HYDRATION_START;
}

/**
 * True if `node` is a server text-hole separator `<!-- -->` — emitted between
 * two adjacent text nodes when at least one is a dynamic text hole, so the
 * parser can't merge them into one node (see HYDRATION_TEXT_SEP, constants.ts).
 */
function isTextSeparator(node: Node | null): node is Comment {
	return node !== null && node.nodeType === 8 && (node as Comment).data === HYDRATION_TEXT_SEP;
}

/**
 * Resolve the server `<!--[-->` a control-flow slot (try / if / for / switch /
 * component) should ADOPT during hydration.
 *
 * Two shapes reach here:
 *  - `anchor` IS the open marker — the slot sat at a `<!>` placeholder among
 *    siblings, so the compiler passes the open directly. Return it.
 *  - `anchor` is null or a NON-open marker — the slot is the SOLE hole of its
 *    enclosing scope (an appended-only child, or the only thing a control-flow
 *    arm / component's children render), so its anchor is that scope's END
 *    marker. In that case mountTry/ifBlock/renderBlock parked the cursor
 *    (`hydrateNode`) on the slot's own `<!--[-->`. Adopt from the parked cursor
 *    (falling back to `domParent.firstChild` for the first appended child, whose
 *    cursor still sits after the just-cloned empty host).
 *
 * Returns the open marker to adopt, or null when there's nothing to adopt (a
 * genuine fresh client mount, e.g. the server rendered the slot empty).
 */
function resolveHydrationOpen(anchor: Node | null | undefined, domParent: Node): Comment | null {
	if (!hydrating) return null;
	if (isBlockOpen(anchor ?? null)) return anchor as Comment;
	let c: Node | null = hydrateNode;
	if (c === null || c.parentNode !== domParent) c = domParent.firstChild;
	return c !== null && isBlockOpen(c) ? (c as Comment) : null;
}

/** From a block-open `<!--[-->`, the matching `<!--]-->` (depth-tracked). */
function matchingClose(open: Node): Comment {
	let depth = 0;
	let node: Node = open.nextSibling as Node;
	for (;;) {
		if (node.nodeType === 8) {
			const data = (node as Comment).data;
			if (data === HYDRATION_END) {
				if (depth === 0) return node as Comment;
				depth -= 1;
			} else if (data === HYDRATION_START) {
				depth += 1;
			}
		}
		node = node.nextSibling as Node;
	}
}

/** Logical index-0 child: `node.firstChild` for both client and hydration. */
export function child<T extends Node>(node: T): Node | null {
	return node.firstChild;
}

/**
 * The n-th logical sibling after `node`. Client: plain `.nextSibling` × n.
 * Hydrating: a `<!--[-->…<!--]-->` block counts as ONE step (we jump past its
 * range), so an element/hole after a block resolves to the right server node.
 */
export function sibling(node: Node, n: number = 1): Node | null {
	let c: Node | null = node;
	for (let i = 0; i < n; i++) {
		// Over-walk (cursor already past the last node) → return null, don't throw.
		if (c === null) return null;
		if (hydrating) {
			if (isBlockOpen(c)) c = matchingClose(c);
			if (isTextSeparator(c)) {
				// Standing on an empty text hole's stand-in separator — the next
				// logical item starts immediately after it.
				c = c.nextSibling;
				continue;
			}
			c = c.nextSibling;
			if (isTextSeparator(c)) {
				// Crossed the `<!-- -->` delimiter between two adjacent text holes.
				// The next item is the following text node when the server rendered
				// one; a following separator means the next hole is EMPTY and that
				// separator is its stand-in. Anything else (element / end of scope):
				// the crossed separator itself stands in for the empty hole —
				// htextSwap inserts before it, which is order-correct.
				const after: Node | null = c.nextSibling;
				if (after !== null && (after.nodeType === 3 || isTextSeparator(after))) c = after;
			}
			continue;
		}
		c = c.nextSibling;
	}
	return c;
}

// ---------------------------------------------------------------------------
// Patch helpers — `prev !== next` guards are emitted by the compiler/author;
// these helpers are unconditional "set this now" with internal data check.
// ---------------------------------------------------------------------------

export function setText(node: Text, value: any): void {
	// Unconditional write: the compiler's only emission site guards every call
	// with `if (_b._prev$ !== _v)`, and `_prev` mirrors the node's current text
	// (seeded at mount, updated on each write), so the node's text always equals
	// `_prev` — an internal recheck is provably always true. Skipping it avoids a
	// text-getter read, which materializes a fresh JS string from the DOM on every
	// call (a measurable cost + GC pressure on text-heavy updates).
	//
	// Write via `nodeValue` (a `Node`-level accessor) rather than `data` (which
	// lives on `CharacterData` one prototype hop deeper) — it's measurably faster
	// for the hot text-update path.
	node.nodeValue = coerceText(value);
}

// Apply a ref attachment. Accepts the three supported shapes:
//   - function: called with the element (or null on detach)
//   - object  : `.current` is set to the element (or null on detach)
//   - array   : each item is attached recursively. Lets multiple owners
//               observe the same node without the parent juggling refs.
//               Matches React's `ref={[a, b]}` convention.
// Called by the compiler-emitted ref binding mount + update paths and
// by the scope cleanup hook installed at mount time.
// React 19 callback-ref cleanup. A callback ref may RETURN a cleanup function; when it
// does, that cleanup runs on detach INSTEAD of calling the ref with null. React keeps
// the cleanup per ATTACH SITE, so the SAME callback ref attached to several elements
// (`ref={registerItem}` on every list row) holds one independent cleanup per element.
// We mirror that by keying cleanups per (ref, target): an outer WeakMap by the ref
// function, an inner WeakMap by the attached element/FragmentInstance. Detach sites
// pass the previously-attached target — `attachRef(ref, null, target)` — so the RIGHT
// cleanup runs (and only that one is forgotten). A targetless detach falls back to the
// most recent cleanup-producing attach, matching the old single-slot behavior for
// external callers that attach a ref once. Legacy callback refs (that return nothing)
// keep the `ref(null)` detach contract.
const refCleanups = new WeakMap<(el: any) => unknown, WeakMap<object, () => void>>();
const refLastCleanupTarget = new WeakMap<(el: any) => unknown, object>();

export function attachRef(
	ref: any,
	el: Element | FragmentInstance | null,
	prevTarget?: Element | FragmentInstance | null,
): void {
	if (ref == null) return;
	if (typeof ref === 'function') {
		if (el === null) {
			// Detach: prefer the React-19 cleanup the callback returned when it was
			// attached to `prevTarget` (falling back to the latest attach's target).
			const perTarget = refCleanups.get(ref);
			const target = prevTarget ?? refLastCleanupTarget.get(ref);
			const cleanup = perTarget !== undefined && target != null ? perTarget.get(target) : undefined;
			if (cleanup !== undefined) {
				perTarget!.delete(target as object);
				if (refLastCleanupTarget.get(ref) === target) refLastCleanupTarget.delete(ref);
				cleanup();
			} else {
				ref(null);
			}
		} else {
			const cleanup = ref(el);
			if (typeof cleanup === 'function') {
				let perTarget = refCleanups.get(ref);
				if (perTarget === undefined) refCleanups.set(ref, (perTarget = new WeakMap()));
				perTarget.set(el, cleanup as () => void);
				refLastCleanupTarget.set(ref, el);
			}
		}
		return;
	}
	if (Array.isArray(ref)) {
		for (let i = 0; i < ref.length; i++) attachRef(ref[i], el, prevTarget);
		return;
	}
	ref.current = el;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fragment refs (React canary `enableFragmentRefs` parity).
//
// `<Fragment ref={r}>...</Fragment>` populates `r.current` with a
// FragmentInstance that exposes imperative methods over the fragment's
// first-level host children. The compiler intercepts the long-form
// `<Fragment>` JSXElement when it carries a `ref` attribute, emits a
// start/end Comment marker pair around the children in the parent template,
// and binds the markers + ref expression to a `fragmentRef` binding which
// calls `mountFragmentRef` at mount time and registers a cleanup that
// detaches the ref and destroys the instance on unmount.
//
// `Fragment` is exported as a sentinel symbol so user code can write
// `import { Fragment } from 'octane'` for parity with React. The
// compiler matches on the JSX identifier 'Fragment' at the source-name
// level, so the import is currently only for TS validity — but reserving
// the symbol identity now keeps the door open for component-prop-name
// resolution later.
// ─────────────────────────────────────────────────────────────────────────────

export const Fragment: unique symbol = Symbol.for('octane.Fragment');

/**
 * React-19 `<Activity mode="hidden"|"visible">` sentinel. The compiler matches
 * the `Activity` tag by NAME (so this export is only needed so user imports
 * `import { Activity } from 'octane'` resolve); the runtime work happens in
 * `activityBlock`.
 */
export const Activity: unique symbol = Symbol.for('octane.Activity');

export class FragmentInstance {
	/**
	 * Sentinel that React's test suite asserts is truthy as a sanity-check
	 * that the FragmentInstance is bound to its owning Block. Named
	 * `_ownerBlock` (not React's `_fragmentFiber`) because octane uses
	 * Blocks, not fibers — same role.
	 */
	_ownerBlock: Block;
	_startMarker: Comment;
	_endMarker: Comment;
	_destroyed: boolean;
	/**
	 * Registry of listeners added via addEventListener, deduped by
	 * (type, listener, capture). `null` until the first addEventListener — zero
	 * per-instance cost for fragments that never use the listener API. Stored
	 * (not snapshotted onto specific elements) so they can be RE-APPLIED to
	 * children that mount later: `_reapply` (run after every commit) attaches
	 * each stored listener to the current children, matching React's
	 * future-children contract.
	 */
	_listeners: Array<{
		type: string;
		listener: EventListenerOrEventListenerObject;
		options: AddEventListenerOptions | boolean | undefined;
	}> | null;
	/**
	 * Observers registered via observeUsing, re-applied to future children the
	 * same way as `_listeners`. `null` until the first observeUsing.
	 */
	_observers: Set<{ observe(target: Element): void; unobserve(target: Element): void }> | null;
	/**
	 * The ref currently pointed at this instance. Held here (not captured in the
	 * mount closure) so the unmount cleanup detaches whatever ref is current AND
	 * the compiler's update path can re-point a changed `<Fragment ref={…}>`.
	 */
	_currentRef: any;

	constructor(ownerBlock: Block, startMarker: Comment, endMarker: Comment) {
		this._ownerBlock = ownerBlock;
		this._startMarker = startMarker;
		this._endMarker = endMarker;
		this._destroyed = false;
		this._listeners = null;
		this._observers = null;
		this._currentRef = null;
	}

	_destroy(): void {
		this._destroyed = true;
		activeFragments.delete(this);
		// Detach any still-registered listeners from the current children (cleanups
		// run before the DOM range is removed, so the children are still attached)
		// so stale closures don't keep nodes/scopes alive after unmount. Observers
		// are NOT explicitly unobserved — like React, we rely on the browser
		// dropping disconnected nodes; the observer's owner manages its lifecycle.
		if (this._listeners) {
			for (const el of fragmentDirectChildren(this)) {
				for (const e of this._listeners) {
					el.removeEventListener(e.type, e.listener, e.options as any);
				}
			}
			this._listeners = null;
		}
		this._observers = null;
	}

	/** Deregister from the commit re-apply set once no bindings remain. */
	_maybeDeactivate(): void {
		if (
			(this._listeners === null || this._listeners.length === 0) &&
			(this._observers === null || this._observers.size === 0)
		) {
			activeFragments.delete(this);
		}
	}

	/**
	 * Re-apply every stored listener + observer to the CURRENT direct children.
	 * Run after each commit (reapplyFragmentBindings) so children that mounted
	 * since the last pass pick up the fragment's bindings. addEventListener and
	 * observer.observe are idempotent for an already-wired (element, binding)
	 * pair, so re-applying is safe.
	 */
	_reapply(): void {
		if (this._destroyed) return;
		for (const el of fragmentDirectChildren(this)) {
			if (this._listeners) {
				for (const e of this._listeners) el.addEventListener(e.type, e.listener, e.options as any);
			}
			if (this._observers) {
				for (const ob of this._observers) ob.observe(el);
			}
		}
	}

	// ─── focus / focusLast / blur (Stage 2) ─────────────────────────────
	/**
	 * Focus the first focusable element inside the fragment, in tree order.
	 * Mirrors React FragmentInstance.focus: matches `<input>`, `<button>`,
	 * `<select>`, `<textarea>`, `<a href>`, `[contenteditable="true"]`, and
	 * anything with an explicit tabIndex >= 0. Skips disabled/hidden and
	 * tabIndex=-1 elements. No-op if the fragment has no focusable descendants.
	 */
	focus(options?: FocusOptions): void {
		if (this._destroyed) return;
		for (const el of fragmentDescendants(this)) {
			if (isFocusable(el)) {
				(el as HTMLElement).focus(options);
				return;
			}
		}
	}

	/**
	 * Focus the LAST focusable element inside the fragment, in tree order.
	 * Same focusability rules as `focus()`.
	 */
	focusLast(options?: FocusOptions): void {
		if (this._destroyed) return;
		let last: Element | null = null;
		for (const el of fragmentDescendants(this)) {
			if (isFocusable(el)) last = el;
		}
		if (last) (last as HTMLElement).focus(options);
	}

	/**
	 * Blur the currently-focused element if it's inside the fragment range.
	 * No-op if focus is outside the fragment (matches React's "owned" scope —
	 * we don't blur arbitrary other elements just because they happen to be
	 * active when blur() is called).
	 */
	blur(): void {
		if (this._destroyed) return;
		const doc = this._startMarker.ownerDocument || document;
		const active = doc.activeElement;
		if (!active || active === doc.body) return;
		if (isInsideFragment(this, active)) {
			(active as HTMLElement).blur();
		}
	}

	// ─── addEventListener / removeEventListener (Stage 3) ───────────────
	/**
	 * Attaches a listener to every DIRECT (host-Element) child of the fragment.
	 * The (type, listener, capture) tuple is stored and RE-APPLIED after each
	 * commit, so children inserted into the fragment LATER also get the listener
	 * — React's future-children contract. Deduped by (type, listener, capture)
	 * like the DOM, so repeat calls are no-ops.
	 */
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: AddEventListenerOptions | boolean,
	): void {
		if (this._destroyed) return;
		const capture = listenerCapturePhase(options);
		if (!this._listeners) this._listeners = [];
		for (const e of this._listeners) {
			if (
				e.type === type &&
				e.listener === listener &&
				listenerCapturePhase(e.options) === capture
			) {
				return; // already registered — no-op (DOM/React dedupe)
			}
		}
		this._listeners.push({ type, listener, options });
		for (const el of fragmentDirectChildren(this)) {
			el.addEventListener(type, listener, options as any);
		}
		activeFragments.add(this);
	}

	/**
	 * Removes a listener previously added via this FragmentInstance. The
	 * (type, listener, options.capture) tuple must match the add call — the same
	 * identity rule EventTarget.removeEventListener uses. Detaches from the
	 * current children and stops re-applying it to future ones. Unmatched calls
	 * are a silent no-op (DOM parity).
	 */
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: AddEventListenerOptions | boolean,
	): void {
		if (this._destroyed || !this._listeners) return;
		const wantCapture = listenerCapturePhase(options);
		for (let i = this._listeners.length - 1; i >= 0; i--) {
			const entry = this._listeners[i];
			if (entry.type !== type) continue;
			if (entry.listener !== listener) continue;
			if (listenerCapturePhase(entry.options) !== wantCapture) continue;
			for (const el of fragmentDirectChildren(this)) {
				el.removeEventListener(type, listener, entry.options as any);
			}
			this._listeners.splice(i, 1);
			this._maybeDeactivate();
			return;
		}
	}

	// ─── observeUsing / unobserveUsing / getClientRects / getRootNode (Stage 4) ─
	/**
	 * Forwards .observe() on the supplied observer (IntersectionObserver,
	 * ResizeObserver, MutationObserver, or any other with an `observe(target)`
	 * signature) to every direct fragment child. Lets a single fragment ref
	 * stand in for "watch this list of siblings" — react-aria's Virtualizer
	 * and dnd-kit's drop-zone primitives are the canonical clients.
	 */
	observeUsing(observer: {
		observe(target: Element): void;
		unobserve(target: Element): void;
	}): void {
		if (this._destroyed) return;
		if (!this._observers) this._observers = new Set();
		this._observers.add(observer);
		for (const el of fragmentDirectChildren(this)) observer.observe(el);
		activeFragments.add(this);
	}

	/**
	 * Stops observing with the given observer: unobserves the current children
	 * and stops re-applying it to future ones. (The walk runs even without a
	 * preceding observeUsing, matching the DOM's tolerant unobserve.)
	 */
	unobserveUsing(observer: {
		observe(target: Element): void;
		unobserve(target: Element): void;
	}): void {
		if (this._destroyed) return;
		if (this._observers) this._observers.delete(observer);
		for (const el of fragmentDirectChildren(this)) observer.unobserve(el);
		this._maybeDeactivate();
	}

	/**
	 * Concatenates the client rects of every direct fragment child. The
	 * returned array is a flat list of DOMRects in tree order — useful for
	 * tooltip positioning that needs to span multiple sibling elements.
	 * After unmount returns [].
	 */
	getClientRects(): DOMRect[] {
		const out: DOMRect[] = [];
		if (this._destroyed) return out;
		let node: ChildNode | null = this._startMarker.nextSibling;
		while (node && node !== this._endMarker) {
			if (node.nodeType === 1) {
				const rects = (node as Element).getClientRects();
				for (let i = 0; i < rects.length; i++) out.push(rects[i]);
			}
			node = node.nextSibling;
		}
		return out;
	}

	/**
	 * Returns the rootNode of the fragment (its document or shadow root).
	 * Falls back to the start-marker's owner document if the fragment has
	 * no direct children yet — keeps the contract "always returns a Node"
	 * so callers don't need null-checks.
	 */
	getRootNode(): Node {
		if (this._destroyed) return this._startMarker.getRootNode();
		let node: ChildNode | null = this._startMarker.nextSibling;
		while (node && node !== this._endMarker) {
			if (node.nodeType === 1) return (node as Element).getRootNode();
			node = node.nextSibling;
		}
		return this._startMarker.getRootNode();
	}

	// ─── compareDocumentPosition / dispatchEvent (Stage 5) ──────────────
	/**
	 * Compares `other` against the fragment's span. The returned bitmask
	 * uses the same Node constants the platform's compareDocumentPosition
	 * uses, with `CONTAINED_BY` indicating that `other` lives strictly
	 * between the fragment's start and end markers (in document order).
	 *
	 *   - other before the start marker     → DOCUMENT_POSITION_PRECEDING
	 *   - other after the end marker        → DOCUMENT_POSITION_FOLLOWING
	 *   - other between start & end markers → DOCUMENT_POSITION_CONTAINED_BY |
	 *                                          DOCUMENT_POSITION_FOLLOWING
	 *   - other not in the same tree        → DOCUMENT_POSITION_DISCONNECTED
	 */
	compareDocumentPosition(other: Node): number {
		if (this._destroyed) return Node.DOCUMENT_POSITION_DISCONNECTED;
		const startRel = this._startMarker.compareDocumentPosition(other);
		if (startRel & Node.DOCUMENT_POSITION_DISCONNECTED) return startRel;
		const endRel = this._endMarker.compareDocumentPosition(other);
		const followsStart = (startRel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
		const precedesEnd = (endRel & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
		if (followsStart && precedesEnd) {
			return Node.DOCUMENT_POSITION_CONTAINED_BY | Node.DOCUMENT_POSITION_FOLLOWING;
		}
		if (startRel & Node.DOCUMENT_POSITION_PRECEDING) {
			return Node.DOCUMENT_POSITION_PRECEDING;
		}
		return Node.DOCUMENT_POSITION_FOLLOWING;
	}

	/**
	 * Dispatches `event` on the fragment's parent host element so the
	 * event bubbles into the surrounding handler tree the way native
	 * EventTarget.dispatchEvent does. Mirrors React's FragmentInstance:
	 * because the fragment itself has no DOM node, the dispatch target is
	 * the parent (`return.stateNode` in React's fiber model).
	 *
	 * Returns false if the event's default action was cancelled — matches
	 * EventTarget.dispatchEvent's return contract so callers can branch
	 * on preventDefault() like they would on any other DOM dispatch.
	 */
	dispatchEvent(event: Event): boolean {
		if (this._destroyed) return true;
		const parent = this._startMarker.parentNode;
		if (!parent) return true;
		return (parent as unknown as EventTarget).dispatchEvent(event);
	}

	// ─── scrollIntoView (Stage 6) ───────────────────────────────────────
	/**
	 * Scrolls the fragment into view. Picks the first focusable descendant
	 * if one exists (matches what tab-focus would land on), falling back to
	 * the first element child otherwise. Mirrors React's FragmentInstance
	 * choice — for tooltip / anchor-scroll use cases the "natural target"
	 * is usually a focusable element, not an arbitrary wrapper div.
	 */
	scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void {
		if (this._destroyed) return;
		let firstFocusable: Element | null = null;
		let firstAny: Element | null = null;
		for (const el of fragmentDescendants(this)) {
			if (!firstAny) firstAny = el;
			if (isFocusable(el)) {
				firstFocusable = el;
				break;
			}
		}
		const target = firstFocusable || firstAny;
		if (target) (target as HTMLElement).scrollIntoView(arg as any);
	}
}

/**
 * EventTarget.removeEventListener compares on (type, listener, capture-flag).
 * Everything else (once, passive, signal) is "transparent" to identity, so
 * we normalize options down to its capture-flag for the equality test.
 */
function listenerCapturePhase(o: AddEventListenerOptions | boolean | undefined): boolean {
	if (o == null) return false;
	if (typeof o === 'boolean') return o;
	return !!o.capture;
}

/**
 * Walk every Element strictly between the start and end markers of the
 * fragment, in document (tree) order. Uses a TreeWalker rooted at each
 * top-level child between the markers so the iteration is O(n) over the
 * fragment's subtree (not the whole document). Comment / Text nodes are
 * skipped — fragment ref methods only care about Elements.
 */
function* fragmentDescendants(fi: FragmentInstance): Generator<Element> {
	let node: ChildNode | null = fi._startMarker.nextSibling;
	while (node && node !== fi._endMarker) {
		const next = node.nextSibling;
		if (node.nodeType === 1) {
			const top = node as Element;
			yield top;
			// SHOW_ELEMENT (filter 1) keeps us off Text/Comment.
			const walker = (top.ownerDocument || document).createTreeWalker(top, 1);
			let descendant = walker.nextNode() as Element | null;
			while (descendant) {
				yield descendant;
				descendant = walker.nextNode() as Element | null;
			}
		}
		node = next;
	}
}

/**
 * Yield the DIRECT (first-level) Element children between the fragment markers,
 * in document order. This is the membership set for the per-child operations
 * (event listeners, observers) — matching React's first-level traverse — as
 * opposed to fragmentDescendants which deep-walks (used by focus/scrollIntoView).
 */
function* fragmentDirectChildren(fi: FragmentInstance): Generator<Element> {
	let node: ChildNode | null = fi._startMarker.nextSibling;
	while (node && node !== fi._endMarker) {
		const next = node.nextSibling;
		if (node.nodeType === 1) yield node as Element;
		node = next;
	}
}

/**
 * Is `node` strictly between the fragment's start and end markers in
 * document order? Uses compareDocumentPosition so the check works for
 * arbitrary descendants — not just immediate children — and returns false
 * for detached / unrelated nodes (which is what blur containment expects).
 */
function isInsideFragment(fi: FragmentInstance, node: Node): boolean {
	const startRel = fi._startMarker.compareDocumentPosition(node);
	const endRel = fi._endMarker.compareDocumentPosition(node);
	const followsStart = (startRel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
	const precedesEnd = (endRel & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
	return followsStart && precedesEnd;
}

/**
 * Mirrors the focusability check React's FragmentInstance uses:
 *  - inherently-focusable tags: <input>, <select>, <textarea>, <button>
 *    (not disabled), <a> (with href).
 *  - explicit tabIndex >= 0 OR contenteditable="true" on any tag.
 *  - tabIndex === -1 → not in sequential order, NOT picked by focus() /
 *    focusLast(). (Still focusable via .focus() directly — we just skip
 *    them when walking, matching React's behavior.)
 *  - hidden / disabled → never focusable.
 */
function isFocusable(el: Element): boolean {
	if ((el as HTMLElement).hidden === true) return false;
	const tabAttr = el.getAttribute('tabindex');
	const explicitTab = tabAttr === null ? null : parseInt(tabAttr, 10);
	if (explicitTab !== null && explicitTab < 0) return false;
	const tag = el.tagName;
	if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
		return !(el as HTMLInputElement).disabled;
	}
	if (tag === 'A' && el.hasAttribute('href')) return true;
	if (explicitTab !== null && explicitTab >= 0) return true;
	if (el.getAttribute('contenteditable') === 'true') return true;
	return false;
}

/**
 * Compiler-emitted helper. Creates a FragmentInstance bound to the supplied
 * marker pair + owning block, attaches the user's ref, and queues both the
 * detach + the FragmentInstance destruction on the scope's cleanup chain.
 */
export function mountFragmentRef(
	scope: Scope,
	startMarker: Comment,
	endMarker: Comment,
	ref: any,
): FragmentInstance {
	const fi = new FragmentInstance(scope.block, startMarker, endMarker);
	fi._currentRef = ref;
	// Defer the attach to commit (after DOM insertion, before layout effects) so
	// the fragment's markers/children are connected when a callback ref fires —
	// same React-19 timing as element refs. Read `_currentRef` (not the captured
	// `ref`) so a ref the compiler re-points via the update path is honored, and
	// so the detach cleanup always releases whatever ref is current on unmount.
	queueRefAttach(scope, () => attachRef(fi._currentRef, fi));
	scope.cleanups.push(() => {
		// Detach at commit, not inline (queueRefDetach) — unmount cleanups run
		// mid-render, and a state-setter ref firing null synchronously can render
		// before a replacement's attach. The instance is destroyed now; the queued
		// attachRef only nulls/cleans the user's ref, which needs no live instance.
		queueRefDetach(fi._currentRef, fi);
		fi._destroy();
	});
	return fi;
}

// XML namespaces recognised by the HTML5 parser for attribute names —
// matches React's setAttribute routing for parity. When an attribute name
// starts with `xlink:`, `xml:`, or `xmlns:`, we route through setAttributeNS
// so the resulting attribute's namespaceURI matches what the browser parses
// out of a static SVG template. Without this, dynamic `xlink:href={…}` would
// leave attribute.namespaceURI === null while a static `<use xlink:href="…"/>`
// inside the template would have it set to XLINK_NS — a real divergence.
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
// Element namespaces for the de-opt reconciler (the compiled template path uses
// `template(html, ns)` instead). HTML_NS is what document.createElement produces in
// an HTML document, so it's the reuse-check baseline for non-SVG elements.
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// Namespace for a de-opt host tag: `<svg>` always opens SVG; an SVG-ONLY tag
// (`g`, `rect`, `path`, … — SVG_ONLY_TAGS in constants.ts) implies SVG when no
// namespace was inherited (a component root, a value-position descriptor,
// portal children). Ambiguous names (`a`, `title`, `script`, `style`) keep the
// inherited namespace. Mirrors the compiler's nsForSelf so compiled templates
// and de-opt descriptors namespace identically.
function inferTagNs(tag: string, inherited: string | undefined): string | undefined {
	if (tag === 'svg') return SVG_NS;
	if (inherited === undefined && SVG_ONLY_TAGS.has(tag)) return SVG_NS;
	return inherited;
}

function attrNamespace(name: string): string | null {
	// Bare `xmlns` is the xmlns namespace itself (rare in practice).
	if (name === 'xmlns') return XMLNS_NS;
	const colon = name.indexOf(':');
	if (colon <= 0) return null;
	const prefix = name.slice(0, colon);
	if (prefix === 'xlink') return XLINK_NS;
	if (prefix === 'xml') return XML_NS;
	if (prefix === 'xmlns') return XMLNS_NS;
	return null;
}

// HTML void elements (no content model) — mirrors the compiler's VOID_ELEMENTS.
// Read only on setAttribute's cold dangerouslySetInnerHTML arm.
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

export function setAttribute(el: Element, name: string, value: any): void {
	// React-style `dangerouslySetInnerHTML={{__html}}` is a PROPERTY write, not an
	// attribute. The compiler's fast path sets `el.innerHTML` directly, but when the
	// element also carries a spread (`<div {...props} dangerouslySetInnerHTML={x}/>`,
	// or the prop arrives via the spread itself) the binding is routed here — so read
	// `.__html` off the value object and assign the property. A literal
	// `setAttribute('dangerouslySetInnerHTML', …)` would only add a dead attribute.
	if (name === 'dangerouslySetInnerHTML') {
		// React parity: the value must be `{__html: …}` — anything else is a
		// programming error worth failing loudly on (a plain string here usually
		// means the author thought dSIH takes HTML directly).
		if (value != null && (typeof value !== 'object' || !('__html' in value))) {
			throw new Error('`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`');
		}
		// React parity: void elements have no content model — an innerHTML write on
		// `<input>`/`<br>`/… is invisible-content corruption, so fail loudly like
		// React (ReactDOMComponent-test.js:1807). Explicit dSIH on a void tag is
		// already a compile-time error; this arm guards the routes the compiler
		// can't see — spreads and de-opt (createElement) descriptors.
		if (value != null && VOID_ELEMENTS.has(el.localName)) {
			throw new Error(
				`\`${el.localName}\` is a void element tag and must neither have ` +
					'`children` nor use `dangerouslySetInnerHTML`.',
			);
		}
		const html = value == null ? null : value.__html;
		// `__html: false` renders 'false' (React coerces; only null/undefined clear) —
		// keeps this path consistent with the compiled htmlOnlyChild path.
		el.innerHTML = html == null ? '' : String(html);
		return;
	}
	// Never a DOM attribute — a React warning-suppression hint (octane doesn't emit
	// the warning, but the key must not land in the markup either).
	if (name === 'suppressContentEditableWarning') return;
	// Controlled form props (`value`/`checked`/`defaultValue`/`defaultChecked`
	// on <input>/<textarea>/<select>) route to the PROPERTY helpers — this arm
	// covers spreads, de-opt descriptors, and previously-compiled output
	// (compiled `.tsrx` bindings call the helpers directly). Length-bucketed so
	// non-matching names pay one integer switch — cheaper than the
	// ATTRIBUTE_ALIASES Map lookup below. `<option value>` stays a plain
	// attribute (it is what the select projection reads); custom elements never
	// match the localName gate (raw semantics).
	switch (name.length) {
		case 5:
			if (name === 'value') {
				const t = el.localName;
				if (t === 'input' || t === 'textarea') return setValue(el, value);
				if (t === 'select') return setSelectValue(el, value);
			} else if (name === 'muted' && el.localName.indexOf('-') === -1) {
				// mustUseProperty (React parity): the muted ATTRIBUTE doesn't
				// reflect to the live property post-creation — a dynamic write
				// must set the property or a playing element never (un)mutes.
				(el as any).muted = value && typeof value !== 'function' && typeof value !== 'symbol';
				return;
			}
			break;
		case 7:
			if (name === 'checked' && el.localName === 'input') return setChecked(el, value);
			break;
		case 8:
			if ((name === 'multiple' || name === 'selected') && el.localName.indexOf('-') === -1) {
				// mustUseProperty like `muted`. `multiple` reflects back to the
				// attribute; `selected` is live option state (the controlled
				// <select> projection owns it when a select value is armed).
				(el as any)[name] = value && typeof value !== 'function' && typeof value !== 'symbol';
				return;
			}
			break;
		case 9:
			if (name === 'autoFocus' && el.localName.indexOf('-') === -1) {
				// React parity: never an attribute — the element is focused in
				// the commit phase on mount (see setAutoFocus).
				return setAutoFocus(el, value);
			}
			if (
				process.env.NODE_ENV !== 'production' &&
				name === 'autofocus' &&
				(el as any).__oct_loc !== undefined
			) {
				console.error('Invalid DOM property `autofocus`. Did you mean `autoFocus`?');
			}
			break;
		case 12:
			if (name === 'defaultValue') {
				const t = el.localName;
				if (t === 'input' || t === 'textarea' || t === 'select') {
					return setDefaultValue(el, value);
				}
			} else if (
				process.env.NODE_ENV !== 'production' &&
				name === 'defaultvalue' &&
				(el as any).__oct_loc !== undefined
			) {
				console.error('Invalid DOM property `defaultvalue`. Did you mean `defaultValue`?');
			}
			break;
		case 14:
			if (name === 'defaultChecked' && el.localName === 'input') {
				return setDefaultChecked(el, value);
			}
			if (
				process.env.NODE_ENV !== 'production' &&
				name === 'defaultchecked' &&
				(el as any).__oct_loc !== undefined
			) {
				console.error('Invalid DOM property `defaultchecked`. Did you mean `defaultChecked`?');
			}
			break;
	}
	// React 19 custom-element semantics: a FUNCTION-valued `on*` prop on a custom
	// element attaches a real listener for the name after "on", verbatim
	// (`oncustomevent={fn}` → addEventListener('customevent', fn)). This is not
	// synthetic emulation — custom elements dispatch arbitrary events and this is
	// the only declarative way to hear them. Non-function values fall through to
	// plain attribute semantics; identity swaps re-attach; null detaches.
	if (
		name.length > 2 &&
		name.charCodeAt(0) === 111 /* o */ &&
		name.charCodeAt(1) === 110 /* n */ &&
		el.localName.indexOf('-') !== -1 &&
		(typeof value === 'function' || (el as any).$$ceListeners?.[name] !== undefined)
	) {
		const type = name.slice(2);
		const map: Record<string, EventListener> = ((el as any).$$ceListeners ??= {});
		const prev = map[name];
		if (prev !== undefined && prev !== value) el.removeEventListener(type, prev);
		if (typeof value === 'function') {
			if (prev !== value) el.addEventListener(type, value as EventListener);
			map[name] = value as EventListener;
			el.removeAttribute(name); // a listener prop never lands in the markup
			return;
		}
		delete map[name];
		// fall through: non-function value now takes plain attribute semantics
	}
	// React-parity aliases (ATTRIBUTE_ALIASES, constants.ts): `htmlFor` → `for`,
	// `strokeWidth` → `stroke-width`, `xlinkHref` → `xlink:href`, … — the JSX
	// camelCase prop writes the attribute the browser actually understands.
	// Matters beyond cosmetics on SVG hosts: their setAttribute does NOT
	// lowercase, so an unaliased `strokeWidth` would land verbatim and never
	// style the element. Custom elements keep names VERBATIM (raw props, no
	// alias tables) — parity with the server's ssrAttr gate.
	if (el.localName.indexOf('-') === -1) {
		const alias = ATTRIBUTE_ALIASES.get(name);
		if (alias !== undefined) name = alias;
	}
	// Coerce ONCE to the final attribute string (null = absent). The hydration
	// compare below and the write share the result, so the compare can never
	// disagree with what actually lands in the DOM — and the value rules mirror
	// the server's ssrAttr exactly (shared tables in constants.ts), so SSR
	// presence/absence and the client write always agree.
	const next = coerceAttrValue(el, name, value);
	// Hydration VALUE-mismatch handling. The normal write below already PATCHES the adopted
	// element to the client value (so prod recovers for free); here we only (dev) warn on a
	// server/client divergence and (dev+prod) honor `suppressHydrationWarning` by keeping the
	// server attribute. `hydrationMismatchMode` skips the server-attr read entirely when
	// neither applies — so a non-suppressed prod hydration adds no `getAttribute` cost.
	// Guarded by `hydrating`, so steady-state re-renders are untouched.
	if (hydrating) {
		const mode = hydrationMismatchMode(el);
		if (mode !== 0) {
			const nsd = attrNamespace(name);
			const serverAttr = nsd
				? el.getAttributeNS(nsd, name.indexOf(':') >= 0 ? name.slice(name.indexOf(':') + 1) : name)
				: el.getAttribute(name);
			if (serverAttr !== next) {
				if (mode === 1) return; // keep the server attribute (React semantics)
				warnHydrationValueMismatch(
					(el as any).__oct_loc,
					`attribute \`${name}\``,
					serverAttr,
					next,
				);
			}
		}
	}
	const ns = attrNamespace(name);
	if (next === null) {
		if (ns) {
			const colon = name.indexOf(':');
			el.removeAttributeNS(ns, colon >= 0 ? name.slice(colon + 1) : name);
		} else {
			el.removeAttribute(name);
		}
		return;
	}
	// Proactive validity gate (React's isAttributeNameSafe shape): an
	// injection-shaped/invalid attribute NAME (e.g. a hostile spread key like
	// `'x onload=…'`) would make the platform throw InvalidCharacterError and
	// crash the whole render. Skip it — dev-warn only — mirroring the SSR
	// serializer's identical VALID_ATTR_NAME gate (shared in constants.ts).
	if (!VALID_ATTR_NAME.test(name)) {
		if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
			console.error(`Invalid attribute name: \`${name}\` (skipped).`);
		}
		return;
	}
	if (ns) el.setAttributeNS(ns, name, next);
	else el.setAttribute(name, next);
}

/**
 * The final attribute string for `(el, name, value)`, or `null` for "absent".
 * One coercion feeds setAttribute's hydration compare AND its write, and the
 * rules mirror the server's ssrAttr byte-for-byte (shared value-type tables in
 * constants.ts) — without the mirror, SSR would omit an attribute (e.g.
 * `hidden` for `hidden={0}`) that hydration then resurrects, flipping the
 * platform state and warning on the divergence.
 */
function coerceAttrValue(el: Element, name: string, value: any): string | null {
	// `aria-*` attributes are ENUMERATED (React parity): `false` renders as
	// "false" (NOT removed) and `true` as "true" (NOT ""); only nullish removes.
	if (name.charCodeAt(0) === 97 /* a */ && name.startsWith('aria-')) {
		return value == null ? null : String(value);
	}
	const t = typeof value;
	// spellcheck / contenteditable / draggable are ENUMERATED too — `false` must
	// WRITE "false" (an ABSENT attribute means "inherit / UA default", which is a
	// different state), and `true` writes "true". The generic boolean handling
	// (false → remove) would silently flip e.g. contentEditable={false} back to
	// inherited editability. Matched case-insensitively (JSX arrives camelCase).
	if (t === 'boolean' && isEnumeratedBooleanAttr(name)) return value ? 'true' : 'false';
	// data-* attributes stringify booleans: `data-x={false}` must write "false" —
	// a dataset consumer reads the string, so removing would lose the value.
	if (t === 'boolean' && name.startsWith('data-')) return value ? 'true' : 'false';
	// Function and symbol values are never meaningful attribute text (React
	// removes them); stringifying a function would leak its source into the DOM.
	if (t === 'function' || t === 'symbol') return null;
	// React's value-type tables — custom elements are exempt (raw semantics).
	if (el.localName.indexOf('-') === -1) {
		const lower = name.toLowerCase();
		// React's boolean-attr table (constants.ts — REVERSES the 2026-06
		// native-write adjudication): ANY truthy value renders the canonical
		// `attr=""` presence form (`disabled="disabled"` → `disabled=""`),
		// falsy removes (`hidden={0}`, `inert=""` → absent).
		if (BOOLEAN_ATTR_PROPS.has(lower)) {
			return value ? '' : null;
		}
		// The OVERLOADED booleans (download/capture): boolean values get
		// presence semantics; everything else passes through verbatim below
		// (`download={0}` → "0", like React).
		if (t === 'boolean' && (lower === 'download' || lower === 'capture')) {
			return value ? '' : null;
		}
		// Booleans on NON-boolean attributes remove (React: `title={true}` must
		// never render `title=""`), with the React DEV diagnostic.
		if (t === 'boolean') {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				console.error(
					`Received \`${value}\` for a non-boolean attribute \`${name}\`. ` +
						(value === true
							? `If you want to write it to the DOM, pass a string instead: ` +
								`${name}="true" or ${name}={value.toString()}.`
							: `If you used to conditionally omit it with ${name}={condition && value}, ` +
								`pass ${name}={condition ? value : undefined} instead.`),
				);
			}
			return null;
		}
		// Positive-numeric props: below 1 drops — `size="0"` is invalid per the
		// HTML spec.
		if (POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(Number(value) >= 1)) {
			return null;
		}
		// Unknown lowercase on* names never write on standard elements (an
		// event-ish name with a string payload is injection surface, not an
		// attribute); camelCase onX events compile to delegated bindings and
		// never reach setAttribute. Custom elements keep them (raw semantics).
		if (name.length > 2 && name.charCodeAt(0) === 111 /* o */ && name.charCodeAt(1) === 110) {
			// DEV hint: the camelCase form is the working delegated handler.
			if (
				process.env.NODE_ENV !== 'production' &&
				(el as any).__oct_loc !== undefined &&
				typeof value === 'function'
			) {
				console.error(
					`Unknown event handler property \`${name}\` was dropped — did you mean ` +
						`\`on${name.charAt(2).toUpperCase()}${name.slice(3)}\`? (lowercase on* ` +
						'attributes never write; octane delegates camelCase handlers natively)',
				);
			}
			return null;
		}
	}
	if (value == null || value === false) return null;
	// DEV: a plain object stringifies as "[object Object]" — always a bug
	// (React's unusual-coercion check; arrays keep their join semantics).
	if (
		process.env.NODE_ENV !== 'production' &&
		t === 'object' &&
		(el as any).__oct_loc !== undefined &&
		(value as object).toString === Object.prototype.toString
	) {
		console.error(
			`The provided \`${name}\` attribute is an object; it will stringify to ` +
				'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
		);
	}
	const v = value === true ? '' : String(value);
	// An empty `src`/`href` resolves to the CURRENT PAGE's URL — browsers will
	// re-fetch the whole document as an image/script/stylesheet. React strips
	// these (dev AND prod); so do we. `<a href="">` (and `<area>`) stays — an
	// empty href is a legitimate "link to this page".
	if (
		v === '' &&
		(name === 'src' || (name === 'href' && el.nodeName !== 'A' && el.nodeName !== 'AREA'))
	) {
		return null;
	}
	return v;
}

// clsx-style `class`/`className` composition — shared with the SSR serializer
// via css.ts so client and server compose byte-equal class strings (hydration
// parity). Re-exported here because it is part of the semi-public surface.
import { normalizeClass, styleName } from './css.js';
export { normalizeClass };

export function setClassName(el: Element, value: unknown): void {
	// clsx-compose first so arrays / objects become a class string (and the hydration
	// compare below sees the value we actually write).
	const cls = normalizeClass(value);
	// Hydration VALUE-mismatch detection for `class` (parity with `setAttribute`): the write
	// below patches to the client value; here we (dev) warn on a server/client divergence and
	// honor `suppressHydrationWarning` (keep the server class). `hydrationMismatchMode` skips
	// the compare unless dev or suppressed so a non-suppressed prod hydration adds no cost.
	// Guarded by `hydrating`.
	if (hydrating) {
		const mode = hydrationMismatchMode(el);
		if (mode !== 0) {
			const serverClass = el.getAttribute('class') ?? '';
			if (serverClass !== cls) {
				if (mode === 1) return; // keep the server class
				warnHydrationValueMismatch((el as any).__oct_loc, 'attribute `class`', serverClass, cls);
			}
		}
	}
	// Fast path on HTMLElement. For SVG/MathML hosts the compiler emits
	// setAttribute(el, 'class', normalizeClass(...)) directly — never routes here —
	// because SVGElement.className is a read-only SVGAnimatedString and assignment
	// is a no-op in real browsers.
	// A NULLISH/false className REMOVES the attribute (React parity: null removes;
	// an empty STRING still writes `class=""` — the differential rig pins that
	// distinction against React). Same raw-value rule as setClassAttr: composition
	// erases the null-vs-'' difference, so the check must be on `value`.
	if (value == null || value === false) el.removeAttribute('class');
	else (el as any).className = cls;
}

// Attribute-based class setter: SVG/MathML compiled TEMPLATE bindings (where
// `className` is a read-only SVGAnimatedString so the fast `setClassName` can't be
// used), setDeoptClass's SVG arm, and setSpread's class arm all route here.
// clsx-composes the value; a nullish/false value REMOVES the attribute (parity with
// the generic setAttribute this binding routed through before clsx composition
// existed).
export function setClassAttr(el: Element, value: unknown): void {
	const cls = value == null || value === false ? null : normalizeClass(value);
	// Hydration VALUE-mismatch handling, mirroring `setClassName`: honor
	// `suppressHydrationWarning` (keep the server class) and dev-warn on a divergence —
	// so SVG/spread classes get the same suppress/warn semantics as an HTML `className`
	// binding instead of silently clobbering the adopted server class.
	if (hydrating) {
		const mode = hydrationMismatchMode(el);
		if (mode !== 0) {
			const serverClass = el.getAttribute('class');
			if (serverClass !== cls) {
				if (mode === 1) return; // keep the server class
				warnHydrationValueMismatch((el as any).__oct_loc, 'attribute `class`', serverClass, cls);
			}
		}
	}
	if (cls === null) el.removeAttribute('class');
	else el.setAttribute('class', cls);
}

// SVG-safe class setter for the de-opt / hostComponent paths, which (unlike the
// compiled template) can hit an SVGElement whose `className` is a read-only
// SVGAnimatedString. Routes SVG through the attribute-based `setClassAttr` and keeps
// HTML on the fast `setClassName`; both clsx-compose the value and share the same
// hydration suppress/warn semantics.
function setDeoptClass(el: Element, value: unknown): void {
	if (el.namespaceURI === SVG_NS) {
		setClassAttr(el, value);
	} else {
		setClassName(el, value);
	}
}

// ---------------------------------------------------------------------------
// Style — object form (keys may be kebab-case `font-size` OR React-style
// camelCase `fontSize`; see styleName) or a full cssText string. `prev` is the
// previous value tracked by the compiler so we can diff object→object and only
// touch the properties that changed.
// ---------------------------------------------------------------------------

const IMPORTANT_SUFFIX = '!important';

export function setStyle(el: HTMLElement | SVGElement, value: any, prev: any): void {
	const style = (el as HTMLElement).style;
	// Hydration VALUE-mismatch detection for `style`: apply the client value (patches for
	// free, as with attributes) then, in dev, warn if it actually changed the adopted server
	// style. The before/after `cssText` compare needs no manual serialization and no-ops when
	// the styles match. `suppressHydrationWarning` keeps the server style + suppresses.
	// `hydrationMismatchMode` gates the compare exactly like the attribute/class sites, so a
	// non-suppressed prod hydration pays no cssText serialization for the (loc-gated,
	// guaranteed-no-op) warning.
	if (hydrating) {
		const mode = hydrationMismatchMode(el);
		if (mode === 1) {
			// Keep the server style — skip the client apply entirely.
			return;
		}
		if (mode === 2) {
			const before = style.cssText;
			applyStyleValue(style, value, prev);
			if (style.cssText !== before) {
				warnHydrationValueMismatch((el as any).__oct_loc, 'style', before, style.cssText);
			}
			return;
		}
	}
	applyStyleValue(style, value, prev);
}

function applyStyleValue(style: CSSStyleDeclaration, value: any, prev: any): void {
	if (value == null || value === false || value === '') {
		if (prev != null && prev !== false && prev !== '') style.cssText = '';
		return;
	}

	if (typeof value === 'string') {
		if (prev !== value) style.cssText = value;
		return;
	}

	// Object form. If prev is an object too, diff per-property — only changed
	// keys are touched. Otherwise (prev was string / null) reset cssText first
	// so leftover declarations don't leak across the transition.
	if (prev && typeof prev === 'object') {
		for (const k in prev) {
			if (!(k in value)) style.removeProperty(styleName(k));
		}
		for (const k in value) {
			const v = value[k];
			if (v === prev[k]) continue;
			// Booleans clear the property (React parity): `fontFamily: true` must not
			// set the literal string "true" (a valid font name!).
			if (v == null || typeof v === 'boolean') style.removeProperty(styleName(k));
			else applyStyleProperty(style, k, v);
		}
	} else {
		if (typeof prev === 'string') style.cssText = '';
		for (const k in value) {
			const v = value[k];
			if (v != null && typeof v !== 'boolean') applyStyleProperty(style, k, v);
		}
	}
}

function applyStyleProperty(style: CSSStyleDeclaration, name: string, value: any): void {
	const prop = styleName(name);
	// React parity: a bare number gets `px` unless it's 0, a custom prop, or unitless.
	const s = cssStyleValue(name, value);
	// CodeQL flagged the prior `/\s*!important\s*$/` test+replace combo as
	// polynomial-regex-on-uncontrolled-input. Same job in linear time using
	// built-in trimEnd() + endsWith() — no regex, no backtracking risk.
	const tail = s.trimEnd();
	if (tail.endsWith(IMPORTANT_SUFFIX)) {
		style.setProperty(
			prop,
			tail.slice(0, tail.length - IMPORTANT_SUFFIX.length).trimEnd(),
			'important',
		);
	} else {
		style.setProperty(prop, s);
	}
}

// ---------------------------------------------------------------------------
// Spread attributes — `<div {...props}/>`. Iterates the spread object, routes
// each key to the appropriate setter (class / style / onXxx / attr / ref) and
// diffs against the previous spread object so keys that vanished get cleared.
// React 19 shape; only `key`, `ref`, `children` are special-cased.
// ---------------------------------------------------------------------------

function isEventKey(k: string): boolean {
	const c = k.charCodeAt(2);
	return (
		k.length > 2 &&
		k.charCodeAt(0) === 111 /*o*/ &&
		k.charCodeAt(1) === 110 /*n*/ &&
		c >= 65 /*A*/ &&
		c <= 90 /*Z*/
	);
}

// DOM-stamp prefix for capture-phase delegated handlers (`onXxxCapture`). Bubble
// handlers stamp `$$<type>`; capture handlers stamp `$$capture:<type>` so the two
// phases stay independent on the same element + event type.
const CAPTURE_PREFIX = '$$capture:';

// Parse an `on<Name>` / `on<Name>Capture` handler prop into its delegated event
// `type`, DOM-stamp `key`, and phase. React-shape: a trailing `Capture` selects the
// capture phase (fired root→target before bubble handlers). The real events
// `gotpointercapture` / `lostpointercapture` literally end in "capture", so they're
// excluded from the suffix rule (`onGotPointerCapture` is the bubble handler for
// `gotpointercapture`; `onGotPointerCaptureCapture` is its capture handler).
function jsxEventName(rest: string): string {
	// JSX-compatible `onDoubleClick` maps to the native DOM `dblclick` event.
	// Keep this centralized so direct compiler bindings and spread/de-opt bindings stamp
	// the same slot key and register the same delegated event.
	if (rest === 'DoubleClick') return 'dblclick';
	return rest.toLowerCase();
}

function eventSlot(name: string): { type: string; key: string; capture: boolean } | null {
	if (!isEventKey(name)) return null;
	let rest = name.slice(2);
	let capture = false;
	if (
		rest.length > 7 &&
		rest.endsWith('Capture') &&
		name !== 'onGotPointerCapture' &&
		name !== 'onLostPointerCapture'
	) {
		capture = true;
		rest = rest.slice(0, rest.length - 7);
	}
	const type = jsxEventName(rest);
	return { type, key: capture ? CAPTURE_PREFIX + type : '$$' + type, capture };
}

// Remove ONE host prop that was present last render and is gone this render. This is
// the single shared removal path for all three prop-diff loops — setSpread's prev-loop,
// patchDeoptProps' prev-loop (the de-opt reconcile path) and applyHostProps' prev-loop —
// so removal stays symmetric with the corresponding SET path:
//   - `class`/`className`      → removeAttribute('class') (React parity; never `class=""`).
//   - `style`                  → setStyle(el, null, prevValue), diff-clearing an object prev.
//   - `dangerouslySetInnerHTML`→ clear innerHTML (the raw HTML owned the content).
//   - `suppressHydrationWarning` → reset the `__oct_suppress` JS flag. It was never a DOM
//     attribute (see applyDeoptProps), so a removeAttribute would silently no-op and leak
//     the suppression onto later hydrations of a reused element.
//   - `on*` handlers           → null the delegated slot key (bubble or capture phase).
//   - everything else          → setAttribute(el, name, null), which applies the same
//     htmlFor→for alias, aria-* semantics, and attribute-namespace routing the SET path
//     used — a raw removeAttribute(name) here would e.g. remove the nonexistent
//     `htmlFor` attribute and leak the real `for`.
// `ref` is intentionally NOT handled here: each caller owns its ref lifecycle (setSpread
// and applyHostProps detach inline with the element as the cleanup target, and
// applyHostProps also clears `state.ref`; patchDeoptProps detaches once up front as the
// reconcile path's sole detach point) — see the call sites.
function removeHostProp(el: Element, name: string, prevValue?: unknown): void {
	if (name === 'class' || name === 'className') {
		el.removeAttribute('class');
	} else if (name === 'style') {
		setStyle(el as HTMLElement, null, prevValue);
	} else if (name === 'dangerouslySetInnerHTML') {
		el.innerHTML = '';
	} else if (name === 'suppressHydrationWarning') {
		(el as any).__oct_suppress = false;
	} else {
		const ev = eventSlot(name);
		if (ev) (el as any)[ev.key] = null;
		else setAttribute(el, name, null);
	}
}

export function setSpread(el: Element, value: any, prev: any, mountScope?: Scope): void {
	// `mountScope` is passed only on the mount call (not on updates). When present
	// a spread-supplied ref attach is DEFERRED to commit so a callback ref sees a
	// connected node — same React-19 timing as element/fragment refs. Updates
	// defer too when the caller passes its scope (compiled output does), keeping
	// every attach ordered after every queued detach within the commit.
	// Stamp `suppressHydrationWarning` BEFORE either loop (order-independent, like React
	// reading it off props ahead of the diff) so the attribute/class/style writes below
	// see the flag no matter where the key sits in the spread object. A JS flag only —
	// never a DOM attribute — matching the compiler's direct-attribute binding, the
	// de-opt/host paths, and ssrSpread (which skips the key entirely, so writing an
	// attribute here would itself manufacture the very server/client divergence the
	// flag exists to suppress). A vanished key is reset by the removal loop below.
	if (value != null && 'suppressHydrationWarning' in value) {
		(el as any).__oct_suppress = value.suppressHydrationWarning !== false;
	}
	// Remove keys present in prev but absent in value (removeHostProp routes each to
	// the removal that mirrors its SET path — class, style, innerHTML, suppress flag,
	// event slot, aliased/namespaced attribute).
	if (prev) {
		for (const k in prev) {
			if (k === 'key' || k === 'children') continue;
			if (k === 'ref') {
				// Detach the prior ref when it's removed from the spread or its
				// identity changed (the value loop re-attaches a changed ref).
				// attachRef runs a callback's React-19 cleanup-return (or calls it
				// with null) and clears object/array refs — full parity with a
				// direct `ref={}` binding. Handled here (not in removeHostProp)
				// because the detach passes THIS element, so a callback ref shared
				// across elements releases its per-element cleanup.
				const nextRef = value ? value.ref : undefined;
				// Commit-phase (queueRefDetach) so a swap pairs with the value loop's
				// queued re-attach: detaches drain before attaches.
				if (prev.ref != null && prev.ref !== nextRef) queueRefDetach(prev.ref, el);
				continue;
			}
			if (value && k in value) continue;
			removeHostProp(el, k, prev[k]);
		}
	}
	if (value == null) return;
	for (const k in value) {
		if (k === 'key' || k === 'children') continue;
		const v = value[k];
		const pv = prev ? prev[k] : undefined;
		if (k === 'ref') {
			if (v === pv) continue;
			// Route through attachRef for full parity: callback cleanup-return,
			// object `.current`, and array refs. The prior ref (if any) was queued
			// for detach in the removal loop above; queued detaches drain before
			// queued attaches at commit, so a swap cycles old → null → new even
			// across elements. Compiled callers pass their scope on BOTH mount and
			// update so the attach lands at commit (connected node, ordered after
			// all detaches); the scope-less inline fallback serves external callers.
			if (mountScope) queueRefAttach(mountScope, () => attachRef(v, el));
			else attachRef(v, el);
			continue;
		}
		if (k === 'suppressHydrationWarning') continue; // stamped before the loops (see above)
		if (k === 'class' || k === 'className') {
			if (v === pv) continue;
			// Hydration-aware + SVG-safe class write (suppress/warn parity with a
			// direct class binding); nullish/false removes the attribute.
			setClassAttr(el, v);
			continue;
		}
		if (k === 'style') {
			setStyle(el as HTMLElement, v, pv);
			continue;
		}
		const ev = eventSlot(k);
		if (ev) {
			if (v === pv) continue;
			// Lazy-delegate any event we haven't seen — the compiler can't predict
			// event names that arrive dynamically through spread. Capture-phase
			// handlers (`onXxxCapture`) register their own capture-phase listener.
			if (ev.capture) {
				if (!_delegatedCapture.has(ev.type)) delegateCaptureEvents([ev.type]);
			} else if (!_delegated.has(ev.type)) {
				delegateEvents([ev.type]);
			}
			(el as any)[ev.key] = v;
			continue;
		}
		// Controlled `value`/`checked` bypass the identity skip — they must
		// reassert every commit (the DOM may have drifted; the helper's own
		// DOM-diff makes the call cheap).
		if (v === pv && !isControlledHostProp(el, k)) continue;
		setAttribute(el, k, v);
	}
}

// ---------------------------------------------------------------------------
// Component-scoped <style> injection — idempotent, keyed by the compiled
// stylesheet hash so repeated mounts (or HMR re-imports) inject once.
// ---------------------------------------------------------------------------

const _injectedStyles = new Set<string>();

// ---------------------------------------------------------------------------
// Hoisted document metadata (React-19-shape) — `<title>`, `<meta>`, `<link>`
// rendered ANYWHERE in a component are lifted to <document.head> by the compiler
// emitting one `headBlock(scope, slot, key, tag, attrs, text)` call per element
// (instead of placing it in the body template). Because octane re-invokes a
// component body on every render, this call recurs each render: the element is
// created/adopted ONCE (held in `scope.slots[slot]`; `key` is the content hash for
// SSR adoption), its attributes
// and text are re-applied each render (so `<title>{state}</title>` is reactive),
// and it is removed from <head> when the owning scope unmounts (so a route swap
// replaces the page's metadata). On a hydrated page the server wrote
// `<!--key-->` + the element into <head> (ssrHeadEl → RenderResult.head →
// <!--ssr-head-->); headBlock ADOPTS that element rather than appending a copy.
// ---------------------------------------------------------------------------

interface HeadSlot {
	el: Element;
	/** Direct listeners for on* props — head elements sit outside delegation roots. */
	handlers?: Map<string, EventListener>;
}

// Find the server-rendered element for `key` in <head> (it directly follows the
// `<!--key-->` marker), remove the marker so a later mount can't re-match it, and
// return the element. Returns null on a fresh client render (no SSR marker).
function adoptServerHeadEl(key: string): Element | null {
	for (let n: Node | null = document.head.firstChild; n !== null; n = n.nextSibling) {
		if (n.nodeType === 8 && (n as Comment).data === key) {
			let el: Node | null = n.nextSibling;
			while (el !== null && el.nodeType === 3 && /^\s*$/.test((el as Text).data)) {
				el = el.nextSibling;
			}
			(n as Comment).remove();
			return el !== null && el.nodeType === 1 ? (el as Element) : null;
		}
	}
	return null;
}

export function headBlock(
	scope: Scope,
	slot: number,
	key: string,
	tag: string,
	attrs: Record<string, any> | null,
	text: unknown,
): void {
	if (typeof document === 'undefined') return;
	// State lives in the dense `slots` array (like every other slot) so the scope
	// shape stays monomorphic; `key` is only the content hash used to adopt the
	// matching server-rendered head element on hydration.
	let state = scope.slots[slot] as HeadSlot | undefined;
	if (state === undefined) {
		let el = adoptServerHeadEl(key);
		if (el === null) {
			el = document.createElement(tag);
			document.head.appendChild(el);
		}
		state = { el };
		scope.slots[slot] = state;
		// Removed once, on the owning scope's unmount (NOT between re-renders) —
		// scope.cleanups fire only on teardown, mirroring the spread-ref cleanup.
		scope.cleanups.push(() => {
			state!.el.remove();
			scope.slots[slot] = undefined;
		});
	}
	const el = state.el;
	if (attrs !== null) {
		for (const k in attrs) {
			// Hoisted head elements live in document.head — OUTSIDE every delegation
			// root — and their load/error events don't bubble anyway, so on* props
			// get DIRECT listeners here (`<link onLoad={…}>` must fire like React's).
			const ev = k.length > 2 && k[0] === 'o' && k[1] === 'n' ? eventSlot(k) : null;
			if (ev !== null) {
				const v = attrs[k];
				const hs = (state.handlers ??= new Map<string, EventListener>());
				const prevH = hs.get(ev.type);
				if (prevH) el.removeEventListener(ev.type, prevH, ev.capture);
				if (typeof v === 'function') {
					el.addEventListener(ev.type, v as EventListener, ev.capture);
					hs.set(ev.type, v as EventListener);
				} else {
					hs.delete(ev.type);
				}
				continue;
			}
			setAttribute(el, k, attrs[k]);
		}
	}
	if (text != null) {
		const t = String(text);
		if (el.textContent !== t) el.textContent = t;
	}
}

export function injectStyle(id: string, css: string): void {
	if (_injectedStyles.has(id)) return;
	// SSR de-dup: the server already emitted this scoped stylesheet (the css of
	// the RenderResult, a `<style data-octane="hash">`). On a hydrated page
	// the per-runtime Set is empty, so also check the DOM before re-injecting —
	// otherwise hydration would append a duplicate <style>.
	if (typeof document !== 'undefined' && document.querySelector(`style[data-octane="${id}"]`)) {
		_injectedStyles.add(id);
		return;
	}
	_injectedStyles.add(id);
	const el = document.createElement('style');
	el.setAttribute('data-octane', id);
	el.textContent = css;
	document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// Events — top-level delegation. Handlers stored as bare functions or { fn, args } bundles.
// ---------------------------------------------------------------------------

interface HandlerBundle {
	fn: (...args: any[]) => any;
	args: any[];
}
type EventSlot = ((event: Event) => any) | HandlerBundle | null | undefined;

// ---------------------------------------------------------------------------
// Event bundle helpers (compiled-output plan 3b) — compiler targets for the
// `() => fn(arg, …)` bundle optimization. Mount (`evtN`): build the
// `{ fn, args }` descriptor ONCE, assign it to the element's event slot, and
// return it for the binding bag (one field instead of el + fn + each arg).
// Update (`evtNu`): mutate the SAME descriptor in place — dispatch reads
// `el[key]` at fire time and the slot still points at this object, so the
// mutation is observed with no compare, no rebuild, and no re-assignment.
// Arity variants mirror fireEventSlot's dispatch switch; `evtN`/`evtNu` are
// the rest fallbacks. Arity-0 descriptors share one empty args array
// (dispatch only reads it; the arity-0 update never writes args).
// ---------------------------------------------------------------------------

const EMPTY_ARGS: any[] = [];

export function evt0(el: Element, key: string, fn: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: EMPTY_ARGS };
	(el as any)[key] = d;
	return d;
}
export function evt0u(d: HandlerBundle, fn: any): void {
	d.fn = fn;
}
export function evt1(el: Element, key: string, fn: any, a0: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: [a0] };
	(el as any)[key] = d;
	return d;
}
export function evt1u(d: HandlerBundle, fn: any, a0: any): void {
	d.fn = fn;
	d.args[0] = a0;
}
export function evt2(el: Element, key: string, fn: any, a0: any, a1: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: [a0, a1] };
	(el as any)[key] = d;
	return d;
}
export function evt2u(d: HandlerBundle, fn: any, a0: any, a1: any): void {
	d.fn = fn;
	const a = d.args;
	a[0] = a0;
	a[1] = a1;
}
export function evtN(el: Element, key: string, fn: any, args: any[]): HandlerBundle {
	const d: HandlerBundle = { fn, args };
	(el as any)[key] = d;
	return d;
}
export function evtNu(d: HandlerBundle, fn: any, args: any[]): void {
	d.fn = fn;
	d.args = args;
}

// Delegated event names registered by compiled modules' `delegateEvents([...])`
// calls. Listeners are NOT attached at module-eval time — they're attached to
// each root container when `createRoot` runs, and to each portal target when
// the portal mounts. This matches ReactDOM 17+ behaviour: events scoped to
// the React-owned subtrees, no document-level pollution.
const _delegated = new Set<string>();

// Active delegation targets (createRoot containers + portal targets). A
// portal target may host multiple portals; the refcount tracks how many
// portals are currently rendering into it so we detach only when the last
// one unmounts. createRoot containers have refcount 1 for their lifetime.
const _delegationTargets = new Map<Node, number>();

// Event names with capture-phase handlers (`onXxxCapture`). These get a SEPARATE
// capture-phase listener (`dispatchDelegatedCapture`) on every delegation target,
// independent of the bubble-phase `_delegated` set — an event type can have both
// (`onClick` + `onClickCapture`).
const _delegatedCapture = new Set<string>();

// Non-bubbling events must be delegated in the CAPTURE phase so the single root
// listener still sees them (the capture phase reaches the root even when the event
// doesn't bubble). For focus/blur the dispatcher then walks from `event.target`
// upward, which reproduces React's bubbling `onFocus`/`onBlur`. (All other events
// keep the cheaper bubbling-phase delegation.) The flag must match between
// add/removeEventListener, so it is derived from the name both times.
// The remaining NON-BUBBLING native families (media/resource lifecycle,
// <details>/<dialog> state events, resize). The platform fires these on the
// target only; ancestors never hear them natively. React's synthetic layer
// re-dispatches them up the tree — octane deliberately does NOT (maintainer
// ruling 2026-07-04: never replicate the synthetic event system) — but the
// TARGET's own handler must still fire, which requires capture-phase delegation
// (a bubble-phase root listener never hears a non-bubbling event at all).
// Delivery is target-only, exactly like the platform.
const NON_BUBBLING_TARGET_EVENTS = [
	'abort',
	'beforetoggle',
	'cancel',
	'canplay',
	'canplaythrough',
	'close',
	'durationchange',
	'emptied',
	'encrypted',
	'ended',
	'error',
	'load',
	'loadeddata',
	'loadedmetadata',
	'loadstart',
	'pause',
	'play',
	'playing',
	'progress',
	'ratechange',
	'resize',
	'seeked',
	'seeking',
	'stalled',
	'suspend',
	'timeupdate',
	'toggle',
	'volumechange',
	'waiting',
];

const CAPTURE_DELEGATED = /* @__PURE__ */ new Set([
	'focus',
	'blur',
	// `invalid` doesn't bubble either, but React's onInvalid propagates (a form's
	// onInvalid observes its controls' invalid events) — so it gets the focus/blur
	// walking treatment, NOT the enter/leave target-only one.
	'invalid',
	'pointerenter',
	'pointerleave',
	'mouseenter',
	'mouseleave',
	// Element `scroll`/`scrollend` don't bubble either. React 17+ made onScroll
	// NON-bubbling (it fires only on the scrolled element), so they get the
	// enter/leave target-only treatment below.
	'scroll',
	'scrollend',
	...NON_BUBBLING_TARGET_EVENTS,
]);
const delegatedCapture = (name: string): boolean => CAPTURE_DELEGATED.has(name);

// The enter/leave family is dispatched PER ELEMENT by the browser — each
// entered/left element receives its OWN non-bubbling event — so the delegated
// dispatcher must fire ONLY the target's handler. Ascending the ancestor chain
// (the focus/blur treatment) would double-fire ancestors, which receive their own
// enter/leave events natively. Matches React, where the enter/leave events do not
// bubble either.
const TARGET_ONLY_DELEGATED = /* @__PURE__ */ new Set([
	'pointerenter',
	'pointerleave',
	'mouseenter',
	'mouseleave',
	// React 17+ parity: onScroll fires on the scrolled element only (no synthetic
	// bubbling), and ancestors receive their own scroll events natively.
	'scroll',
	'scrollend',
	// Platform semantics for every other non-bubbling family (media, toggle,
	// close, load/error, …): the target's handler fires, ancestors' do not.
	...NON_BUBBLING_TARGET_EVENTS,
]);

export function delegateEvents(eventNames: string[]): void {
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegated.has(name)) continue;
		_delegated.add(name);
		// A new event type was registered after some roots/portals already mounted —
		// back-attach the listener to every active target so handlers stamped on
		// their DOM via `el.$$click = …` still receive events.
		for (const target of _delegationTargets.keys()) {
			target.addEventListener(name, dispatchDelegated, delegatedCapture(name));
		}
	}
}

// Register capture-phase delegated events (for `onXxxCapture` handlers). Attaches a
// capture-phase `dispatchDelegatedCapture` listener to every active target, which
// fires the matching `$$capture:<type>` slots root→target (capture order). Compiled
// modules call this at load for the capture handlers they contain; the spread path
// lazy-registers dynamically-supplied ones.
export function delegateCaptureEvents(eventNames: string[]): void {
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegatedCapture.has(name)) continue;
		_delegatedCapture.add(name);
		for (const target of _delegationTargets.keys()) {
			target.addEventListener(name, dispatchDelegatedCapture, true);
		}
	}
}

/**
 * Register `target` (a createRoot container or a portal target DOM node) as
 * an event-delegation root. Idempotent w.r.t. each call: first registration
 * attaches all known delegated event listeners, subsequent registrations
 * just bump the refcount.
 */
function registerDelegationTarget(target: Node): void {
	const prev = _delegationTargets.get(target) || 0;
	_delegationTargets.set(target, prev + 1);
	if (prev === 0) {
		// iOS Safari quirk (React parity): elements without a DIRECT click listener
		// don't dispatch taps up to a delegated ancestor listener. A noop `onclick`
		// on the delegation root (createRoot container / portal target) makes the
		// whole subtree tappable. Property assignment — never an attribute.
		if ((target as any).onclick == null && (target as any).nodeType === 1) {
			(target as any).onclick = noop;
		}
		for (const name of _delegated) {
			target.addEventListener(name, dispatchDelegated, delegatedCapture(name));
		}
		for (const name of _delegatedCapture) {
			target.addEventListener(name, dispatchDelegatedCapture, true);
		}
	}
}

/**
 * Inverse of `registerDelegationTarget`. Last referent detaches all listeners.
 */
function unregisterDelegationTarget(target: Node): void {
	const prev = _delegationTargets.get(target);
	if (!prev) return;
	if (prev === 1) {
		_delegationTargets.delete(target);
		for (const name of _delegated) {
			target.removeEventListener(name, dispatchDelegated, delegatedCapture(name));
		}
		for (const name of _delegatedCapture) {
			target.removeEventListener(name, dispatchDelegatedCapture, true);
		}
	} else {
		_delegationTargets.set(target, prev - 1);
	}
}

/**
 * Event types React tags as DiscreteEventPriority. Updates triggered from
 * these handlers MUST commit synchronously before the handler returns to
 * the browser — otherwise:
 *   - fast double-clicks see pre-flush state and double-submit
 *   - autofocus after reveal misses (focus runs before the microtask)
 *   - `e.preventDefault(); setX(...); read(measure)` reads stale layout
 *   - controlled inputs drop keystrokes (value lags one task)
 *
 * Source: facebook/react packages/react-dom-bindings/src/events/
 * ReactDOMEventListener.js — getEventPriority's DiscreteEventPriority arm.
 * Kept verbatim so future React additions can be picked up by diff.
 */
const DISCRETE_EVENTS = new Set<string>([
	'auxclick',
	'beforeblur',
	'beforeinput',
	'blur',
	'cancel',
	'change',
	'click',
	'close',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'contextmenu',
	'copy',
	'cut',
	'dblclick',
	'dragend',
	'dragstart',
	'drop',
	'focus',
	'focusin',
	'focusout',
	'fullscreenchange',
	'gotpointercapture',
	'hashchange',
	'input',
	'invalid',
	'keydown',
	'keypress',
	'keyup',
	'lostpointercapture',
	'mousedown',
	'mouseup',
	'paste',
	'pause',
	'play',
	'pointercancel',
	'pointerdown',
	'pointerup',
	'popstate',
	'ratechange',
	'reset',
	'resize',
	'seeked',
	'select',
	'selectionchange',
	'selectstart',
	'submit',
	'textInput',
	'touchcancel',
	'touchend',
	'touchstart',
	'volumechange',
]);

/**
 * Re-entrancy depth for dispatchDelegated. Only the outermost dispatch flushes
 * — nested handlers (e.g. a click handler that synthetically dispatches another
 * event on the same target chain) inherit the outer flush instead of producing
 * intermediate commits that React wouldn't.
 */
let _dispatchDepth = 0;

// Stamps marking a native event whose delegated walk has already run, per phase. A
// single native event can reach more than one delegation listener when targets nest —
// a portal target inside a root, nested roots, or overlapping portal targets. Each
// listener walks the full logical tree, so without this guard the shared portion of
// the chain would fire its handlers once per nested listener. Capture and bubble are
// independent phases, so each carries its own stamp.
const DELEGATED_DISPATCHED = /* @__PURE__ */ Symbol('octane.dispatched');
const CAPTURE_DISPATCHED = /* @__PURE__ */ Symbol('octane.dispatched.capture');

// Invoke one event slot — a bare handler `fn(event)` or a `{ fn, args }` bundle
// (the compiler's stable-arrow optimisation) as `fn(...args, event)`.
//
// GUARDED like the platform guards each listener invocation: a throwing handler
// (or a non-function listener value that arrived through a spread/prop) reports
// its error and must NOT abort the rest of the dispatch walk — ancestors still
// receive the event, exactly as separate native listeners would. `reportError`
// surfaces through the global error event (window.onerror) like an uncaught
// listener exception; console.error is the non-browser fallback.
function fireEventSlot(slot: HandlerBundle | ((e: Event) => any), event: Event): void {
	try {
		if (typeof slot === 'function') {
			slot(event);
			return;
		}
		const fn = slot.fn as unknown;
		if (typeof fn !== 'function') {
			// React parity outcome: a non-function listener is reported and ignored;
			// it never blocks sibling/ancestor handlers. (Report is dev-only.)
			if (process.env.NODE_ENV !== 'production')
				console.error(
					'Expected an event listener to be a function, instead got a value of type ' +
						typeof (fn ?? slot),
				);
			return;
		}
		const a = slot.args;
		switch (a.length) {
			case 0:
				slot.fn(event);
				break;
			case 1:
				slot.fn(a[0], event);
				break;
			case 2:
				slot.fn(a[0], a[1], event);
				break;
			default:
				slot.fn.apply(null, a.concat(event));
		}
	} catch (err) {
		reportListenerError(err);
	}
}

// Surface a guarded listener exception the way the platform surfaces an uncaught
// one: through the global error event, then the console if nothing canceled it.
// `reportError` is exactly that; the fallback is the standard polyfill shape for
// environments without it (jsdom).
function reportListenerError(err: unknown): void {
	if (typeof reportError === 'function') {
		reportError(err);
		return;
	}
	if (typeof window !== 'undefined' && typeof ErrorEvent === 'function') {
		const ev = new ErrorEvent('error', {
			error: err,
			message: String((err as any)?.message ?? err),
			cancelable: true,
		});
		window.dispatchEvent(ev);
		if (!ev.defaultPrevented) console.error(err);
		return;
	}
	console.error(err);
}

// React parity: discrete events (click, keydown, input, …) must commit before the
// browser regains control — otherwise fast double-clicks, focus-after-reveal,
// e.preventDefault+setState+measure patterns and controlled-input value reads all see
// stale state. Only the OUTERMOST dispatch flushes — nested synthetic dispatches
// inherit the outer commit window. Non-discrete events keep microtask-batched
// semantics so they don't thrash the scheduler.
function maybeFlushDiscrete(type: string): void {
	if (_dispatchDepth !== 0 || !DISCRETE_EVENTS.has(type)) return;
	// Commit handler-scheduled work first, so the controlled restore below
	// compares the DOM against the values the handlers just rendered.
	if (hasPendingWork()) flushSync(noop);
	// The restore runs even when NO work was scheduled — a rejected/unheard
	// edit (no onInput, or an Object.is-equal setState) schedules nothing and
	// is exactly the case that must snap back (React's restoreControlledState).
	if (pendingRestores.length > 0) restoreControlledStates();
}

function dispatchDelegated(event: Event): void {
	// Only the first delegation listener to receive this event walks it (its walk
	// already covers every logical ancestor across roots/portals); the rest no-op.
	if ((event as any)[DELEGATED_DISPATCHED] === true) return;
	(event as any)[DELEGATED_DISPATCHED] = true;
	maybeEnqueueRestore(event);
	const key = '$$' + event.type;
	const targetOnly = TARGET_ONLY_DELEGATED.has(event.type);
	_dispatchDepth++;
	let node = event.target as any;
	// A submit dispatch targeting a form opens the manual-action useFormStatus
	// window (see publishManualFormPending): handlers' startTransition calls
	// register on the record; the walk's end decides whether to publish.
	const prevSubmitRec = ACTIVE_SUBMIT_DISPATCH;
	const submitRec: SubmitDispatchRec | null =
		event.type === 'submit' && node != null && node.nodeName === 'FORM'
			? {
					form: node as HTMLFormElement,
					event: event as SubmitEvent,
					transitions: 0,
					published: false,
					intercepted: false,
				}
			: null;
	if (submitRec !== null) ACTIVE_SUBMIT_DISPATCH = submitRec;
	try {
		// CAPTURE_DELEGATED types have BOTH dispatchers attached as capture-phase
		// listeners on the same root, so same-node registration ORDER — not phase —
		// would decide whether the capture pass or this walk runs first. Run the
		// capture pass explicitly first (it self-stamps, so the natively-queued
		// capture listener no-ops), and honor a capture-phase stopPropagation
		// before walking — native cross-phase semantics. Nested inside our
		// _dispatchDepth++ so the capture pass can't flush discrete work mid-event.
		if (
			delegatedCapture(event.type) &&
			(event as any)[CAPTURE_DISPATCHED] !== true &&
			_delegatedCapture.has(event.type)
		) {
			dispatchDelegatedCapture(event);
			if (event.cancelBubble) return;
		}
		while (node !== null && node !== undefined) {
			const slot = node[key] as EventSlot;
			if (slot) {
				// React parity: the handler's element is the currentTarget.
				setCurrentTarget(event, node);
				fireEventSlot(slot, event);
				if (event.cancelBubble) return;
			}
			// Enter/leave events fire on the target only (see TARGET_ONLY_DELEGATED).
			if (targetOnly) return;
			// Portal-aware ascent: when crossing a portal root, jump to the rendering Block's DOM parent.
			if (node.$$portalParent) {
				node = node.$$portalParent;
			} else {
				node = node.parentNode;
			}
		}
	} finally {
		if (submitRec !== null) {
			ACTIVE_SUBMIT_DISPATCH = prevSubmitRec;
			// Before the depth drop + discrete flush, so a published pending status
			// commits in this event's flush window (like handleFormSubmit's does).
			publishManualFormPending(submitRec);
		}
		clearCurrentTarget(event);
		_dispatchDepth--;
		maybeFlushDiscrete(event.type);
	}
}

// Capture-phase counterpart of dispatchDelegated for `onXxxCapture` handlers. Builds
// the logical target→root path (with portal jumps), then fires the `$$capture:<type>`
// slots ROOT→TARGET — React's capture order. Cross-phase `stopPropagation` is handled
// by the browser (this listener and the bubble listener are separate native
// listeners, so a stopped event never reaches the bubble phase).
function dispatchDelegatedCapture(event: Event): void {
	if ((event as any)[CAPTURE_DISPATCHED] === true) return;
	(event as any)[CAPTURE_DISPATCHED] = true;
	maybeEnqueueRestore(event);
	const key = CAPTURE_PREFIX + event.type;
	const path: any[] = [];
	for (let node = event.target as any; node !== null && node !== undefined; ) {
		path.push(node);
		node = node.$$portalParent ? node.$$portalParent : node.parentNode;
	}
	_dispatchDepth++;
	try {
		for (let i = path.length - 1; i >= 0; i--) {
			const slot = path[i][key] as EventSlot;
			if (slot) {
				// React parity: the handler's element is the currentTarget.
				setCurrentTarget(event, path[i]);
				fireEventSlot(slot, event);
				if (event.cancelBubble) return;
			}
		}
	} finally {
		clearCurrentTarget(event);
		_dispatchDepth--;
		maybeFlushDiscrete(event.type);
	}
}

function noop(): void {}

// React parity for DELEGATED dispatch: handlers must see `event.currentTarget` as the
// element whose handler is firing (React's synthetic system guarantees this; ubiquitous
// in ported code — `event.target === event.currentTarget` guards, `currentTarget`-relative
// measurement/indexOf). Native `currentTarget` is the listener's attach node (our
// delegation ROOT), so shadow it with a configurable own property during each handler and
// remove the shadow after the walk (restoring native semantics).
function setCurrentTarget(event: Event, node: EventTarget | null): void {
	Object.defineProperty(event, 'currentTarget', {
		configurable: true,
		get: () => node,
	});
}
function clearCurrentTarget(event: Event): void {
	// Deleting the own property re-exposes Event.prototype's native getter.
	delete (event as any).currentTarget;
}

// ---------------------------------------------------------------------------
// React 19 Actions — <form action={fn}>, useActionState, useFormStatus,
// useOptimistic. A function passed to a form/button action intercepts native
// submit, builds FormData, and runs the action inside a transition. Submission
// status is published per-form so a descendant useFormStatus() can read it.
// ---------------------------------------------------------------------------

export interface FormStatus {
	pending: boolean;
	data: FormData | null;
	method: string;
	action: ((formData: FormData) => unknown) | string | null;
}
const IDLE_FORM_STATUS: FormStatus = { pending: false, data: null, method: 'get', action: null };

// Per-form current submission status + the descendant useFormStatus subscribers.
const FORM_STATUS = new WeakMap<HTMLFormElement, FormStatus>();
const FORM_STATUS_LISTENERS = new WeakMap<HTMLFormElement, Set<() => void>>();

function setFormStatus(form: HTMLFormElement, status: FormStatus): void {
	FORM_STATUS.set(form, status);
	const ls = FORM_STATUS_LISTENERS.get(form);
	if (ls) for (const l of ls) l();
}

// ---------------------------------------------------------------------------
// Manual-action useFormStatus activation (React parity — FormActionEventPlugin):
// besides the intercepted `<form action={fn}>` path, React publishes pending
// status when startTransition is called synchronously during a form's submit
// dispatch whose default was prevented (the `onSubmit={e => { e.preventDefault();
// startTransition(async () => …) }}` idiom). React entangles the pending state
// with the transitions the event scheduled (currentEventTransitionLane);
// octane's equivalent is a per-dispatch record: dispatchDelegated opens it for
// a submit event targeting a form, startTransition registers on it, and when
// the walk ends with the default prevented (and the intercepted path didn't
// claim the submit) pending status is published until every registered
// transition settles. Shares handleFormSubmit's `$$pendingSubmits` counter so
// overlapping manual and intercepted submissions coalesce to one idle flip.
// ---------------------------------------------------------------------------

interface SubmitDispatchRec {
	form: HTMLFormElement;
	event: SubmitEvent;
	/** Transitions started synchronously during this dispatch, not yet settled. */
	transitions: number;
	/** Pending status was published for this dispatch (manual-action path). */
	published: boolean;
	/** handleFormSubmit ran for this dispatch — status is its responsibility. */
	intercepted: boolean;
}

let ACTIVE_SUBMIT_DISPATCH: SubmitDispatchRec | null = null;

// Runs when the submit dispatch's handler walk finishes (dispatchDelegated).
function publishManualFormPending(rec: SubmitDispatchRec): void {
	if (rec.intercepted || rec.transitions === 0 || !rec.event.defaultPrevented) return;
	const form = rec.form;
	let data: FormData | null = null;
	try {
		data = new FormData(form);
		const submitter = rec.event.submitter as HTMLInputElement | null;
		if (submitter && submitter.name) data.append(submitter.name, submitter.value ?? '');
	} catch {
		/* jsdom quirks — status still activates with data: null */
	}
	const fa = form as any;
	fa.$$pendingSubmits = (fa.$$pendingSubmits || 0) + 1;
	rec.published = true;
	setFormStatus(form, {
		pending: true,
		data,
		method: form.method || 'get',
		// React reports the form's action PROP here; octane's equivalents are the
		// intercept function ($$formAction) or the plain attribute.
		action: (fa.$$formAction as FormStatus['action']) ?? form.getAttribute('action'),
	});
}

// Runs once per registered transition, on settle (fulfil, reject, or sync throw).
function settleSubmitTransition(rec: SubmitDispatchRec): void {
	rec.transitions--;
	if (rec.transitions !== 0 || !rec.published) return;
	const fa = rec.form as any;
	fa.$$pendingSubmits = Math.max(0, (fa.$$pendingSubmits || 1) - 1);
	if (fa.$$pendingSubmits === 0) setFormStatus(rec.form, IDLE_FORM_STATUS);
}

// Forms whose reset was requested during a transition/action window, applied
// when the window closes (see flushFormResets / startTransition).
let PENDING_FORM_RESETS: Set<HTMLFormElement> | null = null;

function resetFormNow(form: HTMLFormElement): void {
	try {
		form.reset();
		// The native reset restored DEFAULTS; controlled fields snap back to
		// their rendered values (React applies queued resets the same way).
		reassertControlledIn(form);
	} catch {
		/* jsdom/detached form */
	}
}

/**
 * React DOM's `requestFormReset(form)` — schedule a reset of the form's
 * uncontrolled fields, tied to the enclosing transition/action: the reset is
 * deferred until the action window closes (every in-flight async transition has
 * settled), matching React's "reset when the action's transition commits". This
 * is the manual companion to the automatic reset a plain `<form action={fn}>`
 * gets on success — use it from `onSubmit` + `startTransition` flows or
 * `useActionState` forms that DO want a reset.
 *
 * Called outside any transition or action, React logs an error; octane does the
 * same and applies the reset immediately (the least surprising fallback).
 */
export function requestFormReset(form: HTMLFormElement): void {
	if (TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0) {
		(PENDING_FORM_RESETS ??= new Set()).add(form);
		return;
	}
	if (process.env.NODE_ENV !== 'production')
		console.error(
			'requestFormReset was called outside a transition or action. To fix, move to ' +
				'an action, or wrap with startTransition.',
		);
	resetFormNow(form);
}

// Apply the queued form resets once NO transition/action window remains open.
// Called from every startTransition settle path; the guard makes overlapping
// async actions coalesce — resets fire when the LAST one settles (success or
// failure: React applies queued resets when the transition commits, and an
// action whose error routes to a boundary still commits).
function flushFormResets(): void {
	if (PENDING_FORM_RESETS === null) return;
	if (TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0) return;
	const forms = PENDING_FORM_RESETS;
	PENDING_FORM_RESETS = null;
	for (const f of forms) resetFormNow(f);
}

/**
 * Compiler-emitted binding for `<form action={fn}>` / `<button formAction={fn}>`.
 * A FUNCTION value wires submit interception (stored on the element as
 * `$$formAction`, with the form gaining a delegated `$$submit` handler once);
 * a string/null value falls back to the native attribute so ordinary form posts
 * still work. `prev` lets the update path clean up when switching function→string.
 */
export function setFormAction(
	el: HTMLFormElement | HTMLButtonElement | HTMLInputElement,
	name: string,
	value: unknown,
	prev: unknown,
): void {
	if (typeof value === 'function') {
		(el as any).$$formAction = value;
		if (el.nodeName === 'FORM') {
			if (!(el as any).$$formSubmitWired) {
				(el as any).$$formSubmitWired = true;
				(el as any).$$submit = (event: Event) => handleFormSubmit(el as HTMLFormElement, event);
				delegateEvents(['submit']);
			}
		}
		// A function action implies a non-native submit; drop any stale attribute.
		el.removeAttribute(name);
		return;
	}
	// Non-function (string/null): native behavior. Clear any prior handler AND drop the
	// wired flag so a later string→function flip re-installs `$$submit` — without the
	// reset, the re-wire guard above would still see `$$formSubmitWired` and leave
	// submit interception permanently dead for this form.
	(el as any).$$formAction = undefined;
	if (typeof prev === 'function' && el.nodeName === 'FORM') {
		(el as any).$$submit = undefined;
		(el as any).$$formSubmitWired = false;
	}
	setAttribute(el, name, value);
}

function handleFormSubmit(form: HTMLFormElement, event: Event): void {
	// A `<button formAction>` / `<input type=submit formAction>` submitter
	// overrides the form-level action (React parity).
	const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
	const action =
		(submitter && (submitter as any).$$formAction) || ((form as any).$$formAction as unknown);
	if (typeof action !== 'function') return; // native submit / no function action
	event.preventDefault();
	// This submit is the intercepted-action path's responsibility — suppress the
	// manual startTransition activation for the same dispatch (the action's own
	// transition would otherwise double-publish through the record).
	if (ACTIVE_SUBMIT_DISPATCH !== null && ACTIVE_SUBMIT_DISPATCH.form === form)
		ACTIVE_SUBMIT_DISPATCH.intercepted = true;

	const data = new FormData(form);
	// Include the activating submitter's name/value (FormData(form, submitter)
	// isn't universally available; append manually for parity).
	if (submitter && (submitter as HTMLInputElement).name) {
		data.append((submitter as HTMLInputElement).name, (submitter as HTMLInputElement).value ?? '');
	}

	const fn = action as (formData: FormData) => unknown;
	// Track in-flight submissions per form. A useActionState dispatcher returns a
	// promise that resolves when THAT dispatch's action finishes — not when the
	// whole sequential queue drains — so a rapid second submit must NOT flip the
	// form's status to idle while a later queued action is still running. Only
	// clear when the count returns to 0.
	const fa = form as any;
	fa.$$pendingSubmits = (fa.$$pendingSubmits || 0) + 1;
	setFormStatus(form, { pending: true, data, method: 'post', action: fn });

	// useActionState dispatchers self-wrap in a transition AND keep typed-in
	// values (no auto-reset); a raw action function is wrapped here and its form
	// is reset on success.
	const isDispatcher = (fn as any).$$isActionDispatcher === true;

	const settle = (ok: boolean) => {
		fa.$$pendingSubmits = Math.max(0, (fa.$$pendingSubmits || 1) - 1);
		if (fa.$$pendingSubmits === 0) setFormStatus(form, IDLE_FORM_STATUS);
		// React resets a plain <form action={fn}>'s uncontrolled fields on success;
		// useActionState-driven forms keep their values. form.reset() restores
		// uncontrolled inputs to defaultValue; reassertControlledIn then snaps
		// controlled fields back to their rendered values (React parity — the
		// reset must not clobber controlled state).
		if (ok && !isDispatcher) {
			try {
				form.reset();
				reassertControlledIn(form);
			} catch {
				/* jsdom/detached form */
			}
		}
	};

	let result: unknown;
	try {
		if (isDispatcher) {
			result = fn(data);
		} else {
			startTransition(() => {
				result = fn(data);
				return result as void | Promise<unknown>;
			});
		}
	} catch (err) {
		// A SYNCHRONOUS throw from the action (or a startTransition rethrow) would
		// otherwise skip the settle wiring below, leaving the form's status stuck
		// on `pending`. Clear it, then report — an error thrown inside a DOM submit
		// handler has no meaningful propagation target (mirrors the runtime's
		// effect-error handling: recover + console.error).
		settle(false);
		console.error(err);
		return;
	}
	Promise.resolve(result).then(
		() => settle(true),
		() => settle(false),
	);
}

// ---------------------------------------------------------------------------
// Controlled form components — React-parity `value`/`checked` semantics on
// NATIVE events (no synthetic layer; the no-synthetic-events divergence
// stands — see docs/react-parity-migration-plan.md §2).
//
// Model: the compiler routes `value`/`checked`/`defaultValue`/`defaultChecked`
// on <input>/<textarea>/<select> to the helpers below instead of setAttribute
// (and setAttribute routes the same names on form tags here, so spreads,
// de-opt descriptors, and previously-compiled output get identical semantics).
// A helper writes the DOM PROPERTY, diffs against the DOM (not a compiler
// `_prev$` cache — the DOM is what the user mutates), and ARMS the element
// with a `$$ctrl` state record. Two mechanisms keep the DOM equal to the last
// RENDERED value (React's controlled contract):
//   1. Per-commit reassert — controlled bindings re-run their helper on every
//      render of the owning block with NO prev-value guard; the DOM-diff
//      inside makes an unchanged value free.
//   2. Event-side restore — the delegated dispatchers enqueue armed event
//      targets; after the discrete flush (maybeFlushDiscrete) the restore
//      pass reverts any DOM drift the handlers did not commit. This is
//      React's enqueueStateRestore/restoreControlledState pair: a keystroke
//      the handler rejects (or never hears — no onInput) snaps back before
//      the browser regains control.
// Direct programmatic writes (`el.value = x` outside any event) STICK until
// the element's block next renders — same as React.
// ---------------------------------------------------------------------------

/**
 * Sentinel for "the value prop is not controlling this element" — distinct
 * from every real value (a nullish `value` means uncontrolled, like React).
 */
const UNCONTROLLED: unique symbol = Symbol('octane.uncontrolled');

/**
 * Per-element controlled state, stored as a `$$ctrl` expando (octane's slot
 * idiom — `$$click`, `$$formAction`; a WeakMap would cost a hash lookup on
 * every delegated event). One monomorphic shape for every control kind.
 */
interface ControlledState {
	/**
	 * Last RENDERED value, RAW — not stringified: the number-input compare
	 * needs the raw prop (see valueNeedsWrite). UNCONTROLLED when the value
	 * prop is absent/nullish.
	 */
	v: unknown;
	/** Last rendered checked; -1 = checked is not controlled. */
	c: boolean | -1;
	/**
	 * Controlled-<select> projection target (a String value, or a Set of them
	 * for `multiple`); null = the select's value is not controlled.
	 */
	sv: string | Set<string> | null;
	/** A value/checked binding has run at least once (mount discriminator +
	 *  controlled↔uncontrolled flip detection). */
	sawV: boolean;
	sawC: boolean;
	/** A <select>'s last-seen defaultValue — the projection re-runs only when
	 *  it CHANGES (an unchanged default on an unrelated re-render must not
	 *  clobber the user's selection; uncontrolled selects stay user-owned). */
	dvv: unknown;
	/** True between compositionstart and compositionend (IME) — reassert and
	 *  restore both hold off so they can't cancel an active composition. */
	composing: boolean;
	/** Select re-projection already queued for the pending commit. */
	queued: boolean;
	/** Dev missing-onInput warning already evaluated for this element. */
	devChecked: boolean;
}

/**
 * Events whose dispatch can carry a user edit to a form control — React's
 * ChangeEventPlugin extraction set. Armed elements targeted by one of these
 * are restored after the discrete flush. `click` is delegated (a checkable's
 * edit STARTS there) but never ARMS the restore itself: the platform toggles
 * a checkable before its click dispatch, then fires `input`/`change` AFTER
 * it (activation post-steps) — and octane handlers are native, so they run
 * in those later dispatches. Restoring after the click flush would revert
 * the toggle before any handler could read or commit it (React avoids this
 * only because its synthetic onChange runs during the click); the follow-up
 * input/change arms the restore at the right time, and a NON-toggling click
 * (preventDefault, re-clicking a checked radio) fires no follow-up and
 * leaves no drift to restore.
 */
const RESTORE_EVENT_LIST = ['input', 'change', 'click'];
const RESTORE_EVENTS = /* @__PURE__ */ new Set(RESTORE_EVENT_LIST);

// Armed elements an in-flight dispatch touched — drained (restored) by
// maybeFlushDiscrete AFTER the discrete flush, so the restore compares the
// DOM against the values the handlers just committed. Tiny array + linear
// dedupe: one event targets one element; nesting stays single-digit.
let pendingRestores: Element[] = [];
let restoreMicrotaskScheduled = false;

// Commit-deferred controlled work, drained at the HEAD of commitEffects:
//  - select re-projection: compiled binding mounts run BEFORE the same
//    render's @for/@if construct calls, so a `<select value>` binding fires
//    while its @for options don't exist yet — the commit-phase pass
//    re-projects once the whole tree is built (React resolves selects
//    post-mount the same way).
//  - select defaultValue: same ordering problem, projected with
//    defaultSelected stamped.
//  - dev missing-onInput checks: evaluated only after ALL of the element's
//    bindings mounted (the onInput slot may be stamped after the value
//    binding in source order).
let SELECT_SYNCS: HTMLSelectElement[] = [];
let SELECT_DEFAULT_SYNCS: { el: HTMLSelectElement; value: unknown }[] = [];
let DEV_CTRL_CHECKS: Element[] = [];
let AUTOFOCUS_QUEUE: Element[] = [];

/** True when controlled commit work is queued (folds into hasPendingWork). */
function hasControlledSyncs(): boolean {
	return (
		SELECT_SYNCS.length > 0 ||
		SELECT_DEFAULT_SYNCS.length > 0 ||
		DEV_CTRL_CHECKS.length > 0 ||
		AUTOFOCUS_QUEUE.length > 0
	);
}

/**
 * Compiler-emitted binding for `autoFocus` (React parity): never an
 * attribute — the element is focused ONCE, in the commit phase of its mount
 * (after the render pass built the tree, before layout effects — so a layout
 * effect that moves focus still wins, like React's commitMount ordering).
 * Later updates are ignored (React treats autoFocus as mount-only).
 */
export function setAutoFocus(el: Element, value: unknown): void {
	if ((el as any).$$afSeen !== undefined) return; // mount-only
	(el as any).$$afSeen = true;
	if (value) AUTOFOCUS_QUEUE.push(el);
}

/** Text-entry controls (IME-capable; the dev missing-onInput warning's scope). */
function isTextEntry(el: Element): boolean {
	if (el.localName === 'textarea') return true;
	if (el.localName !== 'input') return false;
	switch ((el as HTMLInputElement).type) {
		case 'text':
		case 'search':
		case 'url':
		case 'tel':
		case 'password':
		case 'email':
		case 'number':
			return true;
	}
	return false;
}

// IME guard — DIRECT per-element listeners (not delegation), attached once at
// arm time: a user handler's stopPropagation can never starve the composing
// flag, and compositionend re-enters the restore path via a microtask even
// when the delegated dispatch was stopped. Two shared module-level handlers —
// no per-element closures.
function onCtrlCompositionStart(e: Event): void {
	const ctrl = (e.currentTarget as any).$$ctrl as ControlledState | undefined;
	if (ctrl !== undefined) ctrl.composing = true;
}
function onCtrlCompositionEnd(e: Event): void {
	const el = e.currentTarget as Element;
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined) return;
	ctrl.composing = false;
	if (pendingRestores.indexOf(el) === -1) pendingRestores.push(el);
	// The delegated compositionend dispatch normally drains this in
	// maybeFlushDiscrete; the microtask is the un-starvable fallback.
	if (!restoreMicrotaskScheduled) {
		restoreMicrotaskScheduled = true;
		queueMicrotask(() => {
			restoreMicrotaskScheduled = false;
			if (pendingRestores.length > 0) restoreControlledStates();
		});
	}
}

/** Get-or-create the element's `$$ctrl` record (first call wires listeners). */
function armControlled(el: Element): ControlledState {
	let ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined) {
		ctrl = {
			v: UNCONTROLLED,
			c: -1,
			sv: null,
			sawV: false,
			sawC: false,
			dvv: UNCONTROLLED,
			composing: false,
			queued: false,
			devChecked: false,
		};
		(el as any).$$ctrl = ctrl;
		// The restore pass rides the delegated dispatchers — an armed control
		// must hear its native edit events even when NO component listens
		// (React attaches root listeners eagerly; octane delegates lazily).
		delegateEvents(RESTORE_EVENT_LIST);
		if (isTextEntry(el)) {
			el.addEventListener('compositionstart', onCtrlCompositionStart);
			el.addEventListener('compositionend', onCtrlCompositionEnd);
		}
	}
	return ctrl;
}

/** The controlled string for a raw rendered value (nullish never reaches here). */
function toControlledString(v: unknown): string {
	return typeof v === 'string' ? v : String(v);
}

/**
 * Does the DOM value differ from the RAW rendered value? Number inputs
 * compare LOOSELY against the raw prop (React updateInput verbatim): state
 * `1` vs DOM "1.0" must NOT clobber (the user may be mid-edit), while `0` vs
 * "" must write (value={0} means "show 0"). Everything else compares the
 * exact string.
 */
function valueNeedsWrite(el: HTMLInputElement | HTMLTextAreaElement, raw: unknown): boolean {
	if ((el as HTMLInputElement).type === 'number') {
		// eslint-disable-next-line eqeqeq
		return (raw === 0 && el.value === '') || el.value != (raw as any);
	}
	return el.value !== toControlledString(raw);
}

// DEV (gated on the dev-compile `__oct_loc` stamp, like the hydration
// warnings): React's controlled↔uncontrolled flip warning.
function devWarnControlledFlip(el: Element, toControlled: boolean): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if ((el as any).__oct_loc === undefined) return;
	console.error(
		`A component is changing ${toControlled ? 'an uncontrolled' : 'a controlled'} ` +
			`${el.localName} to be ${toControlled ? 'controlled' : 'uncontrolled'}. This is likely ` +
			`caused by the value changing from ${
				toControlled ? 'undefined to a defined value' : 'a defined value to undefined'
			}, which should not happen. Decide between using a controlled or uncontrolled ` +
			`${el.localName} for the lifetime of the component (controlled: \`value\`/\`checked\`; ` +
			'uncontrolled: `defaultValue`/`defaultChecked`).',
	);
}

// DEV: queue the missing-onInput check for this commit (runs after all of the
// element's bindings mounted — see drainControlledSyncs).
function queueDevControlledCheck(el: Element, ctrl: ControlledState): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (ctrl.devChecked || (el as any).__oct_loc === undefined) return;
	if (!isTextEntry(el)) return;
	DEV_CTRL_CHECKS.push(el);
}

/**
 * Compiler-emitted binding for a controlled `value` on <input>/<textarea>
 * (spread/de-opt/legacy-compiled writes are routed here by setAttribute).
 * React semantics: the prop DRIVES the DOM property; a nullish value means
 * uncontrolled (leave the DOM alone). The value ATTRIBUTE mirrors the prop
 * (React's attribute-syncing cascade: value, else defaultValue) — an
 * attribute write never clobbers what the user typed, and it keeps SSR
 * output, form.reset() baselines, and differential byte-compares aligned.
 */
export function setValue(el: Element, value: unknown): void {
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	const ctrl = armControlled(el);
	const first = !ctrl.sawV;
	ctrl.sawV = true;
	if (value == null) {
		if (!first && ctrl.v !== UNCONTROLLED) devWarnControlledFlip(el, false);
		// React parity: mounting/flipping to uncontrolled leaves the DOM as-is.
		ctrl.v = UNCONTROLLED;
		return;
	}
	const s = toControlledString(value);
	if (first) {
		ctrl.v = value;
		queueDevControlledCheck(el, ctrl);
		// Hydration ADOPTS: the server already serialized this value, and
		// pre-hydration user input survives until the element's first real
		// commit or discrete event (React parity) — zero writes, no warnings.
		if (hydrating) return;
		// PROPERTY first (React initInput order): the write marks the control
		// DIRTY, so the attribute write below — and any later defaultValue
		// binding — can never drag the live value along.
		if (input.value !== s) input.value = s;
		// The value ATTRIBUTE mirrors the controlled value (React's
		// attribute-syncing cascade: value wins over defaultValue).
		input.defaultValue = s;
		return;
	}
	if (ctrl.v === UNCONTROLLED) devWarnControlledFlip(el, true);
	const prev = ctrl.v;
	ctrl.v = value;
	if (input.defaultValue !== s) input.defaultValue = s;
	// IME: an UNCHANGED rendered value must not cancel an active composition;
	// a genuinely changed one still wins (React: setState during composition).
	if (ctrl.composing && Object.is(prev, value)) return;
	if (valueNeedsWrite(input, value)) input.value = s;
}

/**
 * Compiler-emitted binding for a controlled `checked` on <input> (checkbox /
 * radio). Property-driven; the checked ATTRIBUTE mirrors only the INITIAL
 * state (React with attribute-syncing never updates it afterwards).
 */
export function setChecked(el: Element, value: unknown): void {
	const input = el as HTMLInputElement;
	const ctrl = armControlled(el);
	const first = !ctrl.sawC;
	ctrl.sawC = true;
	if (value == null) {
		if (!first && ctrl.c !== -1) devWarnControlledFlip(el, false);
		ctrl.c = -1;
		return;
	}
	const b = !!value;
	if (first) {
		ctrl.c = b;
		if (hydrating) return;
		// PROPERTY first (marks checkedness dirty — see setValue), then the
		// attribute baseline (React's cascade: checked wins over defaultChecked).
		if (input.checked !== b) input.checked = b;
		input.defaultChecked = b;
		return;
	}
	if (ctrl.c === -1) devWarnControlledFlip(el, true);
	ctrl.c = b;
	if (input.checked !== b) input.checked = b;
}

/**
 * Compiler-emitted binding for a controlled `value` on <select> (single and
 * `multiple`). The target is stored and projected onto the options both
 * IMMEDIATELY (idempotent) and at commit — binding mounts run before the same
 * render's @for/@if constructs, so the commit pass is what sees @for-built
 * options (React resolves selects post-mount the same way).
 */
export function setSelectValue(el: Element, value: unknown): void {
	const sel = el as HTMLSelectElement;
	const ctrl = armControlled(el);
	const first = !ctrl.sawV;
	ctrl.sawV = true;
	if (value == null) {
		if (!first && ctrl.sv !== null) devWarnControlledFlip(el, false);
		ctrl.sv = null;
		return;
	}
	if (!first && ctrl.sv === null) devWarnControlledFlip(el, true);
	if (sel.multiple) {
		if (!Array.isArray(value)) {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				console.error(
					'The `value` prop supplied to <select> must be an array if `multiple` is true.',
				);
			}
			return;
		}
		const set = new Set<string>();
		for (let i = 0; i < value.length; i++) set.add(toControlledString(value[i]));
		ctrl.sv = set;
	} else {
		if (Array.isArray(value)) {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				console.error(
					'The `value` prop supplied to <select> must be a scalar value if `multiple` is false.',
				);
			}
			return;
		}
		ctrl.sv = toControlledString(value);
	}
	// Hydration ADOPTS the server-emitted `selected` state — and must not
	// enqueue the commit sync either (the post-hydration microtask commit
	// would clobber a pre-hydration user selection).
	if (hydrating) return;
	projectSelectValue(sel, ctrl.sv, false);
	if (!ctrl.queued) {
		ctrl.queued = true;
		SELECT_SYNCS.push(sel);
	}
}

/**
 * React updateOptions verbatim: multiple → per-option set membership;
 * single → FIRST match wins (the platform deselects the rest), no match →
 * first non-disabled option. `setDefaultSelected` additionally stamps
 * option.defaultSelected (the mount-time defaultValue projection).
 */
function projectSelectValue(
	sel: HTMLSelectElement,
	sv: string | Set<string>,
	setDefaultSelected: boolean,
): void {
	const options = sel.options;
	if (typeof sv !== 'string') {
		for (let i = 0; i < options.length; i++) {
			const selected = sv.has(options[i].value);
			if (options[i].selected !== selected) options[i].selected = selected;
			if (setDefaultSelected) options[i].defaultSelected = selected;
		}
		return;
	}
	let defaultOption: HTMLOptionElement | null = null;
	for (let i = 0; i < options.length; i++) {
		if (options[i].value === sv) {
			options[i].selected = true;
			if (setDefaultSelected) options[i].defaultSelected = true;
			return;
		}
		if (defaultOption === null && !options[i].disabled) defaultOption = options[i];
	}
	if (defaultOption !== null) defaultOption.selected = true;
}

/**
 * Compiler-emitted binding for `defaultValue` — the uncontrolled escape
 * hatch. Writes the DEFAULT (the value attribute / textarea text content /
 * option defaultSelected), never the live value: a dirty control keeps what
 * the user typed. Re-synced on updates (React parity; attribute-only).
 */
export function setDefaultValue(el: Element, value: unknown): void {
	const ctrl = armControlled(el);
	if (hydrating || value == null) return;
	if (el.localName === 'select') {
		// Commit-deferred like the controlled projection (options may not
		// exist yet); a controlled `value` wins at drain time. Re-projected
		// only when the default CHANGES (React re-selects on a new
		// defaultValue; an unchanged one must not clobber the user's pick).
		if (!Object.is(ctrl.dvv, value)) {
			ctrl.dvv = value;
			SELECT_DEFAULT_SYNCS.push({ el: el as HTMLSelectElement, value });
		}
		return;
	}
	// A controlled `value` OWNS the attribute (React's cascade — the value
	// binding syncs it every commit); the default only writes when uncontrolled.
	if (ctrl.v !== UNCONTROLLED) return;
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	const s = toControlledString(value);
	if (input.defaultValue !== s) input.defaultValue = s;
}

/** Compiler-emitted binding for `defaultChecked` (uncontrolled checkables). */
export function setDefaultChecked(el: Element, value: unknown): void {
	const ctrl = armControlled(el);
	if (hydrating || value == null) return;
	// A controlled `checked` owns the attribute baseline (React's cascade).
	if (ctrl.c !== -1) return;
	const input = el as HTMLInputElement;
	const b = !!value;
	if (input.defaultChecked !== b) input.defaultChecked = b;
}

/**
 * Drain the commit-deferred controlled work — called at the head of
 * commitEffects, i.e. after the render pass built/reconciled ALL DOM (so
 * select projections see their @for-built options and the dev check sees the
 * element's full listener set). Default projections run first; a controlled
 * `value` then wins.
 */
function drainControlledSyncs(): void {
	if (AUTOFOCUS_QUEUE.length > 0) {
		const q = AUTOFOCUS_QUEUE;
		AUTOFOCUS_QUEUE = [];
		for (let i = 0; i < q.length; i++) {
			// Focus only if the commit actually connected the element (a caught
			// mount error may have torn the subtree down before this drain).
			if (q[i].isConnected) (q[i] as HTMLElement).focus();
		}
	}
	if (SELECT_DEFAULT_SYNCS.length > 0) {
		const q = SELECT_DEFAULT_SYNCS;
		SELECT_DEFAULT_SYNCS = [];
		for (let i = 0; i < q.length; i++) {
			const sel = q[i].el;
			const ctrl = (sel as any).$$ctrl as ControlledState | undefined;
			if (ctrl !== undefined && ctrl.sv !== null) continue; // controlled value owns the selection
			const v = q[i].value;
			const sv = sel.multiple
				? Array.isArray(v)
					? new Set<string>(v.map(toControlledString))
					: null
				: toControlledString(v);
			if (sv !== null) projectSelectValue(sel, sv, true);
		}
	}
	if (SELECT_SYNCS.length > 0) {
		const q = SELECT_SYNCS;
		SELECT_SYNCS = [];
		for (let i = 0; i < q.length; i++) {
			const ctrl = (q[i] as any).$$ctrl as ControlledState | undefined;
			if (ctrl === undefined) continue;
			ctrl.queued = false;
			if (ctrl.sv !== null) projectSelectValue(q[i], ctrl.sv, false);
		}
	}
	if (process.env.NODE_ENV !== 'production' && DEV_CTRL_CHECKS.length > 0) {
		const q = DEV_CTRL_CHECKS;
		DEV_CTRL_CHECKS = [];
		for (let i = 0; i < q.length; i++) {
			const el = q[i] as any;
			const ctrl = el.$$ctrl as ControlledState | undefined;
			if (ctrl === undefined || ctrl.devChecked) continue;
			ctrl.devChecked = true;
			if (ctrl.v === UNCONTROLLED) continue; // became uncontrolled before commit
			if (el.$$input !== undefined || el['$$capture:input'] !== undefined) continue;
			if (el.readOnly === true || el.disabled === true) continue;
			console.error(
				el.$$change !== undefined || el['$$capture:change'] !== undefined
					? 'You provided a `value` prop to a form field with an `onChange` handler but no ' +
							'`onInput`. octane events are NATIVE: `change` fires on blur/commit, not per ' +
							'keystroke, so typing will appear to do nothing (each keystroke reverts to the ' +
							'rendered value). Use `onInput` for per-keystroke updates, or `defaultValue` ' +
							'for an uncontrolled field.'
					: 'You provided a `value` prop to a form field without an `onInput` handler. This ' +
							'will render a read-only field. If the field should be mutable use ' +
							'`defaultValue`. Otherwise, set either `onInput` or `readOnly`.',
			);
		}
	}
}

/**
 * Restore one armed element's DOM to its last RENDERED state (value/checked/
 * selection) — React's restoreControlledState. Composition holds the restore
 * off (compositionend re-enqueues); a disconnected element has nothing to
 * restore.
 */
function restoreControlledElement(el: Element): void {
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined || ctrl.composing || !el.isConnected) return;
	if (el.localName === 'select') {
		if (ctrl.sv !== null) projectSelectValue(el as HTMLSelectElement, ctrl.sv, false);
		return;
	}
	if (ctrl.c !== -1) {
		const input = el as HTMLInputElement;
		if (input.checked !== ctrl.c) input.checked = ctrl.c;
		// A radio's drift flips its GROUP cousins too (checking one unchecks
		// another) — restore every armed cousin to ITS rendered state
		// (React's updateNamedCousins).
		if (input.type === 'radio' && input.name !== '') restoreRadioCousins(input);
	}
	if (
		ctrl.v !== UNCONTROLLED &&
		valueNeedsWrite(el as HTMLInputElement | HTMLTextAreaElement, ctrl.v)
	) {
		(el as HTMLInputElement).value = toControlledString(ctrl.v);
	}
}

function restoreRadioCousins(input: HTMLInputElement): void {
	const name = input.name;
	const group: ArrayLike<Node> =
		input.form !== null
			? input.form.elements
			: typeof document !== 'undefined'
				? document.getElementsByName(name)
				: [];
	for (let i = 0; i < group.length; i++) {
		const other = group[i] as HTMLInputElement;
		if (
			other === input ||
			other.localName !== 'input' ||
			other.type !== 'radio' ||
			other.name !== name
		) {
			continue;
		}
		const octrl = (other as any).$$ctrl as ControlledState | undefined;
		if (octrl !== undefined && octrl.c !== -1 && other.checked !== octrl.c) {
			other.checked = octrl.c;
		}
	}
}

/** Drain the event-restore queue (see maybeFlushDiscrete). */
function restoreControlledStates(): void {
	const list = pendingRestores;
	pendingRestores = [];
	for (let i = 0; i < list.length; i++) restoreControlledElement(list[i]);
}

/**
 * True when `name` is a controlled prop (`value`/`checked`) on a form tag —
 * the prop-diff loops (setSpread / patchDeoptProps) use this to BYPASS their
 * identity skip: controlled props must reassert on every commit even when the
 * rendered value is unchanged (the DOM may have drifted). The helpers diff
 * against the DOM, so the unconditional call stays cheap. The default* props
 * don't need the bypass (attribute-only; the DOM can't drift them).
 */
function isControlledHostProp(el: Element, name: string): boolean {
	switch (name.length) {
		case 5:
			if (name !== 'value') return false;
			break;
		case 7:
			if (name !== 'checked') return false;
			break;
		default:
			return false;
	}
	const t = el.localName;
	return t === 'input' || t === 'textarea' || t === 'select';
}

/**
 * Enqueue the event's target for a post-flush restore when it is an armed
 * form control and the event can carry a user edit (see RESTORE_EVENTS).
 * Called by both delegated dispatchers, right after their dispatch stamp.
 */
function maybeEnqueueRestore(event: Event): void {
	const t = event.target as any;
	if (t === null || t.$$ctrl === undefined || !RESTORE_EVENTS.has(event.type)) return;
	// A checkable's click never arms — its `input`/`change` follow-ups do
	// (see the RESTORE_EVENT_LIST comment: restoring after the click flush
	// would revert the toggle before the native handlers run).
	if (event.type === 'click') return;
	if (pendingRestores.indexOf(t) === -1) pendingRestores.push(t);
}

/**
 * Reassert every armed control in `form` — called right after an
 * octane-driven `form.reset()` (requestFormReset / a successful
 * `<form action={fn}>`): the native reset restored DEFAULTS; controlled
 * fields snap back to their rendered values (React parity). User-initiated
 * reset BUTTONS are untouched (React doesn't restore there either; controlled
 * values return at the next commit).
 */
function reassertControlledIn(form: HTMLFormElement): void {
	const els = form.elements;
	for (let i = 0; i < els.length; i++) {
		if (((els[i] as any).$$ctrl as ControlledState | undefined) !== undefined) {
			restoreControlledElement(els[i] as Element);
		}
	}
}

// ---------------------------------------------------------------------------
// Portals — createPortal renders into a foreign DOM target while staying
// part of the React-tree for context / unmount / event delegation.
// ---------------------------------------------------------------------------

interface PortalSlot {
	__kind: 'portalSlotSlot';
	block: Block | null;
	target: Element | null;
	start: Comment | null;
	end: Comment | null;
}

/**
 * Mount `body` into `target` (a foreign DOM element), as a child of the
 * current Block in the Block tree. Re-rendering the enclosing Block re-runs
 * the portal body in place. Unmounting the enclosing Block tears the portal
 * down and removes its DOM from `target`.
 */
export function portal(
	parentScope: Scope,
	slotKey: number,
	target: Element,
	body: ComponentBody,
	props: any,
	host?: Node,
	// Hoisted-helper env tuple (compiled-output Phase 2): the `__portal$N`
	// body's captured parent locals — stamped as block.extra below.
	env?: any[],
): void {
	const prev = parentScope.slots[slotKey] as PortalSlot | undefined;
	const state = renderPortalState(
		prev ?? null,
		parentScope.block,
		target,
		body,
		props,
		// `host` (passed by the compiler) is the JSX element that contains the
		// createPortal call — the natural "logical parent" for event bubbling. When
		// the portal is at top level the compiler passes the block's parentNode.
		host || parentScope.block.parentNode,
		env,
	);
	// Register on first creation (or after a target-change rebuild) so the slot is
	// torn down with its parent scope.
	if (prev !== state) {
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
}

/**
 * Mount-or-update a portal's content into `target` (a foreign element), tracked by
 * a `PortalSlot`. Shared by `portal()` (the compiler fast path for
 * `<el>{createPortal(...)}</el>`) and `childSlot` (the VALUE path — a
 * `createPortal(...)` returned from a component, sitting in a ternary, a fragment
 * root, a render function, etc.). `host` is the logical parent used for event
 * bubbling out of the portal.
 */
function renderPortalState(
	prev: PortalSlot | null,
	parentBlock: Block,
	target: Element,
	rawBody: ComponentBody | unknown,
	rawProps: any,
	host: Node,
	env?: any[],
): PortalSlot {
	const norm = normalizePortalBody(rawBody, rawProps);
	let state = prev;
	if (state === null || state.target !== target) {
		// First mount, or the portal moved to a different target → (re)build.
		if (state !== null) teardownPortalState(state);
		const start = document.createComment('portal');
		const end = document.createComment('/portal');
		// Mark the range so the raw de-opt reconciler treats it as FOREIGN content:
		// a portal may target an octane-managed element, and its nodes must survive
		// the target owner's re-renders (React parity — portals coexist with the
		// container's own children). See reconcileDeoptChildren.
		(start as any).$$portalEnd = end;
		target.appendChild(start);
		target.appendChild(end);
		// The portal owns its start/end markers (default exclusiveMarkers=false), so
		// unmountBlock removes them WITH the content — toggling a portal on/off never
		// leaves orphan `<!--portal-->` comments in a persistent target (e.g.
		// document.body across menu open/close cycles).
		const block = createBlock(
			'portal',
			parentBlock,
			target,
			start,
			end,
			norm.body,
			norm.props,
			env,
		);
		state = { __kind: 'portalSlotSlot', block, target, start, end };
		// Portal target hosts handlers stamped via the same `el.$$click = …`
		// mechanism as the main tree, so it needs the delegated event listeners too.
		// Refcounted: a target hosting two portals attaches once, detaches when the
		// last portal unmounts.
		registerDelegationTarget(target);
		renderBlock(block);
	} else {
		state.block!.body = norm.body;
		state.block!.props = norm.props;
		state.block!.extra = env;
		renderBlock(state.block!);
	}
	// Stamp `$$portalParent` on every direct child the portal placed between its
	// start/end markers. The dispatcher reads this when bubbling up: on reaching a
	// stamped node it jumps to the logical parent's DOM context instead of
	// continuing into the portal target's natural ancestors — mirroring React's
	// per-fiber portal walk so a click inside a modal bubbles up the logical tree.
	let n: ChildNode | null = state.start!.nextSibling;
	while (n !== null && n !== state.end) {
		(n as any).$$portalParent = host;
		n = n.nextSibling;
	}
	return state;
}

// Tear a portal down: fire its body's cleanups, remove its DOM (incl. the owned
// markers) from the target, and release the target's delegated listeners. Idempotent
// — safe to call twice (childSlot teardown + a later scope-unmount sweep).
function teardownPortalState(state: PortalSlot): void {
	if (state.block) {
		unmountBlock(state.block, true);
		state.block = null;
	}
	if (state.target) {
		unregisterDelegationTarget(state.target);
		state.target = null;
	}
}

// A portal body may be a ComponentBody (the octane contract + the compiler fast
// path), an inline component element `createPortal(<Comp .../>, …)` (lowered to an
// ElementDescriptor at value position), or any other renderable (host/array/text).
// Normalize to a ComponentBody + props the portal Block can render directly.
function normalizePortalBody(rawBody: any, rawProps: any): { body: ComponentBody; props: any } {
	if (typeof rawBody === 'function') {
		return { body: rawBody as ComponentBody, props: rawProps };
	}
	if (rawBody != null && rawBody.$$kind === ELEMENT_TAG && typeof rawBody.type === 'function') {
		return { body: rawBody.type as ComponentBody, props: rawBody.props };
	}
	// Host element / array / primitive / component-descriptor → render via childSlot
	// inside the portal Block (genericPortalBody has stable identity, so the portal
	// reconciles its content across re-renders rather than rebuilding).
	return { body: genericPortalBody as unknown as ComponentBody, props: rawBody };
}

function genericPortalBody(value: any, scope: Block): void {
	childSlot(scope, 0, scope.parentNode, value, scope.endMarker);
}

/**
 * `createPortal(children, target, props?)`. The first two arguments mirror ReactDOM's
 * `createPortal(children, container)`; the OPTIONAL THIRD argument is Octane-specific
 * `props` for the portal wrapper — NOT ReactDOM's `key`. That third slot is an
 * intentional divergence from React (Octane has no `key`-as-third-arg portal form). The
 * compiler recognises `{createPortal(...)}` at JSX child position and lowers it to a
 * direct `portal(...)` runtime call — no descriptor allocation on the hot path. This
 * function exists so non-JSX call sites (storing in a variable, passing through props,
 * etc.) still produce something the runtime can dispatch on.
 */
const PORTAL_TAG = Symbol.for('octane.portal');
export interface PortalDescriptor {
	$$kind: typeof PORTAL_TAG;
	// The RAW renderable handed to createPortal — a ComponentBody, an ElementDescriptor,
	// or any other renderable (host/array/text). normalizePortalBody resolves it to a
	// ComponentBody + props when the portal Block renders.
	body: ComponentBody | ElementDescriptor | unknown;
	target: Element;
	props: any;
}
export function createPortal(
	body: ComponentBody | ElementDescriptor | unknown,
	target: Element,
	props: any = undefined,
): PortalDescriptor {
	return { $$kind: PORTAL_TAG, body, target, props };
}

// ---------------------------------------------------------------------------
// Element descriptor — `createElement(Comp, props)`. The compiler lowers a JSX
// component element used at VALUE position (e.g. `root.render(<App foo={x}/>)`)
// to this call, so JSX-as-a-value matches React's `root.render(<App/>)` shape.
// It is a plain { type, props } record (like a ReactElement). `root.render`
// unwraps it; props are evaluated fresh at each call site, so re-rendering with
// `root.render(<App foo={next}/>)` updates props while keeping `type` identity.
// ---------------------------------------------------------------------------
const ELEMENT_TAG = Symbol.for('octane.element');
export interface ElementDescriptor<P = any> {
	$$kind: typeof ELEMENT_TAG;
	// A compiled ComponentBody (the fast/common case, e.g. `root.render(<App/>)`)
	// OR a host tag string (`'li'`) — the latter is produced when host JSX appears
	// at a VALUE position (a `.map(...)` callback, a function return, an array
	// literal) and is rendered by the runtime de-opt path (see `renderDeopt`).
	type: ComponentBody<P> | string;
	props: P;
	// React-style `key`, lifted out of props. Consulted by the de-opt list path
	// when this descriptor is an item of an array child.
	key: any;
	// Children passed to `createElement(type, props, ...children)` (host de-opt).
	// `null` for the component-value form (children flow through the component).
	children: any;
}
// React-shape `createElement(type, props, ...children)`. Two-arg calls
// (`createElement(Comp, props)`) stay the component-value form the compiler emits
// for `{<Comp/>}`. With a string `type` and/or explicit children it produces a
// host descriptor for the runtime de-opt renderer. `key` is lifted out of props
// (React semantics — `key` is never a real prop).
export function createElement<P>(
	type: ComponentBody<P> | string,
	props?: P,
	...children: any[]
): ElementDescriptor<P> {
	const src = (props ?? null) as any;
	const key = src != null && src.key != null ? src.key : null;
	const hasPositional = children.length > 0;
	const kids = hasPositional ? (children.length === 1 ? children[0] : children) : src?.children;
	// Multiple positional children → a fresh array of FIXED siblings (never reordered).
	// Tag it so the de-opt list keys them by index without the missing-key warning that
	// is meant for `.map()` results. (A single child is passed through as-is — a lone
	// `.map()` array stays untagged and keeps the warning.)
	if (children.length > 1) POSITIONAL_CHILDREN.add(children);
	// Build the descriptor's props WITHOUT mutating the caller's object, with `key`
	// lifted OUT of props (React semantics — `key` is never a real prop).
	//
	// React-shape contract: positional children ARE `props.children`. A COMPONENT
	// descriptor reaches its body through componentSlot, which forwards `props` only
	// (not `descriptor.children`) — so a component that reads `{props.children}`
	// (rendered via childSlot) needs them mirrored into props. Host descriptors also
	// expose children through `props.children`, matching React element shape and making
	// clone/render-prop patterns in React ecosystem bindings preserve host children.
	// Positional children override an explicit `props.children`, matching React.
	//
	// We copy-on-write: a fresh props object is allocated only when there's a `key` to
	// strip or positional children to fold in, so the compiler's hot 2-arg
	// `createElement(Comp, props)` path stays allocation-free and never touches the
	// caller's object.
	const stripKey = src != null && 'key' in src;
	const addChildren = hasPositional;
	let p: any = src ?? {};
	if (stripKey || addChildren) {
		// Manual copy-minus-key, NOT `{...src}` + `delete p.key`: deleting a
		// property drops the object into V8 dictionary mode (no enum cache),
		// which makes every later for-in/spread over these props slow — memo's
		// shallowEqualProps measurably regressed on value-position rows with it.
		p = {};
		if (src != null) {
			// hasOwn guard: spread copies OWN enumerable keys only; for-in would
			// also pick up inherited enumerables.
			for (const k in src) {
				if (k !== 'key' && hasOwnProp.call(src, k)) p[k] = (src as any)[k];
			}
		}
		if (addChildren) p.children = kids;
	}
	return { $$kind: ELEMENT_TAG, type, props: p as P, key, children: kids ?? null };
}
function isElementDescriptor(v: any): v is ElementDescriptor {
	return v != null && v.$$kind === ELEMENT_TAG;
}
function isHostDescriptor(v: any): v is ElementDescriptor & { type: string } {
	return v != null && v.$$kind === ELEMENT_TAG && typeof v.type === 'string';
}

// ---------------------------------------------------------------------------
// React-compatible `isValidElement` / `cloneElement` / `Children`.
//
// These operate on octane's element descriptors (`createElement` / JSX-at-value)
// and children VALUES, mirroring React's public API so libraries that inspect or
// re-project children — a Radix-style `Slot`/`asChild`, `Children.only`, etc. —
// port unchanged. Children traversal flattens nested arrays and treats
// `null`/`undefined`/booleans as empty (visited as `null`, matching React's
// `traverseAllChildren`); `toArray`/`map` drop the empties from their results.
// ---------------------------------------------------------------------------

/** True if `v` is an element from `createElement` / JSX-at-value (React's `isValidElement`). */
export function isValidElement(v: any): v is ElementDescriptor {
	return isElementDescriptor(v);
}

/**
 * `cloneElement(element, config?, ...children)` — a new descriptor with `element`'s
 * props shallow-merged under `config` (config wins), `key` overridden by `config.key`,
 * and children replaced by any passed positionally (else the original children are kept).
 * `ref` is a normal prop here (octane is ref-as-prop), so it merges like any other.
 */
export function cloneElement<P>(
	element: ElementDescriptor<P>,
	config?: any,
	...children: any[]
): ElementDescriptor<P> {
	if (!isElementDescriptor(element)) {
		throw new Error(
			'cloneElement: the first argument must be an element (from createElement / JSX).',
		);
	}
	const props: any = { ...(element.props as any) };
	let key = element.key;
	if (config != null) {
		if (config.key !== undefined && config.key !== null) key = config.key;
		for (const name in config) {
			if (name === 'key') continue;
			if (Object.prototype.hasOwnProperty.call(config, name)) props[name] = config[name];
		}
	}
	const n = children.length;
	let kids: any;
	if (n === 1) {
		kids = children[0];
	} else if (n > 1) {
		POSITIONAL_CHILDREN.add(children);
		kids = children;
	} else {
		// No new children: reuse `config.children` (now merged into props) or the original.
		kids = 'children' in props ? props.children : element.children;
	}
	// Components read `props.children`; host descriptors carry children on the descriptor
	// and never fold them into props (the de-opt reconciler owns them) — mirror createElement.
	if (typeof element.type === 'function') props.children = kids;
	else if ('children' in props) delete props.children;
	return { $$kind: ELEMENT_TAG, type: element.type, props, key, children: kids ?? null };
}

// Visit each leaf of `children` (flattening arrays), passing empties through as `null`.
// A top-level nullish `children` visits nothing (React returns 0). Returns the visit count.
function traverseChildren(children: any, fn: (child: any, index: number) => void): number {
	if (children == null) return 0;
	let index = 0;
	const walk = (node: any): void => {
		if (Array.isArray(node)) {
			for (let i = 0; i < node.length; i++) walk(node[i]);
			return;
		}
		fn(node == null || typeof node === 'boolean' ? null : node, index++);
	};
	walk(children);
	return index;
}

export const Children = {
	/** Iterate children, flattening arrays; empties are visited as `null` (React parity). */
	forEach(children: any, fn: (child: any, index: number) => void): void {
		traverseChildren(children, fn);
	},
	/** Map children to a flat array; empty inputs are visited, empty results are dropped. */
	map<T>(children: any, fn: (child: any, index: number) => T): T[] | null | undefined {
		if (children == null) return children as null | undefined;
		const out: T[] = [];
		traverseChildren(children, (child, i) => {
			const mapped = fn(child, i);
			if (Array.isArray(mapped)) {
				for (const m of mapped) if (m != null && typeof m !== 'boolean') out.push(m as T);
			} else if (mapped != null && typeof mapped !== 'boolean') {
				out.push(mapped);
			}
		});
		return out;
	},
	/** Number of children `map`/`forEach` would visit (empties included, like React). */
	count(children: any): number {
		return traverseChildren(children, () => {});
	},
	/** Flatten children into an array, dropping `null`/`undefined`/boolean entries. */
	toArray(children: any): any[] {
		const out: any[] = [];
		traverseChildren(children, (child) => {
			if (child != null) out.push(child);
		});
		return out;
	},
	/** Assert `children` is a single element and return it (`React.Children.only`). */
	only<T>(children: T): T {
		if (!isElementDescriptor(children)) {
			throw new Error('Children.only expected to receive a single element child.');
		}
		return children;
	},
};

// ---------------------------------------------------------------------------
// Component slot — JSX `<Foo>` / `<ctx.Provider>` invocation as a Block
// ---------------------------------------------------------------------------

interface CompSlot {
	__kind: 'componentSlotSlot';
	// Null on the client `singleRoot` path: the component's single root element
	// self-delimits (block.startMarker === block.endMarker === that element), so
	// no `comp`/`/comp` markers are minted. Non-null otherwise (and always after
	// hydration, which adopts the server's range).
	start: Comment | null;
	end: Comment | null;
	/** singleRoot client mount: insert anchor for the self-marked element. */
	anchor: Node | null;
	singleRoot: boolean;
	/**
	 * M3 inherit-range (docs/comment-marker-elision-plan.md): start/end are
	 * BORROWED from the parent block — the call site is the sole root of its
	 * `@{}` body, so the body block's range IS this slot's range (both null =
	 * whole-container mode under a root / owns-parent parent). The slot never
	 * owns markers: teardown sweeps between them (block.exclusiveMarkers) or
	 * clears the container; identity swaps re-render in place; transitions take
	 * the probe path (a marker-pair WIP commit would change the parent's
	 * shape); hydration adopts NOTHING (the server skipped the frame pair).
	 */
	inherited: boolean;
	block: Block | null;
	// The component identity last rendered: a ComponentBody, or a host tag STRING
	// (a dynamic JSX tag that resolved to e.g. 'h1' — see the string-comp branch
	// in componentSlot). Compared with `!==` either way, so 'h1'→'h1' updates in
	// place while 'h1'→'h2' / string↔function flips tear down and remount.
	currentComp: ComponentBody | string | null;
	// Last-render `key` value. Sentinel `NO_KEY` when the slot was created
	// without a key arg, or when the prior render didn't supply one — so a
	// first render with `key=undefined` followed by a subsequent render with
	// `key=undefined` doesn't spuriously remount. Compared with Object.is so
	// NaN keys are stable and 0 / -0 are distinguished.
	prevKey: any;
}

const NO_KEY: unique symbol = Symbol('NO_KEY');

/**
 * Mount/update a component invoked from JSX. Each invocation creates a Block
 * (so hooks/effects are scoped properly). If the component identity changes
 * across renders (dynamic-component / element-type swap), the old Block is
 * torn down and a fresh one mounted in its place. When a `key` arg is
 * supplied and changes between renders (Object.is compare), the slot also
 * tears down + remounts — matches React's key-driven identity reset: useState
 * resets, useEffect cleanups fire, refs null out, the subtree gets a fresh
 * Block with a fresh hook bag.
 */
export function componentSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string,
	props: any,
	anchor?: Node | null,
	key?: any,
	// true = the compiler PROVED the callee renders one element (same-module
	// analysis); 2 = the call site qualifies syntactically (bare identifier, no
	// key/spread/children) but the callee is cross-module — elide iff the
	// callee carries the compiler's `$$singleRoot` definition-site stamp
	// (docs/comment-marker-elision-plan.md M1).
	singleRoot?: boolean | 2,
	// M3 inherit-range: the call site is the SOLE root of its `@{}` body —
	// borrow the parent block's marker range instead of minting/adopting; the
	// server skipped the child's frame pair at this site (inheritSoleCompRoot
	// in the compiler stamps both sides from the same AST). Declined at
	// runtime when the parent block has no coherent borrowable regime.
	inherit?: boolean,
): void {
	const parentBlock = parentScope.block;
	// A STRING comp: a dynamic JSX tag — `<props.parts.title>`, `<Tag/>` with
	// `const Tag = 'h1'`, `<{expr}/>` — that resolved to a HOST tag name at
	// runtime. Render it as a host element through `hostStringTagBody`: the
	// block's props is a host DESCRIPTOR carrying the tag + props + the compiled
	// `children` render-fn, which renders INLINE as the element's entire content
	// (no nested block). That matches the server's emission (ssrComponent's
	// string branch inlines the fn's HTML like a static host tag), so hydration
	// adopts `<!--[--><tag>…</tag><!--]-->` uniformly. Identity below still
	// compares the raw `comp` string: same tag → update in place (props patched,
	// children reconciled); a different tag or a string↔function flip → tear
	// down + remount (React's element-type reset).
	let body = comp as ComponentBody;
	let renderProps = props;
	if (typeof comp === 'string') {
		body = hostStringTagBody as unknown as ComponentBody;
		renderProps = {
			$$kind: ELEMENT_TAG,
			type: comp,
			props,
			key: null,
			children: props != null ? props.children : null,
		} satisfies ElementDescriptor;
	}
	let state = parentScope.slots[slotKey] as CompSlot | undefined;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Comment | null = null;
		let inherited = false;
		// M3 inherit-range: borrow the parent block's range — this site is the
		// sole root of its body, so the body block's range IS the slot's range.
		// Resolved BEFORE the hydration probes: the server emitted NO frame pair
		// here, and cursor-probing would misadopt the child's own first content
		// marker. Borrow only a coherent regime — a real Block (LiteBlockImpl
		// carries no startMarker) whose markers are BOTH comments (a marked
		// range) or BOTH null (root / owns-parent whole-container). Anything
		// else declines into the regular regimes below; declines are
		// compile-time unreachable under hydration (bodies with an inherit root
		// are stamped lite-ineligible, and element-marked singleRoot parents
		// can't own a noTemplate body).
		// Boundary builtins decline by IDENTITY (covers member/aliased/dynamic
		// tags the compile-time name check can't see — `<octane.Suspense>`,
		// `const S = Suspense`): their pairs are load-bearing for streaming.
		// ssrComponent declines on the same identities, so the server emitted a
		// pair exactly where this falls through to the adoption regimes below.
		if (inherit === true && (comp === Suspense || comp === ErrorBoundary)) inherit = false;
		if (inherit === true && parentBlock !== null) {
			const ps = (parentBlock as { startMarker?: Node | null }).startMarker;
			const pe = (parentBlock as { endMarker?: Node | null }).endMarker;
			if (ps != null && pe != null && ps !== pe && ps.nodeType === 8 && pe.nodeType === 8) {
				start = ps as Comment;
				end = pe as Comment;
				inherited = true;
			} else if (ps === null && pe === null) {
				// Whole-container mode: the parent block owns everything under
				// `domParent` (a root block, or an owns-parent childSlot block).
				inherited = true;
			}
		}
		// Resolve the server's `<!--[-->` to adopt: directly when anchored, or — for
		// an appended (anchor-less, all-component-children) child, OR a sole-hole
		// child whose anchor is its body's end marker (a `@try { <Comp/> }` arm) —
		// by consulting the parked cursor (host.firstChild for the first appended
		// child; the cursor is already on the open marker otherwise).
		let open: Node | null = null;
		if (!inherited && hydrating && isBlockOpen(anchor ?? null)) {
			open = anchor as Node;
		} else if (!inherited && hydrating && !isBlockOpen(anchor ?? null)) {
			// The anchor is null (appended child) or a non-open marker (the slot is the
			// sole hole of a control-flow arm, so its anchor is the arm's end marker).
			// In both cases mountTry/renderBlock parked the cursor on the server range's
			// `<!--[-->`; adopt from it, the same way childSlot's cursor branch does.
			let c: Node | null = hydrateNode;
			if (c === null || c.parentNode !== domParent) c = domParent.firstChild;
			if (c !== null && isBlockOpen(c)) open = c;
		}
		if (inherited) {
			// Borrowed range resolved above; hydration adopts NOTHING — the cursor
			// already sits on this component's first content node.
		} else if (open !== null) {
			// Adopt the server range: its comments become our markers, cursor → content.
			start = open as Comment;
			end = matchingClose(open);
			hydrateNode = start.nextSibling;
		} else if (singleRoot === true || (singleRoot === 2 && (comp as any).$$singleRoot === true)) {
			// Client singleRoot: NO markers — the component's single root element
			// self-delimits (set as block.startMarker/endMarker after render below).
			// The `2` form resolves cross-module callees by their definition-site
			// stamp; a string tag or unstamped component falls through to markers.
			start = null;
			end = null;
		} else {
			start = document.createComment('comp');
			end = document.createComment('/comp');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (e.g. when this slot lives in a multi-root template
			// and must sit before its enclosing block's endMarker).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		state = {
			__kind: 'componentSlotSlot',
			start,
			end,
			anchor: anchor ?? null,
			singleRoot: start === null && !inherited,
			inherited,
			block: null,
			currentComp: null,
			prevKey: NO_KEY,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	// Key-driven remount: when the compiler emitted a key arg AND its value
	// changed since last render, force `comp !== state.currentComp` semantics
	// even if the component identity is unchanged. Null out currentComp so the
	// existing tear-down branch below fires; prevKey is updated after so we
	// don't loop on the same key. `key === undefined` means "no key this
	// render" and is a no-op so React-style optional-key callers don't pay.
	if (key !== undefined && state.prevKey !== NO_KEY && !Object.is(key, state.prevKey)) {
		state.currentComp = null;
	}
	state.prevKey = key === undefined ? NO_KEY : key;
	if (comp !== state.currentComp) {
		// Off-screen swap (React WIP model): a TRANSITION swap to a DIFFERENT component
		// that may suspend → render it off-screen first WITHOUT tearing down the old. If
		// it suspends, dispose + re-throw so the enclosing tryBlock holds the old component
		// on screen + resumes (the resume re-renders the boundary, re-driving this swap).
		// Urgent + hydration keep the legacy path.
		if (state.block !== null && !hydrating && parentBlock.currentRenderMode === 'transition') {
			if (!state.singleRoot && !state.inherited && state.end !== null) {
				// COMMIT the WIP (no double render): the off-screen block already owns a
				// `<!--wip-->`/`<!--/wip-->` pair, which is EXACTLY componentSlot's non-
				// singleRoot regime (the slot's start/end ARE the block's owned markers,
				// exclusiveMarkers=false). On completion we adopt that pair as the slot's
				// markers and rename it in place. The wip pair was inserted right after
				// `state.end`, so once the old range (start..end inclusive) is unmounted the
				// pair sits exactly where the old range was — no DOM move needed. We rename
				// the comments rather than replacing them: descendant slots inside the WIP
				// (e.g. a return-slot childSlot) may anchor on `wip.end`, so it must survive.
				const r = renderOffscreen(parentBlock, domParent, state.end, body, renderProps);
				if (r.suspended || r.error) {
					disposeWip(r.wip);
					if (r.error) throw r.error;
					throw new SuspenseException(r.suspended);
				}
				r.wip.start.data = 'comp';
				r.wip.end.data = '/comp';
				// Old block owns state.start/state.end (exclusiveMarkers=false) → removed
				// inclusive of its markers, leaving the (renamed) wip pair in position.
				unmountBlock(state.block);
				state.start = r.wip.start;
				state.end = r.wip.end;
				state.block = r.wip.block;
				state.currentComp = comp;
				spliceWipCapture(r.wip);
				return;
			}
			// singleRoot + INHERITED slots keep the PROBE + discard double render:
			// singleRoot self-marks with a single root element (no comment markers), so
			// committing a comment-marked WIP block would change the DOM shape and break
			// the self-marking cascade an enclosing @if relies on; an inherited slot's
			// markers BELONG to the parent block, so adopting a wip pair would change
			// the parent's range shape. Probe off-screen to surface a suspend/error,
			// discard, then fall through to the legacy swap below. (An inherited slot's
			// probe anchor is the borrowed end marker — the wip renders after it,
			// outside the parent's range, and is disposed before the swap.)
			const probeAfter = state.end ?? state.anchor;
			if (probeAfter !== null) {
				const r = renderOffscreen(parentBlock, domParent, probeAfter, body, renderProps);
				disposeWip(r.wip);
				if (r.error) throw r.error;
				if (r.suspended) throw new SuspenseException(r.suspended);
			}
		}
		if (state.block) {
			if (state.inherited) {
				// Borrowed range (M3): the markers belong to the PARENT block —
				// unmountBlock sweeps BETWEEN them (the block was created with
				// exclusiveMarkers=true) and leaves them in place; whole-container
				// mode (null markers) clears the container the parent owns (the
				// root-block precedent — unmountBlock removes no DOM for a
				// null-marker dynamic block). Never mint replacements: the remount
				// below re-renders into the same borrowed range.
				unmountBlock(state.block);
				if (state.start === null) {
					while (domParent.firstChild) domParent.removeChild(domParent.firstChild);
				}
			} else if (state.singleRoot) {
				// Self-marked block — unmountBlock removes exactly the root element
				// (block.startMarker === endMarker === it); nothing to recreate.
				unmountBlock(state.block);
			} else {
				// The slot's `state.start`/`state.end` markers ARE the previous block's
				// range, so unmountBlock removes them along with the inner DOM. Capture
				// the position just outside the slot (the node that came AFTER our end
				// marker) so we can re-create fresh markers at the same logical
				// location for the new comp to mount into. `after` may be `null` when
				// the slot was at the end of `domParent` — insertBefore treats it as
				// appendChild.
				const after = state.end!.nextSibling;
				unmountBlock(state.block);
				const newStart = document.createComment('comp');
				const newEnd = document.createComment('/comp');
				domParent.insertBefore(newStart, after);
				domParent.insertBefore(newEnd, after);
				state.start = newStart;
				state.end = newEnd;
			}
		}
		state.currentComp = comp;
		if (state.singleRoot) {
			// Client singleRoot self-mark (mirrors mountItem): render with
			// endMarker = the slot's anchor, then promote the inserted root element
			// to be the block's own start === end so teardown removes exactly it.
			// The `finally` matters because a single-root component can still SUSPEND
			// or THROW during render (e.g. `use(rejectedPromise)`): then it inserts
			// nothing, so we leave start/end null and unmountBlock no-ops for it
			// (rather than capturing a stale sibling).
			const before = state.anchor ? state.anchor.previousSibling : domParent.lastChild;
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				null,
				state.anchor,
				body,
				renderProps,
			);
			state.block = b;
			try {
				renderBlock(b);
			} finally {
				const last = state.anchor ? state.anchor.previousSibling : domParent.lastChild;
				if (last !== null && last !== before) {
					b.startMarker = last;
					b.endMarker = last;
				}
			}
		} else {
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				state.start,
				state.end,
				body,
				renderProps,
			);
			// Borrowed range (M3): teardown must sweep BETWEEN the parent's
			// markers, never remove them (the branch-block precedent).
			if (state.inherited) b.exclusiveMarkers = true;
			state.block = b;
			renderBlock(b);
		}
	} else if (state.block) {
		// `memo(Component)` — skip the body when new props shallow-equal the
		// committed props (React.memo's contract; see tryMemoBail). A string comp
		// is never memo-wrapped, so it falls through to the re-render below.
		if (tryMemoBail(state.block, comp, props)) return;
		state.block.props = renderProps;
		renderBlock(state.block);
	}
	// Hydration: advance the cursor PAST this component's adopted range so the next
	// sibling adopts from the right node. The body itself doesn't reliably leave the
	// cursor at the end — an EMPTY component (`<></>`, e.g. the router's
	// <Transitioner/>) renders nothing, so without this the cursor stays parked on
	// the component's own `<!--]-->` and the following sibling desyncs. Mirrors
	// forBlock's `hydrateNode = state.end.nextSibling`. (singleRoot is client-only —
	// during hydration the server always wraps the output, so state.end is set.)
	// An INHERITED slot adopted nothing: its end is the PARENT's marker and it has
	// no following sibling (sole root) — leave the cursor where the body put it.
	if (hydrating && !state.inherited && state.end !== null) hydrateNode = state.end.nextSibling;
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

interface ChildSlot {
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
	block: Block | null;
	text: Text | null;
	currentComp: ComponentBody | null;
	// True when `currentComp` is a bare render-FUNCTION child (a `.tsrx` `{children}`
	// body, whose identity changes every render) rather than a stable component
	// reference. Lets the reconcile swap the block body in place by SLOT instead of
	// re-mounting on every identity change (which loops when effects re-render).
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
}

// `true`/`false`/`null`/`undefined` render as empty (React parity); everything
// else stringifies. Text-node `.data` is literal, so no HTML escaping here (that
// is only the server's concern, where output is serialized into markup).
function coerceChildText(v: unknown): string {
	return v == null || v === false || v === true ? '' : String(v);
}

// ---------------------------------------------------------------------------
// Off-screen (WIP-model) rendering — React's "render the new tree off the current
// one, commit atomically" applied per-swap. When a TRANSITION render replaces
// committed content with a NEW subtree that may suspend, we render the new subtree
// with its own markers placed OUTSIDE the committed slot range (so the old content
// is untouched and stays on screen), capturing its effects. If it completes we move
// it into place + tear down the old (atomic commit). If it suspends we discard the
// partial and route to the enclosing tryBlock, whose EXISTING transition hold keeps
// the old content live (branch===1, savedDom===null) and resumes on settle. Urgent
// (non-transition) + hydration renders keep the legacy clear-then-render path.
// ---------------------------------------------------------------------------

// Render `body(props)` off-screen: fresh `start`/`end` markers inserted right AFTER
// `afterNode` (so OUTSIDE a slot range that ends at `afterNode`), in `domParent`, with
// effects/refs captured (WIP_CAPTURE) so they don't fire until commit. `parentBlock`
// is the LIVE parent so suspends route up the real tryBlock chain and context resolves
// against live providers — only the DOM marker position is off to the side.
function renderOffscreen(
	parentBlock: Block,
	domParent: Node,
	afterNode: Node,
	body: ComponentBody,
	props: any,
	// Block kind for the off-screen block. Only 'root' is behaviorally special, so
	// this is DOM-shape fidelity (branch commits pass 'control-flow' to mirror their
	// in-place blocks), not correctness — 'dynamic' works for every non-root caller.
	kind: BlockKind = 'dynamic',
	// Hoisted-helper env tuple (compiled-output Phase 2): a branch-swap WIP whose
	// body is a CAPTURING hoisted helper destructures `__extra` — the wip block
	// must carry the construct's env or that destructure throws off-screen.
	env?: any[],
): { wip: OffscreenWip; suspended: any; error: any } {
	const start = document.createComment('wip');
	const end = document.createComment('/wip');
	const ref = afterNode.nextSibling;
	domParent.insertBefore(start, ref);
	domParent.insertBefore(end, ref);
	const capture: OffscreenCapture = { effects: [[], [], []], refs: [], stores: [] };
	const prev = WIP_CAPTURE;
	WIP_CAPTURE = capture;
	const block = createBlock(kind, parentBlock, domParent, start, end, body, props, env);
	let suspended: any = null;
	let error: any = null;
	try {
		renderBlock(block);
	} catch (err) {
		if (isSuspenseException(err)) suspended = (err as SuspenseException).thenable;
		else error = err;
	} finally {
		WIP_CAPTURE = prev;
	}
	return { wip: { block, start, end, capture, domParent }, suspended, error };
}

// Splice a COMPLETED off-screen WIP's captured effects/refs/store-syncs back into the
// live queues so the surrounding commit drains them (child-first, now that the WIP's
// nodes are connected). Shared by every commit site — commitOffscreen (childSlot, which
// also DOM-moves the range) and the componentSlot / renderBranchSlot commit branches
// (which adopt the WIP's markers in place, so no DOM move is needed).
function spliceWipCapture(wip: OffscreenWip): void {
	for (let p = 0 as Phase; p < 3; p++) {
		const src = wip.capture.effects[p];
		for (let i = 0; i < src.length; i++) effectQueues[p].push(src[i]);
	}
	for (let i = 0; i < wip.capture.refs.length; i++) refAttachQueue.push(wip.capture.refs[i]);
	// Store-syncs enqueued off-screen now belong to committed DOM — hand them to the
	// live queue so the surrounding commit's drainStoreSyncs reconciles them.
	for (let i = 0; i < wip.capture.stores.length; i++) storeSyncQueue.push(wip.capture.stores[i]);
}

// Commit a COMPLETED off-screen WIP: move its node range into final position (before
// `beforeNode`) and splice its captured effects/refs back into the live queues so the
// surrounding commit drains them (child-first, now that the nodes are connected).
function commitOffscreen(wip: OffscreenWip, beforeNode: Node): void {
	const parent = wip.domParent;
	let n: Node | null = wip.start;
	while (n !== null) {
		const next: Node | null = n.nextSibling;
		parent.insertBefore(n, beforeNode);
		if (n === wip.end) break;
		n = next;
	}
	spliceWipCapture(wip);
}

// Discard an off-screen WIP (suspended or superseded): remove its node range + fire any
// partial cleanups. Captured effects/refs are dropped (they never ran).
function disposeWip(wip: OffscreenWip): void {
	unmountBlock(wip.block, true);
}

// Remove the slot's current content (Block, Text, or pure-host node) while
// preserving its marker pair, so a mode switch (or component-identity swap)
// rebuilds in place.
function clearChildContent(state: ChildSlot): void {
	const hadBlock = state.block !== null;
	if (state.block !== null) {
		// Fire the subtree's cleanups but DON'T let unmountBlock strip the DOM —
		// it would take our markers with it. We remove the content nodes by hand.
		unmountBlock(state.block, false);
		state.block = null;
	}
	if (state.ownerHost !== null) {
		// OWNS-PARENT: the slot owns every child of the element — remove them all.
		// (Block cleanups already ran above; detach refs only on the blockless
		// path, mirroring the marker-range sweep below.)
		const host = state.ownerHost;
		let n: Node | null = host.firstChild;
		while (n !== null) {
			const next: Node | null = n.nextSibling;
			if (!hadBlock) detachDeoptTreeRefs(n, null);
			host.removeChild(n);
			n = next;
		}
	} else if (state.start !== null) {
		// Component (or hydrated) range: sweep everything between the markers —
		// covers a multi-node component body as well as any leftover text node.
		// Block teardown above already detached every de-opt ref it owns
		// (unmountBlock's deoptNode hook + the slot walk), so detach here only on
		// the blockless path — the pure-host node (or hydrated leftovers), whose
		// subtree may carry stamped refs.
		const parent = state.start.parentNode;
		if (parent !== null) {
			let n: Node | null = state.start.nextSibling;
			while (n !== null && n !== state.end) {
				const next: Node | null = n.nextSibling;
				if (!hadBlock) detachDeoptTreeRefs(n, null);
				parent.removeChild(n);
				n = next;
			}
		}
	} else if (state.text !== null) {
		// Client text path: a single tracked Text node, no start marker to sweep.
		// (A MARKED pure-host node never appears here: the marked host branch of
		// childSlot mints `start` before it ever sets `hostNode`, so a live marked
		// hostNode is always swept by the marker-range branch above.)
		state.text.remove();
	} else if (state.hostNode !== null && state.hostNode.parentNode !== null) {
		// ANCHORLESS pure-host slot (end === null, no markers): remove the
		// self-delimiting node directly — the marker sweep above has nothing to
		// anchor on. Reached via disposeReturnSlot's kind-flip teardown; childSlot's
		// own mode flips promote to markers before ever clearing.
		detachDeoptTreeRefs(state.hostNode, null);
		state.hostNode.parentNode.removeChild(state.hostNode);
	}
	state.text = null;
	state.currentComp = null;
	// The marker sweep above (or the direct removes) detached any pure-host node, so
	// drop the stale reference — a later pure-host render must rebuild, not "reuse" a
	// detached element.
	state.hostNode = null;
}

// ---------------------------------------------------------------------------
// Runtime de-opt renderer — renders dynamically-produced markup that appears at
// a VALUE position: host JSX returned from a `.map(...)` callback or a function,
// an array of elements (incl. one passed through props), or a lone host
// descriptor. The compiled-template path stays the fast path; this is the sound
// fallback React-shaped code relies on (we can't statically prove `items.map` is
// a list, and arrays arrive via many non-`.map` paths).
//
// Host elements are RECONCILED in place across re-renders (reconcileDeoptNode):
// same-tag elements are reused — props patched, children matched by key/position —
// so DOM-resident state (input value, focus, selection, scroll, media) survives.
// `@for (...; key ...)` remains the compiled fast path. Component descriptors in
// this path are rendered via real Blocks (hostElementBody / the childSlot component
// path) so their hooks/state reconcile too.
// ---------------------------------------------------------------------------

let _deoptKeyWarned = false;
function deoptKey(item: any, index: number): any {
	if (item != null && item.$$kind === ELEMENT_TAG && item.key != null) return item.key;
	// React parity: unkeyed array children fall back to the index, with a one-time
	// dev warning. (Suppressed during hydration adoption — markers drive matching.)
	if (process.env.NODE_ENV !== 'production' && !_deoptKeyWarned && !hydrating) {
		_deoptKeyWarned = true;
		console.warn(
			'Octane: each element in an array child should have a unique "key" prop ' +
				'(e.g. `items.map((x) => <li key={x.id}>…</li>)`). Falling back to the array ' +
				'index, which can reconcile incorrectly on reorder — for keyed lists prefer ' +
				'`@for (...; key ...)`.',
		);
	}
	return index;
}

// `createElement(tag, props, a, b, …)` collapses MULTIPLE positional children into a
// fresh array. Those are FIXED siblings (they never reorder), so the de-opt list keys
// them by index SILENTLY — unlike a `.map()` result, where a missing key is a real
// reorder hazard worth warning about. createElement tags its positional arrays in
// this set so childSlot can pick the silent key function.
const POSITIONAL_CHILDREN = new WeakSet<object>();

// Index key WITHOUT the missing-key warning — used for positional children arrays.
function deoptKeyPositional(item: any, index: number): any {
	return item != null && item.$$kind === ELEMENT_TAG && item.key != null ? item.key : index;
}

// Compiler contract: a VALUE-position JSX fragment (`<>…</>` in `.tsx` bodies,
// and every MDX document root) lowers to an array literal — FIXED siblings in
// source order, i.e. React's "static children" (`jsxs`), which React never
// key-warns. The compiler wraps that literal in this tag so the de-opt list
// keys it by index silently, exactly like `createElement`'s positional-children
// arrays above. Tagged at ANY length (a fragment's lone unkeyed child — or an
// interleaved text item like MDX's `"\n"`, which can never carry a key — must
// not warn either); only runtime-built arrays (`.map()` results, arrays through
// props) keep the warning.
export function positionalChildren(children: any[]): any[] {
	POSITIONAL_CHILDREN.add(children);
	return children;
}

// Apply ONE host prop, reusing the same helpers the compiler emits (className/style/
// setAttribute + `$$type` delegated-event slots + deferred ref attach).
function applyDeoptProp(el: Element, name: string, v: any, ownerBlock: Block): void {
	if (name === 'ref') {
		if (v != null) queueRefAttach(ownerBlock, () => attachRef(v, el));
	} else if (name === 'className' || name === 'class') {
		setDeoptClass(el, v);
	} else if (name === 'style') {
		setStyle(el as HTMLElement, v, undefined);
	} else {
		// eventSlot returns non-null exactly for `on<Upper>` delegated-handler names
		// (the same classification setSpread/applyHostProps use).
		const ev = eventSlot(name);
		if (ev !== null) {
			(el as any)[ev.key] = v;
			if (ev.capture) delegateCaptureEvents([ev.type]);
			else delegateEvents([ev.type]);
		} else {
			setAttribute(el, name, v);
		}
	}
}

// React contract: `dangerouslySetInnerHTML` and `children` are mutually exclusive —
// the raw HTML owns the element's content. When present, the de-opt paths must SKIP
// child reconciliation entirely: applyDeoptProps/patchDeoptProps already wrote
// `el.innerHTML`, and running childSlot/reconcileDeoptChildren with (empty) children
// would wipe it. (SSR already implements raw-HTML-wins; see runtime.server.ts.)
// Supplying BOTH is a programming error — throw like React (silently letting the
// raw HTML win would hide the author's dead `children`).
function hasDangerHTML(props: any): boolean {
	if (props == null || props.dangerouslySetInnerHTML == null) return false;
	if (props.children != null) {
		throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
	}
	return true;
}

// Route a host descriptor's props onto a FRESH element (first build).
function applyDeoptProps(el: Element, props: any, ownerBlock: Block): void {
	if (props == null) return;
	for (const name in props) {
		if (name === 'key' || name === 'children') continue;
		// `suppressHydrationWarning`: a JS flag (read by the hydration-mismatch paths), never
		// a DOM attribute.
		if (name === 'suppressHydrationWarning') {
			(el as any).__oct_suppress = props[name] !== false;
			continue;
		}
		applyDeoptProp(el, name, props[name], ownerBlock);
	}
}

// Diff prev → next props on a REUSED element (the reconcile path): remove props that
// disappeared, set new/changed ones. Unchanged props are skipped, so an unchanged
// `ref` is not re-attached and an unchanged handler is not re-bound.
function patchDeoptProps(el: Element, prevProps: any, nextProps: any, ownerBlock: Block): void {
	// ref lifecycle on a REUSED node: detach the previous ref if it was removed or its identity
	// changed (the apply loop below re-attaches a changed one via applyDeoptProp). Without this a
	// removed/swapped `ref={obj}` keeps pointing at this element. The prev-loop below skips
	// `ref`, so this is the sole detach point for the reconcile path (the detach passes the
	// element so a callback ref shared across elements releases its per-element cleanup).
	// Queued for commit — the re-attach is queued too (applyDeoptProp), and detaches drain
	// first, so a ref hopping between elements never ends null (React mutation→layout order).
	const prevRef = prevProps != null ? prevProps.ref : undefined;
	const nextRef = nextProps != null ? nextProps.ref : undefined;
	if (prevRef != null && prevRef !== nextRef) queueRefDetach(prevRef, el);
	if (prevProps != null) {
		for (const name in prevProps) {
			// `ref` was handled above; everything else routes through the shared removal
			// path — including `suppressHydrationWarning`, whose disappearance must reset
			// the element's `__oct_suppress` flag (parity with applyHostProps' prev-loop).
			if (name === 'key' || name === 'children' || name === 'ref') continue;
			if (nextProps == null || !(name in nextProps)) removeHostProp(el, name, prevProps[name]);
		}
	}
	if (nextProps != null) {
		for (const name in nextProps) {
			if (name === 'key' || name === 'children') continue;
			if (name === 'suppressHydrationWarning') {
				(el as any).__oct_suppress = nextProps[name] !== false;
				continue;
			}
			const nv = nextProps[name];
			// Controlled `value`/`checked` bypass the prev-diff skip (reassert
			// on every commit; the helper's DOM-diff keeps the call cheap).
			if (prevProps == null || prevProps[name] !== nv || isControlledHostProp(el, name)) {
				// `applyDeoptProp` is the FRESH-element helper — its style arm passes
				// prev=undefined, which on a REUSED element leaves declarations dropped
				// from the style object stale (applyStyleValue can only remove keys it
				// can diff against). Thread the real previous style here.
				if (name === 'style') {
					setStyle(el as HTMLElement, nv, prevProps != null ? prevProps.style : undefined);
				} else {
					applyDeoptProp(el, name, nv, ownerBlock);
				}
			}
		}
	}
}

interface HostComponentSlot {
	el: Element;
	/** Legacy child anchor — null since the owns-parent childSlot (M2). */
	anchor: Comment | null;
	ref: any;
	// The props applied last render — diffed against the next render so props/events that
	// DISAPPEARED get removed (not left stale on the reused element).
	props?: any;
	// Stable delegating children body + its current target (see hostComponent).
	body?: ComponentBody;
	latest?: ComponentBody | null;
	// Dedicated sub-scope holding the children's childSlot (slot 0), so the children
	// reconcile/unmount via the Block tree without stamping a derived key on `scope`.
	childScope?: Scope;
}

// Render a host element (`<tag>`) that WRAPS a children render-body, from runtime
// (non-template) code — e.g. a `motion.div` proxy component that the compiler
// invokes via componentSlot. The element is created ONCE (held in `scope.slots[slot]`),
// its props are re-applied on every render (reactive className / style / events /
// attributes / ref), and the children body renders INSIDE it via childSlot. The
// element node is returned so the caller can drive imperative work against it
// (animations, gesture listeners, measurements). This is the runtime counterpart
// of the compiled `<tag …>{children}</tag>` host emission.
export function hostComponent(
	scope: Scope,
	slot: number,
	tag: string,
	props: Record<string, any> | null,
	childrenBody?: ComponentBody | null,
	anchor?: Node | null,
): Element {
	const block = scope.block;
	let state = scope.slots[slot] as HostComponentSlot | undefined;
	if (state === undefined) {
		const el = document.createElement(tag);
		// The children childSlot exclusively OWNS `el`'s content (owns-parent
		// mode) — no `<!---->` insertion anchor needed (marker-elision M2).
		state = { el, anchor: null, ref: undefined };
		scope.slots[slot] = state;
		// Children render into a dedicated sub-scope (registered on `scope.children` so
		// unmountScope walks into it), keeping the children's slot off `scope` itself.
		const childScope = new ScopeImpl(scope, block);
		state.childScope = childScope;
		scope.children.push({ key: slot, scope: childScope });
		block.parentNode.insertBefore(el, anchor ?? block.endMarker);
		scope.cleanups.push(() => queueRefDetach(state!.ref, state!.el));
	}
	const el = state.el;
	applyHostProps(el, props, scope, state);
	if (childrenBody != null) {
		// The compiled children render-body is a FRESH closure every parent render, but
		// it is the SAME positional children slot. childSlot keys block-reuse on body
		// identity, so handing it the raw closure would re-mount (and DOM-duplicate) the
		// children — a `@for`/`@if` block especially — on every re-render. Pass a STABLE
		// delegating body whose target we update each render, so childSlot reconciles.
		state.latest = childrenBody;
		if (state.body === undefined) {
			state.body = ((...args: any[]) => (state!.latest as any)(...args)) as ComponentBody;
		}
		childSlot(state.childScope!, 0, el, state.body, null, false, el);
	}
	return el;
}

// Like applyDeoptProps but for a PERSISTENT element (re-applied each render): the
// ref is attached once and only re-attached when it changes (not every render),
// while className/style/events/attributes are idempotently re-set.
function applyHostProps(el: Element, props: any, scope: Scope, state: HostComponentSlot): void {
	const prev = state.props;
	// REMOVE props/events present last render but gone now, via the shared removeHostProp
	// (parity with setSpread / patchDeoptProps) — a reused element must not keep stale
	// props/listeners. `ref` stays here (not in removeHostProp) because this path also
	// clears the persistent `state.ref` alongside the detach.
	if (prev != null) {
		for (const k in prev) {
			if (k === 'key' || k === 'children') continue;
			if (props != null && k in props) continue;
			if (k === 'ref') {
				if (prev.ref != null) {
					queueRefDetach(prev.ref, el);
					if (state.ref === prev.ref) state.ref = undefined;
				}
				continue;
			}
			removeHostProp(el, k, prev[k]);
		}
	}
	state.props = props;
	if (props == null) return;
	for (const name in props) {
		if (name === 'key' || name === 'children') continue;
		const v = props[name];
		if (name === 'suppressHydrationWarning') {
			(el as any).__oct_suppress = v !== false;
			continue;
		}
		if (name === 'ref') {
			if (v !== state.ref) {
				// Detach + attach both land at commit (detaches drain first), so a
				// ref hopping between elements in one render cycles old → null → new
				// regardless of which element's props apply first (React's
				// mutation→layout phasing; see queueRefDetach).
				if (state.ref != null) queueRefDetach(state.ref, el);
				if (v != null) queueRefAttach(scope, () => attachRef(v, el));
				state.ref = v;
			}
		} else if (name === 'className' || name === 'class') {
			setDeoptClass(el, v);
		} else if (name === 'style') {
			setStyle(el as HTMLElement, v, prev != null ? prev.style : undefined);
		} else {
			// Use `eventSlot` (NOT a hand-rolled `on<Upper>` parse) so capture-phase handlers
			// resolve to the CAPTURE key + register a capture-phase listener — `onClickCapture`
			// was previously mis-delegated as a bubbling `clickcapture` event.
			const ev = eventSlot(name);
			if (ev) {
				if (ev.capture) {
					if (!_delegatedCapture.has(ev.type)) delegateCaptureEvents([ev.type]);
				} else if (!_delegated.has(ev.type)) {
					delegateEvents([ev.type]);
				}
				(el as any)[ev.key] = v;
			} else {
				setAttribute(el, name, v);
			}
		}
	}
}

// The descriptor that last produced a de-opt host element is stashed on the element
// as a typed expando, so a re-render can diff props (patchDeoptProps) and match
// children by key against the live DOM — WITHOUT rebuilding, which would destroy
// DOM-resident state (input value, focus, selection, scroll, media). A direct
// property (not a WeakMap) keeps the per-child lookup in reconcileDeoptChildren cheap;
// `DeoptStamped` types it so there's no `any`. Absent on text/adopted server nodes.
const DEOPT_DESC: unique symbol = Symbol('octane.deoptDesc');
interface DeoptStamped {
	[DEOPT_DESC]?: ElementDescriptor;
}
function getDeoptDesc(n: Node): ElementDescriptor | undefined {
	return (n as Node & DeoptStamped)[DEOPT_DESC];
}
function setDeoptDesc(el: Element, d: ElementDescriptor): void {
	(el as Element & DeoptStamped)[DEOPT_DESC] = d;
}

// Flatten a possibly-nested array child into one item per LEAF, KEEPING empties
// (they occupy an index slot; see the childSlot array branch). Distinct from
// flattenDeoptChildren below, which serves the raw host-children reconciler and
// DROPS empties.
function flattenChildItems(out: any[], v: any[]): void {
	for (let i = 0; i < v.length; i++) {
		const item = v[i];
		if (Array.isArray(item)) flattenChildItems(out, item);
		else out.push(item);
	}
}

// Flatten a MIXED children array (fragment leaves + nested `.map()` arrays)
// into sibling items WITH React's identity semantics: each top-level position
// is its own reconciliation slot, and a nested array's leaves are keyed WITHIN
// that slot (compound `<pos>:<innerKey>` keys, like React's `.$` implicit-key
// prefixes). Without this, flat positional indices shift every sibling's
// implicit key when a nested list changes length — remounting stable siblings
// React would keep (e.g. `<>{items.map(...)}<button/></>`: the button must not
// remount on append). Empties are kept as items (see the childSlot array-path
// comment). Keys land in `outKeys`, parallel to `outItems`.
function flattenChildItemsKeyed(
	outItems: any[],
	outKeys: any[],
	v: any[],
	keyFn: (item: any, index: number) => any,
	prefix: string,
): void {
	for (let i = 0; i < v.length; i++) {
		const item = v[i];
		if (Array.isArray(item)) {
			// A nested array is a `.map()` result (or fragment) — its OWN slot.
			// Inner unkeyed leaves fall back to their index within the array
			// (deoptKey's warning already fired at the outer level if relevant).
			flattenChildItemsKeyed(outItems, outKeys, item, deoptKeyPositional, prefix + i + ':');
		} else {
			outItems.push(item);
			const k = keyFn(item, i);
			outKeys.push(prefix === '' ? k : prefix + String(k));
		}
	}
}

// Flatten a descriptor's `children` (a single value, or a possibly-nested array —
// `createElement` collapses positional children and `.map()` results into arrays)
// into a flat list of renderable values, dropping empties (null/undefined/false/
// true/'') which render nothing.
function flattenDeoptChildren(out: any[], v: any): void {
	if (v == null || v === false || v === true || v === '') return;
	if (Array.isArray(v)) {
		for (let i = 0; i < v.length; i++) flattenDeoptChildren(out, v[i]);
		return;
	}
	out.push(v);
}

// flattenDeoptChildren + a parallel SLOT-SCOPED position key per kept child
// (React identity semantics, same compound scheme as flattenChildItemsKeyed):
// a child keeps its top-level position as its implicit key even when EMPTY
// siblings (`{cond && <input/>}` flipped off) render nothing — so a hole
// going falsy never shifts the following siblings onto different DOM nodes
// (the old compact-then-match-in-order behavior morphed them: inputs swapped
// values, a clicked button could morph into a submit button MID-DISPATCH and
// fire a phantom form submission). Nested arrays key within their slot;
// explicit keys ride inside the same scheme.
function flattenDeoptChildrenKeyed(outVals: any[], outKeys: any[], v: any, prefix: string): void {
	if (v == null || v === false || v === true || v === '') return;
	if (Array.isArray(v)) {
		for (let i = 0; i < v.length; i++) {
			const item = v[i];
			if (Array.isArray(item)) {
				flattenDeoptChildrenKeyed(outVals, outKeys, item, prefix + i + ':');
			} else if (item == null || item === false || item === true || item === '') {
				// empty — consumes its position, emits nothing
			} else {
				outVals.push(item);
				const k = item.$$kind === ELEMENT_TAG && item.key != null ? item.key : i;
				outKeys.push(prefix === '' ? k : prefix + String(k));
			}
		}
		return;
	}
	outVals.push(v);
	outKeys.push(
		prefix === '' ? (v?.$$kind === ELEMENT_TAG && v.key != null ? v.key : 0) : prefix + '0',
	);
}

// Reconcile a runtime value into a DOM node, REUSING `prev` when it's compatible
// (same Text node, or same-tag element) so DOM-resident state survives a re-render.
// `prev` is the node currently occupying this position — pass the existing node to
// reuse/adopt it, or null to build fresh (first client mount). Pure host/text only:
// component descendants are handled by the Block path (hostElementBody/componentSlot),
// never here. Returns the node to occupy this position (reused or freshly built), or
// null for an empty value.
function reconcileDeoptNode(
	prev: Node | null,
	value: any,
	ownerBlock: Block,
	ns?: string,
): Node | null {
	if (value == null || value === false || value === true || value === '') return null;
	const t = typeof value;
	if (t === 'string' || t === 'number' || t === 'bigint') {
		const s = String(value);
		if (prev !== null && prev.nodeType === 3 /* Text */) {
			if ((prev as Text).nodeValue !== s) (prev as Text).nodeValue = s;
			return prev;
		}
		return document.createTextNode(s);
	}
	if (isHostDescriptor(value)) {
		// `<svg>` opens the SVG namespace; descendants inherit it (a `foreignObject`
		// switches ITS children back to HTML — see childNs below). SVG-ONLY tags
		// (`g`, `rect`, `path`, … — see SVG_ONLY_TAGS) imply it with no `<svg>`
		// ancestor. Without this the de-opt path's document.createElement would
		// mis-namespace SVG content (e.g. `<path>` returned from a component via
		// createElement, or portaled into an SVG target).
		const elNs = inferTagNs(value.type, ns);
		let el: Element;
		if (
			prev !== null &&
			prev.nodeType === 1 &&
			(prev as Element).localName === value.type &&
			(prev as Element).namespaceURI === (elNs ?? HTML_NS)
		) {
			// REUSE the existing element — patch props in place instead of rebuilding.
			el = prev as Element;
			patchDeoptProps(el, getDeoptDesc(el)?.props ?? null, value.props, ownerBlock);
		} else {
			el =
				elNs !== undefined
					? document.createElementNS(elNs, value.type)
					: document.createElement(value.type);
			applyDeoptProps(el, value.props, ownerBlock);
		}
		setDeoptDesc(el, value);
		if (!hasDangerHTML(value.props)) {
			const childNs = elNs === SVG_NS && value.type !== 'foreignObject' ? SVG_NS : undefined;
			reconcileDeoptChildren(el, value.children, ownerBlock, childNs);
		}
		return el;
	}
	// A component descriptor must not reach here — the de-opt callers gate on
	// descNeedsBlocks() and route component-bearing subtrees through Blocks.
	if (isElementDescriptor(value)) {
		throw new Error(
			'Octane: internal — a component descriptor reached the de-opt host reconciler ' +
				'(should have been routed through a Block via hostElementBody/componentSlot).',
		);
	}
	return null; // unknown object — render nothing (resilient; React would throw).
}

// Reconcile a host element's children in place, reusing existing child nodes: keyed
// children match by `key`, unkeyed children match positionally (React-shape). Nodes
// not reused are removed; survivors are reordered to match the descriptor. No markers
// are introduced — the element fully owns its children, so this is raw-DOM reuse.
function reconcileDeoptChildren(
	el: Element,
	children: any,
	ownerBlock: Block,
	childNs?: string,
): void {
	const next: any[] = [];
	const nextKeys: any[] = [];
	flattenDeoptChildrenKeyed(next, nextKeys, children, '');
	const existing = el.childNodes;
	// Fresh element (first build / fresh client mount) — nothing to reconcile against,
	// so just build + append each child. Skips the keyed-match Map / Set / reorder
	// bookkeeping below, which is the hot path for large initial mounts.
	if (existing.length === 0) {
		for (let i = 0; i < next.length; i++) {
			const node = reconcileDeoptNode(null, next[i], ownerBlock, childNs);
			if (node !== null) {
				(node as any).$$deoptKey = nextKeys[i];
				el.appendChild(node);
			}
		}
		return;
	}
	// Collect the children we OWN, skipping foreign `<!--portal-->…<!--/portal-->`
	// ranges: a portal rendered elsewhere may target this element, and its nodes are
	// not ours to reuse, remove, or reorder (React parity — portal content coexists
	// with the container's rendered children). Range starts carry $$portalEnd.
	const owned: Node[] = [];
	let hasForeign = false;
	let scan: Node | null = el.firstChild;
	while (scan !== null) {
		const rangeEnd = (scan as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			hasForeign = true;
			scan = nodeAfterPortalRange(scan, rangeEnd);
			continue;
		}
		owned.push(scan);
		scan = scan.nextSibling;
	}
	// Partition current children by their stamped SLOT KEY (position-scoped —
	// see flattenDeoptChildrenKeyed; explicit keys ride the same scheme). Nodes
	// without a stamp (server-adopted on the first post-hydration reconcile)
	// fall back to document-order reuse, and get stamped below for next time.
	let byKey: Map<any, Node> | null = null;
	const unstamped: Node[] = [];
	for (let i = 0; i < owned.length; i++) {
		const n = owned[i];
		const k = (n as any).$$deoptKey ?? getDeoptDesc(n)?.key;
		if (k != null) {
			if (byKey === null) byKey = new Map();
			if (!byKey.has(k)) {
				byKey.set(k, n);
				continue;
			}
		}
		unstamped.push(n);
	}
	let up = 0;
	const result: Node[] = [];
	for (let i = 0; i < next.length; i++) {
		const child = next[i];
		const key = nextKeys[i];
		let prev: Node | null = null;
		if (byKey !== null) {
			prev = byKey.get(key) ?? null;
			if (prev !== null) byKey.delete(key);
		}
		if (prev === null && up < unstamped.length) prev = unstamped[up++];
		const node = reconcileDeoptNode(prev, child, ownerBlock, childNs);
		if (node !== null) {
			(node as any).$$deoptKey = key;
			result.push(node);
		}
	}
	// Remove OWNED children not reused (foreign portal ranges stay untouched).
	const keep = result.length > 0 ? new Set<Node>(result) : null;
	for (let i = owned.length - 1; i >= 0; i--) {
		const n = owned[i];
		if (keep === null || !keep.has(n)) {
			detachDeoptTreeRefs(n, null);
			el.removeChild(n);
		}
	}
	// Order survivors/new nodes to match the descriptor. With foreign ranges present,
	// index against the i-th OWNED live child (a foreign range floats in place,
	// like a React portal whose container children reorder around it).
	for (let i = 0; i < result.length; i++) {
		const want = result[i];
		const at = hasForeign ? liveOwnedChildAt(el, i) : (existing[i] ?? null);
		if (at !== want) el.insertBefore(want, at);
	}
}

// Resume point of an owned-children walk after a foreign portal range: the first
// node AFTER the range close (`end`). Tolerates a torn range (the close was removed
// out from under us) by resuming right after `start`, so the walk can never loop.
// Shared by reconcileDeoptChildren's owned-children scan and liveOwnedChildAt.
function nodeAfterPortalRange(start: Node, end: Node): Node | null {
	let m: Node | null = start;
	while (m !== null && m !== end) m = m.nextSibling;
	return (m ?? start).nextSibling;
}

// The i-th child of `el` that the de-opt reconciler OWNS, skipping foreign
// `<!--portal-->…<!--/portal-->` ranges (see reconcileDeoptChildren). Live walk —
// called per reorder step, only when a foreign range exists.
function liveOwnedChildAt(el: Element, index: number): Node | null {
	let i = 0;
	let scan: Node | null = el.firstChild;
	while (scan !== null) {
		const rangeEnd = (scan as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			scan = nodeAfterPortalRange(scan, rangeEnd);
			continue;
		}
		if (i === index) return scan;
		i++;
		scan = scan.nextSibling;
	}
	return null;
}

// `reconcileKeyed` item body for one de-opt array element. A pure host/text item
// is reconciled IN PLACE against the node from last render (`block.deoptNode`) —
// props patched, children matched — so host node identity and DOM-resident state
// (input value, focus, …) survive parent re-renders; only an incompatible node
// (tag/type change) is rebuilt. Component-bearing items delegate to a nested
// childSlot so their subtrees get real, reconcilable Blocks.
function deoptItemBody(item: any, scope: Scope): void {
	const block = scope.block;
	// Marker-elision M4: a SELF-MARKED item (mounted while its value was a pure
	// single-element host descriptor — startMarker === endMarker === that
	// element, see mountItem's `2` sentinel) whose NEW value no longer fits one
	// raw element (null / primitive / component-bearing) PROMOTES one-way to a
	// real `it` pair minted around the current node, so the pure/Blocks paths
	// below — and reorder/teardown — keep a live range. Client-only by
	// construction (hydrated items always adopt the server's pair).
	const needsBlocks = descNeedsBlocks(item);
	const sm = block.startMarker;
	if (
		sm !== null &&
		sm === block.endMarker &&
		sm.nodeType !== 8 /* COMMENT_NODE — i.e. self-marked, not a pair */ &&
		sm.parentNode !== null &&
		(needsBlocks || !isHostDescriptor(item))
	) {
		const p = sm.parentNode;
		const s = document.createComment('it');
		const e = document.createComment('/it');
		p.insertBefore(s, sm);
		p.insertBefore(e, sm.nextSibling);
		block.startMarker = s;
		block.endMarker = e;
	}
	// An item whose subtree contains a COMPONENT descriptor (a bare `<Comp/>`, or a
	// host element with component children like `<li><Comp/></li>`) needs real Blocks
	// for hooks/reconciliation, which the raw host reconciler can't give it. Delegate to a
	// nested childSlot on this item's own scope: it owns a marker pair inside the
	// item's range and mounts the subtree as proper, reconciled child Blocks (the
	// host-with-components case lands on childSlot's reconciling host path). Pure
	// host/primitive items stay on the cheap rebuild path below. The two paths CAN
	// mix in one item — an UNKEYED `{cond ? <Comp/> : null}` sits at a stable index
	// key and flips between a component descriptor (Blocks) and null/text/pure-host
	// (raw) — so each branch tears down the other's residue on a switch (previously
	// the pure path left a toggled-off component's Blocks + DOM in the range forever).
	if (needsBlocks) {
		// Switching pure → Blocks. If the raw node the pure path left in the range
		// is a SAME-TAG element for the incoming host-with-components descriptor,
		// don't drop it — TRANSFER it to the nested childSlot as its pure-host
		// reuse candidate, so childSlot's pure-host → blocks upgrade branch adopts
		// the element (and, recursively, its children) in place. Anything else
		// (tag change, non-element, or an already-established nested slot) keeps
		// the old teardown.
		const stale = block.deoptNode;
		let transfer: Node | null = null;
		if (stale != null) {
			if (
				scope.slots[0] === undefined &&
				stale.nodeType === 1 /* Element */ &&
				isHostDescriptor(item) &&
				(stale as Element).localName === item.type &&
				stale.parentNode === block.parentNode
			) {
				transfer = stale;
			} else if (stale.parentNode === block.parentNode) {
				detachDeoptTreeRefs(stale, null);
				block.parentNode.removeChild(stale);
			}
			block.deoptNode = null;
		}
		// Hydration: the server serialized this component-bearing item as ONE
		// `<!--[-->…<!--]-->` range (ssrChildItem emits no extra block for the
		// item/childSlot layering, which is client-only structure), and mountItem
		// already adopted that pair as the item block's markers. Seed the nested
		// childSlot with the SAME markers so it BORROWS the item's range — without
		// this it would grab the next `<!--[-->` at the cursor (the component's
		// return content, one level too deep) as its own, desyncing everything
		// inside. The cursor already sits on the item's first content node.
		if (hydrating && scope.slots[0] === undefined && isBlockOpen(block.startMarker)) {
			const seeded: ChildSlot = {
				__kind: 'childSlot',
				start: block.startMarker as Comment,
				end: block.endMarker as Comment,
				ownerHost: null,
				block: null,
				text: null,
				currentComp: null,
				currentIsBodyFn: false,
				forSlot: null,
				hostNode: null,
				portal: null,
			};
			scope.slots[0] = seeded;
			registerSlot(scope, seeded);
		}
		// Marker-elision M2: on a CLIENT mount, the nested childSlot BORROWS the
		// item block's own `<!--it-->` pair as its range instead of minting a
		// second inner pair (end anchor + lazy start) — the item's markers bound
		// exactly the content this slot manages. clearChildContent sweeps BETWEEN
		// markers (never removes them), and the item block still OWNS the pair
		// (teardown removes it inclusive). Only when the item is comment-marked —
		// a de-opt list always is (reconcileKeyed runs with singleRoot=false).
		if (
			!hydrating &&
			scope.slots[0] === undefined &&
			block.startMarker !== null &&
			block.endMarker !== null &&
			block.startMarker !== block.endMarker &&
			block.startMarker.nodeType === 8 /* COMMENT_NODE */ &&
			block.endMarker.nodeType === 8
		) {
			const borrowed: ChildSlot = {
				__kind: 'childSlot',
				start: block.startMarker as Comment,
				end: block.endMarker as Comment,
				ownerHost: null,
				block: null,
				text: null,
				currentComp: null,
				currentIsBodyFn: false,
				forSlot: null,
				// Pure → Blocks transfer: the raw element becomes the slot's reuse
				// candidate — childSlot's upgrade branch adopts it in place.
				hostNode: transfer,
				portal: null,
			};
			scope.slots[0] = borrowed;
			registerSlot(scope, borrowed);
		} else if (transfer !== null && transfer.parentNode !== null) {
			// The borrowed-slot preconditions didn't hold (no marker pair) — the
			// transfer has no receiving slot; fall back to the old teardown.
			detachDeoptTreeRefs(transfer, null);
			transfer.parentNode.removeChild(transfer);
		}
		childSlot(scope, 0, block.parentNode, item, block.endMarker);
		return;
	}
	// Switching Blocks → pure: unmount the childSlot content the Blocks path mounted
	// (effect cleanups + DOM) by reconciling it to null. Idempotent once cleared.
	if (scope.slots[0] !== undefined && scope.slots[0] !== null) {
		childSlot(scope, 0, block.parentNode, null, block.endMarker);
	}
	// Pure host/text item → reconcile in place, REUSING the item's existing node so
	// DOM-resident state (input value, focus, …) survives a re-render. The reuse
	// candidate is the node from last render (block.deoptNode); on the very first
	// render under hydration it's instead the server node in the item range (adopt it).
	const endM = block.endMarker;
	let prev = block.deoptNode;
	if (prev === null && hydrating) {
		const startM = block.startMarker;
		prev = startM != null ? startM.nextSibling : null;
		if (prev === endM) prev = null; // empty item range → nothing to adopt
	}
	const node = reconcileDeoptNode(prev, item, block);
	if (node !== prev) {
		// Built a fresh node (first mount, or a tag/type change) — insert it at
		// the old node's position, THEN drop the old one. Insert-before-remove
		// matters for a SELF-MARKED item (M4): there `prev` IS the block's end
		// marker, so removing it first would leave `endM` detached and the
		// insert would throw.
		if (prev != null && prev !== node && prev.parentNode === block.parentNode) {
			if (node !== null) block.parentNode.insertBefore(node, prev);
			detachDeoptTreeRefs(prev, null);
			block.parentNode.removeChild(prev);
		} else if (node !== null) {
			block.parentNode.insertBefore(node, endM);
		}
		// Self-marked item rebuilt: the replaced element WAS the range — re-point
		// both markers at the replacement. (A non-host new value never reaches
		// here self-marked — the promotion above minted a pair first.)
		if (prev !== null && block.startMarker === prev) {
			block.startMarker = node;
			block.endMarker = node;
		}
	}
	block.deoptNode = node;
}

// True when `value` (a descriptor, an array, or a primitive) contains a COMPONENT
// descriptor anywhere in its tree. Such a subtree can't be a raw host reconcile —
// its components need reconcilable, unmountable Blocks — so the de-opt
// paths (childSlot, deoptItemBody) route it through `hostElementBody`/componentSlot
// instead. Pure host/text subtrees return false and keep the cheap rebuild path.
function descNeedsBlocks(value: any): boolean {
	// A render-FUNCTION child (the `.tsrx` lowering of `<Host>{children}</Host>` passes
	// `props.children` as a component body, not a descriptor) needs a Block: childSlot
	// renders a function value as a component. Without this a `.tsrx` consumer's children
	// reaching a `.ts` component's host element via createElement (e.g. FloatingOverlay's
	// `createElement('div', {children})`) would hit the raw reconciler, which renders a
	// function child as nothing.
	if (typeof value === 'function') return true;
	if (value == null || typeof value !== 'object') return false;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (descNeedsBlocks(value[i])) return true;
		}
		return false;
	}
	if (value.$$kind === ELEMENT_TAG) {
		// A component descriptor (function `type`) always needs a Block; a host
		// descriptor needs one only if its own children do (recurse).
		return typeof value.type === 'function' || descNeedsBlocks(value.children);
	}
	// A portal descriptor renders into a foreign target via its own Block, so an
	// array containing one (e.g. `useDecorators()` returning an array of portals)
	// must route through childSlot, not the raw host reconciler.
	if (value.$$kind === PORTAL_TAG) return true;
	return false;
}

// Stable render body for a HOST element produced via `createElement` (the de-opt
// path) whose subtree contains COMPONENT descriptors — e.g. a `.tsx` component that
// returns `<div className="n"><Node/><Node/></div>` from inside control flow (so the
// compiler emitted `createElement`, not a static template). It can't be a raw host
// reconcile because its component children need reconcilable Blocks.
//
// childSlot routes such a descriptor through the component path with THIS body as the
// (stable-identity) renderer, so it gets a real child Block that reconciles by body
// identity across renders and unmounts via the Block tree. The body builds/reuses its
// element (kept on its Block's typed `deoptNode` field), diffs props each render, and
// mounts its children through childSlot — giving each component child a proper Block.
// Element identity is preserved across re-renders, and nested host-with-components
// children recurse back through childSlot's host path.
function hostElementBody(d: ElementDescriptor, block: Block): void {
	let el = block.deoptNode as Element | null;
	// A root `<svg>` — or any SVG-ONLY tag (see SVG_ONLY_TAGS) — opens the SVG
	// namespace. (Component children inside an SVG are an uncommon case; they
	// mount via childSlot below, which does not yet thread the SVG namespace —
	// the pure-host SVG path through reconcileDeoptChildren does, and SVG-only
	// child tags self-infer through the same table.)
	const elNs = inferTagNs(d.type as string, undefined);
	// Hydration first render: ADOPT the server-rendered host element sitting at the
	// cursor instead of building a fresh one (which would orphan the server node and
	// desync the marker walk). Then point the cursor at its first child so the childSlot
	// below adopts the server-rendered children (which carry full childSlot markers when
	// they contain components — see the server's ssrHostElement). Pure-host children
	// have no inner markers, so childSlot's reconciling-host path rebuilds them in place.
	if (
		el === null &&
		hydrating &&
		hydrateNode !== null &&
		hydrateNode.nodeType === 1 &&
		(hydrateNode as Element).localName === d.type &&
		(elNs === undefined || (hydrateNode as Element).namespaceURI === elNs)
	) {
		el = hydrateNode as Element;
		block.deoptNode = el;
		applyDeoptProps(el, d.props, block);
		setDeoptDesc(el, d);
		const savedCursor = hydrateNode.nextSibling;
		if (!hasDangerHTML(d.props)) {
			hydrateNode = el.firstChild;
			childSlot(block, 0, el, d.children, null, false, el);
		}
		hydrateNode = savedCursor;
		return;
	}
	if (el === null && hydrating && hydrateNode !== null) {
		// STRUCTURAL mismatch: the server rendered something other than this host element at
		// the cursor (different tag, a component's `<!--[-->…<!--]-->` range, text, …). Warn,
		// discard the divergent server node/range, advance the cursor, then build the correct
		// element fresh with hydration SUSPENDED for its subtree (so children client-mount
		// rather than mis-adopt). Recovery runs in dev + prod; the warning is dev-only.
		{
			const mmLoc = (hydrateNode.parentNode as any)?.__oct_loc;
			if (mmLoc)
				warnHydrationStructuralMismatch(mmLoc, `<${d.type}>`, describeHydrationNode(hydrateNode));
		}
		const stale = hydrateNode;
		if (isBlockOpen(stale)) {
			const close = matchingClose(stale);
			hydrateNode = close.nextSibling;
			removeHydrationRange(stale, close);
		} else {
			hydrateNode = stale.nextSibling;
			(stale as ChildNode).remove();
		}
		el =
			elNs !== undefined
				? document.createElementNS(elNs, d.type as string)
				: document.createElement(d.type as string);
		block.deoptNode = el;
		block.parentNode.insertBefore(el, block.endMarker);
		applyDeoptProps(el, d.props, block);
		setDeoptDesc(el, d);
		if (!hasDangerHTML(d.props)) {
			const saved = hydrating;
			hydrating = false;
			childSlot(block, 0, el, d.children, null, false, el);
			hydrating = saved;
		}
		return;
	}
	if (el === null || el.localName !== d.type || (elNs !== undefined && el.namespaceURI !== elNs)) {
		// First render, or the host tag changed at this slot — (re)create the element.
		if (el !== null) (el as ChildNode).remove();
		el =
			elNs !== undefined
				? document.createElementNS(elNs, d.type as string)
				: document.createElement(d.type as string);
		block.deoptNode = el;
		block.parentNode.insertBefore(el, block.endMarker);
		applyDeoptProps(el, d.props, block);
	} else {
		// REUSE the existing element — diff props in place (no rebuild).
		patchDeoptProps(el, getDeoptDesc(el)?.props ?? null, d.props, block);
	}
	setDeoptDesc(el, d);
	// One childSlot renders all children INTO the element (append; no anchor): it
	// reconciles a single child (component/host/text) or an array (keyed list) and
	// recurses into nested host-with-components subtrees uniformly. Skipped when
	// dangerouslySetInnerHTML owns the content (see hasDangerHTML).
	if (!hasDangerHTML(d.props)) childSlot(block, 0, el, d.children, null, false, el);
}

// Stable render body for a componentSlot whose comp resolved to a HOST tag
// STRING at runtime (`<props.parts.title>` with parts.title === 'h1'; see the
// string-comp branch in componentSlot). The block's props is a host DESCRIPTOR:
// `d.type` the tag, `d.props` the raw call-site props, `d.children` the
// compiled `__children$N` render fn (or absent).
//
// DISTINCT from hostElementBody (the value-position de-opt renderer) because
// the CHILDREN CONVENTION differs: a template call site's children fn is the
// element's ENTIRE content and renders INLINE into the element — one Block
// whose range is all of `el`'s content, NO comment markers — matching the
// server's emission (ssrComponent's string branch inlines the fn's HTML like a
// static host tag; holes inside carry their own blocks). Value-position
// function children (via createElement) stay marker-wrapped in
// hostElementBody/childSlot, because the server block-wraps THOSE
// (ssrDescriptorContent's function branch) — each position's client/server
// pair stays aligned.
function hostStringTagBody(d: ElementDescriptor, block: Block): void {
	const tag = d.type as string;
	let el = block.deoptNode as Element | null;
	// A root `<svg>` or SVG-only tag opens the SVG namespace (parity with
	// hostElementBody).
	const elNs = inferTagNs(tag, undefined);
	if (el === null) {
		if (
			hydrating &&
			hydrateNode !== null &&
			hydrateNode.nodeType === 1 &&
			(hydrateNode as Element).localName === tag &&
			(elNs === undefined || (hydrateNode as Element).namespaceURI === elNs)
		) {
			// Hydration first render: ADOPT the server-rendered element at the cursor,
			// then point the cursor at its first child so the children fn's clone()
			// adopts the server content DIRECTLY (it self-bounds on the element — the
			// server emitted no inner markers).
			el = hydrateNode as Element;
			block.deoptNode = el;
			applyDeoptProps(el, d.props, block);
			setDeoptDesc(el, d);
			const savedCursor = hydrateNode.nextSibling;
			if (!hasDangerHTML(d.props)) {
				hydrateNode = el.firstChild;
				renderHostTagChildren(d, block, el);
			}
			hydrateNode = savedCursor;
			return;
		}
		if (hydrating && hydrateNode !== null) {
			// STRUCTURAL mismatch — mirror hostElementBody's recovery: warn, discard
			// the divergent server node/range, then build fresh with hydration
			// SUSPENDED for the subtree (children client-mount, not mis-adopt).
			{
				const mmLoc = (hydrateNode.parentNode as any)?.__oct_loc;
				if (mmLoc)
					warnHydrationStructuralMismatch(mmLoc, `<${tag}>`, describeHydrationNode(hydrateNode));
			}
			const stale = hydrateNode;
			if (isBlockOpen(stale)) {
				const close = matchingClose(stale);
				hydrateNode = close.nextSibling;
				removeHydrationRange(stale, close);
			} else {
				hydrateNode = stale.nextSibling;
				(stale as ChildNode).remove();
			}
			el = elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
			block.deoptNode = el;
			block.parentNode.insertBefore(el, block.endMarker);
			applyDeoptProps(el, d.props, block);
			setDeoptDesc(el, d);
			if (!hasDangerHTML(d.props)) {
				const saved = hydrating;
				hydrating = false;
				renderHostTagChildren(d, block, el);
				hydrating = saved;
			}
			return;
		}
		// Client mount. (The tag is FIXED for this block's life — componentSlot
		// tears down + remounts on a tag change — so no localName re-check.)
		el = elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
		block.deoptNode = el;
		block.parentNode.insertBefore(el, block.endMarker);
		applyDeoptProps(el, d.props, block);
	} else {
		// Re-render, same tag — diff props in place against the stamped descriptor.
		patchDeoptProps(el, getDeoptDesc(el)?.props ?? null, d.props, block);
	}
	setDeoptDesc(el, d);
	if (!hasDangerHTML(d.props)) renderHostTagChildren(d, block, el);
}

// Render a string-tag componentSlot's children into `el`. A FUNCTION child (the
// compiled `__children$N`, or a render prop) renders through ONE self-bounding
// Block whose range is all of `el`'s content — parentNode = el, no markers —
// reused across renders with the body swapped in place (the compiled closure is
// fresh each parent render but is the same slot child; mirrors childSlot's
// isBodyFn reconcile). A render prop that RETURNS a renderable instead of
// rendering imperatively is handled by renderBlock's return-slot (childSlot,
// marker-wrapped — matching the server's ssrChild normalization of a de-opt
// return). Non-function children (hand-rolled descriptors only; the compiler
// always passes a render fn or nothing) fall back to childSlot on their own
// slot index, which block-wraps exactly like the server's ssrHostElement
// content path for plain values.
function renderHostTagChildren(d: ElementDescriptor, block: Block, el: Element): void {
	const kids = d.children;
	if (kids == null) return;
	if (typeof kids === 'function') {
		let state = block.slots[0] as { __kind: 'hostTagChildrenSlot'; block: Block } | undefined;
		if (state === undefined) {
			const child = createBlock('dynamic', block, el, null, null, kids as ComponentBody, {});
			state = { __kind: 'hostTagChildrenSlot', block: child };
			block.slots[0] = state;
			// unmountScope's catch-all slot branch unmounts `state.block`, firing the
			// children's cleanups; the DOM goes away with `el` (the block has no
			// markers of its own to sweep).
			registerSlot(block, state);
		} else {
			state.block.body = kids as ComponentBody;
		}
		renderBlock(state.block);
		return;
	}
	childSlot(block, 1, el, kids, null, false, el);
}

// Tear down a childSlot's de-opt keyed list when the slot leaves array mode (a
// portal descriptor switches in, or the value stops being an array): unmount all
// items in one batched sweep and drop the list so a later array rebuilds fresh.
// (disposeReturnSlot has its own variant — it also unmounts @empty and skips the
// bookkeeping reset because the whole slot is being discarded.)
function teardownChildForSlot(state: ChildSlot): void {
	const fs = state.forSlot!;
	batchClearItems(fs, fs.items);
	fs.head = null;
	fs.tail = null;
	fs.size = 0;
	state.forSlot = null;
}

// One-shot handoff for the pure-host → blocks upgrade (see childSlot's upgrade
// branch): set around the upgraded block's renderBlock so the block's
// owns-parent childSlot (hostElementBody's single children slot) knows to ADOPT
// the element's existing raw children instead of mounting fresh. `children` is
// the OLD descriptor's children (pre-upgrade), used to key the existing nodes.
let DEOPT_UPGRADE: { block: Block; children: any } | null = null;

// Build the adoption queue for an upgraded element: pair each existing raw
// child node (strictly between `start` and `end`, in DOM order) with the key
// its OLD child value carries under the same keying scheme the incoming items
// will use. Empty old values (null/false/'' — the raw path rendered nothing
// for them) occupy a key slot but get no node. Stops pairing at the first
// node/value mismatch (defensive; unpaired nodes are swept after the render).
function buildDeoptAdoptQueue(
	oldChildren: any,
	start: Comment,
	end: Comment,
): Array<{ key: any; node: Node }> {
	const oldArr = Array.isArray(oldChildren) ? oldChildren : [oldChildren];
	const keyFn = !Array.isArray(oldChildren)
		? deoptKeyPositional
		: POSITIONAL_CHILDREN.has(oldChildren as object)
			? deoptKeyPositional
			: deoptKey;
	// SAME flatten + keying as the childSlot array path (incl. compound
	// slot-scoped keys for nested arrays) — the queue's keys must match the
	// keys the incoming items will get, or nothing adopts.
	const items: any[] = [];
	const keys: any[] = [];
	flattenChildItemsKeyed(items, keys, oldArr, keyFn, '');
	const queue: Array<{ key: any; node: Node }> = [];
	let cursor: Node | null = start.nextSibling;
	for (let i = 0; i < items.length; i++) {
		const v = items[i];
		if (v == null || v === false || v === true || v === '') continue; // rendered nothing
		if (cursor === null || cursor === end) break;
		const t = typeof v;
		const isText = t === 'string' || t === 'number' || t === 'bigint';
		const compatible = isText
			? cursor.nodeType === 3
			: isHostDescriptor(v)
				? cursor.nodeType === 1 && (cursor as Element).localName === v.type
				: false;
		if (!compatible) break;
		queue.push({ key: keys[i], node: cursor });
		cursor = cursor.nextSibling;
	}
	return queue;
}

export function childSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	// When set, `anchor` is the slot's OWN dedicated `<!>` placeholder (emitted by
	// the compiler at the slot's source-order position) — reuse it as the end
	// marker instead of minting a second comment. Content still inserts before it.
	// Only valid for a placeholder exclusive to this slot, NOT a shared end-marker.
	ownEnd?: boolean,
	// OWNS-PARENT mode (marker-elision M2): this slot exclusively owns ALL of
	// `ownsHost`'s children — mint no markers at all (append inserts, whole-
	// element clears). De-opt hosts (hostElementBody/hostComponent) pass their
	// element here; ignored under hydration (server-pair adoption wins).
	ownsHost?: Element,
): void {
	const parentBlock = parentScope.block;
	// A LONE PURE-HOST descriptor (host/text-only subtree — no components, no
	// portals, no render functions). Computed once per call: the slot init below
	// uses it to pick the ANCHORLESS regime, the promotion after it to detect a
	// mode flip out of that regime, and the classifier to route the value.
	const pureHost = isHostDescriptor(value) && !descNeedsBlocks(value);
	let state = parentScope.slots[slotKey] as ChildSlot | undefined;
	if (state === undefined) {
		let start: Comment | null;
		let end: Comment | null;
		if (hydrating && isBlockOpen(anchor ?? null)) {
			// Hydration (nested hole): the anchor resolved via child/sibling to the
			// server's `<!--[-->`. Adopt that `<!--[-->…<!--]-->` range as our markers
			// and point the cursor at the first content node for the Block's clone()
			// / the text adopt below.
			start = anchor as Comment;
			end = matchingClose(anchor as Node);
			hydrateNode = start.nextSibling;
		} else if (hydrating && isBlockOpen(hydrateNode)) {
			// Hydration (sole top-level hole, e.g. a layout `<>{children}…</>`): the
			// anchor is the block's end-marker (not a `<!--[-->`), but the CURSOR sits
			// on the server's range-open. Adopt from the cursor. This is what lets a
			// component whose only body root is `{children}` hydrate as single-root.
			start = hydrateNode as Comment;
			end = matchingClose(hydrateNode as Node);
			hydrateNode = start.nextSibling;
		} else if (ownEnd && anchor != null) {
			// Client mount, dedicated placeholder: reuse the slot's own `<!>` as the end
			// marker — content inserts before it just the same. Saves a comment + an
			// insertBefore per `{expr}` hole (no separate end marker minted).
			start = null;
			end = anchor as Comment;
		} else if (!hydrating && ownsHost !== undefined) {
			// OWNS-PARENT: no markers in any value regime — the element's child
			// list IS the slot's range (see ChildSlot.ownerHost).
			start = null;
			end = null;
		} else if (!hydrating && pureHost) {
			// ANCHORLESS client mount: the value is a lone pure-host descriptor, so
			// the element self-delimits — mint NO markers at all (mirrors
			// componentSlot's singleRoot regime). This is what makes a host
			// descriptor at a root / return slot land as `container.firstChild`
			// (React parity) instead of `<!----><el/><!---->`. A later render whose
			// value flips mode promotes to the marked regime (see below).
			start = null;
			end = null;
		} else {
			// Client mount: a SINGLE end anchor. A text/empty hole tracks its own
			// `Text` node (no start needed); the component path lazily mints a start
			// marker when first required. Saves one comment per `{expr}` text hole.
			start = null;
			end = document.createComment('');
			domParent.insertBefore(end, anchor ?? null);
		}
		state = {
			__kind: 'childSlot',
			start,
			end,
			ownerHost: (!hydrating ? (ownsHost ?? null) : null) as Element | null,
			block: null,
			text: null,
			currentComp: null,
			currentIsBodyFn: false,
			forSlot: null,
			hostNode: null,
			portal: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}

	// Consume the pure-host → blocks upgrade handoff: this is the upgraded
	// block's owns-parent children slot (its FIRST render), and the element's
	// existing raw children must be adopted rather than mounted fresh. One-shot.
	let upgradeChildren: any = undefined;
	let upgradeArmed = false;
	if (
		DEOPT_UPGRADE !== null &&
		DEOPT_UPGRADE.block === parentScope.block &&
		ownsHost !== undefined
	) {
		upgradeChildren = DEOPT_UPGRADE.children;
		upgradeArmed = true;
		DEOPT_UPGRADE = null;
	}

	// ANCHORLESS → marked promotion: the slot was created markerless for a lone
	// pure-host value (init above). The moment a render flips the value to
	// anything else (component / array / portal / text / null), mint the marker
	// pair on demand around the current host node, so every path below sees the
	// normal marked regime — the childSlot analogue of the singleRoot shape-flip
	// handling in disposeReturnSlot. One-way: once marked, the slot stays marked.
	if (state.end === null && !pureHost && state.ownerHost === null) {
		const start = document.createComment('');
		const end = document.createComment('');
		const host = state.hostNode;
		if (host !== null && host.parentNode !== null) {
			const p = host.parentNode;
			p.insertBefore(start, host);
			p.insertBefore(end, host.nextSibling);
		} else {
			// Defensive — anchorless is only entered after a successful pure-host
			// render, so a live host should always exist. Pin at the call's anchor.
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		state.start = start;
		state.end = end;
	}

	// Portal descriptor → render its body into a foreign target; the slot's own
	// markers stay empty (content lives in `target`). Switching in from any other
	// content tears that down first; a non-portal value below tears the portal down.
	const portalDesc =
		value != null && (value as any).$$kind === PORTAL_TAG
			? (value as unknown as PortalDescriptor)
			: null;
	if (portalDesc === null && state.portal != null) {
		teardownPortalState(state.portal);
		state.portal = null;
	}
	if (portalDesc !== null) {
		if (state.forSlot !== null) teardownChildForSlot(state);
		if (state.block !== null || state.text !== null || state.hostNode !== null) {
			clearChildContent(state);
		}
		state.portal = renderPortalState(
			state.portal,
			parentBlock,
			portalDesc.target,
			portalDesc.body,
			portalDesc.props,
			// The DOM element containing this hole is the portal's logical parent.
			domParent,
		);
		return;
	}

	// Array child → de-opt keyed list (sound: handles `.map()` results, arrays
	// through props, and any array-valued child uniformly, by RUNTIME type).
	if (Array.isArray(value)) {
		if (state.forSlot === null) {
			// Drop any prior block/text content — EXCEPT while hydrating, where the
			// server emitted one `<!--[-->…<!--]-->` range per item between our adopted
			// markers and `reconcileKeyed`/`mountItem` ADOPT those ranges off the
			// cursor. Sweeping here would delete the very item DOM (and break the
			// hydrateNode chain) the de-opt list is about to adopt. The pure-host →
			// blocks upgrade adopts the SAME way (the element's raw children ARE the
			// incoming items), so it must not sweep either.
			if (!hydrating && !upgradeArmed) clearChildContent(state);
			if (state.end === null) {
				// OWNS-PARENT slot entering array mode: ForSlot requires a real
				// marker pair (reconcileKeyed anchors on it) — mint it lazily,
				// appended at the element's tail. One-way, like the promotion above.
				state.end = document.createComment('');
				domParent.insertBefore(state.end, null);
			}
			if (state.start === null) {
				state.start = document.createComment('');
				// Upgrade adoption: the element's existing raw children must sit
				// INSIDE [start, end] (they become the items) — mint start before
				// the first of them, not at the tail.
				domParent.insertBefore(state.start, upgradeArmed ? domParent.firstChild : state.end);
			}
			state.forSlot = {
				__kind: 'forBlockSlot',
				start: state.start,
				// Non-null: an anchorless slot was promoted to markers above.
				end: state.end!,
				items: new Map(),
				head: null,
				tail: null,
				size: 0,
				cachedDeps: null,
				emptyBlock: null,
				env: undefined,
				adopt: null,
			};
			if (upgradeArmed) {
				state.forSlot.adopt = buildDeoptAdoptQueue(upgradeChildren, state.start, state.end!);
			}
		}
		// A NESTED array member is a fragment (React parity): its leaves render as
		// SIBLING items of this list, one item per leaf. Flatten before keying —
		// without this a nested-array item reaches deoptItemBody as an array, which
		// the pure host reconciler renders as NOTHING (content silently dropped).
		// Empties (null/false) are KEPT as items: they occupy an index slot (React's
		// array-diff semantics) and mirror the server's one-`<!--[-->…<!--]-->`-per-
		// leaf emission (ssrChildItem serializes an empty leaf as an EMPTY block),
		// so hydration adopts item ranges 1:1. The positional-key choice is made on
		// the ORIGINAL array — the flattened copy is a fresh, untagged allocation.
		const keyFn = POSITIONAL_CHILDREN.has(value as object) ? deoptKeyPositional : deoptKey;
		let items: any[] = value;
		let flatKeys: any[] | null = null;
		for (let i = 0; i < items.length; i++) {
			if (Array.isArray(items[i])) {
				// Compound slot-scoped keys (React identity semantics): the nested
				// array's leaves key WITHIN their top-level position, so a length
				// change in one list never shifts a SIBLING's implicit key (which
				// would remount it) — see flattenChildItemsKeyed.
				const fi: any[] = [];
				const fk: any[] = [];
				flattenChildItemsKeyed(fi, fk, value, keyFn, '');
				items = fi;
				flatKeys = fk;
				break;
			}
		}
		const getKey = flatKeys === null ? keyFn : (_item: any, i: number) => flatKeys[i];
		// singleRoot=2 (marker-elision M4): pure single-element items self-mark —
		// no `it` pair per item — resolved per item value in mountItem; shape
		// flips promote to a minted pair in place (deoptItemBody).
		reconcileKeyed(parentBlock, state.forSlot, items, getKey, deoptItemBody as any, false, 2);
		// Upgrade adoption: nodes the empty→fill mount didn't consume (old
		// children whose keys have no new item) are orphans inside the range —
		// sweep them now.
		if (state.forSlot.adopt !== null) {
			const leftovers = state.forSlot.adopt;
			for (let i = 0; i < leftovers.length; i++) {
				const n = leftovers[i].node;
				if (n.parentNode !== null) {
					detachDeoptTreeRefs(n, null);
					n.parentNode.removeChild(n);
				}
			}
			state.forSlot.adopt = null;
		}
		return;
	}
	// Value is NOT an array — if we were in array mode, tear the list down first.
	if (state.forSlot !== null) teardownChildForSlot(state);
	// Upgrade adoption, single-child form: the new children value is a lone
	// renderable. Adopt the element's sole existing raw node as the slot's
	// pure-host reuse candidate (the classifier paths below patch it in place,
	// or the nested upgrade branch takes it over for host-with-components).
	// Multiple or incompatible leftover raw children can't be adopted by a
	// single-value slot — sweep them so the fresh mount starts clean.
	if (upgradeArmed && state.hostNode === null && state.block === null) {
		const first = domParent.firstChild;
		if (
			first !== null &&
			first.nextSibling === null &&
			(first.nodeType === 1 || first.nodeType === 3)
		) {
			state.hostNode = first;
		} else {
			let n: Node | null = domParent.firstChild;
			while (n !== null) {
				const next: Node | null = n.nextSibling;
				detachDeoptTreeRefs(n, null);
				domParent.removeChild(n);
				n = next;
			}
		}
	}
	// Classify the value. A host descriptor whose subtree contains component
	// descendants can't be a raw rebuild (its components need reconcilable Blocks) →
	// route it through the component path below with the stable `hostElementBody`
	// renderer, which keeps the element across renders and mounts its component
	// children as proper Blocks. A pure-host descriptor (host/text only) is
	// reconciled in place against `state.hostNode` (props patched, children matched)
	// so DOM-resident state survives; only an incompatible node is rebuilt. A
	// function is a `{children}`-style render body; a component descriptor carries its
	// `type` + props; anything else is text/empty.
	let comp: ComponentBody | null = null;
	let props: any = {};
	let isBodyFn = false;
	if (isHostDescriptor(value)) {
		if (pureHost) {
			// Pure host/text → reconcile in place, REUSING the existing node so DOM
			// state survives a re-render. Switching in from a component/text first
			// tears that down (also nulls a stale hostNode).
			if (state.block !== null || state.text !== null) clearChildContent(state);
			if (state.end === null) {
				// ANCHORLESS: no markers — the element self-delimits, so reconcile
				// straight against the tracked node. A same-tag value patches it in
				// place; an incompatible one is rebuilt at the old node's position
				// (first render inserts at the call's anchor). `reconcileDeoptNode`
				// always yields a node for a host descriptor; the null checks are
				// shape-parity with the marked path below.
				const prev = state.hostNode;
				const node = reconcileDeoptNode(prev, value, parentBlock);
				if (node !== prev) {
					if (prev !== null && prev.parentNode !== null) {
						if (node !== null) prev.parentNode.insertBefore(node, prev);
						detachDeoptTreeRefs(prev, null);
						prev.parentNode.removeChild(prev);
					} else if (node !== null) {
						domParent.insertBefore(node, anchor ?? null);
					}
				}
				state.hostNode = node;
				return;
			}
			if (state.start === null) {
				state.start = document.createComment('');
				domParent.insertBefore(state.start, state.end);
			}
			// First render: adopt the server node during hydration, else reuse the
			// prior built node, else build fresh.
			let prev = state.hostNode;
			if (prev === null && hydrating) {
				prev = state.start.nextSibling;
				if (prev === state.end) prev = null;
			}
			const node = reconcileDeoptNode(prev, value, parentBlock);
			if (node !== prev) {
				if (prev != null && prev !== node && prev.parentNode !== null) {
					detachDeoptTreeRefs(prev, null);
					prev.parentNode.removeChild(prev);
				}
				if (node !== null) state.start.parentNode!.insertBefore(node, state.end);
			}
			state.hostNode = node;
			return;
		}
		comp = hostElementBody as unknown as ComponentBody;
		props = value;
	} else if (typeof value === 'function') {
		comp = value as ComponentBody;
		isBodyFn = true;
	} else if (isElementDescriptor(value)) {
		comp = value.type as ComponentBody;
		props = value.props;
	}

	if (comp !== null) {
		// A bare render-FUNCTION child (a `.tsrx` `{children}` body forwarded onto a `.ts`
		// component's host element via createElement) is re-created every render, so its
		// identity always differs — but it is the SAME slot child. Reconcile by SLOT like
		// componentSlot: swap the block's body in place and re-render, instead of
		// re-mounting on every identity change (which, once effects re-render the tree,
		// loops unboundedly). Component switches arrive as DESCRIPTORS (comp = value.type),
		// never as a bare function, so this never short-circuits a real component swap.
		if (isBodyFn && state.block !== null && state.currentIsBodyFn) {
			state.block.body = comp;
			renderBlock(state.block);
			state.currentComp = comp;
			return;
		}
		if (state.block !== null && comp === state.currentComp) {
			// Same component identity → update in place (matches componentSlot),
			// honoring React.memo's bail — previously only componentSlot did, so a
			// memo()'d component rendered as VALUE-POSITION children (e.g. provider
			// children in a `.ts` binding tree) re-rendered unconditionally.
			if (tryMemoBail(state.block, comp, props)) return;
			// React's implicit same-element bailout: the IDENTICAL committed props
			// object (same cached descriptor, or a host descriptor re-passed as-is)
			// skips the body outright; changed-context consumers below refresh
			// lazily. This is what lets a `{children}` passthrough under a
			// re-rendering Provider skip untouched subtrees without a memo() shim.
			if (props === state.block.props && tryImplicitBail(state.block)) return;
			state.block.props = props;
			renderBlock(state.block);
			return;
		}
		// Off-screen transition swap (React WIP model): a TRANSITION render replacing
		// committed content with a DIFFERENT component that may suspend → render the new
		// one off-screen and HOLD the old until it's ready, instead of clearing the old
		// before the new suspends (which would blank the boundary). Only when there's
		// committed old content to hold; urgent + hydration keep the legacy path below.
		// (`state.end` is non-null on this path for marked slots; an OWNS-PARENT
		// slot has none — it takes the legacy swap below, like singleRoot
		// componentSlots.)
		if (
			state.block !== null &&
			state.end !== null &&
			!hydrating &&
			parentBlock.currentRenderMode === 'transition'
		) {
			const r = renderOffscreen(parentBlock, domParent, state.end!, comp, props);
			if (r.suspended || r.error) {
				// Discard the partial; the OLD content was never touched, so it stays live.
				// Re-throw so the enclosing tryBlock's existing catch holds the old content
				// (transition). Re-throwing (vs swallowing the suspend + returning) is what
				// keeps the try body's success path from immediately RELEASING the hold; the
				// resume re-renders the try body, which re-drives this swap to completion.
				disposeWip(r.wip);
				if (r.error) throw r.error;
				throw new SuspenseException(r.suspended);
			}
			// Completed → commit: tear down old (sweeps state.start..state.end; the WIP sits
			// OUTSIDE that range so it's untouched), then move the WIP into the slot range.
			// Synchronous, so there is no painted blank between the two.
			clearChildContent(state);
			commitOffscreen(r.wip, state.end!);
			state.block = r.wip.block;
			state.currentComp = comp;
			state.currentIsBodyFn = isBodyFn;
			return;
		}
		// PURE-HOST → BLOCKS UPGRADE (adopt, don't rebuild): the slot's last render
		// was a raw pure-host tree (state.hostNode), and this render the SAME-TAG
		// host descriptor now carries component descendants (e.g. a
		// `{cond && <Comp/>}` child flipped on, or a `.map()` hole filled with
		// component items) — descNeedsBlocks reclassified it through
		// hostElementBody. Tearing the raw tree down would recreate every sibling
		// host node; React preserves them (only the flipped position mounts). So
		// ADOPT: hand the existing element to the new block as its deoptNode
		// (hostElementBody's reuse branch patches props in place) and arm the
		// one-shot child-adoption handoff so the block's owns-parent childSlot
		// wraps the existing raw children into item ranges instead of mounting
		// fresh (see the DEOPT_UPGRADE consumption sites).
		if (
			!hydrating &&
			comp === (hostElementBody as unknown as ComponentBody) &&
			state.block === null &&
			state.hostNode !== null &&
			state.hostNode.nodeType === 1 /* Element */ &&
			(state.hostNode as Element).localName === (props as ElementDescriptor).type &&
			(state.hostNode as Element).namespaceURI ===
				(inferTagNs((props as ElementDescriptor).type as string, undefined) ?? HTML_NS) &&
			!hasDangerHTML((props as ElementDescriptor).props) &&
			!hasDangerHTML(getDeoptDesc(state.hostNode)?.props ?? null)
		) {
			const el = state.hostNode as Element;
			state.hostNode = null;
			state.currentComp = comp;
			state.currentIsBodyFn = false;
			const b = createBlock('dynamic', parentBlock, domParent, state.start, state.end, comp, props);
			b.$$implicitBail = true;
			b.memoInChain = true;
			b.deoptNode = el;
			state.block = b;
			DEOPT_UPGRADE = { block: b, children: getDeoptDesc(el)?.children };
			try {
				renderBlock(b);
			} finally {
				DEOPT_UPGRADE = null;
			}
			return;
		}
		// New component (first render, or identity swap from text / another comp).
		// While hydrating the FIRST render adopts the server content between our
		// adopted markers (the cursor sits on it), so DON'T sweep it — clearing would
		// delete the very DOM the component is about to adopt and strand the cursor
		// (a detached node), desyncing every sibling/descendant below. Mirrors the
		// array path's `if (!hydrating) clearChildContent` guard above. (A post-
		// hydration identity swap runs with hydrating=false and clears normally.)
		if (!hydrating) clearChildContent(state);
		state.currentComp = comp;
		state.currentIsBodyFn = isBodyFn;
		if (state.start === null && state.ownerHost === null) {
			// First component in this slot — mint the lower-bound marker now so
			// clearChildContent can sweep a (possibly multi-node) component body.
			// (An OWNS-PARENT slot needs neither bound: clears sweep the element.)
			state.start = document.createComment('');
			domParent.insertBefore(state.start, state.end);
		}
		const b = createBlock('dynamic', parentBlock, domParent, state.start, state.end, comp, props);
		// Arm React's implicit same-element bailout: value-position mounts are the
		// sites that can receive a CACHED descriptor back (provider children, `.ts`
		// binding trees, `return children` passthroughs), so their context reads
		// must stamp ancestors (memoInChain, like memo blocks) for the bail's lazy
		// consumer refresh to be sound. Set BEFORE renderBlock so the first render
		// stamps. Body-fn children re-create identity per render — no bail is ever
		// possible, so they skip the stamping cost.
		if (!isBodyFn) {
			b.$$implicitBail = true;
			b.memoInChain = true;
		}
		state.block = b;
		renderBlock(b);
		// Advance the cursor past this child's adopted range so a following sibling
		// hole adopts the right node (mirrors componentSlot's post-render advance).
		// (Hydration always adopts a marker pair, so `state.end` is non-null here.)
		if (hydrating) hydrateNode = state.end!.nextSibling;
		return;
	}

	// Text / empty.
	// Swapped away from a component OR a pure-host de-opt node → tear it down first.
	if (state.block !== null || state.hostNode !== null) clearChildContent(state);
	const str = coerceChildText(value);
	if (str === '') {
		// `null` / `undefined` / `false` / `true` / `''` render NOTHING — not even
		// an empty text node — matching React/Octane. The server emits an empty
		// `<!--[--><!--]-->` range for these, so the marker pair stays content-less
		// on both sides. Drop a text node left over from a prior non-empty render.
		if (state.text !== null) {
			state.text.remove();
			state.text = null;
		}
		return;
	}
	if (state.text !== null) {
		if (state.text.nodeValue !== str) state.text.nodeValue = str;
		return;
	}
	if (hydrating) {
		// Adopt the server text sitting between our adopted markers. (An empty hole
		// has no text node, but `str !== ''` here means the server emitted one.)
		const n = hydrateNode;
		if (n !== null && n !== state.end && n.nodeType === 3) {
			state.text = n as Text;
			hydrateNode = n.nextSibling;
			if ((n as Text).nodeValue !== str) (n as Text).nodeValue = str;
			return;
		}
	}
	const tn = document.createTextNode(str);
	domParent.insertBefore(tn, state.end);
	state.text = tn;
}

// A `{expr}` value-hole slot whose value is USUALLY a primitive (text) — what the
// compiler emits for `.tsx` element children. `childSlot` is a large function that
// V8 won't inline, so calling it per cell on every render dominated update-heavy
// keyed lists (a dbmon-style table cell was ~50% of tick time). This thin,
// inlinable wrapper handles the dominant case — a primitive into a slot already in
// text/empty mode — with the same work as `setText`, and delegates to the full
// `childSlot` only for objects/functions (component / element / array values), a
// not-yet-initialized slot (first render), or a slot currently holding non-text
// content. Behaviour is identical to calling `childSlot` directly.
export function textSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	ownEnd?: boolean,
): void {
	const vt = typeof value;
	if (vt === 'object' || vt === 'function') {
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd);
		return;
	}
	const state = parentScope.slots[slotKey] as ChildSlot | undefined;
	if (
		state === undefined ||
		state.block !== null ||
		state.forSlot !== null ||
		state.hostNode !== null ||
		state.portal !== null
	) {
		// First render (state init + hydration adoption) or a mode switch out of
		// non-text content (block / array / host node / portal) — let the full
		// classifier handle it (it also tears the outgoing mode down, e.g. a
		// portal's foreign-target content).
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd);
		return;
	}
	// Hot path: primitive into a text/empty slot (markerless single Text node).
	const str =
		vt === 'string' ? (value as string) : vt === 'boolean' || value == null ? '' : String(value);
	if (state.text !== null) {
		if (state.text.nodeValue !== str) state.text.nodeValue = str;
		return;
	}
	if (str === '') return;
	const tn = document.createTextNode(str);
	domParent.insertBefore(tn, state.end);
	state.text = tn;
}

// Slow path for the compiler's INLINE text-hole codegen. The compiled `.tsx`
// `{expr}` value hole caches its text node on the binding bag and, on update,
// does `setText(node, _v)` directly when `_v` is a primitive and a node already
// exists — matching the `.tsrx` `{… as string}` text-binding hot path exactly.
// It only calls here when that inline fast path doesn't apply: `_v` is an
// object/function (component / element / array), or there's no cached node yet
// (first render, hydration, or a prior non-text render). We hand off to the full
// `childSlot` for classification + slot-state management, then return the text
// node it settled on (or null when it now holds a Block / array / host node) so
// the caller can cache it for the next fast update.
export function textHole(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	ownEnd?: boolean,
): Text | null {
	childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd);
	const state = parentScope.slots[slotKey] as ChildSlot;
	return state.block === null && state.forSlot === null && state.hostNode === null
		? state.text
		: null;
}

// Slow path for an ONLY-CHILD `{expr}` value hole (the value hole is the sole
// content of `domParent`). When the value is a primitive this is FULLY markerless
// and stateless — a single Text node appended to the host, exactly like a `.tsrx`
// only-child `htext`/`setText` text binding (no `<!>` placeholder, no childSlot
// state, no end marker). Only when the value is an object/function (component /
// element / array) does it fall back to the full `childSlot`, which lazily mints
// the markers + slot state it needs (the host's sole-child invariant means it can
// safely append). The compiler's inline fast path handles the steady-state
// primitive update (`setText` on the cached node); this runs on first render,
// empty↔non-empty, and a primitive↔object mode switch. Returns the text node to
// cache (or null when in object/empty mode).
export function childTextHole(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	cachedNode: Text | null,
): Text | null {
	const vt = typeof value;
	const state = parentScope.slots[slotKey] as ChildSlot | undefined;
	if (state === undefined && vt !== 'object' && vt !== 'function') {
		// Markerless pure-text mode.
		const str =
			value == null || value === false || value === true
				? ''
				: vt === 'string'
					? (value as string)
					: String(value);
		if (str === '') {
			if (cachedNode !== null) cachedNode.remove();
			return null;
		}
		if (cachedNode !== null) {
			if (cachedNode.nodeValue !== str) cachedNode.nodeValue = str;
			return cachedNode;
		}
		if (hydrating) {
			// Adopt the server's markerless text (the host's sole child). On a VALUE
			// mismatch, patch to the client value (unless the host opted out) and, in dev,
			// warn with the text hole's own source location (a tracked construct slot).
			const f = domParent.firstChild;
			if (f !== null && f.nodeType === 3) {
				// Parser CR/CRLF→LF normalization is not a mismatch (React parity).
				const server = (f as Text).nodeValue;
				if (
					server !== str &&
					!isCRLFNormalizedMatch(server, str) &&
					!isHydrationSuppressed(domParent)
				) {
					// LOC: this hole's tracked construct slot (the precise `{expr}` position);
					// fall back to the host element's stamp only as defense-in-depth.
					const loc = siteLoc(parentScope, slotKey) || (domParent as any).__oct_loc;
					warnHydrationValueMismatch(loc, 'text', server, str);
					(f as Text).nodeValue = str;
				}
				return f as Text;
			}
		}
		const tn = document.createTextNode(str);
		domParent.appendChild(tn);
		return tn;
	}
	// Object/function value (or already in slot mode): hand off to childSlot in
	// OWNS-PARENT mode (marker-elision M4) — the hole is the host's SOLE child,
	// which is exactly the ownerHost invariant, so component/element/array values
	// render with NO markers at all (M2's de-opt host regime; arrays still mint
	// their ForSlot pair lazily). On a pure-text → object switch, drop the
	// markerless text node first. While hydrating, point the cursor at the host's
	// first child (the server's `<!--[-->`) so childSlot adopts the range —
	// ownsHost is ignored under hydration (server-pair adoption wins, as in M2).
	if (state === undefined && cachedNode !== null) cachedNode.remove();
	if (hydrating && state === undefined) hydrateNode = domParent.firstChild;
	childSlot(parentScope, slotKey, domParent, value, null, false, domParent as Element);
	const s = parentScope.slots[slotKey] as ChildSlot;
	return s.block === null && s.forSlot === null && s.hostNode === null ? s.text : null;
}

// True if any context the block read last render has since changed value
// (its Provider bumped the version). When so, a memo bailout must NOT skip —
// the block (or a consumer in its subtree) needs the new context value.
function ctxDepsChanged(block: Block): boolean {
	const reads = block.$$ctxReads;
	if (reads === null) return false;
	for (const [ctx, version] of reads) {
		if (ctx.$$version !== version) return true;
	}
	return false;
}

// True if this block's OWN render directly read a context whose value has since
// changed — meaning the block must re-run (vs only a descendant consumer needing
// a refresh). Distinguishes a memo'd CONSUMER (re-run it) from a memo'd pure
// INDIRECTION that merely wraps consumers (skip its body, refresh the consumers).
function ctxDirectChanged(block: Block): boolean {
	const direct = block.$$ctxDirect;
	if (direct === null) return false;
	for (const [ctx, version] of direct) {
		if (ctx.$$version !== version) return true;
	}
	return false;
}

/**
 * React-style lazy context propagation. A memo boundary bailed on props but a
 * context its subtree consumes changed; rather than re-running the boundary's
 * body (which would re-render the bailed-out indirection — Octane's old
 * push-cascade), descend into the boundary's already-rendered child blocks and
 * refresh ONLY the ones that actually consume the changed context. The boundary
 * itself never re-runs, matching React's `['App','Consumer']` (no 'Indirection').
 */
function refreshContextConsumers(block: Block): void {
	const slots = block._slots;
	if (slots !== null) {
		for (let i = 0, n = slots.length; i < n; i++) {
			const s = slots[i];
			const k = s.__kind;
			if (k === 'forBlockSlot') {
				const items = s.items as Map<any, Block>;
				for (const item of items.values()) refreshBlockForContext(item);
				if (s.emptyBlock) refreshBlockForContext(s.emptyBlock);
			} else if (s.block) {
				// componentSlotSlot | ifBlockSlot | switchBlockSlot | activityBlockSlot
				// | trySlotSlot | portalSlotSlot | childSlot (single-child mode) — each
				// holds a single child Block.
				refreshBlockForContext(s.block);
			} else if (s.__kind === 'childSlot' && s.forSlot) {
				// childSlot in ARRAY mode: the keyed list lives in an EMBEDDED forSlot
				// (state.block is null), e.g. a memo boundary whose children are an
				// array of elements. Without this arm the consumers under it were
				// stranded by the bail.
				const items = s.forSlot.items as Map<any, Block>;
				for (const item of items.values()) refreshBlockForContext(item);
			} else if (s.__kind === 'childSlot' && s.portal !== null && s.portal.block !== null) {
				// childSlot in PORTAL mode: the content Block lives in the EMBEDDED
				// PortalSlot (state.block is null), e.g. a memo boundary whose
				// value-position child is `createPortal(...)`. The `s.block` arm above
				// covers only the compiler fast path's standalone portalSlotSlot; without
				// this arm, consumers inside a value-position portal were stranded.
				refreshBlockForContext(s.portal.block);
			}
		}
	}
}

// React.memo's bail, shared by BOTH same-component update paths (componentSlot for
// compiled component positions, childSlot for value-position children — provider
// children, `.ts` binding trees). Skip the body when new props compare equal to the
// committed props, UNLESS the component itself directly reads a changed context (then
// it must re-run). If only a DESCENDANT consumes a changed context, refresh just those
// consumers without re-running this body — React's lazy propagation. Returns true when
// the update was fully handled (bail taken); the committed props identity is kept, and
// diffing against it next time is what makes the memo terminate.
function tryMemoBail(block: Block, comp: any, props: any): boolean {
	if ((comp as any).__memo !== true) return false;
	const compare = (comp as any).__compare as ((prev: any, next: any) => boolean) | undefined;
	// React.memo's optional comparator: returns true when props are equal
	// (→ skip the render). Falls back to a shallow Object.is comparison.
	const equal = compare ? compare(block.props, props) : shallowEqualProps(block.props, props);
	if (!equal) return false;
	if (ctxDirectChanged(block)) return false;
	if (ctxDepsChanged(block)) refreshContextConsumers(block);
	restampCtxDeps(block);
	return true;
}

// React beginWork's IMPLICIT bailout (`oldProps === newProps` → skip): the SAME
// committed props object (a cached element, a `children` passthrough) cannot
// produce different output, so skip the body and lazily refresh only the
// changed-context consumers below — identical contract to the memo bail, minus
// the props comparison (reference equality was already established by the
// caller). Only ARMED blocks (value-position mounts, which stamp context deps
// like memo blocks) may take this path; an unarmed block has no dep info, so
// bailing it could strand consumers. Returns true when the update was handled.
function tryImplicitBail(block: Block): boolean {
	if (block.$$implicitBail !== true) return false;
	if (ctxDirectChanged(block)) return false;
	if (ctxDepsChanged(block)) refreshContextConsumers(block);
	restampCtxDeps(block);
	return true;
}

// After a bail the bailed subtree did NOT re-run, so its context reads were not
// re-stamped onto ancestors — but any ancestor that re-rendered THIS pass had
// its own $$ctxReads cleared by renderBlock. Without merging the bailed block's
// surviving deps back up, a later bail on that ancestor can't see that a
// consumer lives below it and strands the consumer (a changed context would
// never descend). Merge onto every memo/armed ancestor; prefer a STALE version
// over a current one so a still-pending refresh can't be masked by a fresher
// read of the same context elsewhere in the ancestor's subtree.
function restampCtxDeps(block: Block): void {
	const reads = block.$$ctxReads;
	const direct = block.$$ctxDirect;
	const hasReads = reads !== null && reads.size > 0;
	const hasDirect = direct !== null && direct.size > 0;
	if (!hasReads && !hasDirect) return;
	for (let b: Block | null = block.parentBlock; b !== null; b = b.parentBlock) {
		if ((b.body as any)?.__memo !== true && b.$$implicitBail !== true) continue;
		const m = (b.$$ctxReads ??= new Map());
		if (hasReads) {
			for (const [ctx, v] of reads!) {
				const cur = m.get(ctx);
				if (cur === undefined || cur === (ctx as any).$$version) m.set(ctx, v);
			}
		}
		if (hasDirect) {
			for (const [ctx, v] of direct!) {
				const cur = m.get(ctx);
				if (cur === undefined || cur === (ctx as any).$$version) m.set(ctx, v);
			}
		}
	}
}

function refreshBlockForContext(block: Block): void {
	if (ctxDirectChanged(block)) {
		// This child directly consumes the changed context (or shares its block
		// with a lite descendant that does): re-run it. renderBlock re-renders its
		// own subtree top-down, so nested consumers below it are reached normally.
		renderBlock(block);
	} else if ((block.body as any)?.__memo === true || block.$$implicitBail === true) {
		// A memo'd (or implicit-bail-armed) pure indirection: its $$ctxReads is
		// stamped, so prune to subtrees that actually hold a changed-context consumer.
		if (ctxDepsChanged(block)) refreshContextConsumers(block);
	} else {
		// A non-memo intermediate (control-flow branch, plain wrapper) isn't stamped
		// in $$ctxReads, so we can't prune — descend unconditionally to find any
		// consumer it strands. Bounded by this bailed boundary's subtree.
		refreshContextConsumers(block);
	}
}

const hasOwnProp = Object.prototype.hasOwnProperty;
const OBJ_PROTO = Object.prototype;

// Runs on every re-render for every memo child (both tryMemoBail call sites),
// so the common plain-object case is a zero-allocation for-in compare — no
// Object.keys arrays. Semantics match React's shallowEqual exactly: Object.is
// on values (NaN equal, ±0 differ), own-enumerable string keys only, key-SET
// equality (loop 1 checks values, loop 2's count balances the key sets), and
// an explicit-`undefined` prop still differs from a missing key (the hasOwn
// guard). Non-plain prototypes (class instances / Object.create props can
// arrive raw through createElement's props pass-through) take the exact
// Object.keys slow path, where for-in would also see inherited keys.
function shallowEqualProps(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	const pa = Object.getPrototypeOf(a);
	const pb = Object.getPrototypeOf(b);
	if ((pa !== OBJ_PROTO && pa !== null) || (pb !== OBJ_PROTO && pb !== null)) {
		return shallowEqualPropsExact(a, b);
	}
	let count = 0;
	for (const k in a) {
		const v = a[k];
		if (!Object.is(v, b[k]) || (v === undefined && !hasOwnProp.call(b, k))) return false;
		count++;
	}
	for (const _k in b) count--;
	return count === 0;
}

function shallowEqualPropsExact(a: any, b: any): boolean {
	const ka = Object.keys(a),
		kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	for (let i = 0; i < ka.length; i++) {
		const k = ka[i];
		// React uses Object.is (not ===) so NaN props compare equal and ±0 differ.
		if (!hasOwnProp.call(b, k) || !Object.is(a[k], b[k])) return false;
	}
	return true;
}

/**
 * `memo(Component)` — React-shape HOC. Returns a wrapper component that
 * skips its body when the incoming props are shallow-equal to the committed
 * ones. Children inside the wrapped body still mount/update normally on the
 * first render and any non-skip render. Pair with `useCallback` /
 * `useMemo` on the parent so handler + computed prop refs stay stable across
 * renders that don't conceptually change the child's view.
 *
 * An optional `arePropsEqual(prevProps, nextProps)` comparator mirrors
 * React.memo's second argument: return `true` to skip the render (props are
 * "equal"), `false` to re-render. When omitted, a shallow Object.is comparison
 * of own enumerable keys is used.
 */
export function memo<P>(
	component: ComponentBody<P>,
	arePropsEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
): ComponentBody<P> {
	function memoWrapper(props: P, scope: Scope, extra: any): unknown {
		// Propagate the wrapped body's return so a folded (return-based) component
		// memo()'d here still hands its descriptor back to renderBlock to mount.
		return component(props, scope, extra);
	}
	(memoWrapper as any).__memo = true;
	if (arePropsEqual) (memoWrapper as any).__compare = arePropsEqual;
	return memoWrapper as ComponentBody<P>;
}

// ---------------------------------------------------------------------------
// HMR — hot-module-replacement wrapper for exported components
// ---------------------------------------------------------------------------
//
// The compiler emits `MyComp = hmr(MyComp);` after each exported component
// when its `hmr` option is on, plus an `import.meta.hot.accept(...)` block
// that calls `MyComp[HMR].update(module.MyComp)` when the source file is
// edited at dev time. The wrapper:
//
//   1. Defers to the current `fn` on every call — invocations route through
//      `wrapper[HMR].fn` so `update()` can replace it.
//   2. Tracks every live Block currently using this wrapper in a plain (strong)
//      Set, pruned lazily: disposed blocks are retained until the next
//      `update()` call deletes them (dev-only, so retention is bounded by edit
//      frequency). On `update(newFn)` we mutate each
//      block's `body` to point at the new fn and re-render — hook state is
//      preserved because the compiler emits `Symbol.for(stableId)` for hook
//      slots (re-imports get the same Symbol identity, so the existing
//      hooks Map continues to work).
//   3. Marks the wrapper IDENTITY-stable: HMR wrappers `Foo` and `Foo` (post-
//      reload) are the same wrapper, so `componentSlot`'s identity check
//      (`comp !== state.currentComp`) doesn't tear down on every edit.
//
// `HMR` is exported as a Symbol so user code (and the compiler emit) can
// read `wrapper[HMR]` without colliding with anything else on the function.

export const HMR: unique symbol = Symbol.for('octane.hmr');

interface HmrMeta {
	fn: ComponentBody<any>;
	liveBlocks: Set<Block>;
	update(incoming: ComponentBody<any>): void;
}

type HmrWrapper = ComponentBody<any> & { [HMR]: HmrMeta };

export function hmr<P>(fn: ComponentBody<P>): ComponentBody<P> {
	const meta: HmrMeta = {
		fn,
		liveBlocks: new Set(),
		update(incoming: ComponentBody<any>): void {
			// The incoming function is the freshly-recompiled component body. If
			// the incoming function is itself an HMR wrapper (which it will be when
			// the new module re-runs `Comp = hmr(Comp)`), unwrap it down to the
			// raw fn — otherwise we'd nest wrappers on each edit.
			const incomingMeta = (incoming as any)[HMR] as HmrMeta | undefined;
			meta.fn = incomingMeta ? incomingMeta.fn : incoming;
			// Keep the forwarded fetch plan in sync with the swapped body.
			(wrapper as any).__warm = (meta.fn as any).__warm;
			// Mutate every live block's body in place and schedule a re-render.
			// The hook map persists (stable Symbol.for-based keys), so useState/
			// useEffect/etc. pick up their existing slots on the next render.
			const it = meta.liveBlocks.values();
			for (let r = it.next(); !r.done; r = it.next()) {
				const b = r.value;
				if (b.disposed) {
					meta.liveBlocks.delete(b);
					continue;
				}
				b.body = wrapper as unknown as ComponentBody<any>;
				scheduleRender(b);
			}
		},
	};
	function wrapper(props: P, scope: Scope, extra: any): unknown {
		const block = scope.block;
		// Register on first call; cleared lazily during update() if disposed.
		meta.liveBlocks.add(block);
		// Propagate the wrapped body's return — a return-based (folded) component
		// hands back a renderable descriptor that renderBlock must still mount.
		return meta.fn(props as any, scope, extra);
	}
	(wrapper as HmrWrapper)[HMR] = meta;
	// Forward the parallel-use fetch plan (docs/suspense-parallel-use-plan.md):
	// the compiler attaches `__warm` to the INNER function; cross-module
	// consumers hold this wrapper, so warmChild must find the plan here too.
	if ((fn as any).__warm !== undefined) (wrapper as any).__warm = (fn as any).__warm;
	return wrapper as ComponentBody<P>;
}

// ---------------------------------------------------------------------------
// Control flow: tryBlock — error boundary, catches render + effect errors
// ---------------------------------------------------------------------------

/**
 * Transition-suspense fallback timeout — when a transition-priority render
 * suspends on an already-committed try block, we hold the prior DOM but
 * eventually swap to the @pending fallback after this many milliseconds if
 * the promise still hasn't resolved. Matches React's "eventually shows
 * fallback if transition takes too long" contract (default 5s).
 *
 * Configurable globally via `setTransitionFallbackTimeout(ms)`. Pass
 * Infinity to disable the fallback entirely (keep prior DOM indefinitely).
 */
let TRANSITION_FALLBACK_TIMEOUT_MS = 5000;

export function setTransitionFallbackTimeout(ms: number): void {
	TRANSITION_FALLBACK_TIMEOUT_MS = ms;
}

export function getTransitionFallbackTimeout(): number {
	return TRANSITION_FALLBACK_TIMEOUT_MS;
}

interface TrySlot {
	__kind: 'trySlotSlot';
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
	/** DOM nodes (incl. markers) detached during suspend; reinserted on resume. */
	savedDom: Node[] | null;
	tryBody: ComponentBody;
	catchBody: ComponentBody | null;
	pendingBody: ComponentBody | null;
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
	/**
	 * True if a transition-priority render suspended on this try block AND we
	 * incremented TRANSITION_PENDING_COUNT to keep useTransition's isPending
	 * latched true. Released when the suspended thenable resolves (in retry).
	 */
	transitionHeld: boolean;
	/**
	 * Pending setTimeout id for the transition-suspense fallback. When a
	 * transition-priority render suspends on an already-committed try block
	 * we hold the prior DOM AND schedule a fallback swap so the user isn't
	 * stuck with stale content forever. Matches React's "eventually shows
	 * fallback" contract — see TRANSITION_FALLBACK_TIMEOUT_MS.
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
	 * doesn't re-detach), re-attached + cleared on reveal. null = nothing detached.
	 */
	detachedRefs: { ref: any; el: any }[] | null;
	domParent: Node;
	parentBlock: Block;
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
): void {
	const parentBlock = parentScope.block;
	let state = parentScope.slots[slotKey] as TrySlot | undefined;
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		// Hydration: the server (Phase 4) awaited use() and wrapped the resolved
		// SUCCESS arm (or @catch arm) in a `<!--[-->…<!--]-->` range. Adopt it as the
		// slot; mountTry brackets the content and the seeded use() values let the try
		// body render its success arm synchronously. `resolveHydrationOpen` also covers
		// the SOLE-hole case (a @try that is the only thing a component/arm renders —
		// the router `Match` shape `<ctx.Provider> @try {…}`), where the anchor is the
		// enclosing scope's end marker and the cursor is parked on the @try's open.
		const open = resolveHydrationOpen(anchor ?? null, domParent);
		if (open !== null) {
			start = open;
			end = matchingClose(open);
		} else {
			start = document.createComment('try');
			end = document.createComment('/try');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (e.g. when this slot lives in a mixed-children
			// template and must sit before its in-template static-sibling anchor).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		const newState: TrySlot = {
			__kind: 'trySlotSlot',
			start,
			end,
			branch: -1,
			block: null,
			tryBlock: null,
			savedDom: null,
			tryBody,
			catchBody,
			pendingBody,
			env,
			hasResolved: false,
			err: null,
			pendingThenable: null,
			transitionHeld: false,
			transitionTimeoutId: null,
			detachedRefs: null,
			domParent,
			parentBlock,
		};
		parentScope.slots[slotKey] = newState;
		registerSlot(parentScope, newState);
		state = newState;
	} else {
		state.tryBody = tryBody;
		state.catchBody = catchBody;
		state.pendingBody = pendingBody;
		state.env = env;
	}
	const s = state;
	if (s.branch === 0) {
		// Already showing catch — re-render with current err (props identity unchanged).
		s.block!.body = s.catchBody!;
		s.block!.props = { err: s.err, reset: () => requestReset(s) };
		s.block!.extra = s.env;
		renderBlock(s.block!);
	} else if (s.branch === 2) {
		// Already pending — no work; will be swapped when thenable resolves.
	} else if (s.branch === 1 && s.tryBlock) {
		// Try body is currently visible — re-render in place so we don't tear
		// down its DOM. If the re-render suspends, handleSuspense decides
		// whether to preserve the DOM (keep) or swap to pending (default).
		s.tryBlock.body = s.tryBody;
		s.tryBlock.extra = s.env;
		try {
			renderBlock(s.tryBlock);
			// Successful commit — this supersedes any in-flight transition
			// suspended on this slot. Release the held transition counter and
			// invalidate the pending retry so the eventual .then callback no-ops.
			// Matches React's "urgent setState while transition is suspended
			// discards the transition" semantics (ReactUse-test.js:1631).
			releaseHeldTransition(s);
			s.pendingThenable = null;
		} catch (err) {
			if (isSuspenseException(err)) handleSuspense(s, err.thenable, s.tryBlock);
			else switchToCatch(s, err);
		}
	} else if (s.tryBlock && s.savedDom) {
		// Pending is visible AND we have a preserved try block — re-render it
		// (it'll throw again at the same use() since the promise hasn't
		// resolved). This entry point is hit when the surrounding component
		// re-renders for an unrelated reason while we're suspended.
		s.tryBlock.body = s.tryBody;
		s.tryBlock.extra = s.env;
		try {
			renderBlock(s.tryBlock);
		} catch {
			/* expected: still pending; handled by attachResume */
		}
	} else {
		mountTry(s);
	}
}

function mountTry(state: TrySlot): void {
	// Fresh start. If there's leftover state from a prior cycle (e.g. after
	// catch reset), clear it first. Compare `block` against the tryBlock we are
	// about to unmount so a visible try body isn't sent through unmountBlock a
	// second time (it's idempotent, but the second pass is pure waste).
	const oldTry = state.tryBlock;
	if (oldTry) {
		unmountBlock(oldTry);
		state.tryBlock = null;
	}
	if (state.block && state.block !== oldTry) {
		unmountBlock(state.block);
	}
	state.block = null;
	state.savedDom = null;
	state.hasResolved = false;
	state.branch = 1;
	let bStart: Node;
	let bEnd: Node;
	// Streamed-boundary seed scope: the swap runtime ($OCTRC) left a
	// `<!--oct-seed:id-->` comment between the slot's open marker and the inner
	// branch range, with the boundary's seed JSON stashed on window.$OCTS[id].
	// Scope the seed stream to THIS boundary while its subtree hydrates (a
	// depth-first synchronous render), restoring the outer scope after — nested
	// streamed boundaries push again naturally.
	let scopedSeeds: unknown[] | null = null;
	let adoptCursor = state.start.nextSibling;
	if (
		hydrating &&
		adoptCursor !== null &&
		adoptCursor.nodeType === 8 &&
		(adoptCursor as Comment).data.startsWith(STREAM_SEED_COMMENT)
	) {
		const id = (adoptCursor as Comment).data.slice(STREAM_SEED_COMMENT.length);
		const stash = typeof window !== 'undefined' ? (window as any).$OCTS : undefined;
		const raw = stash !== undefined ? stash[id] : undefined;
		if (typeof raw === 'string') scopedSeeds = parseSeedJson(raw);
		adoptCursor = adoptCursor.nextSibling;
	}
	if (hydrating && isBlockOpen(adoptCursor)) {
		// ADOPT the server's inner arm range (no inserted markers — byte-for-byte;
		// see ifBlock). The seeded use() values let the try body render its success
		// arm and adopt the server DOM.
		bStart = adoptCursor as Comment;
		bEnd = matchingClose(bStart);
		hydrateNode = bStart.nextSibling;
	} else {
		scopedSeeds = null;
		bStart = document.createComment('try-b');
		bEnd = document.createComment('/try-b');
		state.domParent.insertBefore(bStart, state.end);
		state.domParent.insertBefore(bEnd, state.end);
	}
	const b = createBlock(
		'control-flow',
		state.parentBlock,
		state.domParent,
		bStart,
		bEnd,
		state.tryBody,
		undefined,
		state.env,
	);
	(b as any).__trySlot = state;
	// Register handlers so descendant effect/render errors can find us.
	(b as any).$$tryHandler = (err: any) => switchToCatch(state, err);
	(b as any).__suspenseHandler = (thenable: TrackedThenable<any>, sourceBlock: Block) => {
		handleSuspense(state, thenable, sourceBlock);
	};
	state.tryBlock = b;
	state.block = b;
	// Install this boundary's streamed seed scope (if any) for the subtree render.
	const prevSeeds = hydrationSeeds;
	const prevSeedCursor = hydrationSeedCursor;
	if (scopedSeeds !== null) {
		hydrationSeeds = scopedSeeds;
		hydrationSeedCursor = 0;
	}
	try {
		renderBlock(b);
		state.hasResolved = true;
	} catch (err) {
		if (isSuspenseException(err)) {
			handleSuspense(state, err.thenable, b);
		} else {
			if (state.tryBlock) {
				unmountBlock(state.tryBlock);
				state.tryBlock = null;
				state.block = null;
			}
			switchToCatch(state, err);
		}
	} finally {
		if (scopedSeeds !== null) {
			hydrationSeeds = prevSeeds;
			hydrationSeedCursor = prevSeedCursor;
		}
	}
}

/**
 * Detach the try block's DOM range from the document, saving the nodes for
 * later reinsertion. Crucially: does NOT unmount the block, run cleanups, or
 * clear `_b.*` bindings — so `useState`/`useMemo`/`useRef` state AND the
 * `_b._el$N` DOM-node references survive intact (the same DOM nodes will
 * be reinserted into the same parent on resume, so the references stay valid).
 * Mirrors React's "WIP-fiber-discarded-but-committed-state-preserved" contract.
 */
function softDetachTryBlock(state: TrySlot): void {
	if (!state.tryBlock || state.savedDom) return;
	const saved: Node[] = [];
	const start = state.tryBlock.startMarker!;
	const end = state.tryBlock.endMarker!;
	const parent = start.parentNode!;
	let n: Node | null = start;
	while (n) {
		const next: Node | null = n.nextSibling;
		saved.push(n);
		parent.removeChild(n);
		if (n === end) break;
		n = next;
	}
	state.savedDom = saved;
}

function reattachTryBlock(state: TrySlot): void {
	if (!state.savedDom) return;
	for (const n of state.savedDom) state.domParent.insertBefore(n, state.end);
	state.savedDom = null;
}

/**
 * Decrement the transition counter we held open during a suspended transition.
 * Called from any path where the transition is now resolved or superseded.
 * No-op if no hold is currently held.
 */
function releaseHeldTransition(state: TrySlot): void {
	if (state.transitionHeld) {
		state.transitionHeld = false;
		tickTransitionCount(-1);
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

function handleSuspense(state: TrySlot, thenable: TrackedThenable<any>, sourceBlock: Block): void {
	// Transition-priority suspends on an ALREADY-committed try block keep the
	// prior DOM visible — matches React's `useTransition` contract that the
	// previous screen stays mounted until the new tree is fully ready. We also
	// hold the transition counter open until the suspended render resumes, so
	// `useTransition`'s isPending stays true the whole time.
	//
	// The hold fires for the boundary's OWN body re-suspend AND for a DESCENDANT
	// re-suspend (a child component that re-rendered on its own — its own
	// scheduleRender — and suspended during a transition). `handleSuspense` is
	// only invoked for suspends routed to THIS boundary's `__suspenseHandler`
	// (the nearest enclosing tryBlock), so `sourceBlock` is always this
	// boundary's body OR a descendant within its subtree — we don't need to test
	// which. What we DO require is that the resolved try content is currently
	// committed AND intact:
	//   - branch === 1: the try body (not @pending / @catch) is the visible arm.
	//   - savedDom === null: that DOM is live in the document, not already
	//     detached by a prior softDetach.
	// Both together guarantee the prior committed DOM is on screen and untouched.
	// For `use(thenable)` / `useSuspenseQuery` the suspend is thrown during the
	// descendant's setup BEFORE it patches any of its own JSX (the body aborts
	// before its childSlot/componentSlot commit), so no committed DOM was
	// mid-mutated — holding it as-is is correct. attachResume re-renders the held
	// tryBlock on resolve, which re-renders the descendant by key with its hook
	// state intact (same preserved-state contract the softDetach path documents
	// below). A NON-transition descendant re-suspend skips this branch and falls
	// through to softDetach + @pending, unchanged.
	// A transition-priority suspend STARTS a hold. But once a hold is in effect,
	// React keeps showing the prior content until the NEW tree is ready — it does
	// not flash the fallback if that still-committed content re-suspends again,
	// even when the re-suspending render arrives at URGENT priority. This is the
	// real-world `useSuspenseQuery` shape: a transition changes the query key
	// (transition render → hold begins), then the query observer notifies
	// ASYNCHRONOUSLY on a later macrotask — AFTER octane's transition window
	// (TRANSITION_DEPTH / ASYNC_TRANSITION_COUNT) has closed — so the re-render
	// that re-suspends on the new in-flight fetch is URGENT. React holds; we must
	// too. We therefore CONTINUE the hold when `state.transitionHeld` is already
	// set, regardless of the current render's priority.
	//
	// This stays safe for a NON-held urgent suspend: the hold (whether started by
	// a transition OR continued here) still REQUIRES `hasResolved && branch === 1
	// && savedDom === null`, i.e. the boundary's own committed try content is live
	// and intact on screen. A FRESH urgent render that suspends with no prior
	// content (branch !== 1, or not yet resolved) and `transitionHeld === false`
	// falls through to softDetach + @pending and shows the fallback — React parity
	// for urgent suspense. The held DOM is untouched because `use()` /
	// `useSuspenseQuery` throw during setup BEFORE the descendant patches any of
	// its JSX, so the committed nodes are not mid-mutated. attachResume tracks the
	// new thenable and re-renders the held tryBlock at transition priority on
	// resolve; the existing fallback timeout remains the safety valve for a
	// never-resolving boundary.
	const isTransition = sourceBlock.currentRenderMode === 'transition';
	if (
		(isTransition || state.transitionHeld) &&
		state.hasResolved &&
		state.branch === 1 &&
		state.savedDom === null
	) {
		if (!state.transitionHeld) {
			state.transitionHeld = true;
			tickTransitionCount(+1);
		}
		// Join the entangled-transition group so its reveal is coordinated with any
		// sibling boundaries suspended in the same transition (commit-barrier above).
		enterHeldTransition(state);
		// Schedule a fallback swap so the user isn't stuck forever staring at
		// stale content when the transition's promise takes too long. The
		// counter stays held — `isPending` remains true through the fallback
		// window because the transition is still in progress, semantically. On
		// retry resolve, the timeout is cleared and the saved tryBlock is
		// re-attached. Infinity → fallback never fires (legacy hold-forever).
		//
		// If the held content re-suspends on a DIFFERENT thenable (e.g. the
		// transition changed the value to 2, holding on d2; then an urgent update
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

	// PRESERVE the try-body block's hooks Map, `_b.*` bindings, and DOM (via the
	// helper's softDetach) — whether the suspend came from the try-body block
	// itself OR a nested descendant block (e.g. a child component that re-renders
	// on its own and then suspends). The old nested-case behavior unmounted the
	// whole try subtree, discarding every descendant `scope.hooks` Map, so
	// useState / useMemo / useRef silently reset on resume — a latent data-loss
	// bug. Keeping the same blocks means the resume path (attachResume)
	// re-renders the held tryBlock, which reconciles descendants by key with
	// their state intact — React's committed-state-preserved-while-suspended
	// contract. (The transition HOLD path keeps content visible and does NOT
	// come here, so its effects correctly stay live.)
	if (!hideTryContentAndMountPending(state)) return;
	attachResume(state, thenable);
}

/**
 * Hide the try content behind the @pending fallback. The single hide-and-mount
 * sequence shared by handleSuspense's suspend path and swapToPendingFallback:
 *
 *  1. softDetach the tryBlock — its hooks Map, `_b.*` bindings, and DOM are
 *     preserved (DOM parked in `savedDom`) for the resume re-attach.
 *  2. React parity: while the boundary shows its fallback, the hidden subtree's
 *     effects are DESTROYED (cleanups run) and RECREATED on reveal — a suspended
 *     subtree has no active effects. deactivateScope recursively fires the
 *     subtree's effect cleanups + clears their deps so the resume re-render
 *     re-enqueues + re-fires them. Per ReactSuspenseEffectsSemantics-test.js.
 *  3. Detach the hidden subtree's host refs (object → null, callbacks called
 *     with null), recreated on reveal — React cycles refs across a suspend like
 *     layout effects. Only on the FIRST hide; a re-suspend during a partial
 *     resolve must not re-detach.
 *  4. Mark the hidden subtree inactive (the <Activity> mechanism) so drainPhase
 *     SKIPS any effects the just-aborted (re-)suspending render enqueued for it —
 *     otherwise a boundary that re-suspends DURING a resume (e.g. one of several
 *     promises resolves but another is still pending) leaves stale layout effects
 *     in the queue, and the scheduler never goes quiescent. Cleared on reveal
 *     (attachResume) so effects re-fire; inactive also blocks further enqueues.
 *  5. A re-suspend while ALREADY pending (branch === 2, a @pending body mounted)
 *     must REPLACE the prior pending body, not stack a second one. The existing
 *     pending block lives in `state.block` (it is never the tryBlock once we've
 *     soft-detached); unmount it so its DOM is removed exactly once before the
 *     fresh @pending body mounts. Without this, two consecutive suspends on the
 *     same boundary (e.g. two sequential useSuspenseQuery calls) leave both
 *     fallbacks — and ultimately the resolved content alongside a stuck fallback
 *     — in the DOM at once. The tryBlock is preserved separately (savedDom), so
 *     this never touches it.
 *  6. Mount the fresh @pending body between minted `pend-b` markers; a throw
 *     while rendering it unwinds to @catch via switchToCatch.
 *
 * Returns false when the pending body threw and the boundary switched to @catch
 * — the caller must bail out (no resume wiring for a dead boundary).
 */
function hideTryContentAndMountPending(state: TrySlot): boolean {
	softDetachTryBlock(state);
	if (state.tryBlock) {
		deactivateScope(state.tryBlock);
		if (state.detachedRefs === null) {
			state.detachedRefs = [];
			detachSubtreeRefs(state.tryBlock, state.detachedRefs);
		}
		state.tryBlock.inactive = true;
	}
	if (state.block && state.block !== state.tryBlock) {
		unmountBlock(state.block);
	}
	state.block = null;
	state.branch = 2;
	if (state.pendingBody) {
		const bStart = document.createComment('pend-b');
		const bEnd = document.createComment('/pend-b');
		state.domParent.insertBefore(bStart, state.end);
		state.domParent.insertBefore(bEnd, state.end);
		const b = createBlock(
			'control-flow',
			state.parentBlock,
			state.domParent,
			bStart,
			bEnd,
			state.pendingBody,
			undefined,
			state.env,
		);
		(b as any).__trySlot = state;
		state.block = b;
		try {
			renderBlock(b);
		} catch (err) {
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

/**
 * Soft-detach the held tryBlock (preserving its hook state and DOM in
 * `savedDom`) and mount the @pending body in its place. Used by the
 * transition-fallback timeout when a held transition runs over budget — by
 * that point the user has waited long enough that React (and we) commit the
 * fallback to give visual feedback. The retry path re-attaches savedDom on
 * resolve, so this is recoverable. (The resume listener is already attached —
 * the hold began in handleSuspense — so unlike the suspend path there is no
 * attachResume here.)
 *
 * No-op when no pending body was compiled OR when state has already moved
 * (e.g. resolve raced the timeout).
 */
function swapToPendingFallback(state: TrySlot): void {
	if (!state.pendingBody || state.branch !== 1 || !state.tryBlock) return;
	hideTryContentAndMountPending(state);
}

// Commit a resolved boundary's reveal: reattach its held/detached DOM, re-render the
// try body, re-attach host refs, and drain its effects. Runs in a thenable microtask
// (outside the normal flush) OR from the entangled-batch flush. Releases the transition
// hold; a re-suspend during the re-render re-acquires it via handleSuspense.
function commitResume(state: TrySlot): void {
	const wasHeld = state.transitionHeld;
	if (wasHeld) state.transitionHeld = false;
	// Leave the coordination sets — this boundary is committing now (a re-suspend
	// during the re-render re-adds it via handleSuspense → enterHeldTransition).
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	try {
		if (state.tryBlock && !state.tryBlock.disposed) {
			if (state.savedDom) {
				if (state.block && state.block !== state.tryBlock) {
					unmountBlock(state.block);
					state.block = null;
				}
				reattachTryBlock(state);
			}
			state.block = state.tryBlock;
			state.branch = 1;
			state.tryBlock.body = state.tryBody;
			// Preserve transition priority on the retry render — the retry is a
			// continuation of the same transition, so a re-suspend on a different
			// promise should also keep the prior DOM (and isPending stays true).
			if (wasHeld) state.tryBlock.pendingMode = 'transition';
			// Reveal: clear the hidden-subtree inactive flag (set on hide) so its effects
			// re-enqueue + re-fire (recreate) during this resume render.
			state.tryBlock.inactive = false;
			// Mark the replay window: useThenable's fresh-thenable reuse leniency
			// and the waterfall diagnostic apply only while a resolved suspension
			// is being replayed (ordinary updates must keep replacing thenables).
			const prevReplay = RESUME_REPLAY;
			RESUME_REPLAY = true;
			try {
				renderBlock(state.tryBlock);
				state.hasResolved = true;
				// Reveal: re-attach the host refs detached on hide (same preserved nodes),
				// before commitEffects fires the recreated layout effects (which may read
				// them). The re-render above leaves them detached — the stored ref value is
				// unchanged, so a component's own attach path no-ops on it.
				if (state.detachedRefs !== null) {
					const refs = state.detachedRefs;
					state.detachedRefs = null;
					for (let i = 0; i < refs.length; i++) attachRef(refs[i].ref, refs[i].el);
				}
			} catch (err) {
				if (isSuspenseException(err)) handleSuspense(state, err.thenable, state.tryBlock!);
				else switchToCatch(state, err);
			} finally {
				RESUME_REPLAY = prevReplay;
			}
		} else {
			mountTry(state);
		}
		// Commit the resume's effects on BOTH paths (the retry runs in a thenable
		// microtask, outside the normal flush): a full reveal RECREATES the destroyed
		// layout effects (ReactSuspenseEffectsSemantics); a re-suspend (one of several
		// promises resolved, another still pending) enqueued effects for the now-hidden
		// subtree that drainPhase must SKIP (inactive) and CLEAR — without draining here
		// the LAYOUT queue stays non-empty and the scheduler never goes quiescent.
		commitEffects();
	} finally {
		if (wasHeld) tickTransitionCount(-1);
	}
}

/**
 * Nearest enclosing SUSPENSE-HIDDEN boundary: a tryBlock ancestor whose slot
 * has its try content soft-detached into `savedDom` (fallback showing). The
 * pending arm's own block also carries `__trySlot`, but only the TRY block
 * matches `slot.tryBlock === p`, so updates inside the fallback render
 * normally. <Activity>-hidden subtrees (also `inactive`) are untouched — their
 * DOM stays live, only this savedDom regime is geometry-unsafe to render into.
 */
function findSuspenseHiddenTry(block: Block): TrySlot | null {
	for (let p: Block | null = block; p !== null; p = p.parentBlock) {
		const slot = (p as any).__trySlot as TrySlot | undefined;
		if (slot !== undefined && slot.tryBlock === p && slot.savedDom !== null) return slot;
	}
	return null;
}

/**
 * Re-attempt a suspense-hidden boundary's try body because state INSIDE the
 * hidden subtree changed (a setState / external-store update scheduled a render
 * on a soft-detached block). React parity: an update to a suspended component
 * RETRIES the render — if it no longer suspends (e.g. a store flipped to ready
 * before the suspending promise resolved), the boundary reveals now, without
 * that promise ever settling.
 *
 * The body must render against LIVE geometry — fresh mounts inside it insert
 * relative to sibling markers, and a mixed live/detached range makes those
 * insertions target dismembered parents. So: reattach savedDom first (the
 * pending arm stays put; nothing paints mid-flush), render, then either commit
 * the reveal (drop the pending arm, reactivate effects + refs — the
 * commitResume choreography) or re-stash and stay on the fallback.
 */
function attemptHiddenReveal(state: TrySlot): void {
	const tryBlock = state.tryBlock;
	if (tryBlock === null || tryBlock.disposed || state.savedDom === null) return;
	reattachTryBlock(state);
	tryBlock.body = state.tryBody;
	tryBlock.inactive = false;
	try {
		renderBlock(tryBlock);
		// Success — reveal without the suspending promise ever resolving.
		if (state.block !== null && state.block !== tryBlock) {
			unmountBlock(state.block);
		}
		state.block = tryBlock;
		state.branch = 1;
		state.hasResolved = true;
		// Invalidate the wired resume: when the original thenable eventually
		// settles, its retry sees a mismatched pendingThenable and no-ops.
		state.pendingThenable = null;
		if (state.detachedRefs !== null) {
			const refs = state.detachedRefs;
			state.detachedRefs = null;
			for (let i = 0; i < refs.length; i++) attachRef(refs[i].ref, refs[i].el);
		}
		if (state.transitionTimeoutId !== null) {
			clearTimeout(state.transitionTimeoutId);
			state.transitionTimeoutId = null;
		}
		if (state.transitionHeld) {
			state.transitionHeld = false;
			tickTransitionCount(-1);
		}
		if (HELD_TRANSITIONS.has(state)) {
			HELD_TRANSITIONS.delete(state);
			STAGED_REVEALS.delete(state);
			// Mid-flush: defer the staged-batch check so this drain doesn't
			// re-enter commitResume for entangled siblings.
			queueMicrotask(flushStagedRevealsIfReady);
		}
	} catch (err) {
		if (isSuspenseException(err)) {
			// Still suspended — re-stash the try DOM (the pending arm never moved)
			// and keep/refresh the resume wiring for the (possibly new) thenable.
			softDetachTryBlock(state);
			tryBlock.inactive = true;
			attachResume(state, (err as SuspenseException).thenable);
		} else {
			switchToCatch(state, err);
		}
	}
}

/** Register a boundary as holding prior content for an in-flight transition. */
function enterHeldTransition(state: TrySlot): void {
	HELD_TRANSITIONS.add(state);
	STAGED_REVEALS.delete(state); // a re-suspend means it is no longer data-ready
}

/**
 * Remove a boundary from the coordination sets when it stops holding WITHOUT a normal
 * reveal — urgent supersede, error, or unmount. If the remaining held boundaries are
 * now all data-ready, commit them (don't strand them waiting on a boundary that left).
 */
function abandonHeldTransition(state: TrySlot): void {
	if (!HELD_TRANSITIONS.has(state)) return;
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	flushStagedRevealsIfReady();
}

/** Commit all staged reveals together once every held boundary is data-ready. */
function flushStagedRevealsIfReady(): void {
	if (STAGED_REVEALS.size > 0 && STAGED_REVEALS.size === HELD_TRANSITIONS.size) {
		flushStagedReveals();
	}
}

function flushStagedReveals(): void {
	if (flushingStagedReveals) return; // re-entrancy guard (a reveal may abandon a sibling)
	flushingStagedReveals = true;
	try {
		const batch = [...STAGED_REVEALS];
		STAGED_REVEALS.clear();
		for (const s of batch) {
			// A prior reveal in this batch may have torn down a later one (a boundary that
			// renders a sibling boundary). Skip any that were disposed meanwhile.
			if (s.tryBlock !== null && s.tryBlock.disposed) continue;
			commitResume(s);
		}
	} finally {
		flushingStagedReveals = false;
	}
}

/**
 * Wire up a `.then` listener that retries the try body when the thenable
 * settles. Dedupes by `pendingThenable` so two suspends on the same promise
 * don't queue two retries.
 */
function attachResume(state: TrySlot, thenable: TrackedThenable<any>): void {
	if (state.pendingThenable === thenable) return;
	state.pendingThenable = thenable;
	const retry = () => {
		if (state.pendingThenable !== thenable) return; // superseded by a fresher suspend
		state.pendingThenable = null;
		// Cancel any pending transition-fallback timeout — the promise resolved
		// before the timeout would have swapped to @pending, so the prior DOM
		// stays put and the just-resolved render commits over it directly.
		if (state.transitionTimeoutId !== null) {
			clearTimeout(state.transitionTimeoutId);
			state.transitionTimeoutId = null;
		}
		// Entangled-transition commit barrier: a boundary holding prior content for an
		// in-flight transition does NOT reveal the moment its own data resolves — it
		// waits until EVERY held boundary in the transition is data-ready, then they all
		// reveal together (React's atomic-commit contract). The boundary stays held (its
		// counter stays up, so isPending stays true) until the batch flush.
		if (HELD_TRANSITIONS.has(state)) {
			STAGED_REVEALS.add(state);
			if (STAGED_REVEALS.size < HELD_TRANSITIONS.size) return; // others still pending
			flushStagedReveals();
			return;
		}
		commitResume(state);
	};
	thenable.then(retry, retry);
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
	// Bump the priority flag FIRST so any scheduleRender calls fired by the
	// listener notification (and by fn itself) are tagged as transition.
	TRANSITION_DEPTH++;
	// A transition started synchronously during a form's submit dispatch
	// entangles with that form's status (manual-action useFormStatus activation —
	// see publishManualFormPending). Registered here; every settle path below
	// notifies the record exactly once.
	const submitRec = ACTIVE_SUBMIT_DISPATCH;
	if (submitRec !== null) submitRec.transitions++;
	let result: unknown;
	try {
		tickTransitionCount(+1);
		try {
			result = fn();
		} finally {
			TRANSITION_DEPTH--;
		}
	} catch (err) {
		tickTransitionCount(-1);
		if (submitRec !== null) settleSubmitTransition(submitRec);
		// Don't strand resets queued before the throw — they'd fire on an unrelated
		// later transition's settle otherwise. (flushFormResets self-guards if an
		// outer transition window is still open.)
		flushFormResets();
		throw err;
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
			ASYNC_TRANSITION_COUNT--;
			tickTransitionCount(-1);
			if (submitRec !== null) settleSubmitTransition(submitRec);
			// The action window (may have) closed — apply queued requestFormReset()s.
			flushFormResets();
		};
		(result as Promise<unknown>).then(settle, settle);
	} else {
		// Synchronous callback: decrement after the scheduler has had a chance to
		// flush the queued renders this transition produced — if any of those
		// renders held the transition open by suspending, they incremented the
		// count themselves via handleSuspense, so the net count stays > 0.
		queueMicrotask(() => {
			tickTransitionCount(-1);
			if (submitRec !== null) settleSubmitTransition(submitRec);
			flushFormResets();
		});
	}
}

export function useTransition(
	slot?: symbol,
): [boolean, (fn: () => void | Promise<unknown>) => void] {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useTransition');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as
		| { isPending: boolean; start: (fn: () => void | Promise<unknown>) => void }
		| undefined;
	if (s === undefined) {
		const slotRef = { isPending: false, start: startTransition };
		s = slotRef;
		ensureHooks(scope).set(slot, slotRef);
		const listener = () => {
			const next = TRANSITION_PENDING_COUNT > 0;
			if (slotRef.isPending !== next) {
				slotRef.isPending = next;
				if (!block.disposed) scheduleRender(block);
			}
		};
		TRANSITION_LISTENERS.add(listener);
		scope.cleanups.push(() => TRANSITION_LISTENERS.delete(listener));
	}
	return [s.isPending, s.start];
}

// ---------------------------------------------------------------------------
// useActionState(action, initialState, permalink?) → [state, formAction, isPending]
//
// `action(previousState, payload)` runs inside a transition. `formAction` is a
// stable dispatcher you wire to `<form action={formAction}>` (payload = FormData)
// or call directly (`formAction(payload)`). Dispatches run SEQUENTIALLY, each
// receiving the previous COMPLETED result as previousState. `isPending` is true
// from dispatch until the queue drains. The action's resolved value becomes the
// new state. Errors route to the nearest @try boundary (else console.error).
// `permalink` (server-action progressive enhancement) is accepted for signature
// parity and ignored — octane actions run only on the client (no server-action
// execution); SSR renders the initial state. Form auto-reset is intentionally
// skipped for useActionState forms (typed-in values are kept), matching React.
// ---------------------------------------------------------------------------

interface ActionStateSlot<S> {
	state: S;
	isPending: boolean;
	pendingCount: number;
	chain: Promise<S>;
	action: (prev: S, payload: any) => S | Promise<S>;
	dispatch: ((payload?: any) => Promise<S>) & { $$isActionDispatcher?: true };
}

export function useActionState<S>(
	action: (prevState: S, payload: any) => S | Promise<S>,
	initialState: S,
	permalinkOrSlot?: string | symbol,
	slot?: symbol,
): [S, (payload?: any) => void, boolean] {
	// `permalink` is optional, the compiler appends the slot last. Disambiguate:
	// a trailing symbol in the 3rd position means no permalink was passed.
	if (typeof permalinkOrSlot === 'symbol') slot = permalinkOrSlot;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useActionState');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as ActionStateSlot<S> | undefined;
	if (s === undefined) {
		const slotRef: ActionStateSlot<S> = {
			state: initialState,
			isPending: false,
			pendingCount: 0,
			chain: Promise.resolve(initialState),
			action,
			dispatch: undefined as any,
		};
		const setPending = (next: boolean): void => {
			if (slotRef.isPending !== next) {
				slotRef.isPending = next;
				if (!block.disposed) scheduleRender(block);
			}
		};
		const dispatch = ((payload?: any): Promise<S> => {
			slotRef.pendingCount++;
			setPending(true);
			// Sequential queue: each run sees the prior COMPLETED state.
			slotRef.chain = slotRef.chain.then(
				(prevState) =>
					new Promise<S>((resolveResult) => {
						const finish = (): void => {
							slotRef.pendingCount--;
							if (slotRef.pendingCount === 0) setPending(false);
						};
						startTransition(() => {
							let p: Promise<S>;
							try {
								p = Promise.resolve(slotRef.action(prevState, payload));
							} catch (err) {
								// A SYNCHRONOUS throw from the action would otherwise escape
								// startTransition before `finish` is wired, leaving pendingCount
								// (and isPending) stuck true forever and rejecting the chain so the
								// queue stops threading. Settle it exactly like the async-rejection
								// path: clear pending, route the error, keep prior state.
								finish();
								const handler = findTryHandler(block);
								if (handler) handler(err);
								else console.error(err);
								resolveResult(prevState);
								return;
							}
							p.then(
								(result) => {
									slotRef.state = result;
									finish();
									if (!block.disposed) scheduleRender(block);
									resolveResult(result);
								},
								(err) => {
									finish();
									const handler = findTryHandler(block);
									if (handler) handler(err);
									else console.error(err);
									// Keep prior state so the next queued dispatch threads it.
									resolveResult(prevState);
								},
							);
							return p;
						});
					}),
			);
			return slotRef.chain;
		}) as ActionStateSlot<S>['dispatch'];
		dispatch.$$isActionDispatcher = true;
		slotRef.dispatch = dispatch;
		s = slotRef;
		ensureHooks(scope).set(slot, slotRef);
	}
	// Keep the action reference fresh across renders (closures over latest props).
	s.action = action;
	return [s.state, s.dispatch, s.isPending];
}

// ---------------------------------------------------------------------------
// useFormStatus() → { pending, data, method, action }
//
// Reads the submission status of the nearest ANCESTOR <form> (found by walking
// the DOM up from this component's markers — so a <form> rendered BY this same
// component is correctly ignored, matching React). Subscribes to that form's
// status so a submission re-renders the consumer. Defaults to the idle status
// when there is no ancestor form or no active submission.
// ---------------------------------------------------------------------------

function findAncestorForm(block: Block): HTMLFormElement | null {
	let n: Node | null = block.startMarker ?? block.parentNode ?? null;
	while (n) {
		if ((n as any).nodeName === 'FORM') return n as HTMLFormElement;
		n = n.parentNode;
	}
	return null;
}

interface FormStatusSlot {
	form: HTMLFormElement | null;
	listener: (() => void) | null;
}

export function useFormStatus(slot?: symbol): FormStatus {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useFormStatus');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as FormStatusSlot | undefined;
	if (s === undefined) {
		s = { form: null, listener: null };
		const slotRef = s;
		ensureHooks(scope).set(slot, slotRef);
		scope.cleanups.push(() => {
			if (slotRef.form && slotRef.listener)
				FORM_STATUS_LISTENERS.get(slotRef.form)?.delete(slotRef.listener);
		});
	}
	// Re-resolve the nearest ANCESTOR <form> on EVERY render: a conditionally
	// rendered form (or a moved consumer) means the form can appear/change after
	// the first run. Re-subscribe when it changes; caching only the first result
	// would leave the hook stuck reporting idle for a form that showed up later.
	const form = findAncestorForm(block);
	if (form !== s.form) {
		if (s.form && s.listener) FORM_STATUS_LISTENERS.get(s.form)?.delete(s.listener);
		s.form = form;
		if (form) {
			const listener = (): void => {
				if (!block.disposed) scheduleRender(block);
			};
			s.listener = listener;
			let set = FORM_STATUS_LISTENERS.get(form);
			if (!set) {
				set = new Set();
				FORM_STATUS_LISTENERS.set(form, set);
			}
			set.add(listener);
		} else {
			s.listener = null;
		}
	}
	return s.form ? (FORM_STATUS.get(s.form) ?? IDLE_FORM_STATUS) : IDLE_FORM_STATUS;
}

// ---------------------------------------------------------------------------
// useOptimistic(state, updateFn?) → [optimisticState, addOptimistic]
//
// `optimisticState` equals `state` unless an Action/transition is in flight, in
// which case it is `state` folded through `updateFn(acc, value)` for each queued
// addOptimistic call (or the raw value when no updateFn). The queue is cleared
// when the owning transition settles, so optimistic and real state converge in
// the same commit — on success `state` has advanced, on error it is unchanged
// (automatic revert). addOptimistic should be called inside an Action.
// ---------------------------------------------------------------------------

interface OptimisticSlot<S, V> {
	queue: V[];
	updateFn?: (state: S, value: V) => S;
	add: (value: V) => void;
	/**
	 * True when the queue was populated INSIDE a transition, so it should clear
	 * when that transition settles (count → 0). Without this, an addOptimistic
	 * called outside any transition would (a) never clear via the listener, and
	 * (b) be wiped by an unrelated transition elsewhere settling. See `add`.
	 */
	armed: boolean;
}

export function useOptimistic<S, V = S>(
	passthrough: S,
	updateFnOrSlot?: ((state: S, value: V) => S) | symbol,
	slot?: symbol,
): [S, (value: V) => void] {
	let updateFn: ((state: S, value: V) => S) | undefined;
	if (typeof updateFnOrSlot === 'symbol') slot = updateFnOrSlot;
	else updateFn = updateFnOrSlot;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useOptimistic');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as OptimisticSlot<S, V> | undefined;
	if (s === undefined) {
		const clear = (): void => {
			slotRef.armed = false;
			if (slotRef.queue.length > 0) {
				slotRef.queue.length = 0;
				if (!block.disposed) scheduleRender(block);
			}
		};
		const slotRef: OptimisticSlot<S, V> = {
			queue: [],
			updateFn,
			armed: false,
			add: (value: V) => {
				slotRef.queue.push(value);
				if (TRANSITION_PENDING_COUNT > 0) {
					// Inside an Action: the optimistic value is held until that
					// transition settles (the listener below clears it then).
					slotRef.armed = true;
				} else {
					// Outside any Action: React warns and shows the value only
					// briefly. Clear on the next microtask so it renders once and
					// reverts — never left stuck waiting on a transition that won't come.
					queueMicrotask(clear);
				}
				if (!block.disposed) scheduleRender(block);
			},
		};
		s = slotRef;
		ensureHooks(scope).set(slot, slotRef);
		// When the owning transition settles (pending count hits 0), drop the
		// optimistic queue so the next render re-derives from the real state. Gated
		// on `armed` so an unrelated transition settling doesn't wipe a queue this
		// hook populated outside any transition (that path self-clears via microtask).
		const listener = (): void => {
			if (TRANSITION_PENDING_COUNT === 0 && slotRef.armed) clear();
		};
		TRANSITION_LISTENERS.add(listener);
		scope.cleanups.push(() => TRANSITION_LISTENERS.delete(listener));
	}
	s.updateFn = updateFn;
	let optimistic = passthrough;
	for (let i = 0; i < s.queue.length; i++) {
		optimistic = s.updateFn ? s.updateFn(optimistic, s.queue[i]) : (s.queue[i] as unknown as S);
	}
	return [optimistic, s.add];
}

// ---------------------------------------------------------------------------
// useDeferredValue — React 18. Returns the latest value normally; when value
// changes, returns the PREVIOUS value (synchronously) and schedules a
// transition-priority re-render where it'll return the new value. Because
// the re-render runs at transition priority, a suspending consumer (via use())
// keeps the prior DOM mounted instead of flashing a fallback.
// ---------------------------------------------------------------------------

interface DeferredSlot<T> {
	current: T; // committed value (what we return)
	next: T; // latest pending value
	scheduled: boolean;
	block: Block;
	/**
	 * Whether this slot's LAST render ran inside a hidden <Activity>/suspended
	 * subtree. Revealing a hidden tree is a fresh mount for this hook (React:
	 * the prerendered tree has no on-screen "previous" value to defer to), so
	 * the first visible render after hidden re-runs mount semantics.
	 */
	wasHidden: boolean;
}

/**
 * Schedule the deferred current→next swap on a microtask. The re-render runs
 * at transition priority — it can be interrupted by urgent updates and won't
 * tear down the prior DOM if the swapped-in value suspends. DEFERRED_SPAWN
 * tags the pass as a DEFERRED render (Block.pendingDeferred) so a
 * useDeferredValue mounting inside it adopts its final value directly instead
 * of waterfalling its own preview (React: only the first level defers).
 */
function spawnDeferredSwap<T>(s: DeferredSlot<T>): void {
	s.scheduled = true;
	queueMicrotask(() => {
		if (!s.scheduled || s.block.disposed) return;
		s.scheduled = false;
		if (Object.is(s.current, s.next)) return;
		s.current = s.next;
		// Set the flag INSIDE the callback so it wraps only the scheduleRender
		// for the deferred block: startTransition synchronously notifies
		// useTransition listeners (tickTransitionCount) BEFORE running fn, and
		// those listeners scheduleRender their own blocks — which must NOT be
		// tagged as deferred passes.
		startTransition(() => {
			DEFERRED_SPAWN = true;
			try {
				scheduleRender(s.block);
			} finally {
				DEFERRED_SPAWN = false;
			}
		});
	});
}

export function useDeferredValue<T>(value: T, ...rest: any[]): T {
	// React-19 shape: `useDeferredValue(value, initialValue?)`. The compiler
	// appends the hook-slot Symbol as the LAST argument, so we detect the
	// user-vs-compiler args by counting from the end. One trailing Symbol →
	// user passed no initialValue; one trailing Symbol preceded by another
	// arg → user passed initialValue. Same hook-slot semantics either way.
	let slot = rest[rest.length - 1] as symbol | undefined;
	slot = resolveSlot(slot);
	if (typeof slot !== 'symbol') missingSlot('useDeferredValue');
	const initialValue = rest.length >= 2 ? (rest[0] as T) : undefined;
	const hasInitial = rest.length >= 2;
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
			s = { current: initialValue as T, next: value, scheduled: false, block, wasHidden: hidden };
			ensureHooks(scope).set(slot, s);
			if (!Object.is(initialValue as T, value)) spawnDeferredSwap(s);
			return initialValue as T;
		}
		// No initialValue — or mounting INSIDE an already-spawned deferred pass,
		// where the OUTER preview already covered the loading state, so the final
		// value is adopted directly (React's anti-waterfall: only the first
		// useDeferredValue level defers — ReactDeferredValue-test.js:564).
		s = { current: value, next: value, scheduled: false, block, wasHidden: hidden };
		ensureHooks(scope).set(slot, s);
		return value;
	}
	s.next = value;
	const wasHidden = s.wasHidden;
	s.wasHidden = hidden;
	if (Object.is(s.current, value)) return s.current;
	// Hidden-prerender update, or the first render after a hidden→visible
	// reveal: React treats the (re)appearing tree as a fresh mount for this
	// hook — there is no on-screen "previous" value to defer to
	// (ReactDeferredValue-test.js:746/:848/:894). Re-run mount semantics:
	// show the NEW preview and spawn the swap, or adopt the value directly
	// when there is no initialValue (or this is already a deferred pass).
	if (hidden || wasHidden) {
		if (hasInitial && !block.currentRenderDeferred && !Object.is(initialValue as T, value)) {
			s.current = initialValue as T;
			if (!s.scheduled) spawnDeferredSwap(s);
			return initialValue as T;
		}
		s.current = value;
		return value;
	}
	// If the CURRENT render is already at transition priority, don't defer —
	// commit the new value immediately. Matches React's `useDeferredValue does
	// not defer during a transition` semantics — both Original and Deferred
	// values update in the same paint.
	if (block.currentRenderMode === 'transition') {
		s.current = value;
		return value;
	}
	if (!s.scheduled) spawnDeferredSwap(s);
	return s.current;
}

function requestReset(state: TrySlot): void {
	// React parity for catch reset(): don't synchronously re-run the try body.
	// Rewind slot state and schedule the parent — sibling setState calls in
	// the SAME event handler then batch into one commit, so when mountTry
	// re-runs the body it sees fresh closure values (e.g. throwIt=false)
	// instead of immediately re-throwing. Matches TsrxErrorBoundary's
	// `() => this.setState({ error: null })` semantics: clear the error flag,
	// then let the normal commit cycle decide what to render. The currently
	// visible catch block stays mounted for one tick; mountTry's teardown
	// (state.block != null branch) removes it on the next render.
	state.branch = -1;
	state.err = null;
	state.hasResolved = false;
	scheduleRender(state.parentBlock);
}

function switchToCatch(state: TrySlot, err: any): void {
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
	if (oldTry) {
		unmountBlock(oldTry);
		state.tryBlock = null;
	}
	if (state.savedDom) {
		// DOM was detached — discard the saved nodes since the block they
		// belonged to is being torn down (unmountBlock above wouldn't see them
		// because they're detached from the document).
		state.savedDom = null;
	}
	if (state.block && state.block !== oldTry) {
		unmountBlock(state.block);
	}
	state.block = null;
	state.hasResolved = false;
	state.pendingThenable = null;
	if (state.transitionHeld) {
		state.transitionHeld = false;
		tickTransitionCount(-1);
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
		// to unwind — delegate directly.
		const parent = findTryHandler(state.parentBlock);
		if (parent) parent(err);
		else console.error('tryBlock with no catch arm received error:', err);
		return;
	}
	state.branch = 0;
	state.err = err;
	const bStart = document.createComment('catch-b');
	const bEnd = document.createComment('/catch-b');
	state.domParent.insertBefore(bStart, state.end);
	state.domParent.insertBefore(bEnd, state.end);
	const reset = () => requestReset(state);
	const b = createBlock(
		'control-flow',
		state.parentBlock,
		state.domParent,
		bStart,
		bEnd,
		state.catchBody,
		{ err, reset },
		state.env,
	);
	state.block = b;
	try {
		renderBlock(b);
	} catch (e2) {
		// Catch body itself threw — bubble to next enclosing tryBlock.
		if (state.block) {
			unmountBlock(state.block);
			state.block = null;
		}
		const parent = findTryHandler(state.parentBlock);
		if (parent) parent(e2);
		else console.error('catch body threw, no outer tryBlock:', e2);
	}
}

/** Walk Block.parentBlock chain looking for a `$$tryHandler` registration. */
function findTryHandler(block: Block | null): ((err: any) => void) | null {
	let b: Block | null = block;
	while (b) {
		const h = (b as any).$$tryHandler;
		if (h) return h;
		b = b.parentBlock;
	}
	return null;
}

/**
 * Route an error thrown by `renderBlock` during scheduled re-renders.
 * Suspense exceptions go to the nearest tryBlock's `__suspenseHandler`;
 * everything else goes to `$$tryHandler`. Without a handler, we rethrow —
 * which surfaces to the scheduler's caller (matches the prior behavior).
 */
function handleRenderError(block: Block, err: any): void {
	if (isSuspenseException(err)) {
		let b: Block | null = block;
		while (b) {
			const h = (b as any).__suspenseHandler;
			if (h) {
				h(err.thenable, block);
				return;
			}
			b = b.parentBlock;
		}
		throw err;
	}
	const h = findTryHandler(block);
	if (h) h(err);
	else throw err;
}

// ---------------------------------------------------------------------------
// Control flow: branch slots — ifBlock (@if/@else) and switchBlock (@switch)
// ---------------------------------------------------------------------------
//
// Both lower to the SAME one-branch-mounted-at-a-time state machine; only the
// branch RESOLUTION differs (a boolean picking then/else vs `===` over the case
// tests). Each keeps its own slot init (hydration marker adoption differs — see
// the callers), resolves the next branch index + body, and hands the swap /
// re-render to `renderBranchSlot`, the single copy of the machinery.

/**
 * Common slot shape behind IfSlot / SwitchSlot — everything renderBranchSlot
 * touches. See the field docs on IfSlot; the two differ only in `__kind` and
 * in how `branch` is encoded.
 */
interface BranchSlot {
	__kind: 'ifBlockSlot' | 'switchBlockSlot';
	anchor: Node | null;
	start: Comment | null;
	end: Node | null;
	branch: number;
	block: Block | null;
}

/**
 * The shared branch-swap core. When `next` differs from the mounted branch:
 * under a transition, render `body` off-screen and COMMIT it in place (adopting
 * the WIP markers — see below); otherwise tear the old branch down and mount
 * `body` with the dynamic self-marking scheme. When it's the same branch,
 * re-render in place so hook state / event bindings survive. `marker` is the comment
 * label minted for the slot's boundary — `<!--if-->…<!--/if-->` /
 * `<!--switch-->…<!--/switch-->`, following the file-wide open/`/`close
 * convention (try//try, comp//comp, activity//activity, for//for).
 */
function renderBranchSlot(
	parentScope: Scope,
	slotKey: number,
	state: BranchSlot,
	domParent: Node,
	next: number,
	body: ComponentBody | null,
	marker: string,
	// Hoisted-helper env tuple (compiled-output Phase 2): the construct's
	// captured parent locals, refreshed by the compiled call site every parent
	// render. Stamped as `block.extra` on every branch block (and WIP) so
	// renderBlock forwards it as the body's third arg — a branch re-rendering
	// on its OWN reads the block's stored tuple (last parent render's values,
	// the same staleness a per-render closure had).
	env?: any[],
): void {
	const parentBlock = parentScope.block;
	if (next !== state.branch) {
		// Off-screen swap (React WIP model): on a TRANSITION swap to a new branch that may
		// suspend, render it off-screen FIRST without tearing down the old branch. If it
		// suspends, dispose + route to the enclosing tryBlock so its transition hold keeps
		// the old branch on screen and resumes — the resume re-renders the try body, which
		// re-drives this swap. On completion we COMMIT the WIP (no double render): the off-
		// screen block owns a `<!--wip-->`/`<!--/wip-->` pair which we adopt as the slot's
		// durable markers (renamed in place — descendant slots may anchor on `wip.end`, so
		// it must survive) and mark exclusiveMarkers=true so the NEXT swap's marker path
		// finds them still attached after its own unmountBlock. Urgent + hydration, and a
		// swap TO an empty branch (body === null), keep the legacy in-place path below.
		if (
			state.block !== null &&
			body !== null &&
			!hydrating &&
			parentBlock.currentRenderMode === 'transition'
		) {
			// Commit path requires the marker regime (state.end !== null): renderOffscreen
			// inserts the wip pair AFTER its reference node, which matches "right after the
			// old end marker" — but in the anchor regime the legacy path mounts BEFORE the
			// anchor, so committing there would land the branch on the wrong side of the
			// anchor's trailing static siblings. Anchor-regime swaps keep the legacy
			// in-place path below.
			if (state.end !== null) {
				const r = renderOffscreen(
					parentBlock,
					domParent,
					state.end,
					body,
					undefined,
					'control-flow',
					env,
				);
				if (r.suspended || r.error) {
					disposeWip(r.wip);
					if (r.error) throw r.error;
					throw new SuspenseException(r.suspended);
				}
				r.wip.start.data = marker;
				r.wip.end.data = '/' + marker;
				// Tear down the old branch. A borrowed-marker branch (exclusiveMarkers=true)
				// keeps oldStart/oldEnd; a self-marked branch removes its element. The wip
				// pair was inserted after `probeAfter` (state.end/anchor) and stays put.
				const oldStart = state.start;
				const oldEnd = state.end;
				unmountBlock(state.block);
				// Orphaned old slot markers (borrowed regime) — nothing references them once
				// the old block is dead; remove so only the adopted wip pair bounds the slot.
				if (oldStart !== null) {
					oldStart.remove();
					(oldEnd as ChildNode | null)?.remove();
				}
				state.start = r.wip.start;
				state.end = r.wip.end;
				state.block = r.wip.block;
				state.branch = next;
				// Adopted pair is now the slot's durable boundary (see NEXT-swap note above).
				r.wip.block.exclusiveMarkers = true;
				spliceWipCapture(r.wip);
				return;
			}
		}
		// Position for the new branch: just after the current branch's trailing node,
		// or the slot anchor on first mount. Captured BEFORE teardown (a self-marked
		// branch's trailing node is removed by it).
		const after: Node | null = state.end !== null ? state.end.nextSibling : state.anchor;
		const firstMount = state.branch === -1;
		if (state.block) {
			unmountBlock(state.block);
			state.block = null;
		}
		state.branch = next;
		if (state.start !== null) {
			// MARKER path — hydration-adopted, or already markered (multi-node / post-
			// swap). The branch borrows the slot's start/end (exclusiveMarkers teardown
			// keeps the markers); hydration adopts the inner range byte-for-byte.
			if (body) {
				let bStart: Node;
				let bEnd: Node;
				let borrowed = false;
				if (hydrating && isBlockOpen(state.start.nextSibling)) {
					bStart = state.start.nextSibling as Comment;
					bEnd = matchingClose(bStart);
					hydrateNode = bStart.nextSibling;
				} else {
					bStart = state.start;
					bEnd = state.end as Node;
					borrowed = true;
					// Hydrating with no inner branch markers = the SERVER rendered this branch
					// EMPTY (the client now renders content, or vice-versa). Park the cursor on
					// the slot's first node (the close marker when empty) so the branch body's
					// clone() sees "nothing here" and client-builds, instead of reading a stale
					// cursor.
					if (hydrating) hydrateNode = state.start.nextSibling;
				}
				const b = createBlock(
					'control-flow',
					parentBlock,
					domParent,
					bStart,
					bEnd,
					body,
					undefined,
					env,
				);
				if (borrowed) b.exclusiveMarkers = true;
				state.block = b;
				renderBlock(b);
			} else if (hydrating && state.start.nextSibling !== state.end) {
				// EMPTY client branch, but the server rendered content in this slot (e.g. an
				// `@else` with content on the server, empty `@if` on the client). Discard the
				// stale server range so the empty branch leaves a clean range + siblings stay
				// aligned (structural mismatch).
				const mmLoc = siteLoc(parentScope, slotKey);
				if (mmLoc)
					warnHydrationStructuralMismatch(
						mmLoc,
						'an empty branch',
						describeHydrationNode(state.start.nextSibling),
					);
				removeRange(state.start.nextSibling, state.end);
			}
		} else if (firstMount && body) {
			// First client mount — pick the boundary by what the branch renders.
			const before = after ? after.previousSibling : domParent.lastChild;
			const b = createBlock(
				'control-flow',
				parentBlock,
				domParent,
				null,
				after,
				body,
				undefined,
				env,
			);
			state.block = b;
			renderBlock(b);
			const first = before ? before.nextSibling : domParent.firstChild;
			const last = after ? after.previousSibling : domParent.lastChild;
			if (last !== null && first === last && (first as Node).nodeType === 1) {
				// Single element — self-mark (no markers). Teardown is one removeChild,
				// and the slot now LOOKS single-element to an enclosing @if, so the
				// optimization cascades up the tree.
				b.startMarker = first;
				b.endMarker = first;
				state.end = first;
			} else {
				// Multi-node (or rendered nothing) — mint markers around the content.
				const s = document.createComment(marker);
				const e = document.createComment('/' + marker);
				domParent.insertBefore(s, first ?? after);
				domParent.insertBefore(e, after);
				b.startMarker = s;
				b.endMarker = e;
				b.exclusiveMarkers = true;
				state.start = s;
				state.end = e;
			}
		} else {
			// Swap away from a self-marked branch, or an empty branch: mint stable
			// markers at the position so the slot has a boundary from here on.
			const s = document.createComment(marker);
			const e = document.createComment('/' + marker);
			domParent.insertBefore(s, after);
			domParent.insertBefore(e, after);
			state.start = s;
			state.end = e;
			if (body) {
				const b = createBlock('control-flow', parentBlock, domParent, s, e, body, undefined, env);
				b.exclusiveMarkers = true;
				state.block = b;
				renderBlock(b);
			}
		}
	} else if (state.block) {
		// Same branch — re-render in place with this render's env snapshot.
		state.block.body = body!;
		state.block.extra = env;
		renderBlock(state.block);
	}
}

interface IfSlot extends BranchSlot {
	__kind: 'ifBlockSlot';
	/** Insertion point for the FIRST branch (compiler position / null = append). */
	anchor: Node | null;
	/**
	 * Non-null once the slot uses comment markers: adopted server markers
	 * (hydration), or client markers minted for a multi-node / empty branch (or
	 * after a swap). Null while self-marking a single-element branch — then the
	 * element IS the boundary (block.startMarker === endMarker === it).
	 */
	start: Comment | null;
	/** Trailing node of the current branch: the self-marking element, the end
	 *  marker, or an empty placeholder — the position reference for the next swap. */
	end: Node | null;
	/** Current branch: 1 = then, 0 = else, -1 = uninitialized. */
	branch: number;
	block: Block | null;
}

export function ifBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	cond: boolean,
	thenBody: ComponentBody | null,
	elseBody: ComponentBody | null,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
): void {
	let state = parentScope.slots[slotKey] as IfSlot | undefined;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Node | null = null;
		// Hydration: adopt the server's `<!--[-->…<!--]-->` slot range (client mounts
		// defer marker creation entirely). `resolveHydrationOpen` also covers the
		// SOLE-hole case — a @if that is the only thing an enclosing arm/component
		// renders (e.g. `@try { @if (…) {…} }`, the router Match shape) — where the
		// anchor is the arm's END marker and the cursor is parked on the @if's open.
		const open = resolveHydrationOpen(anchor ?? null, domParent);
		if (open !== null) {
			start = open;
			end = matchingClose(open);
		}
		state = { __kind: 'ifBlockSlot', anchor: anchor ?? null, start, end, branch: -1, block: null };
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	const next: 0 | 1 = cond ? 1 : 0;
	renderBranchSlot(
		parentScope,
		slotKey,
		state,
		domParent,
		next,
		next ? thenBody : elseBody,
		'if',
		env,
	);
}

// ---------------------------------------------------------------------------
// Control flow: activityBlock — React 19 <Activity mode="hidden"|"visible">
//
// Unlike ifBlock (which unmounts on branch change), an Activity keeps ONE
// long-lived child Block across the whole hidden/visible lifecycle. Hidden:
// children stay mounted (state + DOM preserved) but visually hidden via
// display:none and their effects are torn down (cleanups run); the subtree is
// marked `inactive` so re-renders while hidden update the DOM but skip effects.
// Visible: display restored and a re-render re-fires the effects. State is
// preserved because the block is never disposed while toggling.
// ---------------------------------------------------------------------------

interface ActivitySlot {
	__kind: 'activityBlockSlot';
	block: Block | null;
	hidden: boolean;
	/** Direct child elements we hid → their prior inline `display`, for restore. */
	savedDisplay: Map<HTMLElement, string>;
	/**
	 * Direct child TEXT nodes we hid → their prior `data`, for restore. Text nodes
	 * have no box and can't take `display:none`, so a bare-text Activity child
	 * (`<Activity mode="hidden">{'…'}</Activity>`) is hidden by blanking its data.
	 */
	savedText: Map<Text, string>;
}

/**
 * Hide every direct child between the block's markers (idempotent). Elements get
 * `display:none`; bare text nodes can't be styled, so their `data` is blanked
 * (original saved for restore). Re-runs after each hidden re-render, so newly
 * created children — and dynamic text re-populated by setText — get re-hidden.
 */
function hideActivityRange(state: ActivitySlot): void {
	const b = state.block;
	if (!b) return;
	let node: ChildNode | null = (b.startMarker as Comment).nextSibling;
	while (node && node !== b.endMarker) {
		if (node.nodeType === 1) {
			const el = node as HTMLElement;
			if (!state.savedDisplay.has(el)) state.savedDisplay.set(el, el.style.display);
			el.style.display = 'none';
		} else if (node.nodeType === 3) {
			const t = node as Text;
			if (!state.savedText.has(t)) state.savedText.set(t, t.nodeValue ?? '');
			if (t.nodeValue !== '') t.nodeValue = '';
		}
		node = node.nextSibling;
	}
}

/** Restore the inline `display` / text content we saved on hide. */
function showActivityRange(state: ActivitySlot): void {
	for (const [el, display] of state.savedDisplay) el.style.display = display;
	state.savedDisplay.clear();
	for (const [t, data] of state.savedText) t.nodeValue = data;
	state.savedText.clear();
}

export function activityBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	mode: 'visible' | 'hidden' | string,
	body: ComponentBody,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
): void {
	const parentBlock = parentScope.block;
	const wantHidden = mode === 'hidden';
	let state = parentScope.slots[slotKey] as ActivitySlot | undefined;

	if (state === undefined) {
		const bStart = document.createComment('activity');
		const bEnd = document.createComment('/activity');
		domParent.insertBefore(bStart, anchor ?? null);
		domParent.insertBefore(bEnd, anchor ?? null);
		const b = createBlock(
			'control-flow',
			parentBlock,
			domParent,
			bStart,
			bEnd,
			body,
			undefined,
			env,
		);
		state = {
			__kind: 'activityBlockSlot',
			block: b,
			hidden: false,
			savedDisplay: new Map(),
			savedText: new Map(),
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
		if (wantHidden) {
			// Mount while hidden: render children (creates state + DOM) but no
			// effects — mark inactive BEFORE the render so enqueueEffect skips them.
			b.inactive = true;
			renderBlock(b);
			hideActivityRange(state);
			state.hidden = true;
		} else {
			renderBlock(b);
		}
		return;
	}

	const b = state.block!;
	b.body = body;
	b.extra = env;

	if (wantHidden) {
		if (!state.hidden) {
			// visible → hidden: prerender latest content with effects suppressed,
			// tear down the previously-mounted effects (cleanups BEFORE hiding the
			// DOM, matching React), then hide.
			b.inactive = true;
			renderBlock(b);
			deactivateScope(b);
			hideActivityRange(state);
			state.hidden = true;
		} else {
			// hidden → hidden: prerender (no effects), then hide any new children.
			renderBlock(b);
			hideActivityRange(state);
		}
	} else {
		if (state.hidden) {
			// hidden → visible: restore DOM, clear inactive, re-render to re-fire
			// effects (deactivateScope cleared their deps so they re-enqueue).
			showActivityRange(state);
			b.inactive = false;
			state.hidden = false;
			renderBlock(b);
		} else {
			// visible → visible: ordinary re-render in place.
			renderBlock(b);
		}
	}
}

/**
 * Enumerate the LIVE child scopes reachable from `scope` — component children plus
 * every control-flow slot's mounted block(s) — without disposing anything. This is
 * the single home of the control-flow slot taxonomy for non-destructive subtree
 * walks (a new slot kind only needs to be added here): `forBlockSlot` contributes
 * each keyed item block plus the optional `@empty` block; every other slot kind
 * contributes its generic `.block`; a `trySlotSlot` additionally contributes the
 * hidden-but-alive `tryBlock` when the boundary is showing @pending/@catch (the
 * content subtree is soft-detached, not disposed, so it must still be visited).
 * Shared by detachSubtreeRefs and deactivateScope, which recurse via `visit`.
 */
function forEachSubtreeChild(scope: Scope, visit: (child: Scope) => void): void {
	const children = scope.children;
	for (let i = 0, n = children.length; i < n; i++) visit(children[i].scope);
	const slots = scope._slots;
	if (slots !== null) {
		for (let i = 0, n = slots.length; i < n; i++) {
			const val = slots[i];
			if (val.__kind === 'forBlockSlot') {
				for (let b: Block | null = val.head; b !== null; b = b.nextSibling) visit(b);
				if (val.emptyBlock) visit(val.emptyBlock);
			} else if (val.block) {
				visit(val.block);
				if (val.__kind === 'trySlotSlot' && val.tryBlock && val.tryBlock !== val.block) {
					visit(val.tryBlock);
				}
			}
		}
	}
}

// Detach every host ref in a subtree (object refs → null, callback refs called with
// null), collecting {ref, el} for later re-attach. Used ONLY by the suspense-hide path
// (NOT by <Activity>, which intentionally keeps refs) so React's "refs cycle null→node
// across a suspend, like layout effects" contract holds even though octane preserves the
// DOM node. Compiled bodies with ref-carrying bindings stamp a REF MANIFEST on their
// scope (`scope.refFields` — see the Scope interface): flat [kind, field, elField]
// triads naming the binding-bag fields directly, so discovery is an indexed walk over
// slots[0] (no key scan, and the fields take normal 1-char names). De-opt host slots
// store `state.ref` + the node. We recurse through children + control-flow slots via
// forEachSubtreeChild (the same walk deactivateScope uses).
function detachSubtreeRefs(scope: Scope, out: { ref: any; el: any }[]): void {
	// A block managing a de-opt host subtree (deoptItemBody / pure-host items):
	// every node the de-opt reconciler built carries its descriptor (DEOPT_DESC),
	// whose props may hold a ref — walk the DOM subtree for them.
	const deoptRoot = (scope as any).deoptNode as Node | null | undefined;
	if (deoptRoot != null) detachDeoptTreeRefs(deoptRoot, out);
	const rm = scope.refFields;
	if (rm !== null) {
		const bag = scope.slots[0];
		if (bag != null) {
			for (let j = 0, n = rm.length; j < n; j += 3) {
				const kind = rm[j];
				if (kind === 'r') {
					// Element ref binding: field holds the ref, partner holds the element.
					const ref = bag[rm[j + 1]];
					if (ref == null) continue;
					const el = bag[rm[j + 2]];
					out.push({ ref, el });
					attachRef(ref, null, el);
				} else if (kind === 's') {
					// Spread binding: the committed spread object may carry a ref.
					const ref = bag[rm[j + 1]]?.ref;
					if (ref == null) continue;
					const el = bag[rm[j + 2]];
					if (el == null) continue;
					out.push({ ref, el });
					attachRef(ref, null, el);
				} else {
					// 'f' — <Fragment ref>: detach the FragmentInstance's current ref;
					// reveal re-attaches the same instance.
					const fi = bag[rm[j + 1]];
					if (fi == null || fi._currentRef == null) continue;
					out.push({ ref: fi._currentRef, el: fi });
					attachRef(fi._currentRef, null, fi);
				}
			}
		}
	}
	const slots = scope.slots;
	for (let i = 0, n = slots.length; i < n; i++) {
		const s = slots[i];
		if (s === null || typeof s !== 'object') continue;
		// De-opt host element slot (value-position `<tag>` / motion-style): { el, anchor, ref }.
		if (s.ref != null && s.anchor !== undefined && s.el instanceof Element) {
			out.push({ ref: s.ref, el: s.el });
			attachRef(s.ref, null, s.el);
		}
		// childSlot managing a pure-host de-opt node — same DEOPT_DESC walk.
		if (s.__kind === 'childSlot' && s.hostNode != null) {
			detachDeoptTreeRefs(s.hostNode, out);
		}
	}
	forEachSubtreeChild(scope, (child) => detachSubtreeRefs(child, out));
}

// Walk a de-opt-built DOM subtree detaching every stamped descriptor ref
// (object refs → null, callback refs' cleanup). `out` collects {ref, el} pairs for
// the suspense-hide reveal re-attach; teardown callers pass null (permanent detach,
// nothing to re-attach). Nested de-opt elements are stamped too (every element
// reconcileDeoptNode builds gets setDeoptDesc), so recurse through children —
// EXCEPT foreign `<!--portal-->…<!--/portal-->` ranges: a portal targeting one of
// these elements owns its content's refs (its slot detaches them on ITS teardown).
function detachDeoptTreeRefs(node: Node, out: { ref: any; el: any }[] | null): void {
	const ref = getDeoptDesc(node)?.props?.ref;
	if (ref != null) {
		if (out !== null) {
			// Suspense-hide: detach NOW (the caller re-attaches on reveal).
			out.push({ ref, el: node });
			attachRef(ref, null, node as Element);
		} else {
			// Teardown: DEFER the detach to commit (drainRefDetaches), before the
			// mount attaches. Teardown runs mid-render (reconcile/unmount), and a
			// ref can be a setState function whose value feeds back into what the
			// owner renders (Radix Toast: `ref={setTarget}` gates a portal). Firing
			// `ref(null)` synchronously lets that null-update RENDER before the
			// rebuilt element's deferred attach fires — flipping the owner back,
			// rebuilding again, forever. Deferring puts null + new-element in the
			// SAME commit (React's mutation→layout phasing), so state settles on
			// the new element before the next render pass. Route through
			// queueRefDetach so the entry stride (ref, el, teardown-handler) stays
			// uniform with the compiled-binding path.
			queueRefDetach(ref, node as Element);
		}
	}
	let c: Node | null = node.firstChild;
	while (c !== null) {
		const rangeEnd = (c as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			c = nodeAfterPortalRange(c, rangeEnd);
			continue;
		}
		detachDeoptTreeRefs(c, out);
		c = c.nextSibling;
	}
}

/**
 * Run a subtree's effect CLEANUPS without disposing it, and reset its effect
 * slots so the setups re-fire on reactivation. Used by activityBlock on hide
 * AND by the tryBlock suspense-hide path (hideTryContentAndMountPending):
 * effects are torn down (cleanups run, parent-before-child) while state, DOM and
 * the blocks all stay alive. Refs are intentionally LEFT attached to the
 * preserved (hidden) DOM when hiding an <Activity> — they point at valid,
 * still-present nodes; the suspense path detaches them separately
 * (detachSubtreeRefs) to match React's ref-cycling contract.
 */
function deactivateScope(scope: Scope): void {
	const hooks = scope.hooks;
	if (hooks) {
		for (const slot of hooks.values()) {
			if (slot && (slot as EffectSlot).effect === true) {
				const e = slot as EffectSlot;
				// INSERTION effects stay CONNECTED while hidden (React parity,
				// Activity-test.js:1428): no cleanup on hide, deps kept so the
				// reveal re-render doesn't re-fire them. They own injected styles
				// that must persist while a tree is merely hidden; only a real
				// unmount (the scope.cleanups finalizer) tears them down.
				if (e.phase === INSERTION) continue;
				if (typeof e.cleanup === 'function') {
					const cleanup = e.cleanup;
					// Clear it BEFORE firing so the per-slot unmount finalizer (still
					// registered in scope.cleanups) sees no cleanup and won't re-run it.
					e.cleanup = undefined;
					try {
						cleanup();
					} catch (err) {
						console.error(err);
					}
				}
				// Force the setup to re-enqueue + re-fire when the subtree reactivates.
				e.deps = undefined;
			}
		}
	}
	forEachSubtreeChild(scope, deactivateScope);
}

// ---------------------------------------------------------------------------
// Control flow: switchBlock — analogous to ifBlock but n-way
// ---------------------------------------------------------------------------
//
// The compiler lowers `@switch (d) { @case 1: { … } @default: { … } }` to a
// `switchBlock(scope, slotKey, host, discriminant, [[test0, body0], …],
// defaultBody)` call. Selection uses `===` against each case test in source
// order; the first hit wins, falling back to `defaultBody` when none match
// (`defaultBody` is `null` when the user wrote no `@default`).
//
// State machine mirrors `ifBlock` — both delegate to `renderBranchSlot` (see
// the branch-slots section above ifBlock): when the selected case index
// changes we tear down the previous branch Block and mount a fresh one; when
// the selected index is unchanged we re-render in place so hook state / event
// bindings survive. Index `-2` is reserved for the default branch, `-1` for
// uninitialized.
interface SwitchSlot extends BranchSlot {
	__kind: 'switchBlockSlot';
	/** Currently-mounted case index, or -1 if uninitialized / -2 for default.
	 *  All other fields as documented on IfSlot. */
	branch: number;
}

export function switchBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	discriminant: any,
	cases: ReadonlyArray<readonly [test: any, body: ComponentBody]>,
	defaultBody: ComponentBody | null,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
): void {
	let state = parentScope.slots[slotKey] as SwitchSlot | undefined;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Node | null = null;
		if (hydrating && isBlockOpen(anchor ?? null)) {
			// Hydration: adopt the server's `<!--[-->…<!--]-->` range (the matched
			// case's content) as the slot markers. Client mounts defer marker creation
			// (self-mark or mint on demand — see ifBlock).
			start = anchor as Comment;
			end = matchingClose(anchor as Node);
		}
		state = {
			__kind: 'switchBlockSlot',
			anchor: anchor ?? null,
			start,
			end,
			branch: -1,
			block: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	// Pick the first matching case, or fall back to default.
	let nextIdx = -2;
	let body: ComponentBody | null = defaultBody;
	for (let i = 0; i < cases.length; i++) {
		if (cases[i][0] === discriminant) {
			nextIdx = i;
			body = cases[i][1];
			break;
		}
	}
	renderBranchSlot(parentScope, slotKey, state, domParent, nextIdx, body, 'switch', env);
}

// ---------------------------------------------------------------------------
// Control flow: forBlock with LIS-based keyed reconciliation
// ---------------------------------------------------------------------------

interface ForSlot {
	__kind: 'forBlockSlot';
	start: Comment;
	end: Comment;
	items: Map<any, Block>; // key → item Block (O(1) survivor lookup)
	head: Block | null; // first item Block in DOM order
	tail: Block | null; // last item Block in DOM order
	size: number; // count of item Blocks
	// Last-render snapshot of the body's closed-over parent locals. The compiler
	// emits a fresh `deps` array on every parent render for DEP-PURE for-of
	// calls (impure body, no hooks/comps/control-flow). When this render's deps
	// match last render's element-by-element, the runtime treats the body as
	// PURE for the survivor short-circuit — saving the entire body call for
	// every item whose ref + position are unchanged.
	cachedDeps: any[] | null;
	// `@for (...) { ... } @empty { ... }` support: mounted-empty-branch Block,
	// or null when there are items (or no `@empty` branch was compiled). The
	// empty body is hoisted by the compiler as its own helper and passed to
	// forBlock as the trailing `emptyBody` arg; we mount it on the transition
	// `items.length > 0 → 0` and unmount on `0 → >0`.
	emptyBlock: Block | null;
	// Hoisted-helper env tuple (compiled-output Phase 2): the `deps` array
	// doubles as the item/empty helpers' captured-locals tuple — refreshed by
	// forBlock every parent render and stamped as `block.extra` on every item
	// block (mount + survivor re-render) and on the @empty block.
	env: any[] | undefined;
	// One-shot adoption queue for the pure-host → blocks upgrade (see childSlot's
	// upgrade branch): the adopted element's existing raw child nodes in DOM
	// order, each pre-keyed like the incoming items, so reconcileKeyed's
	// empty→fill mount wraps them in item ranges IN PLACE (node identity,
	// focus, input state survive — React parity) instead of rebuilding.
	// Consumed and nulled within the same render.
	adopt: Array<{ key: any; node: Node }> | null;
}

export function forBlock<T>(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags?: number,
	deps?: any[],
	emptyBody?: ComponentBody | null,
	anchor?: Node | null,
): void {
	// flags bitfield: bit 0 = pure (auto-memo), bit 1 = singleRoot (skip per-item
	// Comment markers), bit 2 = depEligible (compare `deps` to cachedDeps and
	// promote body to PURE when unchanged), bit 3 = indexIndependent (the body
	// binds no `index` name → a pure reorder that only moves a survivor's
	// position need not re-render it). Packed into one numeric literal.
	const parentBlock = parentScope.block;
	let state = parentScope.slots[slotKey] as ForSlot | undefined;
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		if (hydrating && isBlockOpen(anchor ?? null)) {
			// Hydration: the server wrapped the whole @for in a `<!--[-->…<!--]-->`
			// range (anchor resolved to the outer `<!--[-->`). Adopt it as the slot
			// markers and point the cursor at the first item's `<!--[-->` so the
			// empty→fill mount below adopts each item via mountItem.
			start = anchor as Comment;
			end = matchingClose(anchor as Node);
			hydrateNode = start.nextSibling;
		} else if (hydrating && isBlockOpen(hydrateNode)) {
			// Hydration (sole hole, no `<!>` anchor): the @for is the only root of its
			// owning body (e.g. a `@try { @for }` arm or a component whose body is a
			// bare @for), so the compiler emitted no anchor — but mountTry/renderBlock
			// parked the CURSOR on the server's `<!--[-->`. Adopt from the cursor, the
			// same way childSlot does for a sole renderable hole.
			start = hydrateNode as Comment;
			end = matchingClose(hydrateNode as Node);
			hydrateNode = start.nextSibling;
		} else {
			start = document.createComment('for');
			end = document.createComment('/for');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (when a static sibling follows this @for in mixed
			// children, the compiler emits a `<!>` anchor at the @for's source-order
			// index and threads it here so the markers land BEFORE the sibling).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		state = {
			__kind: 'forBlockSlot',
			start,
			end,
			items: new Map(),
			head: null,
			tail: null,
			size: 0,
			cachedDeps: null,
			emptyBlock: null,
			env: undefined,
			adopt: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	// The env tuple refreshes every parent render (the compiled call site
	// re-evaluates the captured values); item/empty blocks pick it up at
	// mount and at every survivor re-render below.
	state.env = deps;
	// `@empty` arm: when `items.length === 0` and the compiler emitted an
	// empty-body helper, mount that body in place of the (empty) item list. We
	// also tear down any previously-mounted items so transitioning items → 0 →
	// items behaves identically to a regular un-mount/re-mount cycle.
	const isEmpty = items.length === 0;
	if (isEmpty && emptyBody) {
		if (state.size > 0) {
			// had items last render, now we're empty — tear down the chain.
			reconcileKeyed(parentBlock, state, items, getKey, itemBody as any, false, false);
		}
		if (state.emptyBlock) {
			// keep the existing empty branch mounted, but re-render in case the
			// body closes over parent state that changed this render.
			state.emptyBlock.body = emptyBody;
			state.emptyBlock.extra = state.env;
			renderBlock(state.emptyBlock);
		} else {
			const bStart = document.createComment('empty');
			const bEnd = document.createComment('/empty');
			// When the SERVER rendered a populated list but the client is empty now, the
			// content inside the @for range is item blocks (`<!--[-->`), not the @empty body
			// — a STRUCTURAL mismatch. Discard the server items and build @empty fresh with
			// hydration suspended (so it client-mounts instead of mis-adopting an item).
			let suspendForEmpty = false;
			if (hydrating && isBlockOpen(state.start.nextSibling)) {
				// Prefer the @for's own compiled source loc (siteLoc; for-constructs carry
				// `loc` in `__s.locs`) — the parent element's `__oct_loc` stamp exists only
				// when the parent carries dynamic bindings.
				const mmLoc = siteLoc(parentScope, slotKey) || (domParent as any).__oct_loc;
				if (mmLoc)
					warnHydrationStructuralMismatch(mmLoc, 'an empty list (@empty)', 'a populated list');
				removeRange(state.start.nextSibling, state.end);
				domParent.insertBefore(bStart, state.end);
				domParent.insertBefore(bEnd, state.end);
				suspendForEmpty = true;
			} else if (hydrating) {
				// The server rendered the @empty content directly inside the adopted
				// `<!--[-->…<!--]-->` range — bracket it (don't insert at the end +
				// re-mount, which would move the adopted content) and point the cursor
				// at it so the empty body's clone() adopts the server DOM.
				domParent.insertBefore(bStart, state.start.nextSibling);
				domParent.insertBefore(bEnd, state.end);
				hydrateNode = bStart.nextSibling;
			} else {
				domParent.insertBefore(bStart, state.end);
				domParent.insertBefore(bEnd, state.end);
			}
			const b = createBlock(
				'control-flow',
				parentBlock,
				domParent,
				bStart,
				bEnd,
				emptyBody,
				undefined,
				state.env,
			);
			state.emptyBlock = b;
			const savedHydrating = hydrating;
			if (suspendForEmpty) hydrating = false;
			renderBlock(b);
			hydrating = savedHydrating;
		}
		// Advance the cursor past the whole @for so the next sibling's clone()
		// doesn't read a position left inside this consumed range.
		if (hydrating) hydrateNode = state.end.nextSibling;
		return;
	}
	// We have items (or no empty body). If an empty branch was previously
	// mounted, tear it down before reconciling so its DOM doesn't sit alongside
	// the freshly-mounted items.
	if (state.emptyBlock) {
		unmountBlock(state.emptyBlock);
		state.emptyBlock = null;
	}
	// Hydrating + the SERVER rendered the @empty body (the node right after `start` is NOT an
	// item's `<!--[-->`) but the client now has items — a STRUCTURAL mismatch. Discard the
	// stale @empty DOM and point the cursor at `end` so the reconcile client-mounts the items
	// into a clean range (mountItem's no-marker guard handles the build).
	if (
		hydrating &&
		state.start.nextSibling !== null &&
		state.start.nextSibling !== state.end &&
		!isBlockOpen(state.start.nextSibling)
	) {
		const mmLoc = siteLoc(parentScope, slotKey) || (domParent as any).__oct_loc;
		if (mmLoc) warnHydrationStructuralMismatch(mmLoc, 'a populated list', 'an empty list (@empty)');
		removeRange(state.start.nextSibling, state.end);
		hydrateNode = state.end;
	}
	const f = flags || 0;
	let pure = (f & 1) !== 0;
	// DEP-PURE upgrade: when the compiler marked this for-block as deps-eligible
	// and last render's snapshot matches this render's, we can treat the body
	// as PURE for the survivor short-circuit. The body still runs for moved/
	// mounted/removed items — only stable survivors get skipped.
	// `lite` = body is depEligible but did NOT promote to pure this render.
	// depEligible (see makeForCall's body analysis in compile.js, packed into
	// the forBlock `flags` bits) means no hooks, no nested comps, no
	// control flow → the body can't observe CURRENT_SCOPE / CURRENT_BLOCK and
	// never throws Suspense. We skip renderBlock's activeBlock plumbing and
	// call itemBody directly. Saves ~10 ops/survivor — meaningful on the
	// select-row tick where `selected` changes and 1000 survivors all
	// re-evaluate but only 2 actually flip their class.
	let lite = false;
	if ((f & 4) !== 0 && deps !== undefined) {
		if (state.cachedDeps !== null && depsEqual(state.cachedDeps, deps)) {
			pure = true;
		} else {
			lite = true;
		}
		state.cachedDeps = deps;
	}
	reconcileKeyed(
		parentBlock,
		state,
		items,
		getKey,
		itemBody as any,
		pure,
		(f & 2) !== 0,
		lite,
		(f & 8) !== 0,
	);
	// Advance the hydration cursor past the @for's `<!--]-->` so a later sibling's
	// clone() starts after this block — covers the zero-item, no-@empty case where
	// reconcileKeyed mounts nothing and the cursor would otherwise stay on the
	// inner close marker.
	if (hydrating) {
		discardLeftoverHydrationItems(state.end);
		hydrateNode = state.end.nextSibling;
	}
}

/**
 * STRUCTURAL recovery for an @for where the SERVER rendered MORE items than the client now
 * renders: after reconcile adopts the client's items, the cursor sits on the first unconsumed
 * server item's marker (or at `end`). Discard everything between the cursor and `end` so the
 * extra server rows don't linger. Same-parent guarded; stops AT `end` (never past it).
 */
function discardLeftoverHydrationItems(end: Node): void {
	const n = hydrateNode;
	if (n === null || n === end || n.parentNode !== end.parentNode) return;
	removeRange(n, end);
}

/**
 * Remove every sibling from `from` (inclusive) up to but NOT including `end`.
 * The shared hydration "discard the stale server range" sweep: used when the
 * server-rendered content inside an adopted `<!--[-->…<!--]-->` range doesn't
 * match what the client renders (content vs empty branch in @if/@switch, items
 * vs @empty in @for, leftover server items past the client's last item).
 * `end` may be null (an @if slot whose end marker isn't minted yet) — then the
 * sweep runs to the last sibling, exactly as the open-coded loops did.
 */
function removeRange(from: Node | null, end: Node | null): void {
	let n: Node | null = from;
	while (n !== null && n !== end) {
		const next: Node | null = n.nextSibling;
		(n as ChildNode).remove();
		n = next;
	}
}

// Deps-snapshot compare for the @for DEP-PURE promotion. Object.is per element — the
// same equality the hook-side `depsChanged` uses — so a NaN dep doesn't permanently
// defeat the pure promotion (`NaN !== NaN` would fail every render) and ±0 behave
// identically on both paths.
function depsEqual(a: any[], b: any[]): boolean {
	const n = a.length;
	if (n !== b.length) return false;
	for (let i = 0; i < n; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}

// Cutoff for the small-displacement shortcut in reconcileKeyed. When fewer
// than this many positions change between renders (and every item survives),
// we compute the move set directly in O(K_DISP) instead of paying the LIS
// path's O(N) alloc + back-walk. Covers single drag-and-drop, undo/redo of a
// recent edit, animated swap transitions, A/B variant toggles, etc. Above
// this threshold the LIS path wins. The module-level buffer is safely reused
// across calls: reconcileKeyed CAN re-enter (a nested @for inside an item body
// re-enters via renderBlock), but never between _disp's fill and consume — no
// user code runs in that window — so the buffer is never clobbered while live.
const K_DISP = 4;
const _disp = new Int32Array(K_DISP);

/**
 * Keyed reconciliation over a doubly-linked list of item Blocks.
 *
 * Item Blocks form a sibling chain via `prevSibling` / `nextSibling`; the
 * ForSlot tracks `head` / `tail` / `size`. Removing or inserting an item is
 * O(1) pointer updates — no array splice, no `order` array to rebuild. The
 * Map (`state.items`) is kept only for O(1) survivor lookup by key during the
 * middle-section diff.
 *
 * Algorithm shape matches Ripple/Solid/Vue: prefix walk, suffix walk, then
 * a middle section that either is pure-insert / pure-remove, or runs the
 * full survivor-partition + LIS-based move pass. The linked list shows up in
 * the prefix/suffix walks (cursor advance via .nextSibling / .prevSibling)
 * and in the splice step that reattaches the new middle to the surrounding
 * chain.
 */
// Update ONE surviving keyed block for the new render pass — shared by all three
// survivor walks in reconcileKeyed (prefix, suffix, middle). Top-level (not a
// closure) so reconcileKeyed's hot path allocates nothing for it.
//   - Pure-body memo: when the compiler statically proved the for-of body closes
//     over nothing from parent scope, body output is a pure function of
//     (item, itemIndex). Identical refs → skip renderBlock entirely (only
//     the body ref is refreshed).
//   - `lite` = depEligible body (no hooks, no comps, no control flow): skip
//     renderBlock's activeBlock plumbing and call the body directly.
function updateSurvivor<T>(
	block: Block,
	newItem: T,
	newIdx: number,
	itemBody: (item: T, scope: Scope) => void,
	pure: boolean,
	lite: boolean,
	indexIndependent: boolean,
	// Hoisted-helper env tuple (compiled-output Phase 2) — this render's
	// captured values; stamped/passed so the body's `__extra` destructure
	// reads current values (a per-render closure saw the same).
	env: any[] | undefined,
): void {
	// Pure short-circuit: skip the body when the item ref is unchanged AND either
	// the body can't observe position (indexIndependent — the common index-less
	// `@for`) or the position is also unchanged. This is what makes a pure reorder
	// (shuffle / reverse / rotate) move survivors' DOM without re-rendering them.
	if (pure && block.props === newItem && (indexIndependent || block.itemIndex === newIdx)) {
		block.itemIndex = newIdx;
		block.body = itemBody as ComponentBody;
	} else {
		block.props = newItem;
		block.body = itemBody as ComponentBody;
		block.itemIndex = newIdx;
		block.extra = env;
		if (lite) {
			// Lite survivors bypass renderBlock — pass the tuple directly as the
			// body's third arg (the same slot renderBlock forwards block.extra to).
			(itemBody as any)(newItem, block, env);
		} else {
			renderBlock(block);
		}
	}
}

function reconcileKeyed<T>(
	parentBlock: Block,
	state: ForSlot,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	pure: boolean,
	// true / false = compiler-static (compiled @for); 2 = de-opt per-item
	// self-marking sentinel, resolved by mountItem against each item VALUE.
	singleRoot: boolean | 2,
	lite: boolean = false,
	indexIndependent: boolean = false,
): void {
	const oldItems = state.items;
	const oldSize = state.size;
	const newLen = items.length;
	const parentNode = state.end.parentNode!;

	// Fast path: empty → fill. Append each new block to the tail of the (empty) list.
	if (oldSize === 0) {
		if (newLen === 0) return;
		// Pure-host → blocks upgrade adoption (childSlot arms `state.adopt`): the
		// element's existing raw children, keyed like the incoming items. An item
		// whose key matches the queue FRONT adopts that node in place (mountItem
		// wraps it in the item's markers and seeds block.deoptNode); other items
		// mount fresh BEFORE the next unconsumed node so DOM order tracks list
		// order. Non-front key matches (a reorder in the very same render) mount
		// fresh — the unconsumed nodes are swept by the caller.
		const adopt = state.adopt;
		let prev: Block | null = null;
		for (let i = 0; i < newLen; i++) {
			const item = items[i];
			const key = getKey(item, i);
			let adoptNode: Node | null = null;
			let anchor: Node = state.end;
			if (adopt !== null && adopt.length !== 0) {
				if (adopt[0].key === key) adoptNode = adopt.shift()!.node;
				else anchor = adopt[0].node;
			}
			const block = mountItem(
				parentBlock,
				parentNode,
				anchor,
				item,
				i,
				itemBody,
				state,
				singleRoot,
				adoptNode,
			);
			oldItems.set(key, block);
			block.key = key;
			block.prevSibling = prev;
			block.nextSibling = null;
			if (prev) prev.nextSibling = block;
			else state.head = block;
			prev = block;
		}
		state.tail = prev;
		state.size = newLen;
		return;
	}
	// Fast path: clear all.
	if (newLen === 0) {
		batchClearItems(state, oldItems);
		state.head = null;
		state.tail = null;
		state.size = 0;
		return;
	}

	// ── Prefix walk: advance head cursor while keys match new[i] at position i.
	let oldFirst: Block | null = state.head;
	let prefixLen = 0;
	while (oldFirst !== null && prefixLen < newLen) {
		const newKey = getKey(items[prefixLen], prefixLen);
		if (oldFirst.key !== newKey) break;
		const block = oldFirst;
		updateSurvivor(
			block,
			items[prefixLen],
			prefixLen,
			itemBody,
			pure,
			lite,
			indexIndependent,
			state.env,
		);
		oldFirst = block.nextSibling!;
		prefixLen++;
	}

	// Both lists fully consumed by prefix? Identical → done.
	if (prefixLen === newLen && oldFirst === null) return;

	// ── Suffix walk: retreat tail cursor while keys match new[newEnd].
	let oldLast: Block | null = state.tail;
	let newEnd = newLen - 1;
	let oldRemain = oldSize - prefixLen;
	while (oldLast !== null && oldRemain > 0 && newEnd >= prefixLen) {
		const newKey = getKey(items[newEnd], newEnd);
		if (oldLast.key !== newKey) break;
		const block = oldLast;
		updateSurvivor(block, items[newEnd], newEnd, itemBody, pure, lite, indexIndependent, state.env);
		oldLast = block.prevSibling!;
		newEnd--;
		oldRemain--;
	}

	// Boundaries of the OLD middle in the linked list.
	//   beforeMiddle = last prefix-matched block (or null if prefix empty)
	//   afterMiddle  = first suffix-matched block (or null if suffix empty)
	// When oldRemain === 0, the OLD middle is empty — oldFirst is either null
	// (prefix consumed all of old) or it points at the first suffix-matched block.
	let beforeMiddle: Block | null;
	let afterMiddle: Block | null;
	if (oldRemain === 0) {
		afterMiddle = oldFirst;
		beforeMiddle = afterMiddle ? afterMiddle.prevSibling! : state.tail;
	} else {
		beforeMiddle = oldFirst!.prevSibling!;
		afterMiddle = oldLast!.nextSibling!;
	}

	// Case: old middle empty, new middle non-empty → only inserts.
	if (oldRemain === 0) {
		const anchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
		let prev: Block | null = beforeMiddle;
		for (let i = prefixLen; i <= newEnd; i++) {
			const item = items[i];
			const key = getKey(item, i);
			const block = mountItem(
				parentBlock,
				parentNode,
				anchor,
				item,
				i,
				itemBody,
				state,
				singleRoot,
			);
			oldItems.set(key, block);
			block.key = key;
			block.prevSibling = prev;
			block.nextSibling = afterMiddle;
			if (prev) prev.nextSibling = block;
			else state.head = block;
			prev = block;
		}
		if (afterMiddle) afterMiddle.prevSibling = prev;
		else state.tail = prev;
		state.size += newEnd - prefixLen + 1;
		return;
	}

	// Case: new middle empty, old middle non-empty → only removes.
	if (prefixLen > newEnd) {
		let cur: Block | null = oldFirst;
		let removed = 0;
		while (cur !== afterMiddle) {
			const next: Block | null = cur!.nextSibling!;
			unmountBlock(cur!);
			oldItems.delete(cur!.key);
			cur = next;
			removed++;
		}
		if (beforeMiddle) beforeMiddle.nextSibling = afterMiddle;
		else state.head = afterMiddle;
		if (afterMiddle) afterMiddle.prevSibling = beforeMiddle;
		else state.tail = beforeMiddle;
		state.size -= removed;
		return;
	}

	// ── General case: both middles non-empty. Partition + LIS-move.
	const newMidLen = newEnd - prefixLen + 1;
	const newKeys: any[] = new Array(newMidLen);
	const newKeysToIdx = new Map<any, number>(); // key → MIDDLE-RELATIVE index (0..newMidLen-1)
	for (let i = 0; i < newMidLen; i++) {
		const key = getKey(items[prefixLen + i], prefixLen + i);
		newKeys[i] = key;
		newKeysToIdx.set(key, i);
	}

	// Full-replace fast path — when prefix/suffix are empty AND no old items
	// survive, batch-clear with `textContent = ''` (one DOM op vs N removeChild)
	// and mass-mount. Detect "no survivors" by checking just the first old block
	// (the loop in the original code exits after one hit too).
	if (beforeMiddle === null && afterMiddle === null && !newKeysToIdx.has(oldFirst!.key)) {
		// Quick scan: confirm no survivor before committing to batch-clear.
		let anySurvivors = false;
		let cur: Block | null = oldFirst!.nextSibling!;
		while (cur !== null) {
			if (newKeysToIdx.has(cur.key)) {
				anySurvivors = true;
				break;
			}
			cur = cur.nextSibling!;
		}
		if (!anySurvivors) {
			batchClearItems(state, oldItems);
			state.head = null;
			state.tail = null;
			state.size = 0;
			let prev: Block | null = null;
			for (let i = 0; i < newLen; i++) {
				const item = items[i];
				const key = newKeys[i]; // prefixLen === 0, so newKeys spans the full list
				const block = mountItem(
					parentBlock,
					parentNode,
					state.end,
					item,
					i,
					itemBody,
					state,
					singleRoot,
				);
				oldItems.set(key, block);
				block.key = key;
				block.prevSibling = prev;
				block.nextSibling = null;
				if (prev) prev.nextSibling = block;
				else state.head = block;
				prev = block;
			}
			state.tail = prev;
			state.size = newLen;
			return;
		}
	}

	// sources[i] = old middle-relative index for new[prefixLen + i], or -1 if new.
	const sources = new Int32Array(newMidLen);
	for (let i = 0; i < newMidLen; i++) sources[i] = -1;

	let moved = false;
	let lastIdx = 0;
	let patched = 0;

	// Walk old middle (linked-list traversal): re-render survivors, unmount removed.
	let cur: Block | null = oldFirst;
	let oldIdx = 0;
	while (cur !== afterMiddle) {
		const next: Block | null = cur!.nextSibling!;
		const newRelIdx = newKeysToIdx.get(cur!.key);
		if (newRelIdx === undefined) {
			unmountBlock(cur!);
			oldItems.delete(cur!.key);
			state.size--;
		} else {
			sources[newRelIdx] = oldIdx;
			if (newRelIdx < lastIdx) moved = true;
			else lastIdx = newRelIdx;
			patched++;
			const newIdx = prefixLen + newRelIdx;
			updateSurvivor(
				cur!,
				items[newIdx],
				newIdx,
				itemBody,
				pure,
				lite,
				indexIndependent,
				state.env,
			);
		}
		cur = next;
		oldIdx++;
	}

	// Fast bail: all survivors AND no moves AND no mounts → old middle is the
	// same shape & order as new middle.
	if (!moved && patched === newMidLen) {
		// If the survivor walk did NOT unmount anything (oldRemain ===
		// patched), the linked-list pointers are still correct end-to-end
		// and we can return without touching them. But if blocks were
		// unmounted BETWEEN survivors, the survivors' .prevSibling /
		// .nextSibling pointers still reference now-disposed blocks AND
		// state.head / state.tail may also point at disposed blocks. The
		// next reconcile would then walk those stale pointers, decrement
		// state.size for blocks that no longer exist, and ultimately
		// crash with a null-pointer access in the prefix/suffix walk.
		//
		// Relink the entire middle chain so its prev/next pointers — and
		// the boundary into beforeMiddle / afterMiddle / state.head /
		// state.tail — accurately reflect the post-unmount topology.
		// O(newMidLen); only fires when survivors and removes are mixed.
		// Surfaced by fuzz-keyed-list seed=-2060211668 action 9 (a
		// replace-all 13 → 2 where both survivors are in original order).
		if (oldRemain !== patched) {
			let prev: Block | null = beforeMiddle;
			for (let i = 0; i < newMidLen; i++) {
				const block = oldItems.get(newKeys[i])!;
				block.prevSibling = prev;
				if (prev) prev.nextSibling = block;
				else state.head = block;
				prev = block;
			}
			prev!.nextSibling = afterMiddle;
			if (afterMiddle) afterMiddle.prevSibling = prev;
			else state.tail = prev;
		}
		return;
	}

	// ── Small-displacement shortcut. When every old item survived AND only a
	// small number of positions actually changed (≤ K_DISP), we can compute
	// the exact move set in O(K_DISP) instead of paying the LIS path's O(N)
	// allocation + back-walk that rewrites every prev/next pointer. This is
	// a general property of permutations — when survivors are stable and the
	// permutation has few fixed-point misses, LIS does provably wasted work.
	//
	// Real shapes this covers:
	//   - drag-and-drop reorder (swap two rows, rotate three)
	//   - undo/redo of a recent local edit
	//   - animated swap / sort transitions
	//   - A/B variant toggle that flips a small set of cells
	//   - any benchmark or test fixture that mutates exactly K positions
	//
	// Bail cost on a true large-shuffle permutation: K_DISP + 1 source
	// compares before falling through to the LIS path, which is sub-µs.
	if (moved && patched === newMidLen) {
		let dCount = 0;
		for (let i = 0; i < newMidLen; i++) {
			if (sources[i] !== i) {
				if (dCount === K_DISP) {
					dCount = K_DISP + 1;
					break;
				}
				_disp[dCount++] = i;
			}
		}
		if (dCount <= K_DISP) {
			const endAnchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
			// Move right-to-left. Positions to the right of the rightmost
			// displaced index are identity-mapped and have stable startMarkers;
			// each moved block becomes the next iteration's anchor.
			for (let j = dCount - 1; j >= 0; j--) {
				const i = _disp[j];
				const block = oldItems.get(newKeys[i])!;
				const anchor: Node =
					i + 1 < newMidLen ? oldItems.get(newKeys[i + 1])!.startMarker! : endAnchor;
				moveBlockBefore(block, anchor);
			}
			// Relink prev/next around each displaced position. Non-displaced
			// neighbours of displaced blocks get their boundary pointers updated
			// here too; non-displaced blocks BETWEEN two displaced positions keep
			// their internal pointers (they were never touched by the survivor
			// walk and the moves above don't reorder them).
			for (let j = 0; j < dCount; j++) {
				const i = _disp[j];
				const block = oldItems.get(newKeys[i])!;
				const prev = i > 0 ? oldItems.get(newKeys[i - 1])! : beforeMiddle;
				const next = i + 1 < newMidLen ? oldItems.get(newKeys[i + 1])! : afterMiddle;
				block.prevSibling = prev;
				block.nextSibling = next;
				if (prev) prev.nextSibling = block;
				else state.head = block;
				if (next) next.prevSibling = block;
				else state.tail = block;
			}
			// Boundary patch: the first and last block of the NEW middle may be
			// identity-mapped (not in _disp), in which case the displacement
			// loop never touched them — they still carry their pre-reconcile
			// neighbour pointers, which can be stale (e.g. pointing at a block
			// that the survivor walk just unmounted, or at a prior-reconcile
			// neighbour that has since shifted). Always re-pin the boundary
			// pointers so state.head / state.tail / beforeMiddle.next /
			// afterMiddle.prev are correct for the next reconcile.
			//
			// Repro for why this matters: surfaced by fuzz-keyed-list seed
			// -1491785866 — a `replace-all` that shrinks the list (e.g. 6 → 3)
			// where the last survivor is identity-mapped. Without the patch,
			// state.tail keeps pointing at the prior-tail block (now deleted)
			// and the surviving last block's .nextSibling still points at the
			// removed sibling. The next reconcile then stops its old-middle
			// walk early (at the stale nextSibling) and re-mounts the
			// last survivor as a NEW block, producing a duplicate row.
			const newMidFirst = oldItems.get(newKeys[0])!;
			const newMidLast = oldItems.get(newKeys[newMidLen - 1])!;
			newMidFirst.prevSibling = beforeMiddle;
			newMidLast.nextSibling = afterMiddle;
			if (beforeMiddle) beforeMiddle.nextSibling = newMidFirst;
			else state.head = newMidFirst;
			if (afterMiddle) afterMiddle.prevSibling = newMidLast;
			else state.tail = newMidLast;
			return;
		}
	}

	// Walk new middle back-to-front. For each new position: mount / move / leave.
	// Track:
	//   nextBlock  = block at position i+1 (already placed), or afterMiddle initially
	//                — used as the DOM anchor and prev/next neighbour
	//   lastPlaced = block placed in the FIRST iteration (= new middle's tail)
	const middleEndAnchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
	let nextBlock: Block | null = afterMiddle;
	let lastPlaced: Block | null = null;

	if (moved) {
		const seq = lis(sources);
		let seqIdx = seq.length - 1;
		for (let i = newMidLen - 1; i >= 0; i--) {
			const targetIdx = i + prefixLen;
			const key = newKeys[i];
			const anchor: Node = nextBlock ? nextBlock.startMarker! : middleEndAnchor;
			let block: Block;
			if (sources[i] === -1) {
				// Mount: new item, no old counterpart.
				const item = items[targetIdx];
				block = mountItem(
					parentBlock,
					parentNode,
					anchor,
					item,
					targetIdx,
					itemBody,
					state,
					singleRoot,
				);
				oldItems.set(key, block);
				block.key = key;
				state.size++;
			} else if (seqIdx < 0 || i !== seq[seqIdx]) {
				// Move: survivor not in the LIS → DOM range moves before anchor.
				block = oldItems.get(key)!;
				moveBlockBefore(block, anchor);
			} else {
				// Leave: survivor in the LIS → DOM stays put.
				block = oldItems.get(key)!;
				seqIdx--;
			}
			// Re-link into the new middle chain. We rebuild middle pointers from
			// scratch; every middle block's prev/next gets rewritten here.
			block.nextSibling = nextBlock;
			if (nextBlock) nextBlock.prevSibling = block;
			if (lastPlaced === null) lastPlaced = block;
			nextBlock = block;
		}
	} else {
		// No moves but at least one mount (we'd have returned already if all survivors).
		for (let i = newMidLen - 1; i >= 0; i--) {
			const targetIdx = i + prefixLen;
			const key = newKeys[i];
			const anchor: Node = nextBlock ? nextBlock.startMarker! : middleEndAnchor;
			let block: Block;
			if (sources[i] === -1) {
				const item = items[targetIdx];
				block = mountItem(
					parentBlock,
					parentNode,
					anchor,
					item,
					targetIdx,
					itemBody,
					state,
					singleRoot,
				);
				oldItems.set(key, block);
				block.key = key;
				state.size++;
			} else {
				block = oldItems.get(key)!;
			}
			block.nextSibling = nextBlock;
			if (nextBlock) nextBlock.prevSibling = block;
			if (lastPlaced === null) lastPlaced = block;
			nextBlock = block;
		}
	}

	// Splice the freshly-built new middle in between beforeMiddle and afterMiddle.
	// newMiddleHead = `nextBlock` after the loop (last iteration placed item[prefixLen]).
	// newMiddleTail = `lastPlaced` (first iteration placed item[newEnd]).
	// newMiddleTail.nextSibling was set to afterMiddle in the first loop iter,
	// and afterMiddle.prevSibling (if non-null) was set to newMiddleTail. So only
	// the HEAD side of the splice remains.
	const newMiddleHead = nextBlock!;
	const newMiddleTail = lastPlaced!;
	newMiddleHead.prevSibling = beforeMiddle;
	if (beforeMiddle) beforeMiddle.nextSibling = newMiddleHead;
	else state.head = newMiddleHead;
	if (!afterMiddle) state.tail = newMiddleTail;
}

/**
 * Bulk-clear a forBlock's items. When the forBlock owns its parent (markers
 * bracket the entire content), uses `textContent = ''` — the fastest DOM clear
 * on Chromium per Ripple's measured advantage on the `clear` op. Otherwise
 * falls back to a scoped Range deletion.
 *
 * Every item still gets a disposal pass: items whose scope carries cleanups,
 * child scopes, or slot-stashed Blocks (a cross-module `<Row/>` lives on the
 * item's `_slots` as a componentSlot, NOT on `.children`) tear down through
 * `unmountBlock(b, false)` — full scope walk incl. `_slots`, portal
 * self-detach from foreign targets, and trySlot bookkeeping — with the DOM
 * skipped because the batch clear already removed the whole range. Plain
 * template rows (the common bulk-clear case) hit only the three-field guard.
 */
function batchClearItems(state: ForSlot, oldItems: Map<any, Block>): void {
	const p = state.start.parentNode!;
	if (state.start.previousSibling === null && state.end.nextSibling === null) {
		// forBlock owns the parent — nuke everything in one DOM op, then re-add markers.
		(p as Element).textContent = '';
		p.appendChild(state.start);
		p.appendChild(state.end);
	} else {
		// Shared parent (other JSX interleaved) — scoped Range delete keeps neighbors intact.
		const range = document.createRange();
		range.setStartAfter(state.start);
		range.setEndBefore(state.end);
		range.deleteContents();
	}
	// Walk the intrusive item chain (head → nextSibling) rather than the Map's
	// iterator: zero allocation and a monomorphic pointer chase. Callers reset
	// head/tail only AFTER this returns, so the chain still covers exactly the
	// old items here.
	for (let b: Block | null = state.head; b !== null; b = b.nextSibling) {
		if (b.cleanups.length > 0 || b.children.length > 0 || b._slots !== null) {
			unmountBlock(b, false);
		} else {
			// Pure-host de-opt item (deoptItemBody with no component descendants):
			// nothing to unmount scope-wise, but its subtree may carry stamped refs
			// that must not keep pointing at the batch-removed DOM. Guarded so the
			// common template-row clear stays a single null check.
			if (b.deoptNode !== null) detachDeoptTreeRefs(b.deoptNode, null);
			b.disposed = true;
		}
	}
	oldItems.clear();
}

function mountItem<T>(
	parentBlock: Block,
	parentNode: Node,
	anchor: Node,
	item: T,
	index: number,
	body: (item: T, s: Scope) => void,
	forSlot: ForSlot,
	// true = compiler-proven single-element item body (compiled @for). 2 = the
	// DE-OPT sentinel (marker-elision M4): decide PER ITEM at mount — a pure
	// single-element host descriptor self-marks like the compiled path (its one
	// rendered element becomes both markers); anything else (null / primitive /
	// component-bearing) keeps the `it` pair. A later shape flip promotes the
	// self-marked block to a minted pair in place (see deoptItemBody).
	singleRoot: boolean | 2,
	// Pure-host → blocks upgrade adoption: an existing raw child node this item
	// should take over IN PLACE (self-marked directly, or markers minted around
	// it, seeded as the item block's deoptNode so the body's pure path patches
	// instead of rebuilding).
	adoptNode: Node | null = null,
): Block {
	if (hydrating) {
		// Hydration: the server wrapped EVERY item in its own `<!--[-->…<!--]-->`
		// range (regardless of the client `singleRoot` optimization, which the
		// server can't know). Adopt this item's markers off the cursor, point the
		// cursor at its content for the body's clone(), then advance past it to the
		// next item's marker. (Hydrated items thus carry markers — the singleRoot
		// no-marker path is a client-mount-only optimization.)
		if (!isBlockOpen(hydrateNode)) {
			// STRUCTURAL list mismatch: the client renders more items than the server did,
			// so the cursor isn't on an item's open marker (it's at the @for's end marker or
			// other content). Without this guard `matchingClose` would walk off the end and
			// crash. Recover by building THIS item fresh — suspend hydration for the item's
			// whole subtree (via a re-entrant call) so it client-mounts instead of adopting.
			const mmLoc = (parentNode as any).__oct_loc;
			if (mmLoc)
				warnHydrationStructuralMismatch(
					mmLoc,
					'another list item',
					describeHydrationNode(hydrateNode),
				);
			const saved = hydrating;
			hydrating = false;
			try {
				return mountItem(parentBlock, parentNode, anchor, item, index, body, forSlot, singleRoot);
			} finally {
				hydrating = saved;
			}
		}
		const itemStart = hydrateNode as Comment;
		const itemEnd = matchingClose(itemStart as Node);
		hydrateNode = itemStart.nextSibling;
		const block = createBlock(
			'control-flow',
			parentBlock,
			parentNode,
			itemStart,
			itemEnd,
			body as ComponentBody,
			item,
			forSlot.env,
		);
		block.forSlot = forSlot;
		block.itemIndex = index;
		renderBlock(block);
		hydrateNode = itemEnd.nextSibling;
		return block;
	}
	if (
		singleRoot === true ||
		(singleRoot === 2 && isHostDescriptor(item) && !descNeedsBlocks(item))
	) {
		// Compiler verified the body emits exactly one Element root (true) — or,
		// on the de-opt sentinel (2), the ITEM VALUE is a pure single-element
		// host descriptor, which deoptItemBody's raw path always renders as
		// exactly one node. Skip the per-item Comment markers and use the
		// inserted element as both start and end. For a 1000-row table that
		// means 2000 fewer DOM nodes inside <tbody>, which the browser's
		// layout/paint walks every time. Big paint win when the slowdown is
		// "tbody has 3000 children" not "JS is slow".
		if (adoptNode !== null) {
			// Upgrade adoption on the self-marked path: the adopted raw node IS
			// the item's single element, already in position — no markers, no
			// insert. Seed it as both markers AND the block's deoptNode so the
			// body's raw path patches it in place (the queue only pairs
			// tag-compatible nodes, so the reuse branch always hits).
			const block = createBlock(
				'control-flow',
				parentBlock,
				parentNode,
				adoptNode,
				adoptNode,
				body as ComponentBody,
				item,
				forSlot.env,
			);
			block.forSlot = forSlot;
			block.itemIndex = index;
			block.deoptNode = adoptNode;
			renderBlock(block);
			return block;
		}
		const block = createBlock(
			'control-flow',
			parentBlock,
			parentNode,
			null,
			anchor,
			body as ComponentBody,
			item,
			forSlot.env,
		);
		block.forSlot = forSlot;
		block.itemIndex = index;
		renderBlock(block);
		// Body inserted ONE node right before `anchor` via
		// `__block.parentNode.insertBefore(_root, __block.endMarker)`. Grab it
		// and promote it to start === end. From now on `block.endMarker` is the
		// actual element (so subsequent body re-renders insert nothing — the
		// update path mutates the cached _b._el$N refs directly).
		const root = anchor.previousSibling!;
		block.startMarker = root;
		block.endMarker = root;
		return block;
	}
	const start = document.createComment('it');
	const end = document.createComment('/it');
	if (adoptNode !== null) {
		// Adoption: wrap the existing raw node in this item's markers where it
		// already sits (identity/focus/input state survive) instead of building
		// at the anchor.
		parentNode.insertBefore(start, adoptNode);
		parentNode.insertBefore(end, adoptNode.nextSibling);
	} else {
		parentNode.insertBefore(start, anchor);
		parentNode.insertBefore(end, anchor);
	}
	const block = createBlock(
		'control-flow',
		parentBlock,
		parentNode,
		start,
		end,
		body as ComponentBody,
		item,
		forSlot.env,
	);
	block.forSlot = forSlot;
	block.itemIndex = index;
	if (adoptNode !== null) block.deoptNode = adoptNode;
	renderBlock(block);
	return block;
}

function moveBlockBefore(block: Block, anchor: Node): void {
	const parent = block.startMarker!.parentNode!;
	const end = block.endMarker!;
	let n: Node | null = block.startMarker!;
	// Walk by checking `n === end` BEFORE moving. The previous design captured
	// `stop = endMarker.nextSibling` at function entry, then iterated until
	// `n === stop`. That breaks when the block range has multi-root content
	// (e.g. fragment items with start/end Comment markers + N body nodes):
	// after moving start + body nodes adjacent to `anchor`, the rest of the
	// range (including `endMarker`) sits at the OLD position. When the walker
	// finally reaches `endMarker`, its captured `nextSibling` points BACK to
	// the already-moved start (now adjacent at `endMarker`'s new neighbour
	// position), so the walker loops back into the range and never terminates.
	while (n) {
		const isEnd = n === end;
		const next: Node | null = n.nextSibling;
		parent.insertBefore(n, anchor);
		if (isEnd) break;
		n = next;
	}
}

/**
 * Longest Increasing Subsequence — returns indices into `arr` whose values form the LIS.
 * Skips entries where arr[i] === -1 (new items).
 * Ported from the standard O(n log n) patience-sort algorithm used by Ripple/Solid/Vue.
 */
function lis(arr: Int32Array): number[] {
	const n = arr.length;
	const p = new Int32Array(n);
	const result: number[] = [];
	for (let i = 0; i < n; i++) {
		const v = arr[i];
		if (v === -1) continue;
		if (result.length === 0 || arr[result[result.length - 1]] < v) {
			p[i] = result.length === 0 ? -1 : result[result.length - 1];
			result.push(i);
			continue;
		}
		// Binary search for the smallest tail >= v.
		let lo = 0,
			hi = result.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (arr[result[mid]] < v) lo = mid + 1;
			else hi = mid;
		}
		if (v < arr[result[lo]]) {
			p[i] = lo > 0 ? result[lo - 1] : -1;
			result[lo] = i;
		}
	}
	// Reconstruct.
	let u = result.length;
	let v = result[u - 1];
	while (u-- > 0) {
		result[u] = v;
		v = p[v];
	}
	return result;
}

// ---------------------------------------------------------------------------
// Public root API — React-DOM parity
// ---------------------------------------------------------------------------

export interface Root {
	/**
	 * Render into this root. Two forms:
	 *  - React-style:   `root.render(<App foo={x}/>)` — a single element descriptor
	 *    (the compiler lowers the JSX to `createElement(App, {foo: x})`).
	 *  - Body + props:  `root.render(App, { foo: x })` — the original octane
	 *    form, kept for direct (non-JSX) callers and existing test helpers.
	 * Re-rendering with the same component (`type`/body) updates props in place;
	 * a different component tears down and remounts.
	 */
	render(element: ElementDescriptor): void;
	render(body: ComponentBody, props?: any): void;
	unmount(): void;
}

// Shared Root factory behind both `createRoot` and `hydrateRoot`. The
// `rootBlock`/`currentBody` parameters are the live state captured by the
// returned closures: `createRoot` starts them `null` (the block is created
// lazily on the first `.render()`), while `hydrateRoot` passes in the
// already-hydrated block + its body so the FIRST post-hydration `.render()`
// with the SAME component hits the same-body fast path (props update) and never
// wipes the adopted server DOM. This factory NEVER touches the hydration-only
// state (`hydrating`/`hydrateNode`/`hydrationSeeds`/`_idCounter`) — that runs
// once, inside `hydrateRoot`. Keeping `hydrating` out of here preserves the DCE
// contract (it is assigned only in the hydrate entry, so client-only builds fold
// every `if (hydrating)` branch out).
function makeRoot(
	container: Element,
	rootBlock: Block | null,
	currentBody: ComponentBody | null,
): Root {
	return {
		render(bodyOrElement: ComponentBody | ElementDescriptor, props?: any) {
			// React-style `render(<App foo={x}/>)` arrives as an element descriptor:
			// unwrap to (type, props). The `render(body, props)` form passes through.
			let body: ComponentBody;
			if (isElementDescriptor(bodyOrElement)) {
				// At a root, the descriptor is always a component value (`render(<App/>)`),
				// never a host tag — host descriptors only arise at child positions.
				body = bodyOrElement.type as ComponentBody;
				props = bodyOrElement.props;
			} else {
				body = bodyOrElement;
			}
			// Same component as the live root (incl. a just-hydrated root): update
			// props in place and schedule. This is a NORMAL client render — `hydrating`
			// is already false, so renderBlock reuses the adopted DOM, not rebuilds it.
			if (rootBlock && currentBody === body) {
				rootBlock.props = props;
				scheduleRender(rootBlock);
				return;
			}
			if (rootBlock) {
				unmountBlock(rootBlock);
				rootBlock = null;
				currentBody = null;
			}
			while (container.firstChild) container.removeChild(container.firstChild);
			rootBlock = createBlock('root', null, container, null, null, body, props);
			currentBody = body;
			renderBlock(rootBlock);
			// First render commits effects on next microtask flush.
			if (!syncFlush && !scheduled) {
				scheduled = true;
				queueMicrotask(flush);
			}
		},
		unmount() {
			if (rootBlock) {
				// Skip the per-Block DOM walk recursion (~3 removeChild ops × every
				// Block in the tree). Run cleanups + scope teardown only, then clear
				// the container in one shot. Portals self-detach during the recursive
				// teardown because their DOM lives in a foreign target — see the
				// portalSlotSlot branch in unmountScope.
				unmountBlock(rootBlock, /*detachDom*/ false);
				// Root unmount runs outside any flush, so no commit follows — drain the
				// teardown ref detaches queued above directly.
				drainRefDetaches();
				container.textContent = '';
				rootBlock = null;
				currentBody = null;
			}
			unregisterDelegationTarget(container);
		},
	};
}

export function createRoot(container: Element): Root {
	// Register the container as an event-delegation target up front. Listeners
	// for all currently-known delegated events attach now; any new event types
	// registered later (via `delegateEvents`) will back-attach automatically.
	registerDelegationTarget(container);
	// Lazy root: the block is created on the first `.render()` call.
	return makeRoot(container, null, null);
}

/**
 * Hydrate a server-rendered container and return a live {@link Root} — the
 * React-18 `hydrateRoot(container, element)` shape (container FIRST). Instead of
 * clearing the container and cloning fresh DOM, the compiled mount ADOPTS the
 * existing server DOM: `clone()` returns the server root, `htext()` adopts
 * server text nodes, and event handlers / update bindings are stamped on the
 * adopted nodes (`hydrating` flag, see clone/htext). The seeded prev-values make
 * the first update a no-op when the client matches the server (no mismatch
 * re-render).
 *
 * Hydration runs ONCE, here on creation. The returned root's `.render(...)` is a
 * normal (non-hydrating) client render against the block mounted here: the same
 * component updates props in place on the adopted DOM, a different component
 * tears down and remounts.
 */
export function hydrateRoot(container: Element, element: ElementDescriptor): Root;
export function hydrateRoot(container: Element, body: ComponentBody, props?: any): Root;
export function hydrateRoot(
	container: Element,
	bodyOrElement: ComponentBody | ElementDescriptor,
	props?: any,
): Root {
	let body: ComponentBody;
	if (isElementDescriptor(bodyOrElement)) {
		body = bodyOrElement.type as ComponentBody;
		props = bodyOrElement.props;
	} else {
		body = bodyOrElement;
	}
	registerDelegationTarget(container);
	const rootBlock = createBlock('root', null, container, null, null, body, props);
	hydrating = true;
	// Align useId with the server. The server resets ID_COUNTER to 0 at the start
	// of every render() (runtime.server.ts), so its ids are :in-0:, :in-1:, … in
	// depth-first render order. Hydration renders the SAME tree in the SAME order,
	// so resetting the client counter to 0 here makes the client mint byte-identical
	// ids — otherwise the monotonic global (advanced by any earlier client render)
	// would drift and every useId would hydration-mismatch. Subsequent client-only
	// renders continue monotonically from after the hydrated tree's ids, so no
	// collision. (Single-root hydration; multi-root pages share the flat-counter
	// limitation that already exists server-side.)
	_idCounter = 0;
	// Adopt server-serialized use(thenable) values, if any: pull them out of the
	// inline data <script> (and remove it, so it isn't taken for a hydratable
	// node) and stage them for useThenable to consume in render order.
	const seedScript = container.querySelector('script[' + SUSPENSE_SCRIPT_ATTR + ']');
	if (seedScript !== null) {
		hydrationSeeds = parseSeedJson(seedScript.textContent || '[]');
		hydrationSeedCursor = 0;
		seedScript.remove();
	}
	// The component's server root is the container's first node — the initial
	// cursor position. clone() adopts it; a hole-template walk advances from here.
	// A STREAMED shell flushes its deduped <style data-octane> tags AHEAD of the
	// body markup (styles must be live before painted fallbacks), so skip any
	// leading renderer-emitted style tags: injectStyle's document-level dedupe
	// matches them, and they are never adopted as component DOM.
	let firstNode = container.firstChild;
	while (
		firstNode !== null &&
		firstNode.nodeType === 1 &&
		(firstNode as Element).tagName === 'STYLE' &&
		(firstNode as Element).hasAttribute('data-octane')
	) {
		firstNode = firstNode.nextSibling;
	}
	hydrateNode = firstNode;
	try {
		renderBlock(rootBlock);
	} finally {
		hydrating = false;
		hydrateNode = null;
		hydrationSeeds = null;
		hydrationSeedCursor = 0;
	}
	// Commit effects on the next microtask flush (same as createRoot's first render).
	if (!syncFlush && !scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
	// Hand the already-hydrated block + its body to the shared factory: from here
	// the root behaves exactly like a `createRoot` root — a `.render()` with the
	// same component updates props on the adopted DOM (same-body fast path), a
	// different component tears down and remounts.
	return makeRoot(container, rootBlock, body);
}

// ---------------------------------------------------------------------------
// Resource hints — React DOM's preload / preinit / preconnect / prefetchDNS.
// Each call inserts one deduped <link>/<script> into document.head (client).
// Dedupe key = rel/kind + href, matching React's resource identity model.
// ---------------------------------------------------------------------------

const _resourceHints = new Set<string>();

function insertHeadHint(key: string, build: () => Element): void {
	if (typeof document === 'undefined' || _resourceHints.has(key)) return;
	_resourceHints.add(key);
	// SSR dedupe: the server may have emitted this hint already.
	if (document.head.querySelector('[data-oct-hint="' + key + '"]') !== null) return;
	const el = build();
	el.setAttribute('data-oct-hint', key);
	document.head.appendChild(el);
}

function applyHintAttrs(el: Element, opts: Record<string, unknown> | undefined): void {
	if (opts == null) return;
	for (const k in opts) {
		const v = (opts as any)[k];
		if (v == null || v === false) continue;
		el.setAttribute(
			k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase(),
			v === true ? '' : String(v),
		);
	}
}

/** React DOM `preload(href, {as, …})` — `<link rel="preload">`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	if (!href || !options?.as) return;
	insertHeadHint('preload:' + options.as + ':' + href, () => {
		const l = document.createElement('link');
		l.rel = 'preload';
		l.href = href;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `preinit(href, {as: 'style'|'script', …})` — executes/applies the resource. */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	if (!href || !options?.as) return;
	const as = options.as;
	insertHeadHint('preinit:' + as + ':' + href, () => {
		if (as === 'style') {
			const l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = href;
			applyHintAttrs(l, { ...options, as: undefined });
			return l;
		}
		const s = document.createElement('script');
		(s as HTMLScriptElement).src = href;
		(s as HTMLScriptElement).async = true;
		applyHintAttrs(s, { ...options, as: undefined });
		return s;
	});
}

/** React DOM `preconnect(href, {crossOrigin?})` — `<link rel="preconnect">`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	if (!href) return;
	insertHeadHint('preconnect:' + href, () => {
		const l = document.createElement('link');
		l.rel = 'preconnect';
		l.href = href;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `prefetchDNS(href)` — `<link rel="dns-prefetch">`. */
export function prefetchDNS(href: string): void {
	if (!href) return;
	insertHeadHint('dns-prefetch:' + href, () => {
		const l = document.createElement('link');
		l.rel = 'dns-prefetch';
		l.href = href;
		return l;
	});
}
