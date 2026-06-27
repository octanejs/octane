/**
 * octane server runtime (SSR Phase 1).
 *
 * The `octane/compiler` compiler, in `mode: 'server'`, emits component bodies
 * that build an HTML STRING (instead of cloning a DOM template) by calling the
 * `ssr*` helpers here, and that call these server hook implementations. The
 * server analogue of `createRoot().render()` is `render(Component, props)` →
 * `{ head, body, css }`.
 *
 * Phase 1 scope: static markup, dynamic text holes, attributes (incl. class /
 * style / spread), nested components, scoped CSS collection, and the leaf hooks
 * (state returns its initial value, effects no-op, memo runs once, ids are
 * deterministic). Events and refs are dropped (no DOM on the server). Control
 * flow (@if/@for/@switch/@try), portals, Activity and fragment refs are rejected
 * by the compiler in server mode until later phases. No hydration markers are
 * emitted yet — that arrives with the client hydrate runtime.
 */

// ---------------------------------------------------------------------------
// Per-render ambient state. A render is synchronous and single-threaded, so a
// module-global "current scope" (mirroring the client's CURRENT_SCOPE) is safe.
// ---------------------------------------------------------------------------

import {
	BLOCK_OPEN,
	BLOCK_CLOSE,
	EMPTY_COMMENT,
	SUSPENSE_SCRIPT_ATTR,
	UNDEFINED_SENTINEL_KEY,
} from './constants';

interface SSRScope {
	parent: SSRScope | null;
	/** Context Provider values stamped on this scope (lazily allocated). */
	$$ctxValues: Map<unknown, unknown> | null;
}

type ServerComponent = (props: any, scope: SSRScope, extra?: any) => string;

let CURRENT_SCOPE: SSRScope | null = null;
let ID_COUNTER = 0;
let CSS: Map<string, string> | null = null;
// Accumulates top-level `<head>` content during the active render pass (a
// mutable container, mirroring CSS's mutable Map, so a per-pass local capture
// keeps accumulating via `HEAD.html +=` even though strings are immutable).
// Returned as RenderResult.head; the metaframework injects it at <!--ssr-head-->.
let HEAD: { html: string } | null = null;

// Suspense (SSR Phase 4). A render pass that reaches an unresolved `use(thenable)`
// records the thenable in SUSPENDED and throws SSR_SUSPENSE; the nearest @try
// renders its @pending fallback. render()'s retry loop awaits everything in
// SUSPENDED, caches each outcome in RESOLVED (keyed by the compiler-injected
// call-site key + per-pass occurrence index), then re-renders — on the next pass
// use() finds the cached value and returns it, so the @try renders its success
// arm (or, on rejection, routes the error to @catch). SERIAL collects the
// resolved values in render (depth-first) order so the client can seed them back
// in the same order during hydration. OCC counts per-site occurrences so a use()
// inside an @for gets a distinct key per iteration. All four are reinstalled
// fresh at the top of every pass (see render()) so concurrent render() calls
// that interleave across an `await` cannot clobber one another.
let SUSPENDED: { promise: PromiseLike<unknown>; key: string }[] | null = null;
let RESOLVED: Map<string, { value: unknown } | { reason: unknown }> | null = null;
let SERIAL: unknown[] | null = null;
let OCC: Map<string, number> | null = null;

function ssrScope(parent: SSRScope | null): SSRScope {
	return { parent, $$ctxValues: null };
}

const NOOP = (): void => {};

// Matches the client runtime's `ELEMENT_TAG` (createElement descriptor marker)
// so `ssrChild` can render a `<Comp/>`-as-value descriptor server-side too.
const ELEMENT_TAG = Symbol.for('octane.element');

// Void (self-closing) HTML elements — no end tag, no children. Mirrors the
// compiler's VOID_ELEMENTS so a host descriptor serialized by `ssrChild`
// matches the static-markup emission of `ssrEmitElement`.
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

