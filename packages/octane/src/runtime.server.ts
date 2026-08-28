/**
 * octane server runtime (SSR).
 *
 * The `octane/compiler` compiler, in `mode: 'server'`, emits component bodies
 * that build an HTML STRING (instead of cloning a DOM template) by calling the
 * `ssr*` helpers here, and that call these server hook implementations. The
 * server analogues of `createRoot().render()` are `renderToString` /
 * `renderToStaticMarkup` (`octane/server`) and `prerender` (`octane/static`),
 * each returning `{ html, css }` (hoisted head folded into `html`).
 *
 * Scope: static markup, dynamic text holes, attributes (incl. class / style /
 * spread), control flow (@if/@for/@switch/@try), nested components, scoped CSS
 * collection, Suspense, and the leaf hooks (state renders its initial value —
 * re-invoking the body for render-phase dispatches until it settles, as React's
 * server renderer does — effects no-op, memo runs once, ids are deterministic).
 * Every dynamic site is
 * wrapped in the hydration markers (`constants.ts`) the client `hydrateRoot`
 * cursor adopts. Events and refs are dropped (no DOM on the server); Fragment
 * refs retain their range markers only when producing hydratable output.
 */

// ---------------------------------------------------------------------------
// Per-render ambient state. A render is synchronous and single-threaded, so a
// module-global "current scope" (mirroring the client's CURRENT_SCOPE) is safe.
// ---------------------------------------------------------------------------

import {
	BLOCK_OPEN,
	BLOCK_CLOSE,
	FOR_BLOCK_OPEN_EMPTY,
	FOR_BLOCK_OPEN_ITEMS,
	EMPTY_COMMENT,
	SUSPENSE_SCRIPT_ATTR,
	SUSPENSE_SEED_WIRE_PREFIX,
	REJECTION_SENTINEL_KEY,
	EXTERNAL_HYDRATION_PROMISE,
	HYDRATION_RANGE_BOUNDARY,
	HYDRATE_STATIC_ID_COUNT_PREFIX,
	HYDRATE_STATIC_END,
	HYDRATE_ID_ATTR,
	HYDRATE_WHEN_ATTR,
	HYDRATE_ID_COUNT_ATTR,
	HYDRATE_STREAM_TOKEN_ATTR,
	HYDRATE_SEED_ATTR,
	STREAM_BOUNDARY_ATTR,
	STREAM_SEGMENT_ATTR,
	STREAM_SEED_ATTR,
	STREAM_SCRIPT_ATTR,
	STREAM_SEED_COMMENT,
	STREAM_RESOURCE_ATTR,
	POSITIVE_NUMERIC_ATTR_PROPS,
	BOOLEAN_ATTR_PROPS,
	MUST_USE_PROPERTY_PROPS,
	VALID_ATTR_NAME,
	isEnumeratedBooleanAttr,
	cssStyleValue,
	ATTRIBUTE_ALIASES,
	SVG_ONLY_TAGS,
	// No end tag, no children — `ssrChild` descriptor serialization matches the
	// static-markup emission of `ssrEmitElement`.
	VOID_ELEMENTS,
} from './constants.js';
import { hasOwnProp } from './has-own.js';
import { headOwnershipSuffix } from './head-ownership.js';
import { resourceHintWarning } from './resource-hint-diagnostics.js';
import {
	ariaAttributeWarning,
	isAriaAttributeName,
	isUnknownAriaAttribute,
	unknownAriaAttributeWarning,
} from './aria-diagnostics.js';
import {
	booleanAttributeStringWarning,
	emptyResourceUrlWarning,
	hostPropertyWarning,
	invalidHostPropertiesWarning,
	unsupportedAttributeCoercionWarning,
} from './host-property-diagnostics.js';
import type { HydrateProps, HydrationStrategy } from './hydration/types.js';
import {
	applyElementDefaultProps,
	childElementKey,
	childrenIterator,
	escapeMappedElementKey,
	resolveLazyDefaultProps as lazyResolvedProps,
} from './shared-value-helpers.js';

// Shared client/SSR CSS helpers (single source in css.ts so class strings and
// hyphenated style keys stay byte-equal across the two runtimes).
import { devWarnStyleCoercion, devWarnStyleProperty, normalizeClass, styleName } from './css.js';
import {
	invalidHtmlNestingWithAncestor,
	invalidHtmlNestingWithParent,
	invalidHtmlTextNesting,
} from './html-tree-validation.js';
import { sanitizeURL, sanitizeURLAttribute } from './sanitize-url.js';
import {
	COMPONENT_FLAG_BOUNDARY,
	hasComponentFlags,
	markComponentFlags,
} from './component-flags.js';
import { formatServerError } from './error-codes.server.generated.js';
import { formAuthoringDiagnostics } from './form-diagnostics.js';
import { isRendererContext, registerServerRendererContextProvider } from './renderer-bridge.js';
import {
	validateNativeReadWitness,
	type NativeReadWitness,
} from './signals/native-read-collector.js';
import { createNativeServerReadDriver } from './signals/native-read-server.js';
import {
	NATIVE_SIGNAL_SEED_ATTR,
	NATIVE_SIGNAL_FRESH_COMMENT,
	mergeNativeSeedReads,
	type NativeSeedReads,
	type NativeSignalManifest,
} from './signals/native-read-seeds.js';
export { EXTERNAL_HYDRATION_PROMISE, HYDRATION_RANGE_BOUNDARY, normalizeClass };
export { validateNativeReadWitness };
export type { NativeSignalManifest };

const NATIVE_ARRAY_MAP = Array.prototype.map;
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_ARRAY_SPECIES_GETTER = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;

/** Server twin of the compiler's guarded native-array map ABI. */
export function mapSlot(receiver: any, method: any, callback?: (...args: any[]) => any): any {
	if (arguments.length === 3) {
		let mapped = NATIVE_REFLECT_APPLY(method, receiver, [callback]);
		if (Array.isArray(mapped)) {
			let packed: any[] | null = null;
			for (let index = 0; index < mapped.length; index++) {
				if (!(index in mapped)) {
					packed = [];
					break;
				}
			}
			if (packed !== null) {
				for (let index = 0; index < mapped.length; index++) {
					if (index in mapped) packed.push(mapped[index]);
				}
				mapped = packed;
			}
		}
		return mapped;
	}
	if (
		!Array.isArray(receiver) ||
		Object.getPrototypeOf(receiver) !== Array.prototype ||
		method !== NATIVE_ARRAY_MAP ||
		hasOwnProp.call(receiver, 'constructor') ||
		Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value !== Array ||
		Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== NATIVE_ARRAY_SPECIES_GETTER
	) {
		return false;
	}
	for (let index = 0; index < receiver.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(receiver, index);
		if (descriptor === undefined || descriptor.get !== undefined) return false;
	}
	return true;
}

interface SSRScope {
	parent: SSRScope | null;
	/** Context Provider values stamped on this scope (lazily allocated). */
	$$ctxValues: Map<unknown, unknown> | null;
}

type ParserNamespace = 'html' | 'svg' | 'mathml';
type AttributeNamespace = ParserNamespace | 'opaque';

// Public string descriptors are HTML-ASCII-case-insensitive. Keep foreign
// namespace inference on the same contract even though the shared table stores
// SVG's canonical mixed-case spellings (for example foreignObject/clipPath).
const SVG_ONLY_LOWERCASE_TAGS = /* @__PURE__ */ new Set(
	/* @__PURE__ */ Array.from(SVG_ONLY_TAGS, (tag) => tag.toLowerCase()),
);

interface SsrElementContext {
	tag: string;
	parent: SsrElementContext | null;
	namespace: ParserNamespace;
	childrenNamespace: ParserNamespace;
	location?: string;
}

type ServerComponent = (props: any, scope: SSRScope, extra?: any) => string;

/**
 * What the public render entries accept. In a split client/server build the
 * SAME module import is typed by the client-shaped virtual TSX (a unary
 * `(props) => Octane.JSX.Element`-ish function), while the server bundle
 * actually receives the server-compiled twin — so the entries accept the
 * authored component type and trust the build for the server shape.
 */
export type ServerEntryComponent = ServerComponent | ((props: any) => unknown);

let CURRENT_SCOPE: SSRScope | null = null;
// Server helpers use the same synchronous read/witness ABI without importing
// the client renderer or attaching a subscription to any shared producer.
let NATIVE_READ_COLLECTOR: ReturnType<typeof createNativeServerReadDriver> | null = null;
let NATIVE_SERVER_PASS = -1;
let NATIVE_SERVER_READS: NativeSeedReads | null = null;
let NATIVE_SERVER_FAILURES = 0;
let NATIVE_LOCAL_HOOK_DISPOSES: Array<() => void> | null = null;

/** @internal Enable invocation collection before an opted-in module renders. */
export function enableNativeReadCollection(abi = 1): void {
	if (abi !== 1) throw new Error(formatServerError(58));
	ensureNativeServerReadCollector();
}

/** @internal Compiler/runtime native-read capability version 1. */
export function beginNativeReadScope(scope: SSRScope | undefined, abi = 1): number {
	if (abi !== 1) throw new Error(formatServerError(58));
	const owner = scope ?? CURRENT_SCOPE;
	if (owner === null) return -1;
	ensureNativeServerReadCollector();
	return beginActiveNativeReadScope(owner);
}

// Internal invocation scopes must not retain the collector factory in ordinary
// server entries. Late activation still needs the same pass/detached handling.
function beginActiveNativeReadScope(owner: SSRScope): number {
	const collector = NATIVE_READ_COLLECTOR!;
	if (NATIVE_SERVER_PASS < 0 && !collector.isDetached()) NATIVE_SERVER_PASS = collector.beginPass();
	return collector.beginScope(owner);
}

function ensureNativeServerReadCollector() {
	return (NATIVE_READ_COLLECTOR ??= createNativeServerReadDriver(
		(reads) => {
			NATIVE_SERVER_READS = mergeNativeSeedReads(NATIVE_SERVER_READS, reads);
		},
		() => {
			NATIVE_SERVER_FAILURES++;
		},
	));
}

function finishNativeSeedCapture(
	token: number,
	previous: NativeSeedReads | null,
	merge: boolean,
): NativeSeedReads | null {
	if (token >= 0) return NATIVE_READ_COLLECTOR!.finishCapture(token, merge);
	// The first native component may install its collector inside an otherwise
	// ordinary boundary. Before installation no enclosing native scope exists,
	// so the existing pass-local collection is the capture in that case.
	const reads = NATIVE_SERVER_READS;
	NATIVE_SERVER_READS = previous;
	if (merge && reads !== null) NATIVE_SERVER_READS = NATIVE_READ_COLLECTOR!.merge(previous, reads);
	return reads;
}

function appendNativeSeedReads(reads: NativeSeedReads | null): void {
	if (reads !== null) NATIVE_READ_COLLECTOR!.append(reads);
}

/** @internal Native read context never survives an asynchronous server gap. */
export function endNativeReadScope(token: number, completed: boolean): void {
	if (token >= 0) NATIVE_READ_COLLECTOR!.endScope(token, completed);
}

/** @internal Shared automatic-cache witness ABI. */
export function beginNativeReadWitness(detached = false): number {
	return detached
		? ensureNativeServerReadCollector().beginWitness(true)
		: (NATIVE_READ_COLLECTOR?.beginWitness() ?? -1);
}

/** @internal Shared automatic-cache witness ABI. */
export function finishNativeReadWitness(
	token: number,
	completed: boolean,
): NativeReadWitness | null {
	return token < 0 ? null : NATIVE_READ_COLLECTOR!.finishWitness(token, completed);
}

/** @internal Shared automatic-cache witness ABI. */
export function replayNativeReadWitness(witness: NativeReadWitness | null | undefined): void {
	NATIVE_READ_COLLECTOR?.replay(witness);
}
// Empty compiler batches register child-only warm plans for the synchronous
// component call stack. A pending descendant batch activates the live plans;
// invokeComponentBody checkpoints keep nested renders and retries isolated.
const ACTIVE_PU_WARM_PLANS: Array<() => void> = [];
let CURRENT_PU_WARM_CLAIMS: Set<object> | null = null;
let ID_COUNTER = 0;
let ID_PREFIX = '';
interface InjectedStyle {
	css: string;
	nonce?: string;
}
let CSS: Map<string, InjectedStyle> | null = null;
// Pre-escaped ` nonce="..."` fragment for renderer-owned inline tags emitted
// during the active pass. Saved/restored with every other ambient so nested or
// concurrent server renders cannot leak a CSP nonce across requests.
let NONCE_ATTR = '';
// Emit hydration block markers (`<!--[-->…<!--]-->`) and head-adoption markers?
// True for hydratable output (renderToString / prerender / streaming); flipped
// false for the whole of a `renderToStaticMarkup` render, which produces clean,
// non-hydratable HTML (emails / static pages). It is part of the ambient pass
// snapshot so a nested hydratable render cannot inherit a static outer pass.
let MARKERS = true;
// Exact wrapper-free permanent-static Hydrate children are server-owned. Any
// ordinary Hydrate reached beneath them keeps its layout wrapper and SSR try
// shape, but publishes a never marker so pre-root interaction capture cannot
// enqueue work whose client component graph was erased.
let PERMANENT_STATIC_HYDRATE_DEPTH = 0;
// Accumulates hoisted `<head>` content (`<title>`/`<meta>`/`<link>`) during the
// active render pass (a mutable container, mirroring CSS's mutable Map, so a
// per-pass local capture keeps accumulating via `HEAD.html +=` even though
// strings are immutable). Folded into the result `html` by `spliceHead` (into
// `<head>` when present, else prepended).
interface HeadBuffer {
	html: string;
	/**
	 * Priority hoistables, folded ahead of everything else (React Fizz parity:
	 * ReactDOMFloat-test.js:9085). `<meta charset>` must land in the first 1024
	 * bytes for parsers to honor it without restarting; viewport affects first
	 * layout. Charset precedes viewport regardless of discovery order; each
	 * bucket keeps its own discovery order.
	 */
	charset: string;
	viewport: string;
	/** Resource-hint + Float-resource dedupe keys emitted during this pass. */
	hints: Set<string>;
	/**
	 * React Float sheet-family resources (stylesheet links + style resources),
	 * one entry per resource: href identity → its precedence and rendered tag.
	 * Map insertion order IS emit order, so the precedence groups fold in
	 * first-encounter group order at capture time, and the streaming renderer
	 * can diff INDIVIDUAL resources across waves to ship late discoveries.
	 * Null until the first sheet resource so ordinary passes pay nothing.
	 */
	sheets: Map<string, { precedence: string; html: string }> | null;
	/**
	 * Hint tags keyed for COALESCING: a preinit deletes the now-redundant
	 * preload entry before the fold (React folds preload → initialized
	 * resource on the server). Null until the first hint.
	 */
	hintHtml: Map<string, string> | null;
	/** Preload-seeded connection/integrity options for the matching preinit. */
	preloadXfer: Map<string, Record<string, unknown>> | null;
	/** Precomputed caller root namespace, unaffected by streamed useId subspaces. */
	rootSuffix: string;
}

/** Fold order: charset, viewport, hoisted head elements, hints, grouped stylesheets. */
function headHtmlWithSheets(buf: HeadBuffer): string {
	let out = buf.charset + buf.viewport + buf.html;
	if (buf.hintHtml !== null) for (const tag of buf.hintHtml.values()) out += tag;
	if (buf.sheets !== null && buf.sheets.size > 0) {
		// Group by precedence in first-encounter group order: the per-resource map
		// keeps emit order, so the first resource of each precedence opens its group.
		const groups = new Map<string, string>();
		for (const entry of buf.sheets.values())
			groups.set(entry.precedence, (groups.get(entry.precedence) ?? '') + entry.html);
		for (const group of groups.values()) out += group;
	}
	return out;
}
let HEAD: HeadBuffer | null = null;

// Depth of pending-arm (fallback) rendering. Hoistables authored inside a
// fallback are transient — the fallback is discarded at reveal, but a streamed
// head line is permanent — so ssrHeadEl suppresses while this is non-zero.
// Suppression is TRANSITIVE (React parity: ReactDOMFloat-test.js:5431): a
// completed boundary nested inside a fallback is still fallback territory, so
// nested content arms never reset the depth. Balanced by withPendingArm's
// finally; re-zeroed with each render's HEAD for crash hygiene.
let FALLBACK_HOIST_DEPTH = 0;

// Suspense (SSR Phase 4). A render pass that reaches an unresolved `use(thenable)`
// records the thenable in SUSPENDED and throws SSR_SUSPENSE; the nearest @try
// renders its @pending fallback. render()'s loop awaits everything in SUSPENDED,
// caches each outcome in RESOLVED (keyed by the FRAME path + compiler-injected
// call-site key + per-frame occurrence index), then re-renders — a later pass'
// use() finds the cached value and returns it, so the @try renders its success
// arm (or, on rejection, routes the error to @catch). SERIAL collects the
// resolved values in render (depth-first) order so the client can seed them back
// in the same order during hydration.
//
// A waterfall (each level's use() only reachable after the previous resolves)
// would otherwise cost D+1 FULL-tree passes — O(tree × D), re-serializing all
// the static bulk on every pass. Instead, when a component's use() suspends we
// record a DISCOVERY JOB { comp, props, parentScope, frame }: the innermost
// COMPONENT enclosing that use(). Between the (few) canonical full passes,
// render() re-runs just those job SUBTREES — discarding their output, only
// populating RESOLVED — so a deep waterfall becomes ~2 full passes + D cheap
// subtree re-runs instead of D+1 full passes. The emitted HTML/head/css/seeds
// always come from a normal FULL pass (never spliced), so useId, the seed
// cursor order, and head ordering are byte-identical to the retry-loop design.
//
// use() keys are scoped to the current FRAME (one per component; inline
// @if/@for/@switch stay in their component's frame) so a key is identical
// between the pass a boundary first renders, its discovery re-run, and the final
// full pass — and disjoint across component membranes, so resolved data can't
// cross between two use() sites. Keys are internal only (the client seeds by
// cursor, not by key).
//
// All of these are reinstalled fresh at the top of every pass / discovery round
// (see render()) so concurrent render() calls that interleave across an `await`
// cannot clobber one another.
interface Frame {
	parent: Frame | null;
	// This frame's index among its parent's component children (built into the
	// path); reproduced verbatim on a discovery re-run so keys stay stable.
	seg: number;
	// Monotonic counter handing the NEXT child component its `seg`.
	nextChild: number;
	// Arm/list-local child counters. The same component position can be visited
	// in multiple mutually-exclusive scopes during SSR retries; each scope must
	// retain its own ordinal just as the client retains a separate Block tree.
	scopedChildren: Map<string, number> | null;
	// Per-site use() occurrence counter (a use() in an inline @for hits the same
	// site N times → distinct keys). Lazily allocated (never for a use()-free
	// component, i.e. the common case).
	occ: Map<string, number> | null;
	// Memoized materialized path ('/seg/seg…'); segs are immutable so it's stable.
	path: string | null;
	// Whether this component already registered a discovery job this pass (dedupe
	// two sibling suspending use()s in one component to a single job).
	deferred: boolean;
	// Async control-arm scope active where this component instance was entered.
	// Discovery re-runs restore it before replaying the component so identical
	// child positions in @try content/pending/catch arms never share cache keys.
	asyncScope: string;
	/** Parser context supplied by, or inherited through, the component call site. */
	namespace?: 'html' | 'svg' | 'mathml';
}
interface Job {
	comp: ServerComponent;
	props: any;
	parentScope: SSRScope | null;
	frame: Frame;
}
let SUSPENDED: { promise: PromiseLike<unknown>; key: string }[] | null = null;
let RESOLVED: ResolvedMap | null = null;
let SERIAL: unknown[] | null = null;
// The active component frame (see Frame). Never null during a render pass —
// render() installs a root frame before invoking the component.
let FRAME: Frame | null = null;
// Discovery jobs surfaced THIS pass/round (innermost suspending components).
let DEFERRED: Job[] | null = null;
// The innermost component currently rendering, so a suspending use() can capture
// it as a discovery job. Set by renderComponentFramed (and by render() for the
// root, whose bare use() has no enclosing sub-component).
let CURRENT_COMP: ServerComponent | null = null;
let CURRENT_PROPS: any = null;
let CURRENT_PARENT_SCOPE: SSRScope | null = null;
// Stable identity of the active async control-flow arm. Component frame paths
// alone cannot distinguish a child rendered at the same position in an @try's
// content and pending arms, even though those are separate client block scopes.
let ASYNC_SCOPE = '';
// DEV SSR HTML-parser context. Compiler-emitted ssrElement wrappers keep native
// elements on this stack while their children execute, including through
// component calls. The warning set is render-local and shared by canonical
// retries, so one authored relationship reports once without leaking between
// requests. Discovery passes leave it null because their output is discarded.
let CURRENT_SSR_ELEMENT: SsrElementContext | null = null;
// null = validation disabled (outside a canonical render / discovery pass),
// undefined = enabled but no warning set allocated yet.
let SSR_NESTING_WARNINGS: Set<string> | null | undefined = null;
// React's shared unknown-property cache lives for the lifetime of its module.
// Match that prop-name de-duplication across independent SSR calls. Lazily
// allocated from DEV-only branches, so optimized server bundles erase it.
let DEV_SSR_ATTRIBUTE_WARNINGS: Set<string> | null = null;
let DEV_SSR_CUSTOM_HOST_DEPTH = 0;

// Walk a frame to its dotted path ('' for the root). Memoized per frame.
function framePath(f: Frame): string {
	if (f.path !== null) return f.path;
	const p = f.parent === null ? '' : framePath(f.parent) + '/' + f.seg;
	f.path = p;
	return p;
}

function asyncFramePath(frame: Frame | null): string {
	return (frame === null ? '' : framePath(frame)) + ASYNC_SCOPE;
}

function nextFrameOccurrence(frame: Frame, base: string): number {
	if (frame.occ === null) frame.occ = new Map();
	const scopedBase = ASYNC_SCOPE === frame.asyncScope ? base : ASYNC_SCOPE + '\0' + base;
	const next = frame.occ.get(scopedBase) ?? 0;
	frame.occ.set(scopedBase, next + 1);
	return next;
}

function nextChildSegment(frame: Frame): number {
	if (ASYNC_SCOPE === frame.asyncScope) return frame.nextChild++;
	if (frame.scopedChildren === null) frame.scopedChildren = new Map();
	const next = frame.scopedChildren.get(ASYNC_SCOPE) ?? 0;
	frame.scopedChildren.set(ASYNC_SCOPE, next + 1);
	return next;
}

function ssrScope(parent: SSRScope | null): SSRScope {
	return { parent, $$ctxValues: null };
}

function parserNamespacesForTag(
	tag: string,
	inherited: ParserNamespace,
): { namespace: ParserNamespace; childrenNamespace: ParserNamespace } {
	const semanticTag = tag.toLowerCase();
	const namespace: ParserNamespace =
		semanticTag === 'svg'
			? 'svg'
			: semanticTag === 'math'
				? 'mathml'
				: inherited === 'html' && SVG_ONLY_LOWERCASE_TAGS.has(semanticTag)
					? 'svg'
					: inherited;
	const childrenNamespace: ParserNamespace =
		semanticTag === 'foreignobject'
			? 'html'
			: semanticTag === 'svg'
				? 'svg'
				: semanticTag === 'math'
					? 'mathml'
					: inherited === 'html' && SVG_ONLY_LOWERCASE_TAGS.has(semanticTag)
						? 'svg'
						: inherited;
	return { namespace, childrenNamespace };
}

function ssrElementNamespaces(
	tag: string,
	parent: SsrElementContext | null,
): { namespace: ParserNamespace; childrenNamespace: ParserNamespace } {
	return parserNamespacesForTag(tag, parent?.childrenNamespace ?? FRAME?.namespace ?? 'html');
}

function reportInvalidHtmlNesting(message: string): void {
	const warning =
		'Octane SSR invalid HTML nesting: ' +
		message +
		'\n\nThe browser will repair this HTML before hydration. This can shift content and cause a hydration mismatch.';
	let seen = SSR_NESTING_WARNINGS;
	if (seen === null) return;
	if (seen === undefined) {
		seen = new Set();
		SSR_NESTING_WARNINGS = seen;
		if (RESOLVED !== null) RESOLVED.nestingWarnings = seen;
	}
	if (seen.has(warning)) return;
	seen.add(warning);
	console.error(warning);
}

/** Scope one native element, optionally forcing its DOM/parser namespace. */
function withSsrElementContext(
	tag: string,
	location: string | undefined,
	render: () => string,
	forcedNamespace?: ParserNamespace,
	htmlIntegrationPoint?: boolean,
): string {
	const parent = CURRENT_SSR_ELEMENT;
	const { namespace, childrenNamespace: inheritedChildrenNamespace } =
		forcedNamespace === undefined
			? ssrElementNamespaces(tag, parent)
			: { namespace: forcedNamespace, childrenNamespace: forcedNamespace };
	const childrenNamespace = htmlIntegrationPoint === true ? 'html' : inheritedChildrenNamespace;
	const semanticTag = tag.toLowerCase();
	const element: SsrElementContext = {
		tag: semanticTag,
		parent,
		namespace,
		childrenNamespace,
		location,
	};

	// Foreign-content parsing is independent of the HTML repair rules. Stop at
	// that boundary; <foreignObject> children naturally start a fresh HTML chain.
	if (
		process.env.NODE_ENV !== 'production' &&
		SSR_NESTING_WARNINGS !== null &&
		namespace === 'html' &&
		parent?.namespace === 'html'
	) {
		const parentMessage = invalidHtmlNestingWithParent(
			semanticTag,
			parent.tag,
			location,
			parent.location,
		);
		if (parentMessage !== null) reportInvalidHtmlNesting(parentMessage);

		let ancestor = parent.parent;
		const ancestors = [parent.tag];
		while (ancestor !== null && ancestor.namespace === 'html') {
			ancestors.push(ancestor.tag);
			const ancestorMessage = invalidHtmlNestingWithAncestor(
				semanticTag,
				ancestors,
				location,
				ancestor.location,
			);
			if (ancestorMessage !== null) reportInvalidHtmlNesting(ancestorMessage);
			ancestor = ancestor.parent;
		}
	}

	CURRENT_SSR_ELEMENT = element;
	try {
		return render();
	} finally {
		CURRENT_SSR_ELEMENT = parent;
	}
}

/** Compiler ABI: validate and scope one native element during a DEV SSR render. */
export function ssrElement(
	tag: string,
	location: string | undefined,
	render: () => string,
	htmlIntegrationPoint?: boolean,
): string {
	if (process.env.NODE_ENV === 'production' || SSR_NESTING_WARNINGS === null) return render();
	return withSsrElementContext(tag, location, render, undefined, htmlIntegrationPoint);
}

/** Compiler ABI: validate one authored static or dynamic text child in DEV SSR. */
export function ssrNestingText(value: unknown): string {
	const text = ssrText(value);
	if (process.env.NODE_ENV !== 'production' && text !== '') {
		const parent = CURRENT_SSR_ELEMENT;
		if (parent !== null && parent.namespace === 'html' && SSR_NESTING_WARNINGS !== null) {
			const message = invalidHtmlTextNesting(text, parent.tag, parent.location);
			if (message !== null) reportInvalidHtmlNesting(message);
		}
	}
	return text;
}

const NOOP = (): void => {};

// Matches the client runtime's `ELEMENT_TAG` (createElement descriptor marker)
// so `ssrChild` can render a `<Comp/>`-as-value descriptor server-side too.
const ELEMENT_TAG = Symbol.for('octane.element');
// Matches the client runtime's `PORTAL_TAG` (createPortal descriptor marker) so
// a portal flowing through props/children to `ssrChild` leaves its site anchor
// instead of tripping the plain-object child throw.
const PORTAL_TAG = Symbol.for('octane.portal');

/**
 * React-compatible Fragment sentinel. Value-position `<Fragment>` sites compile
 * to ordinary element descriptors in both modes; ssrChild recognizes this type
 * and flattens its children with the same wrapper/key rules as the client.
 */
export const Fragment: unique symbol = Symbol.for('octane.Fragment');

/**
 * React-19 `<Activity>` sentinel. Direct template sites lower to `ssrActivity`;
 * generic component and descriptor sites dispatch by this same symbol identity.
 * Its public type is component-shaped so aliases and JSX values type-check.
 */
export const Activity = Symbol.for('octane.Activity') as unknown as (props: {
	mode?: 'visible' | 'hidden';
	children?: unknown;
	name?: string;
	key?: string | number | bigint | null | undefined;
}) => unknown;

interface ElementDescriptor {
	$$kind: typeof ELEMENT_TAG;
	// A server ComponentBody (component-value form, e.g. `{<Comp/>}`) OR a host tag
	// string (`'li'`), produced when host JSX appears at a VALUE position (a
	// `.map(...)` callback, a render-prop arrow body, an array literal).
	type: ServerEntryComponent | string | typeof Fragment | typeof Activity;
	props: any;
	// React-style `key`, lifted out of props (consulted by the client's de-opt list
	// path on hydration; the server only renders it into markup).
	key: any;
	// React 19 ref-as-prop plus the deprecated element-level alias.
	ref: any;
	// `createElement(type, props, ...children)` children for the host form; `null`
	// for the component-value form (children flow through the component's props).
	children: any;
}

// Scoped descriptors keep their ordinary public shape while deferring child
// evaluation. The component serializer must pass these props through intact:
// spreading them would invoke the child accessor before entering the component.
const SCOPED_ELEMENT_PROPS = new WeakSet<object>();

function hasElementConfigKey(config: any): boolean {
	if (config == null || (typeof config !== 'object' && typeof config !== 'function')) return false;
	// React's development-only props.key warning getter is not a real key, and
	// must not be INVOKED (calling it emits React's warning). The reflective probe
	// allocates a descriptor object, so reach it only when a `key` is actually
	// present — the common no-key call now costs one lookup. Deliberately NOT
	// gated on the build mode the way the client twin is: an SSR bundle does not
	// always fold the dev-mode env check away, and reading it per call would cost
	// more than the allocation it saves.
	if (hasOwnProp.call(config, 'key')) {
		const own = Object.getOwnPropertyDescriptor(config, 'key');
		if (own?.get != null && (own.get as any).isReactWarning) return false;
	}
	return config.key !== undefined;
}

function copyElementConfig(config: any): any {
	const props: any = {};
	if (config == null) return props;
	for (const name in config) {
		if (name !== 'key' && hasOwnProp.call(config, name)) {
			props[name] = config[name];
		}
	}
	return props;
}

function finalizeElementDescriptor(descriptor: ElementDescriptor): ElementDescriptor {
	if (process.env.NODE_ENV !== 'production') {
		Object.freeze(descriptor.props);
		Object.freeze(descriptor);
	}
	return descriptor;
}

function createNativeServerScopedResolver<T>(read: () => T): () => T {
	let resolved = false;
	let resolvedScope: SSRScope | null = null;
	let resolvedWitness: NativeReadWitness | null | undefined;
	let resolvedValue: T;
	return (): T => {
		const scope = CURRENT_SCOPE;
		const token = beginNativeReadScope(undefined);
		let completed = false;
		try {
			if (
				!resolved ||
				resolvedScope !== scope ||
				(token >= 0 && resolvedWitness === undefined) ||
				!validateNativeReadWitness(resolvedWitness)
			) {
				const witnessToken = beginNativeReadWitness();
				let readCompleted = false;
				let next: T;
				let nextWitness: NativeReadWitness | null;
				try {
					next = read();
					readCompleted = true;
				} finally {
					nextWitness = finishNativeReadWitness(witnessToken, readCompleted);
				}
				resolvedScope = scope;
				resolvedWitness = token < 0 ? undefined : nextWitness;
				resolvedValue = next;
				resolved = true;
			} else if (token >= 0) {
				replayNativeReadWitness(resolvedWitness);
			}
			completed = true;
			return resolvedValue;
		} finally {
			endNativeReadScope(token, completed);
		}
	};
}

/** Server twin of the compiler-only complete JSX-record deferral helper. */
export function createScopedValue(readElement: () => ElementDescriptor): ElementDescriptor {
	let resolved: ElementDescriptor | undefined;
	let resolvedScope: SSRScope | null = null;

	const resolve = (): ElementDescriptor => {
		const scope = CURRENT_SCOPE;
		if (resolved === undefined || resolvedScope !== scope) {
			const next = readElement();
			resolvedScope = scope;
			resolved = next;
		}
		return resolved;
	};
	return scopedValueDescriptor(resolve);
}

/** @internal Native complete-record deferral with request-local evidence. */
export function nativeCreateScopedValue(readElement: () => ElementDescriptor): ElementDescriptor {
	return scopedValueDescriptor(createNativeServerScopedResolver(readElement));
}

function scopedValueDescriptor(resolve: () => ElementDescriptor): ElementDescriptor {
	const descriptor: ElementDescriptor = {
		$$kind: ELEMENT_TAG,
		get type() {
			return resolve().type;
		},
		get props() {
			return resolve().props;
		},
		get key() {
			return resolve().key;
		},
		get ref() {
			return resolve().ref;
		},
		get children() {
			return resolve().children;
		},
	};
	if (process.env.NODE_ENV !== 'production') Object.freeze(descriptor);
	return descriptor;
}

/** Server twin of the compiler-only scope-preserving JSX descriptor factory. */
export function createScopedElement(
	type: ServerEntryComponent | string | typeof Fragment | typeof Activity,
	props: any,
	readChildren: () => unknown,
): ElementDescriptor {
	const src = (props ?? null) as any;
	const key = hasElementConfigKey(src) ? '' + src.key : null;
	const copiedProps = copyElementConfig(src);
	applyElementDefaultProps(type, copiedProps);

	let resolved = false;
	let resolvedScope: SSRScope | null = null;
	let resolvedChildren: unknown;
	const children = (): unknown => {
		const scope = CURRENT_SCOPE;
		if (!resolved || resolvedScope !== scope) {
			const nextChildren = readChildren();
			resolvedScope = scope;
			resolvedChildren = nextChildren;
			resolved = true;
		}
		return resolvedChildren;
	};
	return scopedElementDescriptor(type, copiedProps, key, children);
}

/** @internal Native child deferral with evidence on every resolving scope. */
export function nativeCreateScopedElement(
	type: ServerEntryComponent | string | typeof Fragment | typeof Activity,
	props: any,
	readChildren: () => unknown,
): ElementDescriptor {
	const src = (props ?? null) as any;
	const key = hasElementConfigKey(src) ? '' + src.key : null;
	const copiedProps = copyElementConfig(src);
	applyElementDefaultProps(type, copiedProps);
	return scopedElementDescriptor(
		type,
		copiedProps,
		key,
		createNativeServerScopedResolver(readChildren),
	);
}

function scopedElementDescriptor(
	type: ServerEntryComponent | string | typeof Fragment | typeof Activity,
	copiedProps: any,
	key: string | null,
	children: () => unknown,
): ElementDescriptor {
	const childProperty = { configurable: true, enumerable: true, get: children };
	Object.defineProperty(copiedProps, 'children', childProperty);
	SCOPED_ELEMENT_PROPS.add(copiedProps);
	const descriptor: ElementDescriptor = {
		$$kind: ELEMENT_TAG,
		type,
		props: copiedProps,
		key,
		ref: copiedProps.ref !== undefined ? copiedProps.ref : null,
		children: null,
	};
	Object.defineProperty(descriptor, 'children', childProperty);
	return finalizeElementDescriptor(descriptor);
}

// Server `createElement(type, props, ...children)` — produces the SAME descriptor
// shape as the client runtime's `createElement` (see runtime.ts). The compiler
// lowers VALUE-position JSX (a `.map` callback, a render-prop arrow body, an array
// literal) to this call in BOTH modes, so the same lowered call resolves to the
// client-or-server `createElement` per build, and `ssrChild` renders the result.
export function createElement(
	type: ServerEntryComponent | string | typeof Fragment | typeof Activity,
	props?: any,
	...children: any[]
): ElementDescriptor {
	if (typeof type === 'function' && isRendererContext(type)) {
		registerServerRendererContextProvider(renderServerContextProvider);
	}
	const src = (props ?? null) as any;
	const key = hasElementConfigKey(src) ? '' + src.key : null;
	let kids = children.length > 0 ? (children.length === 1 ? children[0] : children) : src?.children;
	if (children.length > 1) POSITIONAL_CHILDREN.add(children);
	if (children.length > 1 && process.env.NODE_ENV !== 'production') Object.freeze(children);
	// Lift `key` OUT of props (React semantics — key is never a real prop), and mirror
	// positional children into `props.children` for the same React element shape as the
	// client runtime. Positional children override an explicit `props.children`.
	const p = copyElementConfig(src);
	if (children.length > 0) p.children = kids;
	applyElementDefaultProps(type, p);
	kids = p.children;
	return finalizeElementDescriptor({
		$$kind: ELEMENT_TAG,
		type,
		props: p,
		key,
		ref: p.ref !== undefined ? p.ref : null,
		children: kids ?? null,
	});
}

// Multiple createElement children and compiler-lowered shorthand fragments are
// fixed positional siblings, not reorderable runtime arrays. Track their wrapper
// kind exactly like the client so nested array/Fragment identity paths remain
// stable across server retries and hydration.
const POSITIONAL_CHILDREN = new WeakSet<object>();

// Server half of the client runtime's `positionalChildren` (see runtime.ts).
export function positionalChildren(children: unknown[]): unknown[] {
	POSITIONAL_CHILDREN.add(children);
	return children;
}

function isElementDescriptor(v: any): v is ElementDescriptor {
	return v != null && v.$$kind === ELEMENT_TAG;
}

function isFragmentDescriptor(value: any): value is ElementDescriptor {
	return isElementDescriptor(value) && value.type === Fragment;
}

function fragmentDescriptorChildren(value: ElementDescriptor): any[] {
	const children = value.children;
	if (children == null) return [];
	return Array.isArray(children) ? children : [children];
}

/** Server counterpart of the client's cold ref-bearing Fragment wrapper. */
function fragmentRefDescriptor(value: ElementDescriptor): ElementDescriptor {
	return {
		$$kind: ELEMENT_TAG,
		type: renderFragmentRefDescriptor,
		props: value,
		key: value.key,
		ref: null,
		children: null,
	};
}

/** Retain the exact range adopted by the client without attaching its ref. */
function renderFragmentRefDescriptor(descriptor: ElementDescriptor, scope: SSRScope): string {
	return (
		ssrFragmentMarker(true, descriptor.ref) +
		ssrChild(descriptor.children, scope) +
		ssrFragmentMarker(false)
	);
}

type SsrDeoptWrapperKind = 'array' | 'fragment';

interface PreparedSsrDeoptList {
	items: any[];
	keys: any[];
}

function ssrDeoptWrapperKind(value: any[]): SsrDeoptWrapperKind {
	return POSITIONAL_CHILDREN.has(value as object) ? 'fragment' : 'array';
}

function ssrDeoptKey(item: any, index: number): any {
	return isElementDescriptor(item) && item.key != null ? item.key : index;
}

function scopedSsrDeoptKey(
	path: readonly (string | number)[],
	item: any,
	index: number,
	key: any,
): string {
	const explicit = isElementDescriptor(item) && item.key != null;
	return JSON.stringify([path, explicit ? 'key' : 'index', explicit ? String(key) : index]);
}

// Mirror the client runtime's flattenReactChildContainer exactly: array and
// Fragment wrappers disappear from the rendered leaf list, while their nesting,
// kind, and explicit keys remain encoded into each leaf identity. Markup then has
// one hydration range per leaf inside the owning child-slot range.
function flattenSsrChildContainer(
	outItems: any[],
	outKeys: any[],
	children: any[],
	kind: SsrDeoptWrapperKind,
	path: readonly (string | number)[],
): void {
	const count = children.length;
	for (let i = 0; i < count; i++) {
		const item = children[i];
		if (isFragmentDescriptor(item)) {
			if (item.ref != null || hasOwnProp.call(item.props, 'ref')) {
				outItems.push(fragmentRefDescriptor(item));
				outKeys.push(scopedSsrDeoptKey(path, item, i, ssrDeoptKey(item, i)));
				continue;
			}
			const nested = fragmentDescriptorChildren(item);
			if (item.key != null) {
				flattenSsrChildContainer(outItems, outKeys, nested, 'fragment', [
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
				flattenSsrChildContainer(outItems, outKeys, nested, 'fragment', nestedPath);
			}
			continue;
		}
		if (Array.isArray(item)) {
			const nestedKind = ssrDeoptWrapperKind(item);
			const nestedPath =
				nestedKind === kind
					? [...path, 'wrapper', count === 1 ? 0 : i]
					: count === 1
						? path
						: [...path, 'position', i, nestedKind];
			flattenSsrChildContainer(outItems, outKeys, item, nestedKind, nestedPath);
			continue;
		}
		outItems.push(item);
		outKeys.push(scopedSsrDeoptKey(path, item, i, ssrDeoptKey(item, i)));
	}
}

function prepareSsrDeoptList(value: any, includeKeyedSingle: boolean): PreparedSsrDeoptList | null {
	// Asked for EVERY serialized child, and the non-list answer (a lone component
	// descriptor, text, null) is the common one — build the two output arrays only
	// once a list regime is established. Mirrors prepareDeoptList in runtime.ts.
	if (isFragmentDescriptor(value)) {
		if (value.ref != null || hasOwnProp.call(value.props, 'ref')) {
			return {
				items: [fragmentRefDescriptor(value)],
				keys: [scopedSsrDeoptKey([], value, 0, value.key ?? 0)],
			};
		}
		const items: any[] = [];
		const keys: any[] = [];
		const path = value.key == null ? [] : ['keyed-fragment', value.key];
		flattenSsrChildContainer(items, keys, fragmentDescriptorChildren(value), 'fragment', path);
		return { items, keys };
	}
	if (Array.isArray(value)) {
		const items: any[] = [];
		const keys: any[] = [];
		flattenSsrChildContainer(items, keys, value, ssrDeoptWrapperKind(value), []);
		return { items, keys };
	}
	if (includeKeyedSingle && isElementDescriptor(value) && value.key != null) {
		return { items: [value], keys: [scopedSsrDeoptKey([], value, 0, value.key)] };
	}
	return null;
}

// Server halves of the client runtime's React-compatible element utilities
// (see runtime.ts "isValidElement / cloneElement / Children"): libraries that
// inspect or re-project descriptor children (a Radix-style Slot, recharts'
// axis-tick cloning) compile for BOTH modes, so the same imports must resolve
// under `octane/server` too. Descriptors share the client shape (ELEMENT_TAG
// is Symbol.for-keyed), so the semantics match by construction.

/** True if `v` is an element descriptor from `createElement` / JSX-at-value. */
export function isValidElement(v: unknown): v is ElementDescriptor {
	return isElementDescriptor(v);
}

/**
 * `cloneElement(element, config?, ...children)` — a new descriptor with
 * `element`'s props shallow-merged under `config` (config wins), `key`
 * overridden by `config.key`, and children replaced by any passed positionally
 * (else the original children are kept). Mirrors the client runtime's
 * semantics; like the server `createElement`, children ride in BOTH
 * `props.children` (component form) and `descriptor.children` (host form).
 */
export function cloneElement(
	element: ElementDescriptor,
	config?: any,
	...children: any[]
): ElementDescriptor {
	if (!isElementDescriptor(element)) {
		throw new Error(formatServerError(4));
	}
	// Preserve deferred children until their represented component owns the read.
	let scopedChildren: (() => unknown) | undefined;
	let props: any;
	if (SCOPED_ELEMENT_PROPS.has(element.props)) {
		scopedChildren = Object.getOwnPropertyDescriptor(element, 'children')!.get;
		props = {};
		for (const name in element.props) {
			if (name !== 'key' && name !== 'children' && hasOwnProp.call(element.props, name)) {
				props[name] = element.props[name];
			}
		}
	} else {
		props = copyElementConfig(element.props);
	}
	let key = element.key;
	let replacedChildren = false;
	if (config != null) {
		if (hasElementConfigKey(config)) key = '' + config.key;
		for (const name in config) {
			if (name === 'key') continue;
			if (name === 'ref' && config.ref === undefined) continue;
			if (hasOwnProp.call(config, name)) {
				props[name] = config[name];
				if (name === 'children') replacedChildren = true;
			}
		}
	}
	const n = children.length;
	let kids: any;
	let childProperty: PropertyDescriptor | undefined;
	if (n === 1) {
		kids = children[0];
	} else if (n > 1) {
		kids = children;
	} else if (scopedChildren !== undefined && !replacedChildren) {
		childProperty = { configurable: true, enumerable: true, get: scopedChildren };
		Object.defineProperty(props, 'children', childProperty);
		SCOPED_ELEMENT_PROPS.add(props);
		kids = null;
	} else {
		// No new children: reuse `config.children` (now merged into props) or the original.
		kids = 'children' in props ? props.children : element.children;
	}
	if (n > 0) props.children = kids;
	const descriptor: ElementDescriptor = {
		$$kind: ELEMENT_TAG,
		type: element.type,
		props,
		key,
		ref: props.ref !== undefined ? props.ref : null,
		children: kids ?? null,
	};
	if (childProperty !== undefined) Object.defineProperty(descriptor, 'children', childProperty);
	return finalizeElementDescriptor(descriptor);
}

function cloneAndReplaceElementKey(element: ElementDescriptor, key: string): ElementDescriptor {
	// Traversal changes only the key, never the scope that resolves its children.
	const scopedChildren = SCOPED_ELEMENT_PROPS.has(element.props);
	const descriptor: ElementDescriptor = {
		$$kind: ELEMENT_TAG,
		type: element.type,
		props: element.props,
		key,
		ref: element.ref,
		children: scopedChildren ? null : element.children,
	};
	if (scopedChildren) {
		const get = Object.getOwnPropertyDescriptor(element, 'children')!.get;
		Object.defineProperty(descriptor, 'children', { configurable: true, enumerable: true, get });
	}
	return finalizeElementDescriptor(descriptor);
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

interface ChildrenThenable<T = any> extends PromiseLike<T> {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: any;
}

function resolveChildrenThenable(thenable: ChildrenThenable): any {
	// Inside an SSR pass, route through use() so the active @try/Suspense
	// boundary receives the private sentinel and render() records the promise for
	// a retry. A direct public Children call has no such boundary: track the
	// thenable in React's public shape and throw the pending thenable itself,
	// never leaking Octane's server-only sentinel to userland.
	if (FRAME !== null) return use(thenable);
	if (thenable.status === undefined) {
		thenable.status = 'pending';
		thenable.then(
			(value) => {
				if (thenable.status === 'pending') {
					thenable.status = 'fulfilled';
					thenable.value = value;
				}
			},
			(reason) => {
				if (thenable.status === 'pending') {
					thenable.status = 'rejected';
					thenable.reason = reason;
				}
			},
		);
	}
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
	return new Error(formatServerError(3, found));
}

function mapIntoChildren(
	children: any,
	out: any[],
	escapedPrefix: string,
	nameSoFar: string,
	callback: (child: any) => any,
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
			}
			out.push(mapped);
		}
		return 1;
	}

	let count = 0;
	const nextPrefix = nameSoFar === '' ? '.' : nameSoFar + ':';
	if (Array.isArray(children)) {
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			count += mapIntoChildren(
				child,
				out,
				escapedPrefix,
				nextPrefix + childElementKey(child, i),
				callback,
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
			);
		}
		throw invalidChildError(children);
	}
	return 0;
}

// Server half of the client runtime's React-compatible `Children` — identical
// pure descriptor-value logic (see runtime.ts for the semantics comments).
export const Children = {
	forEach(children: any, fn: (child: any, index: number) => void, context?: any): void {
		if (children == null) return;
		let index = 0;
		mapIntoChildren(children, [], '', '', (child) => {
			fn.call(context, child, index++);
			return null;
		});
	},
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
	count(children: any): number {
		if (children == null) return 0;
		return mapIntoChildren(children, [], '', '', () => null);
	},
	toArray(children: any): any[] {
		const out: any[] = [];
		if (children != null) mapIntoChildren(children, out, '', '', (child) => child);
		return out;
	},
	only<T>(children: T): T {
		if (!isElementDescriptor(children)) {
			throw new Error(formatServerError(2));
		}
		return children;
	},
};

// Server half of the client runtime's `createPortal`: mints the same
// PORTAL_TAG descriptor shape; `ssrChild` renders it as a bare site anchor
// (portal content mounts into its client-side container on hydration).
export function createPortal(body: unknown, target: unknown, props: any = undefined): unknown {
	return { $$kind: PORTAL_TAG, body, target, props };
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

// Guarded escapers: a single .test() scan first, so the common no-escape case
// returns the ORIGINAL string with zero allocation (~5x on clean text). When
// something does need escaping, native replacement passes are kept —
// measured faster than an exec-loop or replace-with-callback single pass on V8
// for both sparse and dense escape densities.
const HTML_ESCAPE_RE = /[&<>]/g;
export function escapeHtml(v: unknown): string {
	const s = typeof v === 'string' ? v : String(v);
	HTML_ESCAPE_RE.lastIndex = 0;
	if (!HTML_ESCAPE_RE.test(s)) return s;
	return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const ATTR_ESCAPE_RE = /[&"]/g;
export function escapeAttr(v: unknown): string {
	const s = typeof v === 'string' ? v : String(v);
	ATTR_ESCAPE_RE.lastIndex = 0;
	if (!ATTR_ESCAPE_RE.test(s)) return s;
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Codegen helpers — the compiled server body interleaves static HTML chunks
// with these calls. All return a string fragment.
// ---------------------------------------------------------------------------

let DANGER_HTML_CHILD_PROBE = 0;

function probingDangerHtmlChild(value: unknown): boolean {
	if (DANGER_HTML_CHILD_PROBE === 0) return false;
	if (value !== null && value !== undefined) {
		throw new Error(formatServerError(5));
	}
	return true;
}

/** A dynamic text hole. null/false/undefined render as empty (React parity). */
export function ssrText(v: unknown): string {
	if (probingDangerHtmlChild(v)) return '';
	if (v == null || v === false) return '';
	return escapeHtml(v);
}

/**
 * A dynamic text hole in FIRST-CHILD position of a newline-eating element
 * (`<pre>`/`<textarea>`/`<listing>`): the HTML parser discards a newline that
 * immediately follows the opening tag, so a value starting with '\n' gets an
 * EXTRA leading newline (React's protection) — the parser eats the sacrificial
 * one and the real content round-trips intact.
 */
export function ssrTextPre(v: unknown): string {
	const s = ssrText(v);
	return s.charCodeAt(0) === 10 ? '\n' + s : s;
}

// Render a COMPONENT `ElementDescriptor` (`d.type` is a function) via ssrComponent,
// threading positional `d.children` through as `props.children` (don't drop them).
// `createElement` already mirrors positional children into `props.children`, so for
// its descriptors the spread is a no-op copy — it stays as a defensive guard for
// hand-rolled descriptors whose props/children were never reconciled.
function ssrComponentDescriptor(d: ElementDescriptor, scope: SSRScope): string {
	if (SCOPED_ELEMENT_PROPS.has(d.props)) {
		return ssrComponent(scope, d.type as ServerComponent, d.props);
	}
	return ssrComponent(scope, d.type as ServerComponent, {
		...d.props,
		children: d.children ?? d.props?.children,
	});
}

/**
 * A RENDERABLE expression hole — the value of a `{expr}` that is NOT marked as
 * definite text (`{expr as string}`). Mirrors Ripple: a `{children}` / component
 * function or element descriptor RENDERS (wrapped in a hydration block range, so
 * the client adopts it), while a primitive coerces to text. The compiler routes
 * `{x as string}` / literals / `+`-concats to `ssrText`, everything else here.
 */
export function ssrChild(v: unknown, scope: SSRScope): string {
	if (probingDangerHtmlChild(v)) return '';
	return ssrChildValue(v, scope, true);
}

function ssrChildValue(
	v: unknown,
	scope: SSRScope,
	includeKeyedSingle: boolean,
	selfMarkItem: boolean = false,
): string {
	// Every renderable hole serializes to ONE `<!--[-->…<!--]-->` range so the
	// client's childSlot adopts a uniform marker pair on hydration regardless of
	// whether the value is a component, an element, a primitive, or empty — and
	// an empty hole still occupies one logical node, keeping sibling cursor
	// alignment intact. `ssrComponent` already wraps its output in block markers.
	if (v == null || v === false || v === true) return ssrBlock('');
	// React 19 Usables are valid renderable nodes, not only valid arguments to
	// an explicit use() call. Unwrap recursively so a promise may resolve to a
	// Context (and a Context value may itself be another Usable) before the
	// ordinary child classifier serializes the final value. Pending thenables
	// still route through the nearest streaming/buffered Suspense boundary.
	if (
		(typeof v === 'object' || typeof v === 'function') &&
		((v as any).$$kind === CONTEXT_TAG || typeof (v as any).then === 'function')
	) {
		return ssrChildValue(
			use(v as Context<unknown> | PromiseLike<unknown>),
			scope,
			includeKeyedSingle,
		);
	}
	const iterable = iterableChildArray(v);
	if (iterable !== null) v = iterable;
	// Arrays, iterables, Fragment descriptors, and keyed single descriptors use the client's
	// de-opt keyed-list shape: one outer child-slot range plus one range per
	// flattened leaf. Item rendering disables keyed-single preparation so the
	// descriptor cannot recursively wrap itself.
	const preparedList = prepareSsrDeoptList(v, includeKeyedSingle);
	if (preparedList !== null) {
		return withAsyncListScope('child', () => {
			let out = '';
			for (let i = 0; i < preparedList.items.length; i++) {
				const item = preparedList.items[i];
				const key = preparedList.keys[i];
				out += withAsyncIdentity('item', key, () => ssrChildValue(item, scope, false, true));
			}
			return ssrBlock(out);
		});
	}
	// A component-body / children render function, or `<Comp/>` used as a value.
	if (typeof v === 'function')
		// Bare body/children functions can be recreated every parent pass. The
		// client treats this as one child-slot body, not component-type identity.
		return ssrComponent(scope, v as ServerComponent, {}, undefined, undefined, true);
	if (typeof v === 'object') {
		if ((v as any).$$kind === ELEMENT_TAG) {
			const d = v as ElementDescriptor;
			// HOST descriptor (`createElement('span', …)`, from value-position JSX) →
			// serialize the element directly; its content REPLACES the childSlot range
			// the client adopts (de-opt host children are rebuilt, not adopted in place,
			// so only the outer marker pair must line up). COMPONENT descriptor →
			// ssrComponent, passing `children` through (don't drop them).
			const render = (): string => {
				if (typeof d.type === 'string') {
					// Keep the established argument evaluation order and read each
					// public descriptor field exactly once. Only the ACTUAL children
					// handed to the serializer can prove a self-delimiting host.
					const type = d.type;
					const props = d.props;
					const children = d.children;
					const html = ssrHostElement(type, props, children, scope);
					return selfMarkItem && serverHostHasPrimitiveChildren(children) ? html : ssrBlock(html);
				}
				return ssrComponentDescriptor(d, scope);
			};
			const renderType = () => withAsyncIdentity('child-type', d.type, render);
			return d.key != null ? withAsyncIdentity('child-key', d.key, renderType, true) : renderType();
		}
		// A portal as a value: its body renders into a foreign target client-side —
		// server-side the site leaves the anchor placeholder (see ssrPortal).
		if ((v as any).$$kind === PORTAL_TAG) return ssrBlock(ssrPortal());
		// A plain object is never a renderable child — serializing `String(v)` puts
		// '[object Object]' in the markup. Throw like React so the bug is loud.
		throw invalidChildError(v as object);
	}
	return ssrBlock(escapeHtml(v));
}

// An ONLY-CHILD `{expr}` value hole (the host's sole content). A primitive
// serializes MARKERLESS — the host's bare text, which the client's `childTextHole`
// adopts as a plain Text node (no `<!--[-->…<!--]-->`, matching its markerless
// mount). An object/array/component still needs the block range (childSlot adopts
// it); empty renders nothing (the host is sole-child, so there's no sibling cursor
// to keep aligned).
export function ssrChildText(v: unknown, scope: SSRScope): string {
	if (probingDangerHtmlChild(v)) return '';
	if (v == null || v === false || v === true) return '';
	if (typeof v === 'object' || typeof v === 'function') return ssrChild(v, scope);
	return escapeHtml(v);
}

// Serialize a HOST element descriptor (`createElement('span', props, ...children)`)
// to `<tag …attrs…>…children…</tag>`, void-element aware. Mirrors the static
// emission of the compiler's `ssrEmitElement`: `className`→`class`, `style` objects
// flattened, spread-unsafe / event / ref / key / children props skipped, and
// children recursed via ssrChild (array → blocks, element/component → render,
// primitive → escaped text). `dangerouslySetInnerHTML={{__html}}`, if present, is
// raw (unescaped) content. `rawInner`, when given, is PRE-RENDERED content HTML
// (a template call site's `__schildren$N` output — see ssrComponent's string
// branch) emitted verbatim in place of the `children` recursion.
function ssrHostElement(
	tag: string,
	props: any,
	children: any,
	scope: SSRScope,
	rawInner?: string,
): string {
	// A descriptor tag is concatenated into the response verbatim — validate it
	// like React does (Invalid tag → throw) so a hostile/buggy dynamic tag (e.g.
	// 'div><img onerror=…>') can never become live markup. The client is guarded
	// by the platform itself: document.createElement throws for these names.
	if (!VALID_TAG_NAME.test(tag)) {
		throw new Error(formatServerError(30, tag));
	}
	// Public string descriptors follow HTML's ASCII case-insensitive tag
	// semantics even when the authored spelling is uppercase. Preserve that
	// spelling in the serialized tag, but normalize every behavior/safety check.
	const semanticTag = tag.toLowerCase();
	const parentElement = CURRENT_SSR_ELEMENT;
	const { namespace, childrenNamespace } = ssrElementNamespaces(semanticTag, parentElement);
	CURRENT_SSR_ELEMENT = {
		tag: semanticTag,
		parent: parentElement,
		namespace,
		childrenNamespace,
		location: undefined,
	};
	try {
		const iterable = iterableChildArray(children);
		const iterableChildren = iterable !== null;
		if (iterable !== null) children = iterable;
		let attrs = '';
		let innerHTMLValue: unknown = undefined;
		let hasInnerHTMLProp = false;
		// Controlled form props (mirrors the compiled ssrEmitElement routing):
		// input maps the value/defaultValue and checked/defaultChecked cascades
		// onto the native attributes; textarea routes value/defaultValue into the
		// CONTENT position; select feeds them to the option-projection scope.
		const isCtlTag =
			semanticTag === 'input' || semanticTag === 'textarea' || semanticTag === 'select';
		if (props != null) {
			if (process.env.NODE_ENV !== 'production') {
				devValidateSsrAriaProps(props, semanticTag, namespace);
				devValidateSsrHostProps(props, semanticTag, namespace);
				devValidateSsrFormProps(semanticTag, props, children);
			}
			for (const k in props) {
				const val = props[k];
				// `dangerouslySetInnerHTML` is element CONTENT, not an attribute — capture
				// it here (last write wins) and route everything else through the shared
				// filter/serializer.
				if (k === 'dangerouslySetInnerHTML') {
					hasInnerHTMLProp = true;
					innerHTMLValue = val;
					continue;
				}
				if (
					isCtlTag &&
					(k === 'value' ||
						k === 'defaultValue' ||
						(semanticTag === 'input' && (k === 'checked' || k === 'defaultChecked')))
				) {
					continue; // serialized from the cascade below / the content position
				}
				attrs += ssrAttrEntry(k, val, semanticTag, namespace);
			}
			if (semanticTag === 'input') {
				attrs += ssrValueAttr(props.value != null ? props.value : props.defaultValue);
				attrs += ssrCheckedAttr(props.checked != null ? props.checked : props.defaultChecked);
			}
		}
		const hasChildren =
			rawInner !== undefined
				? rawInner !== ''
				: children != null && children !== false && children !== true && children !== '';
		if (
			hasInnerHTMLProp &&
			innerHTMLValue != null &&
			(typeof innerHTMLValue !== 'object' || !('__html' in innerHTMLValue))
		) {
			throw new Error(formatServerError(6));
		}
		const hasDangerHTML = hasInnerHTMLProp && innerHTMLValue != null;
		if (hasDangerHTML && (children != null || (rawInner !== undefined && rawInner !== ''))) {
			throw new Error(formatServerError(5));
		}
		// Controlled <textarea>: the prop IS the content — React's contract
		// (children + defaultValue throws; children + value warns dev-side, the
		// value wins; the compiled path rejects both at compile time).
		if (
			semanticTag === 'textarea' &&
			props != null &&
			(props.value != null || props.defaultValue != null)
		) {
			if (hasChildren && props.value == null) {
				throw new Error(formatServerError(31));
			}
			const inner = ssrTextareaValue(props.value != null ? props.value : props.defaultValue);
			return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
		}
		if (VOID_ELEMENTS.has(semanticTag) && hasDangerHTML) {
			throw new Error(formatServerError(7, semanticTag));
		}
		if (VOID_ELEMENTS.has(semanticTag) && !hasChildren) {
			return '<' + tag + attrs + '/>';
		}
		let inner = '';
		if (hasDangerHTML) {
			const html = (innerHTMLValue as { __html?: unknown }).__html;
			const raw = html == null ? '' : String(html);
			// HTML tag names are ASCII case-insensitive on the public descriptor path
			// (`createElement('SCRIPT', …)` creates a real script in the browser too).
			inner =
				semanticTag === 'script'
					? escapeEntireInlineScriptContent(raw)
					: semanticTag === 'style'
						? escapeEntireInlineStyleContent(raw)
						: raw;
		} else if (rawInner !== undefined) {
			inner = rawInner;
		} else if (hasChildren) {
			// Script-data does not decode HTML entities. A compiler-generated host
			// descriptor therefore needs the same whole-body serializer as the direct
			// template path. Join primitive arrays before escaping so a breakout token
			// split across adjacent children cannot evade the boundary guard.
			const scriptText = semanticTag === 'script' ? scriptDescriptorText(children) : null;
			if (scriptText !== null) {
				inner = escapeEntireInlineScriptContent(scriptText);
			} else {
				// A de-opt host whose children contain COMPONENTS renders those children on the
				// client through `hostElementBody` → `childSlot` (a Block path that ADOPTS markers
				// on hydration), so they must carry the full childSlot/block marker structure —
				// emit them via `ssrChild` (the server analogue of childSlot). Pure host/text
				// children are rebuilt by the client de-opt reconciler, so they stay as plain
				// marker-less markup via `ssrDescriptorContent`.
				const build = () =>
					ssrInNamespace(childrenNamespace, () =>
						iterableChildren || serverDescNeedsBlocks(children)
							? ssrDeoptBlockChildren(children, scope)
							: ssrDescriptorContent(children, scope),
					);
				// A controlled <select> projects `selected` onto the options serialized
				// inside its children (compiled options included — the scope is global).
				inner =
					semanticTag === 'select' &&
					props != null &&
					(props.value != null || props.defaultValue != null)
						? ssrSelectScope(props.value, props.defaultValue, !!props.multiple, build)
						: build();
			}
		}
		// <option> assembles via ssrOption so an active select scope can mark it
		// ` selected` (its value prop already serialized as a plain attribute).
		if (semanticTag === 'option') {
			return ssrOption(
				props != null && props.value != null ? props.value : undefined,
				attrs,
				inner,
			);
		}
		return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
	} finally {
		CURRENT_SSR_ELEMENT = parentElement;
	}
}

// Serialize a de-opt host's component-bearing children the way the client's
// `hostElementBody` → `childSlot` adopts them. A SINGLE child is one childSlot block
// (`ssrChild`). An ARRAY routes through the de-opt keyed list (`childSlot` → `forSlot`
// → `deoptItemBody`): an OUTER childSlot block contains one range per flattened leaf.
// Pure host/text leaves receive an explicit item range. A component-bearing leaf's
// own childSlot range is coextensive with — and borrowed as — its list item range;
// adding another wrapper would leave stale server content beside the hydrated item.
function ssrDeoptBlockChildren(children: unknown, scope: SSRScope): string {
	const iterable = iterableChildArray(children);
	if (iterable !== null) children = iterable;
	const preparedList = prepareSsrDeoptList(children, true);
	if (preparedList !== null) {
		return withAsyncListScope('host-child', () => {
			let out = '';
			for (let i = 0; i < preparedList.items.length; i++) {
				const item = preparedList.items[i];
				const key = preparedList.keys[i];
				out += withAsyncIdentity('item', key, () => {
					// A pure host is its own keyed-item boundary. Text and empty values
					// still need an explicit movable range because they do not provide
					// one stable Element root.
					// A component-bearing value already contributes the coextensive range
					// borrowed by its nested childSlot; wrapping it again would make hydration
					// mount a duplicate beside the server content.
					return serverDescNeedsBlocks(item)
						? ssrChildValue(item, scope, false)
						: ssrDeoptItemContent(item, scope);
				});
			}
			return ssrBlock(out);
		});
	}
	return ssrChild(children, scope);
}

// Server mirror of the client's `descNeedsBlocks`: true when a descriptor subtree
// contains a COMPONENT anywhere (so its de-opt host parent must serialize children
// through the block-bearing `ssrChild` path rather than plain markup).
function serverDescNeedsBlocks(v: unknown): boolean {
	if (v == null || typeof v !== 'object') return false;
	// Arrays are the ordinary descriptor-children container. Inspect their
	// descendants before the generic iterable check below; treating every array
	// as an opaque iterable forces pure host/text trees onto the block path and
	// injects hydration markers inside otherwise plain <strong>/<tspan> content.
	if (Array.isArray(v)) {
		for (let i = 0; i < v.length; i++) if (serverDescNeedsBlocks(v[i])) return true;
		return false;
	}
	// Iterables route through the same keyed-list path as arrays. Avoid consuming
	// a one-shot iterator merely to inspect it; the serializer materializes it
	// exactly once when the host content is rendered.
	if (!isElementDescriptor(v) && childrenIterator(v) !== null) return true;
	const d = v as ElementDescriptor;
	if (d.$$kind === ELEMENT_TAG) {
		// Fragment and Activity descriptors own reconcilable boundaries even when
		// all of their descendants are pure hosts/text.
		if (d.type === Fragment || d.type === Activity) return true;
		return typeof d.type === 'function' || serverDescNeedsBlocks(d.children);
	}
	return false;
}

// Return one complete script-data string when a host descriptor contains only
// primitive text children. `null` means the descriptor needs the ordinary
// renderable-child path. This mirrors ssrDescriptorContent's primitive coercion
// and empty handling without serializing HTML entities into script data.
function scriptDescriptorText(v: unknown): string | null {
	if (v == null || v === false || v === true || v === '') return '';
	if (Array.isArray(v)) {
		let out = '';
		for (let i = 0; i < v.length; i++) {
			const part = scriptDescriptorText(v[i]);
			if (part === null) return null;
			out += part;
		}
		return out;
	}
	if (typeof v === 'object' || typeof v === 'function') return null;
	return String(v);
}

// A host with a primitive or empty actual child stays on the client's raw-host
// reconciliation path and therefore provides one stable Element boundary. Any
// object, array, iterable, portal, or render function remains conservatively
// marked. Classify the very value already read for serialization so public
// getters and forwarding Proxies cannot lie or be evaluated an extra time.
function serverHostHasPrimitiveChildren(children: unknown): boolean {
	return children === null || (typeof children !== 'object' && typeof children !== 'function');
}

// Serialize one de-opt keyed item after its established serverDescNeedsBlocks
// routing. Capture descriptor fields in exactly ssrDescriptorContent's ordinary
// evaluation order, then decide whether the actual rendered host can self-mark.
function ssrDeoptItemContent(value: unknown, scope: SSRScope): string {
	if (value !== null && typeof value === 'object' && (value as any).$$kind === ELEMENT_TAG) {
		const descriptor = value as ElementDescriptor;
		if (typeof descriptor.type === 'string') {
			const type = descriptor.type;
			const props = descriptor.props;
			const children = descriptor.children;
			const html = ssrHostElement(type, props, children, scope);
			return serverHostHasPrimitiveChildren(children) ? html : ssrBlock(html);
		}
	}
	return ssrBlock(ssrDescriptorContent(value, scope));
}

// Serialize the CONTENT inside a host descriptor (a `createElement(...)` child
// subtree) as PLAIN markup — NO childSlot block markers. Mirrors the client's
// `buildDeoptDom`, which builds the descriptor's children as raw DOM nodes inside
// the element (the de-opt host path REBUILDS on hydration, so the inside carries no
// adopt markers). This keeps the serialized `<span>text</span>` byte-identical to a
// fresh client mount. Arrays flatten, nested host descriptors recurse, components
// still render through `ssrComponent` (block-wrapped — a component IS a hydration
// boundary even inside de-opt markup), primitives coerce to escaped text.
function ssrDescriptorContent(v: unknown, scope: SSRScope): string {
	if (v == null || v === false || v === true || v === '') return '';
	if (Array.isArray(v)) {
		let out = '';
		for (let i = 0; i < v.length; i++) out += ssrDescriptorContent(v[i], scope);
		return out;
	}
	if (typeof v === 'object' && (v as any).$$kind === ELEMENT_TAG) {
		const d = v as ElementDescriptor;
		if (typeof d.type === 'string') return ssrHostElement(d.type, d.props, d.children, scope);
		return ssrComponentDescriptor(d, scope);
	}
	if (typeof v === 'function') {
		// A host descriptor can receive a compiler-generated children block through
		// an uncompiled wrapper. Its transient function identity must not become part
		// of the streamed async boundary key used for a later retry.
		return ssrComponent(scope, v as ServerComponent, {}, undefined, undefined, isChildrenBlock(v));
	}
	if (typeof v === 'object') throw invalidChildError(v as object);
	return escapeHtml(v);
}

/**
 * Wrap a control-flow branch / for-item's HTML in hydration block markers
 * (`<!--[-->` … `<!--]-->`), so a future client hydrate cursor can find the
 * block boundaries and adopt the chosen branch. Mirrors Ripple's marker
 * protocol (shared constants in ./constants).
 */
export function ssrBlock(content: string): string {
	return MARKERS ? BLOCK_OPEN + content + BLOCK_CLOSE : content;
}

/**
 * Preserve a Fragment ref's authored evaluation order without attaching its
 * value. Hydratable output needs the exact comments its client template adopts;
 * static markup omits them along with every other hydration-only marker.
 */
export function ssrFragmentMarker(open: boolean, _ref?: unknown): string {
	return MARKERS ? (open ? '<!--frag-->' : '<!--/frag-->') : '';
}

/**
 * Server half of `<Activity mode="visible"|"hidden">`.
 *
 * Visible content renders inside one hydratable range. Hidden content is not
 * evaluated and serializes as an empty range (or an empty string for static
 * markup), matching React's server behavior while leaving the client a stable
 * range to adopt and populate offscreen during hydration.
 */
export function ssrActivity(mode: string, render: () => string): string {
	return ssrBlock(mode === 'hidden' ? '' : render());
}

/** Cold twin of the client's generic Activity body and its ordinary child slot. */
function renderActivityDescriptor(
	props: { mode?: 'visible' | 'hidden'; children?: unknown },
	scope: SSRScope,
): string {
	// Keep the accessor inside the visibility branch: scoped JSX children may
	// start data work or throw, and hidden server Activities must evaluate neither.
	return ssrActivity(props.mode ?? 'visible', () => ssrChild(props.children, scope));
}

/**
 * Wrap an @for in its single outer pair and encode which arm the server chose.
 * Markerless direct-host items make populated content indistinguishable from a
 * single-root @empty arm otherwise; one bit on the existing open comment lets
 * hydration recover server/client list-shape mismatches without extra nodes.
 */
export function ssrForBlock(content: string, hasItems: boolean): string {
	return MARKERS
		? (hasItems ? FOR_BLOCK_OPEN_ITEMS : FOR_BLOCK_OPEN_EMPTY) + content + BLOCK_CLOSE
		: content;
}

// URI encoders reject lone UTF-16 surrogates, while UTF-8 encoders generally
// replace them with U+FFFD (which would conflate distinct JavaScript strings).
// Encode each code unit at a fixed width instead: this is total for every JS
// string and injective over its exact UTF-16 representation.
//
// `toString(16).padStart(4, '0')` allocates two throwaway strings per CODE UNIT,
// which dominated identity-scoped descriptor rendering. Identity keys are
// overwhelmingly ASCII (site keys, prop names, route segments), so those units
// come from a prebuilt table and only the rare non-ASCII unit pays the slow
// path. The emitted bytes are unchanged.
const ASCII_ASYNC_IDENTITY_UNITS: string[] = [];
for (let code = 0; code < 128; code++) {
	ASCII_ASYNC_IDENTITY_UNITS.push(code.toString(16).padStart(4, '0'));
}
/**
 * @internal Exported for direct testing: a conflating or wrong-width encoding is
 * invisible through `prerender`, because occurrence tracking assigns list items
 * distinct scopes independently of the key bytes. Not re-exported from
 * `octane/server`.
 */
export function encodeAsyncIdentityString(value: string): string {
	let encoded = '';
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		encoded += code < 128 ? ASCII_ASYNC_IDENTITY_UNITS[code] : code.toString(16).padStart(4, '0');
	}
	return encoded;
}

function asyncIdentityKey(value: unknown, objectIs: boolean, positionFallback?: string): string {
	switch (typeof value) {
		case 'string': {
			if (value.length > 64 && RESOLVED !== null) {
				const ids = RESOLVED.asyncIdentities;
				let id = ids.get(value);
				if (id === undefined) {
					id = RESOLVED.nextAsyncIdentity++;
					ids.set(value, id);
				}
				return 't' + id.toString(36);
			}
			return 's' + encodeAsyncIdentityString(value);
		}
		case 'number':
			return 'n' + (objectIs && Object.is(value, -0) ? '-0' : String(value));
		case 'bigint':
			return 'i' + String(value);
		case 'boolean':
			return value ? 'b1' : 'b0';
		case 'undefined':
			return 'u';
		case 'symbol':
		case 'function':
		case 'object': {
			if (value === null) return 'l';
			const ids = RESOLVED?.asyncIdentities;
			if (ids === undefined) return 'o' + encodeAsyncIdentityString(String(value));
			let id = ids.get(value);
			if (id === undefined) {
				id =
					positionFallback === undefined
						? undefined
						: RESOLVED!.asyncPositionIdentities.get(positionFallback);
				if (id === undefined) id = RESOLVED!.nextAsyncIdentity++;
				ids.set(value, id);
			}
			if (positionFallback !== undefined)
				RESOLVED!.asyncPositionIdentities.set(positionFallback, id);
			return 'o' + id.toString(36);
		}
	}
}

function withAsyncIdentity<T>(
	siteKey: string,
	identity: unknown,
	fn: () => T,
	objectIs: boolean = false,
	positionFallback?: string,
): T {
	const prev = ASYNC_SCOPE;
	const position = prev + '|@' + siteKey;
	ASYNC_SCOPE = position + ':' + asyncIdentityKey(identity, objectIs, positionFallback);
	try {
		return fn();
	} finally {
		ASYNC_SCOPE = prev;
	}
}

function withAsyncListScope<T>(kind: string, fn: () => T): T {
	const frame = FRAME;
	const occurrence = frame === null ? 0 : nextFrameOccurrence(frame, '@list:' + kind);
	return withAsyncIdentity('list:' + kind, occurrence, fn);
}

/** Compiler-emitted identity membrane for one @if/@switch/@for instance. */
export function ssrControl<T>(siteKey: string, fn: () => T): T {
	const frame = FRAME;
	const occurrence = frame === null ? 0 : nextFrameOccurrence(frame, '@control:' + siteKey);
	return withAsyncIdentity('control:' + siteKey, occurrence, fn);
}

/** Compiler-emitted identity membrane for one arm/item inside ssrControl. */
export function ssrArm<T>(armKey: unknown, fn: () => T): T {
	const frame = FRAME;
	const occurrence =
		frame === null ? 0 : nextFrameOccurrence(frame, '@arm-position:' + ASYNC_SCOPE);
	// A freshly allocated object key has no cross-pass identity. Reuse the same
	// lexical item position only as its fallback lookup. The final scope remains
	// keyed solely by armKey, so a stable primitive/object key keeps its identity
	// when an @for reorders between streaming passes.
	const fallbackPosition = ASYNC_SCOPE + '|@arm-position:' + occurrence;
	return withAsyncIdentity('arm', armKey, fn, false, fallbackPosition);
}

/**
 * A portal's site marker. The portal body renders into a foreign target at the
 * client, so server-side it leaves a single anchor comment placeholder.
 */
export function ssrPortal(): string {
	return EMPTY_COMMENT;
}

// An `opaque` compiler site inherits the namespace chosen for the component at
// runtime. Resolve it before applying namespace-sensitive custom-element and
// native SVG/MathML attribute rules.
function resolveAttributeNamespace(namespace: AttributeNamespace): ParserNamespace {
	return namespace === 'opaque' ? (FRAME?.namespace ?? 'html') : namespace;
}

// React's shared unknown-property validator de-duplicates by prop name for the
// lifetime of the renderer module. Discovery-only passes and calls outside a
// real render are disabled by SSR_NESTING_WARNINGS === null. Every call site is
// DEV-guarded, so this helper disappears from optimized server bundles.
function devWarnSsrAttributeOnce(name: string, message: string): void {
	if (SSR_NESTING_WARNINGS === null) return;
	const warned = (DEV_SSR_ATTRIBUTE_WARNINGS ??= new Set<string>());
	if (warned.has(name)) return;
	warned.add(name);
	console.error(message);
}

function devValidateSsrAriaProps(
	props: Record<string, unknown> | Iterable<string>,
	tag: string | undefined,
	namespace: AttributeNamespace,
): void {
	if (
		SSR_NESTING_WARNINGS === null ||
		tag === undefined ||
		(resolveAttributeNamespace(namespace) === 'html' && tag.indexOf('-') !== -1)
	) {
		return;
	}
	const names = Symbol.iterator in props ? props : Object.keys(props);
	let unknown: string[] | undefined;
	for (const name of names) {
		if (!isAriaAttributeName(name)) continue;
		const warning = ariaAttributeWarning(name, tag);
		if (warning === null) continue;
		if (!isUnknownAriaAttribute(name)) {
			devWarnSsrAttributeOnce(name, warning);
			continue;
		}
		if (DEV_SSR_ATTRIBUTE_WARNINGS?.has(name)) continue;
		(DEV_SSR_ATTRIBUTE_WARNINGS ??= new Set()).add(name);
		(unknown ??= []).push(name);
	}
	if (unknown !== undefined) {
		console.error(unknownAriaAttributeWarning(unknown, tag));
	}
}

function devValidateSsrHostProps(
	props: Record<string, unknown> | Iterable<readonly [string, unknown]>,
	tag: string | undefined,
	namespace: AttributeNamespace,
): void {
	if (
		SSR_NESTING_WARNINGS === null ||
		tag === undefined ||
		(resolveAttributeNamespace(namespace) === 'html' && tag.indexOf('-') !== -1)
	) {
		return;
	}
	const entries = Symbol.iterator in props ? props : Object.entries(props);
	const snapshot = Array.isArray(entries) ? entries : [...entries];
	if (snapshot.some(([name, value]) => name === 'is' && typeof value === 'string')) return;
	let invalid: string[] | undefined;
	for (const [name, value] of snapshot) {
		if (
			name === 'key' ||
			name === 'ref' ||
			name === 'children' ||
			name === 'class' ||
			name === 'className' ||
			name === 'style' ||
			name === 'dangerouslySetInnerHTML' ||
			isAriaAttributeName(name)
		) {
			continue;
		}
		if (name.length > 2 && name[0] === 'o' && name[1] === 'n') {
			if (typeof value === 'string') {
				const warning = hostPropertyWarning(name, value);
				if (warning !== null) devWarnSsrAttributeOnce(name, warning);
			}
			continue;
		}
		const warning = hostPropertyWarning(
			name,
			value,
			tag,
			resolveAttributeNamespace(namespace) === 'svg',
		);
		if (warning !== null) {
			devWarnSsrAttributeOnce(name, warning);
			continue;
		}
		if (typeof value !== 'function' && typeof value !== 'symbol') continue;
		if (
			typeof value === 'function' &&
			((tag === 'form' && name === 'action') ||
				((tag === 'button' || tag === 'input') && (name === 'formAction' || name === 'formaction')))
		) {
			continue;
		}
		if (DEV_SSR_ATTRIBUTE_WARNINGS?.has(name)) continue;
		(DEV_SSR_ATTRIBUTE_WARNINGS ??= new Set()).add(name);
		(invalid ??= []).push(name);
	}
	if (invalid !== undefined) console.error(invalidHostPropertiesWarning(invalid, tag));
}

/**
 * A dynamic attribute: ` name="value"`, ` name` for `true`, or '' to omit.
 * `tag` and `namespace` (when the emit site knows them) gate the tag-sensitive
 * React-parity rules: HTML custom elements get RAW attribute
 * semantics (no alias, no value tables), and the empty-URL strip exempts
 * `<a>`/`<area>` href. Mirrors the client's setAttribute policies (runtime.ts).
 */
export function ssrAttr(
	name: string,
	v: unknown,
	tag?: string,
	namespace: AttributeNamespace = 'html',
): string {
	namespace = resolveAttributeNamespace(namespace);
	const isCustomTag = namespace === 'html' && tag !== undefined && tag.indexOf('-') !== -1;
	if (
		process.env.NODE_ENV !== 'production' &&
		!isCustomTag &&
		tag !== undefined &&
		DEV_SSR_CUSTOM_HOST_DEPTH === 0
	) {
		const warning = isAriaAttributeName(name)
			? ariaAttributeWarning(name, tag)
			: hostPropertyWarning(
					name === 'formaction' && v === null && (tag === 'button' || tag === 'input')
						? 'formAction'
						: name,
					v,
					tag,
					namespace === 'svg',
				);
		if (warning !== null) devWarnSsrAttributeOnce(name, warning);
	}
	// React-parity aliases (ATTRIBUTE_ALIASES, constants.ts): `htmlFor` → `for`,
	// `strokeWidth` → `stroke-width`, `xlinkHref` → `xlink:href`, … — serialize
	// the attribute the browser actually parses, byte-matching the client's
	// setAttribute writes (hydration parity). Custom elements get their props
	// VERBATIM (no alias tables) — React parity.
	if (!isCustomTag) {
		// Server markup carries browser-native autofocus even though client mounts
		// perform focus at commit without writing this attribute.
		if (name === 'autoFocus') {
			return v && typeof v !== 'function' && typeof v !== 'symbol' ? ' autofocus=""' : '';
		}
		const alias = ATTRIBUTE_ALIASES.get(name);
		if (alias !== undefined) name = alias;
		else if (
			process.env.NODE_ENV !== 'production' &&
			(tag === 'button' || tag === 'input') &&
			name === 'formAction'
		) {
			name = 'formaction';
		}
	}
	// `class` / `className` clsx-compose so arrays / objects serialise the same string
	// the client writes (a nullish/false class still drops out; a truthy-but-empty
	// compose emits `class=""`, matching `el.className = ''`).
	if (name === 'class') {
		if (v == null || v === false) return '';
		return ' class="' + escapeAttr(normalizeClass(v)) + '"';
	}
	// `aria-*` attributes are ENUMERATED (React parity): `false` serialises as "false"
	// and `true` as "true"; only null/undefined drops them.
	if (name.charCodeAt(0) === 97 /* a */ && name.startsWith('aria-')) {
		if (v == null) return '';
		return ' ' + name + '="' + escapeAttr(String(v)) + '"';
	}
	// React-only warning-suppression hints never serialize (client parity).
	if (
		name === 'suppressContentEditableWarning' ||
		name === 'suppressHydrationWarning' ||
		name === 'suppressNativeChangeWarning' ||
		name === '__octaneNativeChangeDiagnostic'
	)
		return '';
	const t = typeof v;
	// spellcheck / contenteditable / draggable are ENUMERATED — a boolean
	// stringifies ("false" is a real state; absent means inherit). Global
	// attributes, so custom elements included (mirrors coerceAttrValue).
	if (t === 'boolean' && isEnumeratedBooleanAttr(name)) {
		return ' ' + name + '="' + v + '"';
	}
	// data-* attributes stringify booleans on EVERY element (custom included —
	// the client writes the same): `data-x={false}` → "false"; a dataset
	// consumer reads the string, so dropping/bare-ing loses the value.
	if (t === 'boolean' && name.startsWith('data-')) {
		return ' ' + name + '="' + v + '"';
	}
	// Function/symbol values are never meaningful attribute text (client parity:
	// setAttribute removes them) — stringifying a function leaks source into markup.
	if (t === 'function' || t === 'symbol') {
		// React 19 function actions are submit wiring, not invalid attribute text.
		// The compiler handles direct sites before this helper; retain the same
		// exception for descriptor/spread paths that arrive here through ssrAttrEntry.
		if (
			t === 'function' &&
			((tag === 'form' && name === 'action') ||
				((tag === 'button' || tag === 'input') && name === 'formaction'))
		) {
			return '';
		}
		if (process.env.NODE_ENV !== 'production' && !isCustomTag && tag !== undefined) {
			if (
				t === 'function' &&
				name.length > 2 &&
				name.charCodeAt(0) === 111 /* o */ &&
				name.charCodeAt(1) === 110 /* n */
			) {
				devWarnSsrAttributeOnce(
					name,
					`Unknown event handler property \`${name}\` was dropped — did you mean ` +
						`\`on${name.charAt(2).toUpperCase()}${name.slice(3)}\`? (lowercase on* ` +
						'attributes never write; octane delegates camelCase handlers natively)',
				);
			} else {
				devWarnSsrAttributeOnce(
					name,
					`Invalid value for prop \`${name}\` on <${tag}> tag. ` +
						'Either remove it from the element, or pass a string or number value to keep it in the DOM.',
				);
			}
		}
		return '';
	}
	if (!isCustomTag) {
		// Unknown lowercase `on*` attributes are dropped on standard elements (React
		// nulls them — an event-ish name with a string payload is markup-injection
		// surface, not an attribute). Custom elements keep them (raw semantics), and
		// the bare `on` attribute (AMP) passes. CamelCase onX events never reach
		// here — the compiler / ssrAttrEntry filter them earlier.
		if (name.length > 2 && name.charCodeAt(0) === 111 /* o */ && name.charCodeAt(1) === 110) {
			return '';
		}
		const lower = name.toLowerCase();
		// React's boolean-attr table (constants.ts): ANY truthy value serializes
		// the canonical `attr=""` presence form, falsy drops — mirroring the
		// client's coerceAttrValue byte-for-byte (hydration parity).
		if (BOOLEAN_ATTR_PROPS.has(lower)) {
			if (process.env.NODE_ENV !== 'production' && tag !== undefined) {
				const warning = booleanAttributeStringWarning(name, v);
				if (warning !== null) devWarnSsrAttributeOnce(name, warning);
			}
			return v ? ' ' + lower + '=""' : '';
		}
		// The OVERLOADED booleans (download/capture): boolean values get
		// presence semantics; everything else passes through verbatim below
		// (`download={0}` → "0", like React).
		if (t === 'boolean' && (lower === 'download' || lower === 'capture')) {
			return v ? ' ' + lower + '=""' : '';
		}
		// mustUseProperty props serialize their INITIAL state as the attribute
		// (the client's dynamic writes go to the property; the parser sets the
		// property from this attribute at creation).
		if (MUST_USE_PROPERTY_PROPS.has(lower)) {
			return v ? ' ' + lower + '=""' : '';
		}
		// Booleans on non-boolean attributes never serialize (client parity:
		// `title={true}` removes).
		if (t === 'boolean') {
			if (process.env.NODE_ENV !== 'production' && tag !== undefined) {
				devWarnSsrAttributeOnce(
					name,
					`Received \`${v}\` for a non-boolean attribute \`${name}\`. ` +
						(v === true
							? `If you want to write it to the DOM, pass a string instead: ` +
								`${name}="true" or ${name}={value.toString()}.`
							: `If you used to conditionally omit it with ${name}={condition && value}, ` +
								`pass ${name}={condition ? value : undefined} instead.`),
				);
			}
			return '';
		}
		if (POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(Number(v) >= 1)) return '';
	}
	if (v == null || v === false) return '';
	// A plain object has no useful attribute representation. Objects with an
	// intentional toString retain their normal coercion and stay silent.
	if (
		process.env.NODE_ENV !== 'production' &&
		!isCustomTag &&
		tag !== undefined &&
		t === 'object' &&
		(v as object).toString === Object.prototype.toString
	) {
		devWarnSsrAttributeOnce(
			name,
			`The provided \`${name}\` attribute is an object; it will stringify to ` +
				'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
		);
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		!isCustomTag &&
		tag !== undefined &&
		t === 'number' &&
		Number.isNaN(v)
	) {
		devWarnSsrAttributeOnce(
			name,
			`Received NaN for the \`${name}\` attribute. If this is expected, cast the value to a string.`,
		);
	}
	let s: string;
	if (process.env.NODE_ENV !== 'production' && !isCustomTag && tag !== undefined) {
		try {
			s = v === true ? '' : String(v);
		} catch (error) {
			devWarnSsrAttributeOnce(name, unsupportedAttributeCoercionWarning(name, v));
			throw error;
		}
	} else {
		s = v === true ? '' : String(v);
	}
	// An empty `src`/`href`/`<object data>` resolves to the CURRENT PAGE's URL — browsers would
	// re-fetch the whole document as an image/script/stylesheet. React strips
	// these; so does the client's setAttribute (element-agnostic, custom
	// elements included — and `true` coerces to '' first, exactly like the
	// client). `<a href="">`/`<area href="">` stays — an empty href is a
	// legitimate "link to this page".
	if (
		s === '' &&
		(name === 'src' ||
			(name === 'href' && tag !== undefined && tag !== 'a' && tag !== 'area') ||
			(name === 'data' && tag === 'object'))
	) {
		if (process.env.NODE_ENV !== 'production' && !isCustomTag && tag !== undefined) {
			devWarnSsrAttributeOnce('empty:' + name, emptyResourceUrlWarning(name));
		}
		return '';
	}
	if (v === true) return ' ' + name;
	return ' ' + name + '="' + escapeAttr(sanitizeURLAttribute(tag, name, s)) + '"';
}

function styleObjectToCss(obj: Record<string, unknown>): string {
	let out = '';
	for (const k in obj) {
		const val = obj[k];
		// Booleans never serialize (client parity: `fontFamily: true` clears, it
		// must not emit the literal string "true").
		if (val == null || typeof val === 'boolean') continue;
		// React parity: numeric values get `px` (except 0 / unitless / custom props).
		let serialized: string;
		if (process.env.NODE_ENV !== 'production' && SSR_NESTING_WARNINGS !== null) {
			devWarnStyleProperty(k, val, true);
			try {
				serialized = cssStyleValue(k, val);
			} catch (error) {
				devWarnStyleCoercion(k, val);
				throw error;
			}
		} else {
			serialized = cssStyleValue(k, val);
		}
		// An empty result would serialize as `color:;`, which the client never
		// produces: setProperty with an empty value removes the declaration. Emitting
		// it would make the server markup unhydratable.
		if (serialized === '') continue;
		out += styleName(k) + ':' + serialized + ';';
	}
	return out;
}

/** A dynamic `style` attribute (string cssText or an object). */
export function ssrStyle(v: unknown): string {
	if (v == null || v === false || v === '') return '';
	const css = typeof v === 'string' ? v : styleObjectToCss(v as Record<string, unknown>);
	if (!css) return '';
	return ' style="' + escapeAttr(css) + '"';
}

// VALID_ATTR_NAME (shared, constants.ts) rejects spread keys that would inject
// markup (e.g. 'x onload=alert(1)' or 'a>'); the client's setAttribute applies
// the identical gate.

// Legal element tag name (React's VALID_TAG_REGEX): letters first, then
// letters/digits/`:`/`.`/`-`/`_`. Anything else could open/close markup.
const VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9:._-]*$/;

// One prop entry → its ` name="value"` attribute fragment (or ''). The shared
// filter/route used by ssrHostElement's attr loop and ssrSpread: key/ref/children
// never serialize, `suppressHydrationWarning` is a client-only hydration hint,
// onX events have no server semantics (no DOM), `style` / `className` / `class`
// route to their dedicated serializers, and VALID_ATTR_NAME rejects
// injection-unsafe names. `dangerouslySetInnerHTML` is element CONTENT, not an
// attribute — callers must intercept it BEFORE routing an entry here.
function ssrAttrEntry(
	k: string,
	v: unknown,
	tag?: string,
	namespace: AttributeNamespace = 'html',
): string {
	namespace = resolveAttributeNamespace(namespace);
	if (k === 'key' || k === 'ref' || k === 'children') return '';
	if (
		k === 'suppressHydrationWarning' ||
		k === 'suppressContentEditableWarning' ||
		k === 'suppressNativeChangeWarning' ||
		k === '__octaneNativeChangeDiagnostic'
	)
		return '';
	if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && k[2] >= 'A' && k[2] <= 'Z') return '';
	if (k === 'style') return ssrStyle(v);
	if (k === 'className' || k === 'class') return ssrAttr('class', v, tag, namespace);
	if (VALID_ATTR_NAME.test(k)) return ssrAttr(k, v, tag, namespace);
	return '';
}

type SsrAttributeSource = readonly [isSpread: boolean, sourceOrName: unknown, value?: unknown];

function normalizeSsrAttributeName(
	name: string,
	tag: string | undefined,
	namespace: AttributeNamespace,
): string {
	namespace = resolveAttributeNamespace(namespace);
	if (name === 'className') return 'class';
	const isCustom = namespace === 'html' && tag !== undefined && tag.indexOf('-') !== -1;
	if (!isCustom) return ATTRIBUTE_ALIASES.get(name) ?? name;
	return name;
}

function isAggregatedFormAttribute(tag: string | undefined, name: string): boolean {
	if (name === 'value' || name === 'defaultValue') {
		return tag === 'input' || tag === 'textarea' || tag === 'select';
	}
	if (tag === 'input' && (name === 'checked' || name === 'defaultChecked')) return true;
	return tag === 'select' && name === 'multiple';
}

/**
 * Resolve all serializable attributes across direct JSX writers and spread
 * snapshots. HTML parsers keep the first duplicate attribute, while JSX props
 * use last-write wins; collecting by the normalized native name before
 * serialization keeps server markup aligned with client application. Repeated
 * writes of the same JSX prop retain its first insertion position like
 * Object.assign. Distinct aliases that target one native attr still choose the
 * latest authored writer and retain that winning prop's insertion position.
 */
export function ssrAttrs(
	sources: readonly SsrAttributeSource[],
	tag?: string,
	namespace: AttributeNamespace = 'html',
	skipFormControls = false,
): string {
	namespace = resolveAttributeNamespace(namespace);
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

	for (const [isSpread, sourceOrName, directValue] of sources) {
		if (!isSpread) {
			record(sourceOrName, directValue);
			continue;
		}
		const source = sourceOrName;
		if (source == null || (typeof source !== 'object' && typeof source !== 'function')) {
			continue;
		}
		for (const name of Object.keys(Object(source))) {
			record(name, (source as Record<string, unknown>)[name]);
		}
	}

	const resolved = new Map<
		string,
		readonly [name: string, value: unknown, firstOrder: number, lastOrder: number]
	>();
	let needsWinningOrderSort = false;
	for (const writer of props.values()) {
		const { rawName, value, firstOrder, lastOrder } = writer;
		if (
			rawName === 'key' ||
			rawName === 'ref' ||
			rawName === 'children' ||
			rawName === 'dangerouslySetInnerHTML' ||
			rawName === 'suppressHydrationWarning' ||
			rawName === 'suppressContentEditableWarning' ||
			rawName === 'suppressNativeChangeWarning' ||
			rawName === '__octaneNativeChangeDiagnostic'
		)
			continue;
		if (skipFormControls && isAggregatedFormAttribute(tag, rawName)) continue;
		if (rawName.length > 2 && rawName[0] === 'o' && rawName[1] === 'n') {
			const c = rawName.charCodeAt(2);
			if (c >= 65 && c <= 90) continue;
		}
		const name = normalizeSsrAttributeName(rawName, tag, namespace);
		if (!VALID_ATTR_NAME.test(name)) continue;
		// Attribute identity is ASCII-case-insensitive in the HTML namespace.
		// SVG/MathML retain their case-sensitive qualified names.
		const identity = namespace === 'html' ? name.toLowerCase() : name;
		const previous = resolved.get(identity);
		if (previous !== undefined) {
			if (previous[3] >= lastOrder) continue;
			// Map order already matches firstOrder unless a later raw alias replaces
			// an earlier normalized identity without moving its Map entry.
			needsWinningOrderSort = true;
		}
		resolved.set(identity, [
			process.env.NODE_ENV !== 'production' && (rawName === 'tabIndex' || rawName === 'htmlFor')
				? rawName
				: name,
			value,
			firstOrder,
			lastOrder,
		]);
	}

	let out = '';
	const ordered = [...resolved.values()];
	if (needsWinningOrderSort) ordered.sort((a, b) => a[2] - b[2]);
	if (process.env.NODE_ENV !== 'production') {
		devValidateSsrAriaProps(
			ordered.map(([name]) => name),
			tag,
			namespace,
		);
		devValidateSsrHostProps(
			ordered.map(([name, value]) => [name, value] as const),
			tag,
			namespace,
		);
		if (tag === 'form' || tag === 'button' || tag === 'input') {
			const formProps: Record<string, unknown> = Object.create(null);
			for (const [name, value] of ordered) formProps[name] = value;
			const action =
				tag === 'form' ? formProps.action : (formProps.formAction ?? formProps.formaction);
			if (typeof action === 'function') devValidateSsrFormProps(tag, formProps);
		}
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		ordered.some(([name, value]) => name === 'is' && typeof value === 'string')
	) {
		DEV_SSR_CUSTOM_HOST_DEPTH++;
		try {
			for (const [name, value] of ordered) out += ssrAttrEntry(name, value, tag, namespace);
		} finally {
			DEV_SSR_CUSTOM_HOST_DEPTH--;
		}
	} else {
		for (const [name, value] of ordered) {
			out += ssrAttrEntry(name, value, tag, namespace);
		}
	}
	return out;
}

/**
 * Resolve direct and spread class writers to one native `class` attribute.
 * `sources` are `[isSpread, value]` pairs in authoring order. A spread only
 * participates when it actually enumerates `class` or `className`; the last
 * participating writer wins, matching the client's source-ordered setters.
 */
export function ssrClass(sources: Array<[boolean, unknown]>): string {
	let found = false;
	let value: unknown;
	for (const [isSpread, source] of sources) {
		if (!isSpread) {
			found = true;
			value = source;
			continue;
		}
		if (source == null || (typeof source !== 'object' && typeof source !== 'function')) continue;
		for (const key of Object.keys(Object(source))) {
			if (key === 'class' || key === 'className') {
				found = true;
				value = (source as Record<string, unknown>)[key];
			}
		}
	}
	return found ? ssrAttr('class', value) : '';
}

/**
 * Snapshot one JSX spread with Object.assign semantics. Only own enumerable
 * string keys participate, and getters run once at the spread's authored
 * evaluation position before later direct prop expressions.
 */
export function ssrSnapshotSpread(obj: unknown): Record<string, unknown> | null {
	if (obj == null) return null;
	const source = Object(obj) as Record<PropertyKey, unknown>;
	const snapshot: Record<string, unknown> = Object.create(null);
	// Object spread evaluates every own enumerable key, including symbols. The
	// DOM router ignores symbol props, but their getters still run at the spread's
	// authored position; retain only string keys after performing each read.
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		const value = source[key];
		if (typeof key === 'string') snapshot[key] = value;
	}
	return snapshot;
}

/** A spread `{...obj}`: serialize attr-like keys; drop events/refs/key/children. */
export function ssrSpread(
	obj: unknown,
	tag?: string,
	skipClass = false,
	namespace: AttributeNamespace = 'html',
	skipFormControls = false,
): string {
	namespace = resolveAttributeNamespace(namespace);
	if (obj == null) return '';
	if (process.env.NODE_ENV !== 'production') {
		devValidateSsrAriaProps(Object(obj) as Record<string, unknown>, tag, namespace);
		devValidateSsrHostProps(Object(obj) as Record<string, unknown>, tag, namespace);
	}
	let out = '';
	for (const k of Object.keys(Object(obj))) {
		// When direct and spread class writers coexist, the compiler emits one
		// ssrClass call after all sources. Do not manufacture duplicate native
		// class attributes here: HTML parsing would keep the wrong (first) one.
		if (skipClass && (k === 'class' || k === 'className')) continue;
		// Native form controls with any spread resolve their controlled/default
		// cascades through one tag-specific helper. Skip those keys here so input
		// never sees duplicate value/checked attrs, textarea never receives a value
		// attr instead of content, and select can project its value onto options.
		if (
			skipFormControls &&
			(k === 'value' || k === 'defaultValue') &&
			(tag === 'input' || tag === 'textarea' || tag === 'select')
		)
			continue;
		if (skipFormControls && tag === 'input' && (k === 'checked' || k === 'defaultChecked'))
			continue;
		if (skipFormControls && tag === 'select' && k === 'multiple') continue;
		// A spread `dangerouslySetInnerHTML` is element content, not an attribute —
		// the compiler collects it at the emit site (compile.js `htmlSources`, which
		// feeds `ssrInnerHtml`), so the attr serializer drops it here.
		if (k === 'dangerouslySetInnerHTML') continue;
		out += ssrAttrEntry(k, (obj as Record<string, unknown>)[k], tag, namespace);
	}
	return out;
}

// Pick the effective `dangerouslySetInnerHTML` content from `[present, value]`
// sources in JSX order. A present null/undefined value disables an earlier writer;
// an omitted spread key does not. When raw HTML is active, probe dynamic children
// exactly once so only null/undefined coexist; the compiler separately reports
// definitely-present static children without evaluating their render bodies.
export function ssrInnerHtml(
	sources: readonly (readonly [boolean, unknown])[],
	renderChildren?: () => string,
	definitelyHasChildren = false,
	childrenSources: readonly (readonly [boolean, unknown])[] = [],
): string | undefined {
	for (let i = sources.length - 1; i >= 0; i--) {
		const [present, value] = sources[i];
		if (!present) continue;
		if (value == null) return undefined;
		if (typeof value !== 'object' || !('__html' in value)) {
			throw new Error(formatServerError(6));
		}
		let childValue: unknown;
		let hasChildSource = false;
		for (let childI = childrenSources.length - 1; childI >= 0; childI--) {
			if (!childrenSources[childI][0]) continue;
			hasChildSource = true;
			childValue = childrenSources[childI][1];
			break;
		}
		if (definitelyHasChildren || (hasChildSource && childValue != null)) {
			throw new Error(formatServerError(5));
		}
		if (renderChildren !== undefined) {
			DANGER_HTML_CHILD_PROBE++;
			try {
				renderChildren();
			} finally {
				DANGER_HTML_CHILD_PROBE--;
			}
		}
		const html = (value as { __html?: unknown }).__html;
		return html == null ? '' : String(html);
	}
	return undefined;
}

// Like React's style-text serializer, replace only the `s` in a case-insensitive
// `<style` / `</style` token. The CSS escape keeps the stylesheet semantics while
// preventing the HTML parser from terminating the element early.
const INLINE_STYLE_TOKEN = /(<\/|<)(s)(tyle)/gi;

function escapeEntireInlineStyleContent(value: string): string {
	return value.replace(
		INLINE_STYLE_TOKEN,
		(_match, prefix: string, s: string, suffix: string) =>
			`${prefix}${s === 's' ? '\\73 ' : '\\53 '}${suffix}`,
	);
}

// React's whole-inline-script escape: replace only the `s` in each case-
// insensitive `<script` / `</script` token. The resulting `\u0073` / `\u0053`
// stays valid JavaScript while preventing the HTML parser from opening or closing
// a script element early. Other `<`, `>`, `&`, U+2028 and U+2029 characters remain
// untouched because they can be meaningful JavaScript syntax.
const INLINE_SCRIPT_TOKEN = /(<\/|<)(s)(cript)/gi;

function escapeEntireInlineScriptContent(value: string): string {
	return value.replace(
		INLINE_SCRIPT_TOKEN,
		(_match, prefix: string, s: string, suffix: string) =>
			`${prefix}${s === 's' ? '\\u0073' : '\\u0053'}${suffix}`,
	);
}

/**
 * Resolve source-ordered `dangerouslySetInnerHTML` writers for a script and make
 * the resulting whole-script body safe to concatenate into an HTML response.
 * `undefined` still means "no writer", preserving the normal children fallback.
 */
export function ssrScriptInnerHtml(
	sources: readonly (readonly [boolean, unknown])[],
	renderChildren?: () => string,
	definitelyHasChildren = false,
	childrenSources: readonly (readonly [boolean, unknown])[] = [],
): string | undefined {
	const html = ssrInnerHtml(sources, renderChildren, definitelyHasChildren, childrenSources);
	return html === undefined ? undefined : escapeEntireInlineScriptContent(html);
}

function finalPresentSource(
	sources: readonly (readonly [boolean, unknown])[],
): readonly [present: boolean, value: unknown] {
	for (let i = sources.length - 1; i >= 0; i--) {
		if (sources[i][0]) return [true, sources[i][1]];
	}
	return [false, undefined];
}

/**
 * Render the effective direct/spread `children` prop for an otherwise empty
 * host. Prop-driven content is the host's sole child, so primitive text stays
 * markerless while descriptors/lists retain the normal child-slot framing.
 */
export function ssrChildrenSources(
	sources: readonly (readonly [boolean, unknown])[],
	renderFallback: () => string,
	scope: SSRScope,
): string {
	const child = finalPresentSource(sources);
	return child[0] ? ssrChildText(child[1], scope) : renderFallback();
}

/**
 * Resolve the content of an otherwise empty ordinary host with one JSX spread.
 * The compiler has already snapshotted every enumerable own getter in authored
 * order, so direct reads here neither repeat those getters nor see inherited
 * properties. Keeping this narrow avoids source-pair arrays and fallback
 * closures while retaining React's raw-HTML validation and child-slot behavior.
 */
export function ssrSpreadContent(
	snapshot: Record<string, unknown> | null,
	scope: SSRScope,
): string {
	if (snapshot === null) return '';
	const html = snapshot.dangerouslySetInnerHTML;
	const child = snapshot.children;
	if (html != null) {
		if (typeof html !== 'object' || !('__html' in html)) {
			throw new Error(formatServerError(6));
		}
		if (child != null) throw new Error(formatServerError(5));
		const value = (html as { __html?: unknown }).__html;
		return value == null ? '' : String(value);
	}
	return child === undefined ? '' : ssrChildText(child, scope);
}

/** Validate runtime spread/direct content props before closing a void host. */
export function ssrVoidContent(
	tag: string,
	dangerSources: readonly (readonly [boolean, unknown])[],
	childrenSources: readonly (readonly [boolean, unknown])[],
): string {
	const danger = finalPresentSource(dangerSources);
	const children = finalPresentSource(childrenSources);
	if ((danger[0] && danger[1] != null) || (children[0] && children[1] != null)) {
		throw new Error(formatServerError(8, tag));
	}
	return '';
}

// ---------------------------------------------------------------------------
// Controlled form serialization — the server halves of the client runtime's
// setValue/setChecked/setSelectValue/setDefaultValue helpers (runtime.ts).
// <input> serializes value/checked as attributes (the parser turns them into
// the DOM defaults the client mount would have written); <textarea> emits the
// value as its text content; <select> emits NO attribute — a scope stack lets
// every <option> serialized inside mark itself ` selected`.
// ---------------------------------------------------------------------------

function devValidateSsrFormProps(
	tag: string,
	props: Record<string, unknown>,
	children?: unknown,
): void {
	if (
		process.env.NODE_ENV === 'production' ||
		SSR_NESTING_WARNINGS === null ||
		CURRENT_SSR_ELEMENT === null ||
		(tag !== 'input' &&
			tag !== 'textarea' &&
			tag !== 'select' &&
			tag !== 'option' &&
			tag !== 'form' &&
			tag !== 'button')
	) {
		return;
	}
	for (const warning of formAuthoringDiagnostics(tag, props, children)) {
		console.error(warning.message);
	}
}

/** DEV-only compiler target: validate final function-action props without emitting HTML. */
export function ssrFormAuthoringDiagnostics(
	tag: string,
	sources: readonly (readonly [name: string, value: unknown])[],
): string {
	if (process.env.NODE_ENV !== 'production' && SSR_NESTING_WARNINGS !== null) {
		const props: Record<string, unknown> = Object.create(null);
		for (const [name, value] of sources) props[name] = value;
		devValidateSsrFormProps(tag, props);
	}
	return '';
}

/**
 * The `value` attribute for a controlled/default `<input>` value. Mirrors the
 * client's toControlledString exactly — `value={false}` serializes "false"
 * (the generic ssrAttr would DROP a false boolean); only nullish omits.
 */
export function ssrValueAttr(v: unknown): string {
	if (v == null) return '';
	return ' value="' + escapeAttr(typeof v === 'string' ? v : String(v)) + '"';
}

/** The `checked` attribute (presence semantics; mirrors setChecked's `!!v`). */
export function ssrCheckedAttr(v: unknown): string {
	return v == null || !v ? '' : ' checked';
}

/**
 * Resolve `<input>`'s value/defaultValue and checked/defaultChecked cascades
 * across direct props and spreads. HTML keeps the first duplicate attribute,
 * so the compiler must emit one effective native attribute for each cascade.
 * Controlled writers win over default writers regardless of source order;
 * repeated writers of the same prop retain normal last-write-wins semantics.
 */
export function ssrInputAttrs(
	sources: Array<readonly [isSpread: boolean, sourceOrName: unknown, value?: unknown]>,
): string {
	const props = resolveFormControlSources(sources);
	if (process.env.NODE_ENV !== 'production') {
		devValidateSsrFormProps('input', {
			value: props.value,
			defaultValue: props.defaultValue,
			checked: props.checked,
			defaultChecked: props.defaultChecked,
		});
	}
	return (
		ssrValueAttr(props.value ?? props.defaultValue) +
		ssrCheckedAttr(props.checked ?? props.defaultChecked)
	);
}

type SsrFormControlSource = readonly [isSpread: boolean, sourceOrName: unknown, value?: unknown];

interface ResolvedFormControlSources {
	value: unknown;
	defaultValue: unknown;
	checked: unknown;
	defaultChecked: unknown;
	multiple: unknown;
	hasValue: boolean;
	hasDefaultValue: boolean;
	hasMultiple: boolean;
}

/** Resolve source-ordered direct/spread form writers with JSX last-write wins. */
function resolveFormControlSources(
	sources: readonly SsrFormControlSource[],
): ResolvedFormControlSources {
	const resolved: ResolvedFormControlSources = {
		value: undefined,
		defaultValue: undefined,
		checked: undefined,
		defaultChecked: undefined,
		multiple: undefined,
		hasValue: false,
		hasDefaultValue: false,
		hasMultiple: false,
	};
	for (const [isSpread, sourceOrName, directValue] of sources) {
		if (isSpread) {
			const source = sourceOrName;
			if (source == null || (typeof source !== 'object' && typeof source !== 'function')) {
				continue;
			}
			for (const name of Object.keys(Object(source))) {
				const next = (source as Record<string, unknown>)[name];
				if (name === 'value') {
					resolved.hasValue = true;
					resolved.value = next;
				} else if (name === 'defaultValue') {
					resolved.hasDefaultValue = true;
					resolved.defaultValue = next;
				} else if (name === 'checked') resolved.checked = next;
				else if (name === 'defaultChecked') resolved.defaultChecked = next;
				else if (name === 'multiple') {
					resolved.hasMultiple = true;
					resolved.multiple = next;
				}
			}
			continue;
		}
		if (sourceOrName === 'value') {
			resolved.hasValue = true;
			resolved.value = directValue;
		} else if (sourceOrName === 'defaultValue') {
			resolved.hasDefaultValue = true;
			resolved.defaultValue = directValue;
		} else if (sourceOrName === 'checked') resolved.checked = directValue;
		else if (sourceOrName === 'defaultChecked') resolved.defaultChecked = directValue;
		else if (sourceOrName === 'multiple') {
			resolved.hasMultiple = true;
			resolved.multiple = directValue;
		}
	}
	return resolved;
}

/**
 * Controlled `<textarea>` content: escaped text + the leading-newline guard
 * (the parser eats a '\n' right after the opening tag — see ssrTextPre).
 * Mirrors the client's toControlledString (booleans/numbers stringify).
 */
export function ssrTextareaValue(v: unknown): string {
	if (v == null) return '';
	const s = escapeHtml(typeof v === 'string' ? v : String(v));
	return s.charCodeAt(0) === 10 ? '\n' + s : s;
}

/**
 * Resolve direct and spread textarea value/defaultValue writers. A nullish
 * effective value is uncontrolled and leaves ordinary authored children in
 * place, matching the client helpers' no-op for null/undefined.
 */
export function ssrTextareaValueSources(
	sources: readonly SsrFormControlSource[],
): string | undefined {
	const props = resolveFormControlSources(sources);
	if (process.env.NODE_ENV !== 'production') {
		devValidateSsrFormProps('textarea', {
			value: props.value,
			defaultValue: props.defaultValue,
		});
	}
	const value = props.value ?? props.defaultValue;
	return value == null ? undefined : ssrTextareaValue(value);
}

/** Serialize one effective select `multiple` attribute across JSX sources. */
export function ssrSelectAttrs(sources: readonly SsrFormControlSource[]): string {
	const props = resolveFormControlSources(sources);
	return props.hasMultiple ? ssrAttr('multiple', props.multiple, 'select') : '';
}

// The active controlled-<select> scopes. A MODULE-LEVEL stack (not an SSRScope
// field): SSR rendering is a synchronous nested call tree, so the stack
// naturally survives component boundaries and @for bodies, and try/finally
// keeps it balanced across throws/suspensions.
interface SelectScope {
	single: string | null;
	multi: Set<string> | null;
}
const SELECT_STACK: SelectScope[] = [];

/**
 * Serialize a controlled `<select>`'s children under a projection scope:
 * every `<option>` rendered inside (compiled or de-opt, any nesting) consults
 * the innermost scope via ssrOption and marks itself ` selected` on match —
 * the server analogue of the client's projectSelectValue. `value` wins over
 * `defaultValue` (the client cascade). A no-match single select needs no
 * server work: the parser selects the first option natively, matching the
 * client's first-non-disabled fallback for the overwhelmingly common case.
 */
export function ssrSelectScope(
	value: unknown,
	defaultValue: unknown,
	multiple: unknown,
	children: () => string,
): string {
	if (process.env.NODE_ENV !== 'production') {
		devValidateSsrFormProps('select', { value, defaultValue, multiple });
	}
	const v = value != null ? value : defaultValue;
	let frame: SelectScope;
	if (v == null) {
		frame = { single: null, multi: null };
	} else if (multiple) {
		frame = Array.isArray(v)
			? { single: null, multi: new Set(v.map((x) => String(x))) }
			: { single: null, multi: null };
	} else {
		frame = Array.isArray(v) ? { single: null, multi: null } : { single: String(v), multi: null };
	}
	SELECT_STACK.push(frame);
	try {
		return children();
	} finally {
		SELECT_STACK.pop();
	}
}

/** Resolve spread/direct select props, then project the effective value. */
export function ssrSelectScopeSources(
	sources: readonly SsrFormControlSource[],
	children: () => string,
): string {
	const props = resolveFormControlSources(sources);
	return ssrSelectScope(props.value, props.defaultValue, props.multiple, children);
}

// Reverse escapeHtml for an option's TEXT content — the React fallback compare
// key when the option carries no `value` attribute. Only the entities
// escapeHtml produces (& < >) need reversing; order matters (&amp; last).
function unescapeOptionText(s: string): string {
	if (s.indexOf('&') === -1) return s;
	return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Return the final raw option value from the same source set as ssrAttrs. */
export function ssrOptionValueSources(sources: readonly SsrAttributeSource[]): unknown {
	let value: unknown;
	for (const [isSpread, sourceOrName, directValue] of sources) {
		if (!isSpread) {
			if (sourceOrName === 'value') value = directValue;
			continue;
		}
		const source = sourceOrName;
		if (source == null || (typeof source !== 'object' && typeof source !== 'function')) {
			continue;
		}
		if (Object.prototype.propertyIsEnumerable.call(Object(source), 'value')) {
			value = (source as Record<string, unknown>).value;
		}
	}
	return value;
}

/**
 * Assemble one `<option>`: `attrs` are its serialized attributes (its value
 * attribute included when present), `content` its serialized children,
 * `value` the RAW value prop (undefined = none → the option's flattened text
 * is the compare key, per React). Returns a plain option when no controlled
 * select scope is active.
 */
export function ssrOption(
	value: unknown,
	attrs: string,
	content: string,
	complexAuthoredChildren = false,
): string {
	if (process.env.NODE_ENV !== 'production' && SSR_NESTING_WARNINGS !== null) {
		if (/(?:^|\s)selected(?:\s|=|$)/i.test(attrs)) {
			devValidateSsrFormProps('option', { value, selected: true });
		}
		if (value == null && complexAuthoredChildren) {
			devValidateSsrFormProps('option', { value }, {});
		}
	}
	return '<option' + attrs + ssrOptionSelected(value, content) + '>' + content + '</option>';
}

function ssrOptionSelected(value: unknown, content: string): string {
	if (SELECT_STACK.length === 0) return '';
	const scope = SELECT_STACK[SELECT_STACK.length - 1];
	if (scope.single === null && scope.multi === null) return '';
	let key: string;
	if (value != null) {
		key = String(value);
	} else {
		// Content carrying markup (nested elements / hydration markers) skips
		// the text fallback — React flattens simple text children only.
		if (content.indexOf('<') !== -1) return '';
		key = unescapeOptionText(content);
	}
	if (scope.multi !== null) return scope.multi.has(key) ? ' selected' : '';
	return scope.single === key ? ' selected' : '';
}

// ---------------------------------------------------------------------------
// Render-phase state updates. React's server renderer PROCESSES a useState/
// useReducer dispatch fired while its own component is rendering: the update is
// queued and the body re-invokes until a pass fires no dispatch (Fizz's
// `didScheduleRenderPhaseUpdate` loop, capped at 25). Dispatches from anywhere
// else — after the pass, or from a different component — are inert, exactly like
// Fizz's `componentIdentity` gate. State lives only for the enclosing body
// invocation (a suspense retry pass re-initializes, as in Fizz).
//
// Hook records are keyed by the compiler-injected call-site slot plus a per-pass
// occurrence index (the client's slot-keyed model — hooks may sit behind
// conditions, so call ORDER can differ between passes but a slot cannot). A
// custom-hook body's slot-less calls key off the enclosing `withSlot` symbol,
// and plain slot-less calls fall back to bare call order — both disambiguated
// by the occurrence index.
// ---------------------------------------------------------------------------

interface HookRec {
	value: unknown;
	/** Actions queued by render-phase dispatches, folded by the NEXT pass's hook call. */
	queue: unknown[];
	/** Stable dispatch identity across the re-render passes (as on the client). */
	dispatch: (action: unknown) => void;
}
interface GetterHookRec extends HookRec {
	/** Value after every action scheduled during the current render pass. */
	pendingValue: unknown;
	/** Reducer from the currently executing pass, used by the synchronous getter view. */
	reducer: (state: unknown, action: unknown) => unknown;
	/** Allocated only for compiler-selected third-tuple consumers. */
	getter?: () => unknown;
}
interface LinkedHookRec<Source = unknown, Value = unknown> {
	source: Source;
	value: Value;
	pendingValue: Value;
	queue: Value[];
	valueEqual: (previous: Value, next: Value) => boolean;
	dispatch: (action: Value | ((previous: Value) => Value)) => void;
	getter?: () => Value;
}
interface MemoHookRec {
	value: unknown;
	deps: readonly unknown[];
}
interface RefHookRec {
	ref: { current: unknown };
}
interface NativeLocalHookRec {
	nativeValue: unknown;
}
type AnyHookRec = HookRec | LinkedHookRec<any, any> | MemoHookRec | RefHookRec | NativeLocalHookRec;
type ServerHookSlot = symbol | string | number;

// Server twin of the client helper/custom-hook ABI. Modules reserve a range
// only when globally composable Symbol descriptions are required.
let nextHookSlot = 0;
export function hookSlots(count: number): number {
	const base = nextHookSlot;
	nextHookSlot += count;
	return base;
}

interface HookPass {
	/** Slot → occurrence-indexed records, persisting across this body's passes. */
	hooks: Map<ServerHookSlot, AnyHookRec[]>;
	/** Per-pass occurrence counters (fresh each pass, like Frame.occ). */
	occ: Map<ServerHookSlot, number>;
	/** A dispatch fired during the current pass → re-invoke the body. */
	update: boolean;
}
// The hook pass of the INNERMOST component body currently executing. Installed /
// restored synchronously around each body invocation, so a captured dispatch can
// tell "my component, mid-render" (queue) from anything else (inert).
let HOOK_PASS: HookPass | null = null;
// Custom-hook call-site path. A base hook reached through withSlot combines
// every enclosing custom-hook boundary with its own compiler site. This mirrors
// the client runtime: two calls to the same custom hook stay independent even
// when a conditional render-phase retry changes their occurrence order.
const HOOK_SLOT_PATH: ServerHookSlot[] = [];
// Key for slot-less hook calls outside any withSlot (plain call-order keying).
const NO_SLOT = '@state';

function appendHookSlotPath(key: string, slot: ServerHookSlot): string {
	let type: string;
	let value: string;
	if (typeof slot === 'number') {
		type = 'n';
		value = String(slot);
	} else if (typeof slot === 'symbol') {
		type = 's';
		value = slot.description ?? '';
	} else {
		type = 't';
		value = slot;
	}
	return key + type + value.length + ':' + value;
}

function resolveHookSlot(slot: unknown): ServerHookSlot {
	const own: ServerHookSlot | undefined =
		typeof slot === 'symbol' || typeof slot === 'string' || typeof slot === 'number'
			? slot
			: undefined;
	const depth = HOOK_SLOT_PATH.length;
	if (depth === 0) return own ?? NO_SLOT;
	if (own === undefined && depth === 1) return HOOK_SLOT_PATH[0];

	let key = '@octane:hook:';
	for (let i = 0; i < depth; i++) key = appendHookSlotPath(key, HOOK_SLOT_PATH[i]);
	if (own !== undefined) key = appendHookSlotPath(key, own);
	return Symbol.for(key);
}

// React's cap (and message shape): a dispatch that fires unconditionally during
// render never converges — fail loudly instead of hanging the render.
const MAX_RENDER_PHASE_PASSES = 25;

function basicStateReducer(s: unknown, a: unknown): unknown {
	return typeof a === 'function' ? (a as (v: unknown) => unknown)(s) : a;
}

function hookPosition(slot: unknown): {
	hp: HookPass;
	list: AnyHookRec[];
	index: number;
} | null {
	const hp = HOOK_PASS;
	if (hp === null) return null;
	const key = resolveHookSlot(slot);
	const index = hp.occ.get(key) ?? 0;
	hp.occ.set(key, index + 1);
	let list = hp.hooks.get(key);
	if (list === undefined) hp.hooks.set(key, (list = []));
	return { hp, list, index };
}

/** @internal Server local hooks live only for this synchronous rendering pass. */
export function nativeLocalHook<T>(
	name: string,
	initialize: () => T,
	dispose: (value: T) => void,
	slot?: ServerHookSlot,
): T {
	if (CURRENT_SCOPE === null || HOOK_PASS === null) throw new Error(formatServerError(59, name));
	const { list, index } = hookPosition(slot)!;
	let record = list[index] as NativeLocalHookRec | undefined;
	if (record === undefined) {
		const value = initialize();
		list[index] = record = { nativeValue: value };
		(NATIVE_LOCAL_HOOK_DISPOSES ??= []).push(() => dispose(value));
	}
	return record.nativeValue as T;
}

// The shared useState/useReducer server cell. Getter-free hooks keep Fizz's lean
// queue: the next pass folds actions with that pass's reducer. Getter-enabled
// hooks additionally fold each action into `pendingValue` immediately so index 2
// sees scheduled state synchronously. The next pass adopts that eager result when
// the reducer is unchanged (so a functional updater/reducer runs only once), but
// replays the queue when the current render supplies a different reducer, matching
// React's current-reducer semantics.
function stateHook<S, A>(
	reducer: (s: S, a: A) => S,
	create: () => S,
	slot: unknown,
	withGetter = false,
): [S, (action: A) => void, (() => S)?] {
	const hp = HOOK_PASS;
	// Defensive: a hook invoked outside any component body — single-pass shape.
	if (hp === null) {
		const value = create();
		return withGetter ? [value, NOOP, () => value] : [value, NOOP];
	}
	const position = hookPosition(slot)!;
	const { list, index: n } = position;
	let rec = list[n] as HookRec | undefined;
	if (rec === undefined) {
		const value = create();
		if (withGetter) {
			const r: GetterHookRec = {
				value,
				pendingValue: value,
				queue: [],
				reducer: reducer as (state: unknown, action: unknown) => unknown,
				dispatch: (action: unknown): void => {
					// Only while OUR body is the one rendering (Fizz's componentIdentity
					// gate) — a dispatch invoked after the pass, or from a descendant's
					// render, is inert on the server.
					if (hp !== HOOK_PASS) return;
					r.queue.push(action);
					// The compiler-selected third tuple member observes the latest
					// scheduled value before the bounded re-render pass commits it.
					r.pendingValue = r.reducer(r.pendingValue, action);
					hp.update = true;
				},
			};
			list[n] = rec = r;
		} else {
			const r: HookRec = {
				value,
				queue: [],
				dispatch: (action: unknown): void => {
					if (hp !== HOOK_PASS) return;
					r.queue.push(action);
					hp.update = true;
				},
			};
			list[n] = rec = r;
		}
	} else if (rec.queue.length > 0) {
		if (withGetter) {
			const getterRec = rec as GetterHookRec;
			if (getterRec.reducer === reducer) {
				rec.value = getterRec.pendingValue;
			} else {
				let value = rec.value as S;
				const queue = rec.queue;
				for (let i = 0; i < queue.length; i++) value = reducer(value, queue[i] as A);
				rec.value = value;
				getterRec.pendingValue = value;
			}
			rec.queue = [];
		} else {
			let value = rec.value as S;
			const queue = rec.queue;
			for (let i = 0; i < queue.length; i++) value = reducer(value, queue[i] as A);
			rec.queue = [];
			rec.value = value;
		}
	}
	if (!withGetter) return [rec.value as S, rec.dispatch as (action: A) => void];
	const getterRec = rec as GetterHookRec;
	getterRec.reducer = reducer as (state: unknown, action: unknown) => unknown;
	const getter = (getterRec.getter ??= () => getterRec.pendingValue) as () => S;
	return [rec.value as S, rec.dispatch as (action: A) => void, getter];
}

// Keep the large retry snapshot off the recursive component-call stack. Fizz
// supports very deep trees; retaining dozens of snapshot locals in
// invokeComponentBody's live frame would exhaust the JavaScript stack first.
function captureComponentReplayState(scope: SSRScope, frame: Frame | null) {
	const css = CSS;
	const head = HEAD;
	const serial = SERIAL;
	const susp = SUSPENDED;
	const jobs = DEFERRED;
	const stream = STREAM;
	return {
		id: ID_COUNTER,
		native: NATIVE_READ_COLLECTOR?.checkpoint() ?? null,
		nativeReads: NATIVE_SERVER_READS,
		nativeReadCount: NATIVE_SERVER_READS?.reads.size ?? 0,
		nativeMixed: NATIVE_SERVER_READS?.mixed ?? false,
		nativeFailures: NATIVE_SERVER_FAILURES,
		css,
		cssEntries: css === null ? null : new Map(css),
		head,
		headLength: head !== null ? head.html.length : 0,
		headCharsetLength: head !== null ? head.charset.length : 0,
		headViewportLength: head !== null ? head.viewport.length : 0,
		headHints: head === null ? null : new Set(head.hints),
		headSheets: head === null || head.sheets === null ? null : new Map(head.sheets),
		headHintHtml: head === null || head.hintHtml === null ? null : new Map(head.hintHtml),
		headXfer: head === null || head.preloadXfer === null ? null : new Map(head.preloadXfer),
		serial,
		serialLength: serial !== null ? serial.length : 0,
		susp,
		suspLength: susp !== null ? susp.length : 0,
		jobs,
		jobsLength: jobs !== null ? jobs.length : 0,
		context: scope.$$ctxValues,
		vtTrySeq: VT_SSR_TRY_SEQ,
		vtHasCandidates: VT_SSR_HAS_CANDIDATES,
		vtStack: VT_SSR_STACK.map((candidate) => ({
			candidate,
			consumed: candidate.consumed,
		})),
		stream,
		streamNextId: stream?.nextId ?? 0,
		streamActiveTryKeys: stream?.activeTryKeys.slice() ?? [],
		streamActiveOwnerKeys: stream?.activeOwnerKeys.slice() ?? [],
		streamPassBoundaryCount: stream?.activePassBoundaryKeys?.size ?? 0,
		asyncScope: ASYNC_SCOPE,
		streamReplayCheckpoint: stream?.replay?.length ?? 0,
		frameDeferred: frame?.deferred ?? false,
		frameNextChild: frame?.nextChild ?? 0,
		frameScopedChildren:
			frame?.scopedChildren === null || frame?.scopedChildren === undefined
				? null
				: new Map(frame.scopedChildren),
		frameOccurrences: frame?.occ === null || frame?.occ === undefined ? null : new Map(frame.occ),
	};
}

function rewindComponentReplayState(
	snapshot: ReturnType<typeof captureComponentReplayState>,
	scope: SSRScope,
	frame: Frame | null,
): void {
	ID_COUNTER = snapshot.id;
	if (snapshot.native !== null) NATIVE_READ_COLLECTOR!.rewind(snapshot.native);
	NATIVE_SERVER_READS = snapshot.nativeReads;
	NATIVE_READ_COLLECTOR?.rewindReads(
		NATIVE_SERVER_READS,
		snapshot.nativeReadCount,
		snapshot.nativeMixed,
	);
	NATIVE_SERVER_FAILURES = snapshot.nativeFailures;
	ASYNC_SCOPE = snapshot.asyncScope;
	if (snapshot.css !== null && snapshot.cssEntries !== null) {
		snapshot.css.clear();
		for (const [hash, sheet] of snapshot.cssEntries) snapshot.css.set(hash, sheet);
	}
	if (snapshot.head !== null && snapshot.headHints !== null) {
		snapshot.head.html = snapshot.head.html.slice(0, snapshot.headLength);
		snapshot.head.charset = snapshot.head.charset.slice(0, snapshot.headCharsetLength);
		snapshot.head.viewport = snapshot.head.viewport.slice(0, snapshot.headViewportLength);
		snapshot.head.hints.clear();
		for (const key of snapshot.headHints) snapshot.head.hints.add(key);
		if (snapshot.headSheets === null) snapshot.head.sheets = null;
		else {
			// Restore INTO a live map (the snapshot map itself stays pristine so a
			// second rewind from the same snapshot restores identically).
			const sheets = (snapshot.head.sheets ??= new Map());
			sheets.clear();
			for (const [href, entry] of snapshot.headSheets) sheets.set(href, entry);
		}
		if (snapshot.headHintHtml === null) snapshot.head.hintHtml = null;
		else {
			const hintHtml = (snapshot.head.hintHtml ??= new Map());
			hintHtml.clear();
			for (const [k, v] of snapshot.headHintHtml) hintHtml.set(k, v);
		}
		if (snapshot.headXfer === null) snapshot.head.preloadXfer = null;
		else {
			const xfer = (snapshot.head.preloadXfer ??= new Map());
			xfer.clear();
			for (const [k, v] of snapshot.headXfer) xfer.set(k, v);
		}
	}
	if (snapshot.serial !== null) snapshot.serial.length = snapshot.serialLength;
	if (snapshot.susp !== null) snapshot.susp.length = snapshot.suspLength;
	if (snapshot.jobs !== null) snapshot.jobs.length = snapshot.jobsLength;
	VT_SSR_TRY_SEQ = snapshot.vtTrySeq;
	VT_SSR_HAS_CANDIDATES = snapshot.vtHasCandidates;
	VT_SSR_STACK.length = 0;
	for (const entry of snapshot.vtStack) {
		entry.candidate.consumed = entry.consumed;
		VT_SSR_STACK.push(entry.candidate);
	}
	const stream = snapshot.stream;
	if (stream !== null) {
		stream.nextId = snapshot.streamNextId;
		if (stream.activePassBoundaryKeys !== null) {
			// Discovery only appends during a pass. Trim the discarded suffix on
			// the rare retry instead of copying the growing set for every component.
			let index = 0;
			for (const key of stream.activePassBoundaryKeys) {
				if (index++ >= snapshot.streamPassBoundaryCount) stream.activePassBoundaryKeys.delete(key);
			}
		}
		stream.activeTryKeys.length = 0;
		stream.activeTryKeys.push(...snapshot.streamActiveTryKeys);
		stream.activeOwnerKeys.length = 0;
		stream.activeOwnerKeys.push(...snapshot.streamActiveOwnerKeys);
		rewindStreamBoundaryReplay(stream, snapshot.streamReplayCheckpoint);
	}
	scope.$$ctxValues = snapshot.context;
	if (frame !== null) {
		frame.deferred = snapshot.frameDeferred;
		frame.nextChild = snapshot.frameNextChild;
		frame.scopedChildren =
			snapshot.frameScopedChildren === null ? null : new Map(snapshot.frameScopedChildren);
		frame.occ = snapshot.frameOccurrences === null ? null : new Map(snapshot.frameOccurrences);
	}
}

// Invoke a component body, re-invoking while render-phase dispatches fired
// (bounded). Each retry REWINDS everything the discarded pass emitted into the
// ambient pass state — useId numbering, suspense seed order/registrations,
// discovery jobs, head/resource hints, scoped CSS, streaming-boundary state,
// ViewTransition candidates, and frame counters — so the pass that converges is
// byte-identical to a single pass rendered directly with the settled state. A
// suspension or real error propagates as before (the discarded updates die with
// the pass; the suspense retry re-runs the initializers, exactly like Fizz).
function replayUpdatedComponentBody(
	comp: ServerComponent,
	props: any,
	scope: SSRScope,
	frame: Frame | null,
	hp: HookPass,
	snapshot: ReturnType<typeof captureComponentReplayState>,
	warmPlanCheckpoint: number,
): unknown {
	let passes = 1;
	let out: unknown;
	do {
		if (++passes > MAX_RENDER_PHASE_PASSES) {
			throw new Error(formatServerError(9));
		}
		hp.update = false;
		hp.occ = new Map();
		rewindComponentReplayState(snapshot, scope, frame);
		ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
		out = comp(props ?? {}, scope, undefined);
	} while (hp.update);
	return out;
}

function invokeComponentBody(
	comp: ServerComponent,
	props: any,
	scope: SSRScope,
	frame: Frame | null,
): unknown {
	const prevHP = HOOK_PASS;
	const hp: HookPass = { hooks: new Map(), occ: new Map(), update: false };
	const snapshot = captureComponentReplayState(scope, frame);
	const warmPlanCheckpoint = ACTIVE_PU_WARM_PLANS.length;
	HOOK_PASS = hp;
	try {
		ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
		let out: unknown = comp(props ?? {}, scope, undefined);
		if (hp.update) {
			out = replayUpdatedComponentBody(comp, props, scope, frame, hp, snapshot, warmPlanCheckpoint);
		}
		return out;
	} catch (error) {
		throw normalizeThrownServerThenable(error);
	} finally {
		ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
		HOOK_PASS = prevHP;
	}
}

// Render a component body under an explicit frame, tracking it as the innermost
// component (so a suspending use() inside it captures it as a discovery job). The
// output shape is byte-identical to a bare invocation: the body's HTML wrapped in
// one hydration block range.
function renderComponentFramed(
	comp: ServerComponent,
	props: any,
	parent: SSRScope | null,
	frame: Frame,
	// M3 inherit-range (docs/comment-marker-elision-plan.md): the call site is
	// the sole root of its parent's `@{}` body, whose own pair already bounds
	// this output — skip the frame's `<!--[-->…<!--]-->` wrap. The FRAME itself
	// is still created (use() path keys / seed order unchanged); the client's
	// componentSlot(inherit) borrows the parent range instead of adopting.
	inherit?: boolean,
): string {
	const prevScope = CURRENT_SCOPE;
	const prevFrame = FRAME;
	const prevComp = CURRENT_COMP;
	const prevProps = CURRENT_PROPS;
	const prevParent = CURRENT_PARENT_SCOPE;
	const prevAsyncScope = ASYNC_SCOPE;
	const parentScope = parent ?? prevScope;
	const scope = ssrScope(parentScope);
	CURRENT_SCOPE = scope;
	FRAME = frame;
	CURRENT_COMP = comp;
	CURRENT_PROPS = props;
	CURRENT_PARENT_SCOPE = parentScope;
	ASYNC_SCOPE = frame.asyncScope;
	const nativeToken = NATIVE_READ_COLLECTOR === null ? -1 : beginActiveNativeReadScope(scope);
	let nativeCompleted = false;
	try {
		// The compiled body normally returns its HTML string, but a component that
		// early-returns non-template JSX (the de-opt path — e.g. a `.tsx` `if (…)
		// return <div/>`) returns a `createElement` DESCRIPTOR / array / primitive
		// instead, mirroring the client where such a return flows through the block's
		// childSlot. Normalize it the same way (ssrChild = the server childSlot), or it
		// would stringify to `[object Object]`.
		// Every component gets an independent replay boundary. Invoke its first
		// pass directly in this frame: otherwise each recursive component retains
		// an extra invokeComponentBody frame and a legitimate 1,000-level Fizz tree
		// exceeds the cold JavaScript stack. Render-phase retries are uncommon, so
		// their shared loop lives behind a cold branch without charging that extra
		// frame to normal component nesting.
		const previousHookPass = HOOK_PASS;
		const hookPass: HookPass = { hooks: new Map(), occ: new Map(), update: false };
		const replaySnapshot = captureComponentReplayState(scope, frame);
		const warmPlanCheckpoint = ACTIVE_PU_WARM_PLANS.length;
		let out: unknown;
		HOOK_PASS = hookPass;
		try {
			ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
			out = comp(props ?? {}, scope, undefined);
			if (hookPass.update) {
				out = replayUpdatedComponentBody(
					comp,
					props,
					scope,
					frame,
					hookPass,
					replaySnapshot,
					warmPlanCheckpoint,
				);
			}
		} finally {
			ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
			HOOK_PASS = previousHookPass;
		}
		const inner = typeof out === 'string' ? out : out == null ? '' : ssrChild(out, scope);
		// Wrap the child's output in a hydration block range so the client's
		// componentSlot can ADOPT it during hydration (its `<!--[-->`/`<!--]-->`
		// become the slot's start/end markers, exactly like control-flow blocks).
		// `renderToStaticMarkup` sets MARKERS=false — no hydration, so no markers.
		// An inherit-range site (M3) skips the wrap: the parent's own pair bounds
		// this output, and the client borrows it instead of adopting.
		nativeCompleted = true;
		return MARKERS && !inherit ? BLOCK_OPEN + inner + BLOCK_CLOSE : inner;
	} catch (error) {
		throw normalizeThrownServerThenable(error);
	} finally {
		if (nativeToken >= 0) NATIVE_READ_COLLECTOR!.endScope(nativeToken, nativeCompleted);
		CURRENT_SCOPE = prevScope;
		FRAME = prevFrame;
		CURRENT_COMP = prevComp;
		CURRENT_PROPS = prevProps;
		CURRENT_PARENT_SCOPE = prevParent;
		ASYNC_SCOPE = prevAsyncScope;
	}
}

/**
 * Render a child component into the string: fresh scope + frame, body → HTML.
 * `inherit` (M3): the compiled call site is the sole root of its parent's
 * `@{}` body — emit WITHOUT the surrounding `<!--[-->…<!--]-->` pair (the
 * parent's own range bounds it; the client borrows that range). Applies to
 * both the component branch (frame wrap) and the string-tag branch (ssrBlock).
 */
export function ssrComponent(
	parent: SSRScope,
	comp: ServerComponent | string | typeof Activity,
	props: any,
	inherit?: boolean,
	key?: unknown,
	identityScoped?: boolean,
): string {
	// A runtime-resolved Activity is a symbol, not a callable component. Keep its
	// original identity for async keys, then use the stable cold body below. A
	// spread-only key has not been split into the compiler's explicit key argument.
	// Unlike the client cold registration, SSR must also accept a public
	// `octane` Activity descriptor when this server export was tree-shaken away.
	// The shared Symbol.for identity keeps that mixed-entry path working; retaining
	// this small string-rendering wrapper does not retain the client Activity engine.
	const activity = comp === Activity;
	if (activity && key === undefined) key = props?.key;
	// Component recursion is one of SSR's hottest and deepest paths. Install the
	// same async-identity membrane inline instead of recursing back through
	// ssrComponent from two wrapper callbacks. Besides avoiding callback overhead,
	// this keeps realistically deep function-component trees below the engine's
	// call-stack ceiling while preserving the exact identity path bytes.
	const previousIdentityScope = ASYNC_SCOPE;
	if (identityScoped !== true) {
		ASYNC_SCOPE = previousIdentityScope + '|@component-type:' + asyncIdentityKey(comp, false);
		if (key != null) ASYNC_SCOPE += '|@component-key:' + asyncIdentityKey(key, true);
	}
	try {
		const explicitNamespace = NEXT_COMPONENT_NAMESPACE;
		NEXT_COMPONENT_NAMESPACE = null;
		if (activity) {
			comp = renderActivityDescriptor;
			// The generic component and inner Activity both own hydratable ranges.
			// This mirrors the client even for a sole-root dynamic Activity tag.
			inherit = false;
		}
		// Boundary builtins decline inherit through their component capability bit —
		// mirrors componentSlot's
		// client-side decline exactly (member/aliased/dynamic tags resolving to
		// Suspense/ErrorBoundary/ViewTransition/Hydrate keep their pair; both sides agree
		// without retaining the concrete built-ins from this generic path).
		if (inherit === true && hasComponentFlags(comp, COMPONENT_FLAG_BOUNDARY)) inherit = false;
		// A member/dynamic tag (`<obj.tag/>`, `<{expr}/>`) can resolve to a host tag
		// STRING at runtime (e.g. MDX's `_components.h1` mapping, unoverridden). The
		// client renders these — a value-lowered `createElement(obj.tag, …)` routes
		// `typeof type === 'string'` through the de-opt host path — so the server
		// must too, instead of CALLING the string as a component body. Serialize the
		// host element inside the same single `<!--[-->…<!--]-->` range a component
		// body gets (exactly ssrChild's host-descriptor shape), so the client's
		// adoption sees one uniform block whichever kind the tag resolved to.
		// Children arrive as `props.children` — plain values/descriptors from a
		// value-position call site (ssrHostElement's content path handles those), or
		// a render FUNCTION from a template one.
		if (typeof comp === 'string') {
			const tag = comp;
			const inheritedNamespace = explicitNamespace ?? FRAME?.namespace ?? 'html';
			const childNamespace = parserNamespacesForTag(
				tag.toLowerCase(),
				inheritedNamespace,
			).childrenNamespace;
			return ssrInNamespace(childNamespace, () => {
				const kids = props?.children;
				if (typeof kids === 'function') {
					// A TEMPLATE call site compiles children to a `__schildren$N` render fn.
					// Call it directly (`(undefined, scope)`, the ssrChildrenHtml/ProviderBody
					// convention) and inline its HTML as the element's plain content — the
					// shape a static host tag emits (`<h1>hi</h1>`, holes inside carry their
					// own blocks). Routing the fn through ssrHostElement's descriptor-content
					// path would render it as a nested COMPONENT body instead: wrong calling
					// convention and a stray `<!--[-->…<!--]-->` around the element's content.
					// A non-compiled fn (a render-prop child on a tag that resolved to a
					// string) returns a descriptor, not HTML — normalize via ssrChild, exactly
					// like renderComponentFramed normalizes a de-opt body's return.
					const out = (kids as any)(undefined, parent);
					const inner = typeof out === 'string' ? out : out == null ? '' : ssrChild(out, parent);
					const html = ssrHostElement(tag, props, null, parent, inner);
					return inherit ? html : ssrBlock(html);
				}
				const html = ssrHostElement(tag, props, kids, parent);
				return inherit ? html : ssrBlock(html);
			});
		}
		const pf = FRAME;
		// A fresh child frame: its `seg` is the parent's next child index (built into
		// the path so sibling instances of the same component get distinct keys). `pf`
		// is only null defensively (render() always installs a root frame); use an
		// ad-hoc root frame so keys still work.
		const frame: Frame =
			pf === null
				? {
						parent: null,
						seg: 0,
						nextChild: 0,
						scopedChildren: null,
						occ: null,
						path: null,
						deferred: false,
						asyncScope: ASYNC_SCOPE,
					}
				: {
						parent: pf,
						seg: nextChildSegment(pf),
						nextChild: 0,
						scopedChildren: null,
						occ: null,
						path: null,
						deferred: false,
						asyncScope: ASYNC_SCOPE,
					};
		// Function components are transparent to the HTML parser. Carry the active
		// namespace through arbitrary wrapper chains; an explicitly compiled host
		// transition (`<svg>`, `<math>`, or `<foreignObject>`) overrides it for the
		// next component frame through ssrComponentNS.
		frame.namespace = explicitNamespace ?? pf?.namespace;
		return renderComponentFramed(comp as ServerComponent, props, parent, frame, inherit);
	} finally {
		if (identityScoped !== true) ASYNC_SCOPE = previousIdentityScope;
	}
}

let NEXT_COMPONENT_NAMESPACE: 'html' | 'svg' | 'mathml' | null = null;

/** Compiler ABI for a component call whose output is parsed in foreign content. */
export function ssrComponentNS(
	parent: SSRScope,
	comp: ServerComponent | string | typeof Activity,
	props: any,
	namespace: 'html' | 'svg' | 'mathml',
	inherit?: boolean,
	key?: unknown,
): string {
	const previous = NEXT_COMPONENT_NAMESPACE;
	NEXT_COMPONENT_NAMESPACE = namespace;
	try {
		return ssrComponent(parent, comp, props, inherit, key);
	} finally {
		NEXT_COMPONENT_NAMESPACE = previous;
	}
}

/** Run a renderable hole under a lexically proven parser namespace. */
export function ssrInNamespace(namespace: 'html' | 'svg' | 'mathml', render: () => string): string {
	const frame = FRAME;
	if (frame === null) return render();
	const previous = frame.namespace;
	frame.namespace = namespace;
	try {
		return render();
	} finally {
		frame.namespace = previous;
	}
}

// A component's children reach the server body as a render FUNCTION (the
// compiler's `__schildren$N`, invoked `(arg, scope) => html` — see ProviderBody),
// but a value-position `.tsx` parent may instead pass a `createElement`
// DESCRIPTOR. Normalize either shape to its HTML string — the server analogue of
// the client `childrenAsBody`, so the JSX `<Suspense>`/`<ErrorBoundary>` built-ins
// render their children whichever dialect authored the parent.
function ssrChildrenHtml(children: unknown, scope: SSRScope): string {
	if (typeof children === 'function') return (children as any)(undefined, scope) ?? '';
	return ssrChild(children, scope);
}

function streamTokenForPendingHtml(html: string): string | null {
	const stream = STREAM;
	return stream !== null && html.includes(STREAM_BOUNDARY_ATTR + '="' + stream.token + '-')
		? stream.token
		: null;
}

/** Serialize runtime-owned and strategy-supplied attributes for `<Hydrate>`. */
function ssrHydrateAttrs(
	id: string,
	when: HydrationStrategy | (() => HydrationStrategy),
	idCount: number,
	permanentStaticAncestor: boolean = false,
	streamToken: string | null = null,
): string {
	const direct = typeof when !== 'function' && when !== null ? when : null;
	let attrs =
		ssrAttr(HYDRATE_ID_ATTR, id, 'div') +
		ssrAttr(
			HYDRATE_WHEN_ATTR,
			permanentStaticAncestor ? 'never' : (direct?._t ?? 'dynamic'),
			'div',
		) +
		ssrAttr(HYDRATE_ID_COUNT_ATTR, idCount, 'div');
	if (streamToken !== null) attrs += ssrAttr(HYDRATE_STREAM_TOKEN_ATTR, streamToken, 'div');
	if (permanentStaticAncestor) return attrs;
	const strategyAttrs = direct?._a?.();
	if (strategyAttrs === undefined) return attrs;

	for (const name of Object.keys(strategyAttrs)) {
		// Protocol attributes are renderer-owned even for a structurally-created
		// custom strategy descriptor. Do not permit it to shadow boundary state.
		if (
			name === HYDRATE_ID_ATTR ||
			name === HYDRATE_WHEN_ATTR ||
			name === HYDRATE_ID_COUNT_ATTR ||
			name === HYDRATE_STREAM_TOKEN_ATTR ||
			name === HYDRATE_SEED_ATTR ||
			name === NATIVE_SIGNAL_SEED_ATTR ||
			!VALID_ATTR_NAME.test(name)
		)
			continue;
		attrs += ssrAttr(name, strategyAttrs[name], 'div');
	}
	return attrs;
}

/**
 * `<Hydrate when={...}>...</Hydrate>` server boundary.
 *
 * The real children always render, preserving useful first-paint HTML. A
 * hydratable render surrounds them with one inner block range that the client
 * can adopt later. Child `use()` values move out of the root seed stream into a
 * direct-child data script, while their consumed `useId()` count remains in the
 * root sequence and is recorded so the eager hydration cursor can reserve it.
 * Function-form `when` is deliberately opaque on the server: evaluating it may
 * read browser state, so only a direct strategy descriptor contributes `_a()`
 * attributes and its concrete strategy kind.
 */
const PermanentStaticHydrate = /* @__PURE__ */ markComponentFlags(
	function PermanentStaticHydrate(props: HydrateProps, scope: SSRScope): string {
		// Match ordinary Hydrate's own useId. Child IDs are counted separately and
		// reserved by the client-side paired private range marker.
		useId();
		const inheritedPermanentStatic = PERMANENT_STATIC_HYDRATE_DEPTH !== 0;
		const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
		const previousNativeReads = NATIVE_SERVER_READS;
		if (nativeCapture < 0) NATIVE_SERVER_READS = null;
		PERMANENT_STATIC_HYDRATE_DEPTH++;
		try {
			// The outer static range already erases this client subtree and reserves
			// all descendant IDs. Collapse nested exact boundaries to their authored
			// children instead of leaving orphaned private sidecars.
			if (inheritedPermanentStatic || !MARKERS) return ssrChildrenHtml(props.children, scope);
			const childIdStart = ID_COUNTER;
			const serialStart = SERIAL?.length ?? 0;
			const children = ssrBlock(
				ssrTry(
					scope,
					'jsx-static-hydrate',
					(_arg, childScope) => ssrChildrenHtml(props.children, childScope),
					null,
					null,
				),
			);
			const idCount = ID_COUNTER - childIdStart;
			if (SERIAL !== null) SERIAL.splice(serialStart);
			const streamToken = streamTokenForPendingHtml(children);
			const markerToken = streamToken === null ? '' : streamToken + ':';
			const endToken = streamToken === null ? '' : ':' + streamToken;
			return (
				`<!--${HYDRATE_STATIC_ID_COUNT_PREFIX}${markerToken}${idCount}-->` +
				children +
				`<!--${HYDRATE_STATIC_END}${endToken}-->`
			);
		} finally {
			// The compiler erases this client subtree. Its data cannot be borrowed
			// by a hydratable sibling that happens to use the same scope key.
			finishNativeSeedCapture(nativeCapture, previousNativeReads, false);
			PERMANENT_STATIC_HYDRATE_DEPTH--;
		}
	},
	COMPONENT_FLAG_BOUNDARY,
	'PermanentStaticHydrate',
);

const hydrate = /* @__PURE__ */ markComponentFlags(
	function Hydrate(props: HydrateProps, scope: SSRScope): string {
		const id = useId();
		// The client always creates an HTMLDivElement. Force the same namespace for
		// SSR children and attribute semantics instead of inheriting SVG/MathML from
		// the call site. Direct placement in foreign content remains unsupported: an
		// HTML parser breaks a literal <div> out of <svg>/<math> before hydration.
		return withSsrElementContext(
			'div',
			undefined,
			() =>
				ssrInNamespace('html', () => {
					if (!MARKERS) {
						return '<div>' + ssrChildrenHtml(props.children, scope) + '</div>';
					}

					const childIdStart = ID_COUNTER;
					const serialStart = SERIAL?.length ?? 0;
					const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
					const previousNativeReads = NATIVE_SERVER_READS;
					if (nativeCapture < 0) NATIVE_SERVER_READS = null;
					// The outer range belongs to Hydrate itself. ssrTry supplies the nested
					// Suspense slot/content ranges and makes a suspending child a real stream
					// boundary. `fallback` remains client-only, so the server pending arm is
					// intentionally empty.
					let children: string;
					let nativeReads: NativeSeedReads | null = null;
					try {
						children = ssrBlock(
							ssrTry(
								scope,
								'jsx-hydrate',
								(_arg, childScope) => ssrChildrenHtml(props.children, childScope),
								null,
								null,
								'html',
							),
						);
					} finally {
						nativeReads = finishNativeSeedCapture(nativeCapture, previousNativeReads, false);
					}
					const idCount = ID_COUNTER - childIdStart;
					const childSeeds = SERIAL === null ? [] : SERIAL.splice(serialStart);
					const permanentStaticAncestor = PERMANENT_STATIC_HYDRATE_DEPTH !== 0;
					const attrs = ssrHydrateAttrs(
						id,
						props.when,
						idCount,
						permanentStaticAncestor,
						streamTokenForPendingHtml(children),
					);
					const seedJson =
						permanentStaticAncestor || childSeeds.length === 0
							? null
							: serializeSuspenseSeedJson(childSeeds);
					const seedSidecar =
						seedJson === null || seedJson === '[]'
							? ''
							: '<script type="application/json" ' +
								HYDRATE_SEED_ATTR +
								NONCE_ATTR +
								'>' +
								seedJson +
								'</script>';
					const nativeSeeds = permanentStaticAncestor
						? undefined
						: NATIVE_READ_COLLECTOR?.serialize(nativeReads);
					const nativeSidecar =
						nativeSeeds === undefined ? '' : serializeNativeSignalSeeds(nativeSeeds, NONCE_ATTR);

					return '<div' + attrs + '>' + children + seedSidecar + nativeSidecar + '</div>';
				}),
			'html',
		);
	},
	COMPONENT_FLAG_BOUNDARY,
	'Hydrate',
);

function initializeHydrateComponent(): ServerComponent {
	Object.defineProperty(hydrate, '__octanePermanentStatic', { value: PermanentStaticHydrate });
	return hydrate;
}

export const Hydrate: ServerComponent = /* @__PURE__ */ initializeHydrateComponent();

/**
 * `<Suspense fallback={…}>…</Suspense>` — the JSX built-in mirror of the
 * `@try { … } @pending { fallback }` directive, for authors writing JSX (e.g.
 * porting React). Emits the SAME nested-block shape the compiler's `ssrEmitTry`
 * produces for the directive: an outer try-slot `ssrBlock` around the active
 * branch's inner `ssrBlock`, so the client's `<Suspense>` (componentSlot →
 * tryBlock) adopts it byte-for-byte. A descendant `use(thenable)` that hasn't
 * resolved throws `SSR_SUSPENSE` → the `fallback` renders for this pass and
 * render()'s loop awaits + re-renders; a real error rethrows to an outer boundary.
 */
export const Suspense = /* @__PURE__ */ markComponentFlags(
	function Suspense(props: { fallback?: unknown; children?: unknown }, scope: SSRScope): string {
		// Routed through ssrTry so a JSX `<Suspense>` in a `.ts` binding tree is a
		// real STREAMING boundary too (registration + template sentinel), with the
		// identical nested-block byte shape as before for buffered renders. Errors
		// rethrow to an outer boundary (catchFn = null), matching the old emit.
		return ssrTry(
			scope,
			'jsx-suspense',
			(_arg, s) => ssrChildrenHtml(props.children, s),
			(_arg, s) => ssrChild(props.fallback, s),
			null,
			FRAME?.namespace ?? 'html',
		);
	},
	COMPONENT_FLAG_BOUNDARY,
	'Suspense',
);

// ─────────────────────────────────────────────────────────────────────────────
// View-transition SSR annotations (docs/view-transitions-plan.md Phase 5) —
// Fizz parity: the server stamps resolved `vt-*` attributes on each
// boundary's first element so a client runtime can animate streamed reveals
// before hydration, and so pre-rendered boundaries carry their classes:
//   vt-update  — always (per-type maps resolve to their `default` server-side;
//                there are no transition types during SSR).
//   vt-name / vt-share — when the boundary is explicitly named OR contains a
//                Suspense boundary (the name pairs old/new across the swap;
//                auto names derive from the stable frame path, so every
//                streaming pass mints the same name).
//   vt-enter / vt-exit — when the boundary sits at the top of a Suspense
//                CONTENT arm (it enters when streamed in) / FALLBACK arm (it
//                exits on reveal); both can apply (a fallback that is itself
//                Suspense content).
// Arm-top detection is POSITIONAL, not flag-based (compiled static elements
// emit as string concatenation — no runtime call to consult): every boundary
// stamps CANDIDATE attributes (vt-enter-x / vt-exit-x) on its first element;
// each @try arm then CLAIMS the matching candidate on the arm's first element
// (renaming -x → real). Ordering makes this exact — an OUTER boundary's
// surgery runs after the arm's claim, so its candidates are never claimed by
// an arm it merely contains. Residual candidates are stripped at the final
// emission points (buffered html / stream shell / stream segments).

type VtSsrClassValue = string | Record<string, string>;
interface VtSsrProps {
	name?: string;
	enter?: VtSsrClassValue;
	exit?: VtSsrClassValue;
	update?: VtSsrClassValue;
	share?: VtSsrClassValue;
	default?: VtSsrClassValue;
	children?: unknown;
}
interface VtSsrCandidate {
	name: string;
	share: string;
	update: string;
	consumed: boolean;
}

let VT_SSR_TRY_SEQ = 0;
// True only when the active pass rendered a ViewTransition and therefore may
// contain residual vt-enter-x / vt-exit-x attributes. Threaded into the pass
// result so ordinary SSR can skip scanning the entire emitted HTML string.
let VT_SSR_HAS_CANDIDATES = false;
const VT_SSR_STACK: VtSsrCandidate[] = [];

/** Resolve a class-prop value server-side (no types → maps use `default`). */
function vtSsrResolve(props: VtSsrProps, kind: 'enter' | 'exit' | 'update' | 'share'): string {
	let v: VtSsrClassValue | undefined = props[kind];
	if (v == null) v = props.default;
	if (v == null) return 'auto';
	if (typeof v === 'string') return v;
	return v.default != null ? v.default : 'auto';
}

/** Skip comment markers and streaming placeholders to locate the visible root. */
function vtSsrFirstVisibleOpenTag(html: string): number {
	const n = html.length;
	let i = 0;
	while (i < n) {
		const lt = html.indexOf('<', i);
		if (lt === -1) return -1;
		if (html.startsWith('<!--', lt)) {
			const close = html.indexOf('-->', lt + 4);
			if (close === -1) return -1;
			i = close + 3;
			continue;
		}
		const c = html.charCodeAt(lt + 1);
		if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) {
			// Not an element open (a closing tag or stray '<' text) — move on.
			i = lt + 1;
			continue;
		}
		let e = lt + 1;
		while (e < n && /[a-zA-Z0-9-]/.test(html[e])) e++;
		if (e - lt === 9 && html.slice(lt + 1, e).toLowerCase() === 'template') {
			const j = vtSsrOpenTagEnd(html, e);
			if (j === -1) return -1;
			const close = html.indexOf('</template>', j);
			i = close === -1 ? j + 1 : close + 11;
			continue;
		}
		return lt;
	}
	return -1;
}

/** Find an opening tag's actual terminator without allocating scan state. */
function vtSsrOpenTagEnd(html: string, from: number): number {
	let quote = 0;
	for (let index = from; index < html.length; index++) {
		const code = html.charCodeAt(index);
		if (quote !== 0) {
			if (code === quote) quote = 0;
		} else if (code === 34 || code === 39) {
			quote = code;
		} else if (code === 62) {
			return index;
		}
	}
	return -1;
}

/**
 * Inject `vt-*` attributes into the first visible element's opening tag.
 * An inner boundary owns attributes it has already placed on the same root.
 */
function vtSsrAnnotate(html: string, attrs: Array<[string, string]>): string {
	const start = vtSsrFirstVisibleOpenTag(html);
	if (start === -1) return html;
	const end = vtSsrOpenTagEnd(html, start + 1);
	if (end === -1) return html;
	const open = html.slice(start, end);
	let inject = '';
	for (let index = 0; index < attrs.length; index++) {
		if (open.indexOf(attrs[index][0] + '="') === -1) {
			inject += ' ' + attrs[index][0] + '="' + escapeAttr(attrs[index][1]) + '"';
		}
	}
	if (inject === '') return html;
	const insertion = html[end - 1] === '/' ? end - 1 : end;
	return html.slice(0, insertion) + inject + html.slice(insertion);
}

/**
 * Claim an arm-top candidate: rename `vt-enter-x`/`vt-exit-x` → `vt-enter`/
 * `vt-exit` on the FIRST element of an arm's HTML (same template/comment
 * skipping as vtSsrAnnotate). A first element without the candidate (e.g. a
 * static wrapper above the boundary, or an outer boundary's annotation target)
 * claims nothing — that is exactly React's "top of the arm only" rule.
 */
function vtSsrClaimArm(html: string, kind: 'enter' | 'exit'): string {
	const start = vtSsrFirstVisibleOpenTag(html);
	if (start === -1) return html;
	const end = vtSsrOpenTagEnd(html, start + 1);
	if (end === -1) return html;
	const marker = ' vt-' + kind + '-x="';
	const offset = html.slice(start, end).indexOf(marker);
	if (offset === -1) return html;
	const insertion = start + offset;
	return html.slice(0, insertion) + ' vt-' + kind + '="' + html.slice(insertion + marker.length);
}

/** Strip residual (unclaimed) arm candidates before emission. */
function vtSsrStrip(html: string): string {
	// Cheap fast path — apps without ViewTransition never pay the regex.
	if (html.indexOf(' vt-e') === -1) return html;
	return html.replace(/ vt-(?:enter|exit)-x="[^"]*"/g, '');
}

/**
 * `<ViewTransition>` — the server twin of the client boundary builtin
 * (docs/view-transitions-plan.md). Renders the children transparently in the
 * same nested-block byte shape the client produces (componentSlot's comp pair
 * around the body's childSlot pair — renderComponentFramed adds the outer
 * frame, the explicit ssrBlock below is the inner childSlot range), stamped
 * with the Fizz-parity `vt-*` annotations described above.
 */
export const ViewTransition = /* @__PURE__ */ markComponentFlags(
	function ViewTransition(props: VtSsrProps, scope: SSRScope): string {
		VT_SSR_HAS_CANDIDATES = true;
		const explicit = typeof props.name === 'string';
		const frame = FRAME;
		const cand: VtSsrCandidate = {
			name: explicit
				? (props.name as string)
				: '_O' + (frame !== null ? framePath(frame).replace(/\//g, '-') : '') + '_',
			share: vtSsrResolve(props, 'share'),
			update: vtSsrResolve(props, 'update'),
			consumed: false,
		};
		VT_SSR_STACK.push(cand);
		const seqBefore = VT_SSR_TRY_SEQ;
		let inner: string;
		try {
			inner = ssrChildrenHtml(props.children, scope);
		} finally {
			VT_SSR_STACK.pop();
		}
		const named = explicit || VT_SSR_TRY_SEQ !== seqBefore;
		const attrs: Array<[string, string]> = [];
		if (named) attrs.push(['vt-name', cand.name]);
		attrs.push(['vt-update', cand.update]);
		// Arm candidates — claimed (renamed to vt-enter/vt-exit) by the @try arm
		// this boundary tops, stripped at emission when unclaimed.
		attrs.push(['vt-enter-x', vtSsrResolve(props, 'enter')]);
		attrs.push(['vt-exit-x', vtSsrResolve(props, 'exit')]);
		if (named) attrs.push(['vt-share', cand.share]);
		return ssrBlock(vtSsrAnnotate(inner, attrs));
	},
	COMPONENT_FLAG_BOUNDARY,
	'ViewTransition',
);

/**
 * Server no-op twin of the client `addTransitionType` — transition types only
 * affect client-side view-transition class resolution/callbacks; a shared
 * component calling it during SSR is legal and inert.
 */
export function addTransitionType(_type: string): void {}

/**
 * `<ErrorBoundary fallback={…}>…</ErrorBoundary>` — the JSX built-in mirror of
 * `@try { … } @catch (e) { fallback }`. `fallback` is a renderable or a
 * `(error, reset) => renderable` render prop (react-error-boundary style). A real
 * error during render swaps to the fallback; a suspension rethrows so an outer
 * `<Suspense>`/`@pending` handles it (matching the client ErrorBoundary's explicit
 * suspension propagation). `reset` is a server no-op (no re-render).
 */
export const ErrorBoundary = /* @__PURE__ */ markComponentFlags(
	function ErrorBoundary(
		props: { fallback?: unknown; children?: unknown },
		scope: SSRScope,
	): string {
		return ssrBlock(
			(() => {
				try {
					return withAsyncIdentity('error-boundary', 'content', () =>
						ssrBlock(ssrChildrenHtml(props.children, scope)),
					);
				} catch (e) {
					e = normalizeThrownServerThenable(e);
					if (ssrIsSuspense(e)) throw e; // let an outer Suspense render its pending arm
					const fb =
						typeof props.fallback === 'function'
							? (props.fallback as (err: unknown, reset: () => void) => unknown)(e, NOOP)
							: props.fallback;
					return withAsyncIdentity('error-boundary', 'catch', () => ssrBlock(ssrChild(fb, scope)));
				}
			})(),
		);
	},
	COMPONENT_FLAG_BOUNDARY,
	'ErrorBoundary',
);

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CONTEXT_TAG = Symbol.for('octane.context');

// NOTE: unlike the client runtime's Context, there is no `$$version` here — that
// field drives the client's provider-change invalidation machinery, which has no
// server analogue (an SSR pass reads each provider value exactly once, top-down).
export interface Context<T> {
	(props: { value: T; children?: any }, scope: SSRScope): string;
	$$kind: typeof CONTEXT_TAG;
	defaultValue: T;
	Provider: (props: { value: T; children?: any }, scope: SSRScope) => string;
}

export function createContext<T>(defaultValue: T): Context<T> {
	const ctx = function ProviderBody(props, scope) {
		return renderServerContextProvider(ctx, props, scope);
	} as Context<T>;
	ctx.$$kind = CONTEXT_TAG;
	ctx.defaultValue = defaultValue;
	ctx.Provider = ctx;
	if (process.env.NODE_ENV !== 'production') {
		// Mirror of the client's Consumer diagnostic (see runtime.ts): warn once
		// per context on access, return undefined so probes behave as in prod.
		let consumerWarned = false;
		Object.defineProperty(ctx, 'Consumer', {
			configurable: true,
			get() {
				if (!consumerWarned) {
					consumerWarned = true;
					console.error(
						'Octane has no Context.Consumer. Read the context directly with use(Context) or ' +
							'useContext(Context) in the child component — Octane hooks are call-site keyed, ' +
							'so the read is legal behind any condition the render-prop form was working around.',
					);
				}
				return undefined;
			},
		});
	}
	return ctx;
}

function renderServerContextProvider(
	context: unknown,
	props: { value: unknown; children?: unknown },
	renderScope: object,
): string {
	const scope = renderScope as SSRScope;
	if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
	scope.$$ctxValues.set(context, props.value);
	const children = props.children;
	if (children == null) return '';
	// `.tsrx` children are render functions; `.tsx` children are descriptors,
	// arrays, or primitives and must keep the ordinary server serializer.
	return typeof children === 'function'
		? (children(undefined, scope) ?? '')
		: ssrChild(children, scope);
}

function readContext<T>(ctx: Context<T>): T {
	for (let s = CURRENT_SCOPE; s !== null; s = s.parent) {
		if (s.$$ctxValues !== null && s.$$ctxValues.has(ctx)) return s.$$ctxValues.get(ctx) as T;
	}
	return ctx.defaultValue;
}

export function useContext<T>(ctx: Context<T>): T {
	if (ctx && (ctx as any).$$kind === CONTEXT_TAG) return readContext(ctx);
	// Same cold foreign-context path as `use()` (§6.4).
	return readHostedForeignContext(ctx, 'useContext');
}

// Sentinel thrown by `use(thenable)` on the server when the value isn't resolved
// yet. The nearest `@try` catches it and renders its `@pending` fallback (see the
// compiler's ssrEmitTry) for this pass; render()'s loop then awaits the thenable
// and re-renders. Distinct from real errors, which route to `@catch`.
const SSR_SUSPENSE = Symbol('octane.ssr.suspense');
export function ssrIsSuspense(err: unknown): boolean {
	return err === SSR_SUSPENSE;
}

function normalizeThrownServerThenable(error: unknown): unknown {
	if (error === null || typeof error !== 'object') return error;
	try {
		if (typeof (error as PromiseLike<unknown>).then !== 'function') return error;
	} catch {
		// An opaque rejection reason need not permit property access. Preserve it
		// for the application's catch arm instead of replacing it with a probe error.
		return error;
	}
	// Resource readers own their resolved values. Register only retry work, not
	// a synthetic use() occurrence or hydration seed. Each throw gets a fresh
	// registration because the same reader can discover another pending resource.
	if (SUSPENDED !== null) {
		SUSPENDED.push({ promise: error as PromiseLike<unknown>, key: '|throw#' + PU_ID++ });
	}
	const frame = FRAME;
	if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
		frame.deferred = true;
		DEFERRED.push({
			comp: CURRENT_COMP,
			props: CURRENT_PROPS,
			parentScope: CURRENT_PARENT_SCOPE,
			frame,
		});
	}
	return SSR_SUSPENSE;
}

type HydrationRejectionPayload =
	| { kind: 'value'; value?: unknown }
	| { kind: 'number'; value: 'NaN' | 'Infinity' | '-Infinity' | '-0' }
	| { kind: 'bigint'; value: string }
	| { kind: 'symbol'; value: string }
	| { kind: 'error'; name: string; message: string; fields: Record<string, unknown> }
	| { kind: 'fallback'; message: string };

const HYDRATION_REJECTION_SEED = Symbol('octane.ssr.hydration-rejection-seed');
const HYDRATION_SITE_EVENT = Symbol('octane.ssr.hydration-site');
interface HydrationRejectionSeed {
	[HYDRATION_REJECTION_SEED]: HydrationRejectionPayload;
}

interface HydrationSiteEvent {
	[HYDRATION_SITE_EVENT]: string;
	value: unknown;
}

interface ReasonSnapshotState {
	active: WeakSet<object>;
	nodes: number;
}

// Build a bounded, detached JSON-safe snapshot without invoking toJSON. Plain
// object/array fields survive, cycles become an explicit marker, and hostile
// accessors/proxies or unsupported nested values degrade locally rather than
// making the entire SSR response fail during the final JSON.stringify.
function reasonSnapshot(
	value: unknown,
	state: ReasonSnapshotState = { active: new WeakSet(), nodes: 0 },
	depth: number = 0,
): unknown {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		typeof value === 'undefined'
	)
		return value;
	if (typeof value === 'number') {
		return Number.isFinite(value) && !Object.is(value, -0) ? value : String(value);
	}
	if (typeof value === 'bigint') return String(value);
	if (typeof value === 'symbol') return '[symbol]';
	if (typeof value === 'function') return '[function]';
	if (depth >= 20 || state.nodes++ >= 512) return '[truncated]';
	if (state.active.has(value)) return '[Circular]';
	state.active.add(value);
	try {
		let isArray: boolean;
		try {
			isArray = Array.isArray(value);
		} catch {
			return '[unavailable]';
		}
		if (isArray) {
			const arrayValue = value as unknown[];
			let length = 0;
			try {
				length = Math.min(arrayValue.length, 512);
			} catch {
				return '[unavailable]';
			}
			const out = new Array(length);
			for (let i = 0; i < length; i++) {
				try {
					if (hasOwnProp.call(arrayValue, i)) {
						out[i] = reasonSnapshot(arrayValue[i], state, depth + 1);
					}
				} catch {
					out[i] = '[unavailable]';
				}
			}
			return out;
		}
		const out: Record<string, unknown> = Object.create(null);
		let keys: string[];
		try {
			keys = Object.keys(value);
		} catch {
			return '[unavailable]';
		}
		const length = Math.min(keys.length, 512);
		for (let i = 0; i < length; i++) {
			const key = keys[i];
			try {
				out[key] = reasonSnapshot((value as any)[key], state, depth + 1);
			} catch {
				out[key] = '[unavailable]';
			}
		}
		if (keys.length > length) out.__octane_truncated__ = true;
		return out;
	} finally {
		state.active.delete(value);
	}
}

function isErrorReason(reason: unknown): boolean {
	try {
		if (reason instanceof Error) return true;
		if (reason === null || typeof reason !== 'object') return false;
		const tag = Object.prototype.toString.call(reason);
		return tag === '[object Error]' || tag === '[object DOMException]';
	} catch {
		return false;
	}
}

function hydrationRejectionPayload(reason: unknown): HydrationRejectionPayload {
	try {
		return hydrationRejectionPayloadUnsafe(reason);
	} catch {
		// Rejection transport must never replace the application's original reason
		// with an encoder failure. Opaque proxies and exotic host objects degrade
		// to a fixed message while still seeding the client's catch arm.
		return { kind: 'fallback', message: formatServerError(23) };
	}
}

function hydrationRejectionPayloadUnsafe(reason: unknown): HydrationRejectionPayload {
	if (typeof reason === 'number' && (!Number.isFinite(reason) || Object.is(reason, -0))) {
		return {
			kind: 'number',
			value: Number.isNaN(reason)
				? 'NaN'
				: Object.is(reason, -0)
					? '-0'
					: reason === Infinity
						? 'Infinity'
						: '-Infinity',
		};
	}
	if (typeof reason === 'bigint') return { kind: 'bigint', value: String(reason) };
	if (typeof reason === 'symbol') return { kind: 'symbol', value: reason.description ?? '' };
	if (isErrorReason(reason)) {
		let name = 'Error';
		let message = formatServerError(23);
		try {
			const candidate = (reason as any).name;
			if (typeof candidate === 'string') name = candidate;
		} catch {
			/* hostile getter — retain the safe fallback */
		}
		try {
			const candidate = (reason as any).message;
			if (typeof candidate === 'string') message = candidate;
		} catch {
			/* hostile getter — retain the safe fallback */
		}
		const fields: Record<string, unknown> = Object.create(null);
		let keys: string[] = [];
		try {
			keys = Object.keys(reason as object);
		} catch {
			/* hostile proxy — emit the core Error fields only */
		}
		const length = Math.min(keys.length, 512);
		const snapshotState: ReasonSnapshotState = { active: new WeakSet(), nodes: 0 };
		snapshotState.active.add(reason as object);
		for (let i = 0; i < length; i++) {
			const key = keys[i];
			if (key === 'name' || key === 'message' || key === 'stack') continue;
			try {
				fields[key] = reasonSnapshot((reason as any)[key], snapshotState);
			} catch {
				fields[key] = '[unavailable]';
			}
		}
		if (keys.length > length) fields.__octane_truncated__ = true;
		return { kind: 'error', name, message, fields };
	}
	if (typeof reason === 'function') {
		return { kind: 'fallback', message: formatServerError(45) };
	}
	return { kind: 'value', value: reasonSnapshot(reason) };
}

function hydrationRejectionSeed(reason: unknown): HydrationRejectionSeed {
	return { [HYDRATION_REJECTION_SEED]: hydrationRejectionPayload(reason) };
}

function isHydrationRejectionSeed(value: unknown): value is HydrationRejectionSeed {
	return (
		value !== null && typeof value === 'object' && hasOwnProp.call(value, HYDRATION_REJECTION_SEED)
	);
}

function recordHydrationSeed(serial: unknown[] | null, value: unknown, directSite?: string): void {
	if (serial === null) return;
	serial.push(
		directSite === undefined
			? value
			: {
					[HYDRATION_SITE_EVENT]: directSite,
					value,
				},
	);
}

function recordSkippedHydrationSite(serial: unknown[] | null, directSite?: string): void {
	if (directSite !== undefined) recordHydrationSeed(serial, HYDRATION_SITE_EVENT, directSite);
}

function recordHydrationRejection(
	serial: unknown[] | null,
	reason: unknown,
	directSite?: string,
): void {
	recordHydrationSeed(serial, hydrationRejectionSeed(reason), directSite);
}

function hasExternalHydrationOwner(thenable: PromiseLike<unknown>): boolean {
	try {
		return (thenable as any)[EXTERNAL_HYDRATION_PROMISE] === true;
	} catch {
		return false;
	}
}

// The `$$kind?: never` intersection rejects octane ELEMENT descriptors, whose
// promise protocol is type-level-only (the React 19 tag gate) and poisoned —
// mirrors the client runtime's `use()` (see NotAnElementDescriptor there).
export function use<T>(
	usable: Context<T> | (PromiseLike<T> & { $$kind?: never }),
	siteKey?: symbol | string,
	directSite?: string,
): T;
export function use<T>(
	usable: Context<T> | (PromiseLike<T> & { $$kind?: never }),
	siteKey?: ServerHookSlot,
	directSite?: string,
): T {
	if (usable && (usable as any).$$kind === CONTEXT_TAG) {
		recordSkippedHydrationSite(SERIAL, directSite);
		return readContext(usable as Context<T>);
	}
	const externalOwner = hasExternalHydrationOwner(usable as PromiseLike<unknown>);
	const serial = externalOwner ? null : SERIAL;
	if (externalOwner) recordSkippedHydrationSite(SERIAL, directSite);
	if (usable == null || typeof (usable as any).then !== 'function') {
		if (!externalOwner) recordSkippedHydrationSite(SERIAL, directSite);
		// Cold path: a FOREIGN host context inside a hosted server pass reads
		// through the installed host hook (§6.4); anything else diagnoses.
		return readHostedForeignContext(usable, 'use');
	}
	// A thenable. Key it by the current FRAME path + the compiler-injected
	// call-site key + a per-frame occurrence index (so a use() inside an @for gets
	// a distinct key per iteration). Scoping to the frame makes the key identical
	// between the pass a boundary first renders, its discovery re-run, and the
	// final full pass, and disjoint across component membranes.
	const base =
		siteKey === undefined
			? '@'
			: typeof siteKey === 'symbol'
				? (siteKey as symbol).toString()
				: String(siteKey);
	const frame = FRAME;
	let n = 0;
	let prefix = ASYNC_SCOPE;
	if (frame !== null) {
		n = nextFrameOccurrence(frame, base);
		prefix = asyncFramePath(frame);
	}
	const key = prefix + '|' + base + '#' + n;

	// SSR parallel-use mirror: a BATCH-registered creation resolves by THENABLE
	// IDENTITY (puMemo keeps the instance stable across passes; puBatch can't
	// know this unwrap's string key). resolvedT holds ONLY batch-registered
	// outcomes, so plain use() sites keep their exact pre-mirror string-key
	// semantics — and the occurrence bump above ALWAYS runs, keeping per-frame
	// occ indices in sync across passes whichever path resolves a site (an
	// identity hit that skipped the bump would shift every later same-base
	// site onto its predecessor's key — @for iterations share the frame).
	if (RESOLVED !== null) {
		const entryT = RESOLVED.pu.resolvedT.get(usable as PromiseLike<unknown>);
		if (entryT !== undefined) {
			// Livelock-guard consumption mark (armed only after a first strike).
			RESOLVED.pu.touched?.add(usable as PromiseLike<unknown>);
			if ('reason' in entryT) {
				recordHydrationRejection(serial, entryT.reason, directSite);
				throw entryT.reason;
			}
			recordHydrationSeed(serial, entryT.value, directSite);
			return entryT.value as T;
		}
	}
	const resolved = RESOLVED;
	if (resolved !== null && resolved.has(key)) {
		const entry = resolved.get(key)!;
		const thenable = usable as PromiseLike<unknown>;
		// Keep the settled result authoritative when a replay recreates this
		// thenable, but observe the abandoned replacement so a later rejection is
		// handled. The original thenable was already observed on the suspending pass
		// and must not pay for another subscription on every replay.
		if (entry.thenable !== thenable) {
			try {
				thenable.then(NOOP, NOOP);
			} catch {}
		}
		// Rejected on a prior pass → throw so the enclosing @try renders @catch.
		// Serialize a typed rejection seed first so hydration takes the same catch
		// arm even when the client receives a fresh, still-pending thenable.
		if ('reason' in entry) {
			recordHydrationRejection(serial, entry.reason, directSite);
			throw entry.reason;
		}
		// Resolved → return it, and record it (in render order) for client seeding.
		recordHydrationSeed(serial, entry.value, directSite);
		return entry.value as T;
	}
	// React-compatible instrumented thenables expose their synchronous state on
	// the thenable itself. A custom pending status still receives a no-op probe:
	// Flight-style thenables use that first subscription for lazy initialization,
	// then the streaming scheduler attaches the actual wake-up subscription.
	// Re-check after probing because a thenable may fulfill or reject inline.
	const instrumented = usable as PromiseLike<T> & {
		status?: unknown;
		value?: T;
		reason?: unknown;
	};
	let status = instrumented.status;
	const wasUninstrumented = status === undefined;
	if (status === 'fulfilled') {
		recordHydrationSeed(serial, instrumented.value, directSite);
		return instrumented.value as T;
	}
	if (status === 'rejected') {
		recordHydrationRejection(serial, instrumented.reason, directSite);
		throw instrumented.reason;
	}
	if (wasUninstrumented) {
		// Track an uninstrumented thenable before deciding to suspend. A custom
		// thenable may call either continuation synchronously; in that case the
		// value/error is observable in this same render and no pending arm should
		// ever be published. Native Promises settle in a microtask and continue
		// through the normal streaming retry path.
		instrumented.status = 'pending';
		instrumented.then(
			(value) => {
				if (instrumented.status === 'pending') {
					instrumented.status = 'fulfilled';
					instrumented.value = value;
				}
			},
			(reason) => {
				if (instrumented.status === 'pending') {
					instrumented.status = 'rejected';
					instrumented.reason = reason;
				}
			},
		);
		status = instrumented.status;
		if (status === 'fulfilled') {
			recordHydrationSeed(serial, instrumented.value, directSite);
			return instrumented.value as T;
		}
		if (status === 'rejected') {
			recordHydrationRejection(serial, instrumented.reason, directSite);
			throw instrumented.reason;
		}
	}
	if (!wasUninstrumented && typeof status === 'string') {
		instrumented.then(NOOP, NOOP);
		status = instrumented.status;
		if (status === 'fulfilled') {
			recordHydrationSeed(serial, instrumented.value, directSite);
			return instrumented.value as T;
		}
		if (status === 'rejected') {
			recordHydrationRejection(serial, instrumented.reason, directSite);
			throw instrumented.reason;
		}
	}
	// First time we reach this site this render — record the thenable so render()'s
	// loop can await it, then suspend so the nearest @try shows @pending this pass.
	if (SUSPENDED !== null) SUSPENDED.push({ promise: usable as PromiseLike<unknown>, key });
	// Register the innermost enclosing component as a discovery job (once per
	// component/pass), so render() can re-render just this subtree next round
	// instead of the whole tree. A bare use() at the root captures the root
	// component (CURRENT_COMP set by render()).
	if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
		frame.deferred = true;
		DEFERRED.push({
			comp: CURRENT_COMP,
			props: CURRENT_PROPS,
			parentScope: CURRENT_PARENT_SCOPE,
			frame,
		});
	}
	throw SSR_SUSPENSE;
}

// ---------------------------------------------------------------------------
// SSR parallel-use mirror (docs/suspense-parallel-use-plan.md Phase 5) — the
// server twins of the client's useMemo/useBatch emit. The compiler hoists
// memoized use() creations above their unwraps and registers each run in one
// batch, so a body stratum of independent fetches costs ONE network round
// instead of one per use(), and re-runs (discovery rounds, later passes)
// reuse the SAME thenable instances instead of re-firing the fetches.
// ---------------------------------------------------------------------------

// Element-wise Object.is — the client useMemo's deps contract.
function serverDepsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
	return true;
}

// Synthetic SUSPENDED keys for batch registrations — their outcomes are
// consumed via resolvedT identity, never via this key; it only needs to be
// unique so the settle loops' per-key dedupe doesn't conflate entries.
let PU_ID = 0;

interface ServerPuCreation {
	deps: unknown[];
	value: unknown;
	site: ServerHookSlot | undefined;
	frame: Frame | null;
	nativeWitness?: NativeReadWitness | null;
}

interface ServerWarmEntry {
	deps: unknown[];
	value: unknown;
	available: boolean;
	nativeWitness?: NativeReadWitness | null;
}

type ServerMemoEvidence = ServerPuCreation | ServerWarmEntry;

interface NativeServerMemoMode {
	accept: (entry: ServerMemoEvidence) => boolean;
	replay: (entry: ServerMemoEvidence) => void;
	create: (
		compute: () => unknown,
		deps: unknown[],
		site: ServerHookSlot | undefined,
		frame: Frame | null,
	) => ServerPuCreation;
}

interface NativeServerWarmMode {
	accept: (entry: ServerMemoEvidence) => boolean;
	create: (compute: () => unknown, deps: unknown[]) => ServerWarmEntry;
}

/**
 * Cross-pass creation cache. Keyed like use(): frame path + compiler site key
 * + per-frame occurrence, so the key is identical between the pass a boundary
 * first renders, its discovery re-runs, and the final full pass. A hit with
 * equal deps returns the PRIOR pass's value — for a fetch creation that means
 * the same in-flight/settled promise instance, which is what lets puBatch and
 * use() resolve by identity and what stops re-runs duplicating network calls.
 */
export function puMemo<T>(
	fn: () => T,
	deps: unknown[],
	siteKey?: ServerHookSlot,
	native?: NativeServerMemoMode,
): T {
	const res = RESOLVED as ResolvedMap | null;
	if (res === null) return fn();
	const resolvedSiteKey = siteKey === undefined ? undefined : resolveHookSlot(siteKey);
	const base =
		resolvedSiteKey === undefined
			? '@pu'
			: typeof resolvedSiteKey === 'symbol'
				? (resolvedSiteKey as symbol).toString()
				: String(resolvedSiteKey);
	const frame = FRAME;
	let n = 0;
	let prefix = ASYNC_SCOPE;
	if (frame !== null) {
		n = nextFrameOccurrence(frame, base);
		prefix = asyncFramePath(frame);
	}
	const key = prefix + '|' + base + '#' + n;
	const hit = res.pu.created.get(key);
	if (
		hit !== undefined &&
		serverDepsEqual(hit.deps, deps) &&
		(native === undefined || native.accept(hit))
	) {
		if (native !== undefined) native.replay(hit);
		return hit.value as T;
	}
	// Warm adoption: a parent's warm walk may have prefetched this creation
	// (keyed by the shared slot symbol). Deps must match — a drift between the
	// warm-time and render-time props is a clean miss (the orphaned entry dies
	// with the render). The value is adopted once into the frame-keyed created
	// cache; its unavailable warm tombstone prevents later speculative refetches.
	if (siteKey !== undefined) {
		const wlist = res.pu.warm.get(siteKey);
		if (wlist !== undefined) {
			for (let i = 0; i < wlist.length; i++) {
				const warmed = wlist[i];
				if (serverDepsEqual(warmed.deps, deps)) {
					if (!warmed.available || (native !== undefined && !native.accept(warmed))) continue;
					warmed.available = false;
					const value = warmed.value;
					const creation: ServerPuCreation = {
						deps,
						value,
						site: resolvedSiteKey,
						frame,
					};
					if (native !== undefined) {
						creation.nativeWitness = warmed.nativeWitness;
						native.replay(creation);
					}
					res.pu.created.set(key, creation);
					return value as T;
				}
			}
		}
	}
	const creation =
		native === undefined
			? { deps, value: fn(), site: resolvedSiteKey, frame }
			: native.create(fn, deps, resolvedSiteKey, frame);
	res.pu.created.set(key, creation);
	return creation.value as T;
}

function nativeServerMemoEvidenceValid(entry: ServerMemoEvidence): boolean {
	return entry.nativeWitness !== undefined && validateNativeReadWitness(entry.nativeWitness);
}

function replayNativeServerMemo(entry: ServerMemoEvidence): void {
	replayNativeReadWitness(entry.nativeWitness);
}

function createNativeServerMemo(
	compute: () => unknown,
	deps: unknown[],
	site: ServerHookSlot | undefined,
	frame: Frame | null,
): ServerPuCreation {
	const token = beginNativeReadWitness();
	let completed = false;
	let value: unknown;
	let nativeWitness: NativeReadWitness | null;
	try {
		value = compute();
		completed = true;
	} finally {
		nativeWitness = finishNativeReadWitness(token, completed);
	}
	return { deps, value, site, frame, nativeWitness };
}

const NATIVE_SERVER_MEMO_MODE: NativeServerMemoMode = {
	accept: nativeServerMemoEvidenceValid,
	replay: replayNativeServerMemo,
	create: createNativeServerMemo,
};

/** @internal Native evidence shares the existing cross-pass creation cache. */
export function nativePuMemo<T>(fn: () => T, deps: unknown[], siteKey?: ServerHookSlot): T {
	return puMemo(fn, deps, siteKey, NATIVE_SERVER_MEMO_MODE);
}

/**
 * Register every unresolved thenable of a hoisted-creation run with the render
 * loop, then suspend ONCE — the loop awaits them together and records their
 * outcomes by identity (resolvedT), so the next pass's use() unwraps all
 * succeed in one go. Already-registered-but-unsettled thenables (streaming
 * re-passes render between waves) still force the suspend but are not pushed
 * again. Falls through silently when everything is already resolved.
 */
export function puBatch(thenables: unknown[], warm?: () => void): void {
	// Compiler registration form. Keep the plan lazy so synchronous component
	// trees perform no speculative walk and allocate no warm entries.
	if (thenables.length === 0) {
		if (warm !== undefined) ACTIVE_PU_WARM_PLANS.push(warm);
		return;
	}
	const res = RESOLVED as ResolvedMap | null;
	const pu = res !== null ? res.pu : null;
	// Livelock guard tripped (observeSuspenseWave): keep the status probes below
	// (they feed resolvedT for settled instances) but register nothing and never
	// suspend — the first unresolved use() after this call suspends under its
	// stable string key instead, and key replay completes the render.
	const disabled = pu !== null && pu.batchDisabled === true;
	let pending = false;
	for (let i = 0; i < thenables.length; i++) {
		const t = thenables[i] as PromiseLike<unknown> | null | undefined;
		if (t == null || typeof (t as any).then !== 'function') continue;
		if (pu !== null && pu.resolvedT.has(t)) {
			// Livelock-guard consumption mark (armed only after a first strike).
			pu.touched?.add(t);
			continue;
		}
		// `puBatch` runs before the corresponding use() calls, so it must perform
		// the same status probe for already-instrumented thenables. Otherwise the
		// batch suspends before use() can trigger a Flight-style lazy subscription.
		const instrumented = t as PromiseLike<unknown> & {
			status?: unknown;
			value?: unknown;
			reason?: unknown;
		};
		let status = instrumented.status;
		const wasUninstrumented = status === undefined;
		if (wasUninstrumented) {
			instrumented.status = 'pending';
			instrumented.then(
				(value) => {
					if (instrumented.status === 'pending') {
						instrumented.status = 'fulfilled';
						instrumented.value = value;
					}
				},
				(reason) => {
					if (instrumented.status === 'pending') {
						instrumented.status = 'rejected';
						instrumented.reason = reason;
					}
				},
			);
			status = instrumented.status;
		}
		if (
			!wasUninstrumented &&
			typeof status === 'string' &&
			status !== 'fulfilled' &&
			status !== 'rejected'
		) {
			instrumented.then(NOOP, NOOP);
			status = instrumented.status;
		}
		if (status === 'fulfilled') {
			pu?.resolvedT.set(t, { value: instrumented.value });
			continue;
		}
		if (status === 'rejected') {
			pu?.resolvedT.set(t, { reason: instrumented.reason });
			continue;
		}
		pending = true;
		// Re-registering a still-pending thenable on a later pass is deliberate:
		// the STREAMING loop awaits each pass's SUSPENDED list, so dropping a
		// pending entry would strand its boundary. Duplicate registrations are
		// harmless — synthetic keys are unique, and awaiting a promise twice
		// just records the same outcome twice.
		if (!disabled && SUSPENDED !== null) SUSPENDED.push({ promise: t, key: '|pu#' + PU_ID++ });
	}
	if (!pending || disabled) return;
	// About to suspend — run the warm walk first (the compiler passes the thunk
	// on the active component stack): descendant components' independent creations
	// start AND register with this round via warmMemo, so their data resolves
	// before their bodies ever run — component depth collapses to true
	// data-dependency depth. Speculative: a throwing plan just means fewer
	// prefetches.
	if (ACTIVE_PU_WARM_PLANS.length !== 0 || warm !== undefined) {
		const previousClaims = CURRENT_PU_WARM_CLAIMS;
		CURRENT_PU_WARM_CLAIMS = new Set();
		try {
			for (let i = 0; i < ACTIVE_PU_WARM_PLANS.length; i++) {
				CURRENT_PU_WARM_CLAIMS = new Set();
				try {
					ACTIVE_PU_WARM_PLANS[i]();
				} catch {
					// Independent speculative plans cannot block adjacent warming.
				}
			}
			if (warm !== undefined) {
				CURRENT_PU_WARM_CLAIMS = new Set();
				try {
					warm();
				} catch {
					/* speculative */
				}
			}
		} finally {
			CURRENT_PU_WARM_CLAIMS = previousClaims;
		}
	}
	// Same discovery-job bookkeeping as a suspending use(): register the
	// innermost enclosing component so the render loop can re-run just this
	// subtree next round.
	const frame = FRAME;
	if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
		frame.deferred = true;
		DEFERRED.push({
			comp: CURRENT_COMP,
			props: CURRENT_PROPS,
			parentScope: CURRENT_PARENT_SCOPE,
			frame,
		});
	}
	throw SSR_SUSPENSE;
}

// Warm-walk recursion depth cap — a backstop for recursive components the
// compiler cannot prove finite (mirrors the client's cap).
let WARM_DEPTH = 0;
const WARM_DEPTH_CAP = 64;
// Per-slot occurrence queues are render-local and must remain complete: dropping
// their FIFO head would give a repeated component a later instance's value.

/**
 * Start (and cache) one prefetched creation from a component's compiled fetch
 * plan (`Comp.__warm`). Each plan occurrence claims one matching (slot, deps)
 * entry, so later passes reuse concrete work while repeated equal-dependency
 * instances still start separately. The resulting thenable is REGISTERED with
 * the render loop so the current round awaits it — that is the whole point: the
 * descendant's data settles before its body runs, and its unwraps then resolve
 * by identity (resolvedT). Speculative: a throwing creation is simply not
 * warmed. Returns the claimed/created value so a memoized child PROP printed
 * into a warmChild plan hands the real value to the descent instead of
 * re-evaluating its creation (undefined when nothing could be claimed or
 * created — the descent then just prefetches less).
 */
export function warmMemo(
	compute: () => unknown,
	deps: unknown[],
	slot: ServerHookSlot,
	native?: NativeServerWarmMode,
): unknown {
	const res = RESOLVED;
	if (res === null) return undefined;
	const warm = res.pu.warm;
	let list = warm.get(slot);
	if (list !== undefined) {
		for (let i = 0; i < list.length; i++) {
			const entry = list[i];
			if (
				!serverDepsEqual(entry.deps, deps) ||
				CURRENT_PU_WARM_CLAIMS?.has(entry) ||
				(native !== undefined && !native.accept(entry))
			)
				continue;
			CURRENT_PU_WARM_CLAIMS?.add(entry);
			return entry.value; // this concrete occurrence already ran or warmed
		}
	}
	// A parent plan recurses through the currently-rendering source component as
	// well as earlier siblings. Claim every matching created occurrence across
	// the current render request, not only frame ancestors, before speculating.
	let activeCreation: ServerPuCreation | undefined;
	for (const created of res.pu.created.values()) {
		if (
			created.site === slot &&
			serverDepsEqual(created.deps, deps) &&
			!CURRENT_PU_WARM_CLAIMS?.has(created) &&
			(native === undefined || native.accept(created))
		) {
			activeCreation = created;
			break;
		}
	}
	if (activeCreation !== undefined) {
		CURRENT_PU_WARM_CLAIMS?.add(activeCreation);
		if (list === undefined) {
			list = [];
			warm.set(slot, list);
		}
		// available:false — the render pass owns this creation under its own
		// frame key; the tombstone only blocks a later speculative refetch. The
		// value still rides along so warm-plan PROP claims can hand it onward.
		const entry: ServerWarmEntry = { deps, value: activeCreation.value, available: false };
		if (native !== undefined) entry.nativeWitness = activeCreation.nativeWitness;
		list.push(entry);
		CURRENT_PU_WARM_CLAIMS?.add(entry);
		return activeCreation.value;
	}
	let entry: ServerWarmEntry;
	try {
		entry =
			native === undefined
				? { deps, value: compute(), available: true }
				: native.create(compute, deps);
	} catch {
		return undefined;
	}
	const value = entry.value;
	if (list === undefined) {
		list = [];
		warm.set(slot, list);
	}
	list.push(entry);
	CURRENT_PU_WARM_CLAIMS?.add(entry);
	if (
		value != null &&
		typeof (value as any).then === 'function' &&
		!res.pu.resolvedT.has(value as PromiseLike<unknown>)
	) {
		if (SUSPENDED !== null)
			SUSPENDED.push({ promise: value as PromiseLike<unknown>, key: '|pu#' + PU_ID++ });
	}
	return value;
}

function createNativeServerWarm(compute: () => unknown, deps: unknown[]): ServerWarmEntry {
	const token = beginNativeReadWitness(true);
	let completed = false;
	let value: unknown;
	let nativeWitness: NativeReadWitness | null;
	try {
		value = compute();
		completed = true;
	} finally {
		nativeWitness = finishNativeReadWitness(token, completed);
	}
	return { deps, value, available: true, nativeWitness };
}

const NATIVE_SERVER_WARM_MODE: NativeServerWarmMode = {
	accept: nativeServerMemoEvidenceValid,
	create: createNativeServerWarm,
};

/** @internal Warmed reads become request-owned only when the real body adopts them. */
export function nativeWarmMemo(
	compute: () => unknown,
	deps: unknown[],
	slot: ServerHookSlot,
): unknown {
	return warmMemo(compute, deps, slot, NATIVE_SERVER_WARM_MODE);
}

/**
 * Recurse the warm walk into a child component's compiled fetch plan
 * (`Comp.__warm`, attached by compileServerComponent when the child's
 * reachability and props are provably independent of suspended values).
 * No-ops for components without a plan.
 */
export function warmChild(comp: any, props: any): void {
	if (comp == null) return;
	const plan = comp.__warm;
	if (typeof plan !== 'function') return;
	if (WARM_DEPTH >= WARM_DEPTH_CAP) return;
	WARM_DEPTH++;
	try {
		plan(props);
	} catch {
		/* speculative */
	} finally {
		WARM_DEPTH--;
	}
}

// ---------------------------------------------------------------------------
// lazy — React's code-splitting wrapper, server semantics.
// ---------------------------------------------------------------------------

// Distinguishes lazy payloads in the render loop's suspense cache. Payload state
// lives on the wrapper itself (module-level, like the client), so the key only
// has to be unique per lazy() call — not per frame like use()'s data keys.
let LAZY_ID = 0;
const LAZY_COMPONENT = Symbol.for('octane.lazy');

function resolveLazyModule(mod: any): ServerComponent {
	let comp = mod;
	if (mod != null) {
		const defaultExport = mod.default;
		if (defaultExport !== undefined) comp = defaultExport;
	}
	if (typeof comp !== 'function' || (comp as any)[LAZY_COMPONENT] === true) {
		throw new Error(
			formatServerError(
				10,
				(comp as any)?.[LAZY_COMPONENT] === true ? 'lazy component' : typeof comp,
			),
		);
	}
	return comp as ServerComponent;
}

function callLazyComponent(mod: any, props: any, scope: SSRScope, extra?: any): unknown {
	// Resolve `.default` at render time. If an accessor throws, a later render
	// reads it again without re-running the already-fulfilled loader, matching the
	// client and React payload semantics.
	const comp = resolveLazyModule(mod);
	return comp(lazyResolvedProps(comp, props), scope, extra);
}

/**
 * React's `lazy(load)` — the server mirror of the client wrapper. Unresolved,
 * it records its promise for render()'s await loop and throws the suspense
 * sentinel, so `renderToString` emits the nearest `@pending` fallback for the
 * pass and `prerender` awaits the module and re-renders. Once fulfilled it
 * tail-calls the loaded server component. Deliberately does NOT go through
 * `use()` — a module namespace must never enter the client-seed stream
 * (`SERIAL`), which serializes resolved use() values in render order.
 */
export function lazy<C>(load: () => PromiseLike<{ default: C } | C>): C {
	let status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected' = 'uninitialized';
	let result: any = null; // fulfilled → module value; rejected → the reason
	let promise: PromiseLike<unknown> | null = null;
	const key = '|lazy#' + LAZY_ID++;
	const lazyWrapper = (props: any, scope: SSRScope, extra?: any): unknown => {
		if (status === 'fulfilled') {
			return callLazyComponent(result as ServerComponent, props, scope, extra);
		}
		if (status === 'rejected') throw result;
		if (status === 'uninitialized') {
			try {
				const loaded = load();
				promise = loaded;
				loaded.then(
					(mod: any) => {
						if (status === 'uninitialized' || status === 'pending') {
							status = 'fulfilled';
							result = mod;
						}
					},
					(err: any) => {
						if (status === 'uninitialized' || status === 'pending') {
							status = 'rejected';
							result = err;
						}
					},
				);
			} catch (error) {
				// Do not publish a pending payload until loader and subscription setup
				// both complete. Synchronous failures are retried on the next render.
				if (status === 'uninitialized') promise = null;
				throw error;
			}
			if (status === 'uninitialized') status = 'pending';
			const settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
			if (settledStatus === 'fulfilled') {
				return callLazyComponent(result as ServerComponent, props, scope, extra);
			}
			if (settledStatus === 'rejected') throw result;
		}
		// Same suspend bookkeeping as use(thenable), minus the SERIAL seed push.
		if (SUSPENDED !== null) SUSPENDED.push({ promise: promise!, key });
		const frame = FRAME;
		if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
			frame.deferred = true;
			DEFERRED.push({
				comp: CURRENT_COMP,
				props: CURRENT_PROPS,
				parentScope: CURRENT_PARENT_SCOPE,
				frame,
			});
		}
		throw SSR_SUSPENSE;
	};
	Object.defineProperty(lazyWrapper, LAZY_COMPONENT, { value: true });
	return lazyWrapper as unknown as C;
}

// ---------------------------------------------------------------------------
// Hooks — server semantics. All accept the compiler-injected trailing slot
// symbol. Most ignore it (a server render has no cross-render tracking), but
// useState/useReducer key their render-phase-update records by it (see the
// stateHook machinery above renderComponentFramed).
// ---------------------------------------------------------------------------

export function useState<T = undefined>(): [
	T | undefined,
	(next: T | undefined | ((value: T | undefined) => T | undefined)) => void,
	() => T | undefined,
];
export function useState<T>(
	initial: T | (() => T),
	slot?: symbol,
): [T, (next: T | ((value: T) => T)) => void, () => T];
export function useState<T>(
	initial?: T | (() => T),
	slot?: ServerHookSlot,
): [T, (next: T | ((value: T) => T)) => void, () => T] {
	// A compiled zero-argument call is emitted as `useState(slot)`. Mirror the
	// client trailing-slot ABI so the injected symbol is not mistaken for state.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial;
		initial = undefined as T;
	}
	return stateHook<T, any>(
		basicStateReducer as (s: T, a: any) => T,
		() => (typeof initial === 'function' ? (initial as () => T)() : (initial as T)),
		slot,
	) as [T, (next: any) => void, () => T];
}

type AssertServerUseStateType<T extends true> = T;
type _ServerUseStateAcceptsNoArguments = AssertServerUseStateType<
	typeof useState extends <T = undefined>() => [
		T | undefined,
		(next: T | undefined | ((value: T | undefined) => T | undefined)) => void,
		() => T | undefined,
	]
		? true
		: false
>;

/** Compiler-emitted useState variant for a tuple whose third member is observable. */
export function __useStateWithGetter<T>(
	initial: T | (() => T),
	slot?: symbol,
): [T, (next: any) => void, () => T];
export function __useStateWithGetter<T>(
	initial: T | (() => T),
	slot?: ServerHookSlot,
): [T, (next: any) => void, () => T] {
	// A compiled zero-argument call is emitted as `__useStateWithGetter(slot)`.
	// Mirror the public hook's trailing-slot ABI before creating the getter cell.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial;
		initial = undefined as T;
	}
	return stateHook<T, any>(
		basicStateReducer as (s: T, a: any) => T,
		() => (typeof initial === 'function' ? (initial as () => T)() : initial),
		slot,
		true,
	) as [T, (next: any) => void, () => T];
}

export interface LinkedStatePrevious<Source, Value> {
	source: Source;
	value: Value;
}

export interface LinkedStateOptions<Source, Value> {
	sourceEqual?: (previous: Source, next: Source) => boolean;
	valueEqual?: (previous: Value, next: Value) => boolean;
}

function linkedStateHook<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot: LinkedStateOptions<Source, Value> | ServerHookSlot | undefined,
	maybeSlot: ServerHookSlot | undefined,
	withGetter: boolean,
): [Value, (next: Value | ((previous: Value) => Value)) => void, (() => Value)?] {
	const options =
		optionsOrSlot !== null && typeof optionsOrSlot === 'object' ? optionsOrSlot : undefined;
	const slot = maybeSlot ?? (options === undefined ? optionsOrSlot : undefined);
	const hp = HOOK_PASS;
	if (hp === null) {
		const value = reconcile(source, undefined);
		return withGetter ? [value, NOOP, () => value] : [value, NOOP];
	}

	const position = hookPosition(slot)!;
	const { list, index } = position;
	let record = list[index] as LinkedHookRec<Source, Value> | undefined;
	const sourceEqual = options?.sourceEqual ?? Object.is;
	const valueEqual = options?.valueEqual ?? Object.is;
	if (record === undefined) {
		const initial = reconcile(source, undefined);
		const current: LinkedHookRec<Source, Value> = {
			source,
			value: initial,
			pendingValue: initial,
			queue: [],
			valueEqual,
			dispatch(action) {
				if (hp !== HOOK_PASS) return;
				const previous = current.pendingValue;
				const next =
					typeof action === 'function' ? (action as (previous: Value) => Value)(previous) : action;
				if (current.valueEqual(previous, next)) return;
				current.pendingValue = next;
				current.queue.push(next);
				hp.update = true;
			},
		};
		list[index] = record = current;
	} else {
		if (record.queue.length !== 0) {
			record.value = record.pendingValue;
			record.queue.length = 0;
		}
		record.valueEqual = valueEqual;
		if (!sourceEqual(record.source, source)) {
			const previous = { source: record.source, value: record.value };
			const next = reconcile(source, previous);
			record.value = valueEqual(record.value, next) ? record.value : next;
			record.pendingValue = record.value;
			record.source = source;
		}
	}

	if (!withGetter) return [record.value, record.dispatch];
	const getter = (record.getter ??= () => record.pendingValue);
	return [record.value, record.dispatch, getter];
}

export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value>,
	slot?: symbol,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value];
export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot?: LinkedStateOptions<Source, Value> | ServerHookSlot,
	maybeSlot?: ServerHookSlot,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value] {
	return linkedStateHook(source, reconcile, optionsOrSlot, maybeSlot, false) as [
		Value,
		(next: Value | ((previous: Value) => Value)) => void,
		() => Value,
	];
}

/** Compiler-emitted linked-state variant when its latest-value getter is observed. */
export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value>,
	slot?: symbol,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value];
export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot?: LinkedStateOptions<Source, Value> | ServerHookSlot,
	maybeSlot?: ServerHookSlot,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value] {
	return linkedStateHook(source, reconcile, optionsOrSlot, maybeSlot, true) as [
		Value,
		(next: Value | ((previous: Value) => Value)) => void,
		() => Value,
	];
}

export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	maybeSlot?: symbol,
): [S, (action: A) => void, () => S];
export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol | string,
	maybeSlot?: ServerHookSlot,
): [S, (action: A) => void, () => S] {
	const init = typeof initOrSlot === 'function' ? initOrSlot : undefined;
	const slot = maybeSlot !== undefined ? maybeSlot : initOrSlot;
	return stateHook<S, A>(
		reducer,
		() => (init ? init(initialArg) : (initialArg as unknown as S)),
		slot,
	) as [S, (action: A) => void, () => S];
}

/** Compiler-emitted useReducer variant for a tuple whose third member is observable. */
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	maybeSlot?: symbol,
): [S, (action: A) => void, () => S];
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol | string,
	maybeSlot?: ServerHookSlot,
): [S, (action: A) => void, () => S] {
	const init = typeof initOrSlot === 'function' ? initOrSlot : undefined;
	const slot = maybeSlot !== undefined ? maybeSlot : initOrSlot;
	return stateHook<S, A>(
		reducer,
		() => (init ? init(initialArg) : (initialArg as unknown as S)),
		slot,
		true,
	) as [S, (action: A) => void, () => S];
}

export function useEffect(): void {}
export const useLayoutEffect = useEffect;
export const useInsertionEffect = useEffect;
export function useImperativeHandle(): void {}

function memoHookValue<T>(
	input: T | (() => T),
	compute: boolean,
	depsOrSlot?: readonly unknown[] | null | ServerHookSlot,
	maybeSlot?: ServerHookSlot,
): T {
	const deps = Array.isArray(depsOrSlot) ? depsOrSlot : null;
	const slot =
		maybeSlot ?? (Array.isArray(depsOrSlot) || depsOrSlot === null ? undefined : depsOrSlot);
	// `null` means recompute every pass. Omitted dependency arrays reach the
	// runtime as compiler-inferred arrays, preserving Octane's documented API.
	if (deps === null) return compute ? (input as () => T)() : (input as T);
	const position = hookPosition(slot);
	if (position === null) return compute ? (input as () => T)() : (input as T);
	let rec = position.list[position.index] as MemoHookRec | undefined;
	if (rec === undefined) {
		rec = { value: compute ? (input as () => T)() : input, deps: deps.slice() };
		position.list[position.index] = rec;
	} else if (!serverDepsEqual(rec.deps, deps)) {
		rec.value = compute ? (input as () => T)() : input;
		rec.deps = deps.slice();
	}
	return rec.value as T;
}

export function useMemo<T>(compute: () => T, deps?: readonly unknown[] | null, slot?: symbol): T;
export function useMemo<T>(
	compute: () => T,
	depsOrSlot?: readonly unknown[] | null | ServerHookSlot,
	maybeSlot?: ServerHookSlot,
): T {
	return memoHookValue<T>(compute, true, depsOrSlot, maybeSlot);
}

export function useCallback<F>(fn: F, deps?: readonly unknown[] | null, slot?: symbol): F;
export function useCallback<F>(
	fn: F,
	depsOrSlot?: readonly unknown[] | null | ServerHookSlot,
	maybeSlot?: ServerHookSlot,
): F {
	return memoHookValue<F>(fn, false, depsOrSlot, maybeSlot);
}

export function useRef<T = undefined>(): { current: T | undefined };
export function useRef<T>(initial: T, slot?: symbol): { current: T };
export function useRef<T>(initial?: T, slot?: ServerHookSlot): { current: T | undefined } {
	// A spread-shaped zero-argument call cannot be padded positionally, so the
	// compiler retains the self-identifying Symbol ABI: `useRef(slot)`.
	if (slot === undefined && typeof initial === 'symbol') {
		slot = initial;
		initial = undefined;
	}
	const position = hookPosition(slot);
	if (position === null) return { current: initial };
	let rec = position.list[position.index] as RefHookRec | undefined;
	if (rec === undefined) {
		rec = { ref: { current: initial } };
		position.list[position.index] = rec;
	}
	return rec.ref as { current: T | undefined };
}

/** React's `useDebugValue` — devtools-only on the client, no-op everywhere. */
export function useDebugValue(_value?: unknown, _format?: unknown): void {}

/**
 * React DOM's `requestFormReset` — a server no-op (there is no DOM form to
 * reset; the client runtime owns the real implementation). Exported so
 * isomorphic component code resolves under the server build.
 */
export function requestFormReset(_form?: unknown): void {}

export function useId(): string {
	// Same root-local namespace/counter shape as the client hydration pass.
	return ':' + ID_PREFIX + 'in-' + (ID_COUNTER++).toString(36) + ':';
}

function throwOnServerEffectEventCall(): never {
	throw new Error(formatServerError(11));
}

export function useEffectEvent<F>(_fn: F): F {
	// A server pass may declare an Effect Event so the same component can hydrate,
	// but invoking it during render is forbidden. React deliberately returns one
	// shared thrower here, so server-rendered Effect Event identities are not a
	// meaningful contract either.
	return throwOnServerEffectEventCall as unknown as F;
}

export function useTransition(): [boolean, (fn: () => void | Promise<unknown>) => void] {
	return [false, NOOP];
}

export function useDeferredValue<T>(value: T, ...rest: any[]): T {
	// Optional initialValue precedes the trailing slot symbol.
	return rest.length >= 2 ? (rest[0] as T) : value;
}

export function useSyncExternalStore<T>(
	_subscribe: unknown,
	getSnapshot: () => T,
	...rest: any[]
): T {
	// `getServerSnapshot` (if provided) precedes the trailing slot symbol.
	const getServerSnapshot = rest.length >= 2 ? (rest[0] as () => T) : undefined;
	return getServerSnapshot ? getServerSnapshot() : getSnapshot();
}

export function useActionState<S>(
	_action: unknown,
	initialState: S,
): [S, (payload?: any) => void, boolean] {
	return [initialState, NOOP, false];
}

export interface FormStatus {
	pending: boolean;
	data: FormData | null;
	method: string;
	action: ((formData: FormData) => unknown) | string | null;
}
export function useFormStatus(): FormStatus {
	return { pending: false, data: null, method: 'get', action: null };
}

export function useOptimistic<S, V = S>(state: S): [S, (value: V) => void] {
	return [state, NOOP];
}

export function memo<P>(component: P): P {
	return component;
}

// Custom-hook wrapper. The compiler emits each hook call reached THROUGH a custom
// hook as `withSlot(sym, hook, ...args)` (see runtime.ts) in BOTH modes. Keep the
// whole nested call-site path ambient while the wrapped hook runs so its base
// hooks resolve by definition site + every call boundary, rather than by a
// render-pass occurrence that can shift when a conditional call disappears.
export function withSlot<T>(sym: symbol, fn: (...a: any[]) => T, ...args: any[]): T;
export function withSlot<T>(sym: ServerHookSlot, fn: (...a: any[]) => T, ...args: any[]): T {
	HOOK_SLOT_PATH.push(sym);
	try {
		return fn(...args);
	} finally {
		HOOK_SLOT_PATH.pop();
	}
}

// startTransition — on the client this bumps a priority flag and schedules
// transition-priority renders; on the server there is no scheduler and a render
// is synchronous, so run the callback inline (matching the server no-op transition
// hooks: `useTransition` returns `[false, NOOP]`). An async callback's returned
// promise is ignored — SSR captures the synchronous pass only.
export function startTransition(fn: () => void | Promise<unknown>): void {
	fn();
}

// flushSync — on the client this drains the update queue synchronously around
// the callback; on the server a render IS synchronous and there is no queue,
// so run the callback and return its result (mirrors startTransition above).
export function flushSync<T>(fn: () => T): T {
	return fn();
}

// Children-block tagging — same contract as the client runtime (runtime.ts):
// the compiler tags element/text children lowered to a render function so
// `isChildrenBlock` can tell them from a user render-prop child; both runtimes
// use the SAME `Symbol.for` key so identity holds across mixed graphs.
const CHILDREN_BLOCK: unique symbol = Symbol.for('octane.childrenBlock') as any;

/**
 * Compiler-emitted: tag a children-block render function so `isChildrenBlock`
 * recognises it. Returns the function for inline use.
 * @internal
 */
export function markChildrenBlock<T>(fn: T): T {
	if (typeof fn === 'function') {
		(fn as any)[CHILDREN_BLOCK] = true;
	}
	return fn;
}

/** Server twin of the compiler-visible descriptor-children marker. */
export function descriptorChildren<T>(component: T): T {
	return component;
}

/**
 * True when `value` is a compiler-generated children-block (element/text
 * children lowered to a render function) — as opposed to a user render-prop
 * function or any other value. Server twin of the client helper.
 */
export function isChildrenBlock(value: unknown): boolean {
	return typeof value === 'function' && (value as any)[CHILDREN_BLOCK] === true;
}

// ---------------------------------------------------------------------------
// CSS — the compiled server body calls injectStyle(hash, css) at the top of
// each component; we accumulate into the active render's CSS map (deduped by
// hash) for the RenderResult.css field.
// ---------------------------------------------------------------------------

export function injectStyle(id: string, css: string, nonce?: string): void {
	if (CSS !== null) CSS.set(id, nonce === undefined ? { css } : { css, nonce });
}

// Compiler-emitted for each hoisted `<title>`/`<meta>`/`<link>` (rendered
// anywhere in a component). Serializes the element inside a paired ownership
// marker interval that the client's headBlock adopts and appends it to the active
// render-pass head buffer (null-guarded like injectStyle, so it only collects
// during a synchronous pass). Returned as RenderResult.head and injected at
// <!--ssr-head-->.
const HEAD_VOID_ELEMENTS = new Set(['meta', 'link', 'base']);

export function ssrHeadEl(
	key: string,
	tag: string,
	attrs: Record<string, unknown> | null,
	text: unknown,
): string {
	// Returns '' so a NESTED hoist can sit in an html expression (the head write
	// happens at the authored position; the body markup gains nothing).
	// Inside a fallback (any depth — see FALLBACK_HOIST_DEPTH) the hoist is
	// dropped entirely, like React: the head outlives the fallback.
	if (HEAD === null || FALLBACK_HOIST_DEPTH !== 0) return '';
	// Paired ownership comments bound the exact adoption interval; static markup
	// is non-hydratable, so both are omitted there.
	const rootSuffix = HEAD.rootSuffix;
	const ownershipKey = MARKERS ? (rootSuffix === '' ? key : key + rootSuffix) : '';
	let s = (MARKERS ? '<!--' + ownershipKey + '-->' : '') + '<' + tag;
	if (attrs !== null) {
		for (const k in attrs) {
			// Hoisted metadata must share ordinary-host value filtering and DEV
			// diagnostics. In particular, lowercase event props and invalid booleans
			// cannot bypass ssrAttr merely because the element moved into <head>.
			s += ssrAttrEntry(k, attrs[k], tag, 'html');
		}
	}
	if (HEAD_VOID_ELEMENTS.has(tag)) {
		s += '>';
	} else {
		s += '>' + (text == null ? '' : escapeHtml(text)) + '</' + tag + '>';
	}
	if (MARKERS) s += '<!--/' + ownershipKey + '-->';
	// Priority routing (fold order: charset, viewport, everything else — see
	// HeadBuffer). Ownership markers travel with the element, so hydration
	// adoption is position-independent.
	if (tag === 'meta' && attrs !== null) {
		if (attrs.charSet !== undefined || attrs.charset !== undefined) {
			HEAD.charset += s;
			return '';
		}
		if (attrs.name === 'viewport') {
			HEAD.viewport += s;
			return '';
		}
	}
	HEAD.html += s;
	return '';
}

interface NamespaceHeadProps {
	headKey: string;
	tag: string;
	attrs: Record<string, unknown> | null;
	text: unknown;
}

// Server twin of runtime.ts's namespaceHead compiler ABI. An opaque component
// boundary inherits its parser namespace through FRAME. HTML children contribute
// to the render's head buffer; SVG/MathML children serialize as an ordinary host
// descriptor in the component's body range.
/** @internal Compiler-generated. */
export function namespaceHead(props: NamespaceHeadProps): ElementDescriptor | null {
	if ((FRAME?.namespace ?? 'html') !== 'html') {
		return createElement(props.tag, props.attrs, props.text);
	}
	let headAttrs: Record<string, unknown> | null = null;
	if (props.attrs !== null) {
		headAttrs = {};
		for (const key in props.attrs) {
			if (key === 'key' || key === 'ref' || key === 'class' || key === 'className') continue;
			headAttrs[key] = props.attrs[key];
		}
	}
	ssrHeadEl(props.headKey, props.tag, headAttrs, props.text);
	return null;
}

/** @internal Compiler-generated descriptor factory for namespaceHead. */
export function namespaceHeadElement(
	headKey: string,
	tag: string,
	attrs: Record<string, unknown> | null,
	text: unknown,
	authoredKey?: unknown,
): ElementDescriptor {
	const key = authoredKey !== undefined ? authoredKey : (attrs as any)?.key;
	const config: any = { headKey, tag, attrs, text };
	if (key !== undefined) config.key = key;
	return createElement(namespaceHead as unknown as ServerComponent, config);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The result of a buffered server render (`renderToString` / `renderToStaticMarkup`
 * / `prerender`).
 *
 * - `html` — the rendered markup. Hoisted document metadata (`<title>`/`<meta>`/
 *   `<link>`, collected via `ssrHeadEl`) is folded IN: spliced before `</head>`
 *   when the render produced a document, otherwise prepended. (React folds head
 *   resources into the document too, which is why folding is the default.)
 * - `head`, the hoisted metadata on its own, present ONLY under
 *   `headChannel: 'separate'`; `html` then excludes it. For hosts that render
 *   into a `<head>`-bearing template they own rather than rendering the
 *   document, where the fold has no `</head>` to target and would otherwise
 *   prepend metadata into the body. See `RenderOptions.headChannel`.
 * - `css` — the scoped stylesheets of the components that rendered, as
 *   ready-to-place `<style data-octane="hash">…</style>` tags (one per hash,
 *   deduped). Kept as its own field because octane has scoped CSS that React core
 *   does not; the client's `injectStyle` matches the `data-octane` hash and skips
 *   re-injecting on hydration, so the styles cross the boundary once. (Streaming
 *   has no `css` field — scoped `<style>` flushes inline with the content that
 *   uses it, as React does.)
 */
export interface RenderResult {
	html: string;
	css: string;
	head?: string;
	/** Ready native values represented by this result's own HTML. */
	signals?: NativeSignalManifest;
}

/** Options accepted by the buffered render entry points (React-shaped subset). */
export interface RenderOptions {
	/** Caller-controlled namespace for `useId`; use distinct prefixes for sibling roots. */
	identifierPrefix?: string;
	/** Called with any error thrown during the render (before it propagates). */
	onError?: (error: unknown) => void;
	/**
	 * Abort the render when the request dies: rejects the pending suspense wait
	 * with `signal.reason`. Checked before each pass and raced against the await.
	 * Async renders only (`prerender`); `renderToString` is a single sync pass.
	 */
	signal?: AbortSignal;
	/**
	 * CSP nonce stamped on every inline tag the renderer emits: the deduped
	 * `<style data-octane>` tags and the suspense seed `<script>`.
	 */
	nonce?: string;
	/**
	 * Per-render override of the global suspense settle deadline
	 * (setSsrSuspenseTimeout). 0 disables the deadline for this render. Async
	 * renders only (`prerender`).
	 */
	timeoutMs?: number;
	/**
	 * Where hoisted `<title>`/`<meta>`/`<link>` go.
	 *
	 * `'fold'` (default) keeps React's resource-hoisting shape: the metadata is
	 * spliced into `html` before `</head>`, or prepended when the render is not a
	 * document. `'separate'` withholds it from `html`/the streamed shell and hands
	 * it over on its own, `RenderResult.head` for the buffered renderers,
	 * `StreamOptions.onHeadReady` for the streaming ones.
	 *
	 * A host that renders into a `<head>`-bearing template it owns (rather than
	 * rendering the document itself) needs `'separate'`: the fold has no
	 * `</head>` to find in a body-only render, so it would prepend the metadata
	 * into the body, where a `<title>` loses to the template's and a canonical or
	 * description is ignored outright.
	 */
	headChannel?: 'fold' | 'separate';
}

// Insert the hoisted head markup into `body`: before `</head>` when the render
// produced a document (React-19 resource-hoisting shape), otherwise prepend it so
// the caller/metaframework can place `html` in a document whose `<head>` then
// contains the metadata. Empty head → body unchanged.
function spliceHead(body: string, head: string): string {
	if (head === '') return body;
	const headClose = body.indexOf('</head>');
	if (headClose !== -1) return body.slice(0, headClose) + head + body.slice(headClose);
	return head + body;
}

/** Guard against a `use(thenable)` that never resolves wedging the render loop. */
const MAX_SUSPENSE_PASSES = 50;

// Wall-clock bound on a single suspense await. MAX_SUSPENSE_PASSES caps the
// NUMBER of re-render passes, but it's checked BEFORE the await — so a thenable
// that never settles would leave the settle await (and the request) hung forever.
// This deadline races that await so a stuck thenable fails the render instead.
// 0 disables the deadline (await indefinitely). Configurable for tests/hosts.
let SUSPENSE_TIMEOUT_MS = 10_000;

export function setSsrSuspenseTimeout(ms: number): void {
	SUSPENSE_TIMEOUT_MS = ms;
}

export function getSsrSuspenseTimeout(): number {
	return SUSPENSE_TIMEOUT_MS;
}

function serializeSuspenseSeedJson(values: unknown[]): string {
	let wireValues: unknown[] | null = null;
	let rejections: Array<[number, HydrationRejectionPayload]> | null = null;
	let sites: Array<[string, number]> | null = null;
	let hasSeededSite = false;
	for (let i = 0; i < values.length; i++) {
		let value = values[i];
		if (
			value !== null &&
			typeof value === 'object' &&
			hasOwnProp.call(value, HYDRATION_SITE_EVENT)
		) {
			wireValues ??= values.slice(0, i);
			sites ??= [];
			const event = value as HydrationSiteEvent;
			value = event.value;
			if (value === HYDRATION_SITE_EVENT) {
				sites.push([event[HYDRATION_SITE_EVENT], -1]);
				continue;
			}
			hasSeededSite = true;
			sites.push([event[HYDRATION_SITE_EVENT], wireValues.length]);
		}
		if (isHydrationRejectionSeed(value)) {
			wireValues ??= values.slice(0, i);
			rejections ??= [];
			rejections.push([wireValues.length, value[HYDRATION_REJECTION_SEED]]);
			wireValues.push(null);
		} else if (wireValues !== null) {
			wireValues.push(value);
		}
	}
	const actualValues = wireValues ?? values;
	// Successful untagged seeds retain the established compact array format.
	// Rejections and compiler-owned site outcomes use renderer-owned TOP-LEVEL
	// metadata so fulfilled user values cannot collide with either protocol.
	// Unseeded site outcomes matter only when a seeded site exists in the same
	// scope; otherwise the client can safely execute every request factory.
	const payload =
		rejections === null && !hasSeededSite
			? actualValues
			: {
					[REJECTION_SENTINEL_KEY]: {
						version: 1,
						values: actualValues,
						rejections: rejections ?? [],
						...(hasSeededSite ? { sites: sites! } : {}),
					},
				};
	const undefinedWire = SUSPENSE_SEED_WIRE_PREFIX + 'u';
	const escapedStringWire = SUSPENSE_SEED_WIRE_PREFIX + 's';
	return JSON.stringify(payload, (_key, value) => {
		if (value === undefined) return undefinedWire;
		if (typeof value === 'string' && value.startsWith(SUSPENSE_SEED_WIRE_PREFIX)) {
			return escapedStringWire + value;
		}
		return value;
	}).replace(/</g, '\\u003c');
}

/**
 * Serialize the resolved `use(thenable)` values (in render order) into an inline
 * data `<script>` the client reads during hydration. `<` is escaped to
 * `\u003c` so the JSON payload can't terminate the `<script>` element or open
 * an HTML comment. Only emitted when at least one value was resolved.
 */
function serializeSuspenseSeeds(values: unknown[], nonceAttr: string): string {
	// Encode `undefined` (which JSON drops/nulls) through the seed wire escape so a
	// `use(thenable)` that resolved to `undefined` round-trips to `undefined` on
	// the client — not `null`. Prefix-leading user strings are escaped first, so
	// neither sentinel-shaped objects nor user strings can collide with it.
	const json = serializeSuspenseSeedJson(values);
	if (json === '[]') return '';
	return (
		'<script type="application/json" ' + SUSPENSE_SCRIPT_ATTR + nonceAttr + '>' + json + '</script>'
	);
}

function serializeNativeSignalSeeds(signals: NativeSignalManifest, nonceAttr: string): string {
	// Native values already have an unambiguous tagged JSON grammar. Apply the
	// same script-text '<' escaping as use() seeds, without their positional
	// undefined/string-prefix wire encoding.
	const json = JSON.stringify(signals).replace(/</g, '\\u003c');
	return (
		'<script type="application/json" ' +
		NATIVE_SIGNAL_SEED_ATTR +
		nonceAttr +
		'>' +
		json +
		'</script>'
	);
}

/**
 * The buffered render pipeline (`renderToString` / `renderToStaticMarkup` /
 * `prerender`). Hoisted document-head markup (`<title>`/`<meta>`/`<link>`
 * collected by `ssrHeadEl`, each prefixed with a `<!--key-->` adoption marker)
 * folds into the result `html`; scoped stylesheets are emitted as deduped
 * `<style data-octane="hash">…</style>` tags in `css` (the client's
 * `injectStyle` matches the hash and skips re-injecting on hydration, so the
 * styles cross the boundary once).
 *
 * Suspense: a `use(thenable)` that hasn't resolved suspends the pass; `prerender`
 * awaits it and re-renders so the @try shows its resolved success arm (or @catch
 * on rejection), while `renderToString` (sync) leaves the @pending fallback. Each
 * resolved value is appended as an inline data `<script>` for the client to seed.
 */
type SuspendedList = { promise: PromiseLike<unknown>; key: string }[];
type SuspenseResult = { value: unknown } | { reason: unknown };
type SuspenseOutcome = SuspenseResult & {
	/** Thenable whose settlement produced this string-keyed cached result. */
	thenable: PromiseLike<unknown>;
};
// The render-local suspense cache. `pu` carries the SSR parallel-use mirror's
// state (docs/suspense-parallel-use-plan.md Phase 5), hung off the SAME object
// so every existing threading path — pass functions, discovery rounds, both
// settle loops, ambient save/restore — carries it with no extra parameters:
//   created:   keyed CROSS-PASS creation cache (puMemo) — the same fetch
//              expression yields the SAME thenable instance on every pass, so
//              re-runs never duplicate network calls;
//   resolvedT: outcomes keyed by THENABLE IDENTITY — how batch-registered
//              thenables resolve at their later `use()` unwrap sites (a batch
//              can't know the unwraps' string keys, but puMemo makes instance
//              identity stable across passes);
type ResolvedMap = Map<string, SuspenseOutcome> & {
	/** Undefined for externally hosted passes whose request lifetime is not owned here. */
	resourceOptions?: RenderOptions | null;
	/** Optional renderer resources; allocated only by a participating adapter. */
	resources?: ServerRenderResources;
	/** Render-local stable ids for non-primitive and long string control/list keys. */
	asyncIdentities: Map<unknown, number>;
	/** Cross-pass fallback ids for transient object keys at one lexical position. */
	asyncPositionIdentities: Map<string, number>;
	nextAsyncIdentity: number;
	/** Lazily allocated DEV SSR invalid-nesting warnings reported by this render. */
	nestingWarnings?: Set<string>;
	pu: {
		created: Map<string, ServerPuCreation>;
		resolvedT: Map<PromiseLike<unknown>, SuspenseResult>;
		// Warm-walk prefetches (warmMemo), keyed by the creation's SLOT symbol —
		// a value is adoptable once, while its retained tombstone prevents a later
		// dependency stratum from speculatively recreating the same request.
		warm: Map<ServerHookSlot, ServerWarmEntry[]>;
		/** Livelock guard tripped (see observeSuspenseWave): puBatch stops
		 *  registering/suspending for the rest of this render so plain use()
		 *  string-key replay drives progress instead. */
		batchDisabled?: boolean;
		/** Consecutive recreation strikes + the creation-cache size at the
		 *  initial pending pass, then at each observeSuspenseWave observation. */
		recreate?: { strikes: number; prevCreated: number };
		/** Armed by observeSuspenseWave after a first strike: identity-resolved
		 *  thenables (use() / puBatch resolvedT hits) are recorded here during
		 *  the next pass so the guard can tell a legitimate waterfall stratum
		 *  (it CONSUMES the previous wave's outcomes) from ancestor recreation
		 *  (the settled instances are never referenced again). Undefined —
		 *  the common case — costs one undefined-check per identity hit. */
		touched?: Set<PromiseLike<unknown>>;
	};
};
function newResolvedMap(resourceOptions?: RenderOptions | null): ResolvedMap {
	const m = new Map() as ResolvedMap;
	if (resourceOptions !== undefined) m.resourceOptions = resourceOptions;
	m.asyncIdentities = new Map();
	m.asyncPositionIdentities = new Map();
	m.nextAsyncIdentity = 0;
	m.pu = { created: new Map(), resolvedT: new Map(), warm: new Map() };
	return m;
}

/** @internal Request lifetime for an optional renderer's asynchronous server work. */
export interface ServerRenderResourceContext {
	readonly signal: AbortSignal | undefined;
	readonly nonce: string | undefined;
	readonly timeoutMs: number;
	/** Release unfinished work on success, failure, cancellation, or a synchronous shell return. */
	registerCleanup(cleanup: () => void): () => void;
}

interface ServerRenderResources extends ServerRenderResourceContext {
	finished: boolean;
	cleanups: Map<() => void, () => void>;
}

/**
 * Only an owned Octane request can retain foreign work between server passes.
 * A hosted pass has no authority to observe its external renderer's completion
 * or cancellation; return null so its adapter can reject before starting work.
 */
export function getServerRenderResourceContext(): ServerRenderResourceContext | null {
	const resolved = RESOLVED;
	if (resolved === null || resolved.resourceOptions === undefined) return null;
	if (resolved.resources !== undefined) return resolved.resources;
	const options = resolved.resourceOptions;
	const resources: ServerRenderResources = {
		signal: options?.signal,
		nonce: options?.nonce,
		timeoutMs: options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS,
		finished: false,
		cleanups: new Map(),
		registerCleanup(cleanup) {
			if (resources.finished) {
				cleanup();
				return NOOP;
			}
			// Registration identity, not callback identity, owns the resource.
			// Two islands may intentionally use the same cleanup function.
			const release = () => {
				resources.cleanups.delete(release);
			};
			resources.cleanups.set(release, cleanup);
			return release;
		},
	};
	resolved.resources = resources;
	return resources;
}

function releaseServerRenderResources(resolved: ResolvedMap): void {
	const resources = resolved.resources;
	// Native thenable settlement callbacks can retain this cache after an abort.
	// They must not also keep a completed request's options or foreign resources.
	resolved.resourceOptions = undefined;
	if (resources !== undefined) resolved.resources = undefined;
	if (resources === undefined || resources.finished) return;
	resources.finished = true;
	let failure: { error: unknown } | undefined;
	for (const [release, cleanup] of resources.cleanups) {
		resources.cleanups.delete(release);
		try {
			cleanup();
		} catch (error) {
			failure ??= { error };
		}
	}
	if (failure !== undefined) throw failure.error;
}

interface FullPassResult {
	body: string;
	head: string;
	css: string;
	serial: unknown[];
	suspended: SuspendedList;
	deferred: Job[];
	/** A bare suspension escaped the root instead of being owned by an ssrTry. */
	rootSuspended: boolean;
	/** Whether this pass rendered ViewTransition candidate attributes that need
	 *  the final residual-candidate cleanup scan. */
	vtCandidates: boolean;
	/** Per-hash scoped stylesheets from this pass — the streaming renderer diffs
	 *  these against what it already flushed to emit late boundaries' styles. */
	cssEntries: Map<string, InjectedStyle>;
	/** Per-resource Float sheet tags from this pass (see HeadBuffer.sheets) —
	 *  diffed the same way so late-discovered resources ride the wave chunks. */
	sheets: Map<string, { precedence: string; html: string }> | null;
	signals?: NativeSignalManifest;
}

// Snapshot / install / restore the module globals around ONE synchronous pass
// (or discovery round). Everything a pass touches lives here so a concurrent
// render() that interleaves across our `await` can't observe or clobber our
// in-flight pass — the globals are always restored before we yield the tick.
interface Ambient {
	scope: SSRScope | null;
	nativePass: number;
	nativeReads: NativeSeedReads | null;
	nativeFailures: number;
	nativeLocalDisposes: Array<() => void> | null;
	warmPlans: Array<() => void>;
	warmClaims: Set<object> | null;
	id: number;
	idPrefix: string;
	css: Map<string, InjectedStyle> | null;
	nonceAttr: string;
	markers: boolean;
	permanentStaticHydrateDepth: number;
	head: HeadBuffer | null;
	fallbackHoistDepth: number;
	susp: SuspendedList | null;
	res: ResolvedMap | null;
	serial: unknown[] | null;
	frame: Frame | null;
	deferred: Job[] | null;
	comp: ServerComponent | null;
	props: any;
	parentScope: SSRScope | null;
	asyncScope: string;
	ssrElement: SsrElementContext | null;
	nestingWarnings: Set<string> | null | undefined;
	vtTrySeq: number;
	vtHasCandidates: boolean;
	vtStack: Array<{ candidate: VtSsrCandidate; consumed: boolean }>;
}
function saveAmbient(): Ambient {
	return {
		scope: CURRENT_SCOPE,
		nativePass: NATIVE_SERVER_PASS,
		nativeReads: NATIVE_SERVER_READS,
		nativeFailures: NATIVE_SERVER_FAILURES,
		nativeLocalDisposes: NATIVE_LOCAL_HOOK_DISPOSES,
		warmPlans: ACTIVE_PU_WARM_PLANS.slice(),
		warmClaims: CURRENT_PU_WARM_CLAIMS,
		id: ID_COUNTER,
		idPrefix: ID_PREFIX,
		css: CSS,
		nonceAttr: NONCE_ATTR,
		markers: MARKERS,
		permanentStaticHydrateDepth: PERMANENT_STATIC_HYDRATE_DEPTH,
		head: HEAD,
		fallbackHoistDepth: FALLBACK_HOIST_DEPTH,
		susp: SUSPENDED,
		res: RESOLVED,
		serial: SERIAL,
		frame: FRAME,
		deferred: DEFERRED,
		comp: CURRENT_COMP,
		props: CURRENT_PROPS,
		parentScope: CURRENT_PARENT_SCOPE,
		asyncScope: ASYNC_SCOPE,
		ssrElement: CURRENT_SSR_ELEMENT,
		nestingWarnings: SSR_NESTING_WARNINGS,
		vtTrySeq: VT_SSR_TRY_SEQ,
		vtHasCandidates: VT_SSR_HAS_CANDIDATES,
		vtStack: VT_SSR_STACK.map((candidate) => ({ candidate, consumed: candidate.consumed })),
	};
}
function restoreAmbient(a: Ambient): void {
	let disposalError: { value: unknown } | undefined;
	if (NATIVE_LOCAL_HOOK_DISPOSES !== null) {
		const disposes = NATIVE_LOCAL_HOOK_DISPOSES;
		NATIVE_LOCAL_HOOK_DISPOSES = null;
		const collector = NATIVE_READ_COLLECTOR;
		const token = collector?.pauseLifecycle() ?? -1;
		try {
			for (let i = disposes.length - 1; i >= 0; i--) {
				try {
					disposes[i]();
				} catch (error) {
					disposalError ??= { value: error };
				}
			}
		} finally {
			if (token >= 0) collector!.resumeLifecycle(token);
		}
	}
	if (NATIVE_SERVER_PASS >= 0) NATIVE_READ_COLLECTOR!.endPass(NATIVE_SERVER_PASS);
	NATIVE_SERVER_PASS = a.nativePass;
	NATIVE_SERVER_READS = a.nativeReads;
	NATIVE_SERVER_FAILURES = a.nativeFailures;
	NATIVE_LOCAL_HOOK_DISPOSES = a.nativeLocalDisposes;
	CURRENT_SCOPE = a.scope;
	ACTIVE_PU_WARM_PLANS.length = 0;
	ACTIVE_PU_WARM_PLANS.push(...a.warmPlans);
	CURRENT_PU_WARM_CLAIMS = a.warmClaims;
	ID_COUNTER = a.id;
	ID_PREFIX = a.idPrefix;
	CSS = a.css;
	NONCE_ATTR = a.nonceAttr;
	MARKERS = a.markers;
	PERMANENT_STATIC_HYDRATE_DEPTH = a.permanentStaticHydrateDepth;
	HEAD = a.head;
	FALLBACK_HOIST_DEPTH = a.fallbackHoistDepth;
	SUSPENDED = a.susp;
	RESOLVED = a.res;
	SERIAL = a.serial;
	FRAME = a.frame;
	DEFERRED = a.deferred;
	CURRENT_COMP = a.comp;
	CURRENT_PROPS = a.props;
	CURRENT_PARENT_SCOPE = a.parentScope;
	ASYNC_SCOPE = a.asyncScope;
	CURRENT_SSR_ELEMENT = a.ssrElement;
	SSR_NESTING_WARNINGS = a.nestingWarnings;
	VT_SSR_TRY_SEQ = a.vtTrySeq;
	VT_SSR_HAS_CANDIDATES = a.vtHasCandidates;
	VT_SSR_STACK.length = 0;
	for (const snapshot of a.vtStack) {
		snapshot.candidate.consumed = snapshot.consumed;
		VT_SSR_STACK.push(snapshot.candidate);
	}
	if (disposalError !== undefined) throw disposalError.value;
}

// Run ONE full canonical pass over the whole tree, synchronously within this
// tick. The emitted body/head/css/seeds always come from here (a normal full
// render), so hydration byte-format is identical whether or not discovery ran.
// A CSP nonce as an attribute fragment (` nonce="…"`) for inline `<style>`/
// `<script>` tags, or '' when no nonce is set. Empty is the common (no-CSP) case.
function nonceAttrOf(options: RenderOptions | undefined): string {
	return options?.nonce ? ' nonce="' + escapeAttr(options.nonce) + '"' : '';
}

function runFullFramedPass(
	component: ServerComponent,
	props: any,
	resolved: ResolvedMap,
	nonceAttr: string = '',
	identifierPrefix: string = '',
	markers: boolean = true,
): FullPassResult {
	const saved = saveAmbient();
	NATIVE_SERVER_PASS = NATIVE_READ_COLLECTOR?.beginPass() ?? -1;
	NATIVE_SERVER_READS = null;
	NATIVE_SERVER_FAILURES = 0;
	NATIVE_LOCAL_HOOK_DISPOSES = null;
	ACTIVE_PU_WARM_PLANS.length = 0;
	CURRENT_PU_WARM_CLAIMS = null;
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	NONCE_ATTR = nonceAttr;
	ASYNC_SCOPE = '';
	MARKERS = markers;
	PERMANENT_STATIC_HYDRATE_DEPTH = 0;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	const cssMap = (CSS = new Map<string, InjectedStyle>());
	const headBuf = (HEAD = {
		html: '',
		charset: '',
		viewport: '',
		hints: new Set(),
		sheets: null,
		hintHtml: null,
		preloadXfer: null,
		rootSuffix: markers ? headOwnershipSuffix(identifierPrefix) : '',
	} as HeadBuffer);
	FALLBACK_HOIST_DEPTH = 0;
	const suspended = (SUSPENDED = [] as SuspendedList);
	const serial = (SERIAL = [] as unknown[]);
	const deferred = (DEFERRED = [] as Job[]);
	RESOLVED = resolved;
	CURRENT_SSR_ELEMENT = null;
	SSR_NESTING_WARNINGS = resolved.nestingWarnings;
	const root = ssrScope(null);
	CURRENT_SCOPE = root;
	// A root frame so use() keys resolve; the root component is the fallback
	// discovery job for a bare use() with no enclosing sub-component boundary.
	FRAME = {
		parent: null,
		seg: 0,
		nextChild: 0,
		scopedChildren: null,
		occ: null,
		path: '',
		deferred: false,
		asyncScope: '',
	};
	CURRENT_COMP = component;
	CURRENT_PROPS = props;
	CURRENT_PARENT_SCOPE = null;
	let body = '';
	let vtCandidates = false;
	let rootSuspended = false;
	let signals: NativeSignalManifest | undefined;
	let nativePassCompleted = false;
	const nativeToken = NATIVE_READ_COLLECTOR === null ? -1 : beginActiveNativeReadScope(root);
	try {
		// Normalize the root's return the same way ssrComponent normalizes child
		// components: a compiled component returns its HTML string, but a plain
		// `.ts` root (the shape every @octanejs binding produces) returns a
		// createElement descriptor that must render through ssrChild.
		const out = invokeComponentBody(component, props, root, FRAME);
		body = typeof out === 'string' ? out : out == null ? '' : ssrChild(out, root);
		nativePassCompleted = true;
	} catch (err) {
		err = normalizeThrownServerThenable(err);
		// A suspension with no enclosing @try unwinds to here; its thenable is
		// already in `suspended`, so fall through to the await + retry. Any other
		// throw is a genuine render failure — propagate it (the finally restores).
		if (!ssrIsSuspense(err)) throw err;
		rootSuspended = true;
	} finally {
		vtCandidates = VT_SSR_HAS_CANDIDATES;
		try {
			if (nativeToken >= 0) NATIVE_READ_COLLECTOR!.endScope(nativeToken, nativePassCompleted);
			if (markers && nativePassCompleted)
				signals = NATIVE_READ_COLLECTOR?.serialize(NATIVE_SERVER_READS);
		} finally {
			restoreAmbient(saved);
		}
	}
	let css = '';
	for (const [hash, sheet] of cssMap) {
		css +=
			'<style data-octane="' +
			hash +
			'"' +
			(sheet.nonce === undefined ? nonceAttr : ' nonce="' + escapeAttr(sheet.nonce) + '"') +
			'>' +
			escapeEntireInlineStyleContent(sheet.css) +
			'</style>';
	}
	const result: FullPassResult = {
		body,
		head: headHtmlWithSheets(headBuf),
		css,
		serial,
		suspended,
		deferred,
		rootSuspended,
		vtCandidates,
		cssEntries: cssMap,
		sheets: headBuf.sheets,
	};
	if (signals !== undefined) result.signals = signals;
	return result;
}

// Re-run a set of discovery jobs (each an innermost suspending COMPONENT) in
// isolation, discarding their output — the emitted HTML always comes from a full
// pass. The point is only to reach the NEXT level's use() and populate RESOLVED,
// so a deep waterfall costs cheap subtree re-runs instead of full-tree re-renders.
// Returns the newly-surfaced suspensions + jobs. Ambient globals are saved /
// restored so concurrent renders stay isolated across the subsequent await.
function runDiscoveryRound(
	jobs: Job[],
	resolved: ResolvedMap,
	identifierPrefix: string,
): { suspended: SuspendedList; deferred: Job[] } {
	const saved = saveAmbient();
	NATIVE_SERVER_PASS = NATIVE_READ_COLLECTOR?.beginPass() ?? -1;
	NATIVE_SERVER_READS = null;
	NATIVE_SERVER_FAILURES = 0;
	NATIVE_LOCAL_HOOK_DISPOSES = null;
	ACTIVE_PU_WARM_PLANS.length = 0;
	CURRENT_PU_WARM_CLAIMS = null;
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	NONCE_ATTR = '';
	ASYNC_SCOPE = '';
	MARKERS = true;
	PERMANENT_STATIC_HYDRATE_DEPTH = 0;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	CSS = new Map();
	HEAD = {
		html: '',
		charset: '',
		viewport: '',
		hints: new Set(),
		sheets: null,
		hintHtml: null,
		preloadXfer: null,
		rootSuffix: headOwnershipSuffix(identifierPrefix),
	};
	FALLBACK_HOIST_DEPTH = 0;
	const suspended = (SUSPENDED = [] as SuspendedList);
	SERIAL = [] as unknown[];
	const deferred = (DEFERRED = [] as Job[]);
	RESOLVED = resolved;
	CURRENT_SSR_ELEMENT = null;
	SSR_NESTING_WARNINGS = null;
	FRAME = null;
	CURRENT_COMP = null;
	CURRENT_PROPS = null;
	CURRENT_PARENT_SCOPE = null;
	try {
		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];
			// A fresh frame reproducing the component's own path verbatim (same
			// parent chain + seg → framePath() yields the same string as the full
			// pass, so use() keys match RESOLVED across passes and rounds).
			const frame: Frame = {
				parent: job.frame.parent,
				seg: job.frame.seg,
				nextChild: 0,
				scopedChildren: null,
				occ: null,
				path: null,
				deferred: false,
				asyncScope: job.frame.asyncScope,
			};
			try {
				renderComponentFramed(job.comp, job.props, job.parentScope, frame);
			} catch (err) {
				// A bare (@try-less) use() in the job body rethrows SSR_SUSPENSE; the
				// thenable is already queued. A REAL error is DISCARDED here, not
				// propagated: discovery output is throwaway, and only the canonical
				// full pass renders the real tree, where the error can unwind to its
				// actual ancestor @catch (throwing from a discovery re-run would
				// reject render() even when an ancestor boundary handles it). The
				// error re-occurs deterministically on the final pass because its
				// use() inputs come from the same RESOLVED cache.
				if (!ssrIsSuspense(err)) continue;
			}
		}
	} finally {
		restoreAmbient(saved);
	}
	return { suspended, deferred };
}

// Race a settle await against the deadline (`timeoutMs`; 0 disables) so a
// thenable that never settles fails the render instead of hanging the request
// forever, and against the caller's AbortSignal so a dead request stops
// rendering.
async function raceSettleGuards(
	work: Promise<unknown>,
	timeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	const racers: Promise<unknown>[] = [work];
	let timer: ReturnType<typeof setTimeout> | undefined;
	let removeAbort: (() => void) | undefined;
	if (timeoutMs > 0) {
		racers.push(
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(formatServerError(32, timeoutMs))), timeoutMs);
				// Don't let the deadline timer hold the event loop open if the render
				// settles first (Node-only; harmless where unref is absent).
				(timer as any)?.unref?.();
			}),
		);
	}
	if (signal) {
		racers.push(
			new Promise<never>((_, reject) => {
				const onAbort = () => reject(signal.reason);
				signal.addEventListener('abort', onAbort, { once: true });
				removeAbort = () => signal.removeEventListener('abort', onAbort);
			}),
		);
	}
	try {
		await (racers.length === 1 ? work : Promise.race(racers));
	} finally {
		clearTimeout(timer);
		removeAbort?.();
	}
}

// Await everything a pass/round surfaced; cache each outcome in `resolved` by
// its key. Only render-local state is touched across the await. This is the
// BUFFERED pipeline's settle — nothing ships until everything resolves, so one
// settle-all per waterfall level is the fewest possible passes. The streaming
// pipeline uses settleFirstOfWave instead, so an early boundary isn't held
// hostage by a slow sibling.
async function settleSuspended(
	suspended: SuspendedList,
	resolved: ResolvedMap,
	timeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	const pu = (resolved as ResolvedMap).pu;
	// Snapshot the first pass, not an artificial -1: existing creation sites
	// are not evidence of new work on the first canonical retry.
	pu.recreate ??= { strikes: 0, prevCreated: pu.created.size };
	const settleAll = Promise.all(
		suspended.map(async ({ promise, key }) => {
			if (resolved.has(key)) return;
			// Batch registrations ('|pu#…' synthetic keys) resolve at their unwrap
			// sites by IDENTITY; plain use() entries stay string-key-only so their
			// occurrence-keyed semantics are untouched by the mirror.
			const isPu = key.charCodeAt(0) === 124 /* '|' */ && key.startsWith('|pu#');
			try {
				const outcome = { value: await promise, thenable: promise };
				resolved.set(key, outcome);
				if (isPu) pu.resolvedT.set(promise, outcome);
			} catch (reason) {
				const outcome = { reason, thenable: promise };
				resolved.set(key, outcome);
				if (isPu) pu.resolvedT.set(promise, outcome);
			}
		}),
	);
	await raceSettleGuards(settleAll, timeoutMs, signal);
}

// One macrotask turn. Settlements triggered by the same event-loop turn (N
// timers expiring at the same deadline, a batch of IO completions) arrive as
// SEPARATE callbacks with a full microtask drain between each, so a
// microtask-only yield after the first settle cannot see the rest of the
// burst. setImmediate (Node) runs after the whole timers/poll phase — i.e.
// after every callback of the burst — with no timer clamp; setTimeout(0) is
// the portable fallback (edge runtimes without setImmediate).
const yieldMacrotask: () => Promise<void> =
	typeof setImmediate === 'function'
		? () => new Promise((resolve) => setImmediate(resolve))
		: () => new Promise((resolve) => setTimeout(resolve, 0));

// The STREAMING settle: await only until the FIRST unresolved thenable
// settles, then coalesce — one macrotask yield plus microtask drains — so
// everything else that landed in the same event-loop wave records into
// `resolved` too. The caller re-passes once per WAVE: on a staggered schedule
// the earliest boundary flushes at its own resolve time instead of waiting for
// the slowest sibling (a settle-all here held EVERY segment until the last
// thenable landed), while simultaneous resolutions still share one re-pass
// instead of costing a pass each.
async function settleFirstOfWave(
	suspended: SuspendedList,
	resolved: ResolvedMap,
	timeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	const pu = (resolved as ResolvedMap).pu;
	pu.recreate ??= { strikes: 0, prevCreated: pu.created.size };
	const recorders: Promise<void>[] = [];
	for (const { promise, key } of suspended) {
		if (resolved.has(key)) continue;
		const isPu = key.startsWith('|pu#');
		recorders.push(
			(async () => {
				try {
					const value = await promise;
					const outcome = { value, thenable: promise };
					if (!resolved.has(key)) resolved.set(key, outcome);
					if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, outcome);
				} catch (reason) {
					const outcome = { reason, thenable: promise };
					if (!resolved.has(key)) resolved.set(key, outcome);
					if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, outcome);
				}
			})(),
		);
	}
	if (recorders.length === 0) return;
	await raceSettleGuards(Promise.race(recorders), timeoutMs, signal);
	// The winning recorder has recorded. Yield one macrotask so the rest of
	// this turn's burst fires, then drain microtasks while settlements keep
	// recording (a chained/non-native thenable needs an extra tick or two);
	// stop as soon as a drain adds nothing — stragglers get the next wave.
	await yieldMacrotask();
	let size = resolved.size;
	for (;;) {
		await Promise.resolve();
		await Promise.resolve();
		if (resolved.size === size) break;
		size = resolved.size;
	}
	// The coalesce yields sit OUTSIDE the guarded race, so an abort landing in
	// that window would otherwise hand back a normally-"settled" wave — and the
	// caller would spend a full pass (and possibly flush segments, or even
	// report allReady) on a dead request. Surface it here; the caller's catch
	// then marks pending boundaries errored exactly as a mid-race abort does.
	signal?.throwIfAborted();
}

// ---------------------------------------------------------------------------
// Uncached-creation livelock guard.
//
// Batch-registered thenables resolve by IDENTITY (resolvedT). A per-request
// promise CREATED in an ancestor's render and passed down through props is
// recreated by every full re-pass unless the compiler could cache the
// creation (puMemo) — each wave then settles instances the next pass never
// asks about, no boundary ever completes, and the render burns
// MAX_SUSPENSE_PASSES before erroring. This is the React-trained "uncached
// promise" shape (React's Fizz renders each boundary once, so there it only
// duplicates work instead of livelocking). The compiler memoizes inline
// creations at use() sites and in component-prop position, but shapes it
// cannot see (locals flowing into props, spreads, foreign-toolchain bodies)
// still reach the runtime — this guard keeps them terminating.
//
// Watched signature, once per settle→re-render cycle: no boundary completed,
// no new puMemo creation site was reached, no plain use() string key was
// recorded, and the new pass registers FRESH batch thenables (identities
// disjoint from the previous wave's). Carried-over registrations — a
// still-pending batch thenable re-registers on every pass by design — are
// normal batching at work, but they must only be EXCLUDED from the fresh set,
// never treated as a wave-wide veto: a slow stable fetch pending beside
// recreated sites would otherwise clear the evidence every pass while the
// recreated sites manufacture fast no-boundary waves straight into the
// MAX_SUSPENSE_PASSES error. One qualifying cycle can still be a legitimate
// waterfall level whose unwraps are trivial (un-memoized) references, so the
// first strike only ARMS consumption tracking: a real dependency stratum
// CONSUMES the settled wave's outcomes on the very next pass (identity hits
// in use()/puBatch), while a recreating ancestor never references the settled
// instances again. A second consecutive strike with zero consumption switches
// batching off for the rest of the request: puBatch stops
// registering/suspending, the first unresolved use() below it suspends under
// its stable frame-scoped STRING key instead, and key replay drives the
// render to completion — degraded (one newly recorded unwrap key per pass)
// but correct, matching what un-batched use() has always done for per-pass
// creations. (Still-pending stable work is unaffected by the switch: its
// use() suspends with the SAME thenable under a string key and resolves on
// settle exactly as un-batched code always has.)
function observeSuspenseWave(
	resolved: ResolvedMap,
	settled: SuspendedList,
	next: SuspendedList,
	boundaryProgress: boolean,
): boolean {
	const pu = resolved.pu;
	if (pu.batchDisabled === true) {
		pu.touched = undefined;
		return false;
	}
	let state = pu.recreate;
	if (state === undefined) state = pu.recreate = { strikes: 0, prevCreated: -1 };
	const createdGrew = pu.created.size !== state.prevCreated;
	state.prevCreated = pu.created.size;
	const touched = pu.touched;
	pu.touched = undefined;
	const reset = (): false => {
		state.strikes = 0;
		return false;
	};
	if (boundaryProgress || createdGrew) return reset();
	let prevPu: Set<PromiseLike<unknown>> | null = null;
	for (const { promise, key } of settled) {
		if (key.charCodeAt(0) === 124 /* '|' */ && key.startsWith('|pu#')) {
			(prevPu ??= new Set()).add(promise);
		} else if (resolved.has(key)) {
			// A plain use() key settled — that site advances next pass.
			return reset();
		}
	}
	if (prevPu === null) return reset();
	let sawFresh = false;
	for (const { promise, key } of next) {
		if (key.charCodeAt(0) !== 124 || !key.startsWith('|pu#')) continue;
		// Carried-over (still pending) and already-settled identities are not
		// recreation — but they are also not progress, so they merely don't
		// count as fresh (see the mixed-recreation note above).
		if (prevPu.has(promise) || pu.resolvedT.has(promise)) continue;
		sawFresh = true;
		break;
	}
	if (!sawFresh) return reset();
	if (touched !== undefined) {
		// Tracking was armed by the previous strike: any identity hit against
		// the settled wave means its outcomes were consumed — a real stratum.
		for (const promise of prevPu) {
			if (touched.has(promise)) return reset();
		}
	}
	if (++state.strikes < 2) {
		pu.touched = new Set(); // arm consumption tracking for the next pass
		return false;
	}
	pu.batchDisabled = true;
	// The immediate retry abandons this pass's registrations. puBatch usually
	// observes its own promises, but directly thrown resources and speculative
	// warm work may not have subscribers yet. Observe every outcome without
	// waiting or recording obsolete string-key results into the replay cache.
	for (const { promise } of next) Promise.resolve(promise).then(NOOP, NOOP);
	if (process.env.NODE_ENV !== 'production') {
		console.error(
			'octane SSR: use() thenables appear to be re-created on every render pass — ' +
				'promises created during an ancestor render and passed down (e.g. via props) ' +
				'get a fresh identity each pass, so their boundaries can never resolve by ' +
				'identity. Create the promise at its use() site, or hoist the creation out ' +
				'of render (the compiler caches analyzable inline creations automatically). ' +
				'Falling back to per-site replay for the rest of this render.',
		);
	}
	// The caller must recollect suspensions under the new per-site regime.
	// Waiting for the just-created batch would settle identities that this
	// canonical retry is about to replace again.
	return true;
}

// The await-everything render core. Runs full canonical passes interleaved with
// cheap discovery rounds until nothing suspends, then returns the final pass —
// so every `use(thenable)` is resolved and the @try success arms are rendered.
// Used by `prerender` (React's static API).
async function runBuffered(
	component: ServerComponent,
	props: any,
	options: RenderOptions | undefined,
	nonceAttr: string,
	resolved: ResolvedMap,
): Promise<FullPassResult> {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const identifierPrefix = options?.identifierPrefix ?? '';
	let attempt = 0;
	let lastSettled: SuspendedList | null = null;
	for (;;) {
		// Bail before doing pass work if the request already died.
		signal?.throwIfAborted();
		// A full canonical pass. If nothing suspended, this IS the answer — the
		// no-suspense fast path returns here after exactly one pass.
		let pass: FullPassResult;
		try {
			pass = withStream(null, () =>
				runFullFramedPass(component, props, resolved, nonceAttr, identifierPrefix),
			);
		} catch (err) {
			options?.onError?.(err);
			throw err;
		}
		if (pass.suspended.length === 0) return pass;
		if (lastSettled !== null && observeSuspenseWave(resolved, lastSettled, pass.suspended, false)) {
			continue;
		}
		// Between full passes, greedily discover deeper waterfall levels with cheap
		// SUBTREE re-runs (skipping the static bulk) so the NEXT full pass jumps
		// straight to canonical. A root-level boundary (job.frame.parent === null)
		// re-runs the whole tree anyway, so for those we just loop to a full pass.
		let jobs = pass.deferred;
		let pending = pass.suspended;
		for (;;) {
			// MAX bounds the TOTAL awaits (full-pass- and round-driven) so a
			// never-resolving or nondeterministic use() can't wedge the loop.
			if (++attempt > MAX_SUSPENSE_PASSES) {
				const err = new Error(formatServerError(47, MAX_SUSPENSE_PASSES));
				options?.onError?.(err);
				throw err;
			}
			await settleSuspended(pending, resolved, timeoutMs, signal);
			lastSettled = pending;
			if (jobs.length === 0 || !jobs.every((j) => j.frame.parent !== null)) break;
			const round = withStream(null, () => runDiscoveryRound(jobs, resolved, identifierPrefix));
			if (round.suspended.length === 0) break; // fully discovered → next full pass is canonical
			pending = round.suspended;
			jobs = round.deferred;
		}
		// Discovery rounds replay suspended subtrees with their CAPTURED props,
		// so their identity hits are stale-prop consumption, not canonical
		// progress — discard them so the livelock guard only credits identity
		// hits made by the next full pass.
		if (resolved.pu.touched !== undefined) resolved.pu.touched = new Set();
		// Loop → another full canonical pass with the now-populated cache. If it
		// still suspends (a nondeterministic render whose keys shift), it simply
		// makes progress via more full passes, bounded by MAX_SUSPENSE_PASSES.
	}
}

/** Turn a completed pass into the `{ html, css }` result (head folded in, seeds appended). */
function passToResult(
	pass: FullPassResult,
	nonceAttr: string,
	separateHead: boolean = false,
): RenderResult {
	let body = pass.body;
	if (pass.serial.length > 0) body += serializeSuspenseSeeds(pass.serial, nonceAttr);
	if (pass.signals !== undefined) body += serializeNativeSignalSeeds(pass.signals, nonceAttr);
	// Unclaimed view-transition arm candidates strip at emission (see vtSsrStrip).
	// Stripping the two channels separately equals stripping the folded string -
	// no match spans the join, which is what keeps `head + html` byte-identical
	// to the folded `html`.
	let result: RenderResult;
	if (separateHead) {
		result = {
			html: pass.vtCandidates ? vtSsrStrip(body) : body,
			css: pass.css,
			head: pass.vtCandidates ? vtSsrStrip(pass.head) : pass.head,
		};
	} else {
		const html = spliceHead(body, pass.head);
		result = { html: pass.vtCandidates ? vtSsrStrip(html) : html, css: pass.css };
	}
	if (pass.signals !== undefined) result.signals = pass.signals;
	return result;
}

/**
 * React `react-dom/static` `prerender` — await ALL data (Suspense boundaries
 * resolve to their success arm), then return the complete `{ html, css }`. Use
 * for SSG / any place that wants fully-resolved HTML with no client fallback.
 * This is the buffered, await-everything behaviour of the old `render()`.
 */
export async function prerender(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: RenderOptions,
): Promise<RenderResult> {
	const component = entryComponent as ServerComponent;
	const nonceAttr = nonceAttrOf(options);
	const resolved = newResolvedMap(options ?? null);
	try {
		return passToResult(
			await runBuffered(component, props, options, nonceAttr, resolved),
			nonceAttr,
			options?.headChannel === 'separate',
		);
	} finally {
		releaseServerRenderResources(resolved);
	}
}

/**
 * Stream variant of {@link prerender}, mirroring React's `prerenderToNodeStream`
 * semantics: the promise resolves only after the await-everything render fully
 * completes, and `prelude` is the transport for the COMPLETE document bytes —
 * the deduped scoped-style tags first, then the folded html (the order a
 * streamed shell serves). There is no `postponed` field: Octane has no
 * postpone/resume protocol (a documented non-goal). `node:stream` loads
 * lazily on call, so edge bundles that never invoke this pay nothing.
 * `headChannel: 'separate'` has no channel to land in here and is ignored
 * (the head folds), with a development diagnostic.
 */
export async function prerenderToNodeStream(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: RenderOptions,
): Promise<{ prelude: import('node:stream').Readable }> {
	let resolved = options;
	if (options?.headChannel === 'separate') {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				"prerenderToNodeStream() streams one document and has no separate head channel; headChannel: 'separate' was ignored. Use prerender() for a split head.",
			);
		}
		resolved = { ...options, headChannel: undefined };
	}
	const result = await prerender(entryComponent, props, resolved);
	// The server runtime must bundle for platform-neutral (edge) targets — see
	// ssr-production-bundle.test.ts — so the node-only dependency resolves at
	// RUNTIME through process.getBuiltinModule (a plain call no bundler follows,
	// evaluated only when this node-only API is actually invoked).
	const getBuiltin = (globalThis as any).process?.getBuiltinModule as
		((id: string) => any) | undefined;
	if (getBuiltin === undefined) throw new Error(formatServerError(57));
	const { Readable } = getBuiltin('node:stream');
	const chunks: Uint8Array[] = [];
	const encoder = new TextEncoder();
	if (result.css !== '') chunks.push(encoder.encode(result.css));
	chunks.push(encoder.encode(result.html));
	return { prelude: Readable.from(chunks, { objectMode: false }) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Hosted server rendering — react-hosted-octane-compat-plan.md §9.1.
//
// A React host (octane/react/server) runs one SYNCHRONOUS hosted attempt per
// Fizz task execution, inside the React component render. The session — kept
// by the host, keyed on Fizz's replay-stable task identity — persists the
// resolved/parallel-use maps across that island's Fizz retries, so a replayed
// pass reuses puMemo's original thenables and every settled outcome replays
// synchronously. An unhandled suspension is NOT awaited here: the attempt
// returns one identity-stable, status-stamped STRATUM aggregate that records
// outcomes into the session as they settle; the host delegates the wait to
// `React.use(stratum)` (Fizz's positional replay state — Phase 0 evidence).
// Do NOT call public renderToString for this: its bare-root suspension
// contract returns partial output and a fresh resolved map per call.
// ═══════════════════════════════════════════════════════════════════════════

// Read hook for FOREIGN host contexts during a hosted pass (§6.4): the server
// wrapper reads React contexts directly (React.use) — no mirror or registry.
let HOSTED_FOREIGN_CONTEXT_READER: ((context: object) => unknown) | null = null;

function readHostedForeignContext<T>(usable: unknown, api: string): T {
	if (usable !== null && typeof usable === 'object' && HOSTED_FOREIGN_CONTEXT_READER !== null) {
		return HOSTED_FOREIGN_CONTEXT_READER(usable as object) as T;
	}
	throw new Error(formatServerError(12, api));
}

/** @internal hosted-host ABI. Opaque outside octane/react/server. */
export interface HostedServerSession {
	resolved: ResolvedMap;
	/** Identity-stable settled-work aggregates, one per suspension stratum. */
	strata: (PromiseLike<void> & { status?: string })[];
}

/** @internal hosted-host ABI. */
export function createHostedServerSession(): HostedServerSession {
	return { resolved: newResolvedMap(), strata: [] };
}

export interface HostedAttemptOptions {
	identifierPrefix?: string;
	/** CSP nonce for inline seed scripts (same contract as RenderOptions.nonce). */
	nonce?: string;
	readForeignContext?: (context: object) => unknown;
}

export type HostedAttemptResult =
	| {
			status: 'complete';
			html: string;
			/** Hoisted head output — the host must translate or reject it (§9.2). */
			head: string;
			/** Per-hash scoped stylesheets for host-level dedupe (§9.2). */
			cssEntries: Map<string, InjectedStyle>;
	  }
	| { status: 'suspended'; stratum: PromiseLike<void> };

/**
 * One stratum recorder: settles every suspended job into the session maps
 * (both string-keyed and thenable-identity parallel-use outcomes), never
 * rejects, and stamps its own status in place so a Fizz replay's
 * `React.use(stratum)` unwraps settled strata synchronously.
 * @internal hosted-host ABI.
 */
function recordHostedStratum(
	suspended: SuspendedList,
	resolved: ResolvedMap,
): PromiseLike<void> & { status?: string; value?: unknown } {
	const pu = resolved.pu;
	const recorders = suspended.map(({ promise, key }) =>
		(async () => {
			const isPu = key.startsWith('|pu#');
			try {
				const value = await promise;
				const outcome = { value, thenable: promise };
				if (!resolved.has(key)) resolved.set(key, outcome);
				if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, outcome);
			} catch (reason) {
				const outcome = { reason, thenable: promise };
				if (!resolved.has(key)) resolved.set(key, outcome);
				if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, outcome);
			}
		})(),
	);
	const aggregate = Promise.all(recorders).then(() => {
		aggregate.status = 'fulfilled';
		aggregate.value = undefined;
	}) as Promise<void> & { status?: string; value?: unknown };
	aggregate.status = 'pending';
	return aggregate;
}

/**
 * Run ONE synchronous hosted pass against a persistent session. Complete
 * passes return body HTML (suspense seeds appended, view-transition residue
 * stripped) plus separated head/css channels; a suspended pass registers and
 * returns its stratum. Unhandled render ERRORS throw out of this call — the
 * host lets them escape to Fizz (§9.1).
 * @internal hosted-host ABI.
 */
export function renderHostedAttempt(
	session: HostedServerSession,
	component: ServerComponent,
	props: any,
	options?: HostedAttemptOptions,
): HostedAttemptResult {
	const nonceAttr = nonceAttrOf(options as RenderOptions | undefined);
	const previousReader = HOSTED_FOREIGN_CONTEXT_READER;
	HOSTED_FOREIGN_CONTEXT_READER = options?.readForeignContext ?? null;
	let pass: FullPassResult;
	try {
		pass = withStream(null, () =>
			runFullFramedPass(
				component,
				props,
				session.resolved,
				nonceAttr,
				options?.identifierPrefix ?? '',
			),
		);
	} finally {
		HOSTED_FOREIGN_CONTEXT_READER = previousReader;
	}
	// Delegate to the host ONLY for a bare suspension that escaped the root.
	// A suspension OWNED by a local @try ships its @pending arm in this pass's
	// HTML (the §9.1 v1 contract: hydration/client retry completes it), so the
	// island is complete from the host's perspective.
	if (pass.rootSuspended) {
		const stratum = recordHostedStratum(pass.suspended, session.resolved);
		session.strata.push(stratum);
		return { status: 'suspended', stratum };
	}
	let body = pass.body;
	if (pass.serial.length > 0) body += serializeSuspenseSeeds(pass.serial, nonceAttr);
	if (pass.signals !== undefined) body += serializeNativeSignalSeeds(pass.signals, nonceAttr);
	if (pass.vtCandidates) body = vtSsrStrip(body);
	return { status: 'complete', html: body, head: pass.head, cssEntries: pass.cssEntries };
}

/**
 * React `react-dom/server` `renderToString` — a SINGLE synchronous pass, no
 * awaiting. A Suspense boundary that suspends renders its fallback (the inline
 * `@try`/`@pending` arm); a bare `use(thenable)` with no enclosing boundary ends
 * the render early (its partial output is returned). Synchronously-resolved
 * `use()` in the shell still seeds. Use `prerender` when you need the data awaited.
 */
export function renderToString(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: RenderOptions,
): RenderResult {
	const component = entryComponent as ServerComponent;
	options?.signal?.throwIfAborted();
	const nonceAttr = nonceAttrOf(options);
	const resolved: ResolvedMap = newResolvedMap(options ?? null);
	let pass: FullPassResult;
	try {
		pass = withStream(null, () =>
			runFullFramedPass(component, props, resolved, nonceAttr, options?.identifierPrefix ?? ''),
		);
	} catch (err) {
		options?.onError?.(err);
		throw err;
	} finally {
		releaseServerRenderResources(resolved);
	}
	return passToResult(pass, nonceAttr, options?.headChannel === 'separate');
}

/**
 * React `react-dom/server` `renderToStaticMarkup` — a single synchronous pass
 * producing clean, NON-hydratable HTML: no `<!--[-->`/`<!--]-->` block markers,
 * no head-adoption markers, no suspense seed script. For static pages / email.
 */
export function renderToStaticMarkup(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: RenderOptions,
): RenderResult {
	const component = entryComponent as ServerComponent;
	options?.signal?.throwIfAborted();
	const nonceAttr = nonceAttrOf(options);
	const resolved: ResolvedMap = newResolvedMap(options ?? null);
	let pass: FullPassResult;
	try {
		pass = withStream(null, () =>
			runFullFramedPass(
				component,
				props,
				resolved,
				nonceAttr,
				options?.identifierPrefix ?? '',
				false,
			),
		);
	} catch (err) {
		options?.onError?.(err);
		throw err;
	} finally {
		releaseServerRenderResources(resolved);
	}
	// No seeds (non-hydratable). Head is folded in without adoption markers, or
	// handed over on its own under `headChannel: 'separate'`.
	if (options?.headChannel === 'separate') {
		return {
			html: pass.vtCandidates ? vtSsrStrip(pass.body) : pass.body,
			css: pass.css,
			head: pass.vtCandidates ? vtSsrStrip(pass.head) : pass.head,
		};
	}
	const html = spliceHead(pass.body, pass.head);
	return { html: pass.vtCandidates ? vtSsrStrip(html) : html, css: pass.css };
}

// ═══════════════════════════════════════════════════════════════════════════
// Streaming SSR — renderToPipeableStream / renderToReadableStream.
//
// Pass-based out-of-order streaming built on the SAME engine as `prerender`:
//
//   1. SHELL pass: one `runFullFramedPass`. A `@try` that suspends emits its
//      fallback with a leading `<template data-oct-b="opaque-id">` sentinel and
//      registers itself (keyed by frame path, so the id is stable across
//      passes). The shell flushes immediately (styles + head + body + shell
//      seeds + the inline swap runtime).
//   2. Each WAVE: await the FIRST suspended thenable to settle — coalescing
//      anything else that lands in the same event-loop turn
//      (settleFirstOfWave) — then re-run a full pass against the now-warmer
//      RESOLVED cache. `ssrTry` captures each registered boundary's
//      freshly-rendered content + its `use()` seed slice; newly-completed
//      boundaries flush as hidden parsing-safe segments followed by the swap
//      script. A nested `<template>` preserves table/select content; SVG and
//      MathML segments additionally carry their namespace container.
//      which swaps the content into the boundary's live range. Waves repeat
//      until no boundary is pending (MAX_SUSPENSE_PASSES bounds CONSECUTIVE
//      passes that complete no boundary — one pass per resolution wave is the
//      design, not a runaway, so flushing a segment resets the counter).
//
// A registered boundary ALWAYS returns its pending form (template + fallback)
// to the surrounding pass — its real content ships ONLY via its own segment, so
// a nested pending boundary inside a completed one swaps later by discovery
// order (tracked separately from its opaque id). On promise rejection the next
// pass's `use()` throws the reason, the boundary's `@catch` renders as a normal
// segment, and a typed rejection seed makes hydration take/adopt that same arm.
//
// Hydration: `$OCTRC` stashes the boundary's seed JSON on `window.$OCTS[id]`
// and leaves a `<!--oct-seed:id-->` comment where the template was; the client
// `mountTry` sees the comment, scopes that boundary's seeds, and adopts the
// swapped-in DOM byte-for-byte. A boundary still pending when the stream ends
// (abort/error) keeps its template — hydration's structural-mismatch recovery
// client-renders it (the standard degraded path).
//
// Intentional scope notes (documented divergences from React Fizz):
//   - No selective hydration (octane has no synthetic event replay system).
//   - Per-WAVE full re-passes rather than per-boundary incremental renders —
//     each resolution wave costs one full pass (reusing `prerender`'s cache +
//     discovery engine), buying per-boundary delivery: a boundary streams at
//     its own resolve time, not at the round's slowest sibling.
//   - Head ELEMENTS and hints hoisted from INSIDE a streamed boundary don't
//     ship in the stream (the shell's head already flushed); the client
//     re-creates them on hydration via headBlock / the hint emitters. Float
//     SHEET resources are the exception: each wave diffs `pass.sheets` against
//     what is already on the wire and ships new tags in a hidden carrier that
//     the inline `$OCTRH` hoists into document.head — without it, late-styled
//     content would FOUC until hydration and a no-JS consumer would never
//     receive the CSS at all.
// ═══════════════════════════════════════════════════════════════════════════

interface StreamBoundary {
	/** Per-stream opaque DOM protocol key (never reused by another render). */
	id: string;
	/** Discovery order, used as the stable tiebreaker among reachable siblings. */
	order: number;
	state: 'pending' | 'done' | 'errored';
	/** Recoverable render error retained for the public streaming onError callback. */
	error?: unknown;
	/** Whether this boundary's recoverable error has reached onError. */
	errorReported?: boolean;
	/** Whether its client-render recovery instruction was accepted by the transport. */
	errorFlushed?: boolean;
	/** The client graph is erased, so failure retains the authored server fallback. */
	serverOwnedStatic: boolean;
	/** Inner branch-range html (`<!--[-->…<!--]-->`) from the resolving pass. */
	html: string;
	/** This boundary's `use()` seed slice from the resolving pass. */
	seeds: unknown[];
	/** Ready native values captured with this exact accepted segment. */
	signals?: NativeSignalManifest;
	/** Number of boundary-local useIds consumed before the shell suspended. */
	pendingIdOffset: number;
	/** Namespace inherited by this boundary's content arm. */
	namespace: 'html' | 'svg' | 'mathml';
	/** Enclosing `ssrTry` keys, outermost first (including non-suspending tries). */
	ancestors: string[];
	/** Enclosing content/fallback owners used to prune vanished template paths. */
	owners: string[];
}

interface StreamState {
	boundaries: Map<string, StreamBoundary>;
	/** Conservative index of registered boundary owners; stale entries only cost a scan. */
	boundaryOwnerKeys: Set<string>;
	nextId: number;
	token: string;
	/** Boundary positions reached by the active full-tree pass, when tracked. */
	activePassBoundaryKeys: Set<string> | null;
	/** Content-arm nesting while the synchronous pass walks `ssrTry` calls. */
	activeTryKeys: string[];
	/** All arm owners (content/catch/fallback) while walking nested `ssrTry` calls. */
	activeOwnerKeys: string[];
	/** Undo log scoped to one synchronous full pass; null between passes. */
	replay: StreamBoundaryReplayEntry[] | null;
}

interface StreamBoundaryReplayEntry {
	key: string;
	boundary: StreamBoundary | undefined;
	value: StreamBoundary | undefined;
}

// Render-phase retries need the stream registry as it stood on entry to the
// component. Copying every boundary at EVERY component multiplies a full wave's
// work by the already-discovered boundary count. Checkpoint this pass-local log
// instead, recording only actual registry mutations. Boundary arrays are replaced,
// never mutated, so their previous references are sufficient for rollback.
function recordStreamBoundaryMutation(stream: StreamState, key: string): void {
	if (stream.replay === null) return;
	const boundary = stream.boundaries.get(key);
	stream.replay.push({
		key,
		boundary,
		value: boundary === undefined ? undefined : { ...boundary },
	});
}

function rewindStreamBoundaryReplay(stream: StreamState, checkpoint: number): void {
	const replay = stream.replay;
	if (replay === null) return;
	let restoredDeletion = false;
	while (replay.length > checkpoint) {
		const saved = replay.pop()!;
		if (saved.boundary === undefined) {
			stream.boundaries.delete(saved.key);
		} else {
			const boundary = saved.boundary;
			const value = saved.value!;
			Object.assign(boundary, value);
			// These optional fields can be introduced by the discarded pass.
			boundary.error = value.error;
			boundary.errorReported = value.errorReported;
			boundary.errorFlushed = value.errorFlushed;
			if (!stream.boundaries.has(saved.key)) restoredDeletion = true;
			stream.boundaries.set(saved.key, boundary);
		}
	}
	if (restoredDeletion) {
		// Restoring a pruned boundary appends it to Map. Re-establish discovery
		// order only on this rare path, including recoverable-error report order.
		const ordered = [...stream.boundaries].sort((a, b) => a[1].order - b[1].order);
		stream.boundaries.clear();
		for (const [key, boundary] of ordered) stream.boundaries.set(key, boundary);
	}
}

function recordStreamBoundaryOwners(stream: StreamState, owners: string[]): void {
	for (const owner of owners) stream.boundaryOwnerKeys.add(owner);
}

// Every boundary id includes a render-unique token. The counter proves
// uniqueness for every stream produced by this module instance; the realm salt
// prevents a second bundled copy/server isolate from restarting at the same
// wire id when their output is composed into one document. Initialize it on the
// first stream: Workers runtimes forbid random generation during module
// evaluation. IDs deliberately expose no structure the client relies on —
// discovery order lives separately.
let STREAM_REALM_SALT: string | null = null;

function streamRealmSalt(): string {
	if (STREAM_REALM_SALT !== null) return STREAM_REALM_SALT;
	const crypto = (globalThis as any).crypto as { randomUUID?: () => string } | undefined;
	const entropy =
		crypto?.randomUUID?.().replace(/-/g, '') ??
		Date.now().toString(36) + Math.random().toString(36).slice(2);
	return (STREAM_REALM_SALT = entropy.replace(/[^a-zA-Z0-9_-]/g, ''));
}
let NEXT_STREAM_TOKEN = 0;

function createStreamToken(): string {
	return 'os' + streamRealmSalt() + '-' + (NEXT_STREAM_TOKEN++).toString(36);
}

// Active streaming render, or null (buffered/sync renders). NOT part of the
// ambient snapshot: every pass explicitly installs its stream (or null for a
// buffered pass) through withStream, so nested render entry points restore the
// enclosing registry without registering their boundaries into it.
let STREAM: StreamState | null = null;

// Once a boundary finalizes, only descendant entries whose template sentinel is
// present in that FINAL segment remain reachable. A child registered while
// rendering a fallback, or in content later replaced by an outer catch arm,
// otherwise keeps the stream pending forever after its DOM template vanished.
// Judge direct registered ownership only; a deeper descendant belongs to its
// nearest registered owner, whose own segment performs the next pruning step.
function pruneUnrepresentedStreamDescendants(
	stream: StreamState,
	ownerKey: string,
	ownerHtml: string,
): void {
	// Independent siblings are the common case. Without this guard every
	// completed sibling scans every other registered sibling in the wave.
	if (!stream.boundaryOwnerKeys.has(ownerKey)) return;
	let removed = true;
	while (removed) {
		removed = false;
		for (const [childKey, child] of stream.boundaries) {
			if (childKey === ownerKey) continue;
			let nearestOwner: string | null = null;
			for (let i = child.owners.length - 1; i >= 0; i--) {
				const candidate = child.owners[i];
				if (candidate === ownerKey || stream.boundaries.has(candidate)) {
					nearestOwner = candidate;
					break;
				}
			}
			if (nearestOwner !== ownerKey) continue;
			if (ownerHtml.includes(STREAM_BOUNDARY_ATTR + '="' + child.id + '"')) continue;
			recordStreamBoundaryMutation(stream, childKey);
			stream.boundaries.delete(childKey);
			removed = true;
		}
	}
}

// Root suspension can abandon the entire pre-shell pass after it has already
// registered boundaries. The first complete pass defines the shell that will
// actually ship, so registrations not reached by that pass have no template
// from which a segment (or terminal recovery instruction) could be observed.
function pruneStreamBoundariesAbsentFromShell(
	stream: StreamState,
	shellBoundaryKeys: Set<string>,
): void {
	for (const key of stream.boundaries.keys()) {
		if (!shellBoundaryKeys.has(key)) stream.boundaries.delete(key);
	}
}

/**
 * Compiled `@try` / JSX `<Suspense>` boundary. `siteKey` is the compiler's
 * source-position hash; combined with the frame path + per-frame occurrence it
 * identifies THIS boundary instance stably across streaming passes. Byte-parity
 * contract with the old inline emit (hydration compatibility):
 *   success            → ssrBlock(ssrBlock(tryHtml))
 *   suspend, @pending  → ssrBlock(ssrBlock(pendingHtml))
 *   suspend, no arm    → ssrBlock('')
 *   error, @catch      → ssrBlock(ssrBlock(catchHtml))
 *   error, no @catch   → rethrow (buffered) / stream fallback for client recovery
 * In streaming mode a suspended boundary additionally carries the
 * `<template data-oct-b>` sentinel, and a REGISTERED boundary keeps returning
 * its pending form (content ships via its segment).
 */
export function ssrTry(
	scope: SSRScope,
	siteKey: string,
	tryFn: (arg: unknown, scope: SSRScope) => string,
	pendFn: ((arg: unknown, scope: SSRScope) => string) | null,
	catchFn: ((err: unknown, scope: SSRScope, reset: () => void) => string) | null,
	namespace: 'html' | 'svg' | 'mathml' = FRAME?.namespace ?? 'html',
	propagateSuspense = false,
): string {
	VT_SSR_TRY_SEQ++;
	// Consume the nearest un-consumed outer ViewTransition candidate: its
	// name/share/update propagate onto this boundary's streamed content chunk
	// so the old/new captures pair across the swap (Fizz vt-* parity).
	let vtOuter: VtSsrCandidate | null = null;
	if (VT_SSR_STACK.length > 0) {
		const top = VT_SSR_STACK[VT_SSR_STACK.length - 1];
		if (!top.consumed) {
			top.consumed = true;
			vtOuter = top;
		}
	}
	const stream = STREAM;
	// Boundary identity is needed in buffered renders too: descendants rendered
	// at the same component position in content/pending/catch are separate client
	// block scopes and must not share server use()/puMemo caches across passes.
	const frame = FRAME;
	const base = '@try:' + siteKey;
	let occurrence = 0;
	if (frame !== null) {
		occurrence = nextFrameOccurrence(frame, base);
	}
	const key = asyncFramePath(frame) + '|' + base + '#' + occurrence;
	const outerAsyncScope = ASYNC_SCOPE;
	const armScope = outerAsyncScope + '|@arm:' + siteKey + '#' + occurrence.toString(36) + ':';
	let entry: StreamBoundary | undefined;
	const serialStart = SERIAL?.length ?? 0;
	let ancestorKeys: string[] = [];
	let ownerKeys: string[] = [];
	if (stream !== null) {
		stream.activePassBoundaryKeys?.add(key);
		ancestorKeys = stream.activeTryKeys.slice();
		ownerKeys = stream.activeOwnerKeys.slice();
		entry = stream.boundaries.get(key);
		if (entry !== undefined) {
			recordStreamBoundaryMutation(stream, key);
			if (ownerKeys.length !== 0) recordStreamBoundaryOwners(stream, ownerKeys);
			entry.namespace = namespace;
		}
		if (entry !== undefined && entry.state === 'pending') {
			entry.ancestors = ancestorKeys;
			entry.owners = ownerKeys;
		}
	}
	const withArmScope = <T>(arm: 'content' | 'pending' | 'catch', fn: () => T): T => {
		const prev = ASYNC_SCOPE;
		ASYNC_SCOPE = armScope + arm;
		try {
			return fn();
		} finally {
			ASYNC_SCOPE = prev;
		}
	};
	const withContentArm = <T>(fn: () => T): T =>
		withArmScope('content', () => {
			if (stream === null) return fn();
			stream.activeTryKeys.push(key);
			stream.activeOwnerKeys.push(key);
			try {
				return fn();
			} finally {
				stream.activeOwnerKeys.pop();
				stream.activeTryKeys.pop();
			}
		});
	const withPendingArm = <T>(fn: () => T): T => {
		return withArmScope('pending', () => {
			FALLBACK_HOIST_DEPTH++;
			try {
				if (stream === null) return fn();
				stream.activeOwnerKeys.push(key);
				try {
					return fn();
				} finally {
					stream.activeOwnerKeys.pop();
				}
			} finally {
				FALLBACK_HOIST_DEPTH--;
			}
		});
	};
	const withCatchArm = <T>(fn: () => T): T =>
		withArmScope('catch', () => {
			if (stream === null) return fn();
			stream.activeTryKeys.push(key);
			stream.activeOwnerKeys.push(key);
			try {
				return fn();
			} finally {
				stream.activeOwnerKeys.pop();
				stream.activeTryKeys.pop();
			}
		});
	// A boundary that actually suspends owns a useId namespace derived from its
	// opaque stream id. That keeps sibling/content IDs independent of resolution
	// order and prevents a pending branch from shifting already-flushed shell IDs.
	// Non-suspending boundaries retain the ordinary root-local sequential format.
	const outerIdPrefix = ID_PREFIX;
	const outerIdCounter = ID_COUNTER;
	let boundaryIds = false;
	const enterBoundaryIds = (next: number): void => {
		if (entry === undefined) return;
		ID_PREFIX = outerIdPrefix + 'b' + entry.id + '-';
		ID_COUNTER = next;
		boundaryIds = true;
	};
	const restoreOuterIds = (): void => {
		ID_PREFIX = outerIdPrefix;
		ID_COUNTER = outerIdCounter;
		boundaryIds = false;
	};
	if (entry !== undefined) enterBoundaryIds(0);
	let nativeFresh = false;
	const nativeFailureStart = NATIVE_SERVER_FAILURES;
	const nativeFreshArm = (inner: string): string => {
		if (!MARKERS || !nativeFresh) return inner;
		// This body cannot be replayed from ready values alone. Remove its
		// positional seeds too; the fresh client body must not shift a sibling's
		// use() cursor. Its original useId range remains reserved by the marker.
		if (SERIAL !== null) SERIAL.length = serialStart;
		const idCount = Math.max(0, ID_COUNTER - (boundaryIds ? 0 : outerIdCounter));
		return '<!--' + NATIVE_SIGNAL_FRESH_COMMENT + idCount + '-->' + inner;
	};
	const pendingForm = (): string => {
		// A ViewTransition at the top of the FALLBACK arm exits when the boundary
		// reveals — claim its vt-exit candidate (see vtSsrClaimArm).
		const renderFallback = (): string => {
			const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
			const previousNativeReads = NATIVE_SERVER_READS;
			if (nativeCapture < 0) NATIVE_SERVER_READS = null;
			let completed = false;
			try {
				const fallback = withPendingArm(() =>
					pendFn !== null ? vtSsrClaimArm(ssrBlock(pendFn(undefined, scope)), 'exit') : '',
				);
				completed = true;
				return fallback;
			} finally {
				// A stream placeholder is always replaced or mounted fresh by the
				// client. Its reads never seed the root or the later content segment.
				finishNativeSeedCapture(
					nativeCapture,
					previousNativeReads,
					completed && entry === undefined && !nativeFresh,
				);
			}
		};
		// Once this boundary has final content, any fallback-only descendants are
		// doomed. Render the placeholder shape without registering new stream work.
		let fallback: string;
		if (entry !== undefined && entry.state === 'done') {
			// Once content completes, the fallback is permanently unobservable, but
			// its HTML still supplies the balanced placeholder shape for this pass.
			// Snapshot every pass-local output/work queue it can touch and rewind in
			// `finally`: a nested @try may catch its own suspension and return normally,
			// so cleanup cannot live only in the outer-suspension catch path.
			const suspendedStart = SUSPENDED?.length ?? 0;
			const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
			const previousNativeReads = NATIVE_SERVER_READS;
			if (nativeCapture < 0) NATIVE_SERVER_READS = null;
			const deferredStart = DEFERRED?.length ?? 0;
			const serialStart = SERIAL?.length ?? 0;
			const css = CSS;
			const cssSnapshot = css === null ? null : new Map(css);
			const head = HEAD;
			const headHtml = head?.html;
			const headCharset = head?.charset;
			const headViewport = head?.viewport;
			const headHints = head === null ? null : new Set(head.hints);
			const headSheets = head === null || head.sheets === null ? null : new Map(head.sheets);
			const headHintHtml = head === null || head.hintHtml === null ? null : new Map(head.hintHtml);
			const headXfer =
				head === null || head.preloadXfer === null ? null : new Map(head.preloadXfer);
			const vtTrySeq = VT_SSR_TRY_SEQ;
			const vtHasCandidates = VT_SSR_HAS_CANDIDATES;
			const vtStack = VT_SSR_STACK.map((candidate) => ({
				candidate,
				consumed: candidate.consumed,
			}));
			try {
				fallback = withStream(null, renderFallback);
			} catch (error) {
				// A direct suspension has no nested pending arm whose HTML can be kept.
				// The outer template remains balanced with an empty fallback range.
				// Inline resource reads can throw before a component normalizes them;
				// the finally below discards their registration along with use() work.
				error = normalizeThrownServerThenable(error);
				if (!ssrIsSuspense(error)) throw error;
				fallback = '';
			} finally {
				finishNativeSeedCapture(nativeCapture, previousNativeReads, false);
				if (SUSPENDED !== null) SUSPENDED.length = suspendedStart;
				if (DEFERRED !== null) DEFERRED.length = deferredStart;
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (css !== null && cssSnapshot !== null) {
					css.clear();
					for (const [hash, sheet] of cssSnapshot) css.set(hash, sheet);
				}
				if (head !== null && headHints !== null) {
					head.html = headHtml!;
					head.charset = headCharset!;
					head.viewport = headViewport!;
					head.hints.clear();
					for (const hint of headHints) head.hints.add(hint);
					if (headSheets === null) head.sheets = null;
					else {
						const sheets = (head.sheets ??= new Map());
						sheets.clear();
						for (const [href, entry] of headSheets) sheets.set(href, entry);
					}
					if (headHintHtml === null) head.hintHtml = null;
					else {
						const hintHtml = (head.hintHtml ??= new Map());
						hintHtml.clear();
						for (const [k, v] of headHintHtml) hintHtml.set(k, v);
					}
					if (headXfer === null) head.preloadXfer = null;
					else {
						const xfer = (head.preloadXfer ??= new Map());
						xfer.clear();
						for (const [k, v] of headXfer) xfer.set(k, v);
					}
				}
				VT_SSR_TRY_SEQ = vtTrySeq;
				VT_SSR_HAS_CANDIDATES = vtHasCandidates;
				VT_SSR_STACK.length = 0;
				for (const snapshot of vtStack) {
					snapshot.candidate.consumed = snapshot.consumed;
					VT_SSR_STACK.push(snapshot.candidate);
				}
			}
		} else {
			fallback = renderFallback();
		}
		if (entry !== undefined) {
			return ssrBlock(
				'<template ' + STREAM_BOUNDARY_ATTR + '="' + entry.id + '"></template>' + fallback,
			);
		}
		return ssrBlock(nativeFreshArm(pendFn !== null ? fallback : ''));
	};
	try {
		try {
			// A ViewTransition at the top of the CONTENT arm enters when the content
			// streams in — claim its vt-enter candidate.
			const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
			const previousNativeReads = NATIVE_SERVER_READS;
			if (nativeCapture < 0) NATIVE_SERVER_READS = null;
			let nativeReads: NativeSeedReads | null = null;
			let inner: string;
			try {
				inner = vtSsrClaimArm(ssrBlock(withContentArm(() => tryFn(undefined, scope))), 'enter');
			} finally {
				nativeReads = finishNativeSeedCapture(nativeCapture, previousNativeReads, false);
			}
			if (entry !== undefined) {
				// Registered (was pending in an earlier pass): capture the content +
				// this boundary's seed slice for its segment; the surrounding pass
				// keeps seeing the pending form so the shell shape stays stable.
				if (entry.state === 'pending') {
					if (!entry.serverOwnedStatic)
						entry.signals = NATIVE_READ_COLLECTOR?.serialize(nativeReads);
					entry.state = 'done';
					entry.html =
						vtOuter !== null
							? vtSsrAnnotate(inner, [
									['vt-name', vtOuter.name],
									['vt-update', vtOuter.update],
									['vt-share', vtOuter.share],
								])
							: inner;
					if (SERIAL !== null) {
						if (!entry.serverOwnedStatic) entry.seeds = SERIAL.slice(serialStart);
						SERIAL.length = serialStart;
					}
					pruneUnrepresentedStreamDescendants(stream!, key, entry.html);
				} else if (SERIAL !== null) {
					// Later passes re-render from cache — drop the duplicate seeds.
					SERIAL.length = serialStart;
				}
				ID_COUNTER = entry.pendingIdOffset;
				return pendingForm();
			}
			appendNativeSeedReads(nativeReads);
			return ssrBlock(inner);
		} catch (e) {
			nativeFresh = NATIVE_SERVER_FAILURES !== nativeFailureStart;
			e = normalizeThrownServerThenable(e);
			if (ssrIsSuspense(e)) {
				if (propagateSuspense) throw e;
				if (stream !== null) {
					// Drop seeds pushed by the partially-rendered body — they belong to
					// the boundary's own slice once it completes.
					if (SERIAL !== null) SERIAL.length = serialStart;
					if (entry === undefined) {
						const pendingIdOffset = Math.max(0, ID_COUNTER - outerIdCounter);
						restoreOuterIds();
						const order = stream.nextId++;
						entry = {
							id: stream.token + '-' + order.toString(36),
							order,
							state: 'pending',
							serverOwnedStatic: PERMANENT_STATIC_HYDRATE_DEPTH !== 0,
							html: '',
							seeds: [],
							pendingIdOffset,
							namespace,
							ancestors: ancestorKeys,
							owners: ownerKeys,
						};
						recordStreamBoundaryMutation(stream, key);
						stream.boundaries.set(key, entry);
						if (ownerKeys.length !== 0) recordStreamBoundaryOwners(stream, ownerKeys);
						enterBoundaryIds(pendingIdOffset);
					} else {
						ID_COUNTER = entry.pendingIdOffset;
					}
				}
				return pendingForm();
			}
			if (catchFn !== null) {
				// Preserve values consumed before the rejection plus its typed rejection
				// record. The client replays that exact seed order, throws at the same
				// use(), then hydrates the already-streamed catch arm (whose own use() calls
				// consume any seeds appended while rendering it below).
				const caughtSeeds =
					entry !== undefined && !entry.serverOwnedStatic && SERIAL !== null
						? SERIAL.slice(serialStart)
						: [];
				if (entry !== undefined && SERIAL !== null) SERIAL.length = serialStart;
				const nativeCapture = NATIVE_READ_COLLECTOR?.beginCapture() ?? -1;
				const previousNativeReads = NATIVE_SERVER_READS;
				if (nativeCapture < 0) NATIVE_SERVER_READS = null;
				let catchReads: NativeSeedReads | null = null;
				let inner: string;
				try {
					inner = ssrBlock(withCatchArm(() => catchFn(e, scope, NOOP)));
				} finally {
					catchReads = finishNativeSeedCapture(nativeCapture, previousNativeReads, false);
				}
				inner = nativeFreshArm(inner);
				if (entry !== undefined) {
					if (entry.state !== 'done') {
						if (!entry.serverOwnedStatic && !nativeFresh)
							entry.signals = NATIVE_READ_COLLECTOR?.serialize(catchReads);
						if (SERIAL !== null) {
							if (!entry.serverOwnedStatic) {
								caughtSeeds.push(...SERIAL.slice(serialStart));
							}
							SERIAL.length = serialStart;
						}
						entry.state = 'done';
						entry.html = inner;
						entry.seeds = nativeFresh ? [] : caughtSeeds;
						pruneUnrepresentedStreamDescendants(stream!, key, entry.html);
					} else if (SERIAL !== null) {
						SERIAL.length = serialStart;
					}
					ID_COUNTER = entry.pendingIdOffset;
					return pendingForm();
				}
				if (!nativeFresh) appendNativeSeedReads(catchReads);
				return ssrBlock(inner);
			}
			if (stream !== null) {
				// Fizz keeps a Suspense shell valid when its primary content throws:
				// publish the fallback, report the error, and mark this boundary for a
				// client render. Buffered renderers still rethrow below because they have
				// no progressive recovery channel.
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (entry === undefined && PERMANENT_STATIC_HYDRATE_DEPTH !== 0) throw e;
				if (entry === undefined) {
					const pendingIdOffset = Math.max(0, ID_COUNTER - outerIdCounter);
					restoreOuterIds();
					const order = stream.nextId++;
					entry = {
						id: stream.token + '-' + order.toString(36),
						order,
						state: 'errored',
						serverOwnedStatic: false,
						error: e,
						html: '',
						seeds: [],
						pendingIdOffset,
						namespace,
						ancestors: ancestorKeys,
						owners: ownerKeys,
					};
					recordStreamBoundaryMutation(stream, key);
					stream.boundaries.set(key, entry);
					if (ownerKeys.length !== 0) recordStreamBoundaryOwners(stream, ownerKeys);
					enterBoundaryIds(pendingIdOffset);
				} else if (entry.state === 'pending') {
					entry.state = 'errored';
					entry.error = e;
					ID_COUNTER = entry.pendingIdOffset;
				} else if (entry.state === 'errored') {
					ID_COUNTER = entry.pendingIdOffset;
				} else {
					throw e;
				}
				const fallback = pendingForm();
				pruneUnrepresentedStreamDescendants(stream, key, fallback);
				return fallback;
			}
			throw e;
		}
	} finally {
		ASYNC_SCOPE = outerAsyncScope;
		if (boundaryIds) restoreOuterIds();
	}
}

// The inline client swap runtime, emitted ONCE (before the first segment).
// $OCTRC(id, namespaceCarrier): stash the segment's seed JSON on window.$OCTS, remove the
// fallback (template's siblings up to the balanced block close), move the
// segment's children into place, and replace the template with the
// `<!--oct-seed:id-->` scoping comment. `id` is the full render-scoped opaque
// key, so both document queries and the seed stash remain disjoint when output
// from multiple streams is composed into one page. $OCTRX(id) marks the
// boundary errored (hydration client-renders it via mismatch recovery). A
// truthy second argument removes only a server-owned permanent-static sentinel,
// retaining its already-flushed fallback because no client graph can recover it.
let STREAM_RUNTIME_JS: string | undefined;
function streamRuntimeJs(): string {
	return (STREAM_RUNTIME_JS ??=
		'(function(){var d=document;var S=window.$OCTS=window.$OCTS||{};' +
		// Legacy `[` / `]` means one physical range; `[N` / `]N` is canonical only
		// for safe integer N >= 2. Keep this in sync with hydrationMarkerMultiplicity.
		'var M=function(v,c){if(v===c)return 1;if(!v||v.charAt(0)!==c)return 0;' +
		'var s=v.slice(1),n=+s;return n>=2&&Number.isSafeInteger(n)&&String(n)===s;};' +
		'window.$OCTRC=function(id,nc){' +
		"var t=d.querySelector('template[" +
		STREAM_BOUNDARY_ATTR +
		"=\"'+id+'\"]');" +
		"var s=d.querySelector('[" +
		STREAM_SEGMENT_ATTR +
		"=\"'+id+'\"]');" +
		'if(!s)return;if(!t){s.remove();return;}' +
		'var q=s.firstElementChild,z=d.createElement("template"),c=s;' +
		'if(q&&q.localName==="script"){try{z.innerHTML=JSON.parse(q.textContent);c=z.content;}catch(e){return;}}' +
		'var sd=c.querySelector("script[' +
		STREAM_SEED_ATTR +
		']");' +
		'if(sd){S[id]=sd.textContent;sd.parentNode.removeChild(sd);}' +
		'var ns=c.firstElementChild;while(ns&&!(ns.localName==="script"&&ns.hasAttribute("' +
		NATIVE_SIGNAL_SEED_ATTR +
		'")))ns=ns.nextElementSibling;' +
		'if(ns){S[id+"$signals"]=ns.textContent;ns.parentNode.removeChild(ns);}' +
		'if(nc)c=c.firstElementChild;' +
		'var n=t.nextSibling,depth=1;' +
		'while(n){var x=n.nextSibling,v=n.nodeType===8?n.data:null;' +
		'if(M(v,"["))depth++;else if(M(v,"]")){depth--;if(depth===0)break;}' +
		'n.parentNode.removeChild(n);n=x;}' +
		'var p=t.parentNode;' +
		'while(c.firstChild)p.insertBefore(c.firstChild,n);' +
		'p.replaceChild(d.createComment("' +
		STREAM_SEED_COMMENT +
		'"+id),t);' +
		's.parentNode.removeChild(s);};' +
		'window.$OCTRX=function(id,so){' +
		"var t=d.querySelector('template[" +
		STREAM_BOUNDARY_ATTR +
		"=\"'+id+'\"]');" +
		'if(t){if(so)t.remove();else t.setAttribute("data-oct-err","");}};' +
		// $OCTRH(id): hoist a wave carrier's Float sheet tags into document.head.
		// With a live client runtime (window.$OCTFR, installed once client Float
		// resource state exists) each tag is handed over so ONE authority keeps
		// deduping and ordering; otherwise insert directly under the client's
		// precedence policy — append to the tag's group, open a new group after
		// the last existing one, else append to head.
		'window.$OCTRH=function(id){' +
		"var c=d.querySelector('[" +
		STREAM_RESOURCE_ATTR +
		"=\"'+id+'\"]');" +
		'if(!c)return;var n;' +
		'while((n=c.firstElementChild)){c.removeChild(n);' +
		'if(window.$OCTFR){window.$OCTFR(n);continue;}' +
		'var p=n.getAttribute("data-precedence"),' +
		'g=d.head.querySelectorAll("link[data-precedence],style[data-precedence]"),' +
		't=g.length?g[g.length-1]:null,x=null;' +
		'for(var i=0;i<g.length;i++)if(g[i].getAttribute("data-precedence")===p)x=g[i];' +
		'if(x)x.after(n);else if(t)t.after(n);else d.head.appendChild(n);}' +
		'c.remove();};' +
		'})();');
}

interface StreamSink {
	/**
	 * Returns a promise only when the transport applies pressure. `terminal`
	 * permits the final degraded-boundary markers after an external abort; a
	 * disconnected/cancelled consumer still rejects it.
	 */
	write(chunk: string, terminal?: boolean): void | Promise<void>;
	shellReady(): void;
	shellError(err: unknown): void;
	allReady(): void;
	fatal(err: unknown): void;
}

/**
 * A live source of externally-produced HTML (typically framework data
 * `<script>` tags materializing as loaders settle) merged natively into a
 * streamed render. Octane emits injected HTML verbatim, in push order, each
 * drain as its own transport chunk strictly BETWEEN renderer chunks — never
 * before the shell, and (for document renders) before the held
 * `</body></html>` tail. The stream stays open until `done` settles.
 *
 * This is an Octane extension (React's Fizz owns its data injection
 * internally); it exists so frameworks like TanStack Start can merge their
 * data stream without re-parsing the HTML byte stream for safe insertion
 * points — every boundary between renderer chunks is tag-complete by
 * construction.
 */
export interface StreamInjectionSource {
	/**
	 * Pull all queued HTML (concatenated, verbatim). Called at emission
	 * boundaries and after `subscribe` notifications; return '' when empty.
	 */
	take(): string;
	/**
	 * The source notifies when new HTML is queued; the renderer then drains
	 * promptly — even while the render itself is idle awaiting `done`.
	 * Returns an unsubscribe function; the renderer unsubscribes on
	 * completion, abort, and failure.
	 */
	subscribe(notify: () => void): () => void;
	/**
	 * The renderer holds the document tail and the stream close until this
	 * settles. A rejection fails the stream through the fatal path (after the
	 * shell, mirroring abort: degraded terminal completion).
	 */
	done: Promise<void>;
	/**
	 * Called exactly once when the renderer has finished producing markup —
	 * after the last boundary segment on success, or on the abort/error path
	 * before degraded terminal output. Sources that finalize asynchronously
	 * (e.g. a serialization stream that must flush its remainder) key that
	 * work here and settle `done` when it completes.
	 */
	renderComplete?(): void;
}

export interface StreamOptions extends RenderOptions {
	onShellReady?: () => void;
	onShellError?: (err: unknown) => void;
	onAllReady?: () => void;
	/**
	 * Receives the shell's hoisted `<title>`/`<meta>`/`<link>` under
	 * `headChannel: 'separate'`, called once BEFORE the shell is written and
	 * therefore before `onShellReady` and before `renderToReadableStream`'s
	 * promise resolves, so a host still has time to place the metadata in the
	 * template prefix it writes ahead of the render stream. Never called under
	 * the default `'fold'`, where the metadata rides the shell.
	 *
	 * Only the shell's metadata: head elements hoisted from inside a Suspense
	 * boundary that streams later are re-created client-side on hydration,
	 * while late-discovered Float sheet resources ride the stream itself (see
	 * docs/ssr.md).
	 */
	onHeadReady?: (head: string) => void;
	/** Merge externally-produced HTML into the stream (see StreamInjectionSource). */
	injection?: StreamInjectionSource;
}

function withStream<T>(stream: StreamState | null, fn: () => T): T {
	const prev = STREAM;
	STREAM = stream;
	try {
		return fn();
	} finally {
		STREAM = prev;
	}
}

// For document renders under external injection, the closing `</body></html>`
// is split out of the shell and held until both the render and the injection
// source finish. De-opt block markers interleave with the closing tags
// (`</body><!--]--></html><!--]-->`), so a true document suffix is `</body>`
// followed by nothing but comments/whitespace and one `</html>`.
const DOCUMENT_TAIL_RE = /^<\/body>(?:\s|<!--[^]*?-->)*<\/html>(?:\s|<!--[^]*?-->)*$/;
function documentTailStart(body: string): number {
	const index = body.lastIndexOf('</body>');
	if (index === -1) return -1;
	return DOCUMENT_TAIL_RE.test(body.slice(index)) ? index : -1;
}

// A document render's markup is the root `<html>` element wrapped only by
// hydration block markers — a prefix scan bounded by wrapper depth, so the
// common fragment path pays a few byte compares, not a body scan. Streaming
// renders of a document lead with `<!DOCTYPE html>` (React parity: Fizz emits
// the doctype whenever the root renders `<html>`, and its test harness treats
// a doctype-less `<html>` as "almost certainly a bug in React" — per
// ReactDOMFizzServer-test.js:237, React canary b740af2). Buffered
// renderToString/renderToStaticMarkup stay doctype-free, also per React.
function isDocumentRoot(body: string): boolean {
	let i = 0;
	while (body.startsWith('<!--[-->', i)) i += 8;
	if (!body.startsWith('<html', i)) return false;
	const next = body.charCodeAt(i + 5);
	return next === 62 /* > */ || next === 32 || next === 9 || next === 10 || next === 13;
}

// Locate the insertion point just inside a document's opening <head> tag —
// where renderer-owned leading styles and hoisted head elements belong in
// document mode. Quote-aware so an attribute value containing '>' cannot
// truncate the tag.
function documentHeadInsertionPoint(body: string): number {
	let searchFrom = 0;
	for (;;) {
		const start = body.indexOf('<head', searchFrom);
		if (start === -1) return -1;
		const next = body.charCodeAt(start + 5);
		if (next === 62 /* > */) return start + 6;
		if (next === 32 || next === 9 || next === 10 || next === 13) {
			let quote = 0;
			for (let i = start + 6; i < body.length; i++) {
				const code = body.charCodeAt(i);
				if (quote !== 0) {
					if (code === quote) quote = 0;
				} else if (code === 34 /* " */ || code === 39 /* ' */) quote = code;
				else if (code === 62 /* > */) return i + 1;
			}
			return -1;
		}
		searchFrom = start + 5;
	}
}

function segmentChunk(b: StreamBoundary, nonceAttr: string): string {
	let seedScript = '';
	if (b.seeds.length > 0) {
		const json = serializeSuspenseSeedJson(b.seeds);
		if (json !== '[]') {
			seedScript =
				'<script type="application/json" ' +
				STREAM_SEED_ATTR +
				nonceAttr +
				'>' +
				json +
				'</script>';
		}
	}
	if (b.signals !== undefined) seedScript += serializeNativeSignalSeeds(b.signals, nonceAttr);
	// ViewTransition arm candidates are renderer-only staging attributes. Strip
	// them while this is still markup: once the parsing-safe carrier below turns
	// the segment into a JSON string, vtSsrStrip can no longer recognize quoted
	// HTML attributes inside it.
	const html = vtSsrStrip(b.html);
	const content =
		b.namespace === 'svg'
			? seedScript + '<svg>' + html + '</svg>'
			: b.namespace === 'mathml'
				? seedScript + '<math>' + html + '</math>'
				: seedScript + html;
	const hasNamespaceCarrier = b.namespace === 'html' ? '' : ',1';
	// The resolved arm may contain trusted raw HTML with a literal `</template>`.
	// Putting it directly inside the protocol carrier would let the HTML parser
	// terminate that carrier early and strand nodes outside the revealed content.
	// Store the complete markup as script-safe JSON and parse it into a detached
	// template in $OCTRC instead. Escape both script-token directions: a closing
	// token could terminate the carrier, while `<!--<script` could otherwise enter
	// the HTML tokenizer's double-escaped state and swallow its real closing tag.
	// Ordinary markup and hydration comments need no expansion.
	const payload = JSON.stringify(content).replace(/<(?=\/?script)/gi, '\\u003c');
	return (
		'<div hidden ' +
		STREAM_SEGMENT_ATTR +
		'="' +
		escapeAttr(b.id) +
		'"><script type="application/json" ' +
		STREAM_SCRIPT_ATTR +
		nonceAttr +
		'>' +
		payload +
		'</script></div><script ' +
		STREAM_SCRIPT_ATTR +
		nonceAttr +
		'>$OCTRC(' +
		JSON.stringify(b.id).replace(/</g, '\\u003c') +
		hasNamespaceCarrier +
		')</script>'
	);
}

/**
 * Float sheet resources discovered after the shell flushed: the REAL tags ride
 * the wave inside a hidden carrier — a consumer without JS still gets working
 * CSS, since stylesheet links and style tags apply from body — and the inline
 * `$OCTRH` call hoists them into document.head with the client's precedence
 * grouping, ahead of the wave's segment reveals so revealed content is styled.
 */
function floatResourceChunk(tags: string, carrierId: string, nonceAttr: string): string {
	return (
		'<div hidden ' +
		STREAM_RESOURCE_ATTR +
		'="' +
		escapeAttr(carrierId) +
		'">' +
		tags +
		'</div><script ' +
		STREAM_SCRIPT_ATTR +
		nonceAttr +
		'>$OCTRH(' +
		JSON.stringify(carrierId).replace(/</g, '\\u003c') +
		')</script>'
	);
}

function boundaryErrorChunk(b: StreamBoundary, nonceAttr: string): string {
	const serverOwnedStatic = b.serverOwnedStatic ? ',1' : '';
	return (
		'<script ' +
		STREAM_SCRIPT_ATTR +
		nonceAttr +
		'>$OCTRX(' +
		JSON.stringify(b.id).replace(/</g, '\\u003c') +
		serverOwnedStatic +
		')</script>'
	);
}

/** The shared streaming engine both public APIs drive. */
async function runStream(
	component: ServerComponent,
	props: any,
	options: StreamOptions | undefined,
	sink: StreamSink,
	resolved: ResolvedMap,
): Promise<void> {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const nonceAttr = nonceAttrOf(options);
	const identifierPrefix = options?.identifierPrefix ?? '';
	const stream: StreamState = {
		boundaries: new Map(),
		boundaryOwnerKeys: new Set(),
		nextId: 0,
		token: createStreamToken(),
		activePassBoundaryKeys: null,
		activeTryKeys: [],
		activeOwnerKeys: [],
		replay: null,
	};
	const renderFullPass = (): {
		pass: FullPassResult;
		boundaryKeys: Set<string>;
	} => {
		const boundaryKeys = new Set<string>();
		const previousBoundaryKeys = stream.activePassBoundaryKeys;
		const previousReplay = stream.replay;
		stream.activePassBoundaryKeys = boundaryKeys;
		stream.replay = [];
		try {
			return {
				pass: withStream(stream, () =>
					runFullFramedPass(component, props, resolved, nonceAttr, identifierPrefix),
				),
				boundaryKeys,
			};
		} finally {
			stream.activePassBoundaryKeys = previousBoundaryKeys;
			stream.replay = previousReplay;
		}
	};
	// ── External injection (cold path: every hook below no-ops when absent) ──
	const injection = options?.injection;
	// Early fatal paths can return before `done` is awaited; observe it up
	// front so a later rejection never surfaces as an unhandled rejection.
	if (injection !== undefined) injection.done.then(NOOP, NOOP);
	let injectionUnsubscribe: (() => void) | undefined;
	let injectionFailure: unknown;
	let injectionFailed = false;
	let signalInjectionFailure: (() => void) | undefined;
	const failInjection = (err: unknown): void => {
		if (injectionFailed) return;
		injectionFailed = true;
		injectionFailure = err;
		signalInjectionFailure?.();
	};
	// Injection drains interleave with render writes from OUTSIDE the wave
	// loop (subscribe notifications can fire while the loop awaits a wave or
	// the done promise). A single promise chain gives all writes a total
	// order while each write still surfaces its own backpressure/failure to
	// its caller. Without injection, writes go to the sink directly — the
	// established path, no chain, no extra microtasks.
	let writeChain: Promise<void> | null = injection === undefined ? null : Promise.resolve();
	const write: (chunk: string, terminal?: boolean) => void | Promise<void> =
		injection === undefined
			? (chunk, terminal) => sink.write(chunk, terminal)
			: (chunk, terminal) => {
					const operation = writeChain!.then(() => sink.write(chunk, terminal));
					writeChain = operation.then(NOOP, NOOP);
					return operation;
				};
	const drainInjection = (): void | Promise<void> => {
		if (injection === undefined || injectionFailed) return;
		let html: string;
		try {
			html = injection.take();
		} catch (err) {
			failInjection(err);
			return;
		}
		if (!html) return;
		return write(html);
	};
	const notifyInjection = (): void => {
		const drained = drainInjection();
		// A transport failure here is re-observed by the next awaited render
		// write (or the completion wait); the notify path only must not
		// produce an unhandled rejection.
		if (drained !== undefined) drained.catch(NOOP);
	};
	/** Resolves when `done` settles; rejects on abort, take() failure, or done rejection. */
	const waitForInjectionDone = (): Promise<void> =>
		new Promise<void>((resolve, reject) => {
			let settled = false;
			const finish = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener('abort', onAbort);
				signalInjectionFailure = undefined;
				fn();
			};
			const onAbort = (): void => finish(() => reject(signal!.reason));
			signalInjectionFailure = () => finish(() => reject(injectionFailure));
			if (injectionFailed) return finish(() => reject(injectionFailure));
			if (signal?.aborted) return onAbort();
			signal?.addEventListener('abort', onAbort, { once: true });
			injection!.done.then(
				() => finish(resolve),
				(err) => finish(() => reject(err)),
			);
		});

	const emittedCss = new Set<string>();
	/** Float sheet hrefs already on the wire (shell head fold or a wave carrier). */
	const flushedSheets = new Set<string>();
	let resourceChunkSeq = 0;
	const flushedSegments = new Set<string>();
	const observedDone = new Set<string>();
	const reachableDoneSegments = (): StreamBoundary[] => {
		const done: StreamBoundary[] = [];
		const reachable = new Set(flushedSegments);
		for (;;) {
			const next = [...stream.boundaries.values()]
				.filter((boundary) => {
					if (boundary.state !== 'done' || reachable.has(boundary.id)) return false;
					for (let i = boundary.ancestors.length - 1; i >= 0; i--) {
						const ancestor = stream.boundaries.get(boundary.ancestors[i]);
						if (ancestor !== undefined) return reachable.has(ancestor.id);
					}
					return true;
				})
				.sort((a, b) => a.order - b.order);
			if (next.length === 0) return done;
			for (const boundary of next) {
				done.push(boundary);
				reachable.add(boundary.id);
			}
		}
	};
	const reportRecoverableBoundaryErrors = (): void => {
		for (const boundary of stream.boundaries.values()) {
			if (boundary.state !== 'errored' || boundary.errorReported) continue;
			boundary.errorReported = true;
			options?.onError?.(boundary.error);
		}
	};
	const reachableErroredBoundaries = (): StreamBoundary[] =>
		[...stream.boundaries.values()]
			.filter((boundary) => {
				if (boundary.state !== 'errored' || boundary.errorFlushed) return false;
				for (let i = boundary.ancestors.length - 1; i >= 0; i--) {
					const ancestor = stream.boundaries.get(boundary.ancestors[i]);
					if (ancestor !== undefined) return flushedSegments.has(ancestor.id);
				}
				return true;
			})
			.sort((a, b) => a.order - b.order);
	const flushRecoverableBoundaryErrors = (): void | Promise<void> => {
		const errors = reachableErroredBoundaries();
		if (errors.length === 0) return;
		let chunk = '';
		for (const boundary of errors) chunk += boundaryErrorChunk(boundary, nonceAttr);
		const errorWrite = write(chunk);
		const markFlushed = (): void => {
			for (const boundary of errors) boundary.errorFlushed = true;
		};
		if (errorWrite === undefined) {
			markFlushed();
			return;
		}
		return errorWrite.then(markFlushed);
	};

	let pass: FullPassResult;
	let shellBoundaryKeys: Set<string>;
	let preShellSuspended: SuspendedList = [];
	// One-shot retry when batching is disabled. Keep it across shell publication
	// so the final root retry cannot strand the same obsolete batch in the
	// boundary loop. Both loops retain their abort checks and attempt bounds.
	let retryWithoutSettling = false;
	try {
		signal?.throwIfAborted();
		({ pass, boundaryKeys: shellBoundaryKeys } = renderFullPass());
		preShellSuspended = pass.suspended;
		// An AbortSignal can fire from user code during the shell pass. It is still
		// a pre-shell abort: do not publish the fallback produced later in that pass.
		signal?.throwIfAborted();
		// A bare Usable outside @try/Suspense blocks the shell. Fizz waits for it
		// and retries the root; emitting this pass would otherwise complete with an
		// empty response even though resumable work was recorded. Bound the retry
		// chain independently from later per-boundary streaming waves.
		let rootAttempts = 0;
		while (pass.rootSuspended) {
			if (pass.suspended.length === 0) {
				throw new Error(formatServerError(34));
			}
			if (++rootAttempts > MAX_SUSPENSE_PASSES) {
				throw new Error(formatServerError(35, MAX_SUSPENSE_PASSES));
			}
			const settledWave = pass.suspended;
			if (!retryWithoutSettling) {
				await settleFirstOfWave(settledWave, resolved, timeoutMs, signal);
			}
			({ pass, boundaryKeys: shellBoundaryKeys } = renderFullPass());
			preShellSuspended = pass.suspended;
			retryWithoutSettling = observeSuspenseWave(resolved, settledWave, pass.suspended, false);
			signal?.throwIfAborted();
		}
		pruneStreamBoundariesAbsentFromShell(stream, shellBoundaryKeys);
	} catch (err) {
		const reports = signal?.aborted ? Math.max(1, preShellSuspended.length) : 1;
		for (let i = 0; i < reports; i++) options?.onError?.(err);
		sink.shellError(err);
		return;
	}
	reportRecoverableBoundaryErrors();
	// SHELL: styles first (so painted fallbacks are styled), hoisted head, body,
	// the shell-scope seed script, then the swap runtime iff anything is pending.
	// Every Float sheet the shell pass collected rides the shell head fold
	// (or onHeadReady under the separate head channel) — record it so wave
	// diffs never re-ship one.
	if (pass.sheets !== null) for (const key of pass.sheets.keys()) flushedSheets.add(key);
	let leadingStyles = '';
	for (const [hash, sheet] of pass.cssEntries) {
		emittedCss.add(hash);
		leadingStyles +=
			'<style data-octane="' +
			hash +
			'"' +
			(sheet.nonce === undefined ? nonceAttr : ' nonce="' + escapeAttr(sheet.nonce) + '"') +
			'>' +
			escapeEntireInlineStyleContent(sheet.css) +
			'</style>';
	}
	// Streaming DOCUMENT renders always lead with `<!DOCTYPE html>` — React
	// Fizz parity, injection or not (buffered renderers stay doctype-free,
	// also per React; see isDocumentRoot).
	//
	// DOCUMENT MODE (external injection + the shell renders a document)
	// additionally restructures the shell: the closing tail is split out and
	// written LAST — injected chunks and streamed segments then land inside
	// <body> before it (streamed segments otherwise trail `</html>`, which
	// browsers reparent but external merge layers must not re-parse around) —
	// and renderer-owned leading styles + hoisted head elements move inside
	// the authored <head> instead of preceding `<html>`. The tail carries only
	// closing tags + block markers, so it needs no vt stripping. Without
	// injection the shell shape is otherwise unchanged.
	//
	// Under `headChannel: 'separate'` the metadata is withheld from every shell
	// shape above and handed to `onHeadReady` instead, BEFORE the shell is
	// written, a host composing a template prefix around this stream has not
	// emitted its `<head>` yet at that point, so it can still place the metadata
	// there.
	// The shell is vt-stripped as a whole below, so the withheld head is stripped
	// here to keep both channels equivalent to the folded shell.
	const separateHead = options?.headChannel === 'separate';
	if (separateHead) options?.onHeadReady?.(pass.vtCandidates ? vtSsrStrip(pass.head) : pass.head);
	const shellHead = separateHead ? '' : pass.head;
	const documentRoot = isDocumentRoot(pass.body);
	let shell = documentRoot ? '<!DOCTYPE html>' : '';
	let heldDocumentTail = '';
	if (injection !== undefined && documentRoot) {
		const tailStart = documentTailStart(pass.body);
		if (tailStart !== -1) {
			heldDocumentTail = pass.body.slice(tailStart);
			const bodyHtml = pass.body.slice(0, tailStart);
			const headInsert = documentHeadInsertionPoint(bodyHtml);
			shell +=
				headInsert !== -1
					? bodyHtml.slice(0, headInsert) + leadingStyles + shellHead + bodyHtml.slice(headInsert)
					: leadingStyles + shellHead + bodyHtml;
		} else {
			shell += leadingStyles + shellHead + pass.body;
		}
	} else {
		shell += leadingStyles + shellHead + pass.body;
	}
	if (pass.serial.length > 0) shell += serializeSuspenseSeeds(pass.serial, nonceAttr);
	if (pass.signals !== undefined) shell += serializeNativeSignalSeeds(pass.signals, nonceAttr);
	const anyPending = stream.boundaries.size > 0;
	if (anyPending)
		shell += '<script ' + STREAM_SCRIPT_ATTR + nonceAttr + '>' + streamRuntimeJs() + '</script>';
	try {
		const shellWrite = write(pass.vtCandidates ? vtSsrStrip(shell) : shell);
		if (shellWrite !== undefined) await shellWrite;
	} catch (err) {
		options?.onError?.(err);
		sink.shellError(err);
		return;
	}
	sink.shellReady();
	if (injection !== undefined) {
		// Subscribe only once the shell is on the wire: injected HTML must never
		// precede it. HTML queued before this point is picked up by the initial
		// drain below.
		try {
			injectionUnsubscribe = injection.subscribe(notifyInjection);
		} catch (err) {
			failInjection(err);
		}
		notifyInjection();
	}

	let suspended = pass.suspended;
	// `attempt` counts CONSECUTIVE passes that completed no boundary. One pass
	// per resolution wave is the design (10 staggered cards legitimately take
	// ~10 passes), so this bound can't cap TOTAL passes the way the buffered
	// loop does — flushing a segment resets it. It still trips on what it's
	// for: an intra-boundary waterfall deeper than MAX (parity with the
	// buffered bound) and the nondeterministic-key runaway, which never
	// completes its boundary.
	let attempt = 0;
	try {
		// A bare root suspension may have delayed the shell long enough for an
		// earlier nested boundary to finish. Its final pass still emits that
		// boundary's pending form, so deliver the already-ready segment immediately
		// after the shell instead of waiting for a pending sibling that may not exist.
		const initiallyDone = reachableDoneSegments();
		if (initiallyDone.length > 0) {
			let chunk = '';
			for (const boundary of initiallyDone) chunk += segmentChunk(boundary, nonceAttr);
			const segmentWrite = write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
			if (segmentWrite !== undefined) await segmentWrite;
			for (const boundary of initiallyDone) {
				flushedSegments.add(boundary.id);
				observedDone.add(boundary.id);
			}
		}
		const initialErrorWrite = flushRecoverableBoundaryErrors();
		if (initialErrorWrite !== undefined) await initialErrorWrite;
		while ([...stream.boundaries.values()].some((b) => b.state === 'pending')) {
			signal?.throwIfAborted();
			if (suspended.length === 0) {
				throw new Error(formatServerError(36));
			}
			if (++attempt > MAX_SUSPENSE_PASSES) {
				throw new Error(formatServerError(48, MAX_SUSPENSE_PASSES));
			}
			const settledWave = suspended;
			if (!retryWithoutSettling) {
				await settleFirstOfWave(settledWave, resolved, timeoutMs, signal);
			}
			pass = renderFullPass().pass;
			suspended = pass.suspended;
			reportRecoverableBoundaryErrors();
			let chunk = '';
			for (const [hash, sheet] of pass.cssEntries) {
				if (emittedCss.has(hash)) continue;
				emittedCss.add(hash);
				chunk +=
					'<style data-octane="' +
					hash +
					'"' +
					(sheet.nonce === undefined ? nonceAttr : ' nonce="' + escapeAttr(sheet.nonce) + '"') +
					'>' +
					escapeEntireInlineStyleContent(sheet.css) +
					'</style>';
			}
			// Float sheet resources this pass discovered that are not on the wire
			// yet — a suspended arm registers its sheets before its use() throws, so
			// a still-pending child boundary's sheet ships with its PARENT's reveal
			// wave (React hoists partial-boundary resources the same way) and CSS
			// fetches start as early as possible. Resources are page-global and
			// retained by contract, so shipping ahead of the reveal is safe.
			if (pass.sheets !== null) {
				let resourceTags = '';
				for (const [key, entry] of pass.sheets) {
					if (flushedSheets.has(key)) continue;
					flushedSheets.add(key);
					resourceTags += entry.html;
				}
				if (resourceTags !== '') {
					chunk += floatResourceChunk(
						resourceTags,
						stream.token + '-r' + resourceChunkSeq++,
						nonceAttr,
					);
				}
			}
			let madeProgress = false;
			for (const boundary of stream.boundaries.values()) {
				if (boundary.state === 'done' && !observedDone.has(boundary.id)) {
					observedDone.add(boundary.id);
					madeProgress = true;
				}
			}
			if (madeProgress) attempt = 0; // a boundary completed — this wave was legitimate
			retryWithoutSettling = observeSuspenseWave(resolved, settledWave, suspended, madeProgress);

			// A nested boundary's template may live inside an enclosing boundary's
			// not-yet-flushed segment. Build a topological emission order: roots and
			// shell-reachable siblings first, then children whose nearest registered
			// ancestor is already flushed or earlier in this same chunk. Browser script
			// execution then introduces each child template before its `$OCTRC` call.
			const done = reachableDoneSegments();
			for (const b of done) chunk += segmentChunk(b, nonceAttr);
			if (chunk !== '') {
				const segmentWrite = write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
				if (segmentWrite !== undefined) await segmentWrite;
				// A boundary isn't considered flushed until the transport accepted its
				// chunk through any active backpressure gate.
				for (const b of done) flushedSegments.add(b.id);
			}
			const errorWrite = flushRecoverableBoundaryErrors();
			if (errorWrite !== undefined) await errorWrite;
		}
	} catch (err) {
		// Abort / timeout / render/write failure after the shell: mark every
		// boundary whose segment was not accepted. A live consumer receives these
		// through the same pressure gate; a disconnected consumer rejects and the
		// renderer simply stops.
		const pendingBoundaryCount = [...stream.boundaries.values()].filter(
			(boundary) => boundary.state === 'pending' && !flushedSegments.has(boundary.id),
		).length;
		const reports = signal?.aborted ? Math.max(1, pendingBoundaryCount) : 1;
		for (let i = 0; i < reports; i++) options?.onError?.(err);
		// Rendering ends here, degraded — the source still gets its completion
		// signal so upstream finalization (serialization flush, timers) is not
		// stranded waiting on a render that will never finish. Unsubscribe FIRST:
		// a notify fired by that finalization would otherwise drain the queue
		// into a chained write that post-abort can only reject, losing the HTML
		// the terminal salvage below still delivers.
		if (injection !== undefined) {
			injectionUnsubscribe?.();
			injectionUnsubscribe = undefined;
			try {
				injection.renderComplete?.();
			} catch {
				// The stream is already failing; the source's error cannot improve it.
			}
		}
		let tail = '';
		if (injection !== undefined && !injectionFailed) {
			// Terminal salvage: queued injection HTML (typically the source's
			// just-flushed serialization remainder) still ships, ahead of the
			// recovery markers and the held tail.
			try {
				tail += injection.take();
			} catch {
				// A failing source forfeits its remainder; the terminal write goes on.
			}
		}
		for (const b of stream.boundaries.values()) {
			if (!flushedSegments.has(b.id) && !b.errorFlushed) tail += boundaryErrorChunk(b, nonceAttr);
		}
		// Best-effort well-formedness under injection: the held document tail
		// still closes <body>/<html> after the degraded-boundary markers.
		if (heldDocumentTail !== '') tail += heldDocumentTail;
		if (tail !== '') {
			try {
				const terminalWrite = write(tail, true);
				if (terminalWrite !== undefined) await terminalWrite;
			} catch {
				// The transport is already gone; there is nowhere to send recovery.
			}
		}
		sink.fatal(err);
		return;
	}
	if (injection !== undefined) {
		// Rendering is complete but the injection source may still be producing
		// (subscribe notifications keep draining through the write chain while
		// we wait). The stream — and a document's held tail — close only once
		// `done` settles; abort and source failures route through the same
		// degraded terminal path as a mid-render abort.
		try {
			injection.renderComplete?.();
		} catch (err) {
			failInjection(err);
		}
		try {
			await waitForInjectionDone();
			const finalDrain = drainInjection();
			if (finalDrain !== undefined) await finalDrain;
			if (injectionFailed) throw injectionFailure;
			if (heldDocumentTail !== '') {
				// Cleared before awaiting: a post-acceptance rejection (abort racing
				// the drain wait) must not resend the tail through the catch below.
				const tailChunk = heldDocumentTail;
				heldDocumentTail = '';
				const tailWrite = write(tailChunk);
				if (tailWrite !== undefined) await tailWrite;
			}
		} catch (err) {
			options?.onError?.(err);
			// Unsubscribe before salvaging so a late notify cannot drain the
			// queue into a chained write this degraded close will never deliver.
			injectionUnsubscribe?.();
			injectionUnsubscribe = undefined;
			let terminal = '';
			if (!injectionFailed) {
				// Terminal salvage: the source may have queued HTML (e.g. its
				// serialization remainder) between the failure and this close.
				try {
					terminal = injection.take();
				} catch {
					// A failing source forfeits its remainder; the tail still ships.
				}
			}
			terminal += heldDocumentTail;
			if (terminal !== '') {
				try {
					const terminalWrite = write(terminal, true);
					if (terminalWrite !== undefined) await terminalWrite;
				} catch {
					// The transport is already gone; there is nowhere to send the tail.
				}
			}
			sink.fatal(err);
			return;
		}
		injectionUnsubscribe?.();
	}
	sink.allReady();
}

/**
 * React `react-dom/server` `renderToPipeableStream` (Node streams). Returns
 * `{ pipe, abort }`; chunks buffer until `pipe(destination)` is called.
 * `onShellReady` fires once the shell (fallbacks included) has been produced;
 * `onAllReady` once every boundary has streamed. Octane signature convention:
 * `(Component, props?, options?)`.
 */
export function renderToPipeableStream(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: StreamOptions,
): {
	pipe: <T extends { write(chunk: string): unknown; end(): unknown }>(destination: T) => T;
	abort: (reason?: unknown) => void;
} {
	const component = entryComponent as ServerComponent;
	interface Destination {
		write(chunk: string): unknown;
		end(): unknown;
		once?: (event: string, listener: (...args: any[]) => void) => unknown;
		off?: (event: string, listener: (...args: any[]) => void) => unknown;
		removeListener?: (event: string, listener: (...args: any[]) => void) => unknown;
	}

	const controller = new AbortController();
	let removeOuterAbort: (() => void) | undefined;
	if (options?.signal) {
		const outer = options.signal;
		if (outer.aborted) controller.abort(outer.reason);
		else {
			const onAbort = () => controller.abort(outer.reason);
			outer.addEventListener('abort', onAbort, { once: true });
			removeOuterAbort = () => outer.removeEventListener('abort', onAbort);
		}
	}
	let destination: Destination | null = null;
	const buffered: { chunk: string; terminal: boolean }[] = [];
	let ended = false;
	let closed = false;
	let endCalled = false;
	let pipeCalled = false;
	let writeGate: Promise<void> | null = null;

	const destinationFailure = (reason: unknown): void => {
		if (closed) return;
		closed = true;
		const error = reason ?? new Error(formatServerError(38));
		// A stream with no pending boundaries can finish rendering before `pipe()`
		// supplies its destination. There is then no active runStream await to
		// observe the abort, so surface late write/end failures here directly.
		if (ended) options?.onError?.(error);
		if (!controller.signal.aborted) {
			controller.abort(error);
		}
	};

	const finishEnd = (): void => {
		if (!ended || destination === null || writeGate !== null || endCalled || closed) return;
		endCalled = true;
		try {
			destination.end();
		} catch (err) {
			destinationFailure(err);
		}
	};

	const waitForDrain = (dest: Destination): Promise<void> => {
		if (dest.once === undefined) {
			return Promise.reject(new TypeError(formatServerError(39)));
		}
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const remove = (event: string, listener: (...args: any[]) => void): void => {
				if (dest.off !== undefined) dest.off(event, listener);
				else dest.removeListener?.(event, listener);
			};
			const cleanup = (): void => {
				remove('drain', onDrain);
				remove('error', onError);
				remove('close', onClose);
				controller.signal.removeEventListener('abort', onAbort);
			};
			const finish = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				cleanup();
				fn();
			};
			const onDrain = () => finish(resolve);
			const onError = (err: unknown) =>
				finish(() => {
					destinationFailure(err);
					reject(err);
				});
			const onClose = () =>
				finish(() => {
					const err = new Error(formatServerError(38));
					if (!endCalled) destinationFailure(err);
					reject(err);
				});
			const onAbort = () => finish(() => reject(controller.signal.reason));
			dest.once!('drain', onDrain);
			dest.once!('error', onError);
			dest.once!('close', onClose);
			if (controller.signal.aborted) onAbort();
			else controller.signal.addEventListener('abort', onAbort, { once: true });
		});
	};

	const writeNow = (chunk: string, terminal: boolean): void | Promise<void> => {
		const dest = destination!;
		if (closed) return Promise.reject(new Error(formatServerError(40)));
		if (!terminal && controller.signal.aborted) {
			return Promise.reject(controller.signal.reason);
		}
		let accepted: unknown;
		try {
			accepted = dest.write(chunk);
		} catch (err) {
			destinationFailure(err);
			return Promise.reject(err);
		}
		// `write(false)` still accepted the bytes. Normal chunks wait for drain
		// before rendering more; a terminal recovery marker can call end()
		// immediately and let the Writable flush its already-buffered final bytes.
		return accepted === false && !terminal ? waitForDrain(dest) : undefined;
	};

	const trackWrite = (operation: Promise<void>): Promise<void> => {
		// The normalized gate serializes later writes even when this operation
		// rejects. The original promise remains observable by runStream.
		const gate = operation.then(
			() => {},
			() => {},
		);
		writeGate = gate;
		gate.then(() => {
			if (writeGate === gate) {
				writeGate = null;
				finishEnd();
			}
		});
		// Buffered shell writes are initiated by pipe(), not awaited by runStream;
		// turn their failure into render cancellation and consume the rejection.
		operation.catch((err) => {
			if (!controller.signal.aborted) destinationFailure(err);
		});
		return operation;
	};

	const queueWrite = (chunk: string, terminal = false): void | Promise<void> => {
		if (destination === null) {
			buffered.push({ chunk, terminal });
			return;
		}
		if (writeGate !== null) {
			const operation = writeGate.then(() => writeNow(chunk, terminal));
			return trackWrite(operation);
		}
		const operation = writeNow(chunk, terminal);
		return operation === undefined ? undefined : trackWrite(operation);
	};

	const flushEnd = (): void => {
		if (ended) return;
		ended = true;
		removeOuterAbort?.();
		finishEnd();
	};
	let started = false;
	const startRender = (): void => {
		if (started) return;
		started = true;
		const renderOptions = { ...options, signal: controller.signal };
		const resolved = newResolvedMap(renderOptions);
		void runStream(
			component,
			props,
			renderOptions,
			{
				write(chunk, terminal) {
					return queueWrite(chunk, terminal);
				},
				shellReady() {
					options?.onShellReady?.();
				},
				shellError(err) {
					releaseServerRenderResources(resolved);
					options?.onShellError?.(err);
					flushEnd();
				},
				allReady() {
					releaseServerRenderResources(resolved);
					options?.onAllReady?.();
					flushEnd();
				},
				fatal() {
					releaseServerRenderResources(resolved);
					// Once the shell exists, abort/error degradation is a terminal
					// completion of the pipeable request. Fizz fires onAllReady after its
					// recovery instructions have been accepted even though onError also
					// reported the reason; consumers use this callback to end surrounding
					// document work in both success and aborted paths.
					options?.onAllReady?.();
					flushEnd();
				},
			},
			resolved,
		).catch((err) => {
			releaseServerRenderResources(resolved);
			options?.onError?.(err);
			flushEnd();
		});
	};
	// Fizz callbacks never run before the caller receives the `{ pipe, abort }`
	// handle. Starting from a microtask preserves that ordering when the caller
	// waits for onShellReady; an immediate pipe() starts synchronously so existing
	// direct-pipe consumers still receive the shell without an extra turn.
	queueMicrotask(startRender);
	return {
		pipe(dest) {
			if (pipeCalled) throw new Error(formatServerError(41));
			pipeCalled = true;
			// Produce the shell into the pre-pipe buffer first. Besides retaining the
			// established synchronous direct-pipe behavior for late destination errors,
			// this prevents destination pressure from delaying shell readiness itself.
			startRender();
			const nodeDest = dest as Destination;
			destination = nodeDest;
			if (nodeDest.once !== undefined) {
				nodeDest.once('error', (err: unknown) => destinationFailure(err));
				nodeDest.once('close', () => {
					// close after our end() is the normal Writable lifecycle. Before
					// end(), it means the consumer disconnected and rendering must stop.
					if (!endCalled) destinationFailure(new Error(formatServerError(38)));
				});
			}
			// Chunks accepted into the pre-pipe buffer remain deliverable even if
			// abort() ran meanwhile (the final item is the degraded $OCTRX tail).
			for (const item of buffered) {
				queueWrite(item.chunk, item.terminal || controller.signal.aborted);
			}
			buffered.length = 0;
			finishEnd();
			return dest;
		},
		abort(reason?: unknown) {
			if (!ended) controller.abort(reason ?? new Error(formatServerError(42)));
		},
	};
}

/**
 * React `react-dom/server` `renderToReadableStream` (web streams). Resolves
 * with the ReadableStream once the shell is ready (rejects on a shell error);
 * the stream's `allReady` promise settles when every boundary chunk has been
 * accepted under consumer backpressure. A consumer that pauses pulling also
 * pauses `allReady`; read concurrently when waiting for it.
 */
export function renderToReadableStream(
	entryComponent: ServerEntryComponent,
	props?: any,
	options?: StreamOptions,
): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }> {
	const component = entryComponent as ServerComponent;
	return new Promise((resolveShell, rejectShell) => {
		const encoder = new TextEncoder();
		const renderController = new AbortController();
		let removeOuterAbort: (() => void) | undefined;
		if (options?.signal) {
			const outer = options.signal;
			if (outer.aborted) renderController.abort(outer.reason);
			else {
				const onAbort = () => renderController.abort(outer.reason);
				outer.addEventListener('abort', onAbort, { once: true });
				removeOuterAbort = () => outer.removeEventListener('abort', onAbort);
			}
		}
		let readableController!: ReadableStreamDefaultController<Uint8Array>;
		let wakeDemand: (() => void) | null = null;
		let consumerCancelled = false;
		let cancelReason: unknown;
		let closed = false;
		let allReadyResolve!: () => void;
		let allReadyReject!: (err: unknown) => void;
		const allReady = new Promise<void>((res, rej) => {
			allReadyResolve = res;
			allReadyReject = rej;
		});
		// A stream consumer may never read `allReady`; don't let its rejection
		// surface as an unhandled rejection on the abort path.
		allReady.catch(() => {});
		const wakeWriter = (): void => {
			const wake = wakeDemand;
			wakeDemand = null;
			wake?.();
		};
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				readableController = c;
			},
			pull() {
				wakeWriter();
			},
			cancel(reason) {
				if (closed) return;
				consumerCancelled = true;
				cancelReason = reason ?? new Error(formatServerError(43));
				removeOuterAbort?.();
				renderController.abort(cancelReason);
				wakeWriter();
			},
		}) as ReadableStream<Uint8Array> & { allReady: Promise<void> };
		stream.allReady = allReady;
		let shellDone = false;

		const waitForDemand = (): Promise<void> =>
			new Promise<void>((resolve, reject) => {
				let settled = false;
				const cleanup = (): void => {
					renderController.signal.removeEventListener('abort', onAbort);
				};
				const finish = (fn: () => void): void => {
					if (settled) return;
					settled = true;
					cleanup();
					if (wakeDemand === onDemand) wakeDemand = null;
					fn();
				};
				const onDemand = () => finish(resolve);
				const onAbort = () => finish(() => reject(renderController.signal.reason));
				wakeDemand = onDemand;
				if (renderController.signal.aborted) onAbort();
				else renderController.signal.addEventListener('abort', onAbort, { once: true });
			});

		const writeReadable = (chunk: string, terminal = false): void | Promise<void> => {
			if (closed || consumerCancelled) {
				return Promise.reject(cancelReason ?? new Error(formatServerError(44)));
			}
			if (!terminal && renderController.signal.aborted) {
				return Promise.reject(renderController.signal.reason);
			}
			const bytes = encoder.encode(chunk);
			if (terminal) {
				// Recovery is the sole bounded-pressure exception: enqueue at most one
				// final $OCTRX chunk even when the shell fills the high-water mark. That
				// keeps abort/error `allReady` rejection deterministic without losing
				// the browser's post-shell client-render marker.
				readableController.enqueue(bytes);
				return;
			}
			if ((readableController.desiredSize ?? 0) > 0) {
				readableController.enqueue(bytes);
				return;
			}
			return (async () => {
				while ((readableController.desiredSize ?? 0) <= 0) {
					await waitForDemand();
					if (closed || consumerCancelled) {
						throw cancelReason ?? new Error(formatServerError(44));
					}
				}
				readableController.enqueue(bytes);
			})();
		};

		const closeReadable = (): void => {
			if (closed || consumerCancelled) return;
			closed = true;
			removeOuterAbort?.();
			wakeWriter();
			try {
				readableController.close();
			} catch {
				/* already closed */
			}
		};

		const renderOptions = { ...options, signal: renderController.signal };
		const resolved = newResolvedMap(renderOptions);
		runStream(
			component,
			props,
			renderOptions,
			{
				write(chunk, terminal) {
					return writeReadable(chunk, terminal);
				},
				shellReady() {
					shellDone = true;
					options?.onShellReady?.();
					resolveShell(stream);
				},
				shellError(err) {
					releaseServerRenderResources(resolved);
					options?.onShellError?.(err);
					if (!shellDone) rejectShell(err);
					allReadyReject(err);
					closeReadable();
				},
				allReady() {
					releaseServerRenderResources(resolved);
					options?.onAllReady?.();
					allReadyResolve();
					closeReadable();
				},
				fatal(err) {
					releaseServerRenderResources(resolved);
					allReadyReject(err);
					closeReadable();
				},
			},
			resolved,
		).catch((err) => {
			releaseServerRenderResources(resolved);
			options?.onError?.(err);
			if (!shellDone) rejectShell(err);
			allReadyReject(err);
			closeReadable();
		});
	});
}

// ---------------------------------------------------------------------------
// Resource hints — server mirrors of React DOM's preload / preinit /
// preconnect / prefetchDNS. Each emits one deduped tag into the render's HEAD
// buffer (folded into <head> / flushed with the streaming shell). The
// `data-oct-hint` key matches the client's dedupe set, so a hydrating client
// call for the same resource is a no-op.
// ---------------------------------------------------------------------------

function emitHeadHint(key: string, html: string): void {
	if (HEAD === null) return;
	if (HEAD.hints.has(key)) return;
	HEAD.hints.add(key);
	(HEAD.hintHtml ??= new Map()).set(key, html);
}

/** The option keys React recognizes on resource hints; everything else drops. */
const KNOWN_HINT_OPTIONS = new Set([
	'as',
	'crossOrigin',
	'integrity',
	'nonce',
	'type',
	'fetchPriority',
	'referrerPolicy',
	'imageSrcSet',
	'imageSizes',
	'media',
]);

function hintAttrs(
	opts: Record<string, unknown> | undefined,
	skipAs: boolean,
	tag: 'link' | 'script',
): string {
	let out = '';
	if (opts == null) return out;
	for (const k in opts) {
		if (!KNOWN_HINT_OPTIONS.has(k)) continue;
		if (skipAs && k === 'as') continue;
		const v = (opts as any)[k];
		if (v == null || v === false) continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		if (v === true) {
			out += ' ' + name;
		} else {
			const value = typeof v === 'string' ? v : String(v);
			out += ' ' + name + '="' + escapeAttr(sanitizeURLAttribute(tag, name, value)) + '"';
		}
	}
	return out;
}

function coerceHintHref(href: unknown): string | null {
	return typeof href === 'string' && href !== '' ? href : null;
}

/** React DOM `preload(href, {as, …})`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preload', href, options);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	if (
		options === null ||
		typeof options !== 'object' ||
		!options.as ||
		typeof options.as !== 'string'
	)
		return;
	const as = options.as;
	// Fonts must be fetched anonymously to be reusable by CSS — enforced
	// regardless of the caller's crossOrigin, matching React and the client.
	if (as === 'font') options = { ...options, crossOrigin: '' };
	// Mirror the client's one-way upgrade: once the matching resource is live in
	// this pass (Float resource or preinit), the preload adds nothing. A preload
	// that comes FIRST seeds connection/integrity options for the preinit and is
	// coalesced away when the preinit lands (see the hintHtml delete there).
	if (HEAD !== null) {
		if (as === 'style' && HEAD.hints.has('sheet:' + value)) {
			const existing = HEAD.sheets?.get(value);
			if (existing === undefined || !existing.html.startsWith('<style')) return;
			// Inline CSS cannot consume an external stylesheet preload. Compiler
			// discovery may register the style ahead of its component's setup, but
			// the two distinct resources must both survive regardless of that order.
			if (process.env.NODE_ENV !== 'production' && HEAD.hints.has('dev-inline-style:' + value)) {
				console.error(
					'A <style> resource with href "' +
						value +
						'" follows a stylesheet preload for the same href. ' +
						'Inline styles cannot consume a stylesheet preload; remove the preload or use a stylesheet link.',
				);
			}
		}
		// One executable per src across BOTH script forms (classic and module),
		// matching the client's unified identity set.
		if (as === 'script' && (HEAD.hints.has('script:' + value) || HEAD.hints.has('module:' + value)))
			return;
		if (as === 'style' || as === 'script') {
			let subset: Record<string, unknown> | null = null;
			for (const k of ['crossOrigin', 'integrity', 'nonce', 'fetchPriority', 'referrerPolicy']) {
				const v = (options as any)[k];
				if (v != null) (subset ??= {})[k] = v;
			}
			if (subset !== null) (HEAD.preloadXfer ??= new Map()).set(as + ':' + value, subset);
		}
	}
	const imageSrcSet = as === 'image' ? options.imageSrcSet : undefined;
	const key =
		typeof imageSrcSet === 'string' && imageSrcSet !== ''
			? 'preload:image:' + imageSrcSet + '::' + String(options.imageSizes ?? '')
			: 'preload:' + as + ':' + value;
	const safeHref = sanitizeURL(value);
	const omitHref = typeof imageSrcSet === 'string' && imageSrcSet !== '';
	emitHeadHint(
		key,
		'<link rel="preload"' +
			(omitHref ? '' : ' href="' + escapeAttr(safeHref) + '"') +
			hintAttrs(options, false, 'link') +
			' data-oct-hint="' +
			escapeAttr(key) +
			'">',
	);
}

/** React DOM `preinit(href, {as: 'style'|'script', …})`. */
/**
 * React DOM `preinit(href, {as, …})` — routes through the Float resource emits
 * so preinit and the rendered resource forms share ONE identity per pass
 * (stylesheets join the precedence groups; scripts dedupe against
 * `<script async src>`), mirroring the client.
 */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinit', href, options);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	if (options === null || typeof options !== 'object') return;
	const as = options?.as;
	if (as !== 'style' && as !== 'script') return;
	let seeded: Record<string, unknown> | null = null;
	if (HEAD !== null) {
		const xfer = HEAD.preloadXfer?.get(as + ':' + value);
		if (xfer !== undefined) {
			seeded = xfer;
			HEAD.preloadXfer!.delete(as + ':' + value);
		}
		// Coalesce the now-redundant preload out of the fold (React folds
		// preload → initialized resource on the server).
		HEAD.hintHtml?.delete('preload:' + as + ':' + value);
		HEAD.hints.delete('preload:' + as + ':' + value);
	}
	if (as === 'style') {
		ssrStylesheetResource({
			...seeded,
			...options,
			as: undefined,
			href: value,
			precedence: (options as any).precedence ?? 'default',
		});
	} else {
		ssrScriptResource({ ...seeded, ...options, as: undefined, href: undefined, src: value });
	}
}

/** React DOM `preconnect(href, {crossOrigin?})`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preconnect', href, options);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	if (options !== null && typeof options !== 'object') options = undefined;
	else if (options?.crossOrigin !== undefined && typeof options.crossOrigin !== 'string') {
		options = undefined;
	}
	const corsMode =
		(options as any)?.crossOrigin == null ? '<none>' : String((options as any).crossOrigin);
	const key = 'preconnect:' + corsMode + ':' + value;
	const safeHref = sanitizeURL(value);
	emitHeadHint(
		key,
		'<link rel="preconnect" href="' +
			escapeAttr(safeHref) +
			'"' +
			hintAttrs(options, false, 'link') +
			' data-oct-hint="' +
			escapeAttr(key) +
			'">',
	);
}

/** React DOM `prefetchDNS(href)`. */
export function prefetchDNS(href: string): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('prefetchDNS', href, arguments[1], arguments.length > 1);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	const key = 'dns-prefetch:' + value;
	const safeHref = sanitizeURL(value);
	emitHeadHint(
		key,
		'<link rel="dns-prefetch" href="' +
			escapeAttr(safeHref) +
			'" data-oct-hint="' +
			escapeAttr(key) +
			'">',
	);
}

/** Attribute serialization for Float resources; href/src/rel/async/precedence are owned by the emit. */
function resourceAttrs(attrs: Record<string, unknown>, tag: 'link' | 'script'): string {
	let out = '';
	for (const k in attrs) {
		if (k === 'precedence' || k === 'href' || k === 'src' || k === 'rel' || k === 'async') continue;
		const v = (attrs as any)[k];
		if (v == null || v === false || typeof v === 'function') continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		if (v === true) out += ' ' + name;
		else out += ' ' + name + '="' + escapeAttr(sanitizeURLAttribute(tag, name, String(v))) + '"';
	}
	return out;
}

/**
 * Compiler target for `<link rel="stylesheet" href precedence>` (React Float).
 * Dedupes by href across the pass; groups by precedence in first-encounter
 * order (the HeadBuffer.sheets Map), folded after the ordinary head content.
 */
export function ssrStylesheetResource(
	attrs: Record<string, unknown> | null,
	invalidReason?: string,
): string {
	if (process.env.NODE_ENV !== 'production' && invalidReason !== undefined) {
		let conflict: string;
		if (invalidReason === 'missing-href') {
			conflict = 'requires a non-empty string `href`';
		} else if (invalidReason === 'empty-href') {
			conflict = 'has an empty `href`; a stylesheet resource requires a non-empty string `href`';
		} else {
			const props =
				invalidReason === 'onLoad+onError' ? '`onLoad` and `onError`' : '`' + invalidReason + '`';
			conflict = 'also has ' + props + ', which requires an independently managed stylesheet';
		}
		console.error(
			'A <link rel="stylesheet"> with `precedence` ' +
				conflict +
				'. It will not be hoisted or deduplicated; remove the conflicting prop or `precedence`.',
		);
		return '';
	}
	if (HEAD === null || attrs == null) return '';
	const href = attrs.href;
	if (typeof href !== 'string' || href === '') return '';
	const key = 'sheet:' + href;
	if (HEAD.hints.has(key)) return '';
	HEAD.hints.add(key);
	const precedence = attrs.precedence == null ? '' : String(attrs.precedence);
	const tag =
		'<link rel="stylesheet" href="' +
		escapeAttr(sanitizeURL(href)) +
		'" data-precedence="' +
		escapeAttr(precedence) +
		'"' +
		resourceAttrs(attrs, 'link') +
		'>';
	const sheets = (HEAD.sheets ??= new Map());
	sheets.set(href, { precedence, html: tag });
	return '';
}

/**
 * Compiler target for `<style href precedence>` (React Float style resource).
 * Shares the stylesheet dedupe namespace and precedence grouping with link
 * resources; the CSS is raw `<style>` text (never HTML-escaped — entities do
 * not decode inside style raw text), so content that could close the tag fails
 * closed with a dev diagnostic instead of truncating the document.
 */
export function ssrStyleResource(
	attrs: Record<string, unknown> | null,
	css: string,
	development?: boolean,
): string {
	if (HEAD === null || attrs == null) return '';
	const href = attrs.href;
	if (typeof href !== 'string' || href === '') return '';
	if (process.env.NODE_ENV !== 'production' && development === true && /\s/.test(href)) {
		console.error(
			'A <style> resource href must not contain whitespace because it identifies the style ' +
				'during hydration; received "' +
				href +
				'".',
		);
	}
	if (/<\/style/i.test(css)) {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				'octane SSR: a <style href precedence> resource contains "</style" and cannot be ' +
					'serialized safely; the resource was skipped. Load it as a stylesheet link instead.',
			);
		}
		return '';
	}
	const key = 'sheet:' + href;
	if (HEAD.hints.has(key)) return '';
	if (process.env.NODE_ENV !== 'production' && development === true) {
		if (HEAD.hints.has('preload:style:' + href)) {
			console.error(
				'A <style> resource with href "' +
					href +
					'" follows a stylesheet preload for the same href. ' +
					'Inline styles cannot consume a stylesheet preload; remove the preload or use a stylesheet link.',
			);
		}
		HEAD.hints.add('dev-inline-style:' + href);
	}
	HEAD.hints.add(key);
	const precedence = attrs.precedence == null ? '' : String(attrs.precedence);
	const tag =
		'<style data-precedence="' +
		escapeAttr(precedence) +
		'" data-href="' +
		escapeAttr(href) +
		'"' +
		resourceAttrs(attrs, 'link') +
		'>' +
		css +
		'</style>';
	const sheets = (HEAD.sheets ??= new Map());
	sheets.set(href, { precedence, html: tag });
	return '';
}

/** Compiler target for `<script async src>` resources (React Float). */
export function ssrScriptResource(attrs: Record<string, unknown> | null): string {
	if (HEAD === null || attrs == null) return '';
	const src = attrs.src;
	if (typeof src !== 'string' || src === '') return '';
	const key = 'script:' + src;
	// One executable per src per pass, across the classic and module forms.
	if (HEAD.hints.has(key) || HEAD.hints.has('module:' + src)) return '';
	HEAD.hints.add(key);
	HEAD.html +=
		'<script src="' +
		escapeAttr(sanitizeURL(src)) +
		'" async data-oct-res=""' +
		resourceAttrs(attrs, 'script') +
		'></script>';
	return '';
}

/** React DOM `preloadModule(href, options?)` — `<link rel="modulepreload">`, keyed by href. */
export function preloadModule(href: string, options?: Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preloadModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	if (options === null || typeof options !== 'object') options = undefined;
	else if ('as' in options && typeof options.as !== 'string') {
		options = { ...options, as: undefined };
	}
	// A module that preinitModule OR a classic Float script already executes in
	// this pass needs no preload — one executable identity per src.
	if (HEAD !== null && (HEAD.hints.has('module:' + value) || HEAD.hints.has('script:' + value)))
		return;
	const key = 'modulepreload:' + value;
	const safeHref = sanitizeURL(value);
	emitHeadHint(
		key,
		'<link rel="modulepreload" href="' +
			escapeAttr(safeHref) +
			'"' +
			hintAttrs(options, false, 'link') +
			' data-oct-hint="' +
			escapeAttr(key) +
			'">',
	);
}

/**
 * React DOM `preinitModule(href, options?)` — `<script type="module" async src>`.
 * Only the `script` destination exists for module preinit; others fail closed.
 */
export function preinitModule(
	href: string,
	options?: { as?: string } & Record<string, unknown>,
): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinitModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const value = coerceHintHref(href);
	if (value === null) return;
	if (options != null && typeof options !== 'object') return;
	if ((options?.as ?? 'script') !== 'script') return;
	if (HEAD !== null && HEAD.hints.has('script:' + value)) return;
	const key = 'module:' + value;
	const safeHref = sanitizeURL(value);
	emitHeadHint(
		key,
		'<script type="module" src="' +
			escapeAttr(safeHref) +
			'" async' +
			hintAttrs(options, true, 'script') +
			' data-oct-hint="' +
			escapeAttr(key) +
			'"></script>',
	);
}
