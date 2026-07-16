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
 * cursor adopts. Events and refs are dropped (no DOM on the server); fragment
 * refs (`<Fragment ref={…}>`) are rejected by the compiler in server mode.
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
	STREAM_BOUNDARY_ATTR,
	STREAM_SEGMENT_ATTR,
	STREAM_SEED_ATTR,
	STREAM_SCRIPT_ATTR,
	STREAM_SEED_COMMENT,
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

// Shared client/SSR CSS helpers (single source in css.ts so class strings and
// hyphenated style keys stay byte-equal across the two runtimes).
import { normalizeClass, styleName } from './css.js';
import {
	invalidHtmlNestingWithAncestor,
	invalidHtmlNestingWithParent,
} from './html-tree-validation.js';
import { sanitizeURL, sanitizeURLAttribute } from './sanitize-url.js';
export { normalizeClass };

interface SSRScope {
	parent: SSRScope | null;
	/** Context Provider values stamped on this scope (lazily allocated). */
	$$ctxValues: Map<unknown, unknown> | null;
}

type ParserNamespace = 'html' | 'svg' | 'mathml';

// Public string descriptors are HTML-ASCII-case-insensitive. Keep foreign
// namespace inference on the same contract even though the shared table stores
// SVG's canonical mixed-case spellings (for example foreignObject/clipPath).
const SVG_ONLY_LOWERCASE_TAGS = new Set(Array.from(SVG_ONLY_TAGS, (tag) => tag.toLowerCase()));

interface SsrElementContext {
	tag: string;
	parent: SsrElementContext | null;
	namespace: ParserNamespace;
	childrenNamespace: ParserNamespace;
	location?: string;
}

type ServerComponent = (props: any, scope: SSRScope, extra?: any) => string;

let CURRENT_SCOPE: SSRScope | null = null;
let ID_COUNTER = 0;
let ID_PREFIX = '';
let CSS: Map<string, string> | null = null;
// Emit hydration block markers (`<!--[-->…<!--]-->`) and head-adoption markers?
// True for hydratable output (renderToString / prerender / streaming); flipped
// false for the whole of a `renderToStaticMarkup` render, which produces clean,
// non-hydratable HTML (emails / static pages). It is part of the ambient pass
// snapshot so a nested hydratable render cannot inherit a static outer pass.
let MARKERS = true;
// Accumulates hoisted `<head>` content (`<title>`/`<meta>`/`<link>`) during the
// active render pass (a mutable container, mirroring CSS's mutable Map, so a
// per-pass local capture keeps accumulating via `HEAD.html +=` even though
// strings are immutable). Folded into the result `html` by `spliceHead` (into
// `<head>` when present, else prepended).
interface HeadBuffer {
	html: string;
	/** Resource-hint dedupe keys emitted into `html` during this pass. */
	hints: Set<string>;
}
let HEAD: HeadBuffer | null = null;

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