interface ElementDescriptor {
	$$kind: typeof ELEMENT_TAG;
	// A server ComponentBody (component-value form, e.g. `{<Comp/>}`) OR a host tag
	// string (`'li'`), produced when host JSX appears at a VALUE position (a
	// `.map(...)` callback, a render-prop arrow body, an array literal).
	type: ServerComponent | string;
	props: any;
	// React-style `key`, lifted out of props (consulted by the client's de-opt list
	// path on hydration; the server only renders it into markup).
	key: any;
	// `createElement(type, props, ...children)` children for the host form; `null`
	// for the component-value form (children flow through the component's props).
	children: any;
}

// Server `createElement(type, props, ...children)` — produces the SAME descriptor
// shape as the client runtime's `createElement` (see runtime.ts). The compiler
// lowers VALUE-position JSX (a `.map` callback, a render-prop arrow body, an array
// literal) to this call in BOTH modes, so the same lowered call resolves to the
// client-or-server `createElement` per build, and `ssrChild` renders the result.
export function createElement(
	type: ServerComponent | string,
	props?: any,
	...children: any[]
): ElementDescriptor {
	const p = (props ?? {}) as any;
	const key = p.key != null ? p.key : null;
	const kids = children.length > 0 ? (children.length === 1 ? children[0] : children) : p.children;
	return { $$kind: ELEMENT_TAG, type, props: p, key, children: kids ?? null };
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

export function escapeHtml(v: unknown): string {
	return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(v: unknown): string {
	return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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
 * A RENDERABLE expression hole — the value of a `{expr}` that is NOT marked as
 * definite text (`{expr as string}`). Mirrors Ripple: a `{children}` / component
 * function or element descriptor RENDERS (wrapped in a hydration block range, so
 * the client adopts it), while a primitive coerces to text. The compiler routes
 * `{x as string}` / literals / `+`-concats to `ssrText`, everything else here.
 */
export function ssrChild(v: unknown, scope: SSRScope): string {
	// Every renderable hole serializes to ONE `<!--[-->…<!--]-->` range so the
	// client's childSlot adopts a uniform marker pair on hydration regardless of
	// whether the value is a component, an element, a primitive, or empty — and
	// an empty hole still occupies one logical node, keeping sibling cursor
	// alignment intact. `ssrComponent` already wraps its output in block markers.
	if (v == null || v === false || v === true) return ssrBlock('');
	// An ARRAY child (e.g. `{xs.map(x => <li/>)}`) → the client's childSlot routes
	// it to the de-opt keyed list, whose hydration ADOPTS one `<!--[-->…<!--]-->`
	// range PER ITEM (see mountItem's hydrating branch). So wrap each item in its
	// own block, then the whole list in the outer childSlot block. A nested array
	// (fragment-of-arrays) flattens into more sibling item blocks — matching the
	// client's recursive de-opt build.
	if (Array.isArray(v)) {
		let out = '';
		for (let i = 0; i < v.length; i++) out += ssrChildItem(v[i], scope);
		return ssrBlock(out);
	}
	// A component-body / children render function, or `<Comp/>` used as a value.
	if (typeof v === 'function') return ssrComponent(scope, v as ServerComponent, {});
	if (typeof v === 'object' && (v as any).$$kind === ELEMENT_TAG) {
		const d = v as ElementDescriptor;
		// HOST descriptor (`createElement('span', …)`, from value-position JSX) →
		// serialize the element directly; its content REPLACES the childSlot range
		// the client adopts (de-opt host children are rebuilt, not adopted in place,
		// so only the outer marker pair must line up). COMPONENT descriptor →
		// ssrComponent, passing `children` through (don't drop them).
		if (typeof d.type === 'string')
			return ssrBlock(ssrHostElement(d.type, d.props, d.children, scope));
		return ssrComponent(scope, d.type, { ...d.props, children: d.children ?? d.props?.children });
	}
	return ssrBlock(escapeHtml(v));
}

// One item of an array child: each is its own `<!--[-->…<!--]-->` block (the unit
// the client de-opt list adopts on hydration). A nested array flattens into more
// sibling item blocks (React fragment-of-arrays); everything else reuses ssrChild's
// per-value serialization (host element, component, primitive, or empty).
function ssrChildItem(v: unknown, scope: SSRScope): string {
	if (Array.isArray(v)) {
		let out = '';
		for (let i = 0; i < v.length; i++) out += ssrChildItem(v[i], scope);
		return out;
	}
	if (v == null || v === false || v === true) return ssrBlock('');
	if (typeof v === 'object' && (v as any).$$kind === ELEMENT_TAG) {
		const d = v as ElementDescriptor;
		if (typeof d.type === 'string')
			return ssrBlock(ssrHostElement(d.type, d.props, d.children, scope));
		return ssrComponent(scope, d.type, { ...d.props, children: d.children ?? d.props?.children });
	}
	if (typeof v === 'function') return ssrComponent(scope, v as ServerComponent, {});
	return ssrBlock(escapeHtml(v));
}

// Serialize a HOST element descriptor (`createElement('span', props, ...children)`)
// to `<tag …attrs…>…children…</tag>`, void-element aware. Mirrors the static
// emission of the compiler's `ssrEmitElement`: `className`→`class`, `style` objects
// flattened, spread-unsafe / event / ref / key / children props skipped, and
// children recursed via ssrChild (array → blocks, element/component → render,
// primitive → escaped text). `dangerouslySetInnerHTML={{__html}}`, if present, is
// raw (unescaped) content.
function ssrHostElement(tag: string, props: any, children: any, scope: SSRScope): string {
	let attrs = '';
	let innerHTML: unknown = undefined;
	if (props != null) {
		for (const k in props) {
			if (k === 'key' || k === 'ref' || k === 'children') continue;
			// onX events have no server semantics (no DOM); drop them.
			if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && k[2] >= 'A' && k[2] <= 'Z') continue;
			const val = props[k];
			if (k === 'dangerouslySetInnerHTML') {
				innerHTML = val == null || val.__html == null ? '' : val.__html;
				continue;
			}
			if (k === 'style') attrs += ssrStyle(val);
			else if (k === 'className' || k === 'class') attrs += ssrAttr('class', val);
			else if (VALID_ATTR_NAME.test(k)) attrs += ssrAttr(k, val);
		}
	}
	const hasChildren =
		children != null && children !== false && children !== true && children !== '';
	if (VOID_ELEMENTS.has(tag) && !hasChildren && innerHTML === undefined) {
		return '<' + tag + attrs + '/>';
	}
	let inner = '';
	if (innerHTML !== undefined) {
		inner = innerHTML == null ? '' : String(innerHTML);
	} else if (hasChildren) {
		inner = ssrDescriptorContent(children, scope);
	}
	return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
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
		return ssrComponent(scope, d.type, { ...d.props, children: d.children ?? d.props?.children });
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
	return BLOCK_OPEN + content + BLOCK_CLOSE;
}

/**
 * A portal's site marker. The portal body renders into a foreign target at the
 * client, so server-side it leaves a single anchor comment placeholder.
 */
export function ssrPortal(): string {
	return EMPTY_COMMENT;
}

/** A dynamic attribute: ` name="value"`, ` name` for `true`, or '' to omit. */
export function ssrAttr(name: string, v: unknown): string {
	if (v == null || v === false) return '';
	if (v === true) return ' ' + name;
	return ' ' + name + '="' + escapeAttr(v) + '"';
}

function styleObjectToCss(obj: Record<string, unknown>): string {
	let out = '';
	for (const k in obj) {
		const val = obj[k];
		if (val == null || val === false) continue;
		out += hyphenate(k) + ':' + val + ';';
	}
	return out;
}

// camelCase / vendor-prefixed style keys → kebab-case (mirrors runtime.styleName).
function hyphenate(name: string): string {
	if (name.charCodeAt(0) === 45 /* - */) return name; // --custom-prop / -webkit-…
	let out = '';
	let changed = false;
	for (let i = 0; i < name.length; i++) {
		const c = name.charCodeAt(i);
		if (c >= 65 && c <= 90) {
			out += '-' + String.fromCharCode(c + 32);
			changed = true;
		} else out += name[i];
	}
	if (!changed) return name;
	if (out.charCodeAt(0) === 109 && out.charCodeAt(1) === 115 && out.charCodeAt(2) === 45)
		out = '-' + out;
	return out;
}

/** A dynamic `style` attribute (string cssText or an object). */
export function ssrStyle(v: unknown): string {
	if (v == null || v === false || v === '') return '';
	const css = typeof v === 'string' ? v : styleObjectToCss(v as Record<string, unknown>);
	if (!css) return '';
	return ' style="' + escapeAttr(css) + '"';
}

// Legal HTML attribute name: non-empty, no ASCII whitespace, `"`, `'`, `>`, `/`,
// `=`, or control chars. Rejects spread keys that would inject markup (e.g.
// 'x onload=alert(1)' or 'a>'); mirrors the client's setAttribute behavior.
const VALID_ATTR_NAME = /^[^\s"'>\/=\u0000-\u001F]+$/;

/** A spread `{...obj}`: serialize attr-like keys; drop events/refs/key/children. */
export function ssrSpread(obj: unknown): string {
	if (obj == null || typeof obj !== 'object') return '';
	let out = '';
	for (const k in obj as Record<string, unknown>) {
		if (k === 'ref' || k === 'key' || k === 'children' || k === 'dangerouslySetInnerHTML') continue;
		if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && k[2] >= 'A' && k[2] <= 'Z') continue; // onX
		const v = (obj as Record<string, unknown>)[k];
		if (k === 'style') out += ssrStyle(v);
		else if (k === 'className') out += ssrAttr('class', v);
		else if (VALID_ATTR_NAME.test(k)) out += ssrAttr(k, v); // skip injection-unsafe names
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

/** Render a child component into the string: fresh scope, server body → HTML. */
export function ssrComponent(parent: SSRScope, comp: ServerComponent, props: any): string {
	const prev = CURRENT_SCOPE;
	const scope = ssrScope(parent ?? prev);
	CURRENT_SCOPE = scope;
	try {
		// Wrap the child's output in a hydration block range so the client's
		// componentSlot can ADOPT it during hydration (its `<!--[-->`/`<!--]-->`
		// become the slot's start/end markers, exactly like control-flow blocks).
		return BLOCK_OPEN + (comp(props ?? {}, scope, undefined) ?? '') + BLOCK_CLOSE;
	} finally {
		CURRENT_SCOPE = prev;
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
	return ssrBlock(
		(() => {
			try {
				return ssrBlock(ssrChildrenHtml(props.children, scope));
			} catch (e) {
				if (ssrIsSuspense(e)) return ssrBlock(ssrChild(props.fallback, scope));
				throw e;
			}
		})(),
	);
}

/**
 * `<ErrorBoundary fallback={…}>…</ErrorBoundary>` — the JSX built-in mirror of
 * `@try { … } @catch (e) { fallback }`. `fallback` is a renderable or a
 * `(error, reset) => renderable` render prop (react-error-boundary style). A real
 * error during render swaps to the fallback; a suspension rethrows so an outer
 * `<Suspense>`/`@pending` handles it (matches the client, whose ErrorBoundary
 * passes `pending = null` to tryBlock). `reset` is a server no-op (no re-render).
 */
export function ErrorBoundary(
	props: { fallback?: unknown; children?: unknown },
	scope: SSRScope,
): string {
	return ssrBlock(
		(() => {
			try {
				return ssrBlock(ssrChildrenHtml(props.children, scope));
			} catch (e) {
				if (ssrIsSuspense(e)) throw e; // let an outer Suspense render its pending arm
				const fb =
					typeof props.fallback === 'function'
						? (props.fallback as (err: unknown, reset: () => void) => unknown)(e, NOOP)
						: props.fallback;
				return ssrBlock(ssrChild(fb, scope));
			}
		})(),
	);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CONTEXT_TAG = Symbol.for('octane.context');

export interface Context<T> {
	$$kind: typeof CONTEXT_TAG;
	defaultValue: T;
	$$version: number;
	Provider: (props: { value: T; children?: any }, scope: SSRScope) => string;
}

export function createContext<T>(defaultValue: T): Context<T> {
	const ctx = { $$kind: CONTEXT_TAG, defaultValue, $$version: 0 } as Context<T>;
	ctx.Provider = function ProviderBody(props, scope) {
		if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
		scope.$$ctxValues.set(ctx, props.value);
		return typeof props.children === 'function' ? (props.children(undefined, scope) ?? '') : '';
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

export function use<T>(usable: Context<T> | PromiseLike<T>, siteKey?: string | symbol): T {
	if (usable && (usable as any).$$kind === CONTEXT_TAG) return readContext(usable as Context<T>);
	// A thenable. Key it by the compiler-injected call-site key, disambiguated by
	// how many times this site has already run THIS pass (so a use() inside an
	// @for gets a distinct key per iteration). The key is stable across passes
	// because each pass re-derives it from the same deterministic render.
	const base =
		siteKey === undefined
			? '@'
			: typeof siteKey === 'symbol'
				? (siteKey as symbol).toString()
				: String(siteKey);
	const occ = OCC;
	const n = occ !== null ? (occ.get(base) ?? 0) : 0;
	if (occ !== null) occ.set(base, n + 1);
	const key = base + '#' + n;

	const resolved = RESOLVED;
	if (resolved !== null && resolved.has(key)) {
		const entry = resolved.get(key)!;
		// Rejected on a prior pass → throw so the enclosing @try renders @catch.
		// (Not seeded for hydration; the client re-derives a rejected boundary.)
		if ('reason' in entry) throw entry.reason;
		// Resolved → return it, and record it (in render order) for client seeding.
		if (SERIAL !== null) SERIAL.push(entry.value);
		return entry.value as T;
	}
	// First time we reach this site this render — record the thenable so render()'s
	// loop can await it, then suspend so the nearest @try shows @pending this pass.
	if (SUSPENDED !== null) SUSPENDED.push({ promise: usable as PromiseLike<unknown>, key });
	throw SSR_SUSPENSE;
}

// ---------------------------------------------------------------------------
// Hooks — server semantics. All accept the compiler-injected trailing slot
// symbol (ignored: a server render is single-pass with no re-render).
// ---------------------------------------------------------------------------

export function useState<T>(initial: T | (() => T)): [T, (next: any) => void] {
	const value = typeof initial === 'function' ? (initial as () => T)() : initial;
	return [value, NOOP];
}

export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
): [S, (action: A) => void] {
	const init = typeof initOrSlot === 'function' ? initOrSlot : undefined;
	const value = init ? init(initialArg) : (initialArg as unknown as S);
	return [value, NOOP];
}

export function useEffect(): void {}
export const useLayoutEffect = useEffect;
export const useInsertionEffect = useEffect;
export function useImperativeHandle(): void {}

export function useMemo<T>(compute: (...deps: any[]) => T, deps?: any[] | symbol): T {
	// deps may be a real array, omitted, or (per the trailing-slot ABI) a symbol.
	const d = Array.isArray(deps) ? deps : [];
	return compute.apply(null, d);
}

export function useCallback<F>(fn: F): F {
	return fn;
}

export function useRef<T>(initial: T): { current: T } {
	return { current: initial };
}

export function useId(): string {
	// Same shape as the client (':in-<base36>:') so a future hydrate pass lines up.
	return ':in-' + (ID_COUNTER++).toString(36) + ':';
}

export function useEffectEvent<F>(fn: F): F {
	return fn;
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
// hook as `withSlot(sym, hook, ...args)` (see runtime.ts) in BOTH modes, so the
// server build of a `.tsrx` that defines/uses custom hooks must resolve `withSlot`
// from here. On the server there is no per-call-site slot tracking (a render is a
// single synchronous pass with no re-render), so we just invoke the wrapped hook
// with its args, dropping the call-site symbol. Signature-compatible with the
// client so the same lowered call resolves to either per build.
export function withSlot<T>(_sym: symbol, fn: (...a: any[]) => T, ...args: any[]): T {
	return fn(...args);
}

// startTransition — on the client this bumps a priority flag and schedules
// transition-priority renders; on the server there is no scheduler and a render
// is synchronous, so run the callback inline (matching the server no-op transition
// hooks: `useTransition` returns `[false, NOOP]`). An async callback's returned
// promise is ignored — SSR captures the synchronous pass only.
export function startTransition(fn: () => void | Promise<unknown>): void {
	fn();
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
	let s = '<!--' + key + '--><' + tag;
	if (attrs !== null) {
		for (const k in attrs) {
			const v = attrs[k];
			if (v == null || v === false) continue;
			s += v === true ? ' ' + k : ' ' + k + '="' + escapeAttr(v) + '"';
		}
	}
	if (HEAD_VOID_ELEMENTS.has(tag)) {
		s += '>';
	} else {
		s += '>' + (text == null ? '' : escapeHtml(text)) + '</' + tag + '>';
	}
	HEAD.html += s;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface RenderResult {
	head: string;
	body: string;
	css: string;
}

/** Guard against a `use(thenable)` that never resolves wedging the render loop. */
const MAX_SUSPENSE_PASSES = 50;

// Wall-clock bound on a single suspense await. MAX_SUSPENSE_PASSES caps the
// NUMBER of re-render passes, but it's checked BEFORE the await — so a thenable
// that never settles would leave `Promise.all` (and the request) hung forever.
// This deadline races that await so a stuck thenable fails the render instead.
// 0 disables the deadline (await indefinitely). Configurable for tests/hosts.
let SUSPENSE_TIMEOUT_MS = 10_000;

export function setSsrSuspenseTimeout(ms: number): void {
	SUSPENSE_TIMEOUT_MS = ms;
}

export function getSsrSuspenseTimeout(): number {
	return SUSPENSE_TIMEOUT_MS;
}

/**
 * Serialize the resolved `use(thenable)` values (in render order) into an inline
 * data `<script>` the client reads during hydration. `<` is escaped to `<`
 * so the JSON payload can't terminate the `<script>` element or open an HTML
 * comment. Only emitted when at least one value was resolved.
 */
function serializeSuspenseSeeds(values: unknown[]): string {
	// Encode `undefined` (which JSON drops/nulls) as a sentinel so a
	// `use(thenable)` that resolved to `undefined` round-trips to `undefined` on
	// the client — not `null`. The replacer fires for array elements AND nested
	// object properties, so deeply-nested `undefined` survives too.
	const json = JSON.stringify(values, (_key, value) =>
		value === undefined ? { [UNDEFINED_SENTINEL_KEY]: true } : value,
	).replace(/</g, '\\u003c');
	return '<script type="application/json" ' + SUSPENSE_SCRIPT_ATTR + '>' + json + '</script>';
}

/**
 * Render a server-compiled component (a function returning an HTML string) to
 * `{ head, body, css }`. `head` is empty (no document-head API yet); `css` is
 * the scoped stylesheets of the components that actually rendered, emitted as
 * ready-to-place `<style data-octane="hash">…</style>` tags (one per hash,
 * deduped). The client's `injectStyle` matches that `data-octane` hash and
 * skips re-injecting on hydration — so the styles cross the boundary once.
 *
 * Async because of Suspense (Phase 4): a `use(thenable)` that hasn't resolved
 * suspends the pass; render() awaits it and re-renders, so the @try ends up
 * showing its resolved success arm (or @catch on rejection). Each resolved value
 * is appended to `body` as an inline data `<script>` for the client to seed.
 */
export async function render(component: ServerComponent, props?: any): Promise<RenderResult> {
	// The suspense cache persists across this render's passes; it is render-local
	// (never a module global) so concurrent renders can't share it.
	const resolved = new Map<string, { value: unknown } | { reason: unknown }>();
	let attempt = 0;
	for (;;) {
		// Run ONE synchronous pass entirely within this tick: save the ambient
		// module globals, install this pass's fresh state, run the (synchronous)
		// component, capture the results into locals, then restore the globals —
		// all before the `await` below. So no pass state is ever held in a module
		// global across a suspension point, and a concurrent render() that runs
		// during our await can't observe or clobber our in-flight pass.
		const prevScope = CURRENT_SCOPE;
		const prevId = ID_COUNTER;
		const prevCss = CSS;
		const prevHead = HEAD;
		const prevSusp = SUSPENDED;
		const prevRes = RESOLVED;
		const prevSerial = SERIAL;
		const prevOcc = OCC;
		ID_COUNTER = 0;
		const cssMap = (CSS = new Map());
		const headBuf = (HEAD = { html: '' });
		const suspended = (SUSPENDED = [] as { promise: PromiseLike<unknown>; key: string }[]);
		const serial = (SERIAL = [] as unknown[]);
		OCC = new Map();
		RESOLVED = resolved;
		const root = ssrScope(null);
		CURRENT_SCOPE = root;
		let body = '';
		try {
			body = component(props ?? {}, root, undefined) ?? '';
		} catch (err) {
			// A suspension with no enclosing @try unwinds to here; its thenable is
			// already in `suspended`, so fall through to the await + retry. Any other
			// throw is a genuine render failure — propagate it (the finally restores).
			if (!ssrIsSuspense(err)) throw err;
		} finally {
			CURRENT_SCOPE = prevScope;
			ID_COUNTER = prevId;
			CSS = prevCss;
			HEAD = prevHead;
			SUSPENDED = prevSusp;
			RESOLVED = prevRes;
			SERIAL = prevSerial;
			OCC = prevOcc;
		}

		if (suspended.length === 0) {
			let css = '';
			for (const [hash, sheet] of cssMap) {
				css += '<style data-octane="' + hash + '">' + sheet + '</style>';
			}
			if (serial.length > 0) body += serializeSuspenseSeeds(serial);
			return { head: headBuf.html, body, css };
		}
		if (++attempt > MAX_SUSPENSE_PASSES) {
			throw new Error(
				'octane SSR: exceeded ' +
					MAX_SUSPENSE_PASSES +
					' suspense passes — a use(thenable) never resolved.',
			);
		}
		// Await everything this pass surfaced; cache each outcome by its key. Only
		// render-local state (`suspended`, `resolved`) is touched across the await.
		// Raced against SUSPENSE_TIMEOUT_MS so a thenable that never settles fails
		// the render (with a clear error) instead of hanging the request forever.
		const settleAll = Promise.all(
			suspended.map(async ({ promise, key }) => {
				if (resolved.has(key)) return;
				try {
					resolved.set(key, { value: await promise });
				} catch (reason) {
					resolved.set(key, { reason });
				}
			}),
		);
		if (SUSPENSE_TIMEOUT_MS > 0) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const deadline = new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								'octane SSR: a use(thenable) did not settle within ' + SUSPENSE_TIMEOUT_MS + 'ms.',
							),
						),
					SUSPENSE_TIMEOUT_MS,
				);
				// Don't let the deadline timer hold the event loop open if the render
				// settles first (Node-only; harmless where unref is absent).
				(timer as any)?.unref?.();
			});
			try {
				await Promise.race([settleAll, deadline]);
			} finally {
				clearTimeout(timer);
			}
		} else {
			await settleAll;
		}
	}
}
