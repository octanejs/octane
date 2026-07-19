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
	HYDRATE_ID_ATTR,
	HYDRATE_WHEN_ATTR,
	HYDRATE_ID_COUNT_ATTR,
	HYDRATE_SEED_ATTR,
	STREAM_BOUNDARY_ATTR,
	STREAM_SCRIPT_ATTR,
	STREAM_SEED_COMMENT,
	HYDRATION_START,
	HYDRATION_END,
	HYDRATION_FOR_EMPTY,
	HYDRATION_FOR_ITEMS,
	HYDRATION_TEXT_SEP,
	POSITIVE_NUMERIC_ATTR_PROPS,
	BOOLEAN_ATTR_PROPS,
	VALID_ATTR_NAME,
	isEnumeratedBooleanAttr,
	SUSPENSE_SEED_WIRE_PREFIX,
	REJECTION_SENTINEL_KEY,
	EXTERNAL_HYDRATION_PROMISE,
	HYDRATION_RANGE_BOUNDARY,
	cssStyleValue,
	ATTRIBUTE_ALIASES,
	SVG_ONLY_TAGS,
	// Read only on setAttribute's cold dangerouslySetInnerHTML arm.
	VOID_ELEMENTS,
} from './constants.js';
import {
	__profileBail,
	__profileBeginRender,
	__profileComponentSource,
	__profileEndRender,
	__profileHasComponentMetadata,
	__profileResolveHook,
	__profileSchedule,
	__profileTrackComponent,
	type ProfileFrame,
} from './profiling.js';
import type {
	HydrateProps,
	HydrationPrefetchFunction,
	HydrationPrefetchStrategy,
	HydrationPrefetchWaitReason,
	HydrationRuntimeGate,
	HydrationStrategy,
	HydrationWhen,
} from './hydration/types.js';
import {
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_INTERACTION_EVENTS_ATTR,
} from './hydration/interaction-config.js';
import {
	HYDRATE_SUPPORTED_INTERACTION_EVENTS,
	hydrationEventPathWithin,
	initializeHydrationEventCapture,
	markDelegatedDynamicHydrationIntent,
	registerHydrationIntentBoundary,
	takeDelegatedDynamicHydrationIntent,
	takePendingHydrationIntents,
	unregisterHydrationIntentBoundary,
	wasEarlyHydrationIntentHandled,
	type HydrationIntentBoundary,
	type HydrationIntentBoundaryStatus,
	type HydrationReplayIntent,
} from './hydration/event-capture.js';
import { sanitizeURL, sanitizeURLAttribute } from './sanitize-url.js';
import {
	COMPONENT_FLAG_BOUNDARY,
	hasComponentFlags,
	markComponentFlags,
} from './component-flags.js';

export { EXTERNAL_HYDRATION_PROMISE, HYDRATION_RANGE_BOUNDARY };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

let PROFILE_COMPONENT_OVERRIDE: { target: Function; component: Function | null } | null = null;

function withProfileComponentOverride<T>(
	target: Function,
	component: Function | null,
	run: () => T,
): T {
	const previous = PROFILE_COMPONENT_OVERRIDE;
	PROFILE_COMPONENT_OVERRIDE = { target, component };
	try {
		return run();
	} finally {
		PROFILE_COMPONENT_OVERRIDE = previous;
	}
}

function profileTrackComponent(subject: object, fallback: Function): void {
	const override = PROFILE_COMPONENT_OVERRIDE;
	__profileTrackComponent(
		subject,
		override !== null && override.target === fallback ? override.component : fallback,
	);
}

function profilePortalComponent(rawBody: unknown): Function | null {
	if (typeof rawBody === 'function' && __profileHasComponentMetadata(rawBody)) return rawBody;
	const descriptor = rawBody as any;
	return descriptor != null &&
		descriptor.$$kind === ELEMENT_TAG &&
		typeof descriptor.type === 'function'
		? descriptor.type
		: null;
}

// Bundler integrations replace the reserved constant in both normal and profile
// builds. Each use retains a typeof guard so the unbundled source/dist entry stays
// importable; using the define directly (instead of through a local const) lets
// Vite/Rspack erase the branch and its profiling import from normal bundles.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentBody<P = any, E = any> = (props: P, scope: Scope, extra: E) => void;
type EffectFn = () => void | (() => void);
type Cleanup = () => void;
type HookSlot = symbol | number;

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

interface EffectEventCell {
	impl: (...args: any[]) => any;
	active: boolean;
}

interface PendingEffectEvent {
	cell: EffectEventCell;
	nextImpl: (...args: any[]) => any;
	block: Block;
	renderVersion: number;
}

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
	hooks: Map<HookSlot, any> | null;
	cleanups: Cleanup[];
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
function ensureHooks(scope: Scope): Map<HookSlot, any> {
	return scope.hooks ?? (scope.hooks = new Map());
}

// Production helper/custom-hook ABI: reserve a disjoint numeric range for each
// evaluated module that needs globally composable Symbol descriptions. Direct
// sites in compiler-owned render Scopes use smaller local numbers and never call
// this helper. Evaluation order is irrelevant; reserved ranges never overlap,
// including duplicate/dynamically loaded module instances.
let nextHookSlot = 0;
export function hookSlots(count: number): number {
	const base = nextHookSlot;
	nextHookSlot += count;
	return base;
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

/** DEV root-location fallback for anonymous ESM default functions. */
function componentSourceLoc(body: unknown): string | undefined {
	if (typeof body !== 'function') return undefined;
	try {
		const stamped = (body as any).__oct_loc;
		if (typeof stamped === 'string') return stamped;
	} catch {
		// A user proxy/getter must not turn a diagnostic fallback into a render error.
	}
	try {
		const source = Function.prototype.toString.call(body);
		const match = /["']__octane_loc:([^"'\\\s]+)["']/.exec(source);
		if (match !== null) return decodeURIComponent(match[1]);
	} catch {
		// Native/proxied functions may not expose useful source; omit the location.
	}
	return undefined;
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
 * Shared preamble for hydration VALUE-mismatch write sites. Most class/style paths
 * only pay the server-value comparison when suppression or a dev source location
 * requires it. Attributes additionally compare in production because HTML parser
 * normalization can affect either the server or client value. Returns the disposition:
 *   0 — plain apply: after any site-required comparison, the client write patches/recovers.
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

function warnHydrationKeptServerValue(
	loc: string | undefined,
	what: string,
	serverVal: unknown,
	clientVal: unknown,
): void {
	if (process.env.NODE_ENV === 'production' || !loc) return;
	console.error(
		`Octane hydration mismatch at ${loc}: server rendered ${what} ` +
			`${JSON.stringify(serverVal)} but the client rendered ${JSON.stringify(clientVal)}. ` +
			'The server value was kept. If this difference is intentional, add ' +
			'suppressHydrationWarning to the element.',
	);
}

/** DEV-only human-readable description of the server node at the cursor (for warnings). */
function describeHydrationNode(node: Node | null): string {
	if (node === null) return 'nothing';
	if (node.nodeType === 1) return `<${(node as Element).localName}>`;
	if (node.nodeType === 3) return `text ${JSON.stringify((node as Text).nodeValue)}`;
	if (node.nodeType === 8) {
		if (isBlockOpen(node)) return 'a control-flow block';
		if (isBlockClose(node)) return 'the end of the parent block (fewer nodes than expected)';
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

type OutputHandler = (block: Block, value: unknown) => void;

interface RootIdState {
	prefix: string;
	next: number;
	/** Exclusive end of an SSR-reserved deferred-boundary range. */
	limit?: number;
	/** Root allocator used if a hydration mismatch consumes beyond that range. */
	overflow?: RootIdState;
}

// Client-only roots need a namespace beyond their root-local useId counter: two
// createRoot() calls can otherwise both emit `:in-0:` into the same document.
// hydrateRoot deliberately does NOT consume this counter — its prefix/counter
// must remain byte-identical to the server render it adopts.
let nextClientRootId = 0;

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
	 * Set on a `<ViewTransition>` component's block: the boundary's current
	 * props (docs/view-transitions-plan.md). Null on every other block —
	 * declared everywhere so the shape stays monomorphic; the field gates the
	 * nearest-boundary dirty walk and the unmount unregister.
	 */
	vt: ViewTransitionProps | null;
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
	/** True when the queued render came from a different component's render body. */
	crossRenderUpdate: boolean;
	/** Commit-callback loop guard, scoped to one externally-started update chain. */
	nestedUpdateChain: number;
	nestedUpdateCount: number;
	nestedUpdateError: boolean;
	/**
	 * useEffectEvent updates publish only for the latest render of this block that
	 * completed. Zero means this block has never called useEffectEvent. Keeping the
	 * attempt/completion counters on the block makes aborted-render filtering
	 * allocation-free for components that do not use the hook.
	 */
	effectEventRenderVersion: number;
	effectEventCompletedVersion: number;
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
}

type EffectDepsSnapshot = Map<EffectSlot, any[] | undefined>;

interface PendingEffect {
	scope: Scope;
	slot: HookSlot;
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

// ---------------------------------------------------------------------------
// Current-scope/block stacks
// ---------------------------------------------------------------------------

let CURRENT_SCOPE: Scope | null = null;
let CURRENT_BLOCK: Block | null = null;
interface ActiveWarmPlan {
	block: Block;
	fn: () => void;
}
// Compiler-emitted empty useBatch calls register child-only warm plans on the
// synchronous component render stack. A descendant's first pending batch runs
// the active plans while every ancestor frame (and its current props closure)
// is still live; render entry/exit checkpoints below provide stack discipline.
const ACTIVE_WARM_PLANS: ActiveWarmPlan[] = [];
// Warm entries live for exactly one outer render/suspension episode. A retry
// re-enters with the episode recorded on its block; an ordinary update starts
// a new one so consumed entries cannot suppress warming after prop changes or
// a remount that happens to reuse the same dependency values.
let NEXT_WARM_EPISODE = 1;
let CURRENT_WARM_EPISODE = 0;
const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');
const RENDERER_REGION_DOM_OWNERS = new WeakMap<Block, RendererRegionOwnerBridge>();
const RENDERER_REGION_DOM_BINDINGS = new WeakMap<
	Block,
	{
		bridge: RendererRegionOwnerBridge;
		release: () => void;
	}
>();
const DOM_ROOT_DISPOSERS = new WeakMap<Block, () => void>();
// Public root diagnostics need to distinguish an ordinary imperative unmount
// from one requested by an effect setup/cleanup while commit lifecycle work is active.
// Passive effects may drain outside `inFlush`, so that scheduler flag alone is
// insufficient for the observable root warning.
let EFFECT_BODY_DEPTH = 0;
// Callback refs are commit-phase callbacks too. Track them separately from
// effect callbacks so an attach that repeatedly schedules its owner participates
// in the same bounded nested-update policy without conflating arbitrary commit
// plumbing (notably useSyncExternalStore consistency checks) with user callbacks.
let REF_CALLBACK_DEPTH = 0;
// Store consistency checks are commit-spawned updates as well. Keeping a
// distinct depth lets unstable getSnapshot values share the nested-update guard
// without pretending the store check itself is a user effect or ref callback.
let STORE_SYNC_DEPTH = 0;
// Octane discovers deletion destroys while reconciling a parent, but those
// callbacks are semantically mutation-phase work. Effect Events may be called
// from them even though CURRENT_SCOPE still reflects the eager parent render.
let EFFECT_EVENT_LIFECYCLE_DEPTH = 0;

function runEffectLifecycleCallback(callback: Cleanup): void {
	EFFECT_EVENT_LIFECYCLE_DEPTH++;
	try {
		callback();
	} finally {
		EFFECT_EVENT_LIFECYCLE_DEPTH--;
	}
}

// Layout/passive/insertion cleanups are commit callbacks just like their setup
// bodies. Keep their scheduled updates in the same bounded nested-update chain,
// while leaving runEffectLifecycleCallback's Effect Event permission intact.
function runEffectCleanupCallback(callback: Cleanup): void {
	EFFECT_BODY_DEPTH++;
	try {
		runEffectLifecycleCallback(callback);
	} finally {
		EFFECT_BODY_DEPTH--;
	}
}

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
 * Optional transition-swap capability. Generic component/child/control-flow
 * slots must not reference the concrete off-screen renderer directly: one
 * ordinary `@if` would otherwise retain the complete WIP/Suspense/descriptor
 * graph even when the application has no transition entry point. Every path
 * that can create transition-priority work runs through startTransition(),
 * which installs this driver before raising TRANSITION_DEPTH.
 */
interface TransitionSwapDriver {
	render: typeof renderOffscreen;
	commit: typeof commitOffscreen;
	dispose: typeof disposeWip;
	splice: typeof spliceWipCapture;
}

let TRANSITION_SWAP_DRIVER: TransitionSwapDriver | null = null;

function ensureTransitionSwapDriver(): void {
	TRANSITION_SWAP_DRIVER ??= {
		render: renderOffscreen,
		commit: commitOffscreen,
		dispose: disposeWip,
		splice: spliceWipCapture,
	};
}

interface TransitionActionSlot<T> {
	value: T;
	pendingActionBatch?: TransitionActionBatch;
	pendingActionValue?: T;
}

interface TransitionActionUpdate<T = unknown> {
	slot: TransitionActionSlot<T>;
	block: Block;
	operations: Array<(value: T) => T>;
	baseValue: T;
	value: T;
	forceRender: boolean;
	profileType?: 'state' | 'reducer';
	profileSlot?: HookSlot;
}

interface TransitionActionBatch {
	updates: Map<object, TransitionActionUpdate<any>>;
	pendingActions: number;
	closed: boolean;
	flushed: boolean;
}

/**
 * Ordinary state updates dispatched during the synchronous slice of an async
 * transition Action must not become committed UI before the Action settles.
 * React renders those updates in a transition lane while an urgent render
 * exposes `isPending` against the last committed state. Octane has one live
 * tree, so stage the cells here and promote them together when the returned
 * promise settles. Synchronous transitions flush their batch before returning
 * and therefore keep their existing scheduling behavior.
 *
 * `useOptimistic` deliberately does not use this batch: optimistic values are
 * the explicit in-flight surface and must remain visible while the Action is
 * pending.
 */
let ACTIVE_TRANSITION_ACTION_BATCH: TransitionActionBatch | null = null;
/** The entangled batch shared by explicit transitions while an Action is awaiting. */
let IN_FLIGHT_TRANSITION_ACTION_BATCH: TransitionActionBatch | null = null;
/** Direct updates from discrete handlers stay urgent even while an Action is awaiting. */
let ACTIVE_DISCRETE_EVENT_DEPTH = 0;

function createTransitionActionBatch(): TransitionActionBatch {
	return { updates: new Map(), pendingActions: 0, closed: false, flushed: false };
}

function transitionActionBatchForUpdate(): TransitionActionBatch | null {
	if (ACTIVE_TRANSITION_ACTION_BATCH !== null) return ACTIVE_TRANSITION_ACTION_BATCH;
	// AsyncContext is not available in the browser target, so post-await Action
	// continuations share the one entangled in-flight batch. Explicit urgent
	// surfaces opt out: their updates must commit immediately.
	if (syncFlush || ACTIVE_DISCRETE_EVENT_DEPTH > 0) return null;
	return IN_FLIGHT_TRANSITION_ACTION_BATCH;
}

function rebaseTransitionActionUpdate<T>(update: TransitionActionUpdate<T>): T {
	if (Object.is(update.baseValue, update.slot.value)) return update.value;
	let value = update.slot.value;
	for (const operation of update.operations) value = operation(value);
	update.baseValue = update.slot.value;
	update.value = value;
	if (update.slot.pendingActionBatch !== undefined) update.slot.pendingActionValue = value;
	return value;
}

function stagedTransitionValue<T>(slot: TransitionActionSlot<T>): T {
	const batch = transitionActionBatchForUpdate();
	if (batch === null) return slot.value;
	const update = batch.updates.get(slot) as TransitionActionUpdate<T> | undefined;
	return update === undefined ? slot.value : rebaseTransitionActionUpdate(update);
}

function stageTransitionValue<T>(
	slot: TransitionActionSlot<T>,
	block: Block,
	operation: (value: T) => T,
	value: T,
	forceRender = false,
): boolean {
	const batch = transitionActionBatchForUpdate();
	if (batch === null) return false;
	const current = batch.updates.get(slot) as TransitionActionUpdate<T> | undefined;
	if (current === undefined) {
		batch.updates.set(slot, {
			slot,
			block,
			operations: [operation],
			baseValue: slot.value,
			value,
			forceRender,
		});
	} else {
		current.operations.push(operation);
		current.value = value;
		current.forceRender ||= forceRender;
	}
	slot.pendingActionBatch = batch;
	slot.pendingActionValue = value;
	return true;
}

function flushTransitionActionBatch(batch: TransitionActionBatch): void {
	if (batch.flushed) return;
	batch.flushed = true;
	for (const update of batch.updates.values()) {
		const { slot, block, forceRender } = update;
		const value = rebaseTransitionActionUpdate(update);
		if (slot.pendingActionBatch === batch) {
			slot.pendingActionBatch = undefined;
			slot.pendingActionValue = undefined;
		}
		if (block.disposed) continue;
		const changed = !Object.is(slot.value, value);
		if (!changed && !forceRender) continue;
		if (changed) slot.value = value;
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileSchedule(
				block,
				update.profileType ?? (forceRender ? 'reducer' : 'state'),
				update.profileSlot,
			);
		scheduleRender(block);
	}
	batch.updates.clear();
	if (IN_FLIGHT_TRANSITION_ACTION_BATCH === batch) {
		IN_FLIGHT_TRANSITION_ACTION_BATCH = null;
	}
}

function flushTransitionActionBatchIfReady(batch: TransitionActionBatch): void {
	if (batch.closed && batch.pendingActions === 0) flushTransitionActionBatch(batch);
}
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
// useTransition/useOptimistic listeners are runtime-owned publication work.
// When a transition boundary changes the pending count while another component
// is rendering, their scheduled refreshes must not be diagnosed as userland
// cross-component render updates. Keep this depth scoped to listener invocation;
// startTransition's user callback runs only after tickTransitionCount returns.
let TRANSITION_LISTENER_PUBLISH_DEPTH = 0;

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
const HELD_TRANSITIONS = new Set<TrySlot>();
const STAGED_REVEALS = new Set<TrySlot>();
let flushingStagedReveals = false;
let deferringStagedRevealEffects = false;

// ─────────────────────────────────────────────────────────────────────────────
// View Transitions (docs/view-transitions-plan.md, Phase 1).
//
// Octane renders AND mutates in one eager walk (flush → drainQueue) — there is
// no separate mutation-commit phase to wrap. So when a transition-lane flush
// may involve a `<ViewTransition>` boundary, the WHOLE drain runs inside
// `document.startViewTransition`'s update callback: the browser snapshots the
// old state first, our render+mutate work happens inside the callback, and the
// browser animates old→new. INTENTIONAL DIVERGENCE from React (which renders
// concurrently BEFORE the snapshot and wraps only its commit phase): the
// snapshot-hold window includes octane's render pass. Do not "fix" this by
// inventing a staged-mutation reconciler mode.
//
// Activation model (resolved at the end of the wrapped drain):
//   enter  — a boundary block REGISTERED during the drain (subtree inserted).
//   exit   — a pre-drain boundary block DISPOSED by the drain (subtree removed).
//   update — a surviving boundary that was dirtied by a tracked mutation
//            (setText under the boundary) or whose first element's rect moved.
// Names: every pre-drain boundary is pre-named before the snapshot (a superset
// of React's "affected only" naming — an unaffected named pair snapshots into
// an identical old/new image, which is visually inert), entered boundaries are
// named inside the callback (they exist only in the new capture), and all
// names revert once the transition's `ready` promise settles.
//
// Zero-cost guard: generic scheduler/render paths see only the nullable
// `VIEW_TRANSITION_DRIVER`. The concrete implementation is installed by the
// compiler's module hint, the first boundary render, or the public
// addTransitionType entry point. Apps that never retain any of those APIs
// tree-shake the implementation while keeping one cheap null branch at each
// integration point.

/** Animation class value: a class string, 'auto', 'none', or a per-type map. */
type ViewTransitionClassValue = string | Record<string, string>;

export interface ViewTransitionProps {
	name?: string;
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

/**
 * Animation handle for one of a boundary's view-transition pseudo-elements —
 * the objects on {@link ViewTransitionInstance}. `animate()`/`getAnimations()`
 * target the pseudo-element via the Web Animations `pseudoElement` option on
 * the document element (React's ViewTransitionPseudoElement shape).
 */
export class ViewTransitionPseudoElement {
	/** The pseudo-element selector, e.g. `::view-transition-new(hero)`. */
	readonly selector: string;
	constructor(pseudo: string, name: string) {
		this.selector = '::view-transition-' + pseudo + '(' + name + ')';
	}
	animate(
		keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
		options?: number | KeyframeAnimationOptions,
	): Animation {
		const opts: KeyframeAnimationOptions =
			typeof options === 'number' ? { duration: options } : { ...(options ?? {}) };
		(opts as { pseudoElement?: string }).pseudoElement = this.selector;
		return document.documentElement.animate(keyframes, opts);
	}
	getAnimations(): Animation[] {
		const all = document.documentElement.getAnimations?.() ?? [];
		const out: Animation[] = [];
		for (const a of all) {
			const effect = a.effect as { pseudoElement?: string } | null;
			if (effect !== null && effect.pseudoElement === this.selector) out.push(a);
		}
		return out;
	}
}

/**
 * The instance handed to on* callbacks: the resolved view-transition-name plus
 * `.animate()`-capable handles for the boundary's four pseudo-elements.
 */
export interface ViewTransitionInstance {
	name: string;
	group: ViewTransitionPseudoElement;
	imagePair: ViewTransitionPseudoElement;
	old: ViewTransitionPseudoElement;
	new: ViewTransitionPseudoElement;
}

interface VTHandle {
	ready: Promise<void>;
	finished: Promise<void>;
	skipTransition: () => void;
}
type VTDocument = Document & {
	startViewTransition?: (update: () => void) => VTHandle;
};

/** One tracked boundary for the current wrapped flush. */
interface VtRec {
	block: Block;
	els: Element[];
	rect: { x: number; y: number; width: number; height: number } | null;
	name: string;
	/** The view-transition-class currently applied to els ('' = none applied). */
	cls: string;
}
type VtActivationKind = 'enter' | 'exit' | 'update' | 'share' | 'parent-enter' | 'parent-exit';

/**
 * Capability table between the generic runtime and the optional ViewTransition
 * implementation. Keep concrete VT globals/functions behind this boundary:
 * otherwise one scheduler branch retains the complete animation graph in every
 * client bundle.
 */
interface ViewTransitionDriver {
	addType(type: string): void;
	routeFlush(): boolean;
	shouldClearTypesAfterFlush(): boolean;
	clearTypes(): void;
	interrupt(): void;
	deferPassives(): boolean;
	wouldWrap(): boolean;
	wrapResume(work: () => void): boolean;
	unregister(block: Block): void;
	markDirty(): void;
	queueAllTransition(): boolean;
	renderBoundary(block: Block, props: ViewTransitionProps): void;
}

let VIEW_TRANSITION_DRIVER: ViewTransitionDriver | null = null;
/** Mounted boundary blocks; pruned lazily (disposed) + on unmount. */
const VT_REGISTRY = /* @__PURE__ */ new Set<Block>();
/** Boundary blocks registered during the CURRENT wrapped drain (→ enter). */
let VT_ENTERED: Block[] = [];
/** Boundaries dirtied by tracked mutations during the current wrapped drain. */
const VT_DIRTY = /* @__PURE__ */ new Set<Block>();
/** True while the wrapped drain (the update callback's flushWork) runs. */
let VT_DRAIN = false;
/** Controller state: idle → pending (update not yet run) → animating. */
const VT_IDLE = 0,
	VT_PENDING_UPDATE = 1,
	VT_ANIMATING = 2;
let VT_STATE: 0 | 1 | 2 = VT_IDLE;
let VT_HANDLE: VTHandle | null = null;
let VT_NAME_SEQ = 0;
/** A scheduled passive drain deferred until the transition's `finished`. */
let VT_PASSIVES_HELD = false;
/** Per-boundary callback cleanups (returned by on*), run before the next fire. */
const VT_CLEANUPS = /* @__PURE__ */ new WeakMap<Block, () => void>();
/**
 * Transition types staged by addTransitionType() for the CURRENT transition
 * batch — captured (and reset) by the flush that commits the batch, whether
 * wrapped (vtFlush hands them to class resolution + callbacks) or not.
 */
let VT_PENDING_TYPES: string[] = [];

/**
 * React's `addTransitionType` (experimental `unstable_addTransitionType`):
 * tags the current transition with a type. ViewTransition class props given as
 * per-type maps resolve against the batch's types, and the types array reaches
 * every on* callback. Types reset when the batch commits.
 */
export function addTransitionType(type: string): void {
	ensureViewTransitionDriver().addType(type);
}

/**
 * Compiler module-load hint: emitted once per client module that imports
 * ViewTransition from 'octane', so the very first transition flush that MOUNTS
 * a boundary is already wrapped (the runtime otherwise learns "this app uses
 * VT" only mid-drain — too late to have snapshotted). Semi-public (tier 2).
 */
export function __vtSeen(): void {
	ensureViewTransitionDriver();
}

/** Nearest enclosing ViewTransition boundary of the currently rendering block. */
function vtMarkDirtyFromCurrentBlock(): void {
	for (let b: Block | null = CURRENT_BLOCK; b !== null; b = b.parentBlock) {
		if (b.vt !== null) {
			// Innermost boundary only (React's rule) — stop at the first hit.
			if (!b.disposed) VT_DIRTY.add(b);
			return;
		}
	}
}

/** Top-level ELEMENT nodes of a boundary block's DOM range. */
function vtRangeElements(block: Block): Element[] {
	const els: Element[] = [];
	if (block.startMarker !== null && block.endMarker !== null) {
		for (let n = block.startMarker.nextSibling; n !== null && n !== block.endMarker; ) {
			if (n.nodeType === 1) els.push(n as Element);
			n = n.nextSibling;
		}
	} else {
		// Whole-container regime (root / owns-parent): every element child.
		const kids = (block.parentNode as Element).children;
		for (let i = 0; i < kids.length; i++) els.push(kids[i]);
	}
	return els;
}

/**
 * Resolve a class-prop value for one activation kind against the batch's
 * transition types: `'auto'` (browser default), `'none'` (deactivate), a class
 * string, or a per-type map (`{ 'nav-back': 'slide-right', default: 'auto' }`
 * — first matching type wins, then the map's `default`, then `'auto'`).
 * A missing kind prop falls back to the boundary's `default` prop.
 */
function vtResolveClass(
	props: ViewTransitionProps | null,
	kind: VtActivationKind,
	types: string[],
): string {
	if (props === null) return 'auto';
	let v =
		kind === 'enter'
			? props.enter
			: kind === 'exit'
				? props.exit
				: kind === 'update'
					? props.update
					: kind === 'share'
						? props.share
						: kind === 'parent-enter'
							? props.parentEnter
							: props.parentExit;
	if (v == null) v = props.default;
	if (v == null) return 'auto';
	if (typeof v === 'string') return v;
	for (const t of types) {
		const hit = v[t];
		if (hit != null) return hit;
	}
	return v.default != null ? v.default : 'auto';
}

/**
 * Pre-drain class resolution for an ALREADY-MOUNTED boundary, before its fate
 * (exit / update / share) is known — React resolves per-kind because it
 * renders first; octane picks the boundary's most specific declared intent:
 * share (named boundaries pair by name and share wins over exit) → exit →
 * update → default. Also the "fully inert" gate: a boundary whose exit,
 * update, AND share all resolve 'none' can't animate this flush at all, so it
 * is not pre-named (the correct suppression — a name in the old capture
 * would animate regardless).
 */
function vtPreClass(props: ViewTransitionProps | null, types: string[]): string {
	if (props === null) return 'auto';
	if (props.share != null && typeof props.name === 'string')
		return vtResolveClass(props, 'share', types);
	if (props.exit != null) return vtResolveClass(props, 'exit', types);
	if (props.parentExit != null) return vtResolveClass(props, 'parent-exit', types);
	if (props.update != null) return vtResolveClass(props, 'update', types);
	return vtResolveClass(props, 'update', types); // → default chain
}

function vtAllNone(props: ViewTransitionProps | null, types: string[]): boolean {
	return (
		vtResolveClass(props, 'exit', types) === 'none' &&
		vtResolveClass(props, 'update', types) === 'none' &&
		vtResolveClass(props, 'share', types) === 'none' &&
		(!vtRelayParticipates(props, 'parent-exit') ||
			vtResolveClass(props, 'parent-exit', types) === 'none')
	);
}

/** Does a boundary opt into the parent enter/exit relay (class prop or handler)? */
function vtRelayParticipates(
	props: ViewTransitionProps | null,
	kind: 'parent-enter' | 'parent-exit',
): boolean {
	if (props === null) return false;
	return kind === 'parent-exit'
		? props.parentExit != null || typeof props.onParentExit === 'function'
		: props.parentEnter != null || typeof props.onParentEnter === 'function';
}

/**
 * The OUTERMOST boundary of the entered/removed unit containing `b`, or null
 * when `b` IS the outermost or a strict intermediate breaks the relay chain
 * (doesn't participate, or its relay class resolves 'none'). Plain DOM/blocks
 * between boundaries never break the chain — only boundaries do.
 */
function vtRelayOutermost(
	b: Block,
	kind: 'parent-enter' | 'parent-exit',
	inUnit: (x: Block) => boolean,
	types: string[],
): Block | null {
	let outer = vtNearestBoundaryAncestor(b);
	if (outer === null || !inUnit(outer)) return null; // b is the unit's outermost
	while (true) {
		const up = vtNearestBoundaryAncestor(outer);
		if (up === null || !inUnit(up)) return outer;
		// `outer` is a strict intermediate — it must relay through.
		if (!vtRelayParticipates(outer.vt, kind) || vtResolveClass(outer.vt, kind, types) === 'none') {
			return null;
		}
		outer = up;
	}
}

/**
 * Assign the boundary's view-transition-name (+ view-transition-class when the
 * resolved class is a real class string) to its top-level elements.
 */
function vtApplyStyles(rec: VtRec, cls: string): void {
	const props = rec.block.vt;
	if (rec.name === '') {
		rec.name =
			props !== null && typeof props.name === 'string' ? props.name : '‹vt' + ++VT_NAME_SEQ + '›';
	}
	rec.cls = cls === 'auto' || cls === 'none' ? '' : cls;
	for (let i = 0; i < rec.els.length; i++) {
		// Multiple top-level children: suffix to keep names unique (React rule).
		const n = i === 0 ? rec.name : rec.name + '-' + i;
		const style = (rec.els[i] as HTMLElement).style;
		if (style === undefined) continue;
		style.setProperty('view-transition-name', n);
		if (rec.cls !== '') style.setProperty('view-transition-class', rec.cls);
	}
}

function vtRevertNames(recs: VtRec[]): void {
	for (const rec of recs) {
		for (const el of rec.els) {
			const style = (el as HTMLElement).style;
			if (style === undefined) continue;
			style.removeProperty('view-transition-name');
			if (rec.cls !== '') style.removeProperty('view-transition-class');
		}
	}
}

/** Does a rect intersect the viewport? (Share pairs decay when either side is off-screen.) */
function vtInViewport(rect: { x: number; y: number; width: number; height: number }): boolean {
	if (typeof window === 'undefined') return true;
	const iw = window.innerWidth,
		ih = window.innerHeight;
	return rect.x < iw && rect.y < ih && rect.x + rect.width > 0 && rect.y + rect.height > 0;
}

/** The nearest ANCESTOR ViewTransition boundary of a boundary block. */
function vtNearestBoundaryAncestor(b: Block): Block | null {
	for (let p = b.parentBlock; p !== null; p = p.parentBlock) {
		if (p.vt !== null) return p;
	}
	return null;
}

/** Did a boundary's top-level element list change across the drain? */
function vtElsChanged(before: Element[], after: Element[]): boolean {
	if (before.length !== after.length) return true;
	for (let i = 0; i < before.length; i++) {
		if (before[i] !== after[i]) return true;
	}
	return false;
}

function vtRectChanged(rec: VtRec): boolean {
	if (rec.rect === null || rec.els.length === 0) return false;
	const el = rec.els[0];
	if (typeof el.getBoundingClientRect !== 'function') return false;
	const r = el.getBoundingClientRect();
	return (
		r.x !== rec.rect.x ||
		r.y !== rec.rect.y ||
		r.width !== rec.rect.width ||
		r.height !== rec.rect.height
	);
}

/** Fire a boundary's activation callback (after the transition's `ready`). */
function vtFireCallback(kind: VtActivationKind, rec: VtRec, types: string[]): void {
	const props = rec.block.vt;
	if (props === null) return;
	const cb =
		kind === 'enter'
			? props.onEnter
			: kind === 'exit'
				? props.onExit
				: kind === 'update'
					? props.onUpdate
					: kind === 'share'
						? props.onShare
						: kind === 'parent-enter'
							? props.onParentEnter
							: props.onParentExit;
	if (typeof cb !== 'function') return;
	const prevCleanup = VT_CLEANUPS.get(rec.block);
	if (prevCleanup !== undefined) {
		VT_CLEANUPS.delete(rec.block);
		try {
			prevCleanup();
		} catch (err) {
			console.error(err);
		}
	}
	const instance: ViewTransitionInstance = {
		name: rec.name,
		group: new ViewTransitionPseudoElement('group', rec.name),
		imagePair: new ViewTransitionPseudoElement('image-pair', rec.name),
		old: new ViewTransitionPseudoElement('old', rec.name),
		new: new ViewTransitionPseudoElement('new', rec.name),
	};
	try {
		const cleanup = cb(instance, types);
		if (typeof cleanup === 'function') VT_CLEANUPS.set(rec.block, cleanup);
	} catch (err) {
		console.error(err);
	}
}

/** Is every queued block scheduled at transition priority? (Empty → false.) */
function queueAllTransition(): boolean {
	if (QUEUE.length === 0) return false;
	for (let i = 0; i < QUEUE.length; i++) {
		if (QUEUE[i].pendingMode !== 'transition') return false;
	}
	return true;
}

/**
 * Would the next drain be routed through document.startViewTransition?
 * Shared by flush() and act()'s synchronous drain loop (which otherwise
 * drains via flushSync — the urgent path that deliberately skips wrapping).
 */
function vtWouldWrap(): boolean {
	return (
		VT_STATE === VT_IDLE &&
		activeHydration() === null &&
		queueAllTransition() &&
		typeof document !== 'undefined' &&
		(document as VTDocument).startViewTransition !== undefined
	);
}

/**
 * Same question for a Suspense reveal commit (commitResume /
 * flushStagedReveals — they run OUTSIDE the flush, in thenable microtasks).
 * The driver is installed at module load by the compiler hint, so the
 * pre-snapshot can run even when the reveal itself mounts the app's first
 * boundary. A direct runtime consumer falls back to installation on first
 * boundary render, matching the pre-capability behavior.
 */
function vtWouldWrapResume(): boolean {
	return (
		VT_STATE === VT_IDLE &&
		activeHydration() === null &&
		!inFlush &&
		!VT_DRAIN &&
		typeof document !== 'undefined' &&
		(document as VTDocument).startViewTransition !== undefined
	);
}

/** Install the concrete driver only when a ViewTransition-facing API survives. */
function ensureViewTransitionDriver(): ViewTransitionDriver {
	if (VIEW_TRANSITION_DRIVER !== null) return VIEW_TRANSITION_DRIVER;
	const driver: ViewTransitionDriver = {
		addType(type) {
			if (VT_PENDING_TYPES.indexOf(type) === -1) VT_PENDING_TYPES.push(type);
		},
		routeFlush() {
			if (VT_STATE !== VT_IDLE) {
				// Transition work waits for the active update/animation; urgent work
				// interrupts and falls through to the ordinary flush.
				if (queueAllTransition()) return true;
				if (QUEUE.length > 0 && VT_HANDLE !== null) VT_HANDLE.skipTransition();
				return false;
			}
			if (!vtWouldWrap()) return false;
			vtFlush();
			return true;
		},
		shouldClearTypesAfterFlush() {
			if (VT_PENDING_TYPES.length === 0) return false;
			for (let i = 0; i < QUEUE.length; i++) {
				if (QUEUE[i].pendingMode === 'transition') return true;
			}
			return false;
		},
		clearTypes() {
			VT_PENDING_TYPES = [];
		},
		interrupt() {
			if (VT_STATE !== VT_IDLE && VT_HANDLE !== null) VT_HANDLE.skipTransition();
		},
		deferPassives() {
			if (VT_STATE !== VT_ANIMATING) return false;
			VT_PASSIVES_HELD = true;
			return true;
		},
		wouldWrap: vtWouldWrap,
		wrapResume(work) {
			if (!vtWouldWrapResume()) return false;
			vtFlush(work);
			return true;
		},
		unregister(block) {
			if (block.vt !== null) VT_REGISTRY.delete(block);
		},
		markDirty() {
			if (VT_DRAIN) vtMarkDirtyFromCurrentBlock();
		},
		queueAllTransition,
		renderBoundary(block, props) {
			if (block.vt === null) {
				// Registration during a wrapped drain is an enter activation; otherwise
				// the block simply joins the mounted-boundary registry.
				block.vt = props;
				VT_REGISTRY.add(block);
				if (VT_DRAIN) VT_ENTERED.push(block);
			} else {
				block.vt = props;
			}
		},
	};
	VIEW_TRANSITION_DRIVER = driver;
	return driver;
}

function tickTransitionCount(delta: number): void {
	TRANSITION_PENDING_COUNT += delta;
	if (TRANSITION_PENDING_COUNT < 0) TRANSITION_PENDING_COUNT = 0;
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

const INSERTION = 0,
	LAYOUT = 1,
	PASSIVE = 2;
type Phase = 0 | 1 | 2;

const effectQueues: [PendingEffect[], PendingEffect[], PendingEffect[]] = [[], [], []];
// useEffectEvent callback bodies are render output: updates become observable at
// commit, before insertion/layout effects, and are discarded with an aborted
// render. The wrapper returned by the hook is deliberately fresh each render;
// every wrapper closes over the same committed cell.
const effectEventQueue: PendingEffectEvent[] = [];
// Commit actions that must run after the callback bodies above publish. Activity
// uses this for visible→hidden deactivation+DOM hiding so its cleanup sees the
// fresh body while the range is still connected. Actions share the render/WIP
// transaction below, so an aborted enclosing render drops them.
const effectEventCommitActions: Array<() => void> = [];
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
	/** Owning block — drainStoreSyncs skips disposed/hidden blocks like the effect drains. */
	block: Block;
	/** True while this inst sits in the sync queue — prevents a second push when a
	 *  block renders twice before its single commit (last render's `pending` wins). */
	queued: boolean;
}

// Pending store-syncs to reconcile at the next commit (drained in commitEffects
// after runLayoutEffects). Populated at RENDER time, so — like effects — pushes
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

interface SuspenseRefEntry {
	ref: any;
	el: Element | FragmentInstance;
	/** Owning scope preserves child-before-parent commit ordering and error routing. */
	scope: Scope;
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
	events: PendingEffectEvent[];
	eventActions: Array<() => void>;
	refs: RefAttach[];
	// uSES store-syncs enqueued during this off-screen render (see storeSyncQueue).
	// Spliced into the live queue on commit, dropped on dispose — a WIP that never
	// lands must not mutate a committed inst (its inst is fresh anyway, per the
	// fresh-block render, so dropping is both correct and cheap).
	stores: StoreInst<any>[];
}
let WIP_CAPTURE: OffscreenCapture | null = null;

function createOffscreenCapture(): OffscreenCapture {
	return {
		effects: [[], [], []],
		events: [],
		eventActions: [],
		refs: [],
		stores: [],
	};
}

// Active append targets for Effect Event render output. renderBlockInner takes
// length checkpoints and truncates on throw, so a later sibling suspension rolls
// back every completed descendant without allocating a transaction object/array
// for the overwhelmingly common no-Effect-Event render. renderOffscreen swaps
// these targets to its existing WIP capture.
let EFFECT_EVENT_RENDER_TARGET = effectEventQueue;
let EFFECT_EVENT_ACTION_TARGET = effectEventCommitActions;

// A subtree rendered off-screen by `renderOffscreen` (its DOM sits between owned
// `start`/`end` markers, outside the committed slot range, with its effects captured).
interface OffscreenWip {
	block: Block;
	start: Comment;
	end: Comment;
	capture: OffscreenCapture;
	domParent: Node;
	/** Discarded WIPs must not publish detaches for refs whose attach never committed. */
	refDetachCheckpoint: number;
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

const NESTED_UPDATE_LIMIT = 50;
const ACT_DRAIN_LIMIT = NESTED_UPDATE_LIMIT + 50;
let UPDATE_CHAIN_ID = 0;

function inNestedUpdateCallback(): boolean {
	return EFFECT_BODY_DEPTH > 0 || REF_CALLBACK_DEPTH > 0 || STORE_SYNC_DEPTH > 0;
}

class MaximumUpdateDepthError extends Error {}

function maximumUpdateDepthError(): Error {
	return new MaximumUpdateDepthError(
		'Maximum update depth exceeded. Octane limits the number of nested updates to prevent infinite loops.',
	);
}

let CROSS_RENDER_WARNINGS: WeakMap<ComponentBody, WeakSet<ComponentBody>> | null = null;

function componentName(block: Block): string {
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

function warnCrossComponentRenderUpdate(target: Block, source: Block): void {
	if (process.env.NODE_ENV === 'production') return;
	const warnings = (CROSS_RENDER_WARNINGS ??= new WeakMap());
	let sources = warnings.get(target.body);
	if (sources === undefined) warnings.set(target.body, (sources = new WeakSet()));
	if (sources.has(source.body)) return;
	sources.add(source.body);
	console.error(
		`Cannot update a component (\`${componentName(target)}\`) while rendering a different component ` +
			`(\`${componentName(source)}\`). Move the update out of the rendering component body.`,
	);
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
	const renderPhaseOther =
		CURRENT_BLOCK !== null && !renderPhaseSelf && TRANSITION_LISTENER_PUBLISH_DEPTH === 0;
	if (renderPhaseOther) {
		block.crossRenderUpdate = true;
		warnCrossComponentRenderUpdate(block, CURRENT_BLOCK!);
	}
	const mode: 'urgent' | 'transition' =
		TRANSITION_DEPTH > 0 ||
		(renderPhaseSelf && block.currentRenderMode === 'transition') ||
		(!syncFlush && ACTIVE_DISCRETE_EVENT_DEPTH === 0 && ASYNC_TRANSITION_COUNT > 0)
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
	if (inNestedUpdateCallback()) {
		if (block.nestedUpdateChain !== UPDATE_CHAIN_ID) {
			block.nestedUpdateChain = UPDATE_CHAIN_ID;
			block.nestedUpdateCount = 0;
		}
		if (++block.nestedUpdateCount > NESTED_UPDATE_LIMIT) block.nestedUpdateError = true;
	} else if (CURRENT_BLOCK === null) {
		// A user/root update starts a new chain. This prevents fifty unrelated
		// events, roots, or wide-batch members from sharing the recursion budget
		// while preserving the count across scheduler drains for callback-scheduled
		// work. Updates scheduled while rendering inherit the active chain: otherwise an
		// effect -> render-phase update -> effect cycle could reset its budget on
		// every pass. Pure render-phase loops retain the separate drain guard below.
		UPDATE_CHAIN_ID++;
		block.nestedUpdateChain = UPDATE_CHAIN_ID;
		block.nestedUpdateCount = 0;
		block.nestedUpdateError = false;
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
 */
function drainHydrationRenderPhaseUpdates(root: Block): void {
	let renders: Map<Block, number> | null = null;
	for (;;) {
		let index = -1;
		for (let i = 0; i < QUEUE.length; i++) {
			if (belongsToBlockTree(QUEUE[i], root)) {
				index = i;
				break;
			}
		}
		if (index === -1) return;
		const block = QUEUE.splice(index, 1)[0];
		if (!block.pending || block.disposed) continue;

		const seen = (renders ??= new Map()).get(block) ?? 0;
		if (seen >= RENDER_PHASE_UPDATE_LIMIT) {
			throw new Error(
				'Too many re-renders. Octane limits the number of renders to prevent an infinite loop.',
			);
		}
		renders.set(block, seen + 1);
		block.crossRenderUpdate = false;
		try {
			renderBlock(block);
		} catch (error) {
			handleRenderError(block, error);
		}
	}
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
		// A max-depth flag is not redundant work, however: it must still surface
		// after an ancestor coalesces the flagged child's pending render.
		if (!block.pending && !block.nestedUpdateError) continue;
		block.pending = false;
		if (block.disposed) {
			block.nestedUpdateError = false;
			continue;
		}
		const crossRenderUpdate = block.crossRenderUpdate;
		block.crossRenderUpdate = false;
		try {
			if (block.nestedUpdateError) {
				block.nestedUpdateError = false;
				throw maximumUpdateDepthError();
			}
			// An update to a block inside a SUSPENSE-HIDDEN subtree (its boundary's
			// try content is soft-detached into savedDom while the fallback shows):
			// don't render it in place — its geometry is detached, and a fresh mount
			// inside it would insert against dismembered parents. Instead re-attempt
			// the WHOLE boundary. React parity: setState on a suspended component
			// retries the render; if it no longer suspends (an external store flipped
			// before the suspending promise resolved), the boundary reveals now.
			const hiddenTry = findSuspenseHiddenTry(block);
			if (hiddenTry !== null) {
				attemptHiddenReveal(hiddenTry, block.pendingMode ?? 'urgent');
				continue;
			}
			// Guarded render-phase updates (derived state) converge in a couple of
			// passes; an unguarded one re-queues its own block forever. Cap per-block
			// renders within one drain so the loop throws (catchable by @try /
			// ErrorBoundary, like React's equivalent) instead of hanging.
			if (block.drainStamp === drainId) {
				if (++block.drainRenders > RENDER_PHASE_UPDATE_LIMIT) {
					throw crossRenderUpdate
						? maximumUpdateDepthError()
						: new Error(
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
	// The optional driver owns all concrete ViewTransition state/implementation.
	// A client that never retains the feature sees only this null check.
	if (VIEW_TRANSITION_DRIVER?.routeFlush() === true) return;
	flushWork();
}

/**
 * The flush body proper — render+mutate drain plus the effect commit. Shared
 * verbatim by the plain flush() path and the view-transition update callback
 * (vtFlush), so both drain with identical semantics.
 */
function flushWork(): void {
	inFlush = true;
	// addTransitionType types belong to the transition batch this drain commits:
	// an UNWRAPPED drain (no boundary, no startViewTransition, flushSync) that
	// contains transition work consumes them too — they must not leak into a
	// later, unrelated wrapped flush. (vtFlush captures them before its update
	// callback runs flushWork, so the wrapped path never reaches this.)
	const viewTransitionDriver = VIEW_TRANSITION_DRIVER;
	const clearViewTransitionTypes = viewTransitionDriver?.shouldClearTypesAfterFlush() === true;
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
		if (clearViewTransitionTypes) viewTransitionDriver!.clearTypes();
	}
}

/**
 * A transition-lane flush routed through `document.startViewTransition` —
 * see the View Transitions block above for the full model. The browser
 * snapshots the current state, the whole drain runs inside the update
 * callback, activations resolve from what the drain did, and callbacks fire
 * once the transition is `ready`. When the drain turns out to touch no
 * boundary, the transition is skipped (mutations still applied, no animation).
 */
function vtFlush(work: () => void = flushWork): void {
	// The batch's transition types (addTransitionType) — captured for class
	// resolution + callbacks, reset for the next batch.
	const types = VT_PENDING_TYPES;
	VT_PENDING_TYPES = [];
	// Pre-drain: collect live boundaries, pre-name them (the OLD capture must
	// see the names — exits/updates/share animate from these snapshots), and
	// measure rects for update detection. A boundary whose exit/update/share
	// classes ALL resolve 'none' is left unnamed — the correct deactivation
	// (a name in the old capture animates regardless).
	const recs: VtRec[] = [];
	for (const b of VT_REGISTRY) {
		if (b.disposed) {
			VT_REGISTRY.delete(b);
			continue;
		}
		if (vtAllNone(b.vt, types)) continue;
		const els = vtRangeElements(b);
		const rec: VtRec = { block: b, els, rect: null, name: '', cls: '' };
		if (els.length > 0 && typeof els[0].getBoundingClientRect === 'function') {
			const r = els[0].getBoundingClientRect();
			rec.rect = { x: r.x, y: r.y, width: r.width, height: r.height };
		}
		// Kind is unknown pre-drain — apply the boundary's most specific declared
		// intent (see vtPreClass); enter boundaries resolve exactly, post-drain.
		vtApplyStyles(rec, vtPreClass(b.vt, types));
		recs.push(rec);
	}
	VT_ENTERED = [];
	VT_DIRTY.clear();
	VT_STATE = VT_PENDING_UPDATE;
	VT_HANDLE = null;
	let acts: Array<{ kind: VtActivationKind; rec: VtRec }> = [];
	let skipRequested = false;
	const update = (): void => {
		VT_DRAIN = true;
		let pendingError: { err: any } | null = null;
		try {
			work();
		} catch (err) {
			pendingError = { err };
		} finally {
			VT_DRAIN = false;
		}
		// Resolve activations from what the drain did.
		const exits: VtRec[] = [];
		for (const rec of recs) {
			if (rec.block.disposed) {
				exits.push(rec);
			} else {
				// The drain may have replaced the boundary's elements — re-enumerate
				// and re-assert the SAME name so the new capture pairs with the old.
				const before = rec.els;
				rec.els = vtRangeElements(rec.block);
				const changed = VT_DIRTY.has(rec.block) || vtRectChanged(rec);
				vtApplyStyles(rec, rec.cls === '' ? 'auto' : rec.cls);
				if (
					(changed || vtElsChanged(before, rec.els)) &&
					vtResolveClass(rec.block.vt, 'update', types) !== 'none'
				) {
					acts.push({ kind: 'update', rec });
				}
			}
		}
		// Entered boundaries: named post-drain (they exist only in the NEW
		// capture). Collected before share pairing so exits can find them.
		// A boundary whose nearest ANCESTOR boundary also entered this drain is
		// part of a subtree inserted as ONE unit — only the outermost animates
		// (React's rule); nested ones stay silent unless they opt into the
		// parent-enter relay (resolved after share pairing below).
		const enteredSet = new Set(VT_ENTERED);
		const enters: VtRec[] = [];
		const nestedEntered: Block[] = [];
		for (const b of VT_ENTERED) {
			if (b.disposed) continue;
			const anc = vtNearestBoundaryAncestor(b);
			if (anc !== null && enteredSet.has(anc)) {
				nestedEntered.push(b);
				continue;
			}
			const rec: VtRec = { block: b, els: vtRangeElements(b), rect: null, name: '', cls: '' };
			const cls = vtResolveClass(b.vt, 'enter', types);
			// An explicit name always applies (it may pair a share); an unnamed
			// 'none' enter is fully inert — skip naming and activation.
			if (cls !== 'none' || typeof b.vt?.name === 'string') vtApplyStyles(rec, cls);
			recs.push(rec);
			enters.push(rec);
			if (cls !== 'none') acts.push({ kind: 'enter', rec });
		}
		// Shared-element pairing: an exiting NAMED boundary whose name also
		// appears on an entering boundary in the same commit shares — one
		// activation, fired on the EXITING side (its onExit and the entering
		// side's onEnter are suppressed). Both sides must be in-viewport or the
		// pair decays to separate exit/enter (React's rule).
		const sharedBlocks = new Set<Block>();
		for (const exitRec of exits) {
			const nm = exitRec.block.vt !== null ? exitRec.block.vt.name : undefined;
			let paired: VtRec | null = null;
			if (typeof nm === 'string') {
				for (const enterRec of enters) {
					if (enterRec.block.vt !== null && enterRec.block.vt.name === nm) {
						paired = enterRec;
						break;
					}
				}
			}
			if (paired !== null) {
				const exitVisible = exitRec.rect === null || vtInViewport(exitRec.rect);
				let enterVisible = true;
				if (paired.els.length > 0 && typeof paired.els[0].getBoundingClientRect === 'function') {
					const r = paired.els[0].getBoundingClientRect();
					enterVisible = vtInViewport({ x: r.x, y: r.y, width: r.width, height: r.height });
				}
				if (exitVisible && enterVisible) {
					sharedBlocks.add(exitRec.block);
					sharedBlocks.add(paired.block);
					if (vtResolveClass(exitRec.block.vt, 'share', types) !== 'none') {
						acts.push({ kind: 'share', rec: exitRec });
					}
					// Suppress the entering side's own enter activation.
					for (let i = 0; i < acts.length; i++) {
						if (acts[i].rec === paired && acts[i].kind === 'enter') {
							acts.splice(i, 1);
							break;
						}
					}
					continue;
				}
			}
			// Subtree removed as ONE unit: a nested boundary whose nearest ancestor
			// boundary was also disposed this drain stays silent — only the
			// outermost fires (React's rule). Share pairing above still gets first
			// claim (a named nested boundary may pair out of a removed unit).
			const anc = vtNearestBoundaryAncestor(exitRec.block);
			if (anc !== null && anc.disposed) continue;
			if (vtResolveClass(exitRec.block.vt, 'exit', types) !== 'none') {
				acts.push({ kind: 'exit', rec: exitRec });
			}
		}
		// Parent enter/exit relays (React's enableViewTransitionParentEnterExit):
		// a nested boundary inside a unit that exited/entered as a whole
		// activates its parentExit/parentEnter when the chain up to the unit's
		// outermost boundary relays (vtRelayOutermost) and that outermost
		// genuinely exits/enters — not 'none', not consumed by a share pair.
		for (const rec of exits) {
			const vt = rec.block.vt;
			if (!vtRelayParticipates(vt, 'parent-exit')) continue;
			// A boundary consumed by a share pair never also parent-relays.
			if (sharedBlocks.has(rec.block)) continue;
			const outer = vtRelayOutermost(rec.block, 'parent-exit', (x) => x.disposed, types);
			if (outer === null || sharedBlocks.has(outer)) continue;
			if (vtResolveClass(outer.vt, 'exit', types) === 'none') continue;
			const cls = vtResolveClass(vt, 'parent-exit', types);
			if (cls === 'none') continue;
			acts.push({ kind: 'parent-exit', rec });
		}
		for (const b of nestedEntered) {
			if (!vtRelayParticipates(b.vt, 'parent-enter')) continue;
			const outer = vtRelayOutermost(b, 'parent-enter', (x) => enteredSet.has(x), types);
			if (outer === null || sharedBlocks.has(outer)) continue;
			if (vtResolveClass(outer.vt, 'enter', types) === 'none') continue;
			const cls = vtResolveClass(b.vt, 'parent-enter', types);
			if (cls === 'none') continue;
			const rec: VtRec = { block: b, els: vtRangeElements(b), rect: null, name: '', cls: '' };
			vtApplyStyles(rec, cls);
			recs.push(rec);
			acts.push({ kind: 'parent-enter', rec });
		}
		VT_STATE = VT_ANIMATING;
		if (acts.length === 0) {
			skipRequested = true;
			// Native browsers run `update` asynchronously, after startViewTransition
			// has returned its handle. The synchronous conformance mock reaches the
			// post-call check below instead; together the two paths skip exactly once.
			if (VT_HANDLE !== null) VT_HANDLE.skipTransition();
		}
		// Surface a drain error through the caller (mock/sync path) or the
		// transition's rejection (real async path — see finished.catch below).
		if (pendingError !== null) throw pendingError.err;
	};
	let vt: VTHandle;
	try {
		// Use the Level 1 callback overload. Octane's transition types resolve its
		// own boundary classes and are not forwarded in the native options bag, so
		// the newer overload buys us nothing and would exclude older Safari builds.
		vt = (document as VTDocument).startViewTransition!(update);
	} catch (err) {
		// Synchronous-update path (the conformance mock): the drain threw inside
		// startViewTransition. Clean up and surface to the flush caller.
		VT_STATE = VT_IDLE;
		vtRevertNames(recs);
		if (QUEUE.length > 0 && !scheduled) {
			scheduled = true;
			queueMicrotask(flush);
		}
		throw err;
	}
	VT_HANDLE = vt;
	if (skipRequested) vt.skipTransition();
	vt.ready.then(
		() => {
			vtRevertNames(recs);
			for (const a of acts) vtFireCallback(a.kind, a.rec, types);
		},
		() => {
			// Skipped or interrupted: no animation ran, so no callbacks — but the
			// names still need reverting.
			vtRevertNames(recs);
		},
	);
	const settle = (): void => {
		VT_STATE = VT_IDLE;
		VT_HANDLE = null;
		// Passive effects held back during the animation (React parity: useEffect
		// waits for `finished`) drain now.
		if (VT_PASSIVES_HELD) {
			VT_PASSIVES_HELD = false;
			if (!passiveScheduled) schedulePassiveFlush();
		}
		if (QUEUE.length > 0 && !scheduled) {
			scheduled = true;
			queueMicrotask(flush);
		}
	};
	vt.finished.then(settle, (err: unknown) => {
		settle();
		// A REAL async update callback that threw rejects `finished` — surface
		// it (the mock's synchronous path already threw through vtFlush, and a
		// skipTransition() rejects only `ready`, never `finished`).
		queueMicrotask(() => {
			throw err;
		});
	});
}

/** Drain pending passive effects ahead of a render pass (see flush()). */
function drainPassivesBeforeRender(): void {
	if (effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) drainPassiveEffects();
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
	// flushSync mid-view-transition skips the animation (React's rule): the
	// sync drain below applies everything now; the pending update callback
	// later drains an empty queue.
	VIEW_TRANSITION_DRIVER?.interrupt();
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
			// before flushSync returns. Non-convergent commit cascades (for example an
			// unstable `useSyncExternalStore` snapshot or an every-render layout update)
			// must not monopolize this synchronous stack. Discriminate by CONVERGENCE:
			// keep draining while each pass schedules only blocks not yet seen in this flushSync
			// (a finite cascade propagating through the tree — it exhausts quickly since
			// Object.is-equal setStates bail); the moment a block re-schedules ITSELF a second
			// time, the cascade is non-convergent — stop and hand the remainder to the async
			// scheduler. Commit-spawned updates retain their per-chain count across those
			// microtasks and surface MaximumUpdateDepthError at the bounded limit instead of
			// starving the event loop. LAYOUT_CASCADE_LIMIT backstops pathological
			// wide-but-finite chains.
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
			REF_CALLBACK_DEPTH++;
			try {
				attachRef(q[i], null, q[i + 1]);
			} finally {
				REF_CALLBACK_DEPTH--;
			}
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
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
		try {
			REF_CALLBACK_DEPTH++;
			try {
				r.fn();
			} finally {
				REF_CALLBACK_DEPTH--;
			}
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			const handler = findTryHandler(r.block);
			if (handler) handler(err);
			else console.error(err);
		}
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
	// React publishes every Effect Event body before any insertion/layout effect
	// can call an already-registered wrapper. Entries from failed or suspended
	// renders are filtered by their block's completed render version.
	drainEffectEventUpdates();
	// Activity visible→hidden work is transactionally deferred until the event
	// bodies above publish. Its layout cleanup therefore sees the fresh body while
	// the preserved DOM range is still connected, then the action hides that range.
	drainEffectEventCommitActions();
	// Controlled-form commit work FIRST: select projections must see the
	// options this render just built, and the dev missing-onInput check must
	// see the element's full listener set (see drainControlledSyncs).
	drainControlledSyncs();
	// Mutation phase (React's commitMutationEffects): a per-scope walk over the
	// merged insertion+layout queues — each scope's insertion destroys, insertion
	// bodies, then its layout DESTROYS. Layout bodies wait for the layout phase
	// below; the returned batch carries them across the ref work.
	const mutationBatch = drainMutationEffects();
	// Teardown ref detaches fire before this commit's attaches (mutation → layout),
	// so a ref moving between elements cycles null → new-node in one commit.
	drainRefDetaches();
	drainRefAttaches();
	reapplyFragmentBindings();
	// Layout phase (React's commitLayoutEffects): bodies only — every layout
	// cleanup already fired in the mutation walk, ref attaches just landed, so a
	// layout body sees populated refs and connected DOM.
	if (mutationBatch !== null) runLayoutEffects(mutationBatch);
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
}

/** Arm the post-paint passive drain. Callers check `passiveScheduled` first. */
function schedulePassiveFlush(): void {
	passiveScheduled = true;
	schedulePostPaint(() => {
		// View-transition ordering (React parity): passive effects wait for the
		// transition's `finished` — the vtFlush finished handler re-arms this
		// drain. Direct test-harness drains (drainPassiveEffects) stay ungated.
		passiveScheduled = false;
		if (VIEW_TRANSITION_DRIVER?.deferPassives() === true) return;
		drainPassivePhase();
	});
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
	drainPassivePhase();
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
		effectEventQueue.length > 0 ||
		effectEventCommitActions.length > 0 ||
		effectQueues[INSERTION].length > 0 ||
		effectQueues[LAYOUT].length > 0 ||
		effectQueues[PASSIVE].length > 0 ||
		pendingPassiveUnmounts.length > 0 ||
		storeSyncQueue.length > 0 ||
		hasControlledSyncs()
	);
}

function drainEffectEventUpdates(): void {
	if (effectEventQueue.length === 0) return;
	const q = effectEventQueue.splice(0);
	for (let i = 0; i < q.length; i++) {
		const entry = q[i];
		const block = entry.block;
		if (
			!entry.cell.active ||
			blockSubtreeDisposed(block) ||
			// Independently scheduled siblings may complete before another child
			// suspends their shared boundary. That boundary soft-detaches the try
			// subtree, so its completed payload is still uncommitted. Do not use the
			// broader inactive check: hidden Activity renders intentionally publish
			// fresh Effect Event bodies while their DOM/effects stay preserved.
			findSuspenseHiddenTry(block) !== null ||
			block.effectEventRenderVersion !== entry.renderVersion ||
			block.effectEventCompletedVersion !== entry.renderVersion
		) {
			continue;
		}
		entry.cell.impl = entry.nextImpl;
	}
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
 * The async double-loop (5 microtask ticks × up to ACT_DRAIN_LIMIT iterations)
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
				for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
					for (let j = 0; j < 5; j++) await Promise.resolve();
					drainPassiveEffects();
					if (!hasPendingWork()) return value;
				}
				throw new Error(
					`act(): scheduler did not stabilize after ${ACT_DRAIN_LIMIT} iterations — likely an infinite render loop`,
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
	try {
		for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
			// A transition-lane drain that would be wrapped in a view transition must
			// route through flush() — flushSync is the urgent path and deliberately
			// SKIPS the wrap. Under the test mock, startViewTransition runs its update
			// callback synchronously, so this stays a synchronous drain; a REAL async
			// startViewTransition under sync act() cannot be awaited here (use the
			// async act form, which drains through the scheduled microtask flush).
			if (VIEW_TRANSITION_DRIVER?.wouldWrap() === true) flush();
			else flushSync(() => {});
			drainPassiveEffects();
			if (!hasPendingWork()) break;
			if (i === ACT_DRAIN_LIMIT - 1) {
				throw new Error(
					`act(): scheduler did not stabilize after ${ACT_DRAIN_LIMIT} iterations — likely an infinite render loop`,
				);
			}
		}
	} catch (err) {
		// Flush/commit failures follow the same thenable contract as callback
		// failures. Balance the scope here because the async continuation below
		// is never created on this path.
		actScopeDepth--;
		return Promise.reject(err);
	}
	return (async () => {
		try {
			for (let i = 0; i < ACT_DRAIN_LIMIT; i++) {
				for (let j = 0; j < 5; j++) await Promise.resolve();
				drainPassiveEffects();
				if (!hasPendingWork()) return result as T;
			}
			throw new Error(
				`act(): scheduler did not stabilize after ${ACT_DRAIN_LIMIT} iterations — likely an infinite render loop`,
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

/** Fire (and clear) the CURRENT cleanup of the slot behind a queued effect. */
function fireEffectCleanup(e: PendingEffect): void {
	const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
	if (slot && slot.cleanup) {
		const cleanup = slot.cleanup;
		slot.cleanup = undefined;
		try {
			runEffectCleanupCallback(cleanup);
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			const handler = findTryHandler(e.scope.block);
			if (handler) handler(err);
			else console.error(err);
		}
	}
}

/** Run a queued effect's body and stash its returned cleanup on the slot. */
function runEffectBody(e: PendingEffect): void {
	let cleanup: void | Cleanup;
	try {
		EFFECT_BODY_DEPTH++;
		try {
			// Spread deps as positional args (see PendingEffect.args). A no-deps
			// effect has args === undefined, so the body is called with zero args.
			// eslint-disable-next-line prefer-spread
			cleanup = e.fn.apply(null, (e.args ?? []) as []);
		} finally {
			EFFECT_BODY_DEPTH--;
		}
	} catch (err) {
		if (err instanceof MaximumUpdateDepthError) throw err;
		// Route effect errors to the nearest enclosing tryBlock, if any.
		const handler = findTryHandler(e.scope.block);
		if (handler) handler(err);
		else console.error(err);
		return;
	}
	if (typeof cleanup === 'function') {
		const slot = e.scope.hooks?.get(e.slot) as EffectSlot | undefined;
		// The slot owns its LATEST cleanup: unmountScope's effect-slot walk (and
		// deactivateScope's hide walk) read + clear it, so a dep-changed effect's
		// stale cleanup can never replay at teardown.
		if (slot) slot.cleanup = cleanup;
	}
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
function drainMutationEffects(): PendingEffect[] | null {
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
			if (e.phase === LAYOUT && !e.scope.block.disposed && !inInactiveSubtree(e.scope.block))
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
function runLayoutEffects(q: PendingEffect[]): void {
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.phase !== LAYOUT) continue;
		if (e.scope.block.disposed || inInactiveSubtree(e.scope.block)) continue;
		runEffectBody(e);
	}
}

/**
 * Passive phase — React's flushPassiveEffects: first the DEFERRED destroys of
 * unmounted scopes (commitPassiveUnmountEffects processes deletions in the
 * same pass), then commit-wide cleanups-before-bodies over the queued entries.
 * Snapshot-and-splice up front for the same re-entrancy contract as
 * drainMutationEffects (see its comment).
 */
function drainPassivePhase(): void {
	drainDeferredPassiveUnmounts();
	const pending = effectQueues[PASSIVE];
	if (pending.length === 0) return;
	const q = pending.splice(0);
	q.sort(compareEffectPostOrder);
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.scope.block.disposed || inInactiveSubtree(e.scope.block)) continue;
		fireEffectCleanup(e);
	}
	for (let i = 0; i < q.length; i++) {
		const e = q[i];
		if (e.scope.block.disposed || inInactiveSubtree(e.scope.block)) continue;
		runEffectBody(e);
	}
}

function drainEffectEventCommitActions(): void {
	if (effectEventCommitActions.length === 0) return;
	const q = effectEventCommitActions.splice(0);
	for (let i = 0; i < q.length; i++) {
		try {
			q[i]();
		} catch (err) {
			console.error(err);
		}
	}
}

// Passive destroys of DELETED scopes, deferred past the sync phase (React
// defers them to flushPassiveEffects — commitPassiveUnmountEffects). Flat
// [cleanup, boundary-handler] pairs, pushed by unmountScope's effect-slot walk
// in deletion-walk order (parent→child, declaration order within a scope);
// the captured handler routes a late throw to the try boundary that enclosed
// the deletion — the same routing reportTeardownError gave the sync destroys.
const pendingPassiveUnmounts: Array<Cleanup | ((err: any) => void) | null> = [];

function drainDeferredPassiveUnmounts(): void {
	if (pendingPassiveUnmounts.length === 0) return;
	const q = pendingPassiveUnmounts.splice(0);
	for (let i = 0; i < q.length; i += 2) {
		try {
			runEffectCleanupCallback(q[i] as Cleanup);
		} catch (err) {
			if (err instanceof MaximumUpdateDepthError) throw err;
			const handler = q[i + 1] as ((err: any) => void) | null;
			if (handler !== null) handler(err);
			else console.error(err);
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
// commitEffects AFTER runLayoutEffects. For each queued consumer: promote the
// render-read snapshot to the committed `value`, then tear-check against the store
// as of NOW — if a mutation slipped into the render→commit window (e.g. a sibling
// layout effect that mutated+notified), force a re-render so the DOM catches up.
// No sort (order is irrelevant: each entry only touches its own inst) and no
// cleanup bookkeeping — the whole point of not routing these through the effect drains.
function drainStoreSyncs(): void {
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
/** Swap out the pending post-paint callbacks and run them (both delivery paths). */
function drainPostPaint(): void {
	const cbs = _postPaintCbs;
	_postPaintCbs = [];
	for (let i = 0; i < cbs.length; i++) cbs[i]();
}
let _postAfterPaint: (() => void) | undefined;
function initPostAfterPaint(): () => void {
	if (_postAfterPaint === undefined) {
		if (typeof MessageChannel === 'undefined') {
			_postAfterPaint = () => setTimeout(drainPostPaint, 0);
		} else {
			const channel = new MessageChannel();
			channel.port1.onmessage = drainPostPaint;
			_postAfterPaint = () => channel.port2.postMessage(0);
		}
	}
	return _postAfterPaint;
}
function schedulePostPaint(cb: () => void): void {
	_postPaintCbs.push(cb);
	// rAF lands before paint; the shared callback posts a macrotask after paint.
	requestAnimationFrame(initPostAfterPaint());
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
	outputHandler: OutputHandler | null;
	memoInChain: boolean;
	parentNode: Node;
	parentBlock: Block | null;
	idState: RootIdState;
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
	hooks: Map<HookSlot, any> | null;
	cleanups: Cleanup[];
	effectSlots: EffectSlot[] | null;
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
	crossRenderUpdate: boolean;
	nestedUpdateChain: number;
	nestedUpdateCount: number;
	nestedUpdateError: boolean;
	effectEventRenderVersion: number;
	effectEventCompletedVersion: number;
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
	// ViewTransition boundary props (null on every other block — see Block).
	vt: ViewTransitionProps | null;
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
		this.pendingMode = null;
		this.currentRenderMode = null;
		this.pendingDeferred = false;
		this.currentRenderDeferred = false;
		this.inactive = false;
		this.hooks = null;
		this.cleanups = [];
		this.effectSlots = null;
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
		this.crossRenderUpdate = false;
		this.nestedUpdateChain = -1;
		this.nestedUpdateCount = 0;
		this.nestedUpdateError = false;
		this.effectEventRenderVersion = 0;
		this.effectEventCompletedVersion = 0;
		this.deoptNode = null;
		this.slots = [];
		this.forSlot = null;
		this.prevSibling = null;
		this.nextSibling = null;
		this.key = null;
		this.vt = null;
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
	hooks: Map<HookSlot, any> | null;
	cleanups: Cleanup[];
	effectSlots: EffectSlot[] | null;
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
		this.effectSlots = null;
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
	outputHandler: OutputHandler | null = null,
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
		outputHandler,
	) as unknown as Block;
}

export function renderBlock(block: Block): void {
	const hydration = activeHydration();
	if (hydration !== null && !hydration.owns(block)) {
		hydration.suspend(() => renderBlockInner(block));
		return;
	}
	renderBlockInner(block);
}

function enqueueEffectEventUpdate(entry: PendingEffectEvent): void {
	EFFECT_EVENT_RENDER_TARGET.push(entry);
}

function enqueueEffectEventCommitAction(action: () => void): void {
	EFFECT_EVENT_ACTION_TARGET.push(action);
}

function renderBlockInner(block: Block): void {
	const prevScope = CURRENT_SCOPE;
	const prevBlock = CURRENT_BLOCK;
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
	const continuesParentTree = prevBlock !== null && blockIsAncestor(prevBlock, block);
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
	// Invalidate any Effect Event payload queued by an earlier render in this
	// commit. A hook call lazily starts version 1; subsequent attempts advance it
	// here even if they suspend before reaching the hook again.
	if (block.effectEventRenderVersion !== 0) block.effectEventRenderVersion++;
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
	const profileFrame: ProfileFrame | null =
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		(block.kind === 'root' || block.kind === 'dynamic' || block.kind === 'portal')
			? __profileBeginRender(block, block.body, block.mounted)
			: null;
	let profileDidThrow = false;
	let profileThrown: unknown;
	let renderCompleted = false;
	try {
		const out = (block.body as (p: any, s: Scope, e: any) => unknown)(
			block.props,
			block,
			block.extra,
		);
		if (out !== undefined && block.outputHandler !== null) block.outputHandler(block, out);
		if (!block.mounted) block.mounted = true;
		if (block.effectEventRenderVersion !== 0) {
			block.effectEventCompletedVersion = block.effectEventRenderVersion;
		}
		renderCompleted = true;
		// Body completed without suspending: its use() episode is over — the
		// next render (replay or not) must not reuse these entries.
		(block as any).__thenableDone = true;
	} catch (error) {
		profileDidThrow = true;
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
			effectEventTarget.length = effectEventCheckpoint;
			effectEventActionTarget.length = effectEventActionCheckpoint;
		}
		EFFECT_EVENT_RENDER_TARGET = prevEffectEventTarget;
		EFFECT_EVENT_ACTION_TARGET = prevEffectEventActionTarget;
		ACTIVE_WARM_PLANS.length = warmPlanCheckpoint;
		CURRENT_WARM_EPISODE = prevWarmEpisode;
		CURRENT_SCOPE = prevScope;
		CURRENT_BLOCK = prevBlock;
	}
}

// Generic JavaScript-return reconciliation is passed only to Blocks whose body
// may return a renderable. Compiled-void Blocks carry a null handler, allowing
// production bundles containing only `@{}` output to tree-shake this whole
// return/descriptor/childSlot path.
function returnSlotTail(block: Block, state: any): Node | null {
	const candidates = [
		state?.end,
		state?.block?.endMarker,
		state?.hostNode,
		state?.text,
		block.endMarker,
		block.parentNode.lastChild,
	];
	for (let i = 0; i < candidates.length; i++) {
		const node = candidates[i] as Node | null | undefined;
		if (node !== null && node !== undefined && node.parentNode === block.parentNode) return node;
	}
	return null;
}

function renderReturnedValue(block: Block, out: unknown): void {
	// A single-root fragment descriptor (its renderer is `$$singleRoot`) mounts
	// MARKERLESS via componentSlot's singleRoot path — the element self-delimits,
	// so the DOM is byte-identical to `@{}`'s inline render (no extra markers).
	// Anything else (multi-root, arrays, strings, conditionals) → childSlot.
	const isComponentDescriptor =
		out !== null &&
		(out as any).$$kind === ELEMENT_TAG &&
		(out as any).key == null &&
		typeof (out as any).type === 'function';
	const useSingleRoot =
		isComponentDescriptor &&
		((out as any).type.$$singleRoot === true || activeHydration()?.passthroughRanges === true);
	// The private return slot holds EITHER a componentSlotSlot (singleRoot
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
		const transitionSwap = TRANSITION_SWAP_DRIVER;
		// A transition can cross the markerless-single-root optimization boundary
		// (text/list → compiled host fragment, or the reverse). Probe the incoming
		// returned value off-screen before disposing the committed slot; a suspend or
		// error then leaves the old DOM/state intact for the enclosing @try hold.
		if (
			transitionSwap !== null &&
			activeHydration() === null &&
			block.currentRenderMode === 'transition'
		) {
			const tail = returnSlotTail(block, existingRet);
			if (tail !== null) {
				const probe = transitionSwap.render(
					block,
					block.parentNode,
					tail,
					ROOT_RENDERABLE_BODY,
					out,
					renderReturnedValue,
				);
				transitionSwap.dispose(probe.wip);
				if (probe.error) throw probe.error;
				if (probe.suspended) throw new SuspenseException(probe.suspended);
			}
		}
		disposeReturnSlot(block, existingRet);
	}
	if (useSingleRoot) {
		const d = out as ElementDescriptor;
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			!__profileHasComponentMetadata(d.type as Function)
		) {
			withProfileComponentOverride(d.type as Function, null, () =>
				componentSlot(
					block,
					0,
					block.parentNode,
					d.type as ComponentBody,
					d.props,
					block.endMarker,
					d.key ?? undefined,
					true,
					undefined,
					activeHydration() !== null && KEYED_ELEMENT_DESCRIPTORS.has(d),
				),
			);
		} else {
			componentSlot(
				block,
				0,
				block.parentNode,
				d.type as ComponentBody,
				d.props,
				block.endMarker,
				d.key ?? undefined,
				true,
				undefined,
				activeHydration() !== null && KEYED_ELEMENT_DESCRIPTORS.has(d),
			);
		}
	} else {
		// A nested return-based component whose server output is EMPTY owns an
		// adjacent `<!--[--><!--]-->` range with no inner child range to adopt.
		// An unframed third-party SSR root receives an equivalent synthetic range.
		// Borrow either component range for the return slot instead of letting
		// childSlot mint an empty `<!---->` anchor during hydration. The return
		// slot is the block's entire output, so it can safely reconcile future
		// text/component values between the borrowed markers while the block
		// remains their owner. This keeps hydration byte-preserving for `return
		// null` / `false` / `''` components (including memo wrappers).
		const returnHydration = activeHydration();
		if (
			returnHydration !== null &&
			block.slots[0] === undefined &&
			block.startMarker !== null &&
			block.endMarker !== null &&
			block.startMarker !== block.endMarker &&
			block.startMarker.nodeType === 8 &&
			block.endMarker.nodeType === 8 &&
			(block.startMarker.nextSibling === block.endMarker ||
				returnHydration.isUnframedRootRange(block.startMarker, block.endMarker))
		) {
			const borrowed: ChildSlot = {
				__kind: 'childSlot',
				start: block.startMarker as Comment,
				end: block.endMarker as Comment,
				ownerHost: null,
				borrowed: true,
				compactable: false,
				block: null,
				text: null,
				currentComp: null,
				currentIsBodyFn: false,
				forSlot: null,
				hostNode: null,
				portal: null,
			};
			block.slots[0] = borrowed;
			registerSlot(block, borrowed);
		}
		childSlot(block, 0, block.parentNode, out, block.endMarker);
	}
}

// Tear down a block's private return slot when renderBlock's return value flips
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
		if (!state.borrowed) {
			(state.start as ChildNode | null)?.remove();
			(state.end as ChildNode | null)?.remove();
		}
	} else {
		// componentSlotSlot — unmountBlock removes its DOM (incl. any owned markers).
		if (state.block) unmountBlock(state.block, true);
		if (!state.inherited) {
			(state.start as ChildNode | null)?.remove?.();
			(state.end as ChildNode | null)?.remove?.();
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
	const hydration = activeHydration();
	let scope = parentScope.slots[slotKey] as Scope | undefined;
	// The server `<!--]-->` this call adopted as its range end (hydration first
	// render only) — consumed by the post-body cursor advance below.
	let adoptedOpen: Comment | null = null;
	let adoptedClose: Node | null = null;
	if (scope === undefined) {
		scope = new ScopeImpl(parentScope, parentScope.block);
		// Lite scope's `block` exposes the host/anchor as the body's DOM context
		// — so the compiled body's `__s.block.parentNode.insertBefore(_root,
		// __s.block.endMarker)` plants content INSIDE the owning element rather
		// than spilling out to the parent block's range. `parentBlock` keeps the
		// context-walk Phase B chain pointing at the real ancestor Block.
		let endMarker = anchor ?? null;
		if (hydration !== null && hydration.isOpen(anchor ?? null)) {
			// Hydration: the server wrapped this hookless component's output in a
			// `<!--[-->…<!--]-->` range (anchor resolved to the `<!--[-->`). Point the
			// cursor at the content so the body's clone() adopts the server DOM, and
			// use `<!--]-->` as the insert anchor so the body's
			// `insertBefore(content, endMarker)` is a no-op (content already there).
			adoptedOpen = anchor as Comment;
			endMarker = hydration.close(anchor as Node);
			adoptedClose = endMarker;
			hydration.node = (anchor as Node).nextSibling;
		} else if (hydration !== null && !hydration.isOpen(anchor ?? null)) {
			// Anchor-less (appended) component — the compiler dropped the `<!>`
			// placeholder because every child of `host` is a component — OR the anchor
			// is a non-open marker because this lite component is the SOLE hole of a
			// control-flow arm (a `@try { <Comp/> }` body), so its anchor is the arm's
			// end marker. In both cases the server still wrapped the output in a
			// `<!--[-->…<!--]-->` range and mountTry/renderBlock parked the cursor on
			// the `<!--[-->`. The FIRST appended child finds the cursor parked AFTER the
			// just-cloned (empty) host, so descend to host.firstChild; later siblings
			// (and the sole-hole case) already have the cursor on the open marker.
			let open: Node | null = hydration.node;
			if (open === null || open.parentNode !== host) open = host.firstChild;
			if (open !== null && hydration.isOpen(open)) {
				adoptedOpen = open;
				endMarker = hydration.close(open);
				adoptedClose = endMarker;
				hydration.node = open.nextSibling;
			}
		}
		scope.block = new LiteBlockImpl(host, endMarker, parentScope.block) as unknown as Block;
		if (adoptedOpen !== null && adoptedClose !== null) {
			hydration!.liteRanges.set(scope, {
				start: adoptedOpen,
				end: adoptedClose as Comment,
			});
		}
		parentScope.slots[slotKey] = scope;
		// Register on parent.children so unmountScope(parent) walks into us.
		parentScope.children.push({ key: slotKey, scope });
	} else {
		// Re-render: the parent's host/anchor are stable across renders so no
		// need to rebuild the LiteBlockImpl. Skip the allocation on warm path.
	}
	const prevScope = CURRENT_SCOPE;
	const warmPlanCheckpoint = ACTIVE_WARM_PLANS.length;
	CURRENT_SCOPE = scope;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileTrackComponent(scope, comp);
	const profileFrame: ProfileFrame | null =
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
			? __profileBeginRender(scope, comp, scope.mounted)
			: null;
	let profileDidThrow = false;
	let profileThrown: unknown;
	try {
		comp(props, scope, undefined);
		if (!scope.mounted) scope.mounted = true;
	} catch (error) {
		profileDidThrow = true;
		profileThrown = error;
		throw error;
	} finally {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileEndRender(profileFrame, profileDidThrow, profileThrown);
		ACTIVE_WARM_PLANS.length = warmPlanCheckpoint;
		CURRENT_SCOPE = prevScope;
	}
	// Hydration: advance the cursor PAST this component's adopted range so the
	// next SIBLING slot adopts from its own `<!--[-->`. The body leaves the
	// cursor ON its adopted root (clone() parks it there), so without this a
	// following sibling lite slot sees a non-marker node, adopts no range, and
	// its commitBag insert MOVES the previous sibling's root to the shared
	// anchor. Mirrors componentSlot's post-render advance.
	if (hydration !== null && adoptedClose !== null) hydration.node = adoptedClose.nextSibling;
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
	if (TEARDOWN_DEPTH === 0) {
		TEARDOWN_HANDLER = findTryHandler(block.parentBlock) ?? rendererRegionTryHandler(block);
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
	// An installed ViewTransition driver unregisters eagerly (its wrapped flush
	// also prunes lazily; the disposed stamp above drives exit detection).
	VIEW_TRANSITION_DRIVER?.unregister(block);
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

// Slot-owned lifecycle work is carried as a capability instead of making the
// generic unmount walk reference a concrete feature implementation. Feature
// graphs such as deferred hydration can then disappear when their public API is
// not retained by the application bundle.
const SLOT_FLAG_TEARDOWN = 1 << 0;

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
			const cleanup = slot.cleanup;
			if (cleanup === undefined) continue;
			slot.cleanup = undefined;
			if (slot.phase === PASSIVE) {
				pendingPassiveUnmounts.push(cleanup, TEARDOWN_HANDLER);
				// Arm the post-paint drain for unmounts OUTSIDE a commit
				// (root.unmount()); a commit-driven unmount would re-arm in
				// commitEffects anyway, deduped by the flag.
				if (!passiveScheduled) schedulePassiveFlush();
			} else {
				try {
					runEffectCleanupCallback(cleanup);
				} catch (err) {
					reportTeardownError(err);
				}
			}
		}
	}
	// Then the scope's remaining cleanups (ref detaches, listener teardown, slot
	// state) in REVERSE registration order.
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
			runEffectLifecycleCallback(c[i]);
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
			if ((val.__flags & SLOT_FLAG_TEARDOWN) !== 0) val.__teardown(val);
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
			} else if (k === 'hydrateBlockSlot') {
				// A load() strategy can begin procedural prefetch during the initial
				// hydration render, before this slot's passive installer ever runs.
				// Its capability teardown above aborts that work and resolves pending
				// waitFor subscribers without rooting Hydrate in this generic walk.
				if (val.block) unmountBlock(val.block, detachDom);
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
					discardOffscreenCapture(val.stagedCapture);
					val.stagedCapture = null;
					val.stagedEffectDeps = null;
					val.detachedRefs = null;
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
// Hooks — keyed by a compile-time site id
//
// The `slot` argument is COMPILER-INJECTED. octane/compiler appends a
// small number in production and a stable Symbol in HMR/profile output. The
// key gives the hook its per-call-site identity within a scope; Symbols retain
// cross-module/re-import identity where custom-hook forwarding or HMR needs it.
// The public signature marks `slot` OPTIONAL so authors writing `useState(0)`
// don't see a confusing "Expected 2 arguments" diagnostic. At runtime the
// missingSlot guard catches source loaded outside the compiler pipeline.
// ---------------------------------------------------------------------------

function missingSlot(name: string): never {
	throw new Error(
		`${name} was called without a hook slot. The octane compiler injects ` +
			`per-call-site keys; ensure your project loads this runtime ` +
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
const slotStack: HookSlot[] = [];
export function withSlot<T>(sym: symbol, fn: (...a: any[]) => T, ...args: any[]): T;
export function withSlot<T>(sym: HookSlot, fn: (...a: any[]) => T, ...args: any[]): T {
	slotStack.push(sym);
	try {
		return fn(...args);
	} finally {
		slotStack.pop();
	}
}

// Length-prefix each segment so a numeric site cannot collide with a described
// Symbol and descriptions containing delimiters cannot alias a different path.
function appendSlotKey(key: string, slot: HookSlot): string {
	const value = typeof slot === 'number' ? String(slot) : (slot.description ?? '');
	return key + (typeof slot === 'number' ? 'n' : 's') + value.length + ':' + value;
}

// Resolve a base hook's effective slot by COMBINING its own per-call-site symbol
// (the compiler-injected trailing arg, when present) with the call-site PATH STACK
// (the symbols withSlot pushes for each enclosing custom-hook call). At the top
// level the stack is empty, so the hook's own slot is used unchanged — no behavior
// change for ordinary component hooks. Inside a withSlot-wrapped custom hook, the
// wrapper's call-site symbol is folded in, so the SAME custom hook used at two call
// sites (or reused) keeps its inner hooks independent. A base hook with no slot of
// its own (a hand-written or library-binding base hook) falls back to the path.
function resolveSlot(slot: HookSlot | undefined): HookSlot | undefined {
	const n = slotStack.length;
	if (n === 0) return slot;
	if (slot === undefined && n === 1) return slotStack[0];
	let key = '@octane:hook:';
	for (let i = 0; i < n; i++) key = appendSlotKey(key, slotStack[i]);
	if (slot !== undefined) key = appendSlotKey(key, slot);
	const resolved = Symbol.for(key);
	return typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
		? __profileResolveHook(resolved, typeof slot === 'symbol' ? slot : undefined)
		: resolved;
}

interface StateSlot<T> {
	value: T;
	setter: (next: T | ((prev: T) => T)) => void;
	/** Allocated only for compiler-selected third-tuple consumers. */
	getter?: () => T;
	pendingActionBatch?: TransitionActionBatch;
	pendingActionValue?: T;
}

type StateSetter<T> = (next: T | ((prev: T) => T)) => void;
type StateTuple<T> = [T, StateSetter<T>, () => T];

export function useState<T = undefined>(): StateTuple<T | undefined>;
export function useState<T>(initial: T | (() => T), slot?: symbol): StateTuple<T>;
export function useState<T>(initial?: T | (() => T), slot?: HookSlot): StateTuple<T> {
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
		const initVal = typeof initial === 'function' ? (initial as () => T)() : (initial as T);
		s = {
			value: initVal,
			setter: (next) => {
				const previous = stagedTransitionValue(s!);
				const operation = typeof next === 'function' ? (next as (p: T) => T) : () => next;
				const computed = operation(previous);
				if (Object.is(computed, previous)) return;
				if (stageTransitionValue(s!, block, operation, computed)) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
						const update = s!.pendingActionBatch?.updates.get(s!) as
							| TransitionActionUpdate<T>
							| undefined;
						if (update !== undefined) {
							update.profileType = 'state';
							update.profileSlot = slot;
						}
					}
					return;
				}
				s!.value = computed;
				if (
					!block.disposed &&
					typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
					__OCTANE_PROFILE_ENABLED__
				)
					__profileSchedule(block, 'state', slot);
				scheduleRender(block);
			},
		};
		ensureHooks(scope).set(slot, s);
	}
	// Source-level useState has a third getState member, but this physical base
	// path stays allocation-free. The compiler selects __useStateWithGetter only
	// when index 2 can be observed (including escaped or ambiguous tuples).
	return [s.value, s.setter] as unknown as StateTuple<T>;
}

type AssertUseStateType<T extends true> = T;
type _UseStateAcceptsNoArguments = AssertUseStateType<
	typeof useState extends <T = undefined>() => StateTuple<T | undefined> ? true : false
>;

/** Compiler-emitted useState variant for a tuple whose third member is observable. */
export function __useStateWithGetter<T>(initial: T | (() => T), slot?: symbol): StateTuple<T>;
export function __useStateWithGetter<T>(initial: T | (() => T), slot?: HookSlot): StateTuple<T> {
	// Mirror useState's zero-argument trailing-slot ABI before delegating so we
	// can look the resulting cell up by the same effective slot afterwards.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial as unknown as symbol;
		initial = undefined as T;
	}
	const pair = (useState as any)(initial, slot) as StateTuple<T>;
	const resolved = resolveSlot(slot);
	if (resolved === undefined) missingSlot('useState');
	const s = CURRENT_SCOPE!.hooks!.get(resolved) as StateSlot<T>;
	const getter =
		s.getter ??
		(s.getter = () => {
			const batch = s.pendingActionBatch;
			if (batch === undefined) return s.value;
			const update = batch.updates.get(s) as TransitionActionUpdate<T> | undefined;
			return update === undefined ? s.value : rebaseTransitionActionUpdate(update);
		});
	return [pair[0], pair[1], getter];
}

interface ReducerSlot<S, A> {
	value: S;
	dispatch: (action: A) => void;
	reducer: (state: S, action: A) => S;
	/** Render-phase actions are reduced by the reducer from the replaying render. */
	renderPhaseActions?: A[];
	/** Latest scheduled value for the compiler-selected third tuple member. */
	renderPhaseValue?: S;
	/** Allocated only for compiler-selected third-tuple consumers. */
	getter?: () => S;
	pendingActionBatch?: TransitionActionBatch;
	pendingActionValue?: S;
}

type ReducerTuple<S, A> = [S, (action: A) => void, () => S];

export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: symbol,
): ReducerTuple<S, A>;
export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A> {
	// The compiler appends the hook slot as the final argument. In Symbol builds,
	// the React 2-arg form `useReducer(reducer, initialState)` arrives as
	// `(reducer, initialState, slot)`; numeric builds reserve the omitted init
	// position and arrive as `(reducer, initialState, undefined, slot)`. The 3-arg form
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
	let s = scope.hooks?.get(slot) as ReducerSlot<S, A> | undefined;
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
				// React queues a render-phase reducer action and applies it with the
				// reducer supplied by the replaying render. Reducing eagerly here uses
				// the previous pass's reducer when that reducer changes alongside state.
				if (CURRENT_BLOCK === block) {
					const actions = (s!.renderPhaseActions ??= []);
					const previous = actions.length === 0 ? s!.value : (s!.renderPhaseValue as S);
					actions.push(action);
					// Preserve Octane's current-state getter without evaluating reducers
					// twice for the ordinary two-item tuple path. The action-list length,
					// rather than nullishness, distinguishes the first result: null and
					// undefined are both valid reducer states.
					if (s!.getter !== undefined) {
						s!.renderPhaseValue = s!.reducer(previous, action);
					}
					scheduleRender(block);
					return;
				}
				const previous = stagedTransitionValue(s!);
				const operation = (value: S) => s!.reducer(value, action);
				const computed = operation(previous);
				if (stageTransitionValue(s!, block, operation, computed, true)) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
						const update = s!.pendingActionBatch?.updates.get(s!) as
							| TransitionActionUpdate<S>
							| undefined;
						if (update !== undefined) {
							update.profileType = 'reducer';
							update.profileSlot = slot;
						}
					}
					return;
				}
				s!.value = computed;
				if (
					!block.disposed &&
					typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
					__OCTANE_PROFILE_ENABLED__
				)
					__profileSchedule(block, 'reducer', slot);
				scheduleRender(block);
			},
		};
		ensureHooks(scope).set(slot, s);
	} else {
		// Allow reducer reference to update across renders.
		s.reducer = reducer;
		const actions = s.renderPhaseActions;
		if (actions !== undefined) {
			let value = s.value;
			for (let i = 0; i < actions.length; i++) value = reducer(value, actions[i]);
			s.value = value;
			s.renderPhaseActions = undefined;
			s.renderPhaseValue = undefined;
		}
	}
	// See useState: the compiler selects __useReducerWithGetter whenever the
	// source can observe the third tuple member.
	return [s.value, s.dispatch] as unknown as ReducerTuple<S, A>;
}

/** Compiler-emitted useReducer variant for a tuple whose third member is observable. */
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: symbol,
): ReducerTuple<S, A>;
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A> {
	const resolvedInput = typeof initOrSlot === 'symbol' ? initOrSlot : slot;
	const pair = (useReducer as any)(reducer, initialArg, initOrSlot, slot) as ReducerTuple<S, A>;
	const resolved = resolveSlot(resolvedInput);
	if (resolved === undefined) missingSlot('useReducer');
	const s = CURRENT_SCOPE!.hooks!.get(resolved) as ReducerSlot<S, A>;
	const getter =
		s.getter ??
		(s.getter = () => {
			// Action presence is the sentinel; the reduced value may legitimately be
			// null or undefined.
			if (s.renderPhaseActions !== undefined) return s.renderPhaseValue as S;
			const batch = s.pendingActionBatch;
			if (batch === undefined) return s.value;
			const update = batch.updates.get(s) as TransitionActionUpdate<S> | undefined;
			return update === undefined ? s.value : rebaseTransitionActionUpdate(update);
		});
	return [pair[0], pair[1], getter];
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
// Activity hides between enqueue and drain (the effect drains skip execution). On
// reveal, deactivateScope has cleared each effect slot's deps, so the
// re-render re-enqueues and the effect finally fires.
function inInactiveSubtree(block: Block | null): boolean {
	for (let a = block; a !== null; a = a.parentBlock) {
		if (a.inactive) return true;
	}
	return false;
}

function enqueueEffect(slot: HookSlot, fn: EffectFn, deps: any[] | undefined, phase: Phase): void {
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
		const slotObj: EffectSlot = { deps, cleanup: undefined, effect: true, phase };
		ensureHooks(scope).set(slot, slotObj);
		// Parallel flat list in declaration order — unmountScope's phase-correct
		// deletion walk reads it (see Scope.effectSlots).
		if (scope.effectSlots === null) scope.effectSlots = [slotObj];
		else scope.effectSlots.push(slotObj);
	} else {
		prev.deps = deps;
	}
	// Tag with the enqueue sequence (DFS pre-order). The commit drains turn this +
	// the parentBlock chain into React's post-order commit order — see PendingEffect.seq.
	const entry = { scope, slot, fn, args: deps, phase, seq: commitSeq++ };
	(WIP_CAPTURE !== null ? WIP_CAPTURE.effects[phase] : effectQueues[phase]).push(entry);
}

// ABI: the compiler appends the hook slot as the LAST argument. Generated code
// normally supplies an inferred or explicit deps array before it. Keep the
// trailing-symbol reinterpret for direct/uncompiled calls and normalize the
// public `null` escape hatch to undefined; internally undefined means "run or
// recompute on every commit/render". Shared by the effect hooks AND useMemo;
// useCallback keeps its own reinterpret fork (it must forward the RAW slot).
function resolveHookArgs(
	name: string,
	deps: any[] | null | symbol | undefined,
	slot: HookSlot | undefined,
): [any[] | undefined, HookSlot] {
	if (slot === undefined && typeof deps === 'symbol') {
		slot = deps;
		deps = undefined;
	}
	if (deps === null) deps = undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot(name);
	return [deps as any[] | undefined, slot];
}

export function useEffect(fn: EffectFn, deps?: any[] | null, slot?: symbol): void;
export function useEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useEffect', deps, slot);
	enqueueEffect(s, fn, d, PASSIVE);
}
export function useLayoutEffect(fn: EffectFn, deps?: any[] | null, slot?: symbol): void;
export function useLayoutEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useLayoutEffect', deps, slot);
	enqueueEffect(s, fn, d, LAYOUT);
}
export function useInsertionEffect(fn: EffectFn, deps?: any[] | null, slot?: symbol): void;
export function useInsertionEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useInsertionEffect', deps, slot);
	enqueueEffect(s, fn, d, INSERTION);
}

export function useMemo<T>(compute: (...deps: any[]) => T, deps?: any[] | null, slot?: symbol): T;
export function useMemo<T>(
	compute: (...deps: any[]) => T,
	deps?: any[] | null,
	slot?: HookSlot,
): T {
	const [d, s] = resolveHookArgs('useMemo', deps, slot);
	const scope = CURRENT_SCOPE!;
	const prev = scope.hooks?.get(s) as
		| { deps: any[] | undefined; value: T; warmEpisode?: number }
		| undefined;
	// deps === undefined → recompute every render (`null` at the public API;
	// direct/uncompiled omitted calls also retain this runtime fallback).
	if (prev && d !== undefined && !depsChanged(prev.deps, d)) {
		if (prev.warmEpisode !== CURRENT_WARM_EPISODE && recordRealWarmMemo(s, d, prev)) {
			prev.warmEpisode = CURRENT_WARM_EPISODE;
		}
		return prev.value;
	}
	// Parallel-use warming: before recomputing, adopt a prefetched creation for
	// this slot (started by warmMemo during a suspended ancestor's warm walk) —
	// the fetch is already in flight. Only compiler-warmed slots can hit;
	// WARM_EVER keeps the ancestor walk off apps that never warm.
	if (WARM_EVER && d !== undefined) {
		const adopted = adoptWarmValue(s, d);
		if (adopted !== WARM_MISS) {
			ensureHooks(scope).set(s, {
				deps: d,
				value: adopted,
				warmEpisode: CURRENT_WARM_EPISODE,
			});
			return adopted as T;
		}
	}
	// Spread deps as positional args (superset of React — see PendingEffect.args):
	// a factory written as a pure function of its deps is hoistable. Zero-arg
	// React-style factories ignore the extra args.
	// eslint-disable-next-line prefer-spread
	const value = compute.apply(null, (d ?? []) as []);
	const entry: { deps: any[] | undefined; value: T; warmEpisode?: number } = { deps: d, value };
	ensureHooks(scope).set(s, entry);
	if (d !== undefined && recordRealWarmMemo(s, d, entry)) {
		entry.warmEpisode = CURRENT_WARM_EPISODE;
	}
	return value;
}

export function useCallback<F extends (...args: any[]) => any>(
	fn: F,
	deps?: any[] | null,
	slot?: symbol,
): F;
export function useCallback<F extends (...args: any[]) => any>(
	fn: F,
	deps?: any[] | null,
	slot?: HookSlot,
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
	return (useMemo as any)(() => fn, deps, slot) as F;
}

export function useRef<T>(initial: T, slot?: symbol): { current: T };
export function useRef<T>(initial: T, slot?: HookSlot): { current: T } {
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
 * trailing compiler slot like every other hook.
 */
export function useDebugValue(_value?: unknown, _format?: unknown, _slot?: symbol): void;
export function useDebugValue(_value?: unknown, _format?: unknown, _slot?: HookSlot): void {}

/**
 * React's `useImperativeHandle(ref, factory, deps)` — exposes an imperative
 * API to a parent via the ref. Scheduled as a layout-phase effect so the
 * `ref.current` is populated before paint and before any layout effects in
 * ancestors that depend on the API. Cleared to null on unmount.
 */
export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null | undefined,
	factory: () => T,
	deps?: any[] | null,
	slot?: symbol,
): void;
export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null | undefined,
	factory: () => T,
	deps?: any[] | null,
	slot?: HookSlot,
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
const USES_SUBSLOTS = new Map<HookSlot, { inst: symbol; effect: symbol }>();
function usesSubslots(slot: HookSlot): { inst: symbol; effect: symbol } {
	let s = USES_SUBSLOTS.get(slot);
	if (s === undefined) {
		const desc = appendSlotKey('@octane:uses:', slot);
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
// (the effect drains apply the deps array positionally — a Ripple superset, see
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
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot?: () => T,
	slot?: symbol,
): T;
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	...rest: any[]
): T {
	// React-19 shape: `useSyncExternalStore(subscribe, getSnapshot,
	// getServerSnapshot?)`. The compiler appends the hook slot as the
	// LAST argument, so we detect the user-vs-compiler args by counting from
	// the end. One trailing slot → user passed no getServerSnapshot; one slot
	// preceded by another arg → user passed getServerSnapshot.
	let slot = rest[rest.length - 1] as HookSlot | undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useSyncExternalStore');
	const getServerSnapshot = rest.length >= 2 ? (rest[0] as () => T) : undefined;
	const subs = usesSubslots(slot);

	// Fresh read on every render — the anti-tearing snapshot. DURING HYDRATION the
	// first read uses getServerSnapshot (if provided) so the adopted DOM matches the
	// server value; the commit-time store-sync then re-checks getSnapshot() and
	// forces an update if the client value differs (React's hydrate-then-sync).
	// The capability branch is inert, and its implementation is dropped, in client-only builds.
	const value =
		activeHydration() !== null && getServerSnapshot !== undefined
			? getServerSnapshot()
			: getSnapshot();

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
			forceUpdate:
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
					? () => {
							if (!block.disposed) __profileSchedule(block, 'external-store', slot);
							scheduleRender(block);
						}
					: () => scheduleRender(block),
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
	// deps-as-args fn (cast: EffectFn is nominally zero-arg, but the effect drain applies
	// the deps positionally — see subscribeToStore).
	useEffect(subscribeToStore as unknown as EffectFn, [inst, subscribe], subs.effect);

	return value;
}

/**
 * React 19 `useEffectEvent` — returns a fresh wrapper each render whose shared
 * cell invokes the latest COMMITTED `fn`. Effect Events are non-reactive (the
 * compiler omits them from inferred dependencies), but their wrapper identity
 * is intentionally not stable. Publishing the cell in commit prevents a
 * suspended or failed render from leaking an uncommitted closure.
 */
export function useEffectEvent<F extends (...args: any[]) => any>(fn: F, slot?: symbol): F;
export function useEffectEvent<F extends (...args: any[]) => any>(fn: F, slot?: HookSlot): F {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useEffectEvent');
	const scope = CURRENT_SCOPE!;
	const block = scope.block;
	if (block.effectEventRenderVersion === 0) block.effectEventRenderVersion = 1;
	let s = scope.hooks?.get(slot) as EffectEventCell | undefined;
	if (s === undefined) {
		s = { impl: fn, active: true };
		ensureHooks(scope).set(slot, s);
		const cell = s;
		scope.cleanups.push(() => {
			cell.active = false;
		});
	} else {
		enqueueEffectEventUpdate({
			cell: s,
			nextImpl: fn,
			block,
			renderVersion: block.effectEventRenderVersion,
		});
	}
	const cell = s;
	return ((...args: any[]) => {
		if (CURRENT_SCOPE !== null && EFFECT_EVENT_LIFECYCLE_DEPTH === 0) {
			throw new Error("A function wrapped in useEffectEvent can't be called during rendering.");
		}
		return cell.impl.apply(undefined, args);
	}) as F;
}

// ---------------------------------------------------------------------------
// Context — createContext + use() (React 19 shape; useContext provided as an alias)
// ---------------------------------------------------------------------------

const CONTEXT_TAG = Symbol.for('octane.context');
// Compiler-owned output caches compare their own lexical dependencies, but a
// Provider update is propagated lazily through the already-mounted Block tree
// rather than scheduling every consumer. One module-wide epoch lets generated
// cache guards notice that exceptional channel without retaining any concrete
// Context, boundary, or component identity in the runtime.
let COMPILER_CACHE_CONTEXT_EPOCH = 0;

export interface Context<T> {
	(props: { value: T; children?: any }, scope: Scope, extra?: unknown): void;
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
/* @__NO_SIDE_EFFECTS__ */
export function createContext<T>(defaultValue: T): Context<T> {
	// React 19 lets the Context itself serve as its Provider. Make the callable
	// provider the context object, then retain `.Provider` as an identity alias
	// for existing code and React 18-shaped libraries.
	const ctx = function ProviderBody(props, scope) {
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
			COMPILER_CACHE_CONTEXT_EPOCH++;
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
	} as Context<T>;
	ctx.$$kind = CONTEXT_TAG;
	ctx.defaultValue = defaultValue;
	ctx.$$version = 0;
	ctx.Provider = ctx;
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
		COMPILER_CACHE_CONTEXT_EPOCH++;
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
 * Compiler-emitted: attach markerless single-host-root metadata while a fresh
 * component function is still being initialized. The compiler only calls this
 * with an otherwise-unobserved function, so unused initializers are removable.
 * @internal
 */
export function markSingleRoot<T extends Function>(component: T): T {
	(component as any).$$singleRoot = true;
	return component;
}

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

// ---------------------------------------------------------------------------
// Deferred hydration — `<Hydrate when={...}>`
// ---------------------------------------------------------------------------

const HYDRATE_ID_SLOT = Symbol('octane.hydrate.id');
const HYDRATE_SETUP_SLOT = Symbol('octane.hydrate.setup');
const HYDRATE_NOTIFY_SLOT = Symbol('octane.hydrate.notify');
const HYDRATE_STRATEGY_TYPES = /* @__PURE__ */ new Set<HydrationWhen>([
	'load',
	'idle',
	'visible',
	'media',
	'interaction',
	'condition',
	'never',
	'dynamic',
]);
// Boundary-local interaction capture uses the same marker protocol as the
// lightweight pre-root event-capture module.
const HYDRATE_MARKER_SELECTOR = '[data-octane-hydrate-id]';

type HydrateLoadResult = ComponentBody | { default: ComponentBody };

type InternalHydrateProps = HydrateProps & {
	/** Compiler-injected split-child loader. */
	__load?: () => Promise<HydrateLoadResult>;
	/** Latest lexical values consumed by the compiler-generated split child. */
	__data?: unknown[];
};

interface HydrateSlot {
	__kind: 'hydrateBlockSlot';
	__flags: typeof SLOT_FLAG_TEARDOWN;
	__teardown: typeof teardownHydrateBoundary;
	block: Block;
	wrapper: HTMLDivElement;
	start: Comment;
	end: Comment;
	parentBlock: Block;
	props: InternalHydrateProps;
	boundaryId: string;
	intentBoundary: HydrationIntentBoundary;
	delegatedDynamicIntent: boolean;
	serverPreserved: boolean;
	/** Snapshot used instead of authored fallback for an initial SSR boundary. */
	preservedFallbackNodes: Node[] | null;
	seedRaw: string | null;
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
	hydrationWaiters: Set<(reason: HydrationPrefetchWaitReason) => void>;
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
}

function hydrateStrategyType(when: InternalHydrateProps['when']): HydrationWhen {
	return typeof when === 'function' ? 'dynamic' : (when?._t ?? 'dynamic');
}

function resolveHydrateStrategy(state: HydrateSlot): HydrationStrategy {
	const raw = state.props.when;
	let strategy: HydrationStrategy;
	if (typeof raw === 'function') {
		strategy = state.dynamicStrategy ?? raw();
	} else {
		strategy = raw;
	}
	if (
		strategy === null ||
		typeof strategy !== 'object' ||
		!HYDRATE_STRATEGY_TYPES.has((strategy as HydrationStrategy)._t)
	) {
		throw new Error(
			'Hydrate: `when` must synchronously return a hydration strategy with a valid type.',
		);
	}
	if (typeof raw === 'function') state.dynamicStrategy = strategy;
	state.strategy = strategy;
	return strategy;
}

function resolveHydrateLoadResult(value: HydrateLoadResult): ComponentBody {
	const body =
		value !== null && typeof value === 'object' && 'default' in value ? value.default : value;
	if (typeof body !== 'function') {
		throw new Error('Hydrate: the compiler-generated child loader did not resolve to a component.');
	}
	return body;
}

function renderHydrateChild(state: HydrateSlot, scope: Scope, extra: unknown): void {
	if (state.loadedBody !== null) {
		// The module is cached, but its captures are render data. Read the latest
		// array from props on every pass so prefetching and later parent updates do
		// not freeze the values that happened to exist when the chunk first loaded.
		state.loadedBody(state.props.__data, scope, extra);
		return;
	}
	childrenAsBody(state.props.children)(undefined, scope, extra);
}

function hydrateBoundaryBody(state: HydrateSlot): ComponentBody {
	const contentBody: ComponentBody = (_props, scope, extra) => {
		if (state.loadedBody === null) {
			const preload = beginHydratePreload(state);
			if (preload !== null) {
				// This internal code-chunk thenable is not application `use()` data and
				// must never consume a server seed. Track/throw it directly through the
				// enclosing tryBlock; the stable cached promise makes retries safe.
				const thenable = preload as TrackedThenable<void>;
				trackThenable(thenable);
				if (thenable.status === 'rejected') throw thenable.reason;
				if (thenable.status !== 'fulfilled') throw new SuspenseException(thenable);
			}
		}
		renderHydrateChild(state, scope, extra);
		state.hydrated = true;
		useEffect(() => notifyHydrateBoundary(state), [state], HYDRATE_NOTIFY_SLOT);
	};
	const pendingBody: ComponentBody = (_props, scope) => {
		if (state.serverPreserved && state.preservedFallbackNodes !== null) {
			// Initial-document boundaries keep showing their server result if their
			// first client attempt suspends. The authored fallback is exclusively for
			// a later/client-only mount. A slot sentinel prevents a pending-body
			// refresh from appending the snapshot twice; the pending Block's own range
			// removes these raw cloned nodes when the child is ready.
			if (scope.slots[0] === undefined) {
				for (let i = 0; i < state.preservedFallbackNodes.length; i++) {
					scope.block.parentNode.insertBefore(
						state.preservedFallbackNodes[i].cloneNode(true),
						scope.block.endMarker,
					);
				}
				scope.slots[0] = { __kind: 'hydratePreservedFallback' };
			}
			return;
		}
		childSlot(scope, 0, scope.block.parentNode, state.props.fallback, scope.block.endMarker);
	};
	return (_props, scope) => {
		tryBlock(
			scope,
			0,
			scope.block.parentNode,
			contentBody,
			null,
			pendingBody,
			scope.block.endMarker,
		);
	};
}

function failHydrateBoundary(state: HydrateSlot, error: unknown): void {
	if (state.hasError || state.block.disposed) return;
	state.hasError = true;
	state.error = error;
	scheduleRender(state.parentBlock);
}

function beginHydratePreload(state: HydrateSlot): Promise<void> | null {
	const load = state.props.__load;
	if (load === undefined) return null;
	if (state.preloadPromise !== null) return state.preloadPromise;
	let pending: Promise<HydrateLoadResult>;
	try {
		pending = load();
	} catch (error) {
		pending = Promise.reject(error);
	}
	const promise = Promise.resolve(pending).then((result) => {
		state.loadedBody = resolveHydrateLoadResult(result);
	});
	state.preloadPromise = promise;
	// Prefetch can start without a later hydration request. Keep a rejection from
	// becoming unhandled and route it through the boundary's normal render path.
	void promise.catch((error) => failHydrateBoundary(state, error));
	return promise;
}

function resolveHydrateWaiters(state: HydrateSlot, reason: HydrationPrefetchWaitReason): void {
	if (state.hydrationWaiters.size === 0) return;
	const waiters = [...state.hydrationWaiters];
	state.hydrationWaiters.clear();
	for (let i = 0; i < waiters.length; i++) waiters[i](reason);
}

function waitForHydratePrefetchStrategy(
	state: HydrateSlot,
	strategy: HydrationPrefetchStrategy,
): Promise<HydrationPrefetchWaitReason> {
	const controller = state.prefetchAbort;
	if (controller === null || controller.signal.aborted) return Promise.resolve('abort');
	// A procedural prefetch may begin in the same turn that `when` requests
	// hydration (load() is the common case). Preserve that already-fired signal
	// for late waitFor() subscribers instead of installing a strategy that can
	// now win only after the hydration request it was meant to race.
	if (state.activationRequested) return Promise.resolve('hydrate');
	return new Promise((resolve) => {
		const signal = controller.signal;
		let settled = false;
		let cleanup: (() => void) | void;
		const finish = (reason: HydrationPrefetchWaitReason) => {
			if (settled) return;
			settled = true;
			cleanup?.();
			state.hydrationWaiters.delete(onHydrate);
			signal.removeEventListener('abort', onAbort);
			resolve(reason);
		};
		const onHydrate = () => finish('hydrate');
		const onAbort = () => finish('abort');
		state.hydrationWaiters.add(onHydrate);
		signal.addEventListener('abort', onAbort, { once: true });
		cleanup = strategy._s?.({
			element: state.wrapper,
			prefetch: () => finish('prefetch'),
		});
		if (settled) cleanup?.();
	});
}

function beginProceduralHydratePrefetch(state: HydrateSlot): Promise<void> | null {
	const prefetch = state.props.prefetch;
	if (typeof prefetch !== 'function') return null;
	if (state.prefetchStarted) return state.prefetchPromise;
	state.prefetchStarted = true;
	const controller = (state.prefetchAbort = new AbortController());
	let result: ReturnType<HydrationPrefetchFunction>;
	try {
		result = prefetch({
			element: state.wrapper,
			signal: controller.signal,
			preload: () => beginHydratePreload(state) ?? Promise.resolve(),
			waitFor: (strategy) => waitForHydratePrefetchStrategy(state, strategy),
		});
	} catch (error) {
		failHydrateBoundary(state, error);
		return null;
	}
	if (result === undefined || result === null || typeof (result as any).then !== 'function') {
		return null;
	}
	const promise = Promise.resolve(result).then(() => undefined);
	state.prefetchPromise = promise;
	void promise.catch((error) => failHydrateBoundary(state, error));
	return promise;
}

function cleanupHydrateStrategy(state: HydrateSlot): void {
	state.strategyCleanup?.();
	state.strategyCleanup = null;
	state.gate = null;
}

function cleanupHydrateInstallers(state: HydrateSlot): void {
	cleanupHydrateStrategy(state);
	state.prefetchCleanup?.();
	state.prefetchCleanup = null;
}

function invalidateHydrateActivation(state: HydrateSlot): void {
	state.activationGeneration++;
	state.activationRequested = false;
	state.activationReady = false;
	if (state.serverPreserved) {
		// Once server activation enters the internal try slot, its Suspense resume
		// listener is independent of the request generation above. Supersede that
		// listener without removing the visible preserved-server pending block, and
		// let a later non-never strategy start a fresh activation attempt.
		const activationSlot = state.block.slots[0] as TrySlot | undefined;
		if (activationSlot?.__kind === 'trySlotSlot') activationSlot.pendingThenable = null;
		state.serverActivationStarted = false;
	}
	// An interaction that requested the cancelled activation must not replay if
	// the boundary is changed away from never() again at some later point.
	state.replays = [];
}

function teardownHydrateBoundary(state: HydrateSlot): void {
	cleanupHydrateInstallers(state);
	state.prefetchAbort?.abort();
	resolveHydrateWaiters(state, 'abort');
	unregisterHydrationIntentBoundary(state.wrapper, state.intentBoundary);
}

function resolveEventPath(root: Element, path: number[]): Element | null {
	let node: Element = root;
	for (let i = 0; i < path.length; i++) {
		const next = node.children[path[i]];
		if (next === undefined) return null;
		node = next;
	}
	return node;
}

function hydrateMarkerInteractionEvents(marker: Element): ReadonlyArray<string> | null {
	const when = marker.getAttribute(HYDRATE_WHEN_ATTR);
	if (when === 'dynamic') return HYDRATE_SUPPORTED_INTERACTION_EVENTS;
	if (when !== 'interaction') return null;
	const custom = marker.getAttribute(HYDRATE_INTERACTION_EVENTS_ATTR);
	return custom === null ? HYDRATE_DEFAULT_INTERACTION_EVENTS : custom.split(/\s+/).filter(Boolean);
}

function hydrateStrategyInteractionEvents(
	strategy: HydrationStrategy,
): ReadonlyArray<string> | null {
	if (strategy._t !== 'interaction') return null;
	const custom = strategy._a?.()?.[HYDRATE_INTERACTION_EVENTS_ATTR];
	return custom === undefined
		? HYDRATE_DEFAULT_INTERACTION_EVENTS
		: custom.split(/\s+/).filter(Boolean);
}

function queueHydrateIntent(state: HydrateSlot, intent: HydrationReplayIntent): void {
	if (state.hydrated || resolveHydrateStrategy(state)._t === 'never') return;
	state.replays.push(intent);
	requestHydrateBoundary(state);
}

function handleRegisteredHydrationIntent(
	state: HydrateSlot,
	eventType: string,
	intent?: HydrationReplayIntent,
): HydrationIntentBoundaryStatus {
	if (state.hydrated) return 'hydrated';
	const strategy = resolveHydrateStrategy(state);
	if (strategy._t === 'never') return 'never';
	const status = hydrateStrategyInteractionEvents(strategy)?.includes(eventType)
		? 'handles'
		: 'dormant';
	if (intent !== undefined) queueHydrateIntent(state, intent);
	return status;
}

function installHydrateInteraction(state: HydrateSlot, strategy: HydrationStrategy): () => void {
	const ownEvents =
		hydrateStrategyInteractionEvents(strategy) ??
		// A parent-first replay may carry conservative intent for a dynamic marker
		// whose strategy could not yet be evaluated. Resolved boundaries get none.
		(state.delegatedDynamicIntent ? HYDRATE_SUPPORTED_INTERACTION_EVENTS : []);
	const events = new Set<string>(ownEvents);
	const descendants = state.wrapper.querySelectorAll(HYDRATE_MARKER_SELECTOR);
	for (let i = 0; i < descendants.length; i++) {
		const nestedEvents = hydrateMarkerInteractionEvents(descendants[i]);
		if (nestedEvents !== null) {
			for (let j = 0; j < nestedEvents.length; j++) events.add(nestedEvents[j]);
		}
	}
	if (events.size === 0) return () => undefined;

	const onIntent = (event: Event) => {
		if (wasEarlyHydrationIntentHandled(event)) return;
		if (state.hydrated) return;
		const rawTarget = event.target;
		let target =
			rawTarget instanceof Element
				? rawTarget
				: rawTarget instanceof Node
					? rawTarget.parentElement
					: null;
		let marker: Element | null = target?.closest(HYDRATE_MARKER_SELECTOR) ?? state.wrapper;
		let matches = ownEvents.includes(event.type);
		const delegatedDynamicMarkers: Element[] = [];
		while (marker !== null && state.wrapper.contains(marker)) {
			if (marker !== state.wrapper) {
				const nestedEvents = hydrateMarkerInteractionEvents(marker);
				if (nestedEvents?.includes(event.type)) {
					matches = true;
					if (marker.getAttribute(HYDRATE_WHEN_ATTR) === 'dynamic') {
						delegatedDynamicMarkers.push(marker);
					}
				}
			}
			if (marker === state.wrapper) break;
			marker = marker.parentElement?.closest(HYDRATE_MARKER_SELECTOR) ?? null;
		}
		if (!matches) return;
		for (let i = 0; i < delegatedDynamicMarkers.length; i++) {
			markDelegatedDynamicHydrationIntent(delegatedDynamicMarkers[i]);
		}
		const path = hydrationEventPathWithin(state.wrapper, event.target);
		if (path === null) return;
		state.replays.push({ event, path });
		if (event.bubbles) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		}
		requestHydrateBoundary(state);
	};
	for (const eventName of events) state.wrapper.addEventListener(eventName, onIntent, true);
	return () => {
		for (const eventName of events) state.wrapper.removeEventListener(eventName, onIntent, true);
	};
}

function requestHydrateBoundary(state: HydrateSlot): void {
	if (state.hydrated || state.activationRequested || state.block.disposed) return;
	// A direct strategy prop can become never() after an earlier installer was
	// registered. Its cleanup should cancel normal callbacks, but guard here too:
	// a queued/custom callback that escaped cleanup must not bypass never's
	// intentionally-static contract.
	if (resolveHydrateStrategy(state)._t === 'never') return;
	const activationGeneration = ++state.activationGeneration;
	state.activationRequested = true;
	resolveHydrateWaiters(state, 'hydrate');

	const waits: Promise<void>[] = [];
	const prefetch = beginProceduralHydratePrefetch(state);
	if (prefetch !== null) waits.push(prefetch);
	const preload = beginHydratePreload(state);
	if (preload !== null) waits.push(preload);
	if (waits.length === 0) {
		state.activationReady = true;
		if (state.gate !== null) state.gate.resolved = true;
		if (CURRENT_BLOCK !== state.parentBlock) scheduleRender(state.parentBlock);
		return;
	}

	void Promise.all(waits).then(
		() => {
			if (
				state.block.disposed ||
				!state.activationRequested ||
				state.activationGeneration !== activationGeneration
			)
				return;
			state.activationReady = true;
			if (state.gate !== null) state.gate.resolved = true;
			scheduleRender(state.parentBlock);
		},
		(error) => {
			if (
				state.block.disposed ||
				!state.activationRequested ||
				state.activationGeneration !== activationGeneration
			)
				return;
			failHydrateBoundary(state, error);
		},
	);
}

function installHydrateBoundary(state: HydrateSlot): () => void {
	if (!state.serverPreserved || state.hydrated) return () => undefined;
	const strategy = resolveHydrateStrategy(state);
	if (strategy._t === 'never') {
		state.strategyCleanup = null;
	} else {
		const gate = {
			id: state.boundaryId,
			when: strategy._t,
			resolved: false,
			resolve: () => requestHydrateBoundary(state),
		};
		state.gate = gate;
		const strategyCleanup = strategy._s?.({ element: state.wrapper, gate });
		const interactionCleanup = installHydrateInteraction(state, strategy);
		state.strategyCleanup = () => {
			strategyCleanup?.();
			interactionCleanup();
		};
	}

	const prefetch = state.props.prefetch;
	if (typeof prefetch === 'function') {
		beginProceduralHydratePrefetch(state);
	} else if (prefetch !== undefined) {
		state.prefetchCleanup =
			prefetch._s?.({
				element: state.wrapper,
				prefetch: () => {
					const promise = beginHydratePreload(state);
					if (promise !== null) void promise.catch(() => undefined);
				},
			}) ?? null;
	}

	return () => teardownHydrateBoundary(state);
}

function findHydrateSeedSidecar(wrapper: Element): HTMLScriptElement | null {
	for (let node = wrapper.firstElementChild; node !== null; node = node.nextElementSibling) {
		if (node.localName === 'script' && node.hasAttribute(HYDRATE_SEED_ATTR)) {
			return node as HTMLScriptElement;
		}
	}
	return null;
}

function createHydrateSlot(
	props: InternalHydrateProps,
	scope: Scope,
	boundaryId: string,
): HydrateSlot {
	const parentBlock = scope.block;
	const parentNode = parentBlock.parentNode;
	const hydration = activeHydration();
	const expected = document.createElement('div');
	const wrapper = (hydration === null ? expected : hydration.clone(expected)) as HTMLDivElement;
	initializeHydrationEventCapture(wrapper.ownerDocument);
	let serverPreserved =
		hydration !== null && !hydration.isFresh(wrapper) && wrapper.parentNode === parentNode;
	if (wrapper.parentNode !== parentNode) parentNode.insertBefore(wrapper, parentBlock.endMarker);
	if (!wrapper.hasAttribute(HYDRATE_ID_ATTR)) wrapper.setAttribute(HYDRATE_ID_ATTR, boundaryId);
	if (!wrapper.hasAttribute(HYDRATE_WHEN_ATTR))
		wrapper.setAttribute(HYDRATE_WHEN_ATTR, hydrateStrategyType(props.when));

	let start: Comment;
	let end: Comment;
	let seedRaw: string | null = null;
	let idState = parentBlock.idState;
	if (serverPreserved && hydration!.isOpen(wrapper.firstChild)) {
		start = wrapper.firstChild as Comment;
		end = hydration!.close(start);
		const rawCount = wrapper.getAttribute(HYDRATE_ID_COUNT_ATTR);
		const parsedCount = rawCount === null ? 0 : Number(rawCount);
		const idCount = Number.isSafeInteger(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
		const rootIds = parentBlock.idState;
		const childStart = rootIds.next;
		rootIds.next += idCount;
		idState = {
			prefix: rootIds.prefix,
			next: childStart,
			limit: childStart + idCount,
			overflow: rootIds,
		};
		wrapper.removeAttribute(HYDRATE_ID_COUNT_ATTR);
		const seed = findHydrateSeedSidecar(wrapper);
		if (seed !== null) {
			seedRaw = seed.textContent || '[]';
			seed.remove();
		}
	} else {
		// An adopted wrapper without the boundary's own marker range is not safe to
		// hydrate: stale server children would otherwise remain beside the fresh
		// client range. Recover as a client-only mount inside the persistent wrapper.
		if (serverPreserved) {
			serverPreserved = false;
			wrapper.replaceChildren();
		}
		start = document.createComment('hydrate');
		end = document.createComment('/hydrate');
		wrapper.append(start, end);
	}

	const block = createBlock(
		'control-flow',
		parentBlock,
		wrapper,
		start,
		end,
		() => undefined,
		undefined,
	);
	block.idState = idState;
	let state!: HydrateSlot;
	const intentBoundary: HydrationIntentBoundary = (eventType, intent) =>
		handleRegisteredHydrationIntent(state, eventType, intent);
	state = {
		__kind: 'hydrateBlockSlot',
		__flags: SLOT_FLAG_TEARDOWN,
		__teardown: teardownHydrateBoundary,
		block,
		wrapper,
		start,
		end,
		parentBlock,
		props,
		boundaryId: wrapper.getAttribute(HYDRATE_ID_ATTR) ?? boundaryId,
		intentBoundary,
		delegatedDynamicIntent: takeDelegatedDynamicHydrationIntent(wrapper),
		serverPreserved,
		preservedFallbackNodes: null,
		seedRaw,
		idState,
		dynamicStrategy: null,
		strategy: null,
		gate: null,
		strategyCleanup: null,
		prefetchCleanup: null,
		prefetchAbort: null,
		prefetchStarted: false,
		prefetchPromise: null,
		preloadPromise: null,
		loadedBody: null,
		hydrationWaiters: new Set(),
		activationGeneration: 0,
		activationRequested: !serverPreserved,
		activationReady: !serverPreserved,
		serverActivationStarted: false,
		hydrated: false,
		didNotify: false,
		hasError: false,
		error: undefined,
		replays: [],
	};
	scope.slots[0] = state;
	registerSlot(scope, state);
	registerHydrationIntentBoundary(wrapper, intentBoundary);
	block.body = hydrateBoundaryBody(state);
	const initialStrategy = resolveHydrateStrategy(state);
	const pendingIntents = takePendingHydrationIntents(wrapper);
	if (serverPreserved && pendingIntents !== undefined && initialStrategy._t !== 'never') {
		state.replays.push(...pendingIntents);
		requestHydrateBoundary(state);
	} else if (serverPreserved) {
		const shouldDefer = initialStrategy._d ? initialStrategy._d() : initialStrategy._t !== 'load';
		if (!shouldDefer && initialStrategy._t !== 'never') requestHydrateBoundary(state);
	}
	return state;
}

function activateHydrateBoundary(state: HydrateSlot): void {
	const block = state.block;
	const activationSlot = block.slots[0] as TrySlot | undefined;
	if (!state.serverPreserved || activationSlot?.__kind === 'trySlotSlot') {
		// The original server arm can be adopted only once. A cancelled suspended
		// attempt leaves its internal try slot and preserved snapshot mounted; a
		// later strategy resumes that slot as client work instead of treating its
		// synthetic pending markers as untouched server HTML.
		renderBlock(block);
		return;
	}
	if (state.preservedFallbackNodes === null) {
		const snapshot: Node[] = [];
		for (let node = state.start.nextSibling; node !== null && node !== state.end; ) {
			snapshot.push(node.cloneNode(true));
			node = node.nextSibling;
		}
		state.preservedFallbackNodes = snapshot;
	}

	const hydration = new HydrationCapability(block, state.start.nextSibling, null);
	if (state.seedRaw !== null) hydration.seeds = hydration.parseSeeds(state.seedRaw);
	hydration.protectRootAnchor(state.end);
	const previousHydration = currentHydration;
	currentHydration = hydration;
	let completed = false;
	try {
		renderBlock(block);
		drainHydrationRenderPhaseUpdates(block);
		hydration.flushClassWrites();
		hydration.flushTextWarnings();
		// A first-attempt suspension deliberately leaves the internal try slot's
		// pending block live until its thenable resumes. Its cursor is parked on
		// that slot's close marker, so a normal root-remainder sweep would mistake
		// the still-owned close marker for stale server DOM and detach the anchor
		// the async retry needs. The pending path has already removed the abandoned
		// adopted arm; finish/coalesce only after this boundary actually commits.
		if (state.hydrated) {
			hydration.finishRoot();
			completed = true;
		}
	} finally {
		currentHydration = previousHydration;
	}
	if (completed && hydration.hasAdjacentRangePair) hydration.coalesce();
}

function notifyHydrateBoundary(state: HydrateSlot): void {
	if (state.didNotify || !state.hydrated) return;
	state.didNotify = true;
	// Keep intent capture alive while an asynchronously split child loads. A
	// pointerdown commonly requests hydration before the browser dispatches the
	// corresponding click; removing listeners at request time would lose that
	// click instead of replaying the complete interaction once hydration commits.
	cleanupHydrateInstallers(state);
	state.props.onHydrated?.();
	state.wrapper.removeAttribute(HYDRATE_WHEN_ATTR);
	state.strategy?._o?.(state.boundaryId);
	const replays = state.replays;
	state.replays = [];
	for (let i = 0; i < replays.length; i++) {
		const replay = replays[i];
		const target = resolveEventPath(state.wrapper, replay.path);
		if (target !== null) {
			const event = replay.event;
			// `click` is the platform exception among untrusted events: dispatching
			// the clone still runs its native activation behavior, so links navigate
			// and submit controls submit unless a hydrated handler prevents default.
			// Keep dispatchEvent here to preserve the original mouse-event metadata.
			target.dispatchEvent(
				typeof MouseEvent !== 'undefined' && event instanceof MouseEvent
					? new MouseEvent(event.type, event)
					: typeof FocusEvent !== 'undefined' && event instanceof FocusEvent
						? new FocusEvent(event.type, event)
						: new Event(event.type, event),
			);
		}
	}
}

/**
 * Defer the initial hydration of server-rendered children until `when` resolves.
 * A boundary first mounted on the client renders immediately; only existing SSR
 * HTML can be left dormant.
 */
function initializeHydrateComponent(): ComponentBody<HydrateProps> {
	return markComponentFlags<ComponentBody<HydrateProps>>(
		function Hydrate(rawProps, scope) {
			const props = rawProps as InternalHydrateProps;
			const boundaryId = useId(HYDRATE_ID_SLOT);
			let state = scope.slots[0] as HydrateSlot | undefined;
			let renderedChild = false;
			if (state === undefined) {
				state = createHydrateSlot(props, scope, boundaryId);
			} else {
				state.props = props;
				// A surrounding update makes preserved server HTML potentially stale. Match
				// the correctness-first contract by opening the boundary, except for never().
				if (!state.hydrated) {
					const strategy = resolveHydrateStrategy(state);
					if (strategy._t === 'never') {
						// Only the hydration trigger changes here. Preparation has an independent
						// lifecycle, so do not abort procedural prefetch or resolve waitFor() as
						// though the still-mounted boundary had unmounted.
						cleanupHydrateStrategy(state);
						invalidateHydrateActivation(state);
					} else if (!state.activationRequested) {
						requestHydrateBoundary(state);
					}
				}
			}

			if (state.hasError) throw state.error;
			if (
				!state.hydrated &&
				state.activationReady &&
				(!state.serverPreserved || !state.serverActivationStarted)
			) {
				// A first attempt can suspend after replacing the adopted arm with its
				// preserved-server pending block. From that point the internal try slot owns
				// the thenable and resume path; re-entering here on a parent update would
				// remount that pending block and abandon the in-flight attempt. Client-only
				// boundaries keep re-entering so new props can supersede suspended data.
				if (state.serverPreserved) state.serverActivationStarted = true;
				try {
					activateHydrateBoundary(state);
				} catch (error) {
					// A synchronous render error did not leave a resumable try path behind.
					// Let an enclosing error boundary retry this activation after reset.
					if (state.serverPreserved) state.serverActivationStarted = false;
					throw error;
				}
				renderedChild = true;
			} else if (state.hydrated && !renderedChild) {
				renderBlock(state.block);
			}

			useEffect(() => installHydrateBoundary(state!), [state], HYDRATE_SETUP_SLOT);
		},
		COMPONENT_FLAG_BOUNDARY,
		'Hydrate',
	);
}

export const Hydrate: ComponentBody<HydrateProps> = /* @__PURE__ */ initializeHydrateComponent();

/**
 * `<Suspense fallback={…}>…</Suspense>` — the JSX component form of
 * `@try { … } @pending { fallback }`, for authors writing JSX rather than the
 * template directives (e.g. porting React / react-query code). A thin built-in
 * over the same `tryBlock` primitive the directives compile to: the children
 * render as the try body, and `fallback` renders as the pending body whenever a
 * descendant suspends (via `use(thenable)`).
 */
export const Suspense: ComponentBody<{ fallback?: unknown; children: ComponentBody }> =
	/* @__PURE__ */ markComponentFlags<
		ComponentBody<{ fallback?: unknown; children: ComponentBody }>
	>(
		function Suspense(props, scope) {
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
		},
		COMPONENT_FLAG_BOUNDARY,
		'Suspense',
	);

/**
 * `<ViewTransition>` — a transparent boundary that opts its subtree into
 * browser View Transitions on transition-lane commits (enter on insert, exit
 * on delete, update on inner mutation — see the View Transitions block above
 * and docs/view-transitions-plan.md). Renders its children unchanged; all
 * animation machinery lives in the flush controller. Boundary-flagged like
 * Suspense/ErrorBoundary (M3 inherit-decline), so its block always owns an
 * exact DOM range without ordinary component slots retaining its implementation.
 */
function initializeViewTransitionComponent(): ComponentBody<ViewTransitionProps> {
	return markComponentFlags<ComponentBody<ViewTransitionProps>>(
		function ViewTransition(props, scope) {
			const block = scope.block;
			ensureViewTransitionDriver().renderBoundary(block, props);
			childSlot(scope, 0, block.parentNode, props.children, block.endMarker);
		},
		COMPONENT_FLAG_BOUNDARY,
		'ViewTransition',
	);
}

export const ViewTransition: ComponentBody<ViewTransitionProps> =
	/* @__PURE__ */ initializeViewTransitionComponent();

/**
 * `<ErrorBoundary fallback={…}>…</ErrorBoundary>` — the JSX component form of
 * `@try { … } @catch (e) { fallback }`. `fallback` is either a renderable or a
 * `(error, reset) => renderable` render prop (react-error-boundary style). When a
 * descendant throws during render/effects, the boundary swaps to the fallback.
 * Suspensions propagate to an enclosing Suspense boundary instead.
 */
export const ErrorBoundary: ComponentBody<{
	fallback?: unknown | ((error: unknown, reset: () => void) => unknown);
	children: ComponentBody;
}> = /* @__PURE__ */ markComponentFlags<
	ComponentBody<{
		fallback?: unknown | ((error: unknown, reset: () => void) => unknown);
		children: ComponentBody;
	}>
>(
	function ErrorBoundary(props, scope) {
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
			undefined,
			true,
		);
	},
	COMPONENT_FLAG_BOUNDARY,
	'ErrorBoundary',
);

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
/**
 * Structural view of a foreign host-renderer context (a real `React.Context<T>`
 * inside an `octane/react` island). Deliberately matches React 19's Consumer
 * shape WITHOUT importing React types — core stays host-agnostic; only hosted
 * roots can actually resolve one (§6.2).
 */
export interface ForeignHostContext<T> {
	readonly Consumer: (props: { children: (value: T) => any }) => any;
}

export function use<T>(
	usable: Context<T> | PromiseLike<T> | TrackedThenable<T> | ForeignHostContext<T>,
): T {
	if (usable && (usable as any).$$kind === CONTEXT_TAG) {
		return useContextInternal(usable as Context<T>);
	}
	if (usable == null || typeof (usable as any).then !== 'function') {
		// Cold path: not an Octane context, not a thenable. Under a hosted root
		// this may be a FOREIGN host-renderer context (a real React context
		// inside an octane/react island) — the owner bridge resolves it to a
		// root-local mirror. Normal roots fall through to the diagnostic.
		return useForeignContext(usable, 'use');
	}
	return useThenable(usable as TrackedThenable<T>);
}

// React 19 context objects carry $$typeof: Symbol.for('react.context') — used
// ONLY to sharpen the out-of-hosted-root diagnostic, never as a read strategy.
const REACT_FOREIGN_CONTEXT_TAG = /* @__PURE__ */ Symbol.for('react.context');

/**
 * Resolve a non-Octane usable through the enclosing renderer-region owner
 * (docs/react-hosted-octane-compat-plan.md §6.2). Kept out of `use()` so the
 * hot paths carry no extra code; only already-failing calls reach here.
 */
function useForeignContext<T>(usable: unknown, api: string): T {
	if (usable !== null && typeof usable === 'object') {
		const bridge = rendererRegionOwnerForBlock(CURRENT_BLOCK);
		const mirror = bridge?.resolveForeignContext?.(usable as object);
		if (mirror != null) return useContextInternal(mirror as Context<T>);
		if ((usable as { $$typeof?: unknown }).$$typeof === REACT_FOREIGN_CONTEXT_TAG) {
			throw new Error(
				`${api}(): a React context can only be read inside a React-hosted Octane ` +
					'island (see octane/react); this component is not rendered under one.',
			);
		}
	}
	throw new Error(`${api}(): argument is not a Context nor a thenable`);
}

/**
 * Internal renderer-boundary variant of `use(thenable)`. A universal root owns
 * and memoizes each suspended attempt, so a different thenable on resume is an
 * authoritative next dependency rather than an uncached user promise. Replace
 * the stored thenable even during resume replay so a sequential A -> B
 * suspension keeps the outer host fallback visible until B settles.
 */
export function useRendererThenable<T>(thenable: PromiseLike<T>): T {
	return useThenable(thenable as TrackedThenable<T>, true);
}

/**
 * React's `useContext(Context)` — reads the nearest Provider's value (or the
 * context default). A thin alias for the context branch of `use()`: context
 * reads carry no per-call-site state, so there is no hook slot and the compiler
 * needs no rewrite. Provided for React familiarity; `use(Context)` is the
 * React-19 idiom and remains the primary form.
 */
export function useContext<T>(context: Context<T> | ForeignHostContext<T>): T {
	if (context && (context as any).$$kind === CONTEXT_TAG) {
		return useContextInternal(context as Context<T>);
	}
	// Same cold foreign-context path as `use()` — a real React context resolves
	// through the hosted owner; anything else gets the targeted diagnostic
	// (previously a non-context read silently produced `undefined`).
	return useForeignContext(context, 'useContext');
}

// Sentinel cached in a consumer's resolved-provider slots to mean "no provider —
// use the context's default". Distinct from `undefined` (a cache miss) so a
// resolved default is an O(1) hit rather than a re-walk to the root every read.
const DEFAULT_CTX: unique symbol = Symbol('octane.ctx.default');

function rendererRegionOwnerForBlock(block: Block | null): RendererRegionOwnerBridge | null {
	let current = block;
	while (current !== null) {
		const bridge = RENDERER_REGION_DOM_OWNERS.get(current);
		if (bridge !== undefined && bridge.active) return bridge;
		current = current.parentBlock;
	}
	return null;
}

function rendererRegionTryHandler(block: Block | null): ((error: unknown) => void) | null {
	const bridge = rendererRegionOwnerForBlock(block);
	if (bridge === null) return null;
	return (error) => {
		if (!bridge.routeError(error)) throw error;
	};
}

function rendererRegionSuspenseHandler(
	block: Block | null,
): ((thenable: PromiseLike<unknown>) => void) | null {
	const bridge = rendererRegionOwnerForBlock(block);
	if (bridge === null) return null;
	return (thenable) => {
		if (!bridge.routeSuspense(thenable)) throw new SuspenseException(thenable);
	};
}

/**
 * Compiler ABI for a DOM component materialized from a reverse renderer region.
 * The bridge is deliberately attached only to the owning DOM root; normal DOM
 * blocks retain no renderer fields or dispatch branches.
 */
export function bindRendererRegionOwner(props: unknown): void {
	const bridge = (props as any)?.[RENDERER_REGION_OWNER] as RendererRegionOwnerBridge | undefined;
	if (bridge === undefined) {
		throw new Error('A renderer-owned DOM region is missing its universal owner bridge.');
	}
	if (CURRENT_BLOCK === null || CURRENT_SCOPE === null) {
		throw new Error('bindRendererRegionOwner() must run while a DOM component is rendering.');
	}
	if (
		CURRENT_BLOCK.kind !== 'root' ||
		CURRENT_BLOCK.parentBlock !== null ||
		CURRENT_SCOPE !== CURRENT_BLOCK
	) {
		throw new Error(
			'bindRendererRegionOwner() must be the first call in a renderer-owned DOM root component.',
		);
	}
	const root = CURRENT_BLOCK;
	// hydrateRoot() runs its adoption pass BEFORE the Root object (and its
	// disposer) exists, so a hydrating owned root is bound with a LAZY disposer
	// lookup; every other caller must already have a live root.
	if (DOM_ROOT_DISPOSERS.get(root) === undefined && currentHydration?.rootBlock !== root) {
		throw new Error('A renderer-owned DOM region requires a live DOM root.');
	}
	const previous = RENDERER_REGION_DOM_BINDINGS.get(root);
	if (previous?.bridge === bridge) return;
	// A distinct callback avoids deleting a newly-registered disposer when two
	// successive descriptor bridges share one committed lifecycle cell. The
	// lookup is lazy so a disposer registered after a hydration pass is honored.
	const dispose = () => DOM_ROOT_DISPOSERS.get(root)?.();
	const release = bridge.registerDispose(dispose);
	previous?.release();
	const binding = { bridge, release };
	RENDERER_REGION_DOM_BINDINGS.set(root, binding);
	RENDERER_REGION_DOM_OWNERS.set(root, bridge);
	root.$$ctxCache?.clear();
	if (previous === undefined) {
		root.cleanups.push(() => {
			const current = RENDERER_REGION_DOM_BINDINGS.get(root);
			if (current === undefined) return;
			current.release();
			RENDERER_REGION_DOM_BINDINGS.delete(root);
			RENDERER_REGION_DOM_OWNERS.delete(root);
		});
	}
}

// ---------------------------------------------------------------------------
// Hosted-root control signal (§6.3 HostContextRequest): thrown by an owner
// bridge's readContext when a foreign-context read cannot be satisfied
// synchronously. handleRenderError recognizes it BEFORE local boundary
// routing, so island @catch/@pending arms never observe it; the owner
// receives the carried thenable through routeSuspense and settles it once
// the authoritative host value has committed.
// ---------------------------------------------------------------------------

const HOST_CONTEXT_REQUEST_TAG = Symbol.for('octane.host-context-request');

interface HostContextRequestSignal {
	$$kind: typeof HOST_CONTEXT_REQUEST_TAG;
	thenable: PromiseLike<unknown>;
}

/**
 * Build the §6.3 control signal for an owner bridge to THROW from
 * `readContext`. The thenable must settle when the owner has committed the
 * requested foreign value; the owner then retries the owned root.
 * @internal owner-bridge ABI (octane/react and future hosts).
 */
/* @__NO_SIDE_EFFECTS__ */
export function createHostContextRequest(thenable: PromiseLike<unknown>): HostContextRequestSignal {
	return { $$kind: HOST_CONTEXT_REQUEST_TAG, thenable };
}

function isHostContextRequest(err: unknown): err is HostContextRequestSignal {
	return (
		err !== null &&
		typeof err === 'object' &&
		(err as { $$kind?: unknown }).$$kind === HOST_CONTEXT_REQUEST_TAG
	);
}

function recordContextDependency(block: Block | null, context: Context<any>): void {
	if (block === null || !block.memoInChain) return;
	(block.$$ctxDirect ??= new Map()).set(context, context.$$version);
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if ((current.body as any)?.__memo === true || current.$$implicitBail === true) {
			(current.$$ctxReads ??= new Map()).set(context, context.$$version);
		}
	}
}

function readContextFrom<T>(reader: Scope | null, block: Block | null, context: Context<T>): T {
	if (reader !== null && reader.$$ctxCache !== null) {
		const hit = reader.$$ctxCache.get(context);
		if (hit !== undefined) {
			if (hit === DEFAULT_CTX) {
				const bridge = rendererRegionOwnerForBlock(block);
				return bridge === null ? context.defaultValue : bridge.readContext(context);
			}
			return (hit as Scope).$$ctxValues!.get(context) as T;
		}
	}

	let scope: Scope | null = reader;
	while (scope !== null) {
		const values = scope.$$ctxValues;
		if (values !== null && values.has(context)) {
			if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, scope);
			return values.get(context) as T;
		}
		scope = scope.parent;
	}
	let current = block?.parentBlock ?? null;
	while (current !== null) {
		const values = current.$$ctxValues;
		if (values !== null && values.has(context)) {
			if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, current);
			return values.get(context) as T;
		}
		current = current.parentBlock;
	}
	const bridge = rendererRegionOwnerForBlock(block);
	if (bridge !== null) return bridge.readContext(context);
	if (reader !== null) (reader.$$ctxCache ??= new Map()).set(context, DEFAULT_CTX);
	return context.defaultValue;
}

/** @internal Live context reader rooted at a captured DOM boundary scope. */
export function readContextFromScope<T>(scope: Scope, context: Context<T>): T {
	recordContextDependency(scope.block, context);
	return readContextFrom(scope, scope.block, context);
}

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
	recordContextDependency(CURRENT_BLOCK, context);
	return readContextFrom(CURRENT_SCOPE, CURRENT_BLOCK, context);
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

const HYDRATION_REJECTION_SEED = Symbol('octane.hydration.rejection-seed');
const HYDRATION_REJECTION_EXCEPTION = Symbol('octane.hydration.rejection-exception');

interface HydrationRejectionSeed {
	[HYDRATION_REJECTION_SEED]: unknown;
}

class HydrationRejectionException {
	readonly [HYDRATION_REJECTION_EXCEPTION] = true;
	constructor(readonly reason: unknown) {}
}

function decodeHydrationRejectionPayload(payload: any): unknown {
	if (payload === null || typeof payload !== 'object') {
		return new Error('Server-rendered use() rejected');
	}
	switch (payload.kind) {
		case 'value':
			return payload.value;
		case 'number':
			switch (payload.value) {
				case 'NaN':
					return NaN;
				case 'Infinity':
					return Infinity;
				case '-Infinity':
					return -Infinity;
				case '-0':
					return -0;
				default:
					return new Error('Server-rendered use() rejected');
			}
		case 'bigint':
			try {
				return BigInt(payload.value);
			} catch {
				return String(payload.value);
			}
		case 'symbol':
			return Symbol(typeof payload.value === 'string' ? payload.value : '');
		case 'error': {
			const error = new Error(
				typeof payload.message === 'string' ? payload.message : 'Server-rendered use() rejected',
			);
			if (typeof payload.name === 'string') error.name = payload.name;
			const fields = payload.fields;
			if (fields !== null && typeof fields === 'object') {
				for (const key of Object.keys(fields)) {
					Object.defineProperty(error, key, {
						value: fields[key],
						writable: true,
						enumerable: true,
						configurable: true,
					});
				}
			}
			return error;
		}
		case 'fallback':
			return typeof payload.message === 'string'
				? payload.message
				: 'Server-rendered use() rejected';
		default:
			return new Error('Server-rendered use() rejected');
	}
}

function hydrationRejectionFromSeed(seed: unknown): HydrationRejectionException | null {
	if (
		seed === null ||
		typeof seed !== 'object' ||
		!Object.prototype.hasOwnProperty.call(seed, HYDRATION_REJECTION_SEED)
	)
		return null;
	return new HydrationRejectionException(
		(seed as HydrationRejectionSeed)[HYDRATION_REJECTION_SEED],
	);
}

function isHydrationRejection(error: unknown): error is HydrationRejectionException {
	return (
		error !== null &&
		typeof error === 'object' &&
		(error as HydrationRejectionException)[HYDRATION_REJECTION_EXCEPTION] === true
	);
}

/**
 * Hydration uses the server's settled value/reason as the canonical first-render
 * result, but evaluating the client component has already created its matching
 * thenable. Observe that thenable without letting its eventual result replace
 * the seed. Otherwise a later client-side rejection is reported as unhandled
 * even though the authored use() is visibly handled by its hydrated @catch arm.
 */
function observeHydrationSeedThenable(thenable: TrackedThenable<unknown>): void {
	thenable.then(
		() => undefined,
		() => undefined,
	);
}

function hasExternalHydrationOwner(thenable: PromiseLike<unknown>): boolean {
	try {
		return (thenable as any)[EXTERNAL_HYDRATION_PROMISE] === true;
	} catch {
		return false;
	}
}

function useThenable<T>(thenable: TrackedThenable<T>, replaceOnResume = false): T {
	const block = CURRENT_BLOCK!;
	const state: TrackedThenable<any>[] = ((block as any).__thenables ??= []);
	const idx = block.__thenableIdx;
	block.__thenableIdx = idx + 1;

	// Hydration seeding (SSR Phase 4): the server already resolved this use() and
	// serialized the value. Adopt the next seeded value (use() calls hydrate in
	// the same render order the server produced them in) and mark the thenable
	// fulfilled, so this render and every later one return synchronously — no
	// re-suspend, no client re-fetch. Folds out for client-only builds.
	const hydration = activeHydration();
	if (
		!hasExternalHydrationOwner(thenable) &&
		hydration !== null &&
		hydration.seeds !== null &&
		hydration.seedCursor < hydration.seeds.length
	) {
		const seed = hydration.seeds[hydration.seedCursor++];
		observeHydrationSeedThenable(thenable);
		const rejection = hydration.rejectionFromSeed(seed);
		if (rejection !== null) {
			thenable.status = 'rejected';
			thenable.reason = rejection.reason;
			state[idx] = thenable;
			throw rejection;
		}
		const value = seed as T;
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
	if (stored !== undefined && RESUME_REPLAY && !replaceOnResume) {
		if (process.env.NODE_ENV !== 'production') warnUncachedUsePromise(block);
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
	if (
		process.env.NODE_ENV !== 'production' &&
		RESUME_REPLAY &&
		idx > 0 &&
		state[idx - 1] !== undefined
	)
		warnUseWaterfall(block, idx);
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
// (docs/suspense-parallel-use-plan.md; emitted by the compiler as _$useBatch /
// _$warmMemo / _$warmChild.)
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
			'component or cache it. The compiler automatically memoizes analyzable ' +
			'component-local use() arguments per call site.',
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
			'use(). The compiler does this automatically for analyzable independent ' +
			'component-local arguments.',
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
 * `warm` is the compiler-built fetch-tree thunk. On an empty compiler batch it
 * registers lazily for the active component frame; on a throwing data batch,
 * it joins every registered ancestor plan and prefetches provably-independent
 * descendants via warmChild/warmMemo. A resolved batch costs no warm work.
 */
export function useBatch(items: any[], warm?: () => void): void {
	// Compiler registration form: publish the component's child-only plan on
	// the active render stack. It is intentionally lazy — a fully synchronous
	// tree neither walks its children nor allocates a warm cache.
	if (items.length === 0) {
		if (warm !== undefined) ACTIVE_WARM_PLANS.push({ block: CURRENT_BLOCK!, fn: warm });
		return;
	}
	// Hydrating: every use() adopts a server seed synchronously — nothing to
	// batch, and warming would duplicate fetches the server already resolved.
	const hydration = activeHydration();
	if (hydration !== null && hydration.seeds !== null) return;
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
	runActiveWarmPlans(warm);
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
// A warm cache is a per-block Map<slot, Array<{deps, value, available}>>
// populated by warmMemo during a suspended body's warm walk and consumed once
// by useMemo when the real descendant mounts. Equal-dependency occurrences get
// separate entries. A consumed entry remains as a tombstone so a later pending
// stratum cannot restart that speculative creation. The cache lives on the
// outermost active plan's block, making it visible to adjacent descendants
// through their parentBlock chains. Its episode tag makes every entry
// unreachable on the next ordinary render, while preserving it across retries
// and dependency strata of the current suspend.

interface WarmEntry {
	deps: any[];
	value: any;
	/** Real memo cell represented by an unavailable entry, when applicable. */
	source?: object;
	/** A warmed value may be adopted once; the retained tombstone still prevents
	 * a later dependency stratum from speculatively creating it again. */
	available: boolean;
}
let CURRENT_WARM: Map<HookSlot, WarmEntry[]> | null = null;
let CURRENT_WARM_CLAIMS: Set<object> | null = null;
/** Flips true forever on first warm — gates useMemo's ancestor walk so apps
 * that never warm never pay for it. */
let WARM_EVER = false;
let WARM_DEPTH = 0;
const WARM_DEPTH_CAP = 64;
// Do not cap per-slot occurrence queues: dropping their FIFO head would map a
// repeated component instance to a later instance's value. The whole cache is
// invalidated when the next ordinary render starts a new suspend episode.
const WARM_MISS = Symbol('octane.warm.miss');

function warmCacheForOwner(owner: Block): Map<HookSlot, WarmEntry[]> {
	for (let block: Block | null = owner; block !== null; block = block.parentBlock) {
		if ((block as any).__warmCacheEpisode !== CURRENT_WARM_EPISODE) continue;
		const existing = (block as any).__warmCache as Map<HookSlot, WarmEntry[]> | undefined;
		if (existing !== undefined) return existing;
	}
	const cache = new Map<HookSlot, WarmEntry[]>();
	(owner as any).__warmCache = cache;
	(owner as any).__warmCacheEpisode = CURRENT_WARM_EPISODE;
	return cache;
}

// A real memo that executes while an ancestor warm plan is live represents one
// concrete component occurrence. Retain an unavailable entry for this episode
// so a later sibling's suspension does not speculatively refetch it. Repeated
// same-site instances intentionally append repeated entries; a warm walk claims
// them in traversal order.
function recordRealWarmMemo(slot: HookSlot, deps: any[], source: object): boolean {
	const block = CURRENT_BLOCK;
	if (block === null) return false;
	let owner: Block | null = null;
	for (let i = 0; i < ACTIVE_WARM_PLANS.length; i++) {
		const plan = ACTIVE_WARM_PLANS[i];
		if (!blockIsAncestor(plan.block, block)) continue;
		owner = plan.block;
		break;
	}
	if (owner === null) return false;
	const cache = warmCacheForOwner(owner);
	let list = cache.get(slot);
	if (list === undefined) {
		list = [];
		cache.set(slot, list);
	}
	list.push({ deps, value: undefined, available: false, source });
	WARM_EVER = true;
	return true;
}

function runWarm(fn: () => void, owner: Block = CURRENT_BLOCK!): void {
	// Reuse the nearest OWNER ancestor's cache when one exists: a descendant that
	// suspends mid-cascade re-warms its own subtree, and its entries must
	// dedup against what the ancestor's walk already started (one cache per
	// warming subtree, not per suspending block). Starting at owner is important:
	// a stale source-child cache is not visible to adjacent siblings warmed by an
	// enclosing plan.
	const cache = warmCacheForOwner(owner);
	WARM_EVER = true;
	const prev = CURRENT_WARM;
	const prevClaims = CURRENT_WARM_CLAIMS;
	CURRENT_WARM = cache;
	CURRENT_WARM_CLAIMS = new Set();
	try {
		fn();
	} catch {
		// Warming is speculative — it must never break the render that
		// triggered it. A throwing warm plan just means fewer prefetches.
	} finally {
		CURRENT_WARM = prev;
		CURRENT_WARM_CLAIMS = prevClaims;
	}
}

function blockIsAncestor(ancestor: Block, block: Block): boolean {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current === ancestor) return true;
	}
	return false;
}

/** Activate every registered plan that encloses the throwing batch. The cache
 * lives on the outermost participating block, making warmed entries visible to
 * adjacent descendants as well as the source branch. */
function runActiveWarmPlans(local?: () => void): void {
	const block = CURRENT_BLOCK!;
	let plans: ActiveWarmPlan[] | null = null;
	let owner = block;
	for (let i = 0; i < ACTIVE_WARM_PLANS.length; i++) {
		const plan = ACTIVE_WARM_PLANS[i];
		if (!blockIsAncestor(plan.block, block)) continue;
		(plans ??= []).push(plan);
		if (plans.length === 1) owner = plan.block;
	}
	if (plans === null && local === undefined) return;
	runWarm(() => {
		if (plans !== null) {
			for (let i = 0; i < plans.length; i++) {
				CURRENT_WARM_CLAIMS = new Set();
				try {
					plans[i].fn();
				} catch {
					// Each speculative plan is independent. One throwing getter or
					// creation must not prevent adjacent plans from warming.
				}
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
	}, owner);
}

function activeMemoMatch(slot: HookSlot, deps: any[]): object | null {
	for (let block: Block | null = CURRENT_BLOCK; block !== null; block = block.parentBlock) {
		const entry = block.hooks?.get(slot) as { deps?: any[] } | undefined;
		if (
			entry !== undefined &&
			entry.deps !== undefined &&
			!depsChanged(entry.deps, deps) &&
			!CURRENT_WARM_CLAIMS?.has(entry)
		) {
			return entry;
		}
	}
	return null;
}

/**
 * Start (and cache) one prefetched creation. Each warm-plan occurrence claims
 * one matching (slot, deps) entry, so retries reuse the same concrete work while
 * repeated equal-dependency component instances still get separate entries.
 * The value is status-tagged immediately so the real use() unwrap reads it
 * directly.
 */
export function warmMemo(compute: () => any, deps: any[], slot: HookSlot): void {
	const cache = CURRENT_WARM;
	if (cache === null) return;
	let list = cache.get(slot);
	if (list !== undefined) {
		for (let i = 0; i < list.length; i++) {
			const entry = list[i];
			if (depsChanged(entry.deps, deps) || CURRENT_WARM_CLAIMS?.has(entry)) continue;
			CURRENT_WARM_CLAIMS?.add(entry);
			if (entry.source !== undefined) CURRENT_WARM_CLAIMS?.add(entry.source);
			return; // this concrete occurrence already ran or warmed
		}
	}
	// An ancestor plan can recurse through the component whose real memo already
	// created this value before its batch discovered suspension. Record a consumed
	// tombstone instead of duplicating that creation; later strata then remain
	// deduped even after the active component has returned.
	const activeMemo = activeMemoMatch(slot, deps);
	if (activeMemo !== null) {
		CURRENT_WARM_CLAIMS?.add(activeMemo);
		if (list === undefined) {
			list = [];
			cache.set(slot, list);
		}
		const entry = { deps, value: undefined, available: false, source: activeMemo };
		list.push(entry);
		CURRENT_WARM_CLAIMS?.add(entry);
		return;
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
	const entry = { deps, value, available: true };
	list.push(entry);
	CURRENT_WARM_CLAIMS?.add(entry);
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
 * slot with matching deps. The value is consumed once; its tombstone remains
 * to dedup later warm passes without being adoptable by another instance. */
function adoptWarmValue(slot: HookSlot, deps: any[]): any {
	let b: Block | null = CURRENT_BLOCK;
	while (b !== null) {
		const cache: Map<HookSlot, WarmEntry[]> | undefined = (b as any).__warmCache;
		if ((b as any).__warmCacheEpisode === CURRENT_WARM_EPISODE && cache !== undefined) {
			const list = cache.get(slot);
			if (list !== undefined) {
				for (let i = 0; i < list.length; i++) {
					if (!depsChanged(list[i].deps, deps)) {
						if (!list[i].available) continue;
						list[i].available = false;
						return list[i].value;
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

const LAZY_COMPONENT = Symbol.for('octane.lazy');

function lazyResolvedProps(comp: ComponentBody<any>, props: any): any {
	const defaults = (comp as any).defaultProps;
	if (defaults == null || typeof defaults !== 'object') return props;
	let resolved = props;
	for (const key of Object.keys(defaults)) {
		if (props == null || props[key] === undefined) {
			if (resolved === props) resolved = props == null ? {} : { ...props };
			resolved[key] = defaults[key];
		}
	}
	return resolved;
}

/**
 * Resolve a lazy module payload to its component. Accepts React's canonical
 * `{ default: Component }` (a dynamic `import()` namespace) and — as a
 * pragmatic extension — a bare component function, so `lazy(() =>
 * import('./x').then((m) => m.Named))` works without a `{ default }` shim.
 */
function resolveLazyModule(mod: any): ComponentBody<any> {
	let comp = mod;
	if (mod != null) {
		const defaultExport = mod.default;
		if (defaultExport !== undefined) comp = defaultExport;
	}
	if (typeof comp !== 'function' || (comp as any)[LAZY_COMPONENT] === true) {
		throw new Error(
			'lazy: expected the load() promise to resolve to a component function or a ' +
				"module with a component as its default export, got '" +
				((comp as any)?.[LAZY_COMPONENT] === true ? 'lazy component' : typeof comp) +
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
/* @__NO_SIDE_EFFECTS__ */
export function lazy<C extends ComponentBody<any>>(load: () => PromiseLike<{ default: C } | C>): C {
	let status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected' = 'uninitialized';
	let result: any = null; // fulfilled → module value; rejected → the reason
	let thenable: TrackedThenable<any> | null = null;
	let profiledComponent: ComponentBody<any> | null = null;
	let memoMetadataInstalled = false;
	let lazyWrapper!: ComponentBody<any>;

	const callResolvedComponent = (props: any, scope: Scope, extra: any): unknown => {
		// Keep the module object, rather than only its current `.default` value. A
		// throwing/accessor default export is a render-time failure in React: a later
		// render reads it again without re-running the loader.
		const comp = resolveLazyModule(result);
		if ((comp as any).__memo === true) {
			// The lazy wrapper owns the live Block, so a resolved memo wrapper would
			// otherwise be tail-called below the place where componentSlot performs its
			// bailout. Publish equivalent metadata on this wrapper once the module has
			// resolved. The comparator resolves defaultProps at the same public boundary
			// as the component invocation.
			if (!memoMetadataInstalled) {
				(lazyWrapper as any).__memo = true;
				(lazyWrapper as any).__compare = (prev: any, next: any): boolean => {
					const current = resolveLazyModule(result);
					const compare = (current as any).__compare as
						| ((previous: any, incoming: any) => boolean)
						| undefined;
					const previous = lazyResolvedProps(current, prev);
					const incoming = lazyResolvedProps(current, next);
					return compare ? compare(previous, incoming) : shallowEqualProps(previous, incoming);
				};
				memoMetadataInstalled = true;
			}
			// The Block was created while the payload was unresolved, before it could
			// inherit memo metadata. Arm context dependency stamping before executing
			// the resolved memo body.
			scope.block.memoInChain = true;
		}
		if (
			profiledComponent !== comp &&
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__
		) {
			__profileComponentSource(lazyWrapper, comp);
			profiledComponent = comp;
		}
		return comp(lazyResolvedProps(comp, props), scope, extra);
	};

	lazyWrapper = (props: any, scope: Scope, extra: any): unknown => {
		if (status === 'fulfilled') {
			return callResolvedComponent(props, scope, extra);
		}
		if (status === 'rejected') throw result;
		if (status === 'uninitialized') {
			try {
				const p = load();
				thenable = p as TrackedThenable<any>;
				p.then(
					(mod: any) => {
						// This handler was attached FIRST, so by the time the boundary's retry
						// listener fires the payload is already fulfilled/rejected and the
						// re-render takes the synchronous branch above.
						if (status === 'uninitialized' || status === 'pending') {
							result = mod;
							status = 'fulfilled';
						}
					},
					(err: any) => {
						if (status === 'uninitialized' || status === 'pending') {
							result = err;
							status = 'rejected';
						}
					},
				);
			} catch (error) {
				// React does not publish Pending until both load() and `.then(...)`
				// registration return. A synchronous throw is therefore retryable on the
				// next render instead of poisoning the wrapper with a null thenable.
				if (status === 'uninitialized') thenable = null;
				throw error;
			}
			if (status === 'uninitialized') status = 'pending';
			// PromiseLike is permitted to settle while `then` is registering. Match
			// React's synchronous-thenable contract: render or throw immediately rather
			// than briefly committing a fallback (or leaving partial sibling work).
			const settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
			if (settledStatus === 'fulfilled') {
				return callResolvedComponent(props, scope, extra);
			}
			if (settledStatus === 'rejected') throw result;
		}
		throw new SuspenseException(thenable!);
	};
	Object.defineProperty(lazyWrapper, LAZY_COMPONENT, { value: true });
	return lazyWrapper as unknown as C;
}

export function useId(slot?: symbol): string;
export function useId(slot?: HookSlot): string {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useId');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { id: string } | undefined;
	if (s === undefined) {
		const ids = scope.block.idState;
		let owner = ids;
		while (owner.limit !== undefined && owner.next >= owner.limit && owner.overflow !== undefined) {
			owner = owner.overflow;
		}
		s = { id: ':' + owner.prefix + 'in-' + (owner.next++).toString(36) + ':' };
		ensureHooks(scope).set(slot, s);
	}
	return s.id;
}

// ---------------------------------------------------------------------------
// Templates: inert module token → parse on first mount → clone per instance
// ---------------------------------------------------------------------------

// Namespace flags: 0 = HTML, 1 = SVG, 2 = MathML, 3 = opaque component
// destination. An opaque template is not parsed at module evaluation: ordinary
// component bodies and component children can be inserted under HTML, SVG, or
// MathML, so clone() resolves their concrete parser context from the render
// block's actual parent and caches one parsed template per destination.
interface LazyTemplateRecord {
	html: string;
	ns: 0 | 1 | 2 | 3;
	frag: number;
	parsed: Array<Element | undefined>;
}

const LAZY_TEMPLATE = Symbol('octane.lazy-template');

function parseTemplate(html: string, ns: 0 | 1 | 2, frag: number): Element {
	const t = document.createElement('template');
	if (ns === 0) {
		// Fixed HTML multi-root templates arrive pre-wrapped by the compiler. Opaque
		// multi-root templates carry raw markup because their eventual namespace is
		// unknown, so add the equivalent wrapper only after HTML wins at clone time.
		t.innerHTML = frag ? `<octane-frag>${html}</octane-frag>` : html;
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

/* @__NO_SIDE_EFFECTS__ */
export function template(html: string, ns: number = 0, frag: number = 0): Element {
	return {
		[LAZY_TEMPLATE]: {
			html,
			ns: ns === 1 ? 1 : ns === 2 ? 2 : ns === 3 ? 3 : 0,
			frag,
			parsed: [],
		} satisfies LazyTemplateRecord,
	} as unknown as Element;
}

// ---------------------------------------------------------------------------
// Hydration (SSR Phase 2). While a HydrationCapability is active, the compiled mount path ADOPTS the
// server-rendered DOM instead of cloning a fresh template: `clone()` returns the
// adopted server root, and `htext()` adopts the existing server text node rather
// than creating one. Element/attribute/event/ref bindings are unchanged — their
// template paths (`_root.firstChild.nextSibling…`) already align with the server
// DOM, because text lives INSIDE elements and so doesn't shift element siblings.
//
// Dead-code-elimination contract (mirrors Ripple/Svelte): the capability class is
// instantiated ONLY by `hydrateRoot()`. Retained client helpers dispatch through
// its methods; when `hydrateRoot` is unused the bundler can remove the class and
// every hydration-only helper reachable exclusively from those methods.
// ---------------------------------------------------------------------------
// The HYDRATION CURSOR (ported from Ripple's `hydrate_node`). While a capability is active,
// this points at the server-rendered node the next adopt operation should claim.
// `clone()` adopts the cursor as a template root; the compiler-emitted cursor
// walk (`child`/`sibling` — used only for templates that contain control-flow /
// component holes, whose server DOM no longer matches the raw template paths)
// advances it node-by-node; block functions (forBlock/ifBlock/componentSlot/…)
// adopt the server `<!--[-->`/`<!--]-->` markers off it. For hole-free leaf
// templates the cursor is just the adopted root and the old raw path-walk
// (`_root.firstChild.nextSibling…`) still resolves bindings correctly.
// Hidden server Activities serialize as empty ranges. Their client trees must
// mount only AFTER the server-rendered siblings finish hydrating: mounting one
// inline would consume root-local useId counters ahead of those siblings even
// though the server never visited the hidden tree. hydrateRoot drains this
// root-local queue at the end of its synchronous adoption pass with hydration
// suspended, still before returning the live Root.
// Server-resolved `use(thenable)` values (SSR Phase 4), parsed from the inline
// `<script data-octane-suspense>` in `hydrateRoot()` and consumed in render
// order by `useThenable` so a hydrating boundary returns synchronously. They are
// fields on the hydrateRoot-only capability, so client-only builds discard them.
// Set while adopting a root when a matched range is physically wrapped by an
// exactly-adjacent marker pair. The post-hydration ownership walk can only
// remove comments in that shape, so roots without one skip the pass entirely.

/**
 * Lite component calls deliberately allocate no CompSlot/Block range owner,
 * but hydration still adopts their server frame pair. Keep that pair in an
 * ephemeral map for the one post-hydration compaction pass; the live lite
 * scope only needs its end marker re-pointed if the pair is borrowed.
 */
interface HydratedLiteRange {
	start: Comment;
	end: Comment;
}

interface PendingHydrationClassWrite {
	next: string | null;
	absentIsEmpty: boolean;
	useAttribute: boolean;
	remove: boolean;
}

interface PendingHydrationTextWarning {
	loc: string | undefined;
	server: string | null;
}

let currentHydration: HydrationCapability | null = null;

function activeHydration(): HydrationCapability | null {
	const hydration = currentHydration;
	return hydration !== null && hydration.isActive() ? hydration : null;
}

/** Direct-child scoped CSS resources are renderer-owned hydration sidecars. */
function isRendererHydrationStyle(node: Node): boolean {
	return (
		node.nodeType === 1 &&
		(node as Element).localName === 'style' &&
		(node as Element).hasAttribute('data-octane')
	);
}

/**
 * Root-local hydration state and the dynamic dispatch boundary for hydration-only
 * code. The class is constructed only by hydrateRoot, so client-only bundles can
 * discard its methods together with the marker/mismatch/seed helper graph.
 */
class HydrationCapability {
	depth = 0;
	seedCursor = 0;
	hasAdjacentRangePair = false;
	private abandoned = false;
	private readonly freshNodes = new WeakSet<Node>();
	private readonly unframedRootRanges = new WeakMap<Node, Node>();
	/** First unclaimed root sibling after a compiled root clone; undefined until known. */
	private rootRemainder: Node | null | undefined;
	private rootCleanupBoundary: Node | null = null;
	readonly deferredActivities: Array<() => void> = [];
	readonly liteRanges = new WeakMap<Scope, HydratedLiteRange>();
	readonly classWrites = new Map<Element, PendingHydrationClassWrite>();
	private readonly textWarnings = new Map<Text, PendingHydrationTextWarning>();
	/** Skip component-frame adoption until the declared container owner. */
	passthroughRanges = false;

	constructor(
		readonly rootBlock: Block,
		public node: Node | null,
		public seeds: unknown[] | null,
	) {}

	isActive(): boolean {
		return this.depth === 0 && !this.abandoned;
	}

	owns(block: Block): boolean {
		for (let current: Block | null = block; current !== null; current = current.parentBlock) {
			if (current === this.rootBlock) return true;
		}
		return false;
	}

	suspend<T>(fn: () => T): T {
		this.depth++;
		try {
			return fn();
		} finally {
			this.depth--;
		}
	}

	isOpen(node: Node | null): node is Comment {
		return isBlockOpen(node);
	}

	isClose(node: Node | null): node is Comment {
		return isBlockClose(node);
	}

	close(open: Node): Comment {
		const found = findMatchingClose(open);
		if (
			!this.hasAdjacentRangePair &&
			isBlockOpen(open.previousSibling) &&
			isBlockClose(found.nextSibling)
		) {
			this.hasAdjacentRangePair = true;
		}
		return found;
	}

	resolveOpen(anchor: Node | null | undefined, domParent: Node): Comment | null {
		if (isBlockOpen(anchor ?? null)) return anchor as Comment;
		let cursor = this.node;
		if (cursor === null || cursor.parentNode !== domParent) cursor = domParent.firstChild;
		return cursor !== null && isBlockOpen(cursor) ? (cursor as Comment) : null;
	}

	markerState(node: Node): -1 | 0 | 1 {
		return ssrForMarkerState(node);
	}

	describe(node: Node | null): string {
		return describeHydrationNode(node);
	}

	warnStructural(loc: string | undefined, expected: string, actual: string): void {
		warnHydrationStructuralMismatch(loc, expected, actual);
	}

	recordTextMismatch(node: Text, loc: string | undefined, server: string | null): void {
		if (!this.textWarnings.has(node)) this.textWarnings.set(node, { loc, server });
	}

	flushTextWarnings(): void {
		for (const [node, pending] of this.textWarnings) {
			// A render-phase replay can replace the first attempt's text node before
			// hydration converges. Detached attempts are not observable output and must
			// not publish a mismatch after the final live tree has matched the server.
			if (!this.rootBlock.parentNode.contains(node)) continue;
			const client = node.nodeValue;
			if (pending.server !== client) {
				warnHydrationValueMismatch(pending.loc, 'text', pending.server, client);
			}
		}
		this.textWarnings.clear();
	}

	removeRange(start: Node, end: Node): void {
		removeHydrationRange(start, end);
	}

	parseSeeds(raw: string): unknown[] | null {
		return parseSeedJson(raw);
	}

	isRejection(error: unknown): error is HydrationRejectionException {
		return isHydrationRejection(error);
	}

	rejectionFromSeed(seed: unknown): HydrationRejectionException | null {
		return hydrationRejectionFromSeed(seed);
	}

	/** Mark a client-built hydration replacement (and its descendants) as fresh DOM. */
	markFresh(node: Node): void {
		this.freshNodes.add(node);
		let child = node.firstChild;
		while (child !== null) {
			this.markFresh(child);
			child = child.nextSibling;
		}
	}

	isFresh(node: Node): boolean {
		return this.freshNodes.has(node);
	}

	/** Keep a client-owned root anchor alive while stale server siblings are swept. */
	protectRootAnchor(node: Node): void {
		this.rootCleanupBoundary = node;
	}

	/** Bound an unframed third-party component root so its returned host can adopt it. */
	wrapUnframedRoot(cursor: Node): readonly [Comment, Comment] {
		const parent = cursor.parentNode!;
		const remainder = cursor.nextSibling;
		const start = document.createComment('');
		const end = document.createComment('');
		parent.insertBefore(start, cursor);
		parent.insertBefore(end, remainder);
		this.unframedRootRanges.set(start, end);
		this.protectRootAnchor(end);
		this.claimRootRemainder(remainder);
		return [start, end];
	}

	isUnframedRootRange(start: Node, end: Node): boolean {
		return this.unframedRootRanges.get(start) === end;
	}

	/** Record the first node outside a root-owned range exactly once. */
	claimRootRemainder(node: Node | null): void {
		if (this.rootRemainder === undefined) this.rootRemainder = node;
	}

	private freshClone<T extends Node>(template: T): T {
		const cloned = template.cloneNode(true) as T;
		this.markFresh(cloned);
		return cloned;
	}

	private fragmentRemainder(template: Node, cursor: Node | null): Node | null | undefined {
		let expected = template.firstChild;
		let actual = cursor;
		while (expected !== null) {
			if (actual === null) return undefined;
			// A template comment is a dynamic logical hole. Its server form may be
			// text or a marker range, so only static text/element roots compare shape.
			if (expected.nodeType !== 8 && !hydrationNodeMatches(actual, expected)) return undefined;
			actual = this.sibling(actual, 1);
			expected = expected.nextSibling;
		}
		return actual;
	}

	/**
	 * If a top-level cursor sits inside a server marker frame, return the first
	 * sibling after that OUTERMOST frame. A clone can execute in a lite/provider
	 * descendant while its DOM is still a direct child of the root container;
	 * `cursor.nextSibling` would then be only the descendant's close marker.
	 */
	private framedRootRemainder(cursor: Node): Node | null | undefined {
		const rootParent = this.rootBlock.parentNode;
		let outerOpen: Node | null = null;
		let depth = 0;
		for (
			let node = rootParent.firstChild;
			node !== null && node !== cursor;
			node = node.nextSibling
		) {
			if (this.isOpen(node)) {
				if (depth === 0) outerOpen = node;
				depth++;
			} else if (this.isClose(node) && depth > 0) {
				depth--;
				if (depth === 0) outerOpen = null;
			}
		}
		return outerOpen === null ? undefined : this.close(outerOpen).nextSibling;
	}

	/** Give up root adoption after an unframed return/fragment mismatch. */
	abandonRoot(expected: string, actual: string, loc?: string): void {
		if (loc) warnHydrationStructuralMismatch(loc, expected, actual);
		let node = this.node;
		while (node !== null) {
			const next = node.nextSibling;
			if (!isRendererHydrationStyle(node)) (node as ChildNode).remove();
			node = next;
		}
		this.node = null;
		this.abandoned = true;
	}

	clone<T extends Node>(template: T, loc?: string): T {
		const cursor = this.node;
		const isFragment = (template as any).__oct_frag === true;
		// Lite/no-template wrappers can render the logical root while sharing the
		// public root Block, and return-based wrappers render it in a child Block.
		// Identify the first top-level cursor by DOM ownership, then claim its
		// remainder ONCE so later lite descendant clones cannot overwrite it.
		const claimsRoot =
			this.rootRemainder === undefined &&
			(cursor !== null
				? cursor.parentNode === this.rootBlock.parentNode
				: CURRENT_BLOCK === this.rootBlock);
		const framedRemainder =
			claimsRoot && cursor !== null ? this.framedRootRemainder(cursor) : undefined;
		const unframedRemainder = claimsRoot && cursor !== null ? cursor.nextSibling : undefined;
		// A synthetic fragment wrapper has no server counterpart. At a root, compare
		// its logical static roots before returning the virtual adoption view; otherwise
		// arbitrary server markup could be mistaken for every fragment child at once.
		if (isFragment && claimsRoot) {
			const remainder = this.fragmentRemainder(template, cursor);
			if (remainder === undefined) {
				this.abandonRoot(
					`a fragment starting with ${describeHydrationNode(template.firstChild)}`,
					describeHydrationNode(cursor),
					componentSourceLoc(this.rootBlock.body),
				);
				return this.freshClone(template);
			}
			this.claimRootRemainder(framedRemainder === undefined ? remainder : framedRemainder);
		}
		if (cursor === null) {
			if (claimsRoot) this.claimRootRemainder(null);
			return this.freshClone(template);
		}
		if (!isFragment && !hydrationNodeMatches(cursor, template)) {
			if (process.env.NODE_ENV !== 'production' && loc)
				warnHydrationStructuralMismatch(
					loc,
					describeHydrationNode(template),
					describeHydrationNode(cursor),
				);
			if (isBlockClose(cursor)) return this.freshClone(template);
			if (isBlockOpen(cursor)) {
				const close = this.close(cursor);
				this.node = close.nextSibling;
				removeHydrationRange(cursor, close);
			} else {
				this.node = cursor.nextSibling;
				(cursor as ChildNode).remove();
			}
			if (claimsRoot)
				this.claimRootRemainder(
					framedRemainder === undefined ? (unframedRemainder ?? null) : framedRemainder,
				);
			return this.freshClone(template);
		}
		if (isFragment) {
			return { __oct_vfrag: true, firstChild: cursor } as unknown as T;
		}
		if (claimsRoot)
			this.claimRootRemainder(
				framedRemainder === undefined ? (unframedRemainder ?? null) : framedRemainder,
			);
		return cursor as unknown as T;
	}

	/** Remove server siblings left after the root's complete client shape was adopted. */
	finishRoot(): void {
		if (this.abandoned) return;
		let remainder = this.rootRemainder === undefined ? this.node : this.rootRemainder;
		// Cursor-based adoption may stop on an owned range marker, and mismatch
		// recovery can append fresh replacement roots after stale server siblings.
		// Find the first genuinely stale sibling before diagnosing, then preserve
		// every client-owned marker/replacement while sweeping the remainder.
		while (
			remainder !== null &&
			(remainder === this.rootCleanupBoundary ||
				this.freshNodes.has(remainder) ||
				isRendererHydrationStyle(remainder))
		)
			remainder = remainder.nextSibling;
		if (remainder === null) return;
		warnHydrationStructuralMismatch(
			componentSourceLoc(this.rootBlock.body),
			'the end of the root',
			describeHydrationNode(remainder),
		);
		while (remainder !== null && remainder !== this.rootCleanupBoundary) {
			const next: Node | null = remainder.nextSibling;
			if (!this.freshNodes.has(remainder) && !isRendererHydrationStyle(remainder))
				(remainder as ChildNode).remove();
			remainder = next;
		}
		this.node = null;
		this.rootRemainder = null;
	}

	htext(el: Node, text: string, loc?: string): Text {
		const first = el.firstChild;
		if (first !== null && first.nodeType === 3) {
			const server = (first as Text).nodeValue;
			if (
				server !== text &&
				!isTextParserNormalizedMatch(server, text) &&
				!isHydrationSuppressed(el)
			) {
				if (process.env.NODE_ENV !== 'production')
					this.recordTextMismatch(first as Text, loc || (el as any).__oct_loc, server);
				(first as Text).nodeValue = text;
			}
			return first as Text;
		}
		const created = document.createTextNode(text);
		el.appendChild(created);
		return created;
	}

	htextSwap(posNode: Node | null, text: string): Text {
		if (posNode !== null && posNode.nodeType === 3) {
			const server = (posNode as Text).nodeValue;
			if (server !== text && !isTextParserNormalizedMatch(server, text)) {
				const host = posNode.parentNode;
				if (!isHydrationSuppressed(host)) {
					if (process.env.NODE_ENV !== 'production')
						this.recordTextMismatch(posNode as Text, host && (host as any).__oct_loc, server);
					(posNode as Text).nodeValue = text;
				}
			}
			return posNode as Text;
		}
		const host = posNode?.parentNode ?? null;
		const suppressed = isHydrationSuppressed(host);
		// A non-empty client text binding where the server has no text node is a
		// structural mismatch, just like an extra client element. Build the client
		// text so recovery succeeds, but publish the normal dev diagnostic. A
		// suppressed host keeps the absent server value by installing only an empty
		// tracking node; later real commits can update that node normally.
		if (text !== '' && !suppressed && process.env.NODE_ENV !== 'production') {
			warnHydrationStructuralMismatch(
				host && (host as any).__oct_loc,
				`text ${JSON.stringify(text)}`,
				describeHydrationNode(posNode),
			);
		}
		const created = document.createTextNode(suppressed ? '' : text);
		if (posNode !== null && posNode.parentNode !== null) {
			posNode.parentNode.insertBefore(created, posNode);
		}
		return created;
	}

	sibling(node: Node, count: number): Node | null {
		let cursor: Node | null = node;
		for (let i = 0; i < count; i++) {
			if (cursor === null) return null;
			if (isBlockOpen(cursor)) cursor = this.close(cursor);
			if (isTextSeparator(cursor)) {
				cursor = cursor.nextSibling;
				continue;
			}
			cursor = cursor.nextSibling;
			if (isTextSeparator(cursor)) {
				const after: Node | null = cursor.nextSibling;
				if (after !== null && (after.nodeType === 3 || isTextSeparator(after))) cursor = after;
			}
		}
		return cursor;
	}

	allowAttribute(el: Element, name: string, next: string | null): boolean {
		const mode = hydrationMismatchMode(el);
		// Parser normalization is symmetric: the server DOM may contain U+FFFD even
		// when the client value does not. Read once in production too so either side's
		// CR/NUL/replacement artifacts can compare equal before the normal patch path.
		const ns = attrNamespace(name);
		const server = ns
			? el.getAttributeNS(ns, name.indexOf(':') >= 0 ? name.slice(name.indexOf(':') + 1) : name)
			: el.getAttribute(name);
		if (server === next) return true;
		if (next !== null && isAttributeParserNormalizedMatch(server, next)) return false;
		if (mode === 0) return true;
		if (mode === 1) return false;
		if (process.env.NODE_ENV !== 'production')
			warnHydrationValueMismatch((el as any).__oct_loc, `attribute \`${name}\``, server, next);
		return true;
	}

	allowClass(el: Element, next: string | null, absentIsEmpty = false): boolean {
		const mode = hydrationMismatchMode(el);
		if (mode === 0) return true;
		const rawServer = el.getAttribute('class');
		const server = absentIsEmpty && rawServer === null ? '' : rawServer;
		if (server === next) return true;
		if (mode === 1) return false;
		if (process.env.NODE_ENV !== 'production')
			warnHydrationValueMismatch((el as any).__oct_loc, 'attribute `class`', server, next);
		return true;
	}

	queueClass(
		el: Element,
		next: string | null,
		absentIsEmpty: boolean,
		useAttribute: boolean,
		remove: boolean,
	): void {
		// Class can be authored by any combination of direct bindings and spreads.
		// During hydration only the last writer is observable: the server has already
		// serialized that final value, so replaying intermediate writers would produce
		// false mismatch warnings and transient DOM mutations on the adopted element.
		this.classWrites.set(el, { next, absentIsEmpty, useAttribute, remove });
	}

	flushClassWrites(): void {
		try {
			for (const [el, write] of this.classWrites) {
				const rawTarget = write.remove ? null : write.next;
				// The common hydration-parity path performs no DOM write at all. Besides
				// avoiding work, this keeps MutationObserver consumers from seeing a class
				// value that never existed in either the server or final client output.
				if (el.getAttribute('class') === rawTarget) continue;
				if (!this.allowClass(el, write.next, write.absentIsEmpty)) continue;
				if (write.remove) el.removeAttribute('class');
				else if (write.useAttribute) el.setAttribute('class', write.next!);
				else (el as any).className = write.next!;
			}
		} finally {
			this.classWrites.clear();
		}
	}

	applyStyle(el: HTMLElement | SVGElement, value: any, _prev: any): boolean {
		const mode = hydrationMismatchMode(el);
		if (mode === 1) return true;
		const style = (el as HTMLElement).style;
		const hadStyleAttribute = el.hasAttribute('style');
		const before = style.cssText;
		// A hydration write describes the COMPLETE client style, while `prev` is
		// only the client compiler's uninitialized slot value. Diffing against that
		// slot leaves server-only declarations behind (`{width: 1}` -> `{}` / null)
		// and cannot observe declaration-order differences. First serialize the
		// complete client value through detached CSSOM. Comparing canonical cssText
		// preserves the server's original attribute bytes when declarations are
		// semantically and order-equivalent (`#fff` vs rgb(), compact whitespace),
		// while still detecting reordered, missing, added, and empty styles.
		const expectedStyle = document.createElement('div').style;
		applyStyleValue(expectedStyle, value, undefined);
		const expected = expectedStyle.cssText;
		const expectsStyleAttribute = expected !== '';
		if (before === expected && hadStyleAttribute === expectsStyleAttribute) return true;

		if (expectsStyleAttribute) style.cssText = expected;
		else el.removeAttribute('style');
		if (mode === 2 && process.env.NODE_ENV !== 'production') {
			warnHydrationValueMismatch((el as any).__oct_loc, 'style', before, expected);
		}
		return true;
	}

	coalesce(): void {
		coalesceHydratedRanges(this.rootBlock, this.liteRanges);
	}
}

/**
 * Parse a seed-JSON payload (the shell's `data-octane-suspense` script or a
 * streamed boundary's `window.$OCTS[id]` stash). Successful values retain the
 * compact array form; a versioned top-level envelope carries rejection reasons
 * without colliding with fulfilled user data. A post-parse wire decoder restores
 * `undefined` without deleting object properties and unescapes prefix-leading
 * user strings. Returns null on malformed input (the caller re-suspends
 * client-side).
 */
function decodeSeedWire(value: unknown): unknown {
	const undefinedWire = SUSPENSE_SEED_WIRE_PREFIX + 'u';
	const escapedStringWire = SUSPENSE_SEED_WIRE_PREFIX + 's';
	if (typeof value === 'string') {
		if (value === undefinedWire) return undefined;
		if (value.startsWith(escapedStringWire)) return value.slice(escapedStringWire.length);
		return value;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) value[i] = decodeSeedWire(value[i]);
		return value;
	}
	if (value !== null && typeof value === 'object') {
		for (const key of Object.keys(value)) {
			(value as Record<string, unknown>)[key] = decodeSeedWire(
				(value as Record<string, unknown>)[key],
			);
		}
	}
	return value;
}

function parseSeedJson(raw: string): unknown[] | null {
	try {
		const parsed = decodeSeedWire(JSON.parse(raw));
		if (Array.isArray(parsed)) return parsed;
		if (parsed === null || typeof parsed !== 'object') return null;
		const envelope = (parsed as Record<string, any>)[REJECTION_SENTINEL_KEY];
		if (
			envelope === null ||
			typeof envelope !== 'object' ||
			envelope.version !== 1 ||
			!Array.isArray(envelope.values) ||
			!Array.isArray(envelope.rejections)
		)
			return null;
		const values = envelope.values.slice() as unknown[];
		const seen = new Set<number>();
		for (const entry of envelope.rejections) {
			if (
				!Array.isArray(entry) ||
				entry.length !== 2 ||
				!Number.isInteger(entry[0]) ||
				entry[0] < 0 ||
				entry[0] >= values.length ||
				seen.has(entry[0]) ||
				entry[1] === null ||
				typeof entry[1] !== 'object'
			)
				return null;
			seen.add(entry[0]);
			values[entry[0]] = {
				[HYDRATION_REJECTION_SEED]: decodeHydrationRejectionPayload(entry[1]),
			} satisfies HydrationRejectionSeed;
		}
		return values;
	} catch {
		return null;
	}
}

export function clone<T extends Node>(node: T, loc?: string): T {
	// Compiler templates are inert module-scope tokens. Parse each concrete
	// namespace on its first real mount, then clone the cached node thereafter.
	// Non-compiler callers can still hand clone() an ordinary DOM Node directly.
	const lazy =
		(node as any).nodeType === undefined
			? ((node as any)[LAZY_TEMPLATE] as LazyTemplateRecord | undefined)
			: undefined;
	if (lazy !== undefined) {
		let ns: 0 | 1 | 2;
		if (lazy.ns === 3) {
			const inherited =
				CURRENT_SCOPE === null ? undefined : deoptChildNamespace(CURRENT_SCOPE.block.parentNode);
			ns = inherited === SVG_NS ? 1 : inherited === MATHML_NS ? 2 : 0;
		} else {
			ns = lazy.ns;
		}
		let parsed = lazy.parsed[ns];
		if (parsed === undefined) {
			parsed = parseTemplate(lazy.html, ns, lazy.frag);
			lazy.parsed[ns] = parsed;
		}
		const hydration = activeHydration();
		return (hydration === null ? parsed.cloneNode(true) : hydration.clone(parsed, loc)) as T;
	}
	const hydration = activeHydration();
	return hydration === null ? (node.cloneNode(true) as T) : hydration.clone(node, loc);
}

/**
 * Compiler-emitted for a multi-root template's mount: drain the cloned
 * <octane-frag> wrapper's children into the live parent. While hydrating, the
 * "wrapper" is clone()'s virtual stand-in for server content that is ALREADY
 * in place — nothing to move.
 */
export function drainFrag(root: Node, parent: Node, anchor: Node | null): void {
	if (activeHydration() !== null && (root as any).__oct_vfrag === true) return;
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
		const hydration = activeHydration();
		// clone() returns the already-attached server node during hydration. Moving
		// that adopted root before the block anchor is usually a no-op, but with an
		// extra trailing server sibling it would reorder the valid root after the
		// stale node just before finishRoot removes the remainder. Fresh mismatch
		// replacements still need the ordinary insertion path.
		if (hydration === null || hydration.isFresh(root) || root.parentNode !== block.parentNode) {
			block.parentNode.insertBefore(root, block.endMarker);
		}
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
 * Match ReactDOMComponent's hydration comparison: the HTML parser normalizes
 * CR/CRLF and can either drop U+0000 or turn it into U+FFFD, so both values are
 * normalized by folding newlines and removing null/replacement characters.
 */
function normalizeParserText(value: string): string {
	return value.replace(/\r\n?/g, '\n').replace(/[\u0000\uFFFD]/g, '');
}

function isTextParserNormalizedMatch(server: string | null, client: string): boolean {
	return server !== null && normalizeParserText(server) === normalizeParserText(client);
}

function isAttributeParserNormalizedMatch(server: string | null, client: string): boolean {
	return server !== null && normalizeParserText(server) === normalizeParserText(client);
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
	const hydration = activeHydration();
	if (hydration !== null) return hydration.htext(el, text);
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
	const hydration = activeHydration();
	if (hydration !== null) return hydration.htextSwap(posNode, text);
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
// server DOM. The capability cursor is set by each block call (forBlock /
// ifBlock / componentSlot, to its content start) for the child's `clone()` to
// adopt. Without an active capability these are trivial DOM reads; hydration-only
// navigation stays behind methods that client-only builds discard.
// ---------------------------------------------------------------------------

/**
 * Decode a hydration range marker. Legacy `[` / `]` comments have
 * multiplicity one; hydration-time range compaction writes `[N` / `]N` for
 * N >= 2 exactly-coextensive logical ranges sharing one physical pair. The
 * count is metadata — DOM navigation still treats the comment as ONE physical
 * nesting level. Non-canonical payloads are ordinary user comments.
 */
function hydrationMarkerMultiplicity(data: string, open: boolean): number {
	const marker = open ? HYDRATION_START : HYDRATION_END;
	if (data === marker) return 1;
	if (open && (data === HYDRATION_FOR_EMPTY || data === HYDRATION_FOR_ITEMS)) return 1;
	if (data.length < 2 || data.charCodeAt(0) !== marker.charCodeAt(0)) return 0;
	// Canonical positive decimal: no signs, whitespace, zero, or leading zeroes.
	const first = data.charCodeAt(1);
	if (first < 49 || first > 57) return 0;
	let value = first - 48;
	for (let i = 2; i < data.length; i++) {
		const digit = data.charCodeAt(i) - 48;
		if (digit < 0 || digit > 9) return 0;
		value = value * 10 + digit;
		if (!Number.isSafeInteger(value)) return 0;
	}
	// Multiplicity one has exactly one canonical spelling: the legacy marker.
	return value >= 2 ? value : 0;
}

/** True if `node` is a legacy or counted block-open marker. */
function isBlockOpen(node: Node | null): node is Comment {
	if (node === null || node.nodeType !== 8) return false;
	const data = (node as Comment).data;
	return hydrationMarkerMultiplicity(data, true) > 0;
}

/** True if `node` is a legacy or counted block-close marker. */
function isBlockClose(node: Node | null): node is Comment {
	if (node === null || node.nodeType !== 8) return false;
	const data = (node as Comment).data;
	return data === HYDRATION_END || hydrationMarkerMultiplicity(data, false) > 1;
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
 * Activity / component) should ADOPT during hydration.
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
/** From a block-open `<!--[-->`, the matching `<!--]-->` (depth-tracked). */
function findMatchingClose(open: Node): Comment {
	let depth = 0;
	let node: Node = open.nextSibling as Node;
	for (;;) {
		if (node.nodeType === 8) {
			const data = (node as Comment).data;
			let close = data === HYDRATION_END;
			let nestedOpen = data === HYDRATION_START;
			if (!close && !nestedOpen && data.length > 1) {
				const first = data.charCodeAt(0);
				if (first === HYDRATION_END.charCodeAt(0)) {
					close = hydrationMarkerMultiplicity(data, false) > 0;
				} else if (first === HYDRATION_START.charCodeAt(0)) {
					nestedOpen = hydrationMarkerMultiplicity(data, true) > 0;
				}
			}
			if (close) {
				if (depth === 0) {
					return node as Comment;
				}
				depth -= 1;
			} else if (nestedOpen) {
				depth += 1;
			}
		}
		node = node.nextSibling as Node;
	}
}

/** -1 = legacy/general marker, 0 = server @empty, 1 = server items. */
function ssrForMarkerState(node: Node): -1 | 0 | 1 {
	if (node.nodeType !== 8) return -1;
	const data = (node as Comment).data;
	return data === HYDRATION_FOR_EMPTY ? 0 : data === HYDRATION_FOR_ITEMS ? 1 : -1;
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
	const hydration = activeHydration();
	if (hydration !== null) return hydration.sibling(node, n);
	let c: Node | null = node;
	for (let i = 0; i < n; i++) {
		// Over-walk (cursor already past the last node) → return null, don't throw.
		if (c === null) return null;
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
	// View-transition dirty tracking: setText is the compiler's single text-
	// mutation choke point AND is prev-guarded (only ACTUAL changes reach it).
	// The optional driver marks the innermost boundary only during a wrapped drain.
	VIEW_TRANSITION_DRIVER?.markDirty();
	//
	// Write via `nodeValue` (a `Node`-level accessor) rather than `data` (which
	// lives on `CharacterData` one prototype hop deeper) — it's measurably faster
	// for the hot text-update path.
	node.nodeValue = coerceText(value);
}

/**
 * Set authored inline-script source without asking the HTML parser to interpret it.
 * This is the client half of the compiler's `<script dangerouslySetInnerHTML>`
 * specialization: strings containing `</script><script>...` remain one inert script
 * node instead of becoming sibling markup. Server serialization additionally escapes
 * closing/opening script tokens because it is concatenated into an HTML response.
 */
export function setScriptText(el: Element, value: any): void {
	el.textContent = value == null ? '' : String(value);
}

/** Parse raw HTML in its authored host context for hydration comparison. */
function normalizeHTMLForHydration(parent: Element, html: string): string {
	// Match React's comparison boundary: the browser canonicalizes equivalent
	// spellings such as `<span/>` and `<span></span>` when parsing server HTML.
	const doc = parent.ownerDocument;
	const ns = parent.namespaceURI;
	const testElement =
		ns === 'http://www.w3.org/2000/svg' || ns === 'http://www.w3.org/1998/Math/MathML'
			? doc.createElementNS(ns, parent.tagName)
			: doc.createElement(parent.tagName);
	testElement.innerHTML = html;
	return testElement.innerHTML;
}

/** React-compatible hydration for `dangerouslySetInnerHTML`. */
export function setHTML(el: Element, value: any): void {
	const next = value == null ? '' : String(value);
	const hydration = activeHydration();
	if (hydration !== null && !hydration.isFresh(el)) {
		const server = el.localName === 'script' ? (el.textContent ?? '') : el.innerHTML;
		const expected = el.localName === 'script' ? next : normalizeHTMLForHydration(el, next);
		if (server === expected || isHydrationSuppressed(el)) return;
		warnHydrationKeptServerValue(
			(el as any).__oct_loc,
			'`dangerouslySetInnerHTML` content',
			server,
			expected,
		);
		return;
	}
	if (el.localName === 'script') setScriptText(el, next);
	else el.innerHTML = next;
}

const DANGER_HTML_ACTIVE = '__oct_dangerHTML';
const DANGER_HTML_STATIC_CHILD = '__oct_dangerChild';
const DANGER_HTML_SPREAD_CHILD = '__oct_dangerSpreadChild';
const DANGER_HTML_RESOLVED_VALUE = '__oct_dangerResolved';
const DANGER_HTML_RESOLVED_CHILD = '__oct_dangerResolvedChild';

function dangerHtmlChildrenError(): Error {
	return new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
}

function validateDangerouslySetInnerHTMLValue(value: unknown): void {
	if (value != null && (typeof value !== 'object' || !('__html' in value))) {
		throw new Error('`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`');
	}
}

/** Complete validated write used by direct, spread, and html-only compiler paths. */
export function setDangerouslySetInnerHTML(el: Element, value: any): void {
	validateDangerouslySetInnerHTMLValue(value);
	const wasActive = (el as any)[DANGER_HTML_ACTIVE] === true;
	if (value == null) {
		(el as any)[DANGER_HTML_ACTIVE] = false;
		// A nullish writer on a never-raw host is semantically absent and must not
		// erase ordinary children. Transitioning away from an active writer clears
		// the raw content it owned.
		if (wasActive) setHTML(el, null);
		return;
	}
	if (value != null && VOID_ELEMENTS.has(el.localName)) {
		throw new Error(
			`\`${el.localName}\` is a void element tag and must neither have ` +
				'`children` nor use `dangerouslySetInnerHTML`.',
		);
	}
	if (
		value != null &&
		((el as any)[DANGER_HTML_STATIC_CHILD] === true ||
			(el as any)[DANGER_HTML_SPREAD_CHILD] != null)
	) {
		throw dangerHtmlChildrenError();
	}
	(el as any)[DANGER_HTML_ACTIVE] = true;
	setHTML(el, value.__html);
}

/** Resolve source-ordered direct/spread raw-HTML writers and apply only the winner. */
export function setDangerouslySetInnerHTMLSources(
	el: Element,
	sources: readonly (readonly [isSpread: boolean, sourceOrName: unknown, value?: unknown])[],
	ignoreSourceChildren = false,
): void {
	let foundDanger = false;
	let danger: unknown = null;
	let foundChild = false;
	let child: unknown = null;
	for (const source of sources) {
		const [isSpread, sourceOrName] = source;
		if (!isSpread) {
			// The original danger-only compiler ABI used `[false, value]`. The
			// source-set host ABI uses `[false, name, value]` so `children` can be
			// resolved by the same final commit.
			if (source.length === 2) {
				foundDanger = true;
				danger = sourceOrName;
			} else if (sourceOrName === 'dangerouslySetInnerHTML') {
				foundDanger = true;
				danger = source[2];
			} else if (!ignoreSourceChildren && sourceOrName === 'children') {
				foundChild = true;
				child = source[2];
			}
			continue;
		}
		if (
			sourceOrName == null ||
			(typeof sourceOrName !== 'object' && typeof sourceOrName !== 'function')
		)
			continue;
		for (const key of Object.keys(Object(sourceOrName))) {
			if (key === 'dangerouslySetInnerHTML') {
				foundDanger = true;
				danger = (sourceOrName as Record<string, unknown>)[key];
			} else if (!ignoreSourceChildren && key === 'children') {
				foundChild = true;
				child = (sourceOrName as Record<string, unknown>)[key];
			}
		}
	}
	const resolved = foundDanger && danger != null ? danger : null;
	const resolvedChild = foundChild ? child : null;
	if (VOID_ELEMENTS.has(el.localName) && (resolved !== null || resolvedChild != null)) {
		throw new Error(
			`\`<${el.localName}>\` is a void element tag and must neither have children nor use ` +
				'`dangerouslySetInnerHTML`.',
		);
	}
	if (resolved !== null && resolvedChild != null) throw dangerHtmlChildrenError();
	validateDangerouslySetInnerHTMLValue(resolved);
	if (
		Object.prototype.hasOwnProperty.call(el, DANGER_HTML_RESOLVED_VALUE) &&
		Object.is((el as any)[DANGER_HTML_RESOLVED_VALUE], resolved) &&
		Object.is((el as any)[DANGER_HTML_RESOLVED_CHILD], resolvedChild)
	) {
		return;
	}
	// Stamp only the FINAL child source. Spread-local validation runs too early:
	// when a render transitions raw HTML -> ordinary children, the old raw-HTML
	// active bit is still present until this commit disables it.
	(el as any)[DANGER_HTML_SPREAD_CHILD] = resolvedChild;
	setDangerouslySetInnerHTML(el, resolved);
	(el as any)[DANGER_HTML_RESOLVED_VALUE] = resolved;
	(el as any)[DANGER_HTML_RESOLVED_CHILD] = resolvedChild;
}

/** Stamp a compiler-proven non-nullish child onto a potential raw-HTML host. */
export function markDangerouslySetInnerHTMLChildren(el: Element): void {
	(el as any)[DANGER_HTML_STATIC_CHILD] = true;
	if ((el as any)[DANGER_HTML_ACTIVE] === true) throw dangerHtmlChildrenError();
}

/**
 * Validate a dynamic JSX child and report whether raw HTML owns the host.
 * Null/undefined are the only accepted coexisting values; callers skip normal
 * child reconciliation in that case so it cannot erase the raw HTML.
 */
function dangerouslySetInnerHTMLOwnsChild(parent: Node, value: unknown): boolean {
	if (parent.nodeType !== 1 || (parent as any)[DANGER_HTML_ACTIVE] !== true) return false;
	if (value !== null && value !== undefined) throw dangerHtmlChildrenError();
	return true;
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
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// A hyphen only marks a custom element in the HTML namespace. SVG contains
// native hyphenated tags (`font-face`, `missing-glyph`, …), which must keep the
// ordinary native alias/value tables instead of custom-element raw semantics.
function isHtmlCustomElement(el: Element): boolean {
	return el.namespaceURI === HTML_NS && el.localName.indexOf('-') !== -1;
}

// Namespace for a de-opt host tag: `<svg>` always opens SVG; an SVG-ONLY tag
// (`g`, `rect`, `path`, … — SVG_ONLY_TAGS in constants.ts) implies SVG when no
// namespace was inherited (a component root, a value-position descriptor,
// portal children). Ambiguous names (`a`, `title`, `script`, `style`) keep the
// inherited namespace. Mirrors the compiler's nsForSelf so compiled templates
// and de-opt descriptors namespace identically.
function inferTagNs(tag: string, inherited: string | undefined): string | undefined {
	if (tag === 'svg') return SVG_NS;
	if (tag === 'math') return MATHML_NS;
	if (inherited === undefined && SVG_ONLY_TAGS.has(tag)) return SVG_NS;
	return inherited;
}

// Namespace inherited by a de-opt child from the DOM node it is actually being
// inserted into. Component children are an opaque compile-time boundary, so the
// runtime parent is the only authoritative source. `foreignObject` is itself an
// SVG element but switches its children back to HTML; HTML is represented by an
// undefined namespace because document.createElement is the fast/default path.
function deoptChildNamespace(parent: Node): string | undefined {
	if (parent.nodeType !== 1) return undefined;
	const el = parent as Element;
	if (el.namespaceURI === SVG_NS) return el.localName === 'foreignObject' ? undefined : SVG_NS;
	if (el.namespaceURI === MATHML_NS) return MATHML_NS;
	return undefined;
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

export function setAttribute(el: Element, name: string, value: any): void {
	// React-style `dangerouslySetInnerHTML={{__html}}` is a PROPERTY write, not an
	// attribute. The compiler's fast path sets `el.innerHTML` directly, but when the
	// element also carries a spread (`<div {...props} dangerouslySetInnerHTML={x}/>`,
	// or the prop arrives via the spread itself) the binding is routed here — so read
	// `.__html` off the value object and assign the property. A literal
	// `setAttribute('dangerouslySetInnerHTML', …)` would only add a dead attribute.
	if (name === 'dangerouslySetInnerHTML') {
		setDangerouslySetInnerHTML(el, value);
		return;
	}
	// Never DOM attributes. The first is React's contentEditable warning hint;
	// the latter two are Octane's native-change diagnostic intent/metadata.
	// `suppressNativeChangeWarning` is deliberately JS-only so it works through
	// spreads/createElement without leaking into client DOM or SSR markup.
	if (name === 'suppressContentEditableWarning') return;
	if (name === 'suppressNativeChangeWarning') {
		if (process.env.NODE_ENV !== 'production') {
			(el as any).__oct_native_change_suppressed = value === true;
		}
		return;
	}
	if (name === '__octaneNativeChangeDiagnostic') {
		if (process.env.NODE_ENV !== 'production') {
			setNativeChangeDiagnosticMetadata(el, value);
		}
		return;
	}
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
			} else if (name === 'muted' && !isHtmlCustomElement(el)) {
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
			if ((name === 'multiple' || name === 'selected') && !isHtmlCustomElement(el)) {
				// mustUseProperty like `muted`. `multiple` reflects back to the
				// attribute; `selected` is live option state (the controlled
				// <select> projection owns it when a select value is armed).
				(el as any)[name] = value && typeof value !== 'function' && typeof value !== 'symbol';
				return;
			}
			break;
		case 9:
			if (name === 'autoFocus' && !isHtmlCustomElement(el)) {
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
		isHtmlCustomElement(el) &&
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
	if (!isHtmlCustomElement(el)) {
		const alias = ATTRIBUTE_ALIASES.get(name);
		if (alias !== undefined) name = alias;
	}
	// Coerce ONCE to the final attribute string (null = absent). The hydration
	// compare below and the write share the result, so the compare can never
	// disagree with what actually lands in the DOM — and the value rules mirror
	// the server's ssrAttr exactly (shared tables in constants.ts), so SSR
	// presence/absence and the client write always agree.
	let next = coerceAttrValue(el, name, value);
	// URL validation consumes the already-coerced string so an observable
	// toString() runs exactly once across validation, hydration comparison, and
	// the final write. The same helper is used by compiler-baked and SSR attrs.
	if (next !== null) next = sanitizeURLAttribute(el.localName, name, next);
	// Hydration VALUE-mismatch handling. The normal write below already PATCHES the adopted
	// element to the client value (so prod recovers for free); here we only (dev) warn on a
	// server/client divergence and (dev+prod) honor `suppressHydrationWarning` by keeping the
	// server attribute. `hydrationMismatchMode` skips the server-attr read entirely when
	// neither applies — so a non-suppressed prod hydration adds no `getAttribute` cost.
	// Guarded by `hydrating`, so steady-state re-renders are untouched.
	const hydration = activeHydration();
	if (hydration !== null && !hydration.allowAttribute(el, name, next)) return;
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
 * Compiler-only fast path for a statically named `data-*` attribute whose
 * expression is proven to be a string at authoring time. Runtime values still
 * follow the generic data-attribute contract: nullish/function/symbol remove,
 * while booleans, numbers and objects stringify. This matters when an `as
 * string` assertion or an external typed value is inaccurate at runtime. The
 * compiler restricts this helper to lowercase data names, which are applied as
 * unnamespaced attributes in HTML, SVG, and MathML, so it needs none of the
 * generic attribute alias/property routing tables. Hydration still goes through
 * the capability boundary so mismatch recovery and `suppressHydrationWarning`
 * remain identical to setAttribute.
 */
export function setStringData(el: Element, name: string, value: unknown): void {
	const t = typeof value;
	let next: string | null;
	if (value == null || t === 'function' || t === 'symbol') {
		next = null;
	} else {
		// Match the generic attribute path's useful DEV diagnostic without pulling
		// its production routing tables into this deliberately narrow graph.
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
		next = typeof value === 'string' ? value : String(value);
	}
	const hydration = activeHydration();
	if (hydration !== null && !hydration.allowAttribute(el, name, next)) return;
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, next);
}

/**
 * Compiler-only fast path for a statically named native boolean attribute.
 * The compiler has already excluded HTML custom elements, aliases the name to
 * its lowercase DOM spelling, and only selects names in BOOLEAN_ATTR_PROPS.
 * Function/symbol/falsy values remove; every other truthy value writes the
 * canonical empty-string presence form.
 */
export function setBooleanAttribute(el: Element, name: string, value: unknown): void {
	const type = typeof value;
	const next = !value || type === 'function' || type === 'symbol' ? null : '';
	const hydration = activeHydration();
	if (hydration !== null && !hydration.allowAttribute(el, name, next)) return;
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, next);
}

/**
 * Compiler-only fast path for a valid, statically named lowercase `aria-*`
 * attribute. ARIA values are enumerated: only nullish removes, while booleans,
 * functions, symbols, numbers, and objects stringify exactly like the generic
 * attribute path.
 */
export function setAriaAttribute(el: Element, name: string, value: unknown): void {
	const next = value == null ? null : String(value);
	const hydration = activeHydration();
	if (hydration !== null && !hydration.allowAttribute(el, name, next)) return;
	if (next === null) el.removeAttribute(name);
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
	if (!isHtmlCustomElement(el)) {
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
	// An empty `src`/`href`/`<object data>` resolves to the CURRENT PAGE's URL — browsers will
	// re-fetch the whole document as an image/script/stylesheet. React strips
	// these (dev AND prod); so do we. `<a href="">` (and `<area>`) stays — an
	// empty href is a legitimate "link to this page".
	if (
		v === '' &&
		(name === 'src' ||
			(name === 'href' && el.nodeName !== 'A' && el.nodeName !== 'AREA') ||
			(name === 'data' && el.nodeName === 'OBJECT'))
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
	const hydration = activeHydration();
	if (hydration !== null) {
		hydration.queueClass(el, cls, true, false, value == null || value === false);
		return;
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
	const hydration = activeHydration();
	if (hydration !== null) {
		hydration.queueClass(el, cls, false, true, cls === null);
		return;
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
	// Hydration treats the authored style as a complete value: rebuild it once so
	// server-only declarations and an empty server style attribute cannot survive.
	// In dev, compare the before/after cssText and diagnose a real difference;
	// `suppressHydrationWarning` keeps the complete server style unchanged.
	const hydration = activeHydration();
	if (hydration !== null && hydration.applyStyle(el, value, prev)) return;
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
//   - JS-only warning hints/metadata → reset their runtime state. They were never DOM
//     attributes, so a removeAttribute would silently no-op and leak intent onto a reused
//     element.
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
		setDangerouslySetInnerHTML(el, null);
	} else if (name === 'suppressHydrationWarning') {
		(el as any).__oct_suppress = false;
	} else if (name === 'suppressNativeChangeWarning') {
		if (process.env.NODE_ENV !== 'production') {
			(el as any).__oct_native_change_suppressed = false;
		}
	} else if (name === '__octaneNativeChangeDiagnostic') {
		if (process.env.NODE_ENV !== 'production') setNativeChangeDiagnosticMetadata(el, undefined);
	} else {
		const actionName = formActionAttributeName(el, name);
		if (actionName !== null) {
			setFormAction(
				el as HTMLFormElement | HTMLButtonElement | HTMLInputElement,
				actionName,
				null,
				prevValue,
			);
			return;
		}
		const ev = eventSlot(name);
		if (ev) (el as any)[ev.key] = null;
		else setAttribute(el, name, null);
	}
}

/** Snapshot a JSX spread with own-enumerable Object.assign semantics. */
export function snapshotSpread(value: unknown): Record<string, unknown> | null {
	if (value == null) return null;
	const source = Object(value) as Record<PropertyKey, unknown>;
	const snapshot: Record<string, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		const next = source[key];
		// JSX spread evaluates enumerable symbol getters, but DOM prop routing has
		// no symbol-key surface. Preserve the observable read and discard the key.
		if (typeof key === 'string') snapshot[key] = next;
	}
	return snapshot;
}

type HostPropSource = readonly [isSpread: boolean, sourceOrName: unknown, value?: unknown];

function formActionAttributeName(el: Element, name: string): string | null {
	if (el.localName === 'form' && name === 'action') return 'action';
	if (
		(el.localName === 'button' || el.localName === 'input') &&
		(name === 'formAction' || name === 'formaction')
	)
		return 'formaction';
	return null;
}

function isHostPropIdentityKey(name: string): boolean {
	if (
		name === 'ref' ||
		name === 'children' ||
		name === 'dangerouslySetInnerHTML' ||
		name === 'suppressHydrationWarning' ||
		name === 'suppressContentEditableWarning' ||
		name === 'suppressNativeChangeWarning' ||
		name === '__octaneNativeChangeDiagnostic' ||
		name === 'autoFocus' ||
		name === 'value' ||
		name === 'defaultValue' ||
		name === 'checked' ||
		name === 'defaultChecked' ||
		name === 'multiple'
	)
		return true;
	return isEventKey(name);
}

function normalizedHostProp(
	el: Element,
	rawName: string,
): readonly [identity: string, name: string] {
	if (rawName === 'class' || rawName === 'className') return ['class', 'class'];
	const actionName = formActionAttributeName(el, rawName);
	if (actionName !== null) return [actionName, actionName];
	if (isHostPropIdentityKey(rawName)) return [rawName, rawName];
	let name = rawName;
	if (!isHtmlCustomElement(el)) name = ATTRIBUTE_ALIASES.get(name) ?? name;
	const identity = el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? name.toLowerCase() : name;
	return [identity, name];
}

/**
 * Resolve a spread-bearing compiled host's complete prop set before touching
 * the DOM. JSX spread merging is last-writer-wins, but aliases such as
 * className/class, htmlFor/for, and xlinkHref/xlink:href target one native
 * property. Canonical identities ensure a vanished earlier source cannot
 * remove an unchanged later winner, and hydration compares only the final
 * client value against the final server value.
 */
export function setHostPropSources(
	el: Element,
	sources: readonly HostPropSource[],
	prev: Record<string, unknown> | undefined,
	scope: Scope,
	hasNestedChildren = false,
): Record<string, unknown> {
	interface PropWriter {
		rawName: string;
		value: unknown;
		firstOrder: number;
		lastOrder: number;
	}
	const props = new Map<string, PropWriter>();
	let sourceOrder = 0;
	const record = (rawName: unknown, value: unknown): void => {
		if (typeof rawName !== 'string') return;
		const order = sourceOrder++;
		const previous = props.get(rawName);
		props.set(rawName, {
			rawName,
			value,
			firstOrder: previous?.firstOrder ?? order,
			lastOrder: order,
		});
	};

	for (const source of sources) {
		if (!source[0]) {
			record(source[1], source[2]);
			continue;
		}
		const spread = source[1];
		if (spread == null || (typeof spread !== 'object' && typeof spread !== 'function')) continue;
		for (const name of Object.keys(Object(spread))) {
			record(name, (spread as Record<string, unknown>)[name]);
		}
	}

	const values = new Map<
		string,
		readonly [name: string, value: unknown, firstOrder: number, lastOrder: number]
	>();
	for (const writer of props.values()) {
		if (writer.rawName === 'key') continue;
		const [identity, name] = normalizedHostProp(el, writer.rawName);
		const previous = values.get(identity);
		if (previous === undefined || previous[3] < writer.lastOrder) {
			values.set(identity, [name, writer.value, writer.firstOrder, writer.lastOrder]);
		}
	}
	const resolved: Record<string, unknown> = Object.create(null);
	const ordered = [...values.values()].sort((a, b) => a[2] - b[2]);
	for (const [name, value] of ordered) resolved[name] = value;
	const formHost =
		el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select';
	setSpread(el, resolved, prev, scope, true, formHost);
	setDangerouslySetInnerHTMLSources(el, sources, hasNestedChildren);
	if (formHost) setFormControlSources(el, sources);
	return resolved;
}

function isAggregatedFormControlProp(el: Element, name: string): boolean {
	switch (el.localName) {
		case 'input':
			return (
				name === 'value' ||
				name === 'defaultValue' ||
				name === 'checked' ||
				name === 'defaultChecked'
			);
		case 'textarea':
			return name === 'value' || name === 'defaultValue';
		case 'select':
			return name === 'value' || name === 'defaultValue' || name === 'multiple';
	}
	return false;
}

export function setSpread(
	el: Element,
	value: any,
	prev: any,
	mountScope?: Scope,
	skipDangerouslySetInnerHTML = false,
	skipFormControls = false,
): void {
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
	if (
		value != null &&
		Object.prototype.propertyIsEnumerable.call(Object(value), 'suppressHydrationWarning')
	) {
		(el as any).__oct_suppress = value.suppressHydrationWarning !== false;
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		value != null &&
		Object.prototype.propertyIsEnumerable.call(Object(value), 'suppressNativeChangeWarning')
	) {
		(el as any).__oct_native_change_suppressed = value.suppressNativeChangeWarning === true;
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		value != null &&
		Object.prototype.propertyIsEnumerable.call(Object(value), '__octaneNativeChangeDiagnostic')
	) {
		setNativeChangeDiagnosticMetadata(el, value.__octaneNativeChangeDiagnostic);
	}
	if (!skipDangerouslySetInnerHTML) {
		if (value != null && Object.prototype.propertyIsEnumerable.call(Object(value), 'children')) {
			(el as any)[DANGER_HTML_SPREAD_CHILD] = value.children;
			if (value.children != null && (el as any)[DANGER_HTML_ACTIVE] === true) {
				throw dangerHtmlChildrenError();
			}
		} else if (
			prev != null &&
			Object.prototype.propertyIsEnumerable.call(Object(prev), 'children')
		) {
			(el as any)[DANGER_HTML_SPREAD_CHILD] = undefined;
		}
	}
	// Remove keys present in prev but absent in value (removeHostProp routes each to
	// the removal that mirrors its SET path — class, style, innerHTML, suppress flag,
	// event slot, aliased/namespaced attribute).
	if (prev) {
		for (const k of Object.keys(Object(prev))) {
			if (k === 'key' || k === 'children') continue;
			if (skipDangerouslySetInnerHTML && k === 'dangerouslySetInnerHTML') continue;
			if (skipFormControls && isAggregatedFormControlProp(el, k)) continue;
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
			if (value != null && Object.prototype.propertyIsEnumerable.call(Object(value), k)) continue;
			removeHostProp(el, k, prev[k]);
		}
	}
	if (value == null) {
		if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, mountScope);
		return;
	}
	for (const k of Object.keys(Object(value))) {
		if (k === 'key' || k === 'children') continue;
		if (skipDangerouslySetInnerHTML && k === 'dangerouslySetInnerHTML') continue;
		if (skipFormControls && isAggregatedFormControlProp(el, k)) continue;
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
		if (
			k === 'suppressHydrationWarning' ||
			k === 'suppressNativeChangeWarning' ||
			k === '__octaneNativeChangeDiagnostic'
		)
			continue; // JS-only state stamped before the loops (see above)
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
		// Presence matters for raw HTML: an own key whose value is undefined
		// explicitly disables an earlier JSX writer. It must not be identity-skipped
		// against the absent previous value on mount.
		if (k === 'dangerouslySetInnerHTML') {
			setDangerouslySetInnerHTML(el, v);
			continue;
		}
		const actionName = formActionAttributeName(el, k);
		if (actionName !== null) {
			if (v === pv) continue;
			setFormAction(
				el as HTMLFormElement | HTMLButtonElement | HTMLInputElement,
				actionName,
				v,
				pv,
			);
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
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, mountScope);
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

interface NamespaceHeadProps {
	headKey: string;
	tag: string;
	attrs: Record<string, any> | null;
	text: unknown;
}

// Compiler ABI for a head singleton passed through an opaque component's
// `children` prop. The caller cannot know whether that component will place the
// child in HTML or foreign content, so resolve against this component block's
// actual DOM parent. Slot 0 is reserved for renderReturnedValue; the conditional
// head state deliberately lives at slot 1.
//
// This is a component (rather than a special descriptor kind) so normal block
// ownership handles hydration, keys, updates, refs, and teardown. HTML owns a
// document-head entry; SVG/MathML returns an ordinary host descriptor and lets
// the return-value child slot own the inline element.
/** @internal Compiler-generated. */
export function namespaceHead(props: NamespaceHeadProps, scope: Scope): ElementDescriptor | null {
	const slot = 1;
	const inherited = deoptChildNamespace(scope.block.parentNode);
	if (inherited !== undefined) {
		// A retained component can move between an HTML and foreign-content
		// destination without changing identity. Tear down the prior head entry
		// before returning the inline descriptor for this pass.
		const state = scope.slots[slot] as HeadSlot | undefined;
		if (state !== undefined) {
			state.el.remove();
			scope.slots[slot] = undefined;
		}
		return createElement(props.tag, props.attrs ?? undefined, props.text);
	}

	// Direct `key`/`ref`/`class` attributes are omitted by the compiler; filter
	// the same names out of spreads here. Event props intentionally remain —
	// headBlock attaches them directly because document.head sits outside the
	// delegated event root.
	let headAttrs: Record<string, any> | null = null;
	if (props.attrs !== null) {
		headAttrs = {};
		for (const key in props.attrs) {
			if (key === 'key' || key === 'ref' || key === 'class' || key === 'className') continue;
			headAttrs[key] = props.attrs[key];
		}
	}
	headBlock(scope, slot, props.headKey, props.tag, headAttrs, props.text);
	return null;
}

/** @internal Compiler-generated descriptor factory for namespaceHead. */
export function namespaceHeadElement(
	headKey: string,
	tag: string,
	attrs: Record<string, any> | null,
	text: unknown,
	authoredKey?: unknown,
): ElementDescriptor {
	// A key from an explicit attribute wins; otherwise preserve a key copied by
	// an already-evaluated spread. The raw attrs object is built once by generated
	// code, so getters/spreads never run twice merely to discover the key.
	const key = authoredKey !== undefined ? authoredKey : attrs?.key;
	const config: any = { headKey, tag, attrs, text };
	if (key !== undefined) config.key = key;
	return createElement(namespaceHead, config);
}

export function injectStyle(id: string, css: string): void {
	if (_injectedStyles.has(id)) return;
	// SSR de-dup: the server already emitted this scoped stylesheet (the css of
	// the RenderResult, a `<style data-octane="hash">` — or, for a React-hosted
	// island, a React 19 style RESOURCE whose href React serializes as
	// `data-href="octane-<hash>"`; React drops other attributes from hoisted
	// resources). On a hydrated page the per-runtime Set is empty, so also
	// check the DOM before re-injecting — otherwise hydration would append a
	// duplicate <style>.
	if (
		typeof document !== 'undefined' &&
		document.querySelector(`style[data-octane="${id}"], style[data-href="octane-${id}"]`)
	) {
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

/** True only for a slot the delegated dispatcher can actually invoke. */
function isUsableEventSlot(slot: EventSlot): boolean {
	return (
		typeof slot === 'function' ||
		(slot !== null &&
			typeof slot === 'object' &&
			typeof slot.fn === 'function' &&
			Array.isArray(slot.args))
	);
}

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
// <details>/<dialog> state events, resize). A bubble-phase root listener cannot
// hear them, so listen in capture and emulate React's target→root propagation in
// dispatchDelegated. This lets an ancestor onPlay/onToggle/onLoad observe an
// event from its descendant without installing a direct listener on every host.
const EMULATED_BUBBLING_EVENTS = [
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
	...EMULATED_BUBBLING_EVENTS,
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

// Capture and bubble delegation use separate native root listeners, but a
// bubbling event is one discrete update window. When the capture listener can
// hand off to a registered bubble listener, that listener owns controlled
// restoration and the synchronous flush. A task fallback handles a descendant
// native listener stopping propagation before the event returns to the root.
const CAPTURE_FLUSH_FALLBACK = /* @__PURE__ */ Symbol('octane.capture.flushFallback');

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
	if (_dispatchDepth === 0 && DISCRETE_EVENTS.has(type)) {
		// Commit handler-scheduled work first, so the controlled restore below
		// compares the DOM against the values the handlers just rendered.
		if (hasPendingWork()) {
			// A transition-only queue in an app armed for ViewTransition must reach the
			// regular flush controller. flushSync deliberately skips animations; using
			// it here meant the canonical onClick={() => startTransition(...)} pattern
			// could never call document.startViewTransition. flush() also knows how to
			// leave a second transition queued while an earlier one is still in flight.
			if (VIEW_TRANSITION_DRIVER?.queueAllTransition() === true) flush();
			else flushSync(noop);
		}
		// The restore runs even when NO work was scheduled — a rejected/unheard
		// edit (no onInput, or an Object.is-equal setState) schedules nothing and
		// is exactly the case that must snap back (React's restoreControlledState).
		if (pendingRestores.length > 0) restoreControlledStates();
	}
	// Clear after the click's own handlers (and its outermost flush, when this is
	// not a nested dispatch), including canceled/eventless activations.
	if (type === 'click') activationCheckable = null;
}

function finishCaptureDispatch(event: Event): void {
	const type = event.type;
	if (!event.bubbles || event.cancelBubble || !_delegated.has(type)) {
		if (event.bubbles && _delegated.has(type) && (event as any)[DELEGATED_DISPATCHED] !== true)
			maybeEnqueueRestore(event);
		maybeFlushDiscrete(type);
		return;
	}
	if (!DISCRETE_EVENTS.has(type) || (event as any)[CAPTURE_FLUSH_FALLBACK] === true) return;
	(event as any)[CAPTURE_FLUSH_FALLBACK] = true;
	const fallback = () => {
		// The ordinary bubble listener stamped the event and already flushed. If
		// propagation was stopped below the root, it never ran: enqueue the edit
		// restore now and close the capture-only discrete window.
		if ((event as any)[DELEGATED_DISPATCHED] !== true) {
			maybeEnqueueRestore(event);
			maybeFlushDiscrete(type);
		}
	};
	const target = event.target as HTMLInputElement | null;
	const checkableChange =
		type === 'change' &&
		target?.localName === 'input' &&
		(target.type === 'checkbox' || target.type === 'radio');
	// Chromium may checkpoint microtasks between a checkable's root capture
	// and bubble observations. Other discrete events retain the established
	// microtask fallback (notably stopped controlled-select change).
	if (checkableChange) setTimeout(fallback, 0);
	else queueMicrotask(fallback);
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
	const discrete = DISCRETE_EVENTS.has(event.type);
	if (discrete) ACTIVE_DISCRETE_EVENT_DEPTH++;
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
			// Enter/leave and scroll events fire on the target only (see
			// TARGET_ONLY_DELEGATED). Other capture-delegated non-bubbling events
			// emulate React propagation and continue through logical ancestors.
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
		if (discrete) ACTIVE_DISCRETE_EVENT_DEPTH--;
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
	// A registered bubble listener owns final restoration after bubble handlers.
	// Enqueuing here would let the capture fallback restore a checkable before
	// its native onChange handler can observe the activated value.
	if (!event.bubbles || !_delegated.has(event.type)) maybeEnqueueRestore(event);
	const key = CAPTURE_PREFIX + event.type;
	const path: any[] = [];
	for (let node = event.target as any; node !== null && node !== undefined; ) {
		path.push(node);
		node = node.$$portalParent ? node.$$portalParent : node.parentNode;
	}
	_dispatchDepth++;
	const discrete = DISCRETE_EVENTS.has(event.type);
	if (discrete) ACTIVE_DISCRETE_EVENT_DEPTH++;
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
		if (discrete) ACTIVE_DISCRETE_EVENT_DEPTH--;
		_dispatchDepth--;
		finishCaptureDispatch(event);
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
	/** Whether the compiler's spread-aware form aggregation path has committed. */
	formSeen: boolean;
	/** Previous final default props, needed for React's removal cascades. */
	formDefaultValue: unknown;
	formDefaultChecked: unknown;
	/** Previous final <select multiple> mode. */
	formMultiple: boolean;
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

// The checkable input whose click ACTIVATION is currently in flight: the
// platform has toggled `checked` but the activation's `input`/`change`
// post-steps have not been dispatched yet. Commits inside this window use
// React's prop-diff (not DOM-diff) semantics for `checked`, so a handler's
// flushSync cannot revert the user's toggle before the native input/change
// handlers get to read it. Set by maybeEnqueueRestore and cleared at the end
// of that click's dispatch by maybeFlushDiscrete.
let activationCheckable: Element | null = null;

// Installed by the first retained controlled-checked binding. Generic text and
// select restoration keep only the nullable call when checked/radio support is
// absent, allowing the concrete checked + radio-group graph to tree-shake.
let CHECKED_RESTORE: ((input: HTMLInputElement, ctrl: ControlledState) => void) | null = null;

// A native select choice emits `input` immediately followed by `change`. Octane
// exposes native onChange, so restoring the controlled selection at the end of
// the first dispatch would make the second handler observe the old value. Hold
// select-input restores until the current task's native event pair completes.
let pendingSelectInputRestores: Element[] = [];
let selectInputRestoreScheduled = false;

// Commit-deferred controlled work, drained at the HEAD of commitEffects:
//  - select re-projection: compiled binding mounts run BEFORE the same
//    render's @for/@if construct calls, so a `<select value>` binding fires
//    while its @for options don't exist yet — the commit-phase pass
//    re-projects once the whole tree is built (React resolves selects
//    post-mount the same way).
//  - select defaultValue: same ordering problem, projected with
//    defaultSelected stamped.
//  - dev native-event diagnostics: evaluated only after ALL of an element's
//    bindings mounted (an event slot may be stamped after value/checked in
//    source order). This queue is null in production, so an optimized build
//    allocates no diagnostic array or per-element diagnostic record.
let SELECT_SYNCS: HTMLSelectElement[] = [];
let SELECT_DEFAULT_SYNCS: { el: HTMLSelectElement; value: unknown }[] = [];
let DEV_FORM_CHECKS: Element[] | null = process.env.NODE_ENV === 'production' ? null : [];
let AUTOFOCUS_QUEUE: Element[] = [];

/** True when controlled commit work is queued (folds into hasPendingWork). */
function hasControlledSyncs(): boolean {
	return (
		SELECT_SYNCS.length > 0 ||
		SELECT_DEFAULT_SYNCS.length > 0 ||
		(DEV_FORM_CHECKS !== null && DEV_FORM_CHECKS.length > 0) ||
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

/** Text-entry controls (IME-capable; their diagnostic specifically requires onInput). */
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

/** Get-or-create the shared controlled-state record and restoration listeners. */
function armControlledBase(el: Element): ControlledState {
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
			formSeen: false,
			formDefaultValue: UNCONTROLLED,
			formDefaultChecked: UNCONTROLLED,
			formMultiple: false,
		};
		(el as any).$$ctrl = ctrl;
		// The restore pass rides the delegated dispatchers — an armed control
		// must hear its native edit events even when NO component listens
		// (React attaches root listeners eagerly; octane delegates lazily).
		delegateEvents(RESTORE_EVENT_LIST);
	}
	return ctrl;
}

/** Full arming for controls that may accept IME text composition. */
function armControlled(el: Element): ControlledState {
	const existing = (el as any).$$ctrl as ControlledState | undefined;
	if (existing !== undefined) return existing;
	const ctrl = armControlledBase(el);
	// Direct checked-only compiler sites use armControlledBase instead. Their
	// statically-known checkbox/radio type proves these text listeners are dead.
	if (isTextEntry(el)) {
		el.addEventListener('compositionstart', onCtrlCompositionStart);
		el.addEventListener('compositionend', onCtrlCompositionEnd);
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

interface DevFormDiagnosticState {
	/** Last emitted broken-state signature; null after a valid commit. */
	last: string | null;
	/** The compiler already published the onChange-specific warning. */
	staticNativeChange: boolean;
}

function getDevFormDiagnosticState(el: Element): DevFormDiagnosticState | undefined {
	return (el as any).__oct_form_diagnostic as DevFormDiagnosticState | undefined;
}

function ensureDevFormDiagnosticState(el: Element): DevFormDiagnosticState {
	let state = getDevFormDiagnosticState(el);
	if (state === undefined) {
		state = { last: null, staticNativeChange: false };
		(el as any).__oct_form_diagnostic = state;
	}
	return state;
}

/**
 * Whether this runtime host write belongs to development-compiled output.
 * The source-location side channel is absent from prod-compiled bodies, which
 * keeps the octane-prod project silent even though it imports the dev runtime.
 * Walk parent blocks for runtime string hosts/de-opt descriptors whose own
 * synthetic body has no source table.
 */
function hasDevFormDiagnosticContext(el: Element, scope?: Scope): boolean {
	if ((el as any).__oct_loc !== undefined) return true;
	let block = (scope ?? CURRENT_SCOPE)?.block ?? CURRENT_BLOCK;
	while (block !== null) {
		if (
			block.locs !== undefined ||
			block.locFile !== undefined ||
			componentSourceLoc(block.body) !== undefined
		)
			return true;
		block = block.parentBlock;
	}
	return false;
}

function hasPotentialFormDiagnostic(el: Element): boolean {
	if (el.namespaceURI !== HTML_NS || isHtmlCustomElement(el)) return false;
	if (getDevFormDiagnosticState(el) !== undefined) return true;
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (el.localName === 'select') return ctrl !== undefined && ctrl.sv !== null;
	if (el.localName === 'input') {
		const input = el as HTMLInputElement;
		if (input.type === 'checkbox' || input.type === 'radio') {
			return ctrl !== undefined && ctrl.c !== -1;
		}
	}
	if (!isTextEntry(el)) return false;
	return (
		(ctrl !== undefined && ctrl.v !== UNCONTROLLED) ||
		isUsableEventSlot((el as any).$$change) ||
		isUsableEventSlot((el as any)['$$capture:change'])
	);
}

// Queue once per element/commit. Validation itself runs at the head of commit,
// after final source/spread order has settled and before layout effects.
function queueDevFormDiagnostic(el: Element, scope?: Scope, force = false): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	const q = DEV_FORM_CHECKS;
	if (q === null || (!force && !hasDevFormDiagnosticContext(el, scope))) return;
	if (!hasPotentialFormDiagnostic(el)) return;
	if (q.indexOf(el) === -1) q.push(el);
}

/** @internal Compiler helper for a final-props runtime-check host. */
export function queueNativeChangeDiagnostic(el: Element): void {
	if (process.env.NODE_ENV !== 'production')
		queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/** @internal Compiler helper for a host whose build warning already fired. */
export function markNativeChangeDiagnosticStatic(el: Element): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	ensureDevFormDiagnosticState(el).staticNativeChange = true;
	queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/** Consume compiler descriptor metadata without ever reflecting it to the DOM. */
function setNativeChangeDiagnosticMetadata(el: Element, value: unknown): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (value === 'static') {
		markNativeChangeDiagnosticStatic(el);
		return;
	}
	const state = getDevFormDiagnosticState(el);
	if (state !== undefined) state.staticNativeChange = false;
	if (value === 'runtime') queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
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
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.v !== UNCONTROLLED)
			devWarnControlledFlip(el, false);
		// React parity: mounting/flipping to uncontrolled leaves the DOM as-is.
		ctrl.v = UNCONTROLLED;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		return;
	}
	const s = toControlledString(value);
	if (first) {
		ctrl.v = value;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		// Hydration ADOPTS: the server already serialized this value, and
		// pre-hydration user input survives until the element's first real
		// commit or discrete event (React parity) — zero writes, no warnings. A
		// fresh structural replacement is client-built and needs normal projection.
		const hydration = activeHydration();
		if (hydration !== null && !hydration.isFresh(el)) return;
		// PROPERTY first (React initInput order): the write marks the control
		// DIRTY, so the attribute write below — and any later defaultValue
		// binding — can never drag the live value along.
		if (input.value !== s) input.value = s;
		// The value ATTRIBUTE mirrors the controlled value (React's
		// attribute-syncing cascade: value wins over defaultValue).
		input.defaultValue = s;
		return;
	}
	if (process.env.NODE_ENV !== 'production' && ctrl.v === UNCONTROLLED)
		devWarnControlledFlip(el, true);
	const prev = ctrl.v;
	ctrl.v = value;
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
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
function setCheckedState(input: HTMLInputElement, value: unknown, ctrl: ControlledState): void {
	const first = !ctrl.sawC;
	ctrl.sawC = true;
	if (value == null) {
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.c !== -1)
			devWarnControlledFlip(input, false);
		ctrl.c = -1;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
		return;
	}
	const b = !!value;
	CHECKED_RESTORE ??= restoreCheckedState;
	if (first) {
		ctrl.c = b;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
		const hydration = activeHydration();
		if (hydration !== null && !hydration.isFresh(input)) return;
		// PROPERTY first (marks checkedness dirty — see setValue), then the
		// attribute baseline (React's cascade: checked wins over defaultChecked).
		if (input.checked !== b) input.checked = b;
		input.defaultChecked = b;
		return;
	}
	if (process.env.NODE_ENV !== 'production' && ctrl.c === -1) devWarnControlledFlip(input, true);
	// While a click activation is in flight (platform toggled the DOM;
	// input/change not yet dispatched), an UNCHANGED prop must not clobber the
	// user's toggle — React's update path diffs prev props, not the DOM, so a
	// mid-dispatch flushSync commit leaves the drift for the event-side restore.
	// This covers the activated element AND its radio-group cousins: the platform
	// unchecked the cousin as part of the same toggle, and re-checking it would
	// make the browser uncheck the activation target before its follow-up events
	// fire. A prop that actually CHANGED in this window still writes.
	const changed = b !== ctrl.c;
	ctrl.c = b;
	if (process.env.NODE_ENV !== 'production')
		queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
	if ((changed || !inActivationWindow(input)) && input.checked !== b) input.checked = b;
}

/**
 * True while `input` is the checkable whose click activation is in flight, or
 * a same-group radio cousin of it (group scope mirrors restoreRadioCousins:
 * same non-empty name, same form owner).
 */
function inActivationWindow(input: HTMLInputElement): boolean {
	const target = activationCheckable as HTMLInputElement | null;
	if (target === null) return false;
	if (input === target) return true;
	return (
		input.type === 'radio' &&
		target.type === 'radio' &&
		input.name !== '' &&
		input.name === target.name &&
		input.form === target.form
	);
}

export function setChecked(el: Element, value: unknown): void {
	setCheckedState(el as HTMLInputElement, value, armControlled(el));
}

/**
 * Compiler-only checked binding for a statically-known checkbox/radio whose
 * type cannot be changed by a spread. It keeps the complete controlled record
 * and event restoration contract, but cannot need text-composition listeners.
 */
export function setCheckedCheckable(el: Element, value: unknown): void {
	setCheckedState(el as HTMLInputElement, value, armControlledBase(el));
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
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.sv !== null)
			devWarnControlledFlip(el, false);
		ctrl.sv = null;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		return;
	}
	if (process.env.NODE_ENV !== 'production' && !first && ctrl.sv === null)
		devWarnControlledFlip(el, true);
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
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
	// Hydration ADOPTS the server-emitted `selected` state — and must not
	// enqueue the commit sync either (the post-hydration microtask commit
	// would clobber a pre-hydration user selection). A fresh replacement has no
	// user state to preserve and follows the ordinary client-mount path.
	const hydration = activeHydration();
	if (hydration !== null && !hydration.isFresh(el)) return;
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
	const hydration = activeHydration();
	if ((hydration !== null && !hydration.isFresh(el)) || value == null) return;
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

/**
 * Compiler-only defaultValue binding for a statically-known input/textarea
 * with no value writer or spread. The element is necessarily uncontrolled, so
 * it needs neither a controlled-state record nor edit/composition listeners.
 */
export function setDefaultValueUncontrolled(el: Element, value: unknown): void {
	const hydration = activeHydration();
	if ((hydration !== null && !hydration.isFresh(el)) || value == null) return;
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	const s = toControlledString(value);
	if (input.defaultValue !== s) input.defaultValue = s;
}

/** Compiler-emitted binding for `defaultChecked` (uncontrolled checkables). */
export function setDefaultChecked(el: Element, value: unknown): void {
	const ctrl = armControlled(el);
	const hydration = activeHydration();
	if ((hydration !== null && !hydration.isFresh(el)) || value == null) return;
	// A controlled `checked` owns the attribute baseline (React's cascade).
	if (ctrl.c !== -1) return;
	const input = el as HTMLInputElement;
	const b = !!value;
	if (input.defaultChecked !== b) input.defaultChecked = b;
}

/**
 * Apply the final form-control prop set for a compiled host containing JSX
 * spreads. Each direct source is `[false, name, value]`; each snapshotted
 * spread is `[true, object]`. Resolving all sources first makes the controlled
 * cascades independent of object-key order (`multiple` before select `value`,
 * controlled value before its default fallback) while the compiler-owned
 * source bindings preserve authored evaluation order and single getter reads.
 */
export function setFormControlSources(
	el: Element,
	sources: ReadonlyArray<readonly [boolean, unknown, unknown?]>,
): void {
	let value: unknown;
	let defaultValue: unknown;
	let checked: unknown;
	let defaultChecked: unknown;
	let multiple: unknown;
	const tag = el.localName;

	const assign = (name: string, next: unknown) => {
		switch (name) {
			case 'value':
				value = next;
				break;
			case 'defaultValue':
				defaultValue = next;
				break;
			case 'checked':
				if (tag === 'input') checked = next;
				break;
			case 'defaultChecked':
				if (tag === 'input') defaultChecked = next;
				break;
			case 'multiple':
				if (tag === 'select') multiple = next;
				break;
		}
	};

	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (!source[0]) {
			assign(source[1] as string, source[2]);
			continue;
		}
		const spread = source[1];
		if (spread == null || (typeof spread !== 'object' && typeof spread !== 'function')) continue;
		const object = Object(spread) as Record<string, unknown>;
		if (Object.prototype.propertyIsEnumerable.call(object, 'value')) assign('value', object.value);
		if (Object.prototype.propertyIsEnumerable.call(object, 'defaultValue'))
			assign('defaultValue', object.defaultValue);
		if (tag === 'input') {
			if (Object.prototype.propertyIsEnumerable.call(object, 'checked'))
				assign('checked', object.checked);
			if (Object.prototype.propertyIsEnumerable.call(object, 'defaultChecked'))
				assign('defaultChecked', object.defaultChecked);
		} else if (tag === 'select' && Object.prototype.propertyIsEnumerable.call(object, 'multiple')) {
			assign('multiple', object.multiple);
		}
	}

	const ctrl = armControlled(el);
	const first = !ctrl.formSeen;
	const previousDefaultValue = ctrl.formDefaultValue;
	const previousDefaultChecked = ctrl.formDefaultChecked;
	const previousMultiple = ctrl.formMultiple;
	ctrl.formSeen = true;
	ctrl.formDefaultValue = defaultValue;
	ctrl.formDefaultChecked = defaultChecked;

	if (tag === 'input') {
		const input = el as HTMLInputElement;
		// React initInput normalizes the default before the controlled value even
		// though the controlled writer owns the final baseline. Preserve that
		// observable coercion order, and reuse the normalized default when it is
		// the uncontrolled fallback so a custom toString runs exactly once.
		const defaultString = defaultValue == null ? null : toControlledString(defaultValue);
		setValue(input, value);
		if (value == null) {
			if (defaultString !== null) setDefaultValue(input, defaultString);
			else if (!first && previousDefaultValue !== UNCONTROLLED && previousDefaultValue != null)
				input.removeAttribute('value');
		}
		setChecked(input, checked);
		if (checked == null && defaultChecked != null) setDefaultChecked(input, defaultChecked);
		if (
			!first &&
			defaultChecked == null &&
			previousDefaultChecked !== UNCONTROLLED &&
			previousDefaultChecked != null
		) {
			input.defaultChecked = false;
		}
		return;
	}

	if (tag === 'textarea') {
		const textarea = el as HTMLTextAreaElement;
		setValue(textarea, value);
		if (value == null) {
			if (defaultValue != null) setDefaultValue(textarea, defaultValue);
			else if (!first && textarea.defaultValue !== '') textarea.defaultValue = '';
		}
		return;
	}

	const select = el as HTMLSelectElement;
	const multipleType = typeof multiple;
	const nextMultiple = !!multiple && multipleType !== 'function' && multipleType !== 'symbol';
	ctrl.formMultiple = nextMultiple;
	if (select.multiple !== nextMultiple) select.multiple = nextMultiple;
	if (!first && previousMultiple !== nextMultiple && value == null) {
		if (defaultValue != null) ctrl.dvv = UNCONTROLLED;
		else projectSelectValue(select, nextMultiple ? new Set<string>() : '', false);
	}
	setSelectValue(select, value);
	if (defaultValue != null) setDefaultValue(select, defaultValue);
	else ctrl.dvv = UNCONTROLLED;
}

interface FormDiagnosticOutcome {
	signature: string;
	message: string;
}

function nativeTextChangeMessage(
	el: Element,
	hasBubbleChange: boolean,
	controlled: boolean,
): string {
	const changeProp = hasBubbleChange ? 'onChange' : 'onChangeCapture';
	const inputProp = hasBubbleChange ? 'onInput' : 'onInputCapture';
	const host =
		el.localName === 'textarea' ? '<textarea>' : `<input type="${(el as HTMLInputElement).type}">`;
	const controlledHint = controlled
		? ' Because this field is controlled, edits are restored before the later native ' +
			'change can run; use `defaultValue` for editable commit-only behavior.'
		: '';
	const loc = (el as any).__oct_loc;
	const source = typeof loc === 'string' ? ` (${loc})` : '';
	return (
		`[OCTANE_NATIVE_TEXT_ONCHANGE] \`${changeProp}\` on ${host} is a native commit ` +
		`event in Octane; it does not run for each text edit. Use \`${inputProp}\` for ` +
		'per-edit updates. If commit/blur behavior is intentional, add ' +
		'`suppressNativeChangeWarning`.' +
		controlledHint +
		source
	);
}

/** Resolve the element's one current broken-state signature, if any. */
function formDiagnosticOutcome(el: Element): FormDiagnosticOutcome | null {
	if (el.namespaceURI !== HTML_NS || isHtmlCustomElement(el)) return null;
	const host = el as any;
	if (
		host.readOnly === true ||
		host.disabled === true ||
		el.hasAttribute('readonly') ||
		el.hasAttribute('disabled')
	)
		return null;

	const hasInput =
		isUsableEventSlot(host.$$input as EventSlot) ||
		isUsableEventSlot(host['$$capture:input'] as EventSlot);
	const hasBubbleChange = isUsableEventSlot(host.$$change as EventSlot);
	const hasCaptureChange = isUsableEventSlot(host['$$capture:change'] as EventSlot);
	const hasChange = hasBubbleChange || hasCaptureChange;
	const ctrl = host.$$ctrl as ControlledState | undefined;

	if (isTextEntry(el)) {
		const controlled = ctrl !== undefined && ctrl.v !== UNCONTROLLED;
		if (hasInput) return null;
		if (hasChange) {
			const dev = getDevFormDiagnosticState(el);
			if (host.__oct_native_change_suppressed === true || dev?.staticNativeChange === true)
				return null;
			const phase = hasBubbleChange ? (hasCaptureChange ? 'both' : 'bubble') : 'capture';
			return {
				signature: `native-change:${el.localName}:${(el as HTMLInputElement).type}:${phase}:${controlled ? 'controlled' : 'uncontrolled'}`,
				message: nativeTextChangeMessage(el, hasBubbleChange, controlled),
			};
		}
		if (!controlled) return null;
		return {
			signature: `controlled-text-missing:${el.localName}:${(el as HTMLInputElement).type}`,
			message:
				'You provided a `value` prop to a form field without an `onInput` handler. This ' +
				'will render a read-only field. If the field should be mutable use ' +
				'`defaultValue`. Otherwise, set either `onInput` or `readOnly`.',
		};
	}

	if (el.localName === 'select') {
		if (ctrl === undefined || ctrl.sv === null || hasInput || hasChange) return null;
		return {
			signature: 'controlled-select-missing',
			message:
				'You provided a `value` prop to a select without an `onInput` or `onChange` ' +
				'handler. This will render a read-only field. Set a usable native handler, ' +
				'`readOnly`, or use `defaultValue` for an uncontrolled field.',
		};
	}

	const input = el as HTMLInputElement;
	const checkable =
		input.localName === 'input' && (input.type === 'checkbox' || input.type === 'radio');
	if (!checkable || ctrl === undefined || ctrl.c === -1) return null;
	const hasClick =
		isUsableEventSlot(host.$$click as EventSlot) ||
		isUsableEventSlot(host['$$capture:click'] as EventSlot);
	if (hasClick || hasInput || hasChange) return null;
	return {
		signature: `controlled-checkable-missing:${input.type}`,
		message:
			'You provided a `checked` prop to a checkbox or radio without an `onClick`, ' +
			'`onInput`, or `onChange` handler. This will render a read-only field. Set a ' +
			'usable native handler, `readOnly`, or use `defaultChecked` for an uncontrolled field.',
	};
}

function drainDevFormDiagnostics(): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	const q = DEV_FORM_CHECKS;
	if (q === null || q.length === 0) return;
	DEV_FORM_CHECKS = [];
	for (let i = 0; i < q.length; i++) {
		const el = q[i];
		const outcome = formDiagnosticOutcome(el);
		const previous = getDevFormDiagnosticState(el);
		if (outcome === null) {
			if (previous !== undefined) previous.last = null;
			continue;
		}
		if (previous?.last === outcome.signature) continue;
		ensureDevFormDiagnosticState(el).last = outcome.signature;
		console.error(outcome.message);
	}
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
	drainDevFormDiagnostics();
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
	CHECKED_RESTORE?.(el as HTMLInputElement, ctrl);
	if (
		ctrl.v !== UNCONTROLLED &&
		valueNeedsWrite(el as HTMLInputElement | HTMLTextAreaElement, ctrl.v)
	) {
		(el as HTMLInputElement).value = toControlledString(ctrl.v);
	}
}

function restoreCheckedState(input: HTMLInputElement, ctrl: ControlledState): void {
	if (ctrl.c !== -1) {
		if (input.checked !== ctrl.c) input.checked = ctrl.c;
		// A radio's drift flips its GROUP cousins too (checking one unchecks
		// another) — restore every armed cousin to ITS rendered state
		// (React's updateNamedCousins).
		if (input.type === 'radio' && input.name !== '') restoreRadioCousins(input);
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
	const checkable = t.localName === 'input' && (t.type === 'checkbox' || t.type === 'radio');
	if (event.type === 'click') {
		if (checkable) {
			// Mark the checkable whose ACTIVATION is in flight: the platform toggled
			// `checked` before this click dispatch, and its `input`/`change` post-steps
			// have not fired yet. A commit inside this window (a handler's flushSync —
			// press-state machinery does this) must not reassert the still-uncommitted
			// prop over the user's toggle: the checked binding switches to React's
			// prop-diff semantics for the marked element (see setCheckedState).
			const ctrl = t.$$ctrl as ControlledState;
			if (ctrl.c !== -1) activationCheckable = t as Element;
			// The platform dispatches click after pre-activation, then input/change.
			// Remember that sequence so input does not restore before native change.
			// The task fallback owns canceled activation and propagation starvation:
			// after the browser finishes its post-click work, reassert the latest
			// rendered state if delegated change did not complete the sequence.
			t.$$checkableActivation = true;
			setTimeout(() => {
				if (t.$$checkableActivation === true) {
					t.$$checkableActivation = false;
					if (t === activationCheckable) activationCheckable = null;
					restoreControlledElement(t);
				}
			}, 0);
		}
		return;
	}
	// The activation's follow-up events have arrived — the write-guard window is over.
	if (t === activationCheckable) activationCheckable = null;
	if (event.type === 'input' && t.localName === 'select') {
		if (pendingSelectInputRestores.indexOf(t) === -1) pendingSelectInputRestores.push(t);
		if (!selectInputRestoreScheduled) {
			selectInputRestoreScheduled = true;
			queueMicrotask(() => {
				selectInputRestoreScheduled = false;
				const list = pendingSelectInputRestores;
				pendingSelectInputRestores = [];
				for (let i = 0; i < list.length; i++) restoreControlledElement(list[i]);
			});
		}
		return;
	}
	if (event.type === 'input' && checkable && t.$$checkableActivation === true) return;
	if (event.type === 'change' && checkable) t.$$checkableActivation = false;
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
	const hydration = activeHydration();
	if (hydration !== null) {
		return hydration.suspend(() =>
			renderPortalState(prev, parentBlock, target, rawBody, rawProps, host, env),
		);
	}
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
			renderReturnedValue,
		);
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
			__profileTrackComponent(block, profilePortalComponent(rawBody));
		}
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
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
			__profileTrackComponent(state.block!, profilePortalComponent(rawBody));
		}
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
		return {
			body: rawBody.type as ComponentBody,
			props: rawBody.props,
		};
	}
	// Host element / array / primitive / component-descriptor → render via childSlot
	// inside the portal Block (genericPortalBody has stable identity, so the portal
	// reconciles its content across re-renders rather than rebuilding).
	return {
		body: genericPortalBody as unknown as ComponentBody,
		props: rawBody,
	};
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
/* @__NO_SIDE_EFFECTS__ */
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
// ElementDescriptor.key intentionally matches React's public shape (`null` for
// both no key and a nullish key), so preserve compiler-visible key PRESENCE out
// of band. This lets hydration keep an explicit `key={undefined}` as an
// independent reconciliation boundary without adding an observable descriptor
// field or penalizing unkeyed descriptors with extra object shape.
const KEYED_ELEMENT_DESCRIPTORS = new WeakSet<object>();
// Children.map/toArray synthesize stable traversal keys. Keep the original
// missing-key validation state out of band so rebasing an unkeyed element from
// a dynamic collection does not accidentally silence the renderer warning.
const ELEMENTS_MISSING_LIST_KEY = new WeakSet<object>();
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
}

function hasElementConfigKey(config: any): boolean {
	if (config == null || (typeof config !== 'object' && typeof config !== 'function')) return false;
	const own = Object.getOwnPropertyDescriptor(config, 'key');
	// React's development-only props.key warning getter is not a real key. This
	// matters when an element's props object is fed back into createElement.
	if (own?.get != null && (own.get as any).isReactWarning) return false;
	return config.key !== undefined;
}

function copyElementConfig(config: any): any {
	const props: any = {};
	if (config == null) return props;
	for (const name in config) {
		if (name !== 'key' && hasOwnProp.call(config, name)) props[name] = config[name];
	}
	return props;
}

function applyElementDefaultProps(type: any, props: any): void {
	const defaults = type?.defaultProps;
	if (defaults == null) return;
	for (const name in defaults) {
		if (props[name] === undefined) props[name] = defaults[name];
	}
}

function finalizeElementDescriptor<P>(descriptor: ElementDescriptor<P>): ElementDescriptor<P> {
	if (process.env.NODE_ENV !== 'production') {
		Object.freeze(descriptor.props);
		Object.freeze(descriptor);
	}
	return descriptor;
}
// React-shape `createElement(type, props, ...children)`. Two-arg calls
// (`createElement(Comp, props)`) stay the component-value form the compiler emits
// for `{<Comp/>}`. With a string `type` and/or explicit children it produces a
// host descriptor for the runtime de-opt renderer. `key` is lifted out of props
// (React semantics — `key` is never a real prop).
export function createElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props?: P,
	...children: any[]
): ElementDescriptor<P> {
	const src = (props ?? null) as any;
	const hasKey = hasElementConfigKey(src);
	const key = hasKey ? '' + src.key : null;
	const hasPositional = children.length > 0;
	let kids = hasPositional ? (children.length === 1 ? children[0] : children) : src?.children;
	// Multiple positional children → a fresh array of FIXED siblings (never reordered).
	// Tag it so the de-opt list keys them by index without the missing-key warning that
	// is meant for `.map()` results. (A single child is passed through as-is — a lone
	// `.map()` array stays untagged and keeps the warning.)
	if (children.length > 1) {
		POSITIONAL_CHILDREN.add(children);
		if (process.env.NODE_ENV !== 'production') Object.freeze(children);
	}
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
	// createElement is callable userland API, so it must snapshot config even on
	// the common two-argument path. Mutating the caller's object after creation
	// must not retroactively mutate the element.
	const keyWasProvided =
		src != null && (typeof src === 'object' || typeof src === 'function') && 'key' in src;
	const p = copyElementConfig(src);
	if (hasPositional) p.children = kids;
	applyElementDefaultProps(type, p);
	kids = p.children;
	const descriptor: ElementDescriptor<P> = {
		$$kind: ELEMENT_TAG,
		type,
		props: p as P,
		key,
		ref: p.ref !== undefined ? p.ref : null,
		children: kids ?? null,
	};
	if (keyWasProvided) KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	return finalizeElementDescriptor(descriptor);
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
	const props = copyElementConfig(element.props);
	let key = element.key;
	let hasKeyOverride = false;
	if (config != null) {
		hasKeyOverride = hasElementConfigKey(config);
		if (hasKeyOverride) key = '' + config.key;
		for (const name in config) {
			if (name === 'key') continue;
			// React 19 keeps refs as props, but cloneElement treats an explicitly
			// undefined ref as absent for backwards compatibility.
			if (name === 'ref' && config.ref === undefined) continue;
			if (hasOwnProp.call(config, name)) props[name] = config[name];
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
	if (n > 0) props.children = kids;
	const descriptor: ElementDescriptor<P> = {
		$$kind: ELEMENT_TAG,
		type: element.type,
		props,
		key,
		ref: props.ref !== undefined ? props.ref : null,
		children: kids ?? null,
	};
	if (
		KEYED_ELEMENT_DESCRIPTORS.has(element) ||
		(config != null && Object.prototype.hasOwnProperty.call(config, 'key'))
	) {
		KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	}
	// A mapped/toArray descriptor retains its missing-key provenance when it is
	// cloned unchanged. Supplying a real replacement key fixes that diagnostic,
	// just as React.cloneElement(mappedChild, {key}) does.
	if (ELEMENTS_MISSING_LIST_KEY.has(element) && !hasKeyOverride) {
		ELEMENTS_MISSING_LIST_KEY.add(descriptor);
	}
	return finalizeElementDescriptor(descriptor);
}

function cloneAndReplaceElementKey(element: ElementDescriptor, key: string): ElementDescriptor {
	const descriptor: ElementDescriptor = {
		$$kind: ELEMENT_TAG,
		type: element.type,
		props: element.props,
		key,
		ref: element.ref,
		children: element.children,
	};
	KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	if (ELEMENTS_MISSING_LIST_KEY.has(element)) ELEMENTS_MISSING_LIST_KEY.add(descriptor);
	return finalizeElementDescriptor(descriptor);
}

function escapeElementKey(key: string): string {
	return '$' + key.replace(/[=:]/g, (match) => (match === '=' ? '=0' : '=2'));
}

function escapeMappedElementKey(key: string): string {
	return key.replace(/\/+/g, '$&/');
}

function childElementKey(child: any, index: number): string {
	return child != null && typeof child === 'object' && child.key != null
		? escapeElementKey('' + child.key)
		: index.toString(36);
}

function childrenIterator(children: any): (() => Iterator<any>) | null {
	// React's getIteratorFn deliberately accepts objects only. Functions are
	// ignored children even when userland attaches Symbol.iterator to one.
	if (children == null || typeof children !== 'object') return null;
	const iterator =
		(typeof Symbol === 'function' && (children as any)[Symbol.iterator]) ||
		(children as any)['@@iterator'];
	return typeof iterator === 'function' ? iterator : null;
}

function resolveChildrenThenable(thenable: TrackedThenable): any {
	// During a component render, use the same tracked call-order storage and
	// Suspense sentinel as use(). This lets a cached promise in Children.map
	// suspend and replay through the nearest Octane boundary.
	if (CURRENT_BLOCK !== null) return useThenable(thenable);
	trackThenable(thenable);
	if (thenable.status === 'fulfilled') return thenable.value;
	if (thenable.status === 'rejected') throw thenable.reason;
	throw thenable;
}

function describeObjectForError(value: object): string {
	let rendered: string;
	try {
		rendered = String(value);
	} catch {
		return 'object with keys {' + Object.keys(value).join(', ') + '}';
	}
	return rendered === '[object Object]'
		? 'object with keys {' + Object.keys(value).join(', ') + '}'
		: rendered;
}

function invalidChildError(child: object): Error {
	const found = describeObjectForError(child);
	return new Error(
		'Objects are not valid as an Octane child (found: ' +
			found +
			'). If you meant to render a collection of children, use an array instead.',
	);
}

function invalidElementTypeError(type: unknown): Error {
	const found =
		type === null
			? 'null'
			: type === undefined
				? 'undefined'
				: typeof type === 'object'
					? describeObjectForError(type as object)
					: JSON.stringify(type);
	return new Error(
		'Element type is invalid: expected a string (for a built-in element) or a function ' +
			`(for a component), but got: ${found}.`,
	);
}

function mapIntoChildren(
	children: any,
	out: any[],
	escapedPrefix: string,
	nameSoFar: string,
	callback: (child: any) => any,
	validateKey = false,
): number {
	let type = typeof children;
	if (type === 'undefined' || type === 'boolean') {
		children = null;
		type = 'object';
	}

	const isLeaf =
		children === null ||
		type === 'string' ||
		type === 'number' ||
		type === 'bigint' ||
		isElementDescriptor(children) ||
		(children != null && children.$$kind === PORTAL_TAG);
	if (isLeaf) {
		const child = children;
		let mapped = callback(child);
		const childKey = nameSoFar === '' ? '.' + childElementKey(child, 0) : nameSoFar;
		if (Array.isArray(mapped)) {
			mapIntoChildren(mapped, out, escapeMappedElementKey(childKey) + '/', '', (value) => value);
		} else if (mapped != null) {
			if (isElementDescriptor(mapped)) {
				const mappedKey = mapped.key;
				mapped = cloneAndReplaceElementKey(
					mapped,
					escapedPrefix +
						(mappedKey != null && (!child || child.key !== mappedKey)
							? escapeMappedElementKey('' + mappedKey) + '/'
							: '') +
						childKey,
				);
				if (validateKey && isElementDescriptor(child) && child.key == null) {
					ELEMENTS_MISSING_LIST_KEY.add(mapped);
				}
			}
			out.push(mapped);
		}
		return 1;
	}

	let count = 0;
	const nextPrefix = nameSoFar === '' ? '.' : nameSoFar + ':';
	if (Array.isArray(children)) {
		const validateItems = validateKey || !POSITIONAL_CHILDREN.has(children);
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			count += mapIntoChildren(
				child,
				out,
				escapedPrefix,
				nextPrefix + childElementKey(child, i),
				callback,
				validateItems,
			);
		}
		return count;
	}

	const iterator = childrenIterator(children);
	if (iterator !== null) {
		const cursor = iterator.call(children);
		let step: IteratorResult<any>;
		let i = 0;
		while (!(step = cursor.next()).done) {
			const child = step.value;
			count += mapIntoChildren(
				child,
				out,
				escapedPrefix,
				nextPrefix + childElementKey(child, i++),
				callback,
				true,
			);
		}
		return count;
	}

	if (type === 'object') {
		if (typeof children.then === 'function') {
			return mapIntoChildren(
				resolveChildrenThenable(children),
				out,
				escapedPrefix,
				nameSoFar,
				callback,
				validateKey,
			);
		}
		throw invalidChildError(children);
	}
	return 0;
}

export const Children = {
	/** Iterate children, flattening collections; empties are visited as `null`. */
	forEach(children: any, fn: (child: any, index: number) => void, context?: any): void {
		if (children == null) return;
		let index = 0;
		mapIntoChildren(children, [], '', '', (child) => {
			fn.call(context, child, index++);
			return null;
		});
	},
	/** Map children to a flat, React-keyed array; empty results are dropped. */
	map<T>(
		children: any,
		fn: (child: any, index: number) => T,
		context?: any,
	): T[] | null | undefined {
		if (children == null) return children as null | undefined;
		const out: T[] = [];
		let index = 0;
		mapIntoChildren(children, out, '', '', (child) => fn.call(context, child, index++));
		return out;
	},
	/** Number of children `map`/`forEach` would visit (empties included, like React). */
	count(children: any): number {
		if (children == null) return 0;
		return mapIntoChildren(children, [], '', '', () => null);
	},
	/** Flatten children into a React-keyed array, dropping empty entries. */
	toArray(children: any): any[] {
		const out: any[] = [];
		if (children != null) mapIntoChildren(children, out, '', '', (child) => child);
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
	/** The call site supplied `key=`, even when its current value is undefined. */
	keyed: boolean;
}

const NO_KEY: unique symbol = Symbol('NO_KEY');

/** Generic component call site: reconcile any JavaScript return value. */
export function componentSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string,
	props: any,
	anchor?: Node | null,
	key?: any,
	singleRoot?: boolean | 2,
	inherit?: boolean,
	hasKey?: boolean,
): void {
	if (typeof comp !== 'function' && typeof comp !== 'string') {
		throw invalidElementTypeError(comp);
	}
	// Dynamic JSX tags can resolve to a host STRING at runtime. Keep this
	// descriptor/de-opt capability in the generic entry point: compiler-proven
	// void component calls can then retain the function-only core without also
	// retaining hostStringTagBody, generic attributes, or return reconciliation.
	const body = typeof comp === 'string' ? (hostStringTagBody as unknown as ComponentBody) : comp;
	const renderProps =
		typeof comp === 'string'
			? ({
					$$kind: ELEMENT_TAG,
					type: comp,
					props,
					key: null,
					ref: props != null && props.ref !== undefined ? props.ref : null,
					children: props != null ? props.children : null,
				} satisfies ElementDescriptor)
			: props;
	componentSlotImpl(
		renderReturnedValue,
		parentScope,
		slotKey,
		domParent,
		body,
		comp,
		props,
		renderProps,
		anchor,
		key,
		singleRoot,
		inherit,
		hasKey,
	);
}

/** Compiler-proven `@{}` component call site: the body has no value return. */
export function componentSlotVoid(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string,
	props: any,
	anchor?: Node | null,
	key?: any,
	singleRoot?: boolean | 2,
	inherit?: boolean,
	hasKey?: boolean,
): void {
	if (typeof comp !== 'function') throw invalidElementTypeError(comp);
	componentSlotImpl(
		null,
		parentScope,
		slotKey,
		domParent,
		comp,
		comp,
		props,
		props,
		anchor,
		key,
		singleRoot,
		inherit,
		hasKey,
	);
}

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
function componentSlotImpl(
	outputHandler: OutputHandler | null,
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	// The executable render body is always a function. The generic entry point
	// maps a host string to hostStringTagBody before entering this shared core.
	body: ComponentBody,
	// Reconciliation identity. Generic dynamic tags retain their host string;
	// ordinary and compiler-proven void calls pass the component function.
	identity: ComponentBody | string,
	props: any,
	renderProps: any,
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
	// Compiler call-site bit: unlike the key value, this distinguishes an
	// explicit `key={undefined}` from an unkeyed call.
	hasKey?: boolean,
): void {
	const parentBlock = parentScope.block;
	const hydration = activeHydration();
	// A component nested inside a client-built replacement range must mount as
	// ordinary client DOM. Its fresh anchor is not server output to adopt; keep
	// the outer hydration cursor active for later server-owned siblings while
	// suspending adoption only for this component subtree.
	if (
		hydration !== null &&
		((anchor != null && hydration.isFresh(anchor)) || hydration.isFresh(domParent))
	) {
		hydration.suspend(() =>
			componentSlotImpl(
				outputHandler,
				parentScope,
				slotKey,
				domParent,
				body,
				identity,
				props,
				renderProps,
				anchor,
				key,
				singleRoot,
				inherit,
				hasKey,
			),
		);
		return;
	}
	let state = parentScope.slots[slotKey] as CompSlot | undefined;
	let hydrationCursor: Node | null = null;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Comment | null = null;
		let inherited = false;
		const rangeBoundary =
			hydration !== null
				? (
						identity as ComponentBody & {
							[HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner';
						}
					)[HYDRATION_RANGE_BOUNDARY]
				: undefined;
		const hydrationPassthrough = hydration?.passthroughRanges === true;
		const hydrationTransparent = hydrationPassthrough && rangeBoundary !== 'owner';
		if (hydrationPassthrough && rangeBoundary === 'owner') {
			hydration.passthroughRanges = false;
		}
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
		// Boundary builtins decline through their component capability bit (covers
		// member/aliased/dynamic
		// tags the compile-time name check can't see — `<octane.Suspense>`,
		// `const S = Suspense`): their pairs are load-bearing for streaming.
		// ssrComponent reads the same bit, so the server emitted a
		// pair exactly where this falls through to the adoption regimes below.
		if (
			!hydrationTransparent &&
			inherit === true &&
			hasComponentFlags(identity, COMPONENT_FLAG_BOUNDARY)
		) {
			inherit = false;
		}
		if (hydrationTransparent) {
			inherited = true;
		} else if (inherit === true && parentBlock !== null) {
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
		if (!inherited && hydration !== null && hydration.isOpen(anchor ?? null)) {
			open = anchor as Node;
			hydrationCursor = open;
		} else if (!inherited && hydration !== null && !hydration.isOpen(anchor ?? null)) {
			// The anchor is null (appended child) or a non-open marker (the slot is the
			// sole hole of a control-flow arm, so its anchor is the arm's end marker).
			// In both cases mountTry/renderBlock parked the cursor on the server range's
			// `<!--[-->`; adopt from it, the same way childSlot's cursor branch does.
			let c: Node | null = hydration.node;
			if (c === null || c.parentNode !== domParent) c = domParent.firstChild;
			hydrationCursor = c;
			if (c !== null && hydration.isOpen(c)) open = c;
		}
		if (inherited) {
			// Borrowed range resolved above; hydration adopts NOTHING — the cursor
			// already sits on this component's first content node.
		} else if (open !== null) {
			// Adopt the server range: its comments become our markers, cursor → content.
			start = open as Comment;
			end = hydration!.close(open);
			if (parentBlock === hydration!.rootBlock) hydration!.claimRootRemainder(end.nextSibling);
			hydration!.node = start.nextSibling;
		} else if (
			singleRoot === true ||
			(singleRoot === 2 && (identity as any).$$singleRoot === true)
		) {
			// Client singleRoot: NO markers — the component's single root element
			// self-delimits (set as block.startMarker/endMarker after render below).
			// The `2` form resolves cross-module callees by their definition-site
			// stamp; a string tag or unstamped component falls through to markers.
			start = null;
			end = null;
		} else {
			if (hydration !== null) {
				// A non-single-root component requires the server's component range.
				// If it is absent, the server rendered a different child shape (most
				// importantly a DOM node where the client function returns null). Own
				// the slot up to its next static anchor, discard that stale range, and
				// park hydration on the fresh close marker so the client body builds
				// rather than adopting an unrelated sibling.
				const stale = hydrationCursor;
				const loc = siteLoc(parentScope, slotKey);
				if (process.env.NODE_ENV !== 'production' && loc) {
					warnHydrationStructuralMismatch(loc, 'a component range', describeHydrationNode(stale));
				}
				let node = stale;
				while (node !== null && node !== anchor && !isBlockClose(node)) {
					const next = node.nextSibling;
					(node as ChildNode).remove();
					node = next;
				}
			}
			start = document.createComment('comp');
			end = document.createComment('/comp');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (e.g. when this slot lives in a multi-root template
			// and must sit before its enclosing block's endMarker).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
			if (hydration !== null) {
				hydration.markFresh(start);
				hydration.markFresh(end);
				hydration.node = end;
			}
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
			keyed: hasKey === true || key !== undefined,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	if (hasKey === true || key !== undefined) state.keyed = true;
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
	if (identity !== state.currentComp) {
		const transitionSwap = TRANSITION_SWAP_DRIVER;
		// Off-screen swap (React WIP model): a TRANSITION swap to a DIFFERENT component
		// that may suspend → render it off-screen first WITHOUT tearing down the old. If
		// it suspends, dispose + re-throw so the enclosing tryBlock holds the old component
		// on screen + resumes (the resume re-renders the boundary, re-driving this swap).
		// Urgent + hydration keep the legacy path.
		if (
			transitionSwap !== null &&
			state.block !== null &&
			hydration === null &&
			parentBlock.currentRenderMode === 'transition'
		) {
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
				const r = transitionSwap.render(
					parentBlock,
					domParent,
					state.end,
					body,
					renderProps,
					outputHandler,
				);
				if (r.suspended || r.error) {
					transitionSwap.dispose(r.wip);
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
				state.currentComp = identity;
				transitionSwap.splice(r.wip);
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
				const r = transitionSwap.render(
					parentBlock,
					domParent,
					probeAfter,
					body,
					renderProps,
					outputHandler,
				);
				transitionSwap.dispose(r.wip);
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
		state.currentComp = identity;
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
				undefined,
				outputHandler,
			);
			if (
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				typeof identity === 'function'
			)
				profileTrackComponent(b, identity);
			state.block = b;
			try {
				renderBlock(b);
			} finally {
				if (
					hydration !== null &&
					hydrationCursor !== null &&
					hydrationCursor.parentNode === domParent
				) {
					// An unframed single-root return adopts the element that was already
					// present, so the client-mount before/after probe cannot observe an
					// insertion. Stamp the adopted cursor itself as the block boundary;
					// a later return-shape switch can then unmount that host normally.
					b.startMarker = hydrationCursor;
					b.endMarker = hydrationCursor;
				} else {
					const last = state.anchor ? state.anchor.previousSibling : domParent.lastChild;
					if (last !== null && last !== before) {
						b.startMarker = last;
						b.endMarker = last;
					}
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
				undefined,
				outputHandler,
			);
			if (
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				typeof identity === 'function'
			)
				profileTrackComponent(b, identity);
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
		if (tryMemoBail(state.block, identity, props)) return;
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
	if (hydration !== null && !state.inherited && state.end !== null)
		hydration.node = state.end.nextSibling;
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
	outputHandler: OutputHandler | null,
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
	const capture = createOffscreenCapture();
	const refDetachCheckpoint = refDetachQueue.length;
	const prev = WIP_CAPTURE;
	WIP_CAPTURE = capture;
	const block = createBlock(
		kind,
		parentBlock,
		domParent,
		start,
		end,
		body,
		props,
		env,
		outputHandler,
	);
	if (
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		kind === 'dynamic' &&
		body !== (hostStringTagBody as unknown as ComponentBody) &&
		body !== (hostElementBody as unknown as ComponentBody)
	)
		profileTrackComponent(block, body);
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
	return {
		wip: { block, start, end, capture, domParent, refDetachCheckpoint },
		suspended,
		error,
	};
}

// Splice a COMPLETED off-screen WIP's captured effects/refs/store-syncs back into the
// live queues so the surrounding commit drains them (child-first, now that the WIP's
// nodes are connected). Shared by every commit site — commitOffscreen (childSlot, which
// also DOM-moves the range) and the componentSlot / renderBranchSlot commit branches
// (which adopt the WIP's markers in place, so no DOM move is needed).

function spliceOffscreenCapture(capture: OffscreenCapture): void {
	for (let p = 0 as Phase; p < 3; p++) {
		const src = capture.effects[p];
		const target = WIP_CAPTURE !== null ? WIP_CAPTURE.effects[p] : effectQueues[p];
		for (let i = 0; i < src.length; i++) target.push(src[i]);
	}
	const eventTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.events : effectEventQueue;
	for (let i = 0; i < capture.events.length; i++) {
		eventTarget.push(capture.events[i]);
	}
	const eventActionTarget =
		WIP_CAPTURE !== null ? WIP_CAPTURE.eventActions : effectEventCommitActions;
	for (let i = 0; i < capture.eventActions.length; i++) {
		eventActionTarget.push(capture.eventActions[i]);
	}
	const refTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.refs : refAttachQueue;
	for (let i = 0; i < capture.refs.length; i++) refTarget.push(capture.refs[i]);
	// Store-syncs enqueued off-screen now belong to committed DOM — hand them to the
	// live queue so the surrounding commit's drainStoreSyncs reconciles them.
	const storeTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.stores : storeSyncQueue;
	for (let i = 0; i < capture.stores.length; i++) storeTarget.push(capture.stores[i]);
}

function spliceWipCapture(wip: OffscreenWip): void {
	spliceOffscreenCapture(wip.capture);
}

/** Drop captured commit work that never became visible. */
function discardOffscreenCapture(capture: OffscreenCapture | null): void {
	if (capture === null) return;
	for (let i = 0; i < capture.stores.length; i++) capture.stores[i].queued = false;
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
	try {
		unmountBlock(wip.block, true);
	} finally {
		// A completed descendant in an ultimately discarded WIP is marked mounted,
		// so its teardown can enqueue ref(null). Its attach is still only in the
		// discarded capture and never became observable; drop the matching detach.
		refDetachQueue.splice(wip.refDetachCheckpoint);
		discardOffscreenCapture(wip.capture);
	}
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

// React dedupes missing-key diagnostics by render owner/source. Octane does not
// carry owner stacks, so use the closest durable equivalent: once per rendering
// Block. This avoids both global suppression (one list hiding every later bug)
// and repeated warnings from updates of the same component instance.
const DEOPT_KEY_WARNED_BLOCKS = new WeakSet<object>();
let DEOPT_KEY_WARNED_WITHOUT_BLOCK = false;
function deoptKey(item: any, index: number): any {
	const element = item != null && item.$$kind === ELEMENT_TAG;
	if (element && item.key != null && !ELEMENTS_MISSING_LIST_KEY.has(item)) return item.key;
	// React parity: unkeyed array children fall back to the index, with a deduplicated
	// dev warning. Only ELEMENTS need keys: empty slots, primitives, and nested
	// iterables are legal list members and must not produce a missing-key warning.
	// (Suppressed during hydration adoption — markers drive matching.)
	if (element && process.env.NODE_ENV !== 'production' && activeHydration() === null) {
		const owner = CURRENT_BLOCK;
		const warned =
			owner === null
				? DEOPT_KEY_WARNED_WITHOUT_BLOCK
				: DEOPT_KEY_WARNED_BLOCKS.has(owner as object);
		if (!warned) {
			if (owner === null) DEOPT_KEY_WARNED_WITHOUT_BLOCK = true;
			else DEOPT_KEY_WARNED_BLOCKS.add(owner as object);
			console.warn(
				'Octane: each element in an array child should have a unique "key" prop ' +
					'(e.g. `items.map((x) => <li key={x.id}>…</li>)`). Missing keys can reconcile ' +
					'incorrectly on reorder — for keyed lists prefer ' +
					'`@for (...; key ...)`.',
			);
		}
	}
	return element && item.key != null ? item.key : index;
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
	validateDangerouslySetInnerHTMLValue(props.dangerouslySetInnerHTML);
	if (props.children != null) {
		throw dangerHtmlChildrenError();
	}
	return true;
}

// Route a host descriptor's props onto a FRESH element (first build).
function applyDeoptProps(el: Element, props: any, ownerBlock: Block): void {
	if (props == null) {
		if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, ownerBlock);
		return;
	}
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
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, ownerBlock);
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
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, ownerBlock);
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
	if (props == null) {
		if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, scope);
		return;
	}
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
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, scope);
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

type DeoptWrapperKind = 'array' | 'fragment';

interface PreparedDeoptList {
	items: any[];
	keys: any[];
}

function isFragmentDescriptor(value: any): value is ElementDescriptor {
	return isElementDescriptor(value) && value.type === Fragment;
}

function fragmentDescriptorChildren(value: ElementDescriptor): any[] {
	const children = value.children;
	if (children == null) return [];
	return Array.isArray(children) ? children : [children];
}

function deoptWrapperKind(value: any[]): DeoptWrapperKind {
	return POSITIONAL_CHILDREN.has(value as object) ? 'fragment' : 'array';
}

function scopedDeoptKey(
	path: readonly (string | number)[],
	item: any,
	index: number,
	key: any,
): string {
	// Reconciliation keys are an internal encoding, not raw user strings. Encode
	// both wrapper path and leaf-key KIND so an implicit index 0 cannot alias an
	// explicit key="0", and a user key that resembles a serialized wrapper path
	// cannot alias a nested child. JSON quoting makes arbitrary user strings data,
	// never structure, while remaining stable across renders without an intern map.
	const explicit = isElementDescriptor(item) && item.key != null;
	return JSON.stringify([path, explicit ? 'key' : 'index', explicit ? String(key) : index]);
}

// Flatten arrays and Fragment descriptors to renderable leaves while retaining
// React's public state-preservation boundaries in their reconciliation keys.
// One top-level array/Fragment layer is transparent; a nested wrapper with the
// opposite kind is also transparent when it is the sole child. Equal adjacent
// wrappers form a real boundary. This is the observable rule behind React's
// single-child <-> Fragment/array preservation and its two-level remount cases.
function flattenReactChildContainer(
	outItems: any[],
	outKeys: any[],
	children: any[],
	kind: DeoptWrapperKind,
	path: readonly (string | number)[],
): void {
	const keyFn = kind === 'fragment' ? deoptKeyPositional : deoptKey;
	const count = children.length;
	for (let i = 0; i < count; i++) {
		const item = children[i];
		if (isFragmentDescriptor(item)) {
			const nested = fragmentDescriptorChildren(item);
			if (item.key != null) {
				flattenReactChildContainer(outItems, outKeys, nested, 'fragment', [
					...path,
					'keyed-fragment',
					item.key,
				]);
			} else {
				const nestedPath =
					kind === 'fragment'
						? [...path, 'wrapper', count === 1 ? 0 : i]
						: count === 1
							? path
							: [...path, 'position', i, 'fragment'];
				flattenReactChildContainer(outItems, outKeys, nested, 'fragment', nestedPath);
			}
			continue;
		}
		if (Array.isArray(item)) {
			const nestedKind = deoptWrapperKind(item);
			const nestedPath =
				nestedKind === kind
					? [...path, 'wrapper', count === 1 ? 0 : i]
					: count === 1
						? path
						: [...path, 'position', i, nestedKind];
			flattenReactChildContainer(outItems, outKeys, item, nestedKind, nestedPath);
			continue;
		}
		outItems.push(item);
		outKeys.push(scopedDeoptKey(path, item, i, keyFn(item, i)));
	}
}

function prepareDeoptList(
	value: any,
	forceSingle: boolean = false,
	includeKeyedSingle: boolean = true,
): PreparedDeoptList | null {
	const items: any[] = [];
	const keys: any[] = [];
	if (isFragmentDescriptor(value)) {
		const path = value.key == null ? [] : ['keyed-fragment', value.key];
		flattenReactChildContainer(items, keys, fragmentDescriptorChildren(value), 'fragment', path);
		return { items, keys };
	}
	if (Array.isArray(value)) {
		flattenReactChildContainer(items, keys, value, deoptWrapperKind(value), []);
		return { items, keys };
	}
	if (includeKeyedSingle && isElementDescriptor(value) && value.key != null) {
		items.push(value);
		keys.push(scopedDeoptKey([], value, 0, value.key));
		return { items, keys };
	}
	if (forceSingle) {
		items.push(value);
		keys.push(scopedDeoptKey([], value, 0, deoptKeyPositional(value, 0)));
		return { items, keys };
	}
	return null;
}

function iterableChildArray(value: any): any[] | null {
	if (
		value == null ||
		typeof value === 'string' ||
		Array.isArray(value) ||
		isElementDescriptor(value)
	)
		return null;
	const iterator = childrenIterator(value);
	if (iterator === null) return null;
	const out: any[] = [];
	const cursor = iterator.call(value);
	let step: IteratorResult<any>;
	while (!(step = cursor.next()).done) out.push(step.value);
	return out;
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
		const keyForItem = POSITIONAL_CHILDREN.has(v) ? deoptKeyPositional : deoptKey;
		for (let i = 0; i < v.length; i++) {
			const item = v[i];
			if (Array.isArray(item)) {
				flattenDeoptChildrenKeyed(outVals, outKeys, item, prefix + i + ':');
			} else if (item == null || item === false || item === true || item === '') {
				// empty — consumes its position, emits nothing
			} else {
				outVals.push(item);
				const k = keyForItem(item, i);
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
			activeHydration()?.markFresh(el);
			applyDeoptProps(el, value.props, ownerBlock);
		}
		setDeoptDesc(el, value);
		if (!hasDangerHTML(value.props)) {
			reconcileDeoptChildren(el, value.children, ownerBlock);
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
	if (t === 'object') throw invalidChildError(value);
	return null;
}

// Reconcile a host element's children in place, reusing existing child nodes: keyed
// children match by `key`, unkeyed children match positionally (React-shape). Nodes
// not reused are removed; survivors are reordered to match the descriptor. No markers
// are introduced — the element fully owns its children, so this is raw-DOM reuse.
function reconcileDeoptChildren(el: Element, children: any, ownerBlock: Block): void {
	// The element that owns these children is authoritative. This matters when a
	// component or dynamic tag made the lexical namespace unknowable, and when an
	// SVG foreignObject resets its descendants to HTML.
	const childNs = deoptChildNamespace(el);
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
	const hydration = activeHydration();
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
		if (hydration !== null && scope.slots[0] === undefined && hydration.isOpen(block.startMarker)) {
			const seeded: ChildSlot = {
				__kind: 'childSlot',
				start: block.startMarker as Comment,
				end: block.endMarker as Comment,
				ownerHost: null,
				borrowed: true,
				compactable: false,
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
			hydration === null &&
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
				borrowed: true,
				compactable: false,
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
		// The surrounding list already consumed this descriptor's key. Suppress
		// the keyed-single list normalization in the nested slot or the same
		// descriptor would recursively wrap itself forever.
		childSlot(
			scope,
			0,
			block.parentNode,
			item,
			block.endMarker,
			undefined,
			undefined,
			undefined,
			false,
		);
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
	if (prev === null && hydration !== null) {
		const startM = block.startMarker;
		prev = startM != null ? startM.nextSibling : null;
		if (prev === endM) prev = null; // empty item range → nothing to adopt
	}
	const node = reconcileDeoptNode(prev, item, block, deoptChildNamespace(block.parentNode));
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
	// A host descriptor can contain a re-iterable collection or a one-shot
	// iterator as its positional children. Route it through hostElementBody so
	// childSlot materializes the iterable exactly once and reconciles its values
	// as a keyed list. The raw host reconciler treats unknown objects as empty;
	// consuming here merely to inspect for component descendants would also
	// exhaust generators before the real render.
	if (!isElementDescriptor(value) && childrenIterator(value) !== null) return true;
	if (value.$$kind === ELEMENT_TAG) {
		// A Fragment descriptor is reconciled by childSlot's fragment-aware list
		// path. If it appears below a host descriptor, keep that host on the Block
		// path so the Fragment boundary is not mistaken for a raw host node.
		if (value.type === Fragment) return true;
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
	const hydration = activeHydration();
	// Component/value boundaries are namespace-transparent. Derive the inherited
	// namespace from the block's actual DOM parent; explicit <svg>/<math> roots
	// still override it through inferTagNs.
	const elNs = inferTagNs(d.type as string, deoptChildNamespace(block.parentNode));
	// Hydration first render: ADOPT the server-rendered host element sitting at the
	// cursor instead of building a fresh one (which would orphan the server node and
	// desync the marker walk). Then point the cursor at its first child so the childSlot
	// below adopts the server-rendered children (which carry full childSlot markers when
	// they contain components — see the server's ssrHostElement). Pure-host children
	// have no inner markers, so childSlot's reconciling-host path rebuilds them in place.
	if (
		el === null &&
		hydration !== null &&
		hydration.node !== null &&
		hydration.node.nodeType === 1 &&
		(hydration.node as Element).localName === d.type &&
		(elNs === undefined || (hydration.node as Element).namespaceURI === elNs)
	) {
		el = hydration.node as Element;
		block.deoptNode = el;
		applyDeoptProps(el, d.props, block);
		setDeoptDesc(el, d);
		const savedCursor = hydration.node.nextSibling;
		if (!hasDangerHTML(d.props)) {
			hydration.node = el.firstChild;
			childSlot(block, 0, el, d.children, null, false, el);
		}
		hydration.node = savedCursor;
		return;
	}
	if (el === null && hydration !== null && hydration.node !== null) {
		// STRUCTURAL mismatch: the server rendered something other than this host element at
		// the cursor (different tag, a component's `<!--[-->…<!--]-->` range, text, …). Warn,
		// discard the divergent server node/range, advance the cursor, then build the correct
		// element fresh with hydration SUSPENDED for its subtree (so children client-mount
		// rather than mis-adopt). Recovery runs in dev + prod; the warning is dev-only.
		if (process.env.NODE_ENV !== 'production') {
			const mmLoc = (hydration.node.parentNode as any)?.__oct_loc;
			if (mmLoc)
				hydration.warnStructural(mmLoc, `<${String(d.type)}>`, hydration.describe(hydration.node));
		}
		const stale = hydration.node;
		if (hydration.isOpen(stale)) {
			const close = hydration.close(stale);
			hydration.node = close.nextSibling;
			hydration.removeRange(stale, close);
		} else {
			hydration.node = stale.nextSibling;
			(stale as ChildNode).remove();
		}
		el =
			elNs !== undefined
				? document.createElementNS(elNs, d.type as string)
				: document.createElement(d.type as string);
		hydration.markFresh(el);
		block.deoptNode = el;
		block.parentNode.insertBefore(el, block.endMarker);
		applyDeoptProps(el, d.props, block);
		setDeoptDesc(el, d);
		if (!hasDangerHTML(d.props)) {
			hydration.suspend(() => childSlot(block, 0, el!, d.children, null, false, el!));
		}
		return;
	}
	if (el === null || el.localName !== d.type || (elNs !== undefined && el.namespaceURI !== elNs)) {
		// First render, or the host tag changed at this slot — (re)create the element.
		if (el !== null) {
			(el as ChildNode).remove();
			// The children slot's live content — markers included — sat inside the
			// removed element, so a preserved slot would keep rendering into the
			// detached node. Run the subtree's cleanups and drop the slot state so
			// the children REMOUNT into the fresh element: React parity, where a
			// host tag change remounts the entire subtree.
			const childState = block.slots[0] as ChildSlot | undefined;
			if (childState !== undefined) {
				clearChildContent(childState);
				block.slots[0] = undefined as any;
			}
		}
		el =
			elNs !== undefined
				? document.createElementNS(elNs, d.type as string)
				: document.createElement(d.type as string);
		if (hydration !== null) hydration.markFresh(el);
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
	const hydration = activeHydration();
	// Component tags can resolve to host strings under SVG/MathML. Inherit from
	// the actual destination rather than assuming every dynamic host is HTML.
	const elNs = inferTagNs(tag, deoptChildNamespace(block.parentNode));
	if (el === null) {
		if (
			hydration !== null &&
			hydration.node !== null &&
			hydration.node.nodeType === 1 &&
			(hydration.node as Element).localName === tag &&
			(elNs === undefined || (hydration.node as Element).namespaceURI === elNs)
		) {
			// Hydration first render: ADOPT the server-rendered element at the cursor,
			// then point the cursor at its first child so the children fn's clone()
			// adopts the server content DIRECTLY (it self-bounds on the element — the
			// server emitted no inner markers).
			el = hydration.node as Element;
			block.deoptNode = el;
			applyDeoptProps(el, d.props, block);
			setDeoptDesc(el, d);
			const savedCursor = hydration.node.nextSibling;
			if (!hasDangerHTML(d.props)) {
				hydration.node = el.firstChild;
				renderHostTagChildren(d, block, el);
			}
			hydration.node = savedCursor;
			return;
		}
		if (hydration !== null && hydration.node !== null) {
			// STRUCTURAL mismatch — mirror hostElementBody's recovery: warn, discard
			// the divergent server node/range, then build fresh with hydration
			// SUSPENDED for the subtree (children client-mount, not mis-adopt).
			if (process.env.NODE_ENV !== 'production') {
				const mmLoc = (hydration.node.parentNode as any)?.__oct_loc;
				if (mmLoc) hydration.warnStructural(mmLoc, `<${tag}>`, hydration.describe(hydration.node));
			}
			const stale = hydration.node;
			if (hydration.isOpen(stale)) {
				const close = hydration.close(stale);
				hydration.node = close.nextSibling;
				hydration.removeRange(stale, close);
			} else {
				hydration.node = stale.nextSibling;
				(stale as ChildNode).remove();
			}
			el = elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
			hydration.markFresh(el);
			block.deoptNode = el;
			block.parentNode.insertBefore(el, block.endMarker);
			applyDeoptProps(el, d.props, block);
			setDeoptDesc(el, d);
			if (!hasDangerHTML(d.props)) {
				hydration.suspend(() => renderHostTagChildren(d, block, el!));
			}
			return;
		}
		// Client mount. (The tag is FIXED for this block's life — componentSlot
		// tears down + remounts on a tag change — so no localName re-check.)
		el = elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
		if (hydration !== null) hydration.markFresh(el);
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
			const child = createBlock(
				'dynamic',
				block,
				el,
				null,
				null,
				kids as ComponentBody,
				{},
				undefined,
				renderReturnedValue,
			);
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
	// SAME flatten + keying as the childSlot array path (incl. compound
	// slot-scoped keys for nested arrays) — the queue's keys must match the
	// keys the incoming items will get, or nothing adopts.
	const prepared = prepareDeoptList(oldChildren, true)!;
	const { items, keys } = prepared;
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

// A portal target is a container, not a host element receiving JSX `children`.
// React therefore permits portals into Lexical-owned void nodes such as `<hr>`;
// keep the void-host validation for actual authored/de-opt host children only.
function isPortalTarget(block: Block, domParent: Node): boolean {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current.kind === 'portal' && current.parentNode === domParent) return true;
	}
	return false;
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
	// Compiler proof that this renderable hole is the body's entire output.
	// Used only by the post-hydration exact-range compactor.
	compactable?: boolean,
	// Internal: a de-opt list item has already consumed its element key, so its
	// nested child slot must render the descriptor directly rather than wrap it
	// in another one-item list.
	includeKeyedSingle: boolean = true,
): void {
	if (
		domParent.nodeType === 1 &&
		VOID_ELEMENTS.has((domParent as Element).localName) &&
		!isPortalTarget(parentScope.block, domParent) &&
		value != null
	) {
		throw new Error(
			`\`<${(domParent as Element).localName}>\` is a void element tag and must neither have ` +
				'`children` nor use `dangerouslySetInnerHTML`.',
		);
	}
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return;
	const parentBlock = parentScope.block;
	const hydration = activeHydration();
	// A placeholder from a client-built mismatch clone belongs to the replacement
	// template; it is an insertion anchor, not server DOM to adopt. Scope the
	// suspension to this slot so the enclosing hydration cursor remains live for
	// later server-owned siblings and root-remainder cleanup.
	if (
		hydration !== null &&
		((anchor != null && hydration.isFresh(anchor)) || hydration.isFresh(domParent))
	) {
		hydration.suspend(() =>
			childSlot(
				parentScope,
				slotKey,
				domParent,
				value,
				anchor,
				ownEnd,
				ownsHost,
				compactable,
				includeKeyedSingle,
			),
		);
		return;
	}
	// React 19 treats Contexts and thenables as renderable Usable nodes. Resolve
	// them before choosing a child regime; repeated unwrapping supports shapes
	// such as Promise<Context<T>> while preserving the normal Suspense route for
	// a pending thenable and the normal context dependency tracking for Context.
	while (value !== null && (typeof value === 'object' || typeof value === 'function')) {
		if ((value as any).$$kind === CONTEXT_TAG) {
			value = useContextInternal(value as Context<unknown>);
			continue;
		}
		if (typeof (value as any).then === 'function') {
			value = useThenable(value as TrackedThenable<unknown>);
			continue;
		}
		break;
	}
	const valueComponent =
		typeof value === 'function'
			? (value as ComponentBody)
			: isElementDescriptor(value) && typeof value.type === 'function'
				? (value.type as ComponentBody)
				: null;
	const hydrationTransparent =
		hydration?.passthroughRanges === true &&
		(
			valueComponent as
				| (ComponentBody & {
						[HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner';
				  })
				| null
		)?.[HYDRATION_RANGE_BOUNDARY] !== 'owner';
	const iterable = iterableChildArray(value);
	if (iterable !== null) value = iterable;
	const preparedList = prepareDeoptList(value, false, includeKeyedSingle);
	// A LONE PURE-HOST descriptor (host/text-only subtree — no components, no
	// portals, no render functions). Computed once per call: the slot init below
	// uses it to pick the ANCHORLESS regime, the promotion after it to detect a
	// mode flip out of that regime, and the classifier to route the value.
	const pureHost = preparedList === null && isHostDescriptor(value) && !descNeedsBlocks(value);
	let state = parentScope.slots[slotKey] as ChildSlot | undefined;
	const unframedComponentRoot =
		state === undefined &&
		hydration !== null &&
		parentBlock === hydration.rootBlock &&
		hydration.node !== null &&
		hydration.node.parentNode === domParent &&
		preparedList === null &&
		isElementDescriptor(value) &&
		typeof value.type === 'function' &&
		!hydration.isOpen(anchor ?? null) &&
		!hydration.isOpen(hydration.node);
	if (
		state === undefined &&
		hydration !== null &&
		!hydrationTransparent &&
		parentBlock === hydration.rootBlock &&
		!hydration.isOpen(anchor ?? null) &&
		!hydration.isOpen(hydration.node)
	) {
		// Generic root returns normally serialize as one hydratable range. Plain
		// strings/null are the two unframed root forms; accept their matching DOM,
		// but rebuild arbitrary stale markup instead of appending beside it.
		const cursor = hydration.node;
		const unframedMatch =
			value === null || value === ''
				? cursor === null
				: (typeof value === 'string' && cursor?.nodeType === 3) || unframedComponentRoot;
		if (!unframedMatch) {
			hydration.abandonRoot(
				preparedList === null ? 'a renderable root' : 'a renderable list range',
				hydration.describe(cursor),
				componentSourceLoc(parentBlock.body),
			);
			childSlot(
				parentScope,
				slotKey,
				domParent,
				value,
				anchor,
				ownEnd,
				ownsHost,
				compactable,
				includeKeyedSingle,
			);
			return;
		}
	}
	if (state === undefined) {
		let start: Comment | null;
		let end: Comment | null;
		if (hydrationTransparent) {
			// The selected hydration container begins below this logical return
			// slot. Keep its lifecycle/block, but leave the server cursor and ranges
			// untouched until the declared owner component is reached.
			start = null;
			end = null;
		} else if (unframedComponentRoot) {
			[start, end] = hydration!.wrapUnframedRoot(hydration!.node!);
		} else if (hydration !== null && hydration.isOpen(anchor ?? null)) {
			// Hydration (nested hole): the anchor resolved via child/sibling to the
			// server's `<!--[-->`. Adopt that `<!--[-->…<!--]-->` range as our markers
			// and point the cursor at the first content node for the Block's clone()
			// / the text adopt below.
			start = anchor as Comment;
			end = hydration.close(anchor as Node);
			if (parentBlock === hydration.rootBlock) hydration.claimRootRemainder(end.nextSibling);
			hydration.node = start.nextSibling;
		} else if (hydration !== null && hydration.isOpen(hydration.node)) {
			// Hydration (sole top-level hole, e.g. a layout `<>{children}…</>`): the
			// anchor is the block's end-marker (not a `<!--[-->`), but the CURSOR sits
			// on the server's range-open. Adopt from the cursor. This is what lets a
			// component whose only body root is `{children}` hydrate as single-root.
			start = hydration.node as Comment;
			end = hydration.close(hydration.node as Node);
			if (parentBlock === hydration.rootBlock) {
				hydration.protectRootAnchor(end);
				hydration.claimRootRemainder(end.nextSibling);
			}
			hydration.node = start.nextSibling;
		} else if (ownEnd && anchor != null) {
			// Client mount, dedicated placeholder: reuse the slot's own `<!>` as the end
			// marker — content inserts before it just the same. Saves a comment + an
			// insertBefore per `{expr}` hole (no separate end marker minted).
			start = null;
			end = anchor as Comment;
		} else if (hydration === null && ownsHost !== undefined) {
			// OWNS-PARENT: no markers in any value regime — the element's child
			// list IS the slot's range (see ChildSlot.ownerHost).
			start = null;
			end = null;
		} else if (hydration === null && pureHost) {
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
			if (hydration !== null && parentBlock === hydration.rootBlock)
				hydration.protectRootAnchor(end);
		}
		state = {
			__kind: 'childSlot',
			start,
			end,
			ownerHost: (hydration === null ? (ownsHost ?? null) : null) as Element | null,
			borrowed: hydrationTransparent,
			compactable: compactable === true,
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
	if (compactable === true) state.compactable = true;

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
	if (state.end === null && !pureHost && state.ownerHost === null && !state.borrowed) {
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

	// Arrays, iterables, Fragment descriptors, and a lone explicitly-keyed
	// element share one keyed-list regime. Keeping a keyed single child in this
	// regime is what lets it retain state when a sibling is added around it.
	if (preparedList !== null) {
		if (state.forSlot === null) {
			// Drop any prior block/text content — EXCEPT while hydrating, where the
			// server emitted one `<!--[-->…<!--]-->` range per item between our adopted
			// markers and `reconcileKeyed`/`mountItem` ADOPT those ranges off the
			// cursor. Sweeping here would delete the very item DOM (and break the
			// hydrateNode chain) the de-opt list is about to adopt. The pure-host →
			// blocks upgrade adopts the SAME way (the element's raw children ARE the
			// incoming items), so it must not sweep either.
			if (hydration === null && !upgradeArmed) clearChildContent(state);
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
		const { items, keys } = preparedList;
		const getKey = (_item: any, i: number) => keys[i];
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
				const node = reconcileDeoptNode(prev, value, parentBlock, deoptChildNamespace(domParent));
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
			if (prev === null && hydration !== null) {
				prev = state.start.nextSibling;
				if (prev === state.end) prev = null;
			}
			const node = reconcileDeoptNode(prev, value, parentBlock, deoptChildNamespace(domParent));
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
		if (typeof value.type !== 'function' && typeof value.type !== 'string') {
			throw invalidElementTypeError(value.type);
		}
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
			// Compiler-generated children are render functions too, so a fresh parent
			// render must still swap their body in place (preserving descendant state).
			// But an identity-equal tagged function is the exact same cached child value:
			// take React's implicit same-element bailout, with lazy context propagation.
			const taggedChildren = isChildrenBlock(comp);
			const wasImplicitlyArmed = state.block.$$implicitBail;
			if (taggedChildren && !wasImplicitlyArmed) {
				// The slot previously hosted an arbitrary render function. Arm before
				// rendering the tagged body so its context reads stamp this block.
				state.block.$$implicitBail = true;
				state.block.memoInChain = true;
			}
			if (
				wasImplicitlyArmed &&
				taggedChildren &&
				comp === state.currentComp &&
				tryImplicitBail(state.block)
			)
				return;
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
		const transitionSwap = TRANSITION_SWAP_DRIVER;
		if (
			transitionSwap !== null &&
			state.block !== null &&
			state.end !== null &&
			hydration === null &&
			parentBlock.currentRenderMode === 'transition'
		) {
			const r =
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				isBodyFn &&
				!__profileHasComponentMetadata(comp)
					? withProfileComponentOverride(comp, null, () =>
							transitionSwap.render(
								parentBlock,
								domParent,
								state.end!,
								comp,
								props,
								renderReturnedValue,
							),
						)
					: transitionSwap.render(
							parentBlock,
							domParent,
							state.end!,
							comp,
							props,
							renderReturnedValue,
						);
			if (r.suspended || r.error) {
				// Discard the partial; the OLD content was never touched, so it stays live.
				// Re-throw so the enclosing tryBlock's existing catch holds the old content
				// (transition). Re-throwing (vs swallowing the suspend + returning) is what
				// keeps the try body's success path from immediately RELEASING the hold; the
				// resume re-renders the try body, which re-drives this swap to completion.
				transitionSwap.dispose(r.wip);
				if (r.error) throw r.error;
				throw new SuspenseException(r.suspended);
			}
			if (state.borrowed) {
				// The retained pair belongs to a coextensive parent range. Probe for
				// suspension, discard, then use the in-place mount below; committing
				// a nested WIP pair would split the compacted ownership graph.
				transitionSwap.dispose(r.wip);
			} else {
				// Completed → commit: tear down old (sweeps state.start..state.end; the WIP sits
				// OUTSIDE that range so it's untouched), then move the WIP into the slot range.
				// Synchronous, so there is no painted blank between the two.
				clearChildContent(state);
				transitionSwap.commit(r.wip, state.end!);
				state.block = r.wip.block;
				state.currentComp = comp;
				state.currentIsBodyFn = isBodyFn;
				return;
			}
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
			hydration === null &&
			comp === (hostElementBody as unknown as ComponentBody) &&
			state.block === null &&
			state.hostNode !== null &&
			state.hostNode.nodeType === 1 /* Element */ &&
			(state.hostNode as Element).localName === (props as ElementDescriptor).type &&
			(state.hostNode as Element).namespaceURI ===
				(inferTagNs((props as ElementDescriptor).type as string, deoptChildNamespace(domParent)) ??
					HTML_NS) &&
			!hasDangerHTML((props as ElementDescriptor).props) &&
			!hasDangerHTML(getDeoptDesc(state.hostNode)?.props ?? null)
		) {
			const el = state.hostNode as Element;
			state.hostNode = null;
			state.currentComp = comp;
			state.currentIsBodyFn = false;
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				state.start,
				state.end,
				comp,
				props,
				undefined,
				renderReturnedValue,
			);
			if (state.borrowed) b.exclusiveMarkers = true;
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
		if (hydration === null) clearChildContent(state);
		state.currentComp = comp;
		state.currentIsBodyFn = isBodyFn;
		if (state.start === null && state.ownerHost === null && !state.borrowed) {
			// First component in this slot — mint the lower-bound marker now so
			// clearChildContent can sweep a (possibly multi-node) component body.
			// (An OWNS-PARENT slot needs neither bound: clears sweep the element.)
			state.start = document.createComment('');
			domParent.insertBefore(state.start, state.end);
		}
		const b = createBlock(
			'dynamic',
			parentBlock,
			domParent,
			state.start,
			state.end,
			comp,
			props,
			undefined,
			renderReturnedValue,
		);
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			comp !== (hostElementBody as unknown as ComponentBody)
		)
			__profileTrackComponent(b, !isBodyFn || __profileHasComponentMetadata(comp) ? comp : null);
		if (state.borrowed) b.exclusiveMarkers = true;
		// Arm React's implicit same-element bailout: value-position mounts are the
		// sites that can receive a CACHED descriptor back (provider children, `.ts`
		// binding trees, `return children` passthroughs), so their context reads
		// must stamp ancestors (memoInChain, like memo blocks) for the bail's lazy
		// consumer refresh to be sound. Set BEFORE renderBlock so the first render
		// stamps. Body-fn children re-create identity per render — no bail is ever
		// possible, so untagged ones skip the stamping cost. Tagged compiler children
		// can be passed through with stable identity and therefore need the same stamps.
		if (!isBodyFn || isChildrenBlock(comp)) {
			b.$$implicitBail = true;
			b.memoInChain = true;
		}
		state.block = b;
		renderBlock(b);
		// Advance the cursor past this child's adopted range so a following sibling
		// hole adopts the right node (mirrors componentSlot's post-render advance).
		// (Hydration always adopts a marker pair, so `state.end` is non-null here.)
		if (hydration !== null && !state.borrowed && state.end !== null) {
			hydration.node = state.end.nextSibling;
		}
		return;
	}

	// Text / empty.
	if (value !== null && typeof value === 'object') throw invalidChildError(value);
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
	if (hydration !== null) {
		// Adopt the server text sitting between our adopted markers. (An empty hole
		// has no text node, but `str !== ''` here means the server emitted one.)
		const n = hydration.node;
		if (n !== null && n !== state.end && n.nodeType === 3) {
			state.text = n as Text;
			hydration.node = n.nextSibling;
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
	compactable?: boolean,
): void {
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return;
	const vt = typeof value;
	if (vt === 'object' || vt === 'function') {
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
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
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
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
	compactable?: boolean,
): Text | null {
	childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
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
	if (
		domParent.nodeType === 1 &&
		VOID_ELEMENTS.has((domParent as Element).localName) &&
		!isPortalTarget(parentScope.block, domParent) &&
		value != null
	) {
		throw new Error(
			`\`<${(domParent as Element).localName}>\` is a void element tag and must neither have ` +
				'`children` nor use `dangerouslySetInnerHTML`.',
		);
	}
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return null;
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
		const hydration = activeHydration();
		if (hydration !== null) return hydration.htext(domParent, str, siteLoc(parentScope, slotKey));
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
	const hydration = activeHydration();
	if (hydration !== null && state === undefined) hydration.node = domParent.firstChild;
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
	// A memo body that suspended or threw on its initial attempt has no committed
	// props/output to reuse. This also makes lazy-resolved memo metadata safe to
	// publish during that attempt: the retry must execute until the Block mounts.
	if (!block.mounted) return false;
	const compare = (comp as any).__compare as ((prev: any, next: any) => boolean) | undefined;
	// React.memo's optional comparator: returns true when props are equal
	// (→ skip the render). Falls back to a shallow Object.is comparison.
	const equal = compare ? compare(block.props, props) : shallowEqualProps(block.props, props);
	if (!equal) return false;
	if (ctxDirectChanged(block)) return false;
	if (ctxDepsChanged(block)) refreshContextConsumers(block);
	restampCtxDeps(block);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBail(block, comp, 'memo-bailout');
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
	// A first attempt that suspended or threw has no committed output to reuse.
	// Its identity-equal retry must execute until this Block mounts successfully.
	if (!block.mounted) return false;
	if (ctxDirectChanged(block)) return false;
	if (ctxDepsChanged(block)) refreshContextConsumers(block);
	restampCtxDeps(block);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBail(block, block.body, 'implicit-bailout');
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
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileSchedule(block, 'context');
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

/**
 * Compiler ABI for a flat output-cache hit. Context consumers are normally
 * reached while their parent slot reconciles; a cache hit intentionally skips
 * that reconciliation, so an intervening Provider commit must refresh the
 * slot's existing Block(s) directly. The common path is one numeric equality
 * check. `previous === undefined` snapshots the epoch after a cache miss
 * without refreshing the freshly-rendered subtree.
 * @internal
 */
export function compilerCacheContext(
	scope: Scope,
	slotKey: number,
	previous: number | undefined,
): number {
	const current = COMPILER_CACHE_CONTEXT_EPOCH;
	if (previous === undefined || previous === current) return current;
	const slot = scope.slots[slotKey];
	if (slot === undefined || slot === null) return current;
	if (slot.__kind === 'forBlockSlot') {
		for (const item of slot.items.values()) refreshBlockForContext(item);
		if (slot.emptyBlock) refreshBlockForContext(slot.emptyBlock);
	} else if (slot.block) {
		refreshBlockForContext(slot.block);
	} else if (slot.__kind === 'childSlot' && slot.forSlot) {
		for (const item of slot.forSlot.items.values()) refreshBlockForContext(item);
	} else if (slot.__kind === 'childSlot' && slot.portal?.block) {
		refreshBlockForContext(slot.portal.block);
	}
	return current;
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
/* @__NO_SIDE_EFFECTS__ */
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
	// `createElement(memo(Component), …)` and `lazy(() => ({default:
	// memo(Component)}))` resolve defaults at the public wrapper boundary. Keep the
	// property live so a component that updates its defaultProps between renders
	// has the same observable behavior through memo as it does directly.
	Object.defineProperty(memoWrapper, 'defaultProps', {
		configurable: true,
		get: () => (component as any).defaultProps,
		set: (value) => {
			(component as any).defaultProps = value;
		},
	});
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileComponentSource(memoWrapper, component);
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
	update(incoming: ComponentBody<any>): boolean;
}

type HmrWrapper = ComponentBody<any> & { [HMR]: HmrMeta };

export function hmr<P>(fn: ComponentBody<P>): ComponentBody<P> {
	const meta: HmrMeta = {
		fn,
		liveBlocks: new Set(),
		update(incoming: ComponentBody<any>): boolean {
			// The incoming function is the freshly-recompiled component body. If
			// the incoming function is itself an HMR wrapper (which it will be when
			// the new module re-runs `Comp = hmr(Comp)`), unwrap it down to the
			// raw fn — otherwise we'd nest wrappers on each edit.
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileComponentSource(wrapper, incoming);
			const incomingMeta = (incoming as any)[HMR] as HmrMeta | undefined;
			const nextFn = incomingMeta ? incomingMeta.fn : incoming;
			// Direct-template shorthand bodies and returned-output shorthand bodies
			// use different slot-0 ABIs. Let the bundler invalidate/full-reload this
			// module instead of reusing a live scope with the incompatible layout.
			if ((meta.fn as any).__octaneReturnedOutput !== (nextFn as any).__octaneReturnedOutput)
				return false;
			meta.fn = nextFn;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileComponentSource(wrapper, meta.fn);
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
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileSchedule(b, 'hmr');
				scheduleRender(b);
			}
			return true;
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
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileComponentSource(wrapper, fn);
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
	 * doesn't re-detach). The list keeps the detached identities alive as a hide
	 * sentinel; reveal re-enumerates the CURRENT ref manifests so superseded refs
	 * cannot reattach. null = nothing detached.
	 */
	detachedRefs: SuspenseRefEntry[] | null;
	domParent: Node;
	parentBlock: Block;
	/**
	 * useId state shared by every arm. Streamed boundaries replace the inherited
	 * root state with an opaque boundary namespace during hydration.
	 */
	idState: RootIdState;
	/** Logical boundary above a selected hydration-container owner. */
	passthrough: boolean;
}

function clearPassthroughTry(state: TrySlot): void {
	const visible = state.block;
	const persistent = state.tryBlock;
	if (visible !== null) unmountBlock(visible);
	if (persistent !== null && persistent !== visible) unmountBlock(persistent);
	state.block = null;
	state.tryBlock = null;
}

function mountPassthroughCatch(state: TrySlot, error: unknown): void {
	clearPassthroughTry(state);
	state.pendingThenable = null;
	state.branch = 0;
	state.err = error;
	if (state.catchBody === null) throw error;
	const block = createBlock(
		'control-flow',
		state.parentBlock,
		state.domParent,
		null,
		null,
		state.catchBody,
		{ err: error, reset: () => requestReset(state) },
		state.env,
	);
	state.block = block;
	renderBlock(block);
}

function mountPassthroughPending(state: TrySlot, thenable: TrackedThenable<unknown>): void {
	clearPassthroughTry(state);
	state.branch = 2;
	state.pendingThenable = thenable;
	if (state.pendingBody !== null) {
		const block = createBlock(
			'control-flow',
			state.parentBlock,
			state.domParent,
			null,
			null,
			state.pendingBody,
			undefined,
			state.env,
		);
		state.block = block;
		renderBlock(block);
	}
	const retry = () => {
		if (state.pendingThenable !== thenable || state.parentBlock.disposed) return;
		state.pendingThenable = null;
		state.branch = -1;
		scheduleRender(state.parentBlock);
	};
	thenable.then(retry, retry);
}

function renderPassthroughTry(state: TrySlot): void {
	if (state.branch === 0 && state.block !== null) {
		state.block.body = state.catchBody!;
		state.block.props = { err: state.err, reset: () => requestReset(state) };
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
		block = createBlock(
			'control-flow',
			state.parentBlock,
			state.domParent,
			null,
			null,
			state.tryBody,
			undefined,
			state.env,
		);
		state.tryBlock = block;
		state.block = block;
		state.branch = 1;
		(block as any).$$tryHandler = (error: unknown) => {
			try {
				mountPassthroughCatch(state, error);
			} catch (propagated) {
				const parent = findTryHandler(state.parentBlock);
				if (parent !== null) parent(propagated);
				else console.error(propagated);
			}
		};
		if (!state.propagateSuspense) {
			(block as any).__suspenseHandler = (thenable: TrackedThenable<unknown>) => {
				mountPassthroughPending(state, thenable);
			};
		}
	} else {
		block.body = state.tryBody;
		block.extra = state.env;
	}
	try {
		renderBlock(block);
		state.hasResolved = true;
	} catch (error) {
		if (isSuspenseException(error)) {
			if (state.propagateSuspense) throw error;
			mountPassthroughPending(state, error.thenable);
		} else {
			mountPassthroughCatch(state, error);
		}
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
): void {
	const parentBlock = parentScope.block;
	const hydration = activeHydration();
	let state = parentScope.slots[slotKey] as TrySlot | undefined;
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		const passthrough = hydration?.passthroughRanges === true;
		// Hydration: the server (Phase 4) awaited use() and wrapped the resolved
		// SUCCESS arm (or @catch arm) in a `<!--[-->…<!--]-->` range. Adopt it as the
		// slot; mountTry brackets the content and the seeded use() values let the try
		// body render its success arm synchronously. `resolveHydrationOpen` also covers
		// the SOLE-hole case (a @try that is the only thing a component/arm renders —
		// the router `Match` shape `<ctx.Provider> @try {…}`), where the anchor is the
		// enclosing scope's end marker and the cursor is parked on the @try's open.
		const open = passthrough ? null : (hydration?.resolveOpen(anchor ?? null, domParent) ?? null);
		if (passthrough) {
			start = document.createComment('passthrough-try');
			end = document.createComment('/passthrough-try');
		} else if (open !== null) {
			start = open;
			end = hydration!.close(open);
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
		};
		parentScope.slots[slotKey] = newState;
		registerSlot(parentScope, newState);
		state = newState;
	} else {
		state.tryBody = tryBody;
		state.catchBody = catchBody;
		state.pendingBody = pendingBody;
		state.propagateSuspense = propagateSuspense;
		state.env = env;
	}
	const s = state;
	if (s.passthrough) {
		renderPassthroughTry(s);
		return;
	}
	if (s.branch === 0) {
		// Already showing catch — re-render with current err (props identity unchanged).
		s.block!.body = s.catchBody!;
		s.block!.props = { err: s.err, reset: () => requestReset(s) };
		s.block!.extra = s.env;
		renderBlock(s.block!);
	} else if (s.branch === 2 && s.tryBlock && !s.tryBlock.disposed && s.savedDom) {
		// Parent props can supersede the promise that originally hid this body.
		// Retry the preserved tree now so already-ready replacement data reveals
		// immediately and a different suspension refreshes the resume listener.
		attemptHiddenReveal(s);
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
			// §6.3 control signal — never an application failure: pass it through
			// so the renderer-region owner (handleRenderError) receives it; a
			// local catch arm must not render a hosted context handshake.
			if (isHostContextRequest(err)) throw err;
			if (isSuspenseException(err)) {
				if (s.propagateSuspense) throw err;
				handleSuspense(s, err.thenable, s.tryBlock);
			} else switchToCatch(s, err);
		}
	} else {
		mountTry(s);
	}
}

function mountTry(state: TrySlot): void {
	const hydration = activeHydration();
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
	// `<!--oct-seed:opaque-id-->` comment between the slot's open marker and the
	// inner branch range, with the boundary's seed JSON stashed on
	// window.$OCTS[opaqueId]. The full id includes its stream namespace, so two
	// roots composed into one document cannot consume each other's values.
	// Scope the seed stream to THIS boundary while its subtree hydrates (a
	// depth-first synchronous render), restoring the outer scope after — nested
	// streamed boundaries push again naturally.
	let scopedSeeds: unknown[] | null = null;
	let hasScopedBoundary = false;
	let adoptCursor = state.start.nextSibling;
	let streamedBoundaryId: string | null = null;
	if (
		hydration !== null &&
		adoptCursor !== null &&
		adoptCursor.nodeType === 8 &&
		(adoptCursor as Comment).data.startsWith(STREAM_SEED_COMMENT)
	) {
		hasScopedBoundary = true;
		streamedBoundaryId = (adoptCursor as Comment).data.slice(STREAM_SEED_COMMENT.length);
		const stash = typeof window !== 'undefined' ? (window as any).$OCTS : undefined;
		const raw = stash !== undefined ? stash[streamedBoundaryId] : undefined;
		if (typeof raw === 'string') scopedSeeds = hydration.parseSeeds(raw);
		adoptCursor = adoptCursor.nextSibling;
	} else if (
		// A shell hydrated before its streamed segment swaps still has the
		// template sentinel instead of the seed comment. Its opaque id owns the
		// same boundary namespace even though there are no scoped seeds yet. Octane
		// cannot selectively hydrate that server fallback, so claim the boundary for
		// the client: remove the sentinel and its server-rendered fallback arm before
		// mounting a fresh try/pending block. Leaving either behind would duplicate
		// the fallback and allow a later stream swap to overwrite client-owned DOM.
		hydration !== null &&
		adoptCursor !== null &&
		adoptCursor.nodeType === 1 &&
		(adoptCursor as Element).localName === 'template' &&
		(adoptCursor as Element).hasAttribute(STREAM_BOUNDARY_ATTR)
	) {
		hasScopedBoundary = true;
		streamedBoundaryId = (adoptCursor as Element).getAttribute(STREAM_BOUNDARY_ATTR);
		let stale: Node | null = adoptCursor;
		while (stale !== null && stale !== state.end) {
			const next: Node | null = stale.nextSibling;
			(stale as ChildNode).remove();
			stale = next;
		}
		adoptCursor = state.end;
		hydration.node = state.end;
	}
	if (streamedBoundaryId !== null) {
		state.idState = {
			prefix: state.parentBlock.idState.prefix + 'b' + streamedBoundaryId + '-',
			next: 0,
		};
	}
	if (hydration !== null && hydration.isOpen(adoptCursor)) {
		// ADOPT the server's inner arm range (no inserted markers — byte-for-byte;
		// see ifBlock). The seeded use() values let the try body render its success
		// arm and adopt the server DOM.
		bStart = adoptCursor as Comment;
		bEnd = hydration.close(bStart);
		hydration.node = bStart.nextSibling;
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
	b.idState = state.idState;
	(b as any).__trySlot = state;
	// Register handlers so descendant effect/render errors can find us.
	(b as any).$$tryHandler = (err: any) => switchToCatch(state, err);
	if (!state.propagateSuspense) {
		(b as any).__suspenseHandler = (thenable: TrackedThenable<any>, sourceBlock: Block) => {
			handleSuspense(state, thenable, sourceBlock);
		};
	}
	state.tryBlock = b;
	state.block = b;
	// Install this boundary's streamed seed scope (if any) for the subtree render.
	const prevSeeds = hydration?.seeds ?? null;
	const prevSeedCursor = hydration?.seedCursor ?? 0;
	if (hasScopedBoundary) {
		hydration!.seeds = scopedSeeds;
		hydration!.seedCursor = 0;
	}
	try {
		renderBlock(b);
		state.hasResolved = true;
	} catch (err) {
		// §6.3 control signal — bypass the local boundary (see the try-body
		// re-render catch above); the renderer-region owner handles it.
		if (isHostContextRequest(err)) throw err;
		if (isSuspenseException(err)) {
			if (state.propagateSuspense) throw err;
			handleSuspense(state, err.thenable, b);
		} else {
			const adoptServerCatch = hydration?.isRejection(err) === true;
			if (state.tryBlock) {
				// A rejection seed means the DOM already contains the server's catch
				// arm inside this adopted range. Tear down the aborted try render's
				// bookkeeping while preserving that range for catch-arm adoption.
				unmountBlock(state.tryBlock, !adoptServerCatch);
				state.tryBlock = null;
				state.block = null;
			}
			switchToCatch(
				state,
				err,
				adoptServerCatch ? bStart : undefined,
				adoptServerCatch ? bEnd : undefined,
			);
		}
	} finally {
		if (hasScopedBoundary) {
			hydration!.seeds = prevSeeds;
			hydration!.seedCursor = prevSeedCursor;
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
 *  4. Mark the hidden subtree inactive (the <Activity> mechanism) so the drains
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
	const hydration = activeHydration();
	if (hydration !== null && !state.hasResolved && state.tryBlock !== null) {
		// A suspension during the first hydration attempt has no committed client
		// subtree to preserve. The try block currently owns the adopted server arm;
		// parking that DOM in savedDom would reattach it on resume and then mount the
		// resolved client arm alongside it. Discard the abandoned adoption attempt
		// now, while its range is still attached, and let the retry mount one fresh
		// client arm after the fallback. Keep the outer try markers as the cursor
		// boundary for any following hydrating sibling.
		const abandonedTry = state.tryBlock;
		unmountBlock(abandonedTry);
		state.tryBlock = null;
		if (state.block === abandonedTry) state.block = null;
		hydration.node = state.end;
	} else {
		softDetachTryBlock(state);
	}
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
	return mountPendingBody(state);
}

/** Mount the current @pending helper without changing the preserved try body. */
function mountPendingBody(state: TrySlot): boolean {
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
		b.idState = state.idState;
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
		unmountBlock(pendingBlock);
		state.block = null;
		switchToCatch(state, err);
	}
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
		VIEW_TRANSITION_DRIVER?.wrapResume(() => commitResumeInner(state)) === true
	)
		return;
	commitResumeInner(state);
}

function commitResumeInner(state: TrySlot): void {
	const wasHeld = state.transitionHeld;
	if (wasHeld) state.transitionHeld = false;
	// Leave the coordination sets — this boundary is committing now (a re-suspend
	// during the re-render re-adds it via handleSuspense → enterHeldTransition).
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	try {
		if (state.tryBlock && !state.tryBlock.disposed) {
			const stagedCapture = state.stagedCapture;
			state.stagedCapture = null;
			state.stagedEffectDeps = null;
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
			if (stagedCapture !== null) {
				// attemptHiddenReveal already completed this exact transition render while
				// the fallback was visible. Commit its deferred effects/refs/store checks now
				// that the entangled group is revealing; re-rendering would both duplicate
				// render work and lose mount-only ref attaches captured by that hidden pass.
				state.tryBlock.pendingMode = null;
				state.tryBlock.pendingDeferred = false;
				// Ref attach closures captured by a hidden pass can be stale after a
				// later same-node ref supersession. Reveal uses the current manifest.
				if (state.detachedRefs !== null) stagedCapture.refs.length = 0;
				spliceOffscreenCapture(stagedCapture);
				state.hasResolved = true;
			} else {
				// Mark the replay window: useThenable's fresh-thenable reuse leniency
				// and the waterfall diagnostic apply only while a resolved suspension
				// is being replayed (ordinary updates must keep replacing thenables).
				const resumeCapture = createOffscreenCapture();
				const effectDeps = snapshotSubtreeEffectDeps(state.tryBlock);
				const previousCapture = WIP_CAPTURE;
				const refDetachCheckpoint = refDetachQueue.length;
				const prevReplay = RESUME_REPLAY;
				RESUME_REPLAY = true;
				WIP_CAPTURE = resumeCapture;
				let didThrow = false;
				let renderError: unknown = null;
				try {
					renderBlock(state.tryBlock);
				} catch (err) {
					didThrow = true;
					renderError = err;
				} finally {
					WIP_CAPTURE = previousCapture;
					RESUME_REPLAY = prevReplay;
				}
				if (!didThrow) {
					if (state.detachedRefs !== null) {
						refDetachQueue.splice(refDetachCheckpoint);
						resumeCapture.refs.length = 0;
					}
					spliceOffscreenCapture(resumeCapture);
					state.hasResolved = true;
				} else {
					refDetachQueue.splice(refDetachCheckpoint);
					restoreSubtreeEffectDeps(state.tryBlock, effectDeps);
					discardOffscreenCapture(resumeCapture);
					if (isSuspenseException(renderError)) {
						handleSuspense(state, renderError.thenable, state.tryBlock);
					} else {
						switchToCatch(state, renderError);
					}
				}
			}
			if (state.branch === 1) {
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
		if (!deferringStagedRevealEffects) commitEffects();
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
function snapshotSubtreeEffectDeps(scope: Scope): EffectDepsSnapshot {
	const snapshot: EffectDepsSnapshot = new Map();
	const visit = (current: Scope): void => {
		const hooks = current.hooks;
		if (hooks !== null) {
			for (const slot of hooks.values()) {
				const effect = slot as EffectSlot | undefined;
				if (effect?.effect === true) {
					snapshot.set(effect, effect.deps);
				}
			}
		}
		forEachSubtreeChild(current, visit);
	};
	visit(scope);
	return snapshot;
}

/** Roll hook-cell deps back after a speculative render whose captured commit was discarded. */
function restoreSubtreeEffectDeps(scope: Scope, snapshot: EffectDepsSnapshot): void {
	const visit = (current: Scope): void => {
		const hooks = current.hooks;
		if (hooks !== null) {
			for (const slot of hooks.values()) {
				const effect = slot as EffectSlot | undefined;
				if (effect?.effect !== true) continue;
				effect.deps = snapshot.has(effect) ? snapshot.get(effect) : undefined;
			}
		}
		forEachSubtreeChild(current, visit);
	};
	visit(scope);
}

/**
 * A hidden retry can mount a ref and then suspend later, or supersede that ref on
 * the same preserved node in a subsequent retry. Captured attach closures are
 * therefore never authoritative. At reveal, enumerate the committed manifests
 * and attach exactly the refs in the subtree's current visible branches.
 */
function queueCurrentHiddenRefs(state: TrySlot): void {
	if (state.detachedRefs === null || state.tryBlock === null) return;
	state.detachedRefs = null;
	const refs: SuspenseRefEntry[] = [];
	collectVisibleSubtreeRefs(state.tryBlock, refs);
	for (let i = 0; i < refs.length; i++) {
		const entry = refs[i];
		queueRefAttach(entry.scope, () => attachRef(entry.ref, entry.el));
	}
}

function attemptHiddenReveal(state: TrySlot, scheduledMode?: 'urgent' | 'transition'): void {
	const tryBlock = state.tryBlock;
	if (tryBlock === null || tryBlock.disposed || state.savedDom === null) return;
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
		deactivateScope(tryBlock);
	}
	reattachTryBlock(state);
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
	const hiddenCapture = createOffscreenCapture();
	const effectDeps = snapshotSubtreeEffectDeps(tryBlock);
	const previousCapture = WIP_CAPTURE;
	const refDetachCheckpoint = refDetachQueue.length;
	WIP_CAPTURE = hiddenCapture;
	let didThrow = false;
	let thrown: unknown = null;
	try {
		renderBlock(tryBlock);
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
			deactivateScope(tryBlock);
			// Still suspended — re-stash the try DOM (the pending arm never moved)
			// and keep/refresh the resume wiring for the (possibly new) thenable.
			softDetachTryBlock(state);
			tryBlock.inactive = true;
			attachResume(state, thrown.thenable);
		} else {
			switchToCatch(state, thrown);
			// A saved-DOM retry can run directly from a thenable microtask, outside
			// the scheduler's normal render→commit drain. Its terminal catch arm is a
			// real commit and must publish refs/effects now. Parent/drain-driven hidden
			// attempts already have an enclosing commit and leave it there.
			if (!inFlush && CURRENT_BLOCK === null) commitEffects();
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
	if (stagesHeldTransition) {
		state.pendingThenable = null;
		state.stagedCapture = hiddenCapture;
		state.stagedEffectDeps = effectDeps;
		softDetachTryBlock(state);
		tryBlock.inactive = true;
		STAGED_REVEALS.add(state);
		queueMicrotask(flushStagedRevealsIfReady);
		return;
	}
	try {
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
		spliceOffscreenCapture(hiddenCapture);
		queueCurrentHiddenRefs(state);
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
		switchToCatch(state, err);
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
 * now all fully staged, commit them (don't strand them waiting on a boundary that left).
 */
function abandonHeldTransition(state: TrySlot): void {
	if (!HELD_TRANSITIONS.has(state)) return;
	HELD_TRANSITIONS.delete(state);
	STAGED_REVEALS.delete(state);
	flushStagedRevealsIfReady();
}

/** Commit a staged group once exact membership shows every held boundary is ready. */
function flushStagedRevealsIfReady(): void {
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

/** Rebase speculative enqueue order onto final source/tree commit order. */
function rebaseOffscreenCaptureSeq(capture: OffscreenCapture): void {
	const effects = capture.effects[INSERTION].concat(
		capture.effects[LAYOUT],
		capture.effects[PASSIVE],
	).sort((a, b) => a.seq - b.seq);
	for (let i = 0; i < effects.length; i++) effects[i].seq = commitSeq++;
	const refs = capture.refs.slice().sort((a, b) => a.seq - b.seq);
	for (let i = 0; i < refs.length; i++) refs[i].seq = commitSeq++;
}

function flushStagedReveals(): void {
	if (flushingStagedReveals) return; // re-entrancy guard (a reveal may abandon a sibling)
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
				// rebase each capture's enqueue sequence so the shared effect/ref drain
				// preserves sibling tree order even when the right boundary readies first.
				batch.sort(compareStagedRevealDomOrder);
				for (const state of batch) rebaseOffscreenCaptureSeq(state.stagedCapture!);
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
		if (VIEW_TRANSITION_DRIVER?.wrapResume(run) !== true) run();
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
		// in-flight transition does not reveal the moment one input resolves. A hidden
		// primary proves its whole body below; visible holds retain the documented
		// per-swap limitation. The boundary stays held (and isPending stays true) until
		// the staged group flushes.
		if (HELD_TRANSITIONS.has(state)) {
			// Once the timeout has exposed @pending, settling one thenable is not
			// sufficient proof that this member is reveal-ready: a later dependent
			// use() may still suspend. Retry the detached primary under the hidden
			// capture and enter STAGED_REVEALS only if the whole body completes.
			if (state.savedDom !== null) {
				attemptHiddenReveal(state, 'transition');
				return;
			}
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
	// Install the optional off-screen swap graph before any listener or user
	// update can observe transition priority.
	ensureTransitionSwapDriver();
	// Bump the priority flag FIRST so any scheduleRender calls fired by the
	// listener notification (and by fn itself) are tagged as transition.
	TRANSITION_DEPTH++;
	const parentActionBatch = ACTIVE_TRANSITION_ACTION_BATCH;
	const pendingActionBatch = IN_FLIGHT_TRANSITION_ACTION_BATCH;
	const actionBatch = parentActionBatch ?? pendingActionBatch ?? createTransitionActionBatch();
	const ownsActionBatch = parentActionBatch === null && pendingActionBatch === null;
	ACTIVE_TRANSITION_ACTION_BATCH = actionBatch;
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
): [boolean, (fn: () => void | Promise<unknown>) => void];
export function useTransition(
	slot?: HookSlot,
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
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'transition-pending', slot);
					scheduleRender(block);
				}
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
): [S, (payload?: any) => void, boolean];
export function useActionState<S>(
	action: (prevState: S, payload: any) => S | Promise<S>,
	initialState: S,
	permalinkOrSlot?: string | symbol,
	slot?: HookSlot,
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
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'action-state-pending', slot);
					scheduleRender(block);
				}
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
									if (!block.disposed) {
										if (
											typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
											__OCTANE_PROFILE_ENABLED__
										)
											__profileSchedule(block, 'action-state', slot);
										scheduleRender(block);
									}
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

export function useFormStatus(slot?: symbol): FormStatus;
export function useFormStatus(slot?: HookSlot): FormStatus {
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
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'form-status', slot);
					scheduleRender(block);
				}
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
): [S, (value: V) => void];
export function useOptimistic<S, V = S>(
	passthrough: S,
	updateFnOrSlot?: ((state: S, value: V) => S) | symbol,
	slot?: HookSlot,
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
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'optimistic-revert', slot);
					scheduleRender(block);
				}
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
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'optimistic', slot);
					scheduleRender(block);
				}
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
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
					__profileSchedule(s.block, 'deferred-value', s.profileSlot);
					scheduleRender(s.block);
				} else scheduleRender(s.block);
			} finally {
				DEFERRED_SPAWN = false;
			}
		});
	});
}

export function useDeferredValue<T>(value: T, ...rest: any[]): T {
	// React-19 shape: `useDeferredValue(value, initialValue?)`. The compiler
	// appends the hook slot as the LAST argument, so we detect the
	// user-vs-compiler args by counting from the end. One trailing slot →
	// user passed no initialValue; one slot preceded by another
	// arg → user passed initialValue. Same hook-slot semantics either way.
	let slot = rest[rest.length - 1] as HookSlot | undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useDeferredValue');
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
			s = {
				current: initialValue as T,
				next: value,
				scheduled: false,
				block,
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
		s = { current: value, next: value, scheduled: false, block, wasHidden: hidden };
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			s.profileSlot = slot;
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
	state.detachedRefs = null;
	if (
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		!state.parentBlock.disposed
	)
		__profileSchedule(state.parentBlock, 'error-boundary-reset');
	scheduleRender(state.parentBlock);
}

function switchToCatch(state: TrySlot, err: any, adoptedStart?: Node, adoptedEnd?: Node): void {
	const hydration = activeHydration();
	discardOffscreenCapture(state.stagedCapture);
	state.stagedCapture = null;
	state.stagedEffectDeps = null;
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
	// Preserve the internal wrapper while bubbling through catch-less boundaries,
	// then expose the original decoded reason only to the boundary that actually
	// owns a catch arm (including primitive and null rejection reasons).
	const hydrationRejection = hydration?.isRejection(err) === true;
	const caughtError = hydrationRejection ? err.reason : err;
	state.branch = 0;
	state.err = caughtError;
	const adopting = adoptedStart !== undefined && adoptedEnd !== undefined;
	const bStart = adoptedStart ?? document.createComment('catch-b');
	const bEnd = adoptedEnd ?? document.createComment('/catch-b');
	if (!adopting) {
		if (hydration !== null) {
			// Hydrating, but the server rendered a DIFFERENT arm in this slot (the
			// try body threw on the CLIENT), so the catch arm is a client-fresh
			// build. The aborted try adoption consumed only part of the server range
			// and its teardown removed only the nodes its own block had claimed —
			// discard whatever server content is left inside the slot and park the
			// cursor on the slot's close marker so FOLLOWING siblings keep adopting
			// from an aligned position (same convention as the abandoned-adoption
			// pending swap). Only an adopted slot pair bounds server DOM; a slot
			// that minted fresh markers under hydration owns no server range.
			if (hydration.isClose(state.end)) {
				removeRange(state.start.nextSibling, state.end);
				hydration.node = state.end;
			}
			// Client-built replacement markers survive root-remainder sweeps.
			hydration.markFresh(bStart);
			hydration.markFresh(bEnd);
		}
		state.domParent.insertBefore(bStart, state.end);
		state.domParent.insertBefore(bEnd, state.end);
	} else if (hydration !== null) {
		hydration.node = bStart.nextSibling;
	}
	const reset = () => requestReset(state);
	const b = createBlock(
		'control-flow',
		state.parentBlock,
		state.domParent,
		bStart,
		bEnd,
		state.catchBody,
		{ err: caughtError, reset },
		state.env,
	);
	b.idState = state.idState;
	state.block = b;
	try {
		// A client-fresh catch build during hydration must not read the adoption
		// cursor — the server rendered the try arm here, so adopting would consume
		// (and warn about) another slot's server DOM. Suspend for the subtree.
		if (!adopting && hydration !== null) hydration.suspend(() => renderBlock(b));
		else renderBlock(b);
	} catch (e2) {
		// Catch body itself threw — bubble to next enclosing tryBlock.
		const rethrowsHydrationReason = hydrationRejection && Object.is(e2, caughtError);
		const preserveAdoptedRange = adopting && rethrowsHydrationReason;
		if (state.block) {
			unmountBlock(state.block, !preserveAdoptedRange);
			state.block = null;
		}
		const propagated = rethrowsHydrationReason ? err : e2;
		// Mid-render (a component render stack is live) with an outer boundary to
		// take the error: RETHROW instead of delegating synchronously — the same
		// rule as the no-catch-arm path above. The outer boundary's switch sweeps
		// the DOM of every frame between this boundary and itself; delegating here
		// and returning would let those still-on-stack frames keep rendering into
		// the swept range (stale anchors → NotFoundError, and the bookkeeping
		// error would REPLACE the original). The rethrow unwinds them; the outer
		// boundary catches it at its own tryBlock frame. A hydration-rejection
		// rethrow additionally retains the private hydration token so the outer
		// mountTry can adopt its own server catch range instead of rebuilding it
		// — that rethrow stays unconditional (hydrateRoot owns the unwind). With
		// NO outer handler the error must not escape to the render caller: fall
		// through to the console.error surface below (the boundary's content is
		// already torn down — no content, no fallback).
		if (
			CURRENT_BLOCK !== null &&
			(rethrowsHydrationReason || findTryHandler(state.parentBlock) !== null)
		)
			throw propagated;
		const parent = findTryHandler(state.parentBlock);
		if (parent) parent(propagated);
		else console.error('catch body threw, no outer tryBlock:', e2);
	}
}

/** Walk Block.parentBlock chain looking for a `$$tryHandler` registration. */
function findTryHandler(block: Block | null): ((err: any) => void) | null {
	const origin = block;
	let b: Block | null = block;
	while (b) {
		const h = (b as any).$$tryHandler;
		if (h) return h;
		b = b.parentBlock;
	}
	return rendererRegionTryHandler(origin);
}

/**
 * Route an error thrown by `renderBlock` during scheduled re-renders.
 * Suspense exceptions go to the nearest tryBlock's `__suspenseHandler`;
 * everything else goes to `$$tryHandler`. Without a handler, we rethrow —
 * which surfaces to the scheduler's caller (matches the prior behavior).
 */
function handleRenderError(block: Block, err: any): void {
	// §6.3 HostContextRequest: a foreign-context read the owner could not
	// satisfy synchronously. This is a hosted-root control signal, NOT an
	// application failure — it must bypass the island's own @catch/@pending
	// arms and reach the owner, which settles the carried thenable once the
	// authoritative host value has committed and then retries the root.
	if (isHostContextRequest(err)) {
		const bridge = rendererRegionOwnerForBlock(block);
		if (bridge !== null && bridge.routeSuspense(err.thenable)) return;
		err = new Error(
			'A hosted foreign-context request escaped its renderer-region owner; ' +
				'the owning bridge is gone or declined it.',
		);
	}
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
		const external = rendererRegionSuspenseHandler(block);
		if (external !== null) {
			external(err.thenable);
			return;
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
	/** Hydration compaction borrowed this slot's pair from its sole-range parent. */
	borrowed: boolean;
	branch: number;
	block: Block | null;
}

/**
 * A sole-root control-flow block may share its element boundary with one or
 * more enclosing sole-root blocks (for example a branch directly inside a
 * keyed item). When the inner branch replaces that element, keep every exact
 * borrower pointed at the new element/range so keyed moves and later teardown
 * never retain a detached boundary.
 */
function replaceSharedBlockBoundary(
	parent: Block | null,
	oldStart: Node | null,
	oldEnd: Node | null,
	newStart: Node | null,
	newEnd: Node | null,
): void {
	if (oldStart === null || oldEnd === null) return;
	let block = parent;
	while (block !== null && block.startMarker === oldStart && block.endMarker === oldEnd) {
		block.startMarker = newStart;
		block.endMarker = newEnd;
		block = block.parentBlock;
	}
}

function sharesBlockBoundary(parent: Block | null, start: Node | null, end: Node | null): boolean {
	return (
		parent !== null &&
		start !== null &&
		end !== null &&
		parent.startMarker === start &&
		parent.endMarker === end
	);
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
	const hydration = activeHydration();
	if (next !== state.branch) {
		const transitionSwap = TRANSITION_SWAP_DRIVER;
		// A markerless branch may share its host boundary with a nested sole-root
		// branch. The nested branch updates Block markers when it replaces that
		// host, but this slot's cached `end` is intentionally not part of the Block
		// chain. Follow the live block boundary for positioning/probing so an outer
		// swap never inserts relative to a detached former root.
		const liveEnd =
			state.start === null && state.block !== null && state.block.endMarker !== null
				? state.block.endMarker
				: state.end;
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
			transitionSwap !== null &&
			state.block !== null &&
			body !== null &&
			hydration === null &&
			parentBlock.currentRenderMode === 'transition'
		) {
			// Commit path requires a live branch boundary: renderOffscreen
			// inserts the wip pair AFTER its reference node, which matches "right after the
			// old end marker" — but in the anchor regime the legacy path mounts BEFORE the
			// anchor, so committing there would land the branch on the wrong side of the
			// anchor's trailing static siblings. Anchor-regime swaps keep the legacy
			// in-place path below.
			if (liveEnd !== null) {
				const oldBlock = state.block;
				const oldBlockStart = oldBlock.startMarker;
				const oldBlockEnd = oldBlock.endMarker;
				const r = transitionSwap.render(
					parentBlock,
					domParent,
					liveEnd,
					body,
					undefined,
					null,
					'control-flow',
					env,
				);
				if (r.suspended || r.error) {
					transitionSwap.dispose(r.wip);
					if (r.error) throw r.error;
					throw new SuspenseException(r.suspended);
				}
				// A hydration-compacted branch borrows a pair that still belongs to
				// its parent (and possibly several outer wrapper states). Probe for
				// suspension off-screen, then discard and use the in-place path below;
				// adopting the WIP pair would strand every outer owner on removed
				// comments. This mirrors componentSlot's inherited transition path.
				if (state.borrowed) {
					transitionSwap.dispose(r.wip);
				} else {
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
					replaceSharedBlockBoundary(
						parentBlock,
						oldBlockStart,
						oldBlockEnd,
						r.wip.start,
						r.wip.end,
					);
					// Adopted pair is now the slot's durable boundary (see NEXT-swap note above).
					r.wip.block.exclusiveMarkers = true;
					transitionSwap.splice(r.wip);
					return;
				}
			}
		}
		// Position for the new branch: just after the current branch's trailing node,
		// or the slot anchor on first mount. Captured BEFORE teardown (a self-marked
		// branch's trailing node is removed by it).
		const after: Node | null = liveEnd !== null ? liveEnd.nextSibling : state.anchor;
		const oldBlock = state.block;
		const oldBlockStart = oldBlock?.startMarker ?? null;
		const oldBlockEnd = oldBlock?.endMarker ?? null;
		const oldBoundaryShared = sharesBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd);
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
				if (hydration !== null && hydration.isOpen(state.start.nextSibling)) {
					bStart = state.start.nextSibling as Comment;
					bEnd = hydration.close(bStart);
					hydration.node = bStart.nextSibling;
				} else {
					bStart = state.start;
					bEnd = state.end as Node;
					borrowed = true;
					// Hydrating with no inner branch markers = the SERVER rendered this branch
					// EMPTY (the client now renders content, or vice-versa). Park the cursor on
					// the slot's first node (the close marker when empty) so the branch body's
					// clone() sees "nothing here" and client-builds, instead of reading a stale
					// cursor.
					if (hydration !== null) hydration.node = state.start.nextSibling;
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
			} else if (hydration !== null && state.start.nextSibling !== state.end) {
				// EMPTY client branch, but the server rendered content in this slot (e.g. an
				// `@else` with content on the server, empty `@if` on the client). Discard the
				// stale server range so the empty branch leaves a clean range + siblings stay
				// aligned (structural mismatch).
				if (process.env.NODE_ENV !== 'production') {
					const mmLoc = siteLoc(parentScope, slotKey);
					if (mmLoc)
						hydration.warnStructural(
							mmLoc,
							'an empty branch',
							hydration.describe(state.start.nextSibling),
						);
				}
				removeRange(state.start.nextSibling, state.end);
			}
		} else if (body) {
			// Markerless client mount — pick the boundary by what the branch renders.
			// This applies both on first mount and after an anchor-only empty arm:
			// a single host can self-mark without first manufacturing a pair.
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
			if (state.borrowed && state.start === null) {
				// A hydration-range passthrough branch is a logical wrapper above the
				// selected container owner. Its descendant owns the real DOM boundary.
				return;
			}
			const first = before ? before.nextSibling : domParent.firstChild;
			const last = after ? after.previousSibling : domParent.lastChild;
			if (last !== null && first === last && (first as Node).nodeType === 1) {
				// Single element — self-mark (no markers). Teardown is one removeChild,
				// and the slot now LOOKS single-element to an enclosing @if, so the
				// optimization cascades up the tree.
				b.startMarker = first;
				b.endMarker = first;
				state.end = first;
				replaceSharedBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd, first, first);
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
				replaceSharedBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd, s, e);
			}
		} else if (!oldBoundaryShared) {
			// A truly empty client arm needs only its existing insertion anchor.
			// Keep the markerless regime so a later empty → single-host transition
			// can self-mark directly. Hydration never enters here: it adopted the
			// server's outer slot pair above.
			state.anchor = after;
			state.end = null;
		} else {
			// An enclosing sole-root block borrowed the old element. Empty output
			// cannot self-delimit, so promote both the slot and every exact borrower
			// to one shared pair rather than leaving an ancestor on a detached node.
			const s = document.createComment(marker);
			const e = document.createComment('/' + marker);
			domParent.insertBefore(s, after);
			domParent.insertBefore(e, after);
			state.start = s;
			state.end = e;
			replaceSharedBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd, s, e);
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
	const hydration = activeHydration();
	let state = parentScope.slots[slotKey] as IfSlot | undefined;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Node | null = null;
		const passthrough = hydration?.passthroughRanges === true;
		// Hydration: adopt the server's `<!--[-->…<!--]-->` slot range (client mounts
		// defer marker creation entirely). `resolveHydrationOpen` also covers the
		// SOLE-hole case — a @if that is the only thing an enclosing arm/component
		// renders (e.g. `@try { @if (…) {…} }`, the router Match shape) — where the
		// anchor is the arm's END marker and the cursor is parked on the @if's open.
		const open = passthrough ? null : (hydration?.resolveOpen(anchor ?? null, domParent) ?? null);
		if (open !== null) {
			start = open;
			end = hydration!.close(open);
		}
		state = {
			__kind: 'ifBlockSlot',
			anchor: anchor ?? null,
			start,
			end,
			borrowed: passthrough,
			branch: -1,
			block: null,
		};
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
	/** Invalidates a queued visible→hidden commit when a newer render wins. */
	commitVersion: number;
	/** The visible effects still need their commit-phase deactivation. */
	deactivationPending: boolean;
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

function queueActivityDeactivation(state: ActivitySlot, block: Block, commitVersion: number): void {
	enqueueEffectEventCommitAction(() => {
		if (
			state.block !== block ||
			blockSubtreeDisposed(block) ||
			state.commitVersion !== commitVersion ||
			!state.hidden ||
			!state.deactivationPending ||
			// An independently scheduled sibling may have suspended the shared
			// boundary after this Activity completed. Its outer Suspense
			// deactivation already tore the effects down using the old committed
			// Event body; retain the pending bit for the eventual Activity replay.
			findSuspenseHiddenTry(block) !== null
		) {
			return;
		}
		// Event bodies were published before commit actions drain. Destroy while
		// the DOM is still connected, then hide the preserved range.
		deactivateScope(block);
		hideActivityRange(state);
		state.deactivationPending = false;
	});
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
	const hydration = activeHydration();
	const wantHidden = mode === 'hidden';
	let state = parentScope.slots[slotKey] as ActivitySlot | undefined;

	if (state === undefined) {
		let bStart: Comment;
		let bEnd: Comment;
		// Hydration: visible Activities carry their server-rendered body inside one
		// generic block range; hidden Activities carry the same EMPTY range because
		// their body was intentionally skipped on the server. Adopt either shape.
		const open = hydration?.resolveOpen(anchor ?? null, domParent) ?? null;
		if (open !== null) {
			bStart = open;
			bEnd = hydration!.close(open);
		} else {
			bStart = document.createComment('activity');
			bEnd = document.createComment('/activity');
			domParent.insertBefore(bStart, anchor ?? null);
			domParent.insertBefore(bEnd, anchor ?? null);
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
		state = {
			__kind: 'activityBlockSlot',
			block: b,
			hidden: false,
			commitVersion: 0,
			deactivationPending: false,
			savedDisplay: new Map(),
			savedText: new Map(),
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
		const adopted = open !== null;
		const serverRangeEmpty = adopted && bStart.nextSibling === bEnd;
		if (adopted && !serverRangeEmpty) hydration!.node = bStart.nextSibling;
		// A hidden server Activity has no body to hydrate. Mount its client tree
		// freshly between the adopted markers with hydration suspended; this builds
		// preserved state/DOM without making descendants consume unrelated server
		// nodes. The same recovery handles a visible client over hidden server HTML.
		if (serverRangeEmpty && hydration !== null) {
			b.inactive = wantHidden;
			state.hidden = wantHidden;
			hydration.deferredActivities.push(() => {
				if (b.disposed) return;
				hydration.suspend(() => renderBlock(b));
				if (state!.hidden) hideActivityRange(state!);
			});
			hydration.node = bEnd.nextSibling;
			return;
		}
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
		if (adopted && hydration !== null) hydration.node = bEnd.nextSibling;
		return;
	}

	const b = state.block!;
	b.body = body;
	b.extra = env;
	const commitVersion = ++state.commitVersion;

	if (wantHidden) {
		if (!state.hidden) {
			// visible → hidden: prerender latest content with effects suppressed,
			// then commit deactivation after Effect Event publication and before
			// hiding the still-connected DOM range.
			b.inactive = true;
			state.hidden = true;
			state.deactivationPending = true;
			queueActivityDeactivation(state, b, commitVersion);
			renderBlock(b);
		} else {
			// hidden → hidden: prerender (no effects), then hide any new children.
			// If a prior visible→hidden attempt has not committed yet, replace its
			// versioned action so the latest render owns the deactivation.
			if (state.deactivationPending) {
				queueActivityDeactivation(state, b, commitVersion);
			}
			renderBlock(b);
			if (!state.deactivationPending) hideActivityRange(state);
		}
	} else {
		if (state.hidden) {
			// hidden → visible: restore DOM, clear inactive, re-render to re-fire
			// effects (deactivateScope cleared their deps so they re-enqueue).
			showActivityRange(state);
			b.inactive = false;
			state.hidden = false;
			state.deactivationPending = false;
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
function forEachSubtreeChild(
	scope: Scope,
	visit: (child: Scope) => void,
	includeHiddenTry: boolean = true,
): void {
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
				if (
					includeHiddenTry &&
					val.__kind === 'trySlotSlot' &&
					val.tryBlock &&
					val.tryBlock !== val.block
				) {
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
function detachSubtreeRefs(
	scope: Scope,
	out: SuspenseRefEntry[],
	shouldDetach: boolean = true,
	includeHiddenTry: boolean = true,
): void {
	// A block managing a de-opt host subtree (deoptItemBody / pure-host items):
	// every node the de-opt reconciler built carries its descriptor (DEOPT_DESC),
	// whose props may hold a ref — walk the DOM subtree for them.
	const deoptRoot = (scope as any).deoptNode as Node | null | undefined;
	if (deoptRoot != null) detachDeoptTreeRefs(deoptRoot, out, shouldDetach, scope);
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
					out.push({ ref, el, scope });
					if (shouldDetach) attachRef(ref, null, el);
				} else if (kind === 's') {
					// Spread binding: the committed spread object may carry a ref.
					const ref = bag[rm[j + 1]]?.ref;
					if (ref == null) continue;
					const el = bag[rm[j + 2]];
					if (el == null) continue;
					out.push({ ref, el, scope });
					if (shouldDetach) attachRef(ref, null, el);
				} else {
					// 'f' — <Fragment ref>: detach the FragmentInstance's current ref;
					// reveal re-attaches the same instance.
					const fi = bag[rm[j + 1]];
					if (fi == null || fi._currentRef == null) continue;
					out.push({ ref: fi._currentRef, el: fi, scope });
					if (shouldDetach) attachRef(fi._currentRef, null, fi);
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
			out.push({ ref: s.ref, el: s.el, scope });
			if (shouldDetach) attachRef(s.ref, null, s.el);
		}
		// childSlot managing a pure-host de-opt node — same DEOPT_DESC walk.
		if (s.__kind === 'childSlot' && s.hostNode != null) {
			detachDeoptTreeRefs(s.hostNode, out, shouldDetach, scope);
		}
	}
	forEachSubtreeChild(
		scope,
		(child) => detachSubtreeRefs(child, out, shouldDetach, includeHiddenTry),
		includeHiddenTry,
	);
}

/** Collect the refs that belong to the subtree's CURRENT visible branches. */
function collectVisibleSubtreeRefs(scope: Scope, out: SuspenseRefEntry[]): void {
	detachSubtreeRefs(scope, out, false, false);
}

// Walk a de-opt-built DOM subtree detaching every stamped descriptor ref
// (object refs → null, callback refs' cleanup). `out` collects {ref, el} pairs for
// the suspense-hide reveal re-attach; teardown callers pass null (permanent detach,
// nothing to re-attach). Nested de-opt elements are stamped too (every element
// reconcileDeoptNode builds gets setDeoptDesc), so recurse through children —
// EXCEPT foreign `<!--portal-->…<!--/portal-->` ranges: a portal targeting one of
// these elements owns its content's refs (its slot detaches them on ITS teardown).
function detachDeoptTreeRefs(
	node: Node,
	out: SuspenseRefEntry[] | null,
	shouldDetach: boolean = true,
	ownerScope?: Scope,
): void {
	const ref = getDeoptDesc(node)?.props?.ref;
	if (ref != null) {
		if (out !== null) {
			// Suspense-hide: detach NOW (the caller re-attaches on reveal).
			out.push({ ref, el: node as Element, scope: ownerScope! });
			if (shouldDetach) attachRef(ref, null, node as Element);
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
		detachDeoptTreeRefs(c, out, shouldDetach, ownerScope);
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
				// unmount (unmountScope's effect-slot walk) tears them down.
				if (e.phase === INSERTION) continue;
				if (typeof e.cleanup === 'function') {
					const cleanup = e.cleanup;
					// Clear it BEFORE firing so unmountScope's effect-slot walk sees
					// no cleanup and won't re-run it.
					e.cleanup = undefined;
					try {
						runEffectCleanupCallback(cleanup);
					} catch (err) {
						if (err instanceof MaximumUpdateDepthError) throw err;
						const handler = findTryHandler(scope.block);
						if (handler !== null) handler(err);
						else console.error(err);
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
	const hydration = activeHydration();
	let state = parentScope.slots[slotKey] as SwitchSlot | undefined;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Node | null = null;
		if (hydration !== null && hydration.isOpen(anchor ?? null)) {
			// Hydration: adopt the server's `<!--[-->…<!--]-->` range (the matched
			// case's content) as the slot markers. Client mounts defer marker creation
			// (self-mark or mint on demand — see ifBlock).
			start = anchor as Comment;
			end = hydration.close(anchor as Node);
		}
		state = {
			__kind: 'switchBlockSlot',
			anchor: anchor ?? null,
			start,
			end,
			borrowed: false,
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
	// The compiler created `anchor` as this call site's dedicated `<!>`
	// placeholder. Reuse it as the durable closing boundary instead of keeping
	// both that placeholder and a newly-created `/for` comment.
	ownEnd?: boolean,
): void {
	// flags bitfield: bit 0 = pure (auto-memo), bit 1 = singleRoot (skip per-item
	// Comment markers), bit 2 = depEligible (compare `deps` to cachedDeps and
	// promote body to PURE when unchanged), bit 3 = indexIndependent (the body
	// binds no `index` name → a pure reorder that only moves a survivor's
	// position need not re-render it), bit 4 = the server emitted direct-host
	// items without per-item pairs. Packed into one numeric literal.
	const parentBlock = parentScope.block;
	const hydration = activeHydration();
	let state = parentScope.slots[slotKey] as ForSlot | undefined;
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		if (hydration !== null && hydration.isOpen(anchor ?? null)) {
			// Hydration: the server wrapped the whole @for in a `<!--[-->…<!--]-->`
			// range (anchor resolved to the outer `<!--[-->`). Adopt it as the slot
			// markers and point the cursor at the first item's `<!--[-->` so the
			// empty→fill mount below adopts each item via mountItem.
			start = anchor as Comment;
			end = hydration.close(anchor as Node);
			hydration.node = start.nextSibling;
		} else if (hydration !== null && hydration.isOpen(hydration.node)) {
			// Hydration (sole hole, no `<!>` anchor): the @for is the only root of its
			// owning body (e.g. a `@try { @for }` arm or a component whose body is a
			// bare @for), so the compiler emitted no anchor — but mountTry/renderBlock
			// parked the CURSOR on the server's `<!--[-->`. Adopt from the cursor, the
			// same way childSlot does for a sole renderable hole.
			start = hydration.node as Comment;
			end = hydration.close(hydration.node as Node);
			hydration.node = start.nextSibling;
		} else {
			start = document.createComment('for');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (when a static sibling follows this @for in mixed
			// children, the compiler emits a `<!>` anchor at the @for's source-order
			// index and threads it here so the markers land BEFORE the sibling).
			if (ownEnd === true && anchor?.nodeType === 8) {
				end = anchor as Comment;
				end.data = '/for';
				domParent.insertBefore(start, end);
			} else {
				end = document.createComment('/for');
				domParent.insertBefore(start, anchor ?? null);
				domParent.insertBefore(end, anchor ?? null);
			}
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
	// New direct-host list output carries its server-selected arm on the existing
	// outer open comment. Legacy/general list ranges return -1 and retain the
	// content-shape checks used before markerless SSR items existed.
	const serverMarkerState = hydration?.markerState(state.start) ?? -1;
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
			// When the SERVER rendered a populated list but the client is empty now, the
			// content inside the @for range is item blocks (`<!--[-->`), not the @empty body
			// — a STRUCTURAL mismatch. Discard the server items and build @empty fresh with
			// hydration suspended (so it client-mounts instead of mis-adopting an item).
			let suspendForEmpty = false;
			if (
				hydration !== null &&
				(serverMarkerState === 1 ||
					(serverMarkerState === -1 && hydration.isOpen(state.start.nextSibling)))
			) {
				// Prefer the @for's own compiled source loc (siteLoc; for-constructs carry
				// `loc` in `__s.locs`) — the parent element's `__oct_loc` stamp exists only
				// when the parent carries dynamic bindings.
				if (process.env.NODE_ENV !== 'production') {
					const mmLoc = siteLoc(parentScope, slotKey) || (domParent as any).__oct_loc;
					if (mmLoc) hydration.warnStructural(mmLoc, 'an empty list (@empty)', 'a populated list');
				}
				removeRange(state.start.nextSibling, state.end);
				suspendForEmpty = true;
			} else if (hydration !== null) {
				// The server already rendered the @empty content directly inside the
				// adopted outer range. The empty body borrows that range and adopts from
				// its first child; no redundant inner pair is necessary.
				hydration.node = state.start.nextSibling;
			}
			const b = createBlock(
				'control-flow',
				parentBlock,
				domParent,
				state.start,
				state.end,
				emptyBody,
				undefined,
				state.env,
			);
			// The outer ForSlot owns these comments. Empty-body teardown clears only
			// their contents so the slot remains a stable insertion boundary for the
			// next empty → items transition.
			b.exclusiveMarkers = true;
			state.emptyBlock = b;
			if (suspendForEmpty) hydration!.suspend(() => renderBlock(b));
			else renderBlock(b);
		}
		// Advance the cursor past the whole @for so the next sibling's clone()
		// doesn't read a position left inside this consumed range.
		if (hydration !== null) hydration.node = state.end.nextSibling;
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
		!isEmpty &&
		hydration !== null &&
		(serverMarkerState === 0 ||
			(serverMarkerState === -1 &&
				((flags || 0) & 16) === 0 &&
				state.start.nextSibling !== null &&
				state.start.nextSibling !== state.end &&
				!hydration.isOpen(state.start.nextSibling)))
	) {
		if (process.env.NODE_ENV !== 'production') {
			const mmLoc = siteLoc(parentScope, slotKey) || (domParent as any).__oct_loc;
			if (mmLoc) hydration.warnStructural(mmLoc, 'a populated list', 'an empty list (@empty)');
		}
		removeRange(state.start.nextSibling, state.end);
		hydration.node = state.end;
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
		(f & 16) !== 0,
	);
	// Advance the hydration cursor past the @for's `<!--]-->` so a later sibling's
	// clone() starts after this block — covers the zero-item, no-@empty case where
	// reconcileKeyed mounts nothing and the cursor would otherwise stay on the
	// inner close marker.
	if (hydration !== null) {
		discardLeftoverHydrationItems(state.end, hydration);
		hydration.node = state.end.nextSibling;
	}
}

/**
 * STRUCTURAL recovery for an @for where the SERVER rendered MORE items than the client now
 * renders: after reconcile adopts the client's items, the cursor sits on the first unconsumed
 * server item's marker (or at `end`). Discard everything between the cursor and `end` so the
 * extra server rows don't linger. Same-parent guarded; stops AT `end` (never past it).
 */
function discardLeftoverHydrationItems(end: Node, hydration: HydrationCapability): void {
	const n = hydration.node;
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
	// The matching server compiler proved a direct host root and omitted the
	// item's hydration pair. Kept separate from singleRoot because sole-component
	// and conditional roots are markerless only on fresh client mounts today.
	ssrMarkerless: boolean = false,
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
		const mounted: Block[] = [];
		try {
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
					ssrMarkerless,
					adoptNode,
				);
				mounted.push(block);
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
		} catch (error) {
			// A list item may suspend while mounting (most visibly a lazy
			// component). None of this empty->fill pass has committed yet: discard
			// every completed prefix item, while mountItem discards the throwing
			// item itself. A retry then starts from a genuinely empty list instead
			// of duplicating the completed prefix and overwriting its Map entry.
			for (let i = mounted.length - 1; i >= 0; i--) {
				const block = mounted[i];
				oldItems.delete(block.key);
				unmountBlock(block, true);
			}
			state.head = null;
			state.tail = null;
			state.size = 0;
			throw error;
		}
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
				ssrMarkerless,
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
					ssrMarkerless,
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
					ssrMarkerless,
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
					ssrMarkerless,
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
	// True only for compiled direct-host items whose SSR output omitted the item
	// pair. Hydration can therefore adopt the existing host as start === end.
	ssrMarkerless: boolean,
	// Pure-host → blocks upgrade adoption: an existing raw child node this item
	// should take over IN PLACE (self-marked directly, or markers minted around
	// it, seeded as the item block's deoptNode so the body's pure path patches
	// instead of rebuilding).
	adoptNode: Node | null = null,
): Block {
	const hydration = activeHydration();
	if (hydration !== null) {
		if (ssrMarkerless && !hydration.isOpen(hydration.node)) {
			// The outer @for pair is the only list framing on the wire. Each proven
			// direct-host item self-delimits, exactly like the existing client-mount
			// singleRoot path. If the client has more items than the server, the
			// cursor has reached the outer close; fall through to a fresh mount.
			if (hydration.node !== null && hydration.node !== forSlot.end) {
				const root = hydration.node;
				const block = createBlock(
					'control-flow',
					parentBlock,
					parentNode,
					root,
					root,
					body as ComponentBody,
					item,
					forSlot.env,
				);
				block.forSlot = forSlot;
				block.itemIndex = index;
				renderBlock(block);
				hydration.node = block.endMarker?.nextSibling ?? root.nextSibling;
				return block;
			}
			if (process.env.NODE_ENV !== 'production') {
				const mmLoc = (parentNode as any).__oct_loc;
				if (mmLoc)
					hydration.warnStructural(mmLoc, 'another list item', hydration.describe(hydration.node));
			}
			return hydration.suspend(() =>
				mountItem(
					parentBlock,
					parentNode,
					anchor,
					item,
					index,
					body,
					forSlot,
					singleRoot,
					ssrMarkerless,
				),
			);
		}
		// Hydration: the server wraps each GENERAL-SHAPE item in its own
		// `<!--[-->…<!--]-->` range. Also accept this legacy marked encoding
		// when a current direct-host client could have adopted markerlessly, which
		// keeps mixed-version/dev hydration recoverable.
		if (!hydration.isOpen(hydration.node)) {
			// STRUCTURAL list mismatch: the client renders more items than the server did,
			// so the cursor isn't on an item's open marker (it's at the @for's end marker or
			// other content). Without this guard `matchingClose` would walk off the end and
			// crash. Recover by building THIS item fresh — suspend hydration for the item's
			// whole subtree (via a re-entrant call) so it client-mounts instead of adopting.
			if (process.env.NODE_ENV !== 'production') {
				const mmLoc = (parentNode as any).__oct_loc;
				if (mmLoc)
					hydration.warnStructural(mmLoc, 'another list item', hydration.describe(hydration.node));
			}
			return hydration.suspend(() =>
				mountItem(
					parentBlock,
					parentNode,
					anchor,
					item,
					index,
					body,
					forSlot,
					singleRoot,
					ssrMarkerless,
				),
			);
		}
		const itemStart = hydration.node as Comment;
		const itemEnd = hydration.close(itemStart as Node);
		hydration.node = itemStart.nextSibling;
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
		hydration.node = itemEnd.nextSibling;
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
	try {
		renderBlock(block);
	} catch (error) {
		// The caller cannot receive/register a Block whose initial render threw.
		// Remove its owned range and hook scopes now; a Suspense retry will mount
		// it afresh as part of the list transaction.
		unmountBlock(block, true);
		throw error;
	}
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
// Post-hydration exact-range compaction
// ---------------------------------------------------------------------------

type CoalescedRangeOwner = CompSlot | ChildSlot | BranchSlot;

interface HydrationRangeGroup {
	start: Comment;
	end: Comment;
	/** Number of logical hydration ranges represented by this physical pair. */
	depth: number;
	blocks: Block[];
	liteScopes: Scope[];
	owners: CoalescedRangeOwner[];
}

/** True when a compiled ref manifest contains a `<Fragment ref>` binding. */
function scopeHasFragmentRef(scope: Scope): boolean {
	const fields = scope.refFields;
	if (fields === null) return false;
	for (let i = 0; i < fields.length; i += 3) {
		if (fields[i] === 'f') return true;
	}
	return false;
}

/**
 * Collapse only ranges whose runtime ownership graph and DOM positions both
 * prove they are exactly coextensive. SSR deliberately stays on the legacy
 * explicit-pair protocol: hydration first adopts every range unambiguously,
 * then this one-shot pass redirects inner owners to the retained outer pair and
 * removes the redundant comments. Suspense/try, Activity, portals, and list
 * outer ranges are traversal barriers; keyed item ranges remain independently
 * movable, though wrapper-only descendants may compact inside each item pair.
 */
function coalesceHydratedRanges(
	rootBlock: Block,
	liteRanges: WeakMap<Scope, HydratedLiteRange>,
): void {
	const blockGroups = new WeakMap<Block, HydrationRangeGroup>();
	const scopeGroups = new WeakMap<Scope, HydrationRangeGroup>();
	const ownerGroups = new WeakMap<object, HydrationRangeGroup>();
	const seenBlocks = new WeakSet<Block>();
	const seenScopes = new WeakSet<Scope>();

	function makeGroup(
		startNode: Node | null,
		endNode: Node | null,
		block?: Block,
		liteScope?: Scope,
		owner?: CoalescedRangeOwner,
	): HydrationRangeGroup | null {
		if (!isBlockOpen(startNode) || !isBlockClose(endNode) || startNode === endNode) return null;
		if (startNode.parentNode === null || startNode.parentNode !== endNode.parentNode) return null;
		const openDepth = hydrationMarkerMultiplicity(startNode.data, true);
		const closeDepth = hydrationMarkerMultiplicity(endNode.data, false);
		if (openDepth === 0 || openDepth !== closeDepth) return null;
		const group: HydrationRangeGroup = {
			start: startNode,
			end: endNode,
			depth: openDepth,
			blocks: block === undefined ? [] : [block],
			liteScopes: liteScope === undefined ? [] : [liteScope],
			owners: owner === undefined ? [] : [owner],
		};
		if (block !== undefined) blockGroups.set(block, group);
		if (liteScope !== undefined) scopeGroups.set(liteScope, group);
		if (owner !== undefined) ownerGroups.set(owner, group);
		return group;
	}

	function appendUnique<T>(target: T[], source: T[]): void {
		for (let i = 0; i < source.length; i++) {
			if (target.indexOf(source[i]) === -1) target.push(source[i]);
		}
	}

	function remapGroup(from: HydrationRangeGroup, to: HydrationRangeGroup): void {
		for (let i = 0; i < from.blocks.length; i++) blockGroups.set(from.blocks[i], to);
		for (let i = 0; i < from.liteScopes.length; i++) scopeGroups.set(from.liteScopes[i], to);
		for (let i = 0; i < from.owners.length; i++) ownerGroups.set(from.owners[i], to);
	}

	function writeMultiplicity(group: HydrationRangeGroup): void {
		group.start.data = group.depth === 1 ? HYDRATION_START : HYDRATION_START + String(group.depth);
		group.end.data = group.depth === 1 ? HYDRATION_END : HYDRATION_END + String(group.depth);
	}

	/** Merge bookkeeping for two runtime owners that already share one pair. */
	function unifySharedPair(
		outer: HydrationRangeGroup,
		inner: HydrationRangeGroup,
	): HydrationRangeGroup {
		if (outer === inner) return outer;
		outer.depth = Math.max(outer.depth, inner.depth);
		appendUnique(outer.blocks, inner.blocks);
		appendUnique(outer.liteScopes, inner.liteScopes);
		appendUnique(outer.owners, inner.owners);
		remapGroup(inner, outer);
		writeMultiplicity(outer);
		return outer;
	}

	function rangesAreExactlyNested(outer: HydrationRangeGroup, inner: HydrationRangeGroup): boolean {
		return (
			outer.start.parentNode !== null &&
			outer.start.parentNode === inner.start.parentNode &&
			outer.end.parentNode === outer.start.parentNode &&
			inner.end.parentNode === outer.start.parentNode &&
			outer.start.nextSibling === inner.start &&
			inner.end.nextSibling === outer.end
		);
	}

	/** Redirect every inner runtime owner before removing its redundant pair. */
	function borrowInnerRange(outer: HydrationRangeGroup, inner: HydrationRangeGroup): void {
		for (let i = 0; i < inner.blocks.length; i++) {
			const block = inner.blocks[i];
			block.startMarker = outer.start;
			block.endMarker = outer.end;
			block.exclusiveMarkers = true;
		}
		for (let i = 0; i < inner.liteScopes.length; i++) {
			inner.liteScopes[i].block.endMarker = outer.end;
		}
		for (let i = 0; i < inner.owners.length; i++) {
			const owner = inner.owners[i];
			owner.start = outer.start;
			owner.end = outer.end;
			if (owner.__kind === 'componentSlotSlot') {
				owner.inherited = true;
			} else if (owner.__kind === 'childSlot') {
				owner.borrowed = true;
				if (owner.forSlot !== null) {
					owner.forSlot.start = outer.start;
					owner.forSlot.end = outer.end;
				}
			} else {
				owner.borrowed = true;
			}
		}
	}

	function mergeExactRanges(
		outer: HydrationRangeGroup,
		inner: HydrationRangeGroup,
	): HydrationRangeGroup {
		if (outer === inner) return outer;
		if (outer.start === inner.start && outer.end === inner.end) {
			return unifySharedPair(outer, inner);
		}
		if (!rangesAreExactlyNested(outer, inner)) return outer;
		const mergedDepth = outer.depth + inner.depth;
		// Both inputs were decoded as safe integers, but their sum may not be. Keep
		// both physical pairs rather than minting metadata the protocol cannot parse.
		if (!Number.isSafeInteger(mergedDepth)) return outer;
		borrowInnerRange(outer, inner);
		inner.start.remove();
		inner.end.remove();
		outer.depth = mergedDepth;
		appendUnique(outer.blocks, inner.blocks);
		appendUnique(outer.liteScopes, inner.liteScopes);
		appendUnique(outer.owners, inner.owners);
		remapGroup(inner, outer);
		writeMultiplicity(outer);
		return outer;
	}

	function attachOwner(group: HydrationRangeGroup | null, owner: CoalescedRangeOwner): void {
		if (group === null) return;
		if (group.owners.indexOf(owner) === -1) group.owners.push(owner);
		ownerGroups.set(owner, group);
	}

	function isBoundaryOwner(owner: CompSlot): boolean {
		return hasComponentFlags(owner.currentComp, COMPONENT_FLAG_BOUNDARY);
	}

	function mayBorrowCandidate(value: any): boolean {
		if (value === null || typeof value !== 'object') return false;
		const kind = value.__kind;
		if (kind === 'componentSlotSlot') {
			const owner = value as CompSlot;
			return (
				owner.block !== null &&
				!owner.keyed &&
				!isBoundaryOwner(owner) &&
				!scopeHasFragmentRef(owner.block)
			);
		}
		if (kind === 'childSlot') {
			const owner = value as ChildSlot;
			return (
				owner.block !== null &&
				owner.forSlot === null &&
				owner.portal === null &&
				!hasComponentFlags(owner.currentComp, COMPONENT_FLAG_BOUNDARY) &&
				!scopeHasFragmentRef(owner.block)
			);
		}
		if (kind === 'ifBlockSlot' || kind === 'switchBlockSlot') {
			const owner = value as BranchSlot;
			return owner.block === null || !scopeHasFragmentRef(owner.block);
		}
		return liteRanges.has(value as Scope) && !scopeHasFragmentRef(value as Scope);
	}

	function mappedGroup(value: any): HydrationRangeGroup | undefined {
		if (value === null || typeof value !== 'object') return undefined;
		return ownerGroups.get(value) ?? scopeGroups.get(value as Scope);
	}

	/**
	 * A packed one-entry scope is the runtime proof for a sole output range.
	 * Template pass-through holes also carry a compiler proof because slot 0 is
	 * their binding bag; no DOM-only inference is made for arbitrary empty holes.
	 */
	function soleRangeCandidate(scope: Scope): HydrationRangeGroup | null {
		let only: any = undefined;
		let count = 0;
		const slots = scope.slots;
		for (let i = 0; i < slots.length; i++) {
			if (slots[i] === undefined) continue;
			only = slots[i];
			count++;
			if (count > 1) break;
		}
		if (count === 1 && mayBorrowCandidate(only)) {
			const group = mappedGroup(only);
			if (group !== undefined) return group;
		}

		const registered = scope._slots;
		if (
			registered !== null &&
			registered.length === 1 &&
			scope.children.length === 0 &&
			registered[0].__kind === 'childSlot' &&
			(registered[0] as ChildSlot).compactable &&
			mayBorrowCandidate(registered[0])
		) {
			return ownerGroups.get(registered[0]) ?? null;
		}
		return null;
	}

	function compactScopeRange(scope: Scope, own: HydrationRangeGroup | null): void {
		visitScopeContents(scope);
		if (own === null || scopeHasFragmentRef(scope)) return;
		const candidate = soleRangeCandidate(scope);
		if (candidate !== null) mergeExactRanges(own, candidate);
	}

	function visitBlock(block: Block, owner?: CoalescedRangeOwner): HydrationRangeGroup | null {
		if (seenBlocks.has(block)) {
			const existing = blockGroups.get(block) ?? null;
			if (owner !== undefined) attachOwner(existing, owner);
			return existing;
		}
		seenBlocks.add(block);
		const own = makeGroup(block.startMarker, block.endMarker, block, undefined, owner);
		compactScopeRange(block, own);
		return blockGroups.get(block) ?? own;
	}

	function visitNestedScope(scope: Scope): HydrationRangeGroup | null {
		if (seenScopes.has(scope)) return scopeGroups.get(scope) ?? null;
		seenScopes.add(scope);
		const range = liteRanges.get(scope);
		const own =
			range === undefined ? null : makeGroup(range.start, range.end, undefined, scope, undefined);
		compactScopeRange(scope, own);
		return scopeGroups.get(scope) ?? own;
	}

	function visitForSlot(state: ForSlot): void {
		for (let block = state.head; block !== null; block = block.nextSibling) visitBlock(block);
		if (state.emptyBlock !== null) visitBlock(state.emptyBlock);
	}

	function visitBranchSlot(state: BranchSlot): void {
		const inner = state.block === null ? null : visitBlock(state.block);
		const outer = makeGroup(state.start, state.end, undefined, undefined, state);
		if (outer !== null && inner !== null && !scopeHasFragmentRef(state.block!)) {
			mergeExactRanges(outer, inner);
		}
	}

	function visitSlot(state: any): void {
		const kind = state.__kind;
		if (kind === 'componentSlotSlot') {
			if (state.block !== null) visitBlock(state.block, state as CompSlot);
			return;
		}
		if (kind === 'childSlot') {
			const child = state as ChildSlot;
			if (child.block !== null) visitBlock(child.block, child);
			if (child.forSlot !== null) visitForSlot(child.forSlot);
			if (child.portal?.block != null) visitBlock(child.portal.block);
			return;
		}
		if (kind === 'ifBlockSlot' || kind === 'switchBlockSlot') {
			visitBranchSlot(state as BranchSlot);
			return;
		}
		if (kind === 'forBlockSlot') {
			visitForSlot(state as ForSlot);
			return;
		}
		if (kind === 'trySlotSlot') {
			const visible = state.block as Block | null;
			const persistent = state.tryBlock as Block | null;
			if (visible !== null) visitBlock(visible);
			if (persistent !== null && persistent !== visible) visitBlock(persistent);
			return;
		}
		if (kind === 'activityBlockSlot' || kind === 'portalSlotSlot') {
			if (state.block !== null) visitBlock(state.block);
			return;
		}
		// Internal host-children scopes may carry a markerless Block. Traverse it
		// for descendants, but never expose the wrapper itself as a candidate.
		if (state.block != null) visitBlock(state.block);
	}

	function visitScopeContents(scope: Scope): void {
		const children = scope.children;
		for (let i = 0; i < children.length; i++) visitNestedScope(children[i].scope);
		const registered = scope._slots;
		if (registered === null) return;
		for (let i = 0; i < registered.length; i++) visitSlot(registered[i]);
	}

	visitBlock(rootBlock);
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
	render(
		element:
			| ElementDescriptor
			| string
			| number
			| bigint
			| boolean
			| null
			| undefined
			| readonly unknown[],
	): void;
	render(body: ComponentBody, props?: any): void;
	unmount(): void;
}

export interface RootOptions {
	/**
	 * Caller-controlled useId prefix. createRoot composes it with an automatic
	 * client-root namespace; hydrateRoot uses it verbatim to match server output.
	 */
	identifierPrefix?: string;
}

// One live public root owns a container at a time. React still returns a second
// root for a duplicate createRoot call, but publishes a diagnostic because two
// independent owners can otherwise race over the same DOM. Tokens make release
// safe when an older duplicate root unmounts after the newer one was created.
let ROOT_CONTAINER_OWNERS: WeakMap<Element, object> | null = null;

// Generic public renderables (host descriptors, strings, null, and so on) run
// through the ordinary return-value reconciler. Compiled component bodies stay
// on the direct fast path and retain Octane's body+props root overload.
const ROOT_RENDERABLE_BODY = ((value: unknown) =>
	value === undefined ? null : value) as ComponentBody;
const EMPTY_ROOT_BODY = (() => undefined) as ComponentBody;

function assertValidRootContainer(container: unknown): asserts container is Element {
	if (container === null || typeof container !== 'object' || (container as Node).nodeType !== 1) {
		throw new Error('Target container is not a DOM element.');
	}
}

function claimRootContainer(container: Element): object | null {
	if (process.env.NODE_ENV === 'production') return null;
	const owners = (ROOT_CONTAINER_OWNERS ??= new WeakMap());
	if (owners.has(container)) {
		console.error(
			'You are calling createRoot() on a container that has already been passed to ' +
				'createRoot() before. Instead, call root.render() on the existing root instead if ' +
				'you want to update it.',
		);
	}
	const token = {};
	owners.set(container, token);
	return token;
}

function releaseRootContainer(container: Element, token: object | null): void {
	if (token !== null && ROOT_CONTAINER_OWNERS?.get(container) === token) {
		ROOT_CONTAINER_OWNERS.delete(container);
	}
}

function warnCreateRootElementOption(options: RootOptions | undefined): RootOptions | undefined {
	if (isElementDescriptor(options)) {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				'You passed a JSX element to createRoot. You probably meant to call root.render instead. ' +
					'Example usage:\n\n  let root = createRoot(domContainer);\n  root.render(<App />);',
			);
		}
		return undefined;
	}
	return options;
}

function warnRootRenderSecondArgument(second: unknown, container: Element): void {
	if (process.env.NODE_ENV === 'production') return;
	if (typeof second === 'function') {
		console.error(
			'does not support the second callback argument. To execute a side effect after ' +
				'rendering, declare it in a component body with useEffect().',
		);
	} else if (second === container) {
		console.error(
			"You passed a container to the second argument of root.render(...). You don't need to " +
				'pass it again since you already passed it to create the root.',
		);
	} else {
		console.error(
			'You passed a second argument to root.render(...) but it only accepts one argument.',
		);
	}
}

function warnRootUnmountArgument(): void {
	if (process.env.NODE_ENV !== 'production') {
		console.error(
			'does not support a callback argument. To execute a side effect after rendering, ' +
				'declare it in a component body with useEffect().',
		);
	}
}

function warnRootLifecycleUnmount(): void {
	if (process.env.NODE_ENV !== 'production') {
		console.error(
			'Attempted to synchronously unmount a root while Octane was already rendering. ' +
				'Octane cannot finish unmounting the root until the current render has completed, ' +
				'which may lead to a race condition.',
		);
	}
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
function makeRoot(
	container: Element,
	rootBlock: Block | null,
	currentBody: ComponentBody | null,
	currentKey: any,
	idState: RootIdState,
	outputHandler: OutputHandler | null,
	ownerToken: object | null,
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
	root = {
		render(bodyOrElement: unknown, props?: any) {
			if (unmounted) throw new Error('Cannot update an unmounted root.');
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
						rootBlock.nestedUpdateError = true;
						scheduleRender(rootBlock);
					}
					return;
				}
			} else {
				UPDATE_CHAIN_ID++;
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
			// Same component as the live root (incl. a just-hydrated root): update
			// props in place and schedule. This is a NORMAL client render — `hydrating`
			// is already false, so renderBlock reuses the adopted DOM, not rebuilds it.
			if (
				rootBlock &&
				!rootBlock.disposed &&
				currentBody === body &&
				Object.is(currentKey, nextKey)
			) {
				rootBlock.props = props;
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileSchedule(rootBlock, 'root-render');
				scheduleRender(rootBlock);
				return;
			}
			if (rootBlock) {
				DOM_ROOT_DISPOSERS.delete(rootBlock);
				unmountBlock(rootBlock);
				rootBlock = null;
				currentBody = null;
				currentKey = null;
			}
			while (container.firstChild) container.removeChild(container.firstChild);
			rootBlock = createBlock(
				'root',
				null,
				container,
				null,
				null,
				body,
				props,
				undefined,
				outputHandler,
			);
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileTrackComponent(rootBlock, body);
			rootBlock.idState = idState;
			registerRootDisposer(rootBlock);
			currentBody = body;
			currentKey = nextKey;
			// React parity: render() inside a transition never commits synchronously
			// — schedule at transition priority so the commit is view-transition-
			// wrappable (boundaries mounting WITH the initial content enter-animate,
			// e.g. a Suspense fallback appearing under a <ViewTransition>).
			if (TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0) {
				rootBlock.pending = true;
				rootBlock.pendingMode = 'transition';
				QUEUE.push(rootBlock);
				if (!syncFlush && !scheduled) {
					scheduled = true;
					queueMicrotask(flush);
				}
				return;
			}
			const mountedRoot = rootBlock;
			try {
				renderBlock(mountedRoot);
			} catch (error) {
				try {
					handleRenderError(mountedRoot, error);
				} catch (unhandled) {
					// Match the scheduled-render failure path: discard the failed tree
					// before surfacing the error, but keep the public root reusable for a
					// later recovery render. In particular, effects registered before the
					// throw belong to an aborted render and must never reach a later flush.
					if (!mountedRoot.disposed) unmountBlock(mountedRoot);
					throw unhandled;
				}
				root.unmount();
				return;
			}
			// First render commits effects on next microtask flush.
			if (!syncFlush && !scheduled) {
				scheduled = true;
				queueMicrotask(flush);
			}
		},
		unmount() {
			if (arguments.length > 0) warnRootUnmountArgument();
			if (unmounted) return;
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
			}
			if (
				process.env.NODE_ENV !== 'production' &&
				(inFlush ||
					CURRENT_BLOCK !== null ||
					EFFECT_BODY_DEPTH > 0 ||
					EFFECT_EVENT_LIFECYCLE_DEPTH > 0)
			) {
				warnRootLifecycleUnmount();
			}
			unmounted = true;
			try {
				if (rootBlock) {
					DOM_ROOT_DISPOSERS.delete(rootBlock);
					// Skip the per-Block DOM walk recursion (~3 removeChild ops × every
					// Block in the tree). Run cleanups + scope teardown only, then clear
					// the container in one shot. Portals self-detach during the recursive
					// teardown because their DOM lives in a foreign target — see the
					// portalSlotSlot branch in unmountScope. This also deliberately makes
					// unmount safe after external DOM removal instead of surfacing the
					// renderer-specific NotFoundError React happens to expose.
					unmountBlock(rootBlock, /*detachDom*/ false);
					// Root unmount runs outside any flush, so no commit follows — drain the
					// teardown ref detaches queued above directly.
					drainRefDetaches();
					container.textContent = '';
					rootBlock = null;
					currentBody = null;
					currentKey = null;
				}
			} finally {
				unregisterDelegationTarget(container);
				releaseRootContainer(container, ownerToken);
			}
		},
	};
	if (rootBlock !== null) registerRootDisposer(rootBlock);
	return root;
}

function createRootWithOutputHandler(
	container: Element,
	options: RootOptions | undefined,
	outputHandler: OutputHandler | null,
): Root {
	assertValidRootContainer(container);
	options = warnCreateRootElementOption(options);
	const ownerToken = claimRootContainer(container);
	// Register the container as an event-delegation target up front. Listeners
	// for all currently-known delegated events attach now; any new event types
	// registered later (via `delegateEvents`) will back-attach automatically.
	registerDelegationTarget(container);
	// Lazy root: the block is created on the first `.render()` call.
	return makeRoot(
		container,
		null,
		null,
		null,
		{
			prefix: (options?.identifierPrefix ?? '') + 'r' + (nextClientRootId++).toString(36) + '-',
			next: 0,
		},
		outputHandler,
		ownerToken,
	);
}

export function createRoot(container: Element, options?: RootOptions): Root {
	return createRootWithOutputHandler(container, options, renderReturnedValue);
}

/** Compiler-only root for a statically proven void `@{}` entry component. */
export function __createVoidRoot(container: Element, options?: RootOptions): Root {
	return createRootWithOutputHandler(container, options, null);
}

/**
 * Hydrate a server-rendered container and return a live {@link Root} — the
 * React-18 `hydrateRoot(container, element)` shape (container FIRST). Instead of
 * clearing the container and cloning fresh DOM, the compiled mount ADOPTS the
 * existing server DOM: `clone()` returns the server root, `htext()` adopts
 * server text nodes, and event handlers / update bindings are stamped on the
 * adopted nodes (active hydration capability, see clone/htext). The seeded prev-values make
 * the first update a no-op when the client matches the server (no mismatch
 * re-render).
 *
 * Hydration runs ONCE, here on creation. The returned root's `.render(...)` is a
 * normal (non-hydrating) client render against the block mounted here: the same
 * component updates props in place on the adopted DOM, a different component
 * tears down and remounts.
 */
export function hydrateRoot(
	container: Element,
	element: ElementDescriptor,
	options?: RootOptions,
): Root;
export function hydrateRoot(
	container: Element,
	body: ComponentBody,
	props?: any,
	options?: RootOptions,
): Root;
export function hydrateRoot(
	container: Element,
	bodyOrElement: ComponentBody | ElementDescriptor,
	propsOrOptions?: any,
	rootOptions?: RootOptions,
): Root {
	assertValidRootContainer(container);
	let body: ComponentBody;
	let props: any;
	let rootKey: any = null;
	if (isElementDescriptor(bodyOrElement)) {
		rootKey = bodyOrElement.key ?? null;
		if (typeof bodyOrElement.type === 'function') {
			body = bodyOrElement.type as ComponentBody;
			props = bodyOrElement.props;
		} else {
			body = ROOT_RENDERABLE_BODY;
			props = bodyOrElement;
		}
		rootOptions = propsOrOptions as RootOptions | undefined;
	} else if (bodyOrElement === undefined) {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				'Must provide initial children as second argument to hydrateRoot. ' +
					'Example usage: hydrateRoot(domContainer, <App />)',
			);
		}
		body = EMPTY_ROOT_BODY;
		props = undefined;
	} else if (typeof bodyOrElement === 'function') {
		body = bodyOrElement;
		props = propsOrOptions;
	} else {
		body = ROOT_RENDERABLE_BODY;
		props = bodyOrElement;
	}
	const ownerToken = claimRootContainer(container);
	registerDelegationTarget(container);
	const rootBlock = createBlock(
		'root',
		null,
		container,
		null,
		null,
		body,
		props,
		undefined,
		renderReturnedValue,
	);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileTrackComponent(rootBlock, body);
	const idState: RootIdState = {
		prefix: rootOptions?.identifierPrefix ?? '',
		next: 0,
	};
	rootBlock.idState = idState;
	let hydrationCompleted = false;
	let seeds: unknown[] | null = null;
	// The root-local counter starts at zero, matching the server render carrying
	// the same identifierPrefix. Other roots cannot perturb hydration ordering.
	// Adopt server-serialized use(thenable) values, if any: pull them out of the
	// inline data <script> (and remove it, so it isn't taken for a hydratable
	// node) and stage them for useThenable to consume in render order.
	const seedScript = container.querySelector('script[' + SUSPENSE_SCRIPT_ATTR + ']');
	if (seedScript !== null) {
		seeds = parseSeedJson(seedScript.textContent || '[]');
		seedScript.remove();
	}
	// Executed stream runtime/reveal scripts remain in a real browser's DOM. They
	// are protocol sidecars rather than authored component output, so remove only
	// direct children carrying the renderer-owned marker before root adoption.
	for (let child = container.firstElementChild; child !== null; ) {
		const next = child.nextElementSibling;
		if (child.localName === 'script' && child.hasAttribute(STREAM_SCRIPT_ATTR)) child.remove();
		child = next;
	}
	// The component's server root is the container's first node — the initial
	// cursor position. clone() adopts it; a hole-template walk advances from here.
	// A STREAMED shell flushes its deduped <style data-octane> tags AHEAD of the
	// body markup (styles must be live before painted fallbacks), so skip any
	// leading renderer-emitted style tags: injectStyle's document-level dedupe
	// matches them, and they are never adopted as component DOM.
	let firstNode = container.firstChild;
	while (firstNode !== null && isRendererHydrationStyle(firstNode)) {
		firstNode = firstNode.nextSibling;
	}
	const hydration = new HydrationCapability(rootBlock, firstNode, seeds);
	hydration.passthroughRanges =
		(
			body as ComponentBody & {
				[HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner';
			}
		)[HYDRATION_RANGE_BOUNDARY] === 'passthrough';
	const previousHydration = currentHydration;
	currentHydration = hydration;
	try {
		renderBlock(rootBlock);
		drainHydrationRenderPhaseUpdates(rootBlock);
		// Empty server Activity ranges deliberately had no body to adopt. Mount
		// those preserved client trees only after every server-rendered sibling has
		// consumed its useId/seed positions, with hydration suspended for the new DOM.
		if (hydration.deferredActivities.length !== 0) {
			hydration.suspend(() => {
				for (let i = 0; i < hydration.deferredActivities.length; i++)
					hydration.deferredActivities[i]();
			});
		}
		// Direct class bindings and spreads are separate client writers, while SSR
		// serializes only their final authored value. Resolve the last writer once so
		// a matching server class is adopted without warnings or transient mutations.
		hydration.flushClassWrites();
		// Text diagnostics are deferred until render-phase updates converge. The
		// final live value is compared with the original server value, so throwaway
		// render attempts cannot publish false hydration mismatches.
		hydration.flushTextWarnings();
		// A server root may contain a matching client prefix followed by stale
		// siblings. Adoption owns only the complete client shape; discard and report
		// anything left at the root cursor instead of leaving visible unmanaged DOM.
		hydration.finishRoot();
		hydrationCompleted = true;
	} catch (error) {
		// An OWNED hydrating root (a renderer-region bridge bound during this
		// pass — e.g. an octane/react island) mirrors createRoot's initial-render
		// contract: route the escape (error, suspension, or host context request)
		// to the owner, unmount the failed root, and release the container so a
		// host retry binds a FRESH root (§5 rule 9 — adoption is abandoned, the
		// retry client-remounts). Unowned hydration failures keep their existing
		// behavior and rethrow untouched.
		if (rendererRegionOwnerForBlock(rootBlock) === null) throw error;
		try {
			handleRenderError(rootBlock, error);
		} finally {
			DOM_ROOT_DISPOSERS.delete(rootBlock);
			unmountBlock(rootBlock, false);
			drainRefDetaches();
			container.textContent = '';
			// Mirror root.unmount()'s full release: this pass registered the
			// container as a delegation target, and the retry's fresh root
			// re-registers — a leftover refcount would strand the map entry and
			// its listeners past the island's final teardown.
			unregisterDelegationTarget(container);
			releaseRootContainer(container, ownerToken);
		}
		// Routed: hand back an empty lazy root owning NO claim or delegation
		// registration (both released above); the owner's retry recreates.
		return makeRoot(container, null, null, null, idState, renderReturnedValue, null);
	} finally {
		currentHydration = previousHydration;
	}
	if (hydrationCompleted && hydration.hasAdjacentRangePair) hydration.coalesce();
	// Commit effects on the next microtask flush (same as createRoot's first render).
	if (!syncFlush && !scheduled) {
		scheduled = true;
		queueMicrotask(flush);
	}
	// Hand the already-hydrated block + its body to the shared factory: from here
	// the root behaves exactly like a `createRoot` root — a `.render()` with the
	// same component updates props on the adopted DOM (same-body fast path), a
	// different component tears down and remounts.
	return makeRoot(container, rootBlock, body, rootKey, idState, renderReturnedValue, ownerToken);
}

// ---------------------------------------------------------------------------
// Resource hints — React DOM's preload / preinit / preconnect / prefetchDNS.
// Each call inserts one deduped <link>/<script> into document.head (client).
// Dedupe key = rel/kind + href, matching React's resource identity model.
// ---------------------------------------------------------------------------

const _resourceHints = new Set<string>();

function insertHeadHint(key: string, build: () => Element): void {
	if (typeof document === 'undefined' || _resourceHints.has(key)) return;
	// SSR dedupe: compare exact attribute VALUES rather than interpolating an
	// href-derived key into a CSS selector. Quotes/brackets are valid URL text;
	// treating them as selector syntax could throw before the hint is inserted.
	const existing = document.head.querySelectorAll('[data-oct-hint]');
	for (let i = 0; i < existing.length; i++) {
		if (existing[i].getAttribute('data-oct-hint') === key) {
			_resourceHints.add(key);
			return;
		}
	}
	const el = build();
	el.setAttribute('data-oct-hint', key);
	document.head.appendChild(el);
	// Publish dedupe state only after every DOM operation succeeds, so a failed
	// build/append cannot poison the key and suppress a later valid retry.
	_resourceHints.add(key);
}

function applyHintAttrs(el: Element, opts: Record<string, unknown> | undefined): void {
	if (opts == null) return;
	for (const k in opts) {
		const v = (opts as any)[k];
		if (v == null || v === false) continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		const value = v === true ? '' : String(v);
		el.setAttribute(name, sanitizeURLAttribute(el.localName, name, value));
	}
}

/** React DOM `preload(href, {as, …})` — `<link rel="preload">`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	if (!href || !options?.as) return;
	const rawHref = typeof href === 'string' ? href : String(href);
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('preload:' + options.as + ':' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'preload';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `preinit(href, {as: 'style'|'script', …})` — executes/applies the resource. */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	if (!href || !options?.as) return;
	const as = options.as;
	const rawHref = typeof href === 'string' ? href : String(href);
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('preinit:' + as + ':' + rawHref, () => {
		if (as === 'style') {
			const l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = safeHref;
			applyHintAttrs(l, { ...options, as: undefined });
			return l;
		}
		const s = document.createElement('script');
		(s as HTMLScriptElement).src = safeHref;
		(s as HTMLScriptElement).async = true;
		applyHintAttrs(s, { ...options, as: undefined });
		return s;
	});
}

/** React DOM `preconnect(href, {crossOrigin?})` — `<link rel="preconnect">`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	if (!href) return;
	const rawHref = typeof href === 'string' ? href : String(href);
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('preconnect:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'preconnect';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `prefetchDNS(href)` — `<link rel="dns-prefetch">`. */
export function prefetchDNS(href: string): void {
	if (!href) return;
	const rawHref = typeof href === 'string' ? href : String(href);
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('dns-prefetch:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'dns-prefetch';
		l.href = safeHref;
		return l;
	});
}