/** Compiler ABI: validate and scope one native element during a DEV SSR render. */
export function ssrElement(
	tag: string,
	location: string | undefined,
	render: () => string,
): string {
	if (process.env.NODE_ENV === 'production' || SSR_NESTING_WARNINGS === null) return render();

	const parent = CURRENT_SSR_ELEMENT;
	const { namespace, childrenNamespace } = ssrElementNamespaces(tag, parent);
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
	if (namespace === 'html' && parent?.namespace === 'html') {
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
 * React-19 `<Activity>` sentinel. Server-compiled template sites lower directly
 * to `ssrActivity`; this export keeps `import { Activity } from 'octane'`
 * resolvable after the server compiler retargets it to `octane/server`.
 */
export const Activity: unique symbol = Symbol.for('octane.Activity');

interface ElementDescriptor {
	$$kind: typeof ELEMENT_TAG;
	// A server ComponentBody (component-value form, e.g. `{<Comp/>}`) OR a host tag
	// string (`'li'`), produced when host JSX appears at a VALUE position (a
	// `.map(...)` callback, a render-prop arrow body, an array literal).
	type: ServerComponent | string | typeof Fragment;
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

function hasElementConfigKey(config: any): boolean {
	if (config == null || (typeof config !== 'object' && typeof config !== 'function')) return false;
	const own = Object.getOwnPropertyDescriptor(config, 'key');
	if (own?.get != null && (own.get as any).isReactWarning) return false;
	return config.key !== undefined;
}

function copyElementConfig(config: any): any {
	const props: any = {};
	if (config == null) return props;
	for (const name in config) {
		if (name !== 'key' && Object.prototype.hasOwnProperty.call(config, name)) {
			props[name] = config[name];
		}
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

function finalizeElementDescriptor(descriptor: ElementDescriptor): ElementDescriptor {
	if (process.env.NODE_ENV !== 'production') {
		Object.freeze(descriptor.props);
		Object.freeze(descriptor);
	}
	return descriptor;
}

// Server `createElement(type, props, ...children)` — produces the SAME descriptor
// shape as the client runtime's `createElement` (see runtime.ts). The compiler
// lowers VALUE-position JSX (a `.map` callback, a render-prop arrow body, an array
// literal) to this call in BOTH modes, so the same lowered call resolves to the
// client-or-server `createElement` per build, and `ssrChild` renders the result.
export function createElement(
	type: ServerComponent | string | typeof Fragment,
	props?: any,
	...children: any[]
): ElementDescriptor {
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
	const items: any[] = [];
	const keys: any[] = [];
	if (isFragmentDescriptor(value)) {
		const path = value.key == null ? [] : ['keyed-fragment', value.key];
		flattenSsrChildContainer(items, keys, fragmentDescriptorChildren(value), 'fragment', path);
		return { items, keys };
	}
	if (Array.isArray(value)) {
		flattenSsrChildContainer(items, keys, value, ssrDeoptWrapperKind(value), []);
		return { items, keys };
	}
	if (includeKeyedSingle && isElementDescriptor(value) && value.key != null) {
		items.push(value);
		keys.push(scopedSsrDeoptKey([], value, 0, value.key));
		return { items, keys };
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
		throw new Error(
			'cloneElement: the first argument must be an element (from createElement / JSX).',
		);
	}
	const props = copyElementConfig(element.props);
	let key = element.key;
	if (config != null) {
		if (hasElementConfigKey(config)) key = '' + config.key;
		for (const name in config) {
			if (name === 'key') continue;
			if (name === 'ref' && config.ref === undefined) continue;
			if (Object.prototype.hasOwnProperty.call(config, name)) props[name] = config[name];
		}
	}
	const n = children.length;
	let kids: any;
	if (n === 1) {
		kids = children[0];
	} else if (n > 1) {
		kids = children;
	} else {
		// No new children: reuse `config.children` (now merged into props) or the original.
		kids = 'children' in props ? props.children : element.children;
	}
	if (n > 0) props.children = kids;
	return finalizeElementDescriptor({
		$$kind: ELEMENT_TAG,
		type: element.type,
		props,
		key,
		ref: props.ref !== undefined ? props.ref : null,
		children: kids ?? null,
	});
}

function cloneAndReplaceElementKey(element: ElementDescriptor, key: string): ElementDescriptor {
	return finalizeElementDescriptor({
		$$kind: ELEMENT_TAG,
		type: element.type,
		props: element.props,
		key,
		ref: element.ref,
		children: element.children,
	});
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
	if (children == null || typeof children !== 'object') return null;
	const iterator =
		(typeof Symbol === 'function' && (children as any)[Symbol.iterator]) ||
		(children as any)['@@iterator'];
	return typeof iterator === 'function' ? iterator : null;
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

function invalidChildError(child: object): Error {
	const rendered = String(child);
	const found =
		rendered === '[object Object]'
			? 'object with keys {' + Object.keys(child).join(', ') + '}'
			: rendered;
	return new Error(
		'Objects are not valid as an Octane child (found: ' +
			found +
			'). If you meant to render a collection of children, use an array instead.',
	);
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
			throw new Error('Children.only expected to receive a single element child.');
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
// something does need escaping, the chained native .replace passes are kept —
// measured faster than an exec-loop or replace-with-callback single pass on V8
// for both sparse and dense escape densities.
const HTML_ESCAPE_RE = /[&<>]/g;
export function escapeHtml(v: unknown): string {
	const s = typeof v === 'string' ? v : String(v);
	HTML_ESCAPE_RE.lastIndex = 0;
	if (!HTML_ESCAPE_RE.test(s)) return s;
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/** A dynamic text hole. null/false/undefined render as empty (React parity). */
export function ssrText(v: unknown): string {
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
	return ssrChildValue(v, scope, true);
}

function ssrChildValue(v: unknown, scope: SSRScope, includeKeyedSingle: boolean): string {
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
		typeof v === 'object' &&
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
				out += withAsyncIdentity('item', key, () => ssrChildValue(item, scope, false));
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
				if (typeof d.type === 'string')
					return ssrBlock(ssrHostElement(d.type, d.props, d.children, scope));
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
		throw new Error(
			'Objects are not valid as a child (found: object with keys {' +
				Object.keys(v as object).join(', ') +
				'}). If you meant to render a collection of children, use an array instead.',
		);
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
		throw new Error('Invalid tag: ' + tag);
	}
	// Public string descriptors follow HTML's ASCII case-insensitive tag
	// semantics even when the authored spelling is uppercase. Preserve that
	// spelling in the serialized tag, but normalize every behavior/safety check.
	const semanticTag = tag.toLowerCase();
	const iterable = iterableChildArray(children);
	const iterableChildren = iterable !== null;
	if (iterable !== null) children = iterable;
	let attrs = '';
	let innerHTML: unknown = undefined;
	// Controlled form props (mirrors the compiled ssrEmitElement routing):
	// input maps the value/defaultValue and checked/defaultChecked cascades
	// onto the native attributes; textarea routes value/defaultValue into the
	// CONTENT position; select feeds them to the option-projection scope.
	const isCtlTag =
		semanticTag === 'input' || semanticTag === 'textarea' || semanticTag === 'select';
	if (props != null) {
		for (const k in props) {
			const val = props[k];
			// `dangerouslySetInnerHTML` is element CONTENT, not an attribute — capture
			// it here (last write wins) and route everything else through the shared
			// filter/serializer.
			if (k === 'dangerouslySetInnerHTML') {
				innerHTML = val == null || val.__html == null ? '' : val.__html;
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
			attrs += ssrAttrEntry(k, val, semanticTag);
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
	// Controlled <textarea>: the prop IS the content — React's contract
	// (children + defaultValue throws; children + value warns dev-side, the
	// value wins; the compiled path rejects both at compile time).
	if (
		semanticTag === 'textarea' &&
		props != null &&
		(props.value != null || props.defaultValue != null)
	) {
		if (hasChildren && props.value == null) {
			throw new Error('If you supply `defaultValue` on a <textarea>, do not pass children.');
		}
		const inner = ssrTextareaValue(props.value != null ? props.value : props.defaultValue);
		return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
	}
	if (VOID_ELEMENTS.has(semanticTag) && !hasChildren && innerHTML === undefined) {
		return '<' + tag + attrs + '/>';
	}
	let inner = '';
	if (innerHTML !== undefined) {
		const raw = innerHTML == null ? '' : String(innerHTML);
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
		const { childrenNamespace } = parserNamespacesForTag(semanticTag, FRAME?.namespace ?? 'html');
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
	// <option> assembles via ssrOption so an active select scope can mark it
	// ` selected` (its value prop already serialized as a plain attribute).
	if (semanticTag === 'option') {
		return ssrOption(props != null && props.value != null ? props.value : undefined, attrs, inner);
	}
	return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
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
					// The de-opt list's own item range is sufficient for pure host/text
					// values: deoptItemBody adopts/reconciles the node directly inside it.
					// A component-bearing value already contributes the coextensive range
					// borrowed by its nested childSlot; wrapping it again would make hydration
					// mount a duplicate beside the server content.
					return serverDescNeedsBlocks(item)
						? ssrChildValue(item, scope, false)
						: ssrBlock(ssrDescriptorContent(item, scope));
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
		// A Fragment below a host descriptor is reconciled by childSlot's
		// fragment-aware list path, including when all of its leaves are pure hosts.
		if (d.type === Fragment) return true;
		return typeof d.type === 'function' || serverDescNeedsBlocks(d.children);
	}
	return false;
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
	if (typeof v === 'function') return ssrComponent(scope, v as ServerComponent, {});
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
function encodeAsyncIdentityString(value: string): string {
	let encoded = '';
	for (let i = 0; i < value.length; i++) {
		encoded += value.charCodeAt(i).toString(16).padStart(4, '0');
	}
	return encoded;
}

function asyncIdentityKey(value: unknown, objectIs: boolean, positionFallback?: string): string {
	switch (typeof value) {
		case 'string':
			return 's' + encodeAsyncIdentityString(value);
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

/**
 * A dynamic attribute: ` name="value"`, ` name` for `true`, or '' to omit.
 * `tag` (the owning element's tag name, when the emit site knows it) gates the
 * tag-sensitive React-parity rules: custom elements get RAW attribute
 * semantics (no alias, no value tables), and the empty-URL strip exempts
 * `<a>`/`<area>` href. Mirrors the client's setAttribute policies (runtime.ts).
 */
export function ssrAttr(name: string, v: unknown, tag?: string): string {
	const isCustomTag = tag !== undefined && tag.indexOf('-') !== -1;
	// React-parity aliases (ATTRIBUTE_ALIASES, constants.ts): `htmlFor` → `for`,
	// `strokeWidth` → `stroke-width`, `xlinkHref` → `xlink:href`, … — serialize
	// the attribute the browser actually parses, byte-matching the client's
	// setAttribute writes (hydration parity). Custom elements get their props
	// VERBATIM (no alias tables) — React parity.
	if (!isCustomTag) {
		const alias = ATTRIBUTE_ALIASES.get(name);
		if (alias !== undefined) name = alias;
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
	if (name === 'suppressContentEditableWarning' || name === 'suppressHydrationWarning') return '';
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
	if (t === 'function' || t === 'symbol') return '';
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
		if (t === 'boolean') return '';
		if (POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(Number(v) >= 1)) return '';
	}
	if (v == null || v === false) return '';
	const s = v === true ? '' : String(v);
	// An empty `src`/`href` resolves to the CURRENT PAGE's URL — browsers would
	// re-fetch the whole document as an image/script/stylesheet. React strips
	// these; so does the client's setAttribute (element-agnostic, custom
	// elements included — and `true` coerces to '' first, exactly like the
	// client). `<a href="">`/`<area href="">` stays — an empty href is a
	// legitimate "link to this page".
	if (
		s === '' &&
		(name === 'src' || (name === 'href' && tag !== undefined && tag !== 'a' && tag !== 'area'))
	) {
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
		out += styleName(k) + ':' + cssStyleValue(k, val) + ';';
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
function ssrAttrEntry(k: string, v: unknown, tag?: string): string {
	if (k === 'key' || k === 'ref' || k === 'children') return '';
	if (k === 'suppressHydrationWarning' || k === 'suppressContentEditableWarning') return '';
	if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && k[2] >= 'A' && k[2] <= 'Z') return '';
	// `autoFocus` never serializes (client focuses at its mount commit).
	if (k === 'autoFocus' && (tag === undefined || tag.indexOf('-') === -1)) return '';
	// Function/symbol values never serialize (client parity: setAttribute removes
	// them) — stringifying a function would put its SOURCE into the markup.
	if (typeof v === 'function' || typeof v === 'symbol') return '';
	if (k === 'style') return ssrStyle(v);
	if (k === 'className' || k === 'class') return ssrAttr('class', v, tag);
	if (VALID_ATTR_NAME.test(k)) return ssrAttr(k, v, tag);
	return '';
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
		for (const key in source as Record<string, unknown>) {
			if (key === 'class' || key === 'className') {
				found = true;
				value = (source as Record<string, unknown>)[key];
			}
		}
	}
	return found ? ssrAttr('class', value) : '';
}

/** A spread `{...obj}`: serialize attr-like keys; drop events/refs/key/children. */
export function ssrSpread(obj: unknown, tag?: string, skipClass = false): string {
	if (obj == null || typeof obj !== 'object') return '';
	let out = '';
	for (const k in obj as Record<string, unknown>) {
		// When direct and spread class writers coexist, the compiler emits one
		// ssrClass call after all sources. Do not manufacture duplicate native
		// class attributes here: HTML parsing would keep the wrong (first) one.
		if (skipClass && (k === 'class' || k === 'className')) continue;
		// A spread `dangerouslySetInnerHTML` is element content, not an attribute —
		// the compiler collects it at the emit site (compile.js `htmlSources`, which
		// feeds `ssrInnerHtml`), so the attr serializer drops it here.
		if (k === 'dangerouslySetInnerHTML') continue;
		out += ssrAttrEntry(k, (obj as Record<string, unknown>)[k], tag);
	}
	return out;
}

// Pick the effective `dangerouslySetInnerHTML` content from a set of source
// objects given in SOURCE ORDER (explicit `dangerouslySetInnerHTML={…}` attrs and
// spread `.dangerouslySetInnerHTML` values). The LAST present object wins (matching
// the client's last-write-wins ordering); a present-but-null `__html` renders ''.
// Returns undefined when no source is present, so the caller falls back to children.
export function ssrInnerHtml(sources: unknown[]): string | undefined {
	for (let i = sources.length - 1; i >= 0; i--) {
		const s = sources[i] as { __html?: unknown } | null | undefined;
		if (s != null) return s.__html == null ? '' : String(s.__html);
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
export function ssrScriptInnerHtml(sources: unknown[]): string | undefined {
	const html = ssrInnerHtml(sources);
	return html === undefined ? undefined : escapeEntireInlineScriptContent(html);
}

// ---------------------------------------------------------------------------
// Controlled form serialization — the server halves of the client runtime's
// setValue/setChecked/setSelectValue/setDefaultValue helpers (runtime.ts).
// <input> serializes value/checked as attributes (the parser turns them into
// the DOM defaults the client mount would have written); <textarea> emits the
// value as its text content; <select> emits NO attribute — a scope stack lets
// every <option> serialized inside mark itself ` selected`.
// ---------------------------------------------------------------------------

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
 * Controlled `<textarea>` content: escaped text + the leading-newline guard
 * (the parser eats a '\n' right after the opening tag — see ssrTextPre).
 * Mirrors the client's toControlledString (booleans/numbers stringify).
 */
export function ssrTextareaValue(v: unknown): string {
	if (v == null) return '';
	const s = escapeHtml(typeof v === 'string' ? v : String(v));
	return s.charCodeAt(0) === 10 ? '\n' + s : s;
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

// Reverse escapeHtml for an option's TEXT content — the React fallback compare
// key when the option carries no `value` attribute. Only the entities
// escapeHtml produces (& < >) need reversing; order matters (&amp; last).
function unescapeOptionText(s: string): string {
	if (s.indexOf('&') === -1) return s;
	return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Assemble one `<option>`: `attrs` are its serialized attributes (its value
 * attribute included when present), `content` its serialized children,
 * `value` the RAW value prop (undefined = none → the option's flattened text
 * is the compare key, per React). Returns a plain option when no controlled
 * select scope is active.
 */
export function ssrOption(value: unknown, attrs: string, content: string): string {
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
	hooks: Map<ServerHookSlot, HookRec[]>;
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

// The shared useState/useReducer server cell. Getter-free hooks keep Fizz's lean
// queue: the next pass folds actions with that pass's reducer. Getter-enabled
// hooks additionally fold each action into `pendingValue` immediately so index 2
// sees scheduled state synchronously; the next pass adopts it without invoking a
// functional updater or reducer twice.
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
	const key = resolveHookSlot(slot);
	const n = hp.occ.get(key) ?? 0;
	hp.occ.set(key, n + 1);
	let list = hp.hooks.get(key);
	if (list === undefined) hp.hooks.set(key, (list = []));
	let rec = list[n];
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
			rec.queue = [];
			rec.value = getterRec.pendingValue;
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
		css,
		cssEntries: css === null ? null : new Map(css),
		head,
		headLength: head !== null ? head.html.length : 0,
		headHints: head === null ? null : new Set(head.hints),
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
		streamPassBoundaryKeys:
			stream?.activePassBoundaryKeys === null || stream?.activePassBoundaryKeys === undefined
				? null
				: new Set(stream.activePassBoundaryKeys),
		asyncScope: ASYNC_SCOPE,
		streamBoundaries:
			stream === null
				? null
				: Array.from(stream.boundaries, ([key, entry]) => ({
						key,
						entry,
						id: entry.id,
						order: entry.order,
						state: entry.state,
						html: entry.html,
						seeds: entry.seeds.slice(),
						pendingIdOffset: entry.pendingIdOffset,
						ancestors: entry.ancestors.slice(),
						owners: entry.owners.slice(),
						namespace: entry.namespace,
					})),
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
	ASYNC_SCOPE = snapshot.asyncScope;
	if (snapshot.css !== null && snapshot.cssEntries !== null) {
		snapshot.css.clear();
		for (const [hash, sheet] of snapshot.cssEntries) snapshot.css.set(hash, sheet);
	}
	if (snapshot.head !== null && snapshot.headHints !== null) {
		snapshot.head.html = snapshot.head.html.slice(0, snapshot.headLength);
		snapshot.head.hints.clear();
		for (const key of snapshot.headHints) snapshot.head.hints.add(key);
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
	if (stream !== null && snapshot.streamBoundaries !== null) {
		stream.nextId = snapshot.streamNextId;
		if (stream.activePassBoundaryKeys !== null && snapshot.streamPassBoundaryKeys !== null) {
			stream.activePassBoundaryKeys.clear();
			for (const key of snapshot.streamPassBoundaryKeys) stream.activePassBoundaryKeys.add(key);
		}
		stream.activeTryKeys.length = 0;
		stream.activeTryKeys.push(...snapshot.streamActiveTryKeys);
		stream.activeOwnerKeys.length = 0;
		stream.activeOwnerKeys.push(...snapshot.streamActiveOwnerKeys);
		stream.boundaries.clear();
		for (const saved of snapshot.streamBoundaries) {
			const entry = saved.entry;
			entry.id = saved.id;
			entry.order = saved.order;
			entry.state = saved.state;
			entry.html = saved.html;
			entry.seeds = saved.seeds.slice();
			entry.pendingIdOffset = saved.pendingIdOffset;
			entry.ancestors = saved.ancestors.slice();
			entry.owners = saved.owners.slice();
			entry.namespace = saved.namespace;
			stream.boundaries.set(saved.key, entry);
		}
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
function invokeComponentBody(
	comp: ServerComponent,
	props: any,
	scope: SSRScope,
	frame: Frame | null,
): unknown {
	const prevHP = HOOK_PASS;
	const hp: HookPass = { hooks: new Map(), occ: new Map(), update: false };
	const snapshot = captureComponentReplayState(scope, frame);
	HOOK_PASS = hp;
	try {
		let out = comp(props ?? {}, scope, undefined);
		let passes = 1;
		while (hp.update) {
			if (++passes > MAX_RENDER_PHASE_PASSES) {
				throw new Error(
					'Too many re-renders. Octane limits the number of renders to prevent an infinite loop.',
				);
			}
			hp.update = false;
			hp.occ = new Map();
			rewindComponentReplayState(snapshot, scope, frame);
			out = comp(props ?? {}, scope, undefined);
		}
		return out;
	} finally {
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
	try {
		// The compiled body normally returns its HTML string, but a component that
		// early-returns non-template JSX (the de-opt path — e.g. a `.tsx` `if (…)
		// return <div/>`) returns a `createElement` DESCRIPTOR / array / primitive
		// instead, mirroring the client where such a return flows through the block's
		// childSlot. Normalize it the same way (ssrChild = the server childSlot), or it
		// would stringify to `[object Object]`.
		// Every component gets an independent replay boundary. A body with no
		// syntactic calls can still execute user code through a getter, Proxy, or
		// coercion; that code may call hooks or schedule render-phase updates.
		const out = invokeComponentBody(comp, props, scope, frame);
		const inner = typeof out === 'string' ? out : out == null ? '' : ssrChild(out, scope);
		// Wrap the child's output in a hydration block range so the client's
		// componentSlot can ADOPT it during hydration (its `<!--[-->`/`<!--]-->`
		// become the slot's start/end markers, exactly like control-flow blocks).
		// `renderToStaticMarkup` sets MARKERS=false — no hydration, so no markers.
		// An inherit-range site (M3) skips the wrap: the parent's own pair bounds
		// this output, and the client borrows it instead of adopting.
		return MARKERS && !inherit ? BLOCK_OPEN + inner + BLOCK_CLOSE : inner;
	} finally {
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
	comp: ServerComponent | string,
	props: any,
	inherit?: boolean,
	key?: unknown,
	identityScoped?: boolean,
): string {
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
		// Boundary builtins decline inherit by IDENTITY — mirrors componentSlot's
		// client-side decline exactly (member/aliased/dynamic tags resolving to
		// Suspense/ErrorBoundary/ViewTransition keep their pair; both sides agree
		// by identity).
		if (
			inherit === true &&
			(comp === Suspense || comp === ErrorBoundary || comp === ViewTransition)
		)
			inherit = false;
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
			const inheritedNamespace = explicitNamespace ?? FRAME?.namespace ?? 'html';
			const childNamespace = parserNamespacesForTag(
				comp.toLowerCase(),
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
					const html = ssrHostElement(comp, props, null, parent, inner);
					return inherit ? html : ssrBlock(html);
				}
				const html = ssrHostElement(comp, props, kids, parent);
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
		return renderComponentFramed(comp, props, parent, frame, inherit);
	} finally {
		if (identityScoped !== true) ASYNC_SCOPE = previousIdentityScope;
	}
}

let NEXT_COMPONENT_NAMESPACE: 'html' | 'svg' | 'mathml' | null = null;

/** Compiler ABI for a component call whose output is parsed in foreign content. */
export function ssrComponentNS(
	parent: SSRScope,
	comp: ServerComponent | string,
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
export function Suspense(
	props: { fallback?: unknown; children?: unknown },
	scope: SSRScope,
): string {
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
}

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

/**
 * Inject `vt-*` attributes into the FIRST element open-tag of an HTML
 * fragment, skipping block/comment markers and streaming `<template>`
 * placeholders (the annotation belongs on the visible fallback root that
 * follows). Attributes already present (an inner boundary annotated first —
 * innermost owns vt-update) are left alone.
 */
function vtSsrAnnotate(html: string, attrs: Array<[string, string]>): string {
	const n = html.length;
	let i = 0;
	while (i < n) {
		const lt = html.indexOf('<', i);
		if (lt === -1) return html;
		if (html.startsWith('<!--', lt)) {
			const close = html.indexOf('-->', lt + 4);
			if (close === -1) return html;
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
		const tag = html.slice(lt + 1, e).toLowerCase();
		// End of the open tag — quote-aware ('>' may appear inside attr values).
		let j = e;
		let q = '';
		while (j < n) {
			const ch = html[j];
			if (q !== '') {
				if (ch === q) q = '';
			} else if (ch === '"' || ch === "'") q = ch;
			else if (ch === '>') break;
			j++;
		}
		if (j >= n) return html;
		if (tag === 'template') {
			const close = html.indexOf('</template>', j);
			i = close === -1 ? j + 1 : close + 11;
			continue;
		}
		const open = html.slice(lt, j);
		let inject = '';
		for (let k = 0; k < attrs.length; k++) {
			if (open.indexOf(attrs[k][0] + '="') === -1) {
				inject += ' ' + attrs[k][0] + '="' + escapeAttr(attrs[k][1]) + '"';
			}
		}
		if (inject === '') return html;
		const at = html[j - 1] === '/' ? j - 1 : j;
		return html.slice(0, at) + inject + html.slice(at);
	}
	return html;
}

/**
 * Claim an arm-top candidate: rename `vt-enter-x`/`vt-exit-x` → `vt-enter`/
 * `vt-exit` on the FIRST element of an arm's HTML (same template/comment
 * skipping as vtSsrAnnotate). A first element without the candidate (e.g. a
 * static wrapper above the boundary, or an outer boundary's annotation target)
 * claims nothing — that is exactly React's "top of the arm only" rule.
 */
function vtSsrClaimArm(html: string, kind: 'enter' | 'exit'): string {
	const n = html.length;
	let i = 0;
	while (i < n) {
		const lt = html.indexOf('<', i);
		if (lt === -1) return html;
		if (html.startsWith('<!--', lt)) {
			const close = html.indexOf('-->', lt + 4);
			if (close === -1) return html;
			i = close + 3;
			continue;
		}
		const c = html.charCodeAt(lt + 1);
		if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) {
			i = lt + 1;
			continue;
		}
		let e = lt + 1;
		while (e < n && /[a-zA-Z0-9-]/.test(html[e])) e++;
		const tag = html.slice(lt + 1, e).toLowerCase();
		let j = e;
		let q = '';
		while (j < n) {
			const ch = html[j];
			if (q !== '') {
				if (ch === q) q = '';
			} else if (ch === '"' || ch === "'") q = ch;
			else if (ch === '>') break;
			j++;
		}
		if (j >= n) return html;
		if (tag === 'template') {
			const close = html.indexOf('</template>', j);
			i = close === -1 ? j + 1 : close + 11;
			continue;
		}
		const marker = ' vt-' + kind + '-x="';
		const at = html.slice(lt, j).indexOf(marker);
		if (at === -1) return html;
		return html.slice(0, lt + at) + ' vt-' + kind + '="' + html.slice(lt + at + marker.length);
	}
	return html;
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
export function ViewTransition(props: VtSsrProps, scope: SSRScope): string {
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
}

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
export function ErrorBoundary(
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
				if (ssrIsSuspense(e)) throw e; // let an outer Suspense render its pending arm
				const fb =
					typeof props.fallback === 'function'
						? (props.fallback as (err: unknown, reset: () => void) => unknown)(e, NOOP)
						: props.fallback;
				return withAsyncIdentity('error-boundary', 'catch', () => ssrBlock(ssrChild(fb, scope)));
			}
		})(),
	);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CONTEXT_TAG = Symbol.for('octane.context');

// NOTE: unlike the client runtime's Context, there is no `$$version` here — that
// field drives the client's provider-change invalidation machinery, which has no
// server analogue (an SSR pass reads each provider value exactly once, top-down).
export interface Context<T> {
	$$kind: typeof CONTEXT_TAG;
	defaultValue: T;
	Provider: (props: { value: T; children?: any }, scope: SSRScope) => string;
}

export function createContext<T>(defaultValue: T): Context<T> {
	const ctx = { $$kind: CONTEXT_TAG, defaultValue } as Context<T>;
	ctx.Provider = function ProviderBody(props, scope) {
		if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
		scope.$$ctxValues.set(ctx, props.value);
		const children = props.children;
		if (children == null) return '';
		// `.tsrx` threads children as a render function (call it directly). `.tsx`
		// `<Ctx.Provider>…</Ctx.Provider>` lowers to `createElement(Provider, {}, …)`,
		// so children arrive as a descriptor / array / primitive — render whichever
		// shape through the generic child serializer (the same path every other
		// descriptor child uses), or direct-JSX provider SSR would drop its content.
		return typeof children === 'function'
			? (children(undefined, scope) ?? '')
			: ssrChild(children, scope);
	};
	return ctx;
}

function readContext<T>(ctx: Context<T>): T {
	for (let s = CURRENT_SCOPE; s !== null; s = s.parent) {
		if (s.$$ctxValues !== null && s.$$ctxValues.has(ctx)) return s.$$ctxValues.get(ctx) as T;
	}
	return ctx.defaultValue;
}

export function useContext<T>(ctx: Context<T>): T {
	return readContext(ctx);
}

// Sentinel thrown by `use(thenable)` on the server when the value isn't resolved
// yet. The nearest `@try` catches it and renders its `@pending` fallback (see the
// compiler's ssrEmitTry) for this pass; render()'s loop then awaits the thenable
// and re-renders. Distinct from real errors, which route to `@catch`.
const SSR_SUSPENSE = Symbol('octane.ssr.suspense');
export function ssrIsSuspense(err: unknown): boolean {
	return err === SSR_SUSPENSE;
}

type HydrationRejectionPayload =
	| { kind: 'value'; value?: unknown }
	| { kind: 'number'; value: 'NaN' | 'Infinity' | '-Infinity' | '-0' }
	| { kind: 'bigint'; value: string }
	| { kind: 'symbol'; value: string }
	| { kind: 'error'; name: string; message: string; fields: Record<string, unknown> }
	| { kind: 'fallback'; message: string };

const HYDRATION_REJECTION_SEED = Symbol('octane.ssr.hydration-rejection-seed');
interface HydrationRejectionSeed {
	[HYDRATION_REJECTION_SEED]: HydrationRejectionPayload;
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
					if (Object.prototype.hasOwnProperty.call(arrayValue, i)) {
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
		return { kind: 'fallback', message: 'Server-rendered use() rejected' };
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
		let message = 'Server-rendered use() rejected';
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
		return { kind: 'fallback', message: 'Server-rendered use() rejected (function)' };
	}
	return { kind: 'value', value: reasonSnapshot(reason) };
}

function hydrationRejectionSeed(reason: unknown): HydrationRejectionSeed {
	return { [HYDRATION_REJECTION_SEED]: hydrationRejectionPayload(reason) };
}

function isHydrationRejectionSeed(value: unknown): value is HydrationRejectionSeed {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.prototype.hasOwnProperty.call(value, HYDRATION_REJECTION_SEED)
	);
}

function recordHydrationRejection(reason: unknown): void {
	if (SERIAL !== null) SERIAL.push(hydrationRejectionSeed(reason));
}

export function use<T>(usable: Context<T> | PromiseLike<T>, siteKey?: symbol | string): T;
export function use<T>(usable: Context<T> | PromiseLike<T>, siteKey?: ServerHookSlot): T {
	if (usable && (usable as any).$$kind === CONTEXT_TAG) return readContext(usable as Context<T>);
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
			if ('reason' in entryT) {
				recordHydrationRejection(entryT.reason);
				throw entryT.reason;
			}
			if (SERIAL !== null) SERIAL.push(entryT.value);
			return entryT.value as T;
		}
	}
	const resolved = RESOLVED;
	if (resolved !== null && resolved.has(key)) {
		const entry = resolved.get(key)!;
		// Rejected on a prior pass → throw so the enclosing @try renders @catch.
		// Serialize a typed rejection seed first so hydration takes the same catch
		// arm even when the client receives a fresh, still-pending thenable.
		if ('reason' in entry) {
			recordHydrationRejection(entry.reason);
			throw entry.reason;
		}
		// Resolved → return it, and record it (in render order) for client seeding.
		if (SERIAL !== null) SERIAL.push(entry.value);
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
		if (SERIAL !== null) SERIAL.push(instrumented.value);
		return instrumented.value as T;
	}
	if (status === 'rejected') {
		recordHydrationRejection(instrumented.reason);
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
			if (SERIAL !== null) SERIAL.push(instrumented.value);
			return instrumented.value as T;
		}
		if (status === 'rejected') {
			recordHydrationRejection(instrumented.reason);
			throw instrumented.reason;
		}
	}
	if (!wasUninstrumented && typeof status === 'string') {
		instrumented.then(NOOP, NOOP);
		status = instrumented.status;
		if (status === 'fulfilled') {
			if (SERIAL !== null) SERIAL.push(instrumented.value);
			return instrumented.value as T;
		}
		if (status === 'rejected') {
			recordHydrationRejection(instrumented.reason);
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
function puDepsEqual(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
	return true;
}

// Synthetic SUSPENDED keys for batch registrations — their outcomes are
// consumed via resolvedT identity, never via this key; it only needs to be
// unique so the settle loops' per-key dedupe doesn't conflate entries.
let PU_ID = 0;

/**
 * Cross-pass creation cache. Keyed like use(): frame path + compiler site key
 * + per-frame occurrence, so the key is identical between the pass a boundary
 * first renders, its discovery re-runs, and the final full pass. A hit with
 * equal deps returns the PRIOR pass's value — for a fetch creation that means
 * the same in-flight/settled promise instance, which is what lets puBatch and
 * use() resolve by identity and what stops re-runs duplicating network calls.
 */
export function puMemo<T>(fn: () => T, deps: unknown[], siteKey?: ServerHookSlot): T {
	const res = RESOLVED as ResolvedMap | null;
	if (res === null) return fn();
	const base =
		siteKey === undefined
			? '@pu'
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
	const hit = res.pu.created.get(key);
	if (hit !== undefined && puDepsEqual(hit.deps, deps)) return hit.value as T;
	// Warm adoption: a parent's warm walk may have prefetched this creation
	// (keyed by the shared slot symbol). Deps must match — a drift between the
	// warm-time and render-time props is a clean miss (the orphaned entry dies
	// with the render). TRANSFER: the entry moves into the frame-keyed created
	// cache so later passes hit it directly.
	if (siteKey !== undefined) {
		const wlist = res.pu.warm.get(siteKey);
		if (wlist !== undefined) {
			for (let i = 0; i < wlist.length; i++) {
				if (puDepsEqual(wlist[i].deps, deps)) {
					const value = wlist[i].value;
					wlist.splice(i, 1);
					res.pu.created.set(key, { deps, value });
					return value as T;
				}
			}
		}
	}
	const value = fn();
	res.pu.created.set(key, { deps, value });
	return value;
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
	const res = RESOLVED as ResolvedMap | null;
	const pu = res !== null ? res.pu : null;
	let pending = false;
	for (let i = 0; i < thenables.length; i++) {
		const t = thenables[i] as PromiseLike<unknown> | null | undefined;
		if (t == null || typeof (t as any).then !== 'function') continue;
		if (pu !== null && pu.resolvedT.has(t)) continue;
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
		if (SUSPENDED !== null) SUSPENDED.push({ promise: t, key: '|pu#' + PU_ID++ });
	}
	if (!pending) return;
	// About to suspend — run the warm walk first (the compiler passes the thunk
	// on the FIRST in-body batch): descendant components' independent creations
	// start AND register with this round via warmMemo, so their data resolves
	// before their bodies ever run — component depth collapses to true
	// data-dependency depth. Speculative: a throwing plan just means fewer
	// prefetches.
	if (warm !== undefined) {
		try {
			warm();
		} catch {
			/* speculative */
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
const WARM_SLOT_CAP = 64;

/**
 * Start (and cache) one prefetched creation from a component's compiled fetch
 * plan (`Comp.__warm`). Dedups on (slot, deps) so a re-warm during a later
 * suspending pass never double-starts a fetch. The resulting thenable is
 * REGISTERED with the render loop so the current round awaits it — that is
 * the whole point: the descendant's data settles before its body runs, and
 * its unwraps then resolve by identity (resolvedT). Speculative: a throwing
 * creation is simply not warmed.
 */
export function warmMemo(compute: () => unknown, deps: unknown[], slot: ServerHookSlot): void {
	const res = RESOLVED;
	if (res === null) return;
	const warm = res.pu.warm;
	let list = warm.get(slot);
	if (list !== undefined) {
		for (let i = 0; i < list.length; i++) {
			if (puDepsEqual(list[i].deps, deps)) return; // already warmed
		}
	}
	let value: unknown;
	try {
		value = compute();
	} catch {
		return;
	}
	if (list === undefined) {
		list = [];
		warm.set(slot, list);
	}
	list.push({ deps, value });
	if (list.length > WARM_SLOT_CAP) list.shift();
	if (
		value != null &&
		typeof (value as any).then === 'function' &&
		!res.pu.resolvedT.has(value as PromiseLike<unknown>)
	) {
		if (SUSPENDED !== null)
			SUSPENDED.push({ promise: value as PromiseLike<unknown>, key: '|pu#' + PU_ID++ });
	}
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

function lazyResolvedProps(comp: ServerComponent, props: any): any {
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

function resolveLazyModule(mod: any): ServerComponent {
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

export function useMemo<T>(compute: (...deps: any[]) => T, deps?: any[] | null | symbol): T {
	// deps may be a real array, omitted, or (per the trailing-slot ABI) a symbol.
	const d = Array.isArray(deps) ? deps : [];
	return compute.apply(null, d);
}

export function useCallback<F>(fn: F): F {
	return fn;
}

export function useRef<T = undefined>(): { current: T | undefined };
export function useRef<T>(initial: T, slot?: symbol): { current: T };
export function useRef<T>(initial?: T, slot?: ServerHookSlot): { current: T | undefined } {
	// A spread-shaped zero-argument call cannot be padded positionally, so the
	// compiler retains the self-identifying Symbol ABI: `useRef(slot)`.
	if (slot === undefined && typeof initial === 'symbol') initial = undefined;
	return { current: initial };
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
	throw new Error("A function wrapped in useEffectEvent can't be called during rendering.");
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

export function injectStyle(id: string, css: string): void {
	if (CSS !== null) CSS.set(id, css);
}

// Compiler-emitted for each hoisted `<title>`/`<meta>`/`<link>` (rendered
// anywhere in a component). Serializes the element — prefixed with a `<!--key-->`
// marker the client's headBlock adopts — into the active render pass's head
// buffer (null-guarded like injectStyle, so it only collects during a
// synchronous pass). Returned as RenderResult.head and injected at <!--ssr-head-->.
const HEAD_VOID_ELEMENTS = new Set(['meta', 'link', 'base']);

export function ssrHeadEl(
	key: string,
	tag: string,
	attrs: Record<string, unknown> | null,
	text: unknown,
): void {
	if (HEAD === null) return;
	// The `<!--key-->` prefix is the client headBlock's adoption marker; static
	// markup is non-hydratable, so it's omitted there.
	let s = (MARKERS ? '<!--' + key + '-->' : '') + '<' + tag;
	if (attrs !== null) {
		for (const k in attrs) {
			const v = attrs[k];
			if (v == null || v === false) continue;
			// on* event props reach us since the compiler passes them through for the
			// client headBlock's direct listeners — no server semantics, never serialize
			// (a function value must not stringify into markup).
			if (typeof v === 'function' || (k.length > 2 && k[0] === 'o' && k[1] === 'n')) continue;
			// An empty src/href would make the browser fetch/resolve the page itself
			// (`<link href="">`, `<base href="">`) — strip like ssrAttr does; head
			// tags are never <a>/<area>, so the href exemption doesn't apply here.
			if (v === '' && (k === 'src' || k === 'href')) continue;
			if (v === true) {
				s += ' ' + k;
			} else {
				const value = typeof v === 'string' ? v : String(v);
				s += ' ' + k + '="' + escapeAttr(sanitizeURLAttribute(tag, k, value)) + '"';
			}
		}
	}
	if (HEAD_VOID_ELEMENTS.has(tag)) {
		s += '>';
	} else {
		s += '>' + (text == null ? '' : escapeHtml(text)) + '</' + tag + '>';
	}
	HEAD.html += s;
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
 *   resources into the document too, so there is no separate `head` channel.)
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
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (!isHydrationRejectionSeed(value)) continue;
		wireValues ??= values.slice();
		rejections ??= [];
		wireValues[i] = null;
		rejections.push([i, value[HYDRATION_REJECTION_SEED]]);
	}
	// Successful seeds retain the established compact array format. Rejections
	// use renderer-owned TOP-LEVEL metadata, so a fulfilled user value shaped
	// like the old in-band sentinel can never be mistaken for control data.
	const payload =
		rejections === null
			? values
			: {
					[REJECTION_SENTINEL_KEY]: {
						version: 1,
						values: wireValues!,
						rejections,
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
	return (
		'<script type="application/json" ' + SUSPENSE_SCRIPT_ATTR + nonceAttr + '>' + json + '</script>'
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
type SuspenseOutcome = { value: unknown } | { reason: unknown };
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
	/** Render-local stable ids for non-primitive control/list keys. */
	asyncIdentities: Map<unknown, number>;
	/** Cross-pass fallback ids for transient object keys at one lexical position. */
	asyncPositionIdentities: Map<string, number>;
	nextAsyncIdentity: number;
	/** Lazily allocated DEV SSR invalid-nesting warnings reported by this render. */
	nestingWarnings?: Set<string>;
	pu: {
		created: Map<string, { deps: unknown[]; value: unknown }>;
		resolvedT: Map<PromiseLike<unknown>, SuspenseOutcome>;
		// Warm-walk prefetches (warmMemo), keyed by the creation's SLOT symbol —
		// deps-matched, TRANSFER semantics: the descendant's real puMemo adopts
		// (and removes) its entry, so a warmed fetch is consumed exactly once.
		warm: Map<ServerHookSlot, { deps: unknown[]; value: unknown }[]>;
	};
};
function newResolvedMap(): ResolvedMap {
	const m = new Map() as ResolvedMap;
	m.asyncIdentities = new Map();
	m.asyncPositionIdentities = new Map();
	m.nextAsyncIdentity = 0;
	m.pu = { created: new Map(), resolvedT: new Map(), warm: new Map() };
	return m;
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
	cssEntries: Map<string, string>;
}

// Snapshot / install / restore the module globals around ONE synchronous pass
// (or discovery round). Everything a pass touches lives here so a concurrent
// render() that interleaves across our `await` can't observe or clobber our
// in-flight pass — the globals are always restored before we yield the tick.
interface Ambient {
	scope: SSRScope | null;
	id: number;
	idPrefix: string;
	css: Map<string, string> | null;
	markers: boolean;
	head: HeadBuffer | null;
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
		id: ID_COUNTER,
		idPrefix: ID_PREFIX,
		css: CSS,
		markers: MARKERS,
		head: HEAD,
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
	CURRENT_SCOPE = a.scope;
	ID_COUNTER = a.id;
	ID_PREFIX = a.idPrefix;
	CSS = a.css;
	MARKERS = a.markers;
	HEAD = a.head;
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
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	ASYNC_SCOPE = '';
	MARKERS = markers;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	const cssMap = (CSS = new Map<string, string>());
	const headBuf = (HEAD = { html: '', hints: new Set() });
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
	try {
		// Normalize the root's return the same way ssrComponent normalizes child
		// components: a compiled component returns its HTML string, but a plain
		// `.ts` root (the shape every @octanejs binding produces) returns a
		// createElement descriptor that must render through ssrChild.
		const out = invokeComponentBody(component, props, root, FRAME);
		body = typeof out === 'string' ? out : out == null ? '' : ssrChild(out, root);
	} catch (err) {
		// A suspension with no enclosing @try unwinds to here; its thenable is
		// already in `suspended`, so fall through to the await + retry. Any other
		// throw is a genuine render failure — propagate it (the finally restores).
		if (!ssrIsSuspense(err)) throw err;
		rootSuspended = true;
	} finally {
		vtCandidates = VT_SSR_HAS_CANDIDATES;
		restoreAmbient(saved);
	}
	let css = '';
	for (const [hash, sheet] of cssMap) {
		css +=
			'<style data-octane="' +
			hash +
			'"' +
			nonceAttr +
			'>' +
			escapeEntireInlineStyleContent(sheet) +
			'</style>';
	}
	return {
		body,
		head: headBuf.html,
		css,
		serial,
		suspended,
		deferred,
		rootSuspended,
		vtCandidates,
		cssEntries: cssMap,
	};
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
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	ASYNC_SCOPE = '';
	MARKERS = true;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	CSS = new Map();
	HEAD = { html: '', hints: new Set() };
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
				timer = setTimeout(
					() =>
						reject(
							new Error('octane SSR: a use(thenable) did not settle within ' + timeoutMs + 'ms.'),
						),
					timeoutMs,
				);
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
	const settleAll = Promise.all(
		suspended.map(async ({ promise, key }) => {
			if (resolved.has(key)) return;
			// Batch registrations ('|pu#…' synthetic keys) resolve at their unwrap
			// sites by IDENTITY; plain use() entries stay string-key-only so their
			// occurrence-keyed semantics are untouched by the mirror.
			const isPu = key.charCodeAt(0) === 124 /* '|' */ && key.startsWith('|pu#');
			try {
				const outcome = { value: await promise };
				resolved.set(key, outcome);
				if (isPu) pu.resolvedT.set(promise, outcome);
			} catch (reason) {
				const outcome = { reason };
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
	const recorders: Promise<void>[] = [];
	for (const { promise, key } of suspended) {
		if (resolved.has(key)) continue;
		const isPu = key.startsWith('|pu#');
		recorders.push(
			(async () => {
				try {
					const value = await promise;
					if (!resolved.has(key)) resolved.set(key, { value });
					if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, { value });
				} catch (reason) {
					if (!resolved.has(key)) resolved.set(key, { reason });
					if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, { reason });
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

// The await-everything render core. Runs full canonical passes interleaved with
// cheap discovery rounds until nothing suspends, then returns the final pass —
// so every `use(thenable)` is resolved and the @try success arms are rendered.
// Used by `prerender` (React's static API).
async function runBuffered(
	component: ServerComponent,
	props: any,
	options: RenderOptions | undefined,
	nonceAttr: string,
): Promise<FullPassResult> {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const identifierPrefix = options?.identifierPrefix ?? '';
	// The suspense cache persists across this render's passes; it is render-local
	// (never a module global) so concurrent renders can't share it.
	const resolved: ResolvedMap = newResolvedMap();
	let attempt = 0;
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
				const err = new Error(
					'octane SSR: exceeded ' +
						MAX_SUSPENSE_PASSES +
						' suspense passes — a use(thenable) never resolved.',
				);
				options?.onError?.(err);
				throw err;
			}
			await settleSuspended(pending, resolved, timeoutMs, signal);
			if (jobs.length === 0 || !jobs.every((j) => j.frame.parent !== null)) break;
			const round = withStream(null, () => runDiscoveryRound(jobs, resolved, identifierPrefix));
			if (round.suspended.length === 0) break; // fully discovered → next full pass is canonical
			pending = round.suspended;
			jobs = round.deferred;
		}
		// Loop → another full canonical pass with the now-populated cache. If it
		// still suspends (a nondeterministic render whose keys shift), it simply
		// makes progress via more full passes, bounded by MAX_SUSPENSE_PASSES.
	}
}

/** Turn a completed pass into the `{ html, css }` result (head folded in, seeds appended). */
function passToResult(pass: FullPassResult, nonceAttr: string): RenderResult {
	let body = pass.body;
	if (pass.serial.length > 0) body += serializeSuspenseSeeds(pass.serial, nonceAttr);
	// Unclaimed view-transition arm candidates strip at emission (see vtSsrStrip).
	const html = spliceHead(body, pass.head);
	return { html: pass.vtCandidates ? vtSsrStrip(html) : html, css: pass.css };
}

/**
 * React `react-dom/static` `prerender` — await ALL data (Suspense boundaries
 * resolve to their success arm), then return the complete `{ html, css }`. Use
 * for SSG / any place that wants fully-resolved HTML with no client fallback.
 * This is the buffered, await-everything behaviour of the old `render()`.
 */
export async function prerender(
	component: ServerComponent,
	props?: any,
	options?: RenderOptions,
): Promise<RenderResult> {
	const nonceAttr = nonceAttrOf(options);
	return passToResult(await runBuffered(component, props, options, nonceAttr), nonceAttr);
}

/**
 * React `react-dom/server` `renderToString` — a SINGLE synchronous pass, no
 * awaiting. A Suspense boundary that suspends renders its fallback (the inline
 * `@try`/`@pending` arm); a bare `use(thenable)` with no enclosing boundary ends
 * the render early (its partial output is returned). Synchronously-resolved
 * `use()` in the shell still seeds. Use `prerender` when you need the data awaited.
 */
export function renderToString(
	component: ServerComponent,
	props?: any,
	options?: RenderOptions,
): RenderResult {
	options?.signal?.throwIfAborted();
	const nonceAttr = nonceAttrOf(options);
	const resolved: ResolvedMap = newResolvedMap();
	let pass: FullPassResult;
	try {
		pass = withStream(null, () =>
			runFullFramedPass(component, props, resolved, nonceAttr, options?.identifierPrefix ?? ''),
		);
	} catch (err) {
		options?.onError?.(err);
		throw err;
	}
	return passToResult(pass, nonceAttr);
}

/**
 * React `react-dom/server` `renderToStaticMarkup` — a single synchronous pass
 * producing clean, NON-hydratable HTML: no `<!--[-->`/`<!--]-->` block markers,
 * no head-adoption markers, no suspense seed script. For static pages / email.
 */
export function renderToStaticMarkup(
	component: ServerComponent,
	props?: any,
	options?: RenderOptions,
): RenderResult {
	options?.signal?.throwIfAborted();
	const nonceAttr = nonceAttrOf(options);
	const resolved: ResolvedMap = newResolvedMap();
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
	}
	// No seeds (non-hydratable). Head is folded in without adoption markers.
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
//   - Head elements hoisted from INSIDE a streamed boundary don't ship in the
//     stream (the shell's head already flushed); the client re-creates them on
//     hydration via headBlock.
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
	/** Inner branch-range html (`<!--[-->…<!--]-->`) from the resolving pass. */
	html: string;
	/** This boundary's `use()` seed slice from the resolving pass. */
	seeds: unknown[];
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
	nextId: number;
	token: string;
	/** Boundary positions reached by the active full-tree pass, when tracked. */
	activePassBoundaryKeys: Set<string> | null;
	/** Content-arm nesting while the synchronous pass walks `ssrTry` calls. */
	activeTryKeys: string[];
	/** All arm owners (content/catch/fallback) while walking nested `ssrTry` calls. */
	activeOwnerKeys: string[];
}

// Every boundary id includes a render-unique token. The counter proves
// uniqueness for every stream produced by this module instance; the realm salt
// prevents a second bundled copy/server isolate from restarting at the same
// wire id when their output is composed into one document. IDs deliberately
// expose no structure the client relies on — discovery order lives separately.
const STREAM_REALM_SALT = (() => {
	const crypto = (globalThis as any).crypto as { randomUUID?: () => string } | undefined;
	const entropy =
		crypto?.randomUUID?.().replace(/-/g, '') ??
		Date.now().toString(36) + Math.random().toString(36).slice(2);
	return entropy.replace(/[^a-zA-Z0-9_-]/g, '');
})();
let NEXT_STREAM_TOKEN = 0;

function createStreamToken(): string {
	return 'os' + STREAM_REALM_SALT + '-' + (NEXT_STREAM_TOKEN++).toString(36);
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
	catchFn: ((err: unknown, scope: SSRScope) => string) | null,
	namespace: 'html' | 'svg' | 'mathml' = FRAME?.namespace ?? 'html',
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
	let serialStart = 0;
	let ancestorKeys: string[] = [];
	let ownerKeys: string[] = [];
	if (stream !== null) {
		stream.activePassBoundaryKeys?.add(key);
		ancestorKeys = stream.activeTryKeys.slice();
		ownerKeys = stream.activeOwnerKeys.slice();
		entry = stream.boundaries.get(key);
		if (entry !== undefined) entry.namespace = namespace;
		if (entry !== undefined && entry.state === 'pending') {
			entry.ancestors = ancestorKeys;
			entry.owners = ownerKeys;
		}
		serialStart = SERIAL !== null ? SERIAL.length : 0;
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
			if (stream === null) return fn();
			stream.activeOwnerKeys.push(key);
			try {
				return fn();
			} finally {
				stream.activeOwnerKeys.pop();
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
	const pendingForm = (): string => {
		// A ViewTransition at the top of the FALLBACK arm exits when the boundary
		// reveals — claim its vt-exit candidate (see vtSsrClaimArm).
		const renderFallback = (): string =>
			withPendingArm(() =>
				pendFn !== null ? vtSsrClaimArm(ssrBlock(pendFn(undefined, scope)), 'exit') : '',
			);
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
			const deferredStart = DEFERRED?.length ?? 0;
			const serialStart = SERIAL?.length ?? 0;
			const css = CSS;
			const cssSnapshot = css === null ? null : new Map(css);
			const head = HEAD;
			const headHtml = head?.html;
			const headHints = head === null ? null : new Set(head.hints);
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
				if (!ssrIsSuspense(error)) throw error;
				fallback = '';
			} finally {
				if (SUSPENDED !== null) SUSPENDED.length = suspendedStart;
				if (DEFERRED !== null) DEFERRED.length = deferredStart;
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (css !== null && cssSnapshot !== null) {
					css.clear();
					for (const [hash, sheet] of cssSnapshot) css.set(hash, sheet);
				}
				if (head !== null && headHints !== null) {
					head.html = headHtml!;
					head.hints.clear();
					for (const hint of headHints) head.hints.add(hint);
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
		return ssrBlock(pendFn !== null ? fallback : '');
	};
	try {
		try {
			// A ViewTransition at the top of the CONTENT arm enters when the content
			// streams in — claim its vt-enter candidate.
			const inner = vtSsrClaimArm(ssrBlock(withContentArm(() => tryFn(undefined, scope))), 'enter');
			if (entry !== undefined) {
				// Registered (was pending in an earlier pass): capture the content +
				// this boundary's seed slice for its segment; the surrounding pass
				// keeps seeing the pending form so the shell shape stays stable.
				if (entry.state === 'pending') {
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
						entry.seeds = SERIAL.slice(serialStart);
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
			return ssrBlock(inner);
		} catch (e) {
			if (ssrIsSuspense(e)) {
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
							html: '',
							seeds: [],
							pendingIdOffset,
							namespace,
							ancestors: ancestorKeys,
							owners: ownerKeys,
						};
						stream.boundaries.set(key, entry);
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
				const caughtSeeds = entry !== undefined && SERIAL !== null ? SERIAL.slice(serialStart) : [];
				if (entry !== undefined && SERIAL !== null) SERIAL.length = serialStart;
				const inner = ssrBlock(withCatchArm(() => catchFn(e, scope)));
				if (entry !== undefined) {
					if (entry.state !== 'done') {
						if (SERIAL !== null) {
							caughtSeeds.push(...SERIAL.slice(serialStart));
							SERIAL.length = serialStart;
						}
						entry.state = 'done';
						entry.html = inner;
						entry.seeds = caughtSeeds;
						pruneUnrepresentedStreamDescendants(stream!, key, entry.html);
					} else if (SERIAL !== null) {
						SERIAL.length = serialStart;
					}
					ID_COUNTER = entry.pendingIdOffset;
					return pendingForm();
				}
				return ssrBlock(inner);
			}
			if (stream !== null) {
				// Fizz keeps a Suspense shell valid when its primary content throws:
				// publish the fallback, report the error, and mark this boundary for a
				// client render. Buffered renderers still rethrow below because they have
				// no progressive recovery channel.
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (entry === undefined) {
					const pendingIdOffset = Math.max(0, ID_COUNTER - outerIdCounter);
					restoreOuterIds();
					const order = stream.nextId++;
					entry = {
						id: stream.token + '-' + order.toString(36),
						order,
						state: 'errored',
						error: e,
						html: '',
						seeds: [],
						pendingIdOffset,
						namespace,
						ancestors: ancestorKeys,
						owners: ownerKeys,
					};
					stream.boundaries.set(key, entry);
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
// boundary errored (hydration client-renders it via mismatch recovery).
const STREAM_RUNTIME_JS =
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
	'window.$OCTRX=function(id){' +
	"var t=d.querySelector('template[" +
	STREAM_BOUNDARY_ATTR +
	"=\"'+id+'\"]');" +
	'if(t)t.setAttribute("data-oct-err","");};' +
	'})();';

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

export interface StreamOptions extends RenderOptions {
	onShellReady?: () => void;
	onShellError?: (err: unknown) => void;
	onAllReady?: () => void;
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

function segmentChunk(b: StreamBoundary, nonceAttr: string): string {
	let seedScript = '';
	if (b.seeds.length > 0) {
		const json = serializeSuspenseSeedJson(b.seeds);
		seedScript =
			'<script type="application/json" ' + STREAM_SEED_ATTR + nonceAttr + '>' + json + '</script>';
	}
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
	// template in $OCTRC instead; `<` escaping makes the data script uncloseable.
	const payload = JSON.stringify(content).replace(/</g, '\\u003c');
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

function boundaryErrorChunk(b: StreamBoundary, nonceAttr: string): string {
	return (
		'<script ' +
		STREAM_SCRIPT_ATTR +
		nonceAttr +
		'>$OCTRX(' +
		JSON.stringify(b.id).replace(/</g, '\\u003c') +
		')</script>'
	);
}

/** The shared streaming engine both public APIs drive. */
async function runStream(
	component: ServerComponent,
	props: any,
	options: StreamOptions | undefined,
	sink: StreamSink,
): Promise<void> {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const nonceAttr = nonceAttrOf(options);
	const identifierPrefix = options?.identifierPrefix ?? '';
	const resolved: ResolvedMap = newResolvedMap();
	const stream: StreamState = {
		boundaries: new Map(),
		nextId: 0,
		token: createStreamToken(),
		activePassBoundaryKeys: null,
		activeTryKeys: [],
		activeOwnerKeys: [],
	};
	const renderFullPass = (): {
		pass: FullPassResult;
		boundaryKeys: Set<string>;
	} => {
		const boundaryKeys = new Set<string>();
		const previousBoundaryKeys = stream.activePassBoundaryKeys;
		stream.activePassBoundaryKeys = boundaryKeys;
		try {
			return {
				pass: withStream(stream, () =>
					runFullFramedPass(component, props, resolved, nonceAttr, identifierPrefix),
				),
				boundaryKeys,
			};
		} finally {
			stream.activePassBoundaryKeys = previousBoundaryKeys;
		}
	};
	const emittedCss = new Set<string>();
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
		const write = sink.write(chunk);
		const markFlushed = (): void => {
			for (const boundary of errors) boundary.errorFlushed = true;
		};
		if (write === undefined) {
			markFlushed();
			return;
		}
		return write.then(markFlushed);
	};

	let pass: FullPassResult;
	let shellBoundaryKeys: Set<string>;
	let preShellSuspended: SuspendedList = [];
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
				throw new Error('octane SSR: a root suspension no longer has resumable work.');
			}
			if (++rootAttempts > MAX_SUSPENSE_PASSES) {
				throw new Error(
					'octane SSR: ' +
						MAX_SUSPENSE_PASSES +
						' root streaming passes completed without producing a shell.',
				);
			}
			await settleFirstOfWave(pass.suspended, resolved, timeoutMs, signal);
			({ pass, boundaryKeys: shellBoundaryKeys } = renderFullPass());
			preShellSuspended = pass.suspended;
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
	let shell = '';
	for (const [hash, sheet] of pass.cssEntries) {
		emittedCss.add(hash);
		shell +=
			'<style data-octane="' +
			hash +
			'"' +
			nonceAttr +
			'>' +
			escapeEntireInlineStyleContent(sheet) +
			'</style>';
	}
	shell += pass.head + pass.body;
	if (pass.serial.length > 0) shell += serializeSuspenseSeeds(pass.serial, nonceAttr);
	const anyPending = stream.boundaries.size > 0;
	if (anyPending)
		shell += '<script ' + STREAM_SCRIPT_ATTR + nonceAttr + '>' + STREAM_RUNTIME_JS + '</script>';
	try {
		const shellWrite = sink.write(pass.vtCandidates ? vtSsrStrip(shell) : shell);
		if (shellWrite !== undefined) await shellWrite;
	} catch (err) {
		options?.onError?.(err);
		sink.shellError(err);
		return;
	}
	sink.shellReady();

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
			const segmentWrite = sink.write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
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
				throw new Error(
					'octane SSR: a pending streamed boundary no longer has resumable work; ' +
						'its error escaped to an ancestor that was already flushed.',
				);
			}
			if (++attempt > MAX_SUSPENSE_PASSES) {
				throw new Error(
					'octane SSR: ' +
						MAX_SUSPENSE_PASSES +
						' consecutive streaming passes completed no boundary — a use(thenable) never resolved.',
				);
			}
			await settleFirstOfWave(suspended, resolved, timeoutMs, signal);
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
					nonceAttr +
					'>' +
					escapeEntireInlineStyleContent(sheet) +
					'</style>';
			}
			let madeProgress = false;
			for (const boundary of stream.boundaries.values()) {
				if (boundary.state === 'done' && !observedDone.has(boundary.id)) {
					observedDone.add(boundary.id);
					madeProgress = true;
				}
			}
			if (madeProgress) attempt = 0; // a boundary completed — this wave was legitimate

			// A nested boundary's template may live inside an enclosing boundary's
			// not-yet-flushed segment. Build a topological emission order: roots and
			// shell-reachable siblings first, then children whose nearest registered
			// ancestor is already flushed or earlier in this same chunk. Browser script
			// execution then introduces each child template before its `$OCTRC` call.
			const done = reachableDoneSegments();
			for (const b of done) chunk += segmentChunk(b, nonceAttr);
			if (chunk !== '') {
				const segmentWrite = sink.write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
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
		let tail = '';
		for (const b of stream.boundaries.values()) {
			if (!flushedSegments.has(b.id) && !b.errorFlushed) tail += boundaryErrorChunk(b, nonceAttr);
		}
		if (tail !== '') {
			try {
				const terminalWrite = sink.write(tail, true);
				if (terminalWrite !== undefined) await terminalWrite;
			} catch {
				// The transport is already gone; there is nowhere to send recovery.
			}
		}
		sink.fatal(err);
		return;
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
	component: ServerComponent,
	props?: any,
	options?: StreamOptions,
): {
	pipe: <T extends { write(chunk: string): unknown; end(): unknown }>(destination: T) => T;
	abort: (reason?: unknown) => void;
} {
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
		const error = reason ?? new Error('The stream destination closed.');
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
			return Promise.reject(
				new TypeError(
					'octane SSR: destination.write() returned false but the destination cannot emit drain.',
				),
			);
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
					const err = new Error('The stream destination closed.');
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
		if (closed) return Promise.reject(new Error('The stream destination is closed.'));
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
		void runStream(
			component,
			props,
			{ ...options, signal: controller.signal },
			{
				write(chunk, terminal) {
					return queueWrite(chunk, terminal);
				},
				shellReady() {
					options?.onShellReady?.();
				},
				shellError(err) {
					options?.onShellError?.(err);
					flushEnd();
				},
				allReady() {
					options?.onAllReady?.();
					flushEnd();
				},
				fatal() {
					// Once the shell exists, abort/error degradation is a terminal
					// completion of the pipeable request. Fizz fires onAllReady after its
					// recovery instructions have been accepted even though onError also
					// reported the reason; consumers use this callback to end surrounding
					// document work in both success and aborted paths.
					options?.onAllReady?.();
					flushEnd();
				},
			},
		).catch((err) => {
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
			if (pipeCalled) throw new Error('octane SSR: pipe() may only be called once.');
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
					if (!endCalled) destinationFailure(new Error('The stream destination closed.'));
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
			if (!ended) controller.abort(reason ?? new Error('The render was aborted.'));
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
	component: ServerComponent,
	props?: any,
	options?: StreamOptions,
): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }> {
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
				cancelReason = reason ?? new Error('The stream consumer cancelled.');
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
				return Promise.reject(cancelReason ?? new Error('The readable stream is closed.'));
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
						throw cancelReason ?? new Error('The readable stream is closed.');
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

		runStream(
			component,
			props,
			{ ...options, signal: renderController.signal },
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
					options?.onShellError?.(err);
					if (!shellDone) rejectShell(err);
					allReadyReject(err);
					closeReadable();
				},
				allReady() {
					options?.onAllReady?.();
					allReadyResolve();
					closeReadable();
				},
				fatal(err) {
					allReadyReject(err);
					closeReadable();
				},
			},
		).catch((err) => {
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
	HEAD.html += html;
}

function hintAttrs(
	opts: Record<string, unknown> | undefined,
	skipAs: boolean,
	tag: 'link' | 'script',
): string {
	let out = '';
	if (opts == null) return out;
	for (const k in opts) {
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
	if (!href) return null;
	const value = typeof href === 'string' ? href : String(href);
	return value === '' ? null : value;
}

/** React DOM `preload(href, {as, …})`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	const value = coerceHintHref(href);
	if (value === null || !options?.as) return;
	const key = 'preload:' + options.as + ':' + value;
	const safeHref = sanitizeURL(value);
	emitHeadHint(
		key,
		'<link rel="preload" href="' +
			escapeAttr(safeHref) +
			'"' +
			hintAttrs(options, false, 'link') +
			' data-oct-hint="' +
			escapeAttr(key) +
			'">',
	);
}

/** React DOM `preinit(href, {as: 'style'|'script', …})`. */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	const value = coerceHintHref(href);
	if (value === null || !options?.as) return;
	const key = 'preinit:' + options.as + ':' + value;
	const safeHref = sanitizeURL(value);
	const hint = ' data-oct-hint="' + escapeAttr(key) + '"';
	emitHeadHint(
		key,
		options.as === 'style'
			? '<link rel="stylesheet" href="' +
					escapeAttr(safeHref) +
					'"' +
					hintAttrs(options, true, 'link') +
					hint +
					'>'
			: '<script src="' +
					escapeAttr(safeHref) +
					'" async' +
					hintAttrs(options, true, 'script') +
					hint +
					'></script>',
	);
}

/** React DOM `preconnect(href, {crossOrigin?})`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	const value = coerceHintHref(href);
	if (value === null) return;
	const key = 'preconnect:' + value;
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
