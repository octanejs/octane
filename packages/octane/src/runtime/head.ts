// Document head and resources
//
// Hoisted `<title>`, `<meta>` and `<link>`, component-scoped `<style>`
// injection, resource hints, and Float stylesheet and script resources.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './lists.js';
import { hydrating } from '../hydration-flag.js';
import { VALID_ATTR_NAME } from '../constants.js';
import { headOwnershipKey } from '../head-ownership.js';
import { resourceHintWarning } from '../resource-hint-diagnostics.js';
import { unpatchedAttribute } from '../hydration/dev-values.js';
import { sanitizeURLAttribute, sanitizeURL } from '../sanitize-url.js';
import type { Scope, Block, RootRenderTransaction, ElementDescriptor } from './types.js';
import { blockSubtreeDisposed } from './refs.js';
import { journalRootProperty } from './engine.js';
import { CURSOR } from './hydration.js';
import { CURRENT_BLOCK, ROOT_RENDER_TRANSACTION } from './render.js';
import { DISCARDED_HEADS, removeNodes } from './roots.js';
import { deoptChildNamespace, setAttribute, coerceAttrValue } from './host-props.js';
import { createElement } from './elements.js';
import { queueRootDeletion, journalBag, journalObjectOnce } from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';
import { eventSlot, devEventListener } from './events.js';
import { ROOT_RENDER_ROLLBACK, TRANSITION_JOURNAL } from './drivers.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ---------------------------------------------------------------------------
// Component-scoped <style> injection — keyed by the compiled stylesheet hash
// so repeated mounts inject once. HMR re-imports with the same hash and
// different CSS refresh the owned sheet in place.
// ---------------------------------------------------------------------------

const _injectedStyles = new Set<string>();

// ---------------------------------------------------------------------------
// Hoisted document metadata (React-19-shape) — `<title>`, `<meta>`, and `<link>`
// are lifted to <document.head>, except links with explicit `onLoad`/`onError`
// handlers, which stay inline. The compiler emits one
// `headBlock(scope, slot, key, tag, attrs, text)` call per hoisted element
// (instead of placing it in the body template). Because octane re-invokes a
// component body on every render, this call recurs each render: the element is
// created/adopted ONCE (held in `scope.slots[slot]`; `key` is the content hash for
// SSR adoption), its attributes
// and text are re-applied each render (so `<title>{state}</title>` is reactive),
// and it is removed from <head> when the owning scope unmounts (so a route swap
// replaces the page's metadata). On a hydrated page the server wrote
// paired key markers + the element into <head> (ssrHeadEl → RenderResult.head →
// <!--ssr-head-->); headBlock ADOPTS that element rather than appending a copy.
// ---------------------------------------------------------------------------

interface HeadSlot {
	el: Element;
	/** Direct listeners keyed by prop name so capture and bubble phases stay independent. */
	handlers?: Map<string, EventListener>;
	/** Authored attribute keys only; never retain the props' values past a render. */
	attrNames?: string[] | undefined;
	/** A root render's attributes and text for this committed element, until its commit. */
	next: { tx: RootRenderTransaction; attrs: Record<string, any> | null; text: unknown } | null;
}

function removeHeadEventListeners(state: HeadSlot, attrs: Record<string, any> | null): void {
	const handlers = state.handlers;
	if (handlers === undefined) return;
	for (const [name, listener] of handlers) {
		if (attrs !== null && name in attrs) continue;
		const event = eventSlot(name)!;
		state.el.removeEventListener(event.type, listener, event.capture);
		handlers.delete(name);
	}
}

/**
 * The head marker pairs a render claimed, each with the op that removes them at
 * its commit: a claim lasts while that op is still queued, so a dropped or
 * committed render releases it.
 */
let HEAD_CLAIMS: WeakMap<Comment, [ops: unknown[], at: number, pair: Comment[]]> | null = null;

function claimedHeadMarker(marker: Comment): boolean {
	const claim = HEAD_CLAIMS?.get(marker);
	return claim !== undefined && claim[0][claim[1] + 1] === claim[2];
}

// Find the server-rendered `tag` inside `key`'s paired marker interval in <head>,
// claim the pair so a later mount can't re-match it, and return the element. The
// commit removes the pair. A foreign node can be injected between the marker and
// the server element (extensions, analytics, or document transforms); never claim
// or mutate it merely because it is adjacent. Nested, missing, or reordered
// delimiters make the interval unprovable, so recovery creates fresh metadata
// without claiming a same-tag node. Returns null on a fresh client render or when
// the expected element is missing.
function adoptServerHeadEl(head: HTMLHeadElement, key: string, tag: string): Element | null {
	const closeKey = '/' + key;
	for (let n: Node | null = getFirstChild(head); n !== null; n = getNextSibling(n)) {
		if (n.nodeType === 8 && (n as Comment).data === key && !claimedHeadMarker(n as Comment)) {
			let candidate: Node | null = getNextSibling(n);
			let match: Element | null = null;
			let end: Comment | null = null;
			let matches = 0;
			while (candidate !== null) {
				if (candidate.nodeType === 8) {
					const marker = (candidate as Comment).data;
					if (marker === closeKey) {
						end = candidate as Comment;
						break;
					}
					// A nested/reordered ownership marker means this interval cannot
					// prove which same-tag node belongs to the requested entry. Leaving
					// `end` unset below is what makes that case adopt nothing.
					if (marker.startsWith('rnh-') || marker.startsWith('/rnh-')) break;
				}
				if (candidate.nodeType === 1 && (candidate as Element).localName === tag) {
					if (matches++ === 0) match = candidate as Element;
				}
				candidate = getNextSibling(candidate);
			}
			const pair = end === null ? [n as Comment] : [n as Comment, end];
			const transaction = ROOT_RENDER_TRANSACTION;
			if (transaction === null) removeNodes(pair);
			else {
				(HEAD_CLAIMS ??= new WeakMap()).set(n as Comment, [
					transaction.ops,
					transaction.ops.length,
					pair,
				]);
				transaction.ops.push(removeNodes, pair);
			}
			if (end === null) return null;
			// Two same-tag candidates are as unprovable as none.
			return matches === 1 ? match : null;
		}
	}
	return null;
}

function rootIdentifierPrefix(block: Block): string {
	while (block.parentBlock !== null) block = block.parentBlock;
	return block.idState.prefix;
}

// Head attributes are reapplied even when an object-valued prop has the same
// identity: its coercion may have changed, or outside code may have edited the
// live head. Compare the final scalar value, retaining neither user objects nor
// a stale authored-value cache. Common metadata names need no property, alias,
// namespace, or URL routing, and equal values avoid native attribute mutation.
function setHeadAttribute(el: Element, name: string, value: unknown): void {
	switch (name) {
		case 'name':
		case 'content':
		case 'lang':
		case 'media':
		case 'id':
		case 'title':
		case 'type':
			break;
		default:
			return setAttribute(el, name, value);
	}
	const next = coerceAttrValue(el, name, value);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (el.getAttribute(name) === next) return;
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, next);
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
	// shape stays monomorphic; `key` is only the ownership hash used to adopt the
	// matching server-rendered head element on hydration.
	let state = scope.slots[slot] as HeadSlot | undefined;
	if (state === undefined) {
		const parent = scope.block.parentNode;
		const ownerDocument = parent.nodeType === 9 ? (parent as Document) : parent.ownerDocument!;
		const head = ownerDocument.head;
		// A client render that replaces a document's failed hydration claims nothing
		// from the server head it discards (installHydrationFallback).
		let el =
			DISCARDED_HEADS?.has(head) === true
				? null
				: adoptServerHeadEl(head, headOwnershipKey(key, rootIdentifierPrefix(scope.block)), tag);
		const adopted = el !== null;
		if (el === null) {
			el = ownerDocument.createElement(tag);
			const transaction = ROOT_RENDER_TRANSACTION;
			if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
				// A root render's new head element joins <head> as it commits,
				// unless an earlier deletion cleanup released its scope: the
				// document's head then, which a commit that replaces it has swapped in.
				const created = el;
				transaction.ops.push(() => {
					if ((scope.slots[slot] as HeadSlot | undefined)?.el === created)
						ownerDocument.head.appendChild(created);
				}, null);
			} else head.appendChild(el);
		}
		// React 19 does not hydrate a hoisted head element in place: it claims the
		// server's and sets the client's props on it (setInitialProperties), which
		// keeps the attributes only the server rendered. Outside hydration, the
		// client's attributes replace the server's.
		const hydration = adopted && hydrating ? CURSOR : null;
		state = {
			el,
			attrNames: adopted && hydration === null ? el.getAttributeNames() : undefined,
			next: null,
		};
		scope.slots[slot] = state;
		// Removed once, on the owning scope's unmount (NOT between re-renders) —
		// scope.cleanups fire only on teardown, mirroring the spread-ref cleanup.
		(scope.cleanups ??= []).push(() => {
			state!.next = null;
			removeHeadEventListeners(state!, null);
			// A hydration attempt that is discarded leaves the server's element in
			// place, for the next attempt to claim.
			if (!adopted || !hydrating || CURSOR === null) state!.el.remove();
			scope.slots[slot] = undefined;
		});
		// The claimed element takes the client's props once hydration ends: at
		// the attempt's commit, as a server element a client render claims does.
		const transaction = ROOT_RENDER_TRANSACTION;
		if (hydration !== null && transaction === null) {
			hydration.suspend(() => applyHeadProps(state!, tag, attrs, text));
			return;
		}
		if (adopted && transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
			state.next = { tx: transaction, attrs, text };
			transaction.ops.push(commitHeadProps, state);
			return;
		}
	} else {
		// A root render's update to a committed element waits for its commit.
		const transaction = ROOT_RENDER_TRANSACTION;
		if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK && !hydrating) {
			const pending = state.next;
			journalRootProperty(state, 'next', pending);
			state.next = { tx: transaction, attrs, text };
			if (pending === null || pending.tx !== transaction)
				transaction.ops.push(commitHeadProps, state);
			return;
		}
	}
	applyHeadProps(state, tag, attrs, text);
}

function commitHeadProps(state: HeadSlot): void {
	const next = state.next;
	// The owning scope's unmount released it.
	if (next === null) return;
	state.next = null;
	applyHeadProps(state, state.el.localName, next.attrs, next.text);
}

function applyHeadProps(
	state: HeadSlot,
	tag: string,
	attrs: Record<string, any> | null,
	text: unknown,
): void {
	const el = state.el;
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(state);
		journalBag();
	}
	removeHeadEventListeners(state, attrs);
	const previousNames = state.attrNames;
	if (previousNames !== undefined) {
		for (let i = 0; i < previousNames.length; i++) {
			const name = previousNames[i];
			if (attrs === null || !(name in attrs)) setAttribute(el, name, null);
		}
	}
	if (attrs !== null) {
		const names: string[] = [];
		for (const k in attrs) {
			// Hoisted head elements live in document.head — OUTSIDE every delegation
			// root — and their load/error events don't bubble anyway, so on* props
			// get DIRECT listeners here (`<link onLoad={…}>` must fire like React's).
			const ev = k.length > 2 && k[0] === 'o' && k[1] === 'n' ? eventSlot(k) : null;
			if (ev !== null) {
				const v = attrs[k];
				const listener = process.env.NODE_ENV !== 'production' ? devEventListener(k, v) : v;
				const hs = state.handlers;
				const prevH = hs?.get(k);
				if (prevH === listener) continue;
				const nextH = typeof listener === 'function' ? (listener as EventListener) : undefined;
				if (prevH !== undefined) el.removeEventListener(ev.type, prevH, ev.capture);
				if (nextH !== undefined) {
					el.addEventListener(ev.type, nextH, ev.capture);
					(hs ?? (state.handlers = new Map<string, EventListener>())).set(k, nextH);
				} else {
					hs?.delete(k);
				}
				continue;
			}
			names.push(k);
			setHeadAttribute(el, k, attrs[k]);
		}
		state.attrNames = names;
	} else {
		state.attrNames = undefined;
	}
	if (text != null || tag === 'title') {
		const t = text == null ? '' : String(text);
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
			// A root render's teardown of the committed entry lands at commit.
			if (ROOT_RENDER_TRANSACTION !== null && !ROOT_RENDER_TRANSACTION.aborted && !hydrating)
				queueRootDeletion(() => removeHeadEventListeners(state, null), state.el, state.el);
			else {
				removeHeadEventListeners(state, null);
				state.el.remove();
			}
			journalRootProperty(scope.slots, slot, state);
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
	const key = authoredKey !== undefined ? authoredKey : attrs?.['key'];
	const config: any = { headKey, tag, attrs, text };
	if (key !== undefined) config.key = key;
	return createElement(namespaceHead, config);
}

export function injectStyle(id: string, css: string, nonce?: string): void {
	if (typeof document === 'undefined') {
		_injectedStyles.add(id);
		return;
	}
	const existing = document.querySelector<HTMLStyleElement>(`style[data-octane="${id}"]`);
	if (existing !== null) {
		// A scope hash derives from its first block's position and content, so an
		// HMR re-evaluation after editing a later block of the same scope arrives
		// with an unchanged id and different css: refresh a sheet this runtime
		// already owns in place. A sheet seen for the first time was emitted by
		// the server (its text may differ only in serialization) and is adopted.
		if (_injectedStyles.has(id)) {
			if (existing.textContent !== css) existing.textContent = css;
		} else {
			_injectedStyles.add(id);
		}
		return;
	}
	if (_injectedStyles.has(id)) return;
	// SSR de-dup: the server already emitted this scoped stylesheet (the css of
	// the RenderResult, a `<style data-octane="hash">` handled above — or, for a
	// React-hosted island, a React 19 style RESOURCE whose href React
	// serializes as `data-href="octane-<hash>"`; React drops other attributes
	// from hoisted resources). On a hydrated page the per-runtime Set is empty,
	// so also check the DOM before re-injecting — otherwise hydration would
	// append a duplicate <style>. React batches same-precedence resources into
	// one tag whose data-href lists every key (`octane-a octane-b`), so the
	// resource match is a whitespace-token match, not an exact one.
	if (document.querySelector(`style[data-href~="octane-${id}"]`)) {
		_injectedStyles.add(id);
		return;
	}
	_injectedStyles.add(id);
	const el = document.createElement('style');
	el.setAttribute('data-octane', id);
	if (nonce !== undefined) el.nonce = nonce;
	el.textContent = css;
	document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// Resource hints — React DOM's preload / preinit / preconnect / prefetchDNS.
// Each call inserts one deduped <link>/<script> into document.head (client).
// Dedupe key = rel/kind + href, matching React's resource identity model.
//
// As in React DOM, a hint inserts the moment it is called, even while a root
// renders: starting the fetch early is the hint's whole purpose, so a render
// that later throws or is dropped leaves its hints behind. These are the only
// render-time head writers, and scripts/render-writers.mjs classifies them as
// `hint`. A resource element waits for its commit (requestResourceElement).
// ---------------------------------------------------------------------------

const _resourceHints = new Set<string>();

/** Known-hint check shared by insertHeadHint and cross-family suppression. */
function hasHeadHint(key: string): boolean {
	if (_resourceHints.has(key)) return true;
	if (typeof document === 'undefined') return false;
	// SSR dedupe: compare exact attribute VALUES rather than interpolating an
	// href-derived key into a CSS selector. Quotes/brackets are valid URL text;
	// treating them as selector syntax could throw before the hint is inserted.
	const existing = document.head.querySelectorAll('[data-oct-hint]');
	for (let i = 0; i < existing.length; i++) {
		if (existing[i].getAttribute('data-oct-hint') === key) {
			_resourceHints.add(key);
			return true;
		}
	}
	return false;
}

function insertHeadHint(key: string, build: () => Element): void {
	if (typeof document === 'undefined' || hasHeadHint(key)) return;
	const el = build();
	el.setAttribute('data-oct-hint', key);
	document.head.appendChild(el);
	// Publish dedupe state only after every DOM operation succeeds, so a failed
	// build/append cannot poison the key and suppress a later valid retry.
	_resourceHints.add(key);
}

/**
 * Connection/integrity options seeded by preload for the matching preinit —
 * React carries these onto the initialized resource. Keyed `as:href`; the
 * preinit's own options win on collision. Test-only reset rides
 * resetFloatResourceState.
 */
let _preloadTransfer: Map<string, Record<string, unknown>> | null = null;

const TRANSFER_OPTION_KEYS = [
	'crossOrigin',
	'integrity',
	'nonce',
	'fetchPriority',
	'referrerPolicy',
] as const;

function stashPreloadTransfer(kind: string, href: string, options: Record<string, unknown>): void {
	let subset: Record<string, unknown> | null = null;
	for (const k of TRANSFER_OPTION_KEYS) {
		const v = options[k];
		if (v != null) (subset ??= {})[k] = v;
	}
	if (subset !== null) (_preloadTransfer ??= new Map()).set(kind + ':' + href, subset);
}

function takePreloadTransfer(kind: string, href: string): Record<string, unknown> | null {
	if (_preloadTransfer === null) return null;
	const key = kind + ':' + href;
	const found = _preloadTransfer.get(key);
	if (found === undefined) return null;
	_preloadTransfer.delete(key);
	return found;
}

function guardHintHref(href: unknown): string | null {
	return typeof href === 'string' && href !== '' ? href : null;
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

function applyHintAttrs(el: Element, opts: Record<string, unknown> | undefined): void {
	if (opts == null) return;
	for (const k in opts) {
		if (!KNOWN_HINT_OPTIONS.has(k)) continue;
		const v = (opts as any)[k];
		if (v == null || v === false) continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		const value = v === true ? '' : String(v);
		el.setAttribute(name, sanitizeURLAttribute(el.localName, name, value));
	}
}

/** React DOM `preload(href, {as, …})` — `<link rel="preload">`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preload', href, options);
		if (warning !== null) console.error(warning);
	}
	const guarded = guardHintHref(href);
	if (guarded === null) return;
	if (
		options === null ||
		typeof options !== 'object' ||
		!options.as ||
		typeof options.as !== 'string'
	)
		return;
	const as = options.as;
	const rawHref = guarded;
	// Fonts must be fetched anonymously to be reusable by CSS — React enforces
	// crossorigin="" regardless of the caller's value; so does Octane.
	if (as === 'font') options = { ...options, crossOrigin: '' };
	// Connection/integrity options seed the matching future preinit (React's
	// resource map carries them onto the initialized resource).
	// A deduped preload must retain the first call's options, even when that
	// call supplied no transferable metadata.
	if ((as === 'style' || as === 'script') && !_resourceHints.has('preload:' + as + ':' + rawHref))
		stashPreloadTransfer(as, rawHref, options);
	// After the matching external resource is already live (a Float resource or
	// preinit), a preload adds nothing. Inline style resources share the sheet
	// identity namespace but cannot consume an external stylesheet preload, so
	// both entries must survive regardless of discovery order. Inspect DOM only
	// on this uncommon identity collision and compare attribute values directly:
	// href text may contain quotes or other CSS-selector metacharacters.
	if (as === 'style' && resourceState().sheets.has(rawHref)) {
		const styles = document.head.querySelectorAll('style[data-precedence]');
		let hasInlineStyle = false;
		for (let i = 0; i < styles.length; i++) {
			if (styles[i].getAttribute('data-href') === rawHref) {
				hasInlineStyle = true;
				break;
			}
		}
		if (!hasInlineStyle) return;
	}
	if (as === 'script' && resourceState().scripts.has(rawHref)) return;
	// Image preloads with a srcset are keyed by the srcset+sizes pair, not the
	// fallback href — two responsive preloads for one href stay distinct.
	const imageSrcSet = as === 'image' ? options['imageSrcSet'] : undefined;
	const key =
		typeof imageSrcSet === 'string' && imageSrcSet !== ''
			? 'preload:image:' + imageSrcSet + '::' + String(options['imageSizes'] ?? '')
			: 'preload:' + as + ':' + rawHref;
	const safeHref = sanitizeURL(rawHref);
	const omitHref = typeof imageSrcSet === 'string' && imageSrcSet !== '';
	insertHeadHint(key, () => {
		const l = document.createElement('link');
		l.rel = 'preload';
		// A responsive image preload matches on imagesrcset/imagesizes; the
		// fallback href would double-fetch, so React (and Octane) omit it.
		if (!omitHref) l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/**
 * React DOM `preinit(href, {as: 'style'|'script', …})` — executes/applies the
 * resource. It shares ONE identity with the rendered resource forms: a
 * preinit'd stylesheet joins the precedence groups (`precedence` option
 * honored, default `'default'`) and dedupes against
 * `<link rel="stylesheet" precedence>`; a preinit'd script dedupes against
 * `<script async src>`. Like React's preinitStyle and preinitScript, it inserts
 * its element when called, not at a commit.
 */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinit', href, options);
		if (warning !== null) console.error(warning);
	}
	const guarded = guardHintHref(href);
	if (guarded === null) return;
	if (options === null || typeof options !== 'object') return;
	const as = options?.as;
	if (as !== 'style' && as !== 'script') return;
	const rawHref = guarded;
	const seeded = takePreloadTransfer(as, rawHref);
	if (typeof document === 'undefined') return;
	const state = resourceState();
	const attrs = { ...seeded, ...options, as: undefined };
	if (as === 'style') {
		if (state.sheets.has(rawHref)) return;
		const precedence = String((options as any).precedence ?? 'default');
		insertPrecedenced(state, stylesheetLink(rawHref, precedence, attrs), precedence);
		state.sheets.add(rawHref);
	} else if (!state.scripts.has(rawHref)) {
		document.head.appendChild(asyncScript(rawHref, attrs));
		state.scripts.add(rawHref);
	}
}

/** React DOM `preconnect(href, {crossOrigin?})` — `<link rel="preconnect">`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preconnect', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options !== null && typeof options !== 'object') options = undefined;
	else if (options?.crossOrigin !== undefined && typeof options.crossOrigin !== 'string') {
		options = undefined;
	}
	const safeHref = sanitizeURL(rawHref);
	const corsMode =
		(options as any)?.crossOrigin == null ? '<none>' : String((options as any).crossOrigin);
	insertHeadHint('preconnect:' + corsMode + ':' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'preconnect';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `prefetchDNS(href)` — `<link rel="dns-prefetch">`. */
export function prefetchDNS(href: string): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('prefetchDNS', href, arguments[1], arguments.length > 1);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('dns-prefetch:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'dns-prefetch';
		l.href = safeHref;
		return l;
	});
}

/**
 * React DOM `preloadModule(href, options?)` — `<link rel="modulepreload">`.
 * Module preloads dedupe by href alone (React's resource identity for modules);
 * options apply as attributes through the shared lenient pass-through.
 */
export function preloadModule(href: string, options?: Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preloadModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options === null || typeof options !== 'object') options = undefined;
	else if ('as' in options && typeof options['as'] !== 'string') {
		options = { ...options, as: undefined };
	}
	// A module that preinitModule or a Float script already executes needs no preload.
	if (hasHeadHint('module:' + rawHref) || resourceState().scripts.has(rawHref)) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('modulepreload:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'modulepreload';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/**
 * React DOM `preinitModule(href, options?)` — `<script type="module" async src>`.
 * Only the `script` destination exists for module preinit (React's contract);
 * any other `as` fails closed as a no-op rather than executing the module.
 */
export function preinitModule(
	href: string,
	options?: { as?: string } & Record<string, unknown>,
): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinitModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options != null && typeof options !== 'object') return;
	if ((options?.as ?? 'script') !== 'script') return;
	// One executable per src: a live Float script (SSR-seeded or client-
	// discovered) already satisfies this init.
	const state = resourceState();
	if (state.scripts.has(rawHref)) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('module:' + rawHref, () => {
		const s = document.createElement('script');
		s.type = 'module';
		(s as HTMLScriptElement).src = safeHref;
		(s as HTMLScriptElement).async = true;
		applyHintAttrs(s, options ? { ...options, as: undefined } : undefined);
		return s;
	});
	state.scripts.add(rawHref);
}

// ---------------------------------------------------------------------------
// React Float resources — `<link rel="stylesheet" href precedence>` and
// `<script async src>` rendered at a component's body root. Unlike per-site
// hoisted head elements (headBlock), a resource is GLOBAL: keyed by href/src,
// deduped across the whole page, stylesheet groups ordered by precedence
// (first-encounter group order, appended within a group), and RETAINED after
// unmount — unloading a stylesheet or re-running a script is never safe, so
// React never removes resources and neither does Octane. The one exception is
// a root that replaces a failed hydration: it discards the resources in the
// server DOM it clears (hydrationFallbackNodes), as React's clearContainer
// does for an element container, and since the dedupe state still counts
// them, its client render does not insert them again. Suspend-until-loaded
// ("suspensey" commit) is deliberately out of scope. The first client call
// seeds dedupe state from SSR-emitted tags (data-precedence / data-oct-res),
// so hydration never duplicates.
//
// The element waits for its render's commit, as React's acquireResource runs
// in the mutation phase (#2043). A render reads the committed identity only,
// so a resource the page already has costs a set lookup; the identity check
// runs again at commit, where the first request in render order wins. As in
// React's getResource, a stylesheet the document lacks also starts loading
// while the render discovers it, through a style preload; a style or script
// resource writes nothing until its commit.
// ---------------------------------------------------------------------------

interface ResourceState {
	sheets: Set<string>;
	scripts: Set<string>;
	/** Last live element of each stylesheet precedence group. */
	tails: Map<string, Element>;
	/** Tail of the LAST group in document order — where a new group starts. */
	lastTail: Element | null;
}

let _resourceState: ResourceState | null = null;

function resourceState(): ResourceState {
	if (_resourceState !== null) return _resourceState;
	const state: ResourceState = {
		sheets: new Set(),
		scripts: new Set(),
		tails: new Map(),
		lastTail: null,
	};
	if (typeof document !== 'undefined') {
		// Stylesheet links and style resources share one identity namespace and
		// one precedence-group ordering; querySelectorAll returns document order,
		// so tails/lastTail land on each group's last member.
		const sheets = document.querySelectorAll(
			'link[rel="stylesheet"][data-precedence], style[data-precedence]',
		);
		for (let i = 0; i < sheets.length; i++) {
			const el = sheets[i];
			const href = el.getAttribute('href') ?? el.getAttribute('data-href');
			if (href !== null) state.sheets.add(href);
			state.tails.set(el.getAttribute('data-precedence') as string, el);
			state.lastTail = el;
		}
		// One executable identity per src: classic Float scripts (data-oct-res)
		// AND preinitModule scripts (data-oct-hint "module:…") share the set.
		const scripts = document.querySelectorAll('script[data-oct-res], script[data-oct-hint]');
		for (let i = 0; i < scripts.length; i++) {
			const el = scripts[i];
			const hint = el.getAttribute('data-oct-hint');
			if (hint !== null && !hint.startsWith('module:')) continue;
			const src = el.getAttribute('src');
			if (src !== null) state.scripts.add(src);
		}
		// Streaming SSR can deliver Float sheets AFTER this state seeded (a late
		// boundary's wave carrier arriving mid-hydration). The stream's inline
		// $OCTRH hands each tag to this registrar once it exists, so one live
		// authority keeps deduping and precedence ordering in both directions;
		// before any client Float call the inline path inserts directly and the
		// DOM seeding above adopts what it placed.
		if (typeof window !== 'undefined') {
			(window as any).$OCTFR = (el: Element): void => {
				const href = el.getAttribute('href') ?? el.getAttribute('data-href');
				if (href === null || state.sheets.has(href)) return;
				insertPrecedenced(state, el, el.getAttribute('data-precedence') ?? '');
				state.sheets.add(href);
			};
		}
	}
	return (_resourceState = state);
}

/** Insert a sheet-family resource into its precedence group (shared ordering). */
function insertPrecedenced(state: ResourceState, el: Element, precedence: string): void {
	const tail = state.tails.get(precedence);
	if (tail !== undefined && tail.isConnected) {
		// Existing group: append after its current tail.
		tail.after(el);
		if (state.lastTail === tail) state.lastTail = el;
	} else if (state.lastTail !== null && state.lastTail.isConnected) {
		// New group: starts after the last existing group, keeping groups
		// contiguous in first-encounter order.
		state.lastTail.after(el);
		state.lastTail = el;
	} else {
		document.head.appendChild(el);
		state.lastTail = el;
	}
	state.tails.set(precedence, el);
}

/** Handled by the resource insert itself; everything else applies as an attribute. */
const RESOURCE_OWN_ATTRS = new Set(['precedence', 'href', 'src', 'rel', 'async']);

function applyResourceAttrs(el: Element, attrs: Record<string, unknown>): void {
	for (const k in attrs) {
		if (RESOURCE_OWN_ATTRS.has(k)) continue;
		const v = (attrs as any)[k];
		if (v == null || v === false || typeof v === 'function') continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		// A commit must not throw on a name the platform rejects (setAttribute).
		if (!VALID_ATTR_NAME.test(name)) continue;
		el.setAttribute(name, sanitizeURLAttribute(el.localName, name, v === true ? '' : String(v)));
	}
}

/** A detached `<link rel="stylesheet">` for a resource or a preinit. */
function stylesheetLink(href: string, precedence: string, attrs: Record<string, unknown>): Element {
	const l = document.createElement('link');
	l.rel = 'stylesheet';
	l.href = sanitizeURL(href);
	l.setAttribute('data-precedence', precedence);
	applyResourceAttrs(l, attrs);
	return l;
}

/** A detached `<script async src>` for a resource or a preinit. */
function asyncScript(src: string, attrs: Record<string, unknown>): Element {
	const s = document.createElement('script');
	(s as HTMLScriptElement).src = sanitizeURL(src);
	(s as HTMLScriptElement).async = true;
	s.setAttribute('data-oct-res', '');
	applyResourceAttrs(s, attrs);
	return s;
}

/**
 * Insert a resource element at the open root render's commit, or now outside
 * one. React acquires a resource only for a fiber that commits, so a dropped
 * render queues nothing that runs, and an arm that failed or was replaced
 * leaves only its hints: the element is skipped when its requesting Block has
 * unmounted. That arm's deletion may be queued after this entry, so the entry
 * first moves behind everything its render queued.
 */
function requestResourceElement<T>(insert: (arg: T) => void, arg: T): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction === null) insert(arg);
	else transaction.ops.push(commitResourceElement, [insert, arg, CURRENT_BLOCK, transaction.ops]);
}

function commitResourceElement(entry: [(arg: any) => void, any, Block | null, any[] | null]): void {
	const ops = entry[3];
	if (ops !== null) {
		entry[3] = null;
		ops.push(commitResourceElement, entry);
	} else if (!blockSubtreeDisposed(entry[2])) entry[0](entry[1]);
}

/**
 * React's getResource: a stylesheet resource the document lacks starts
 * loading as the render discovers it, through a style preload keyed like
 * `preload(href, {as: 'style'})`, which stays even if the render never
 * commits. Its options seed a later preinit, as a preload's do.
 */
function preloadStylesheetResource(href: string, attrs: Record<string, unknown>): void {
	const key = 'preload:style:' + href;
	if (hasHeadHint(key)) return;
	stashPreloadTransfer('style', href, attrs);
	const safeHref = sanitizeURL(href);
	insertHeadHint(key, () => {
		const l = document.createElement('link');
		l.rel = 'preload';
		l.href = safeHref;
		l.setAttribute('as', 'style');
		applyResourceAttrs(l, {
			crossOrigin: attrs['crossOrigin'],
			integrity: attrs['integrity'],
			media: attrs['media'],
			hrefLang: attrs['hrefLang'],
			referrerPolicy: attrs['referrerPolicy'],
		});
		return l;
	});
}

function warnInvalidStylesheetResource(reason: string): void {
	let conflict: string;
	if (reason === 'missing-href') {
		conflict = 'requires a non-empty string `href`';
	} else if (reason === 'empty-href') {
		conflict = 'has an empty `href`; a stylesheet resource requires a non-empty string `href`';
	} else {
		const props = reason === 'onLoad+onError' ? '`onLoad` and `onError`' : '`' + reason + '`';
		conflict = 'also has ' + props + ', which requires an independently managed stylesheet';
	}
	console.error(
		'A <link rel="stylesheet"> with `precedence` ' +
			conflict +
			'. It will not be hoisted or deduplicated; remove the conflicting prop or `precedence`.',
	);
}

/** Compiler target for `<link rel="stylesheet" href precedence>` (React Float). */
export function stylesheetResource(
	attrs: Record<string, unknown> | null,
	invalidReason?: string,
): void {
	if (process.env.NODE_ENV !== 'production' && invalidReason !== undefined) {
		warnInvalidStylesheetResource(invalidReason);
		return;
	}
	if (typeof document === 'undefined' || attrs == null) return;
	const href = attrs['href'];
	if (typeof href !== 'string' || href === '' || resourceState().sheets.has(href)) return;
	preloadStylesheetResource(href, attrs);
	requestResourceElement(commitStylesheetResource, attrs);
}

function commitStylesheetResource(attrs: Record<string, unknown>): void {
	const href = attrs['href'] as string;
	const state = resourceState();
	// First instance wins, including its non-key props — matching React's
	// resource identity (later differing props do not retarget a live sheet).
	if (state.sheets.has(href)) return;
	const precedence = attrs['precedence'] == null ? '' : String(attrs['precedence']);
	insertPrecedenced(state, stylesheetLink(href, precedence, attrs), precedence);
	state.sheets.add(href);
}

/**
 * Compiler target for `<style href precedence>` (React Float style resource).
 * Plain CSS keyed by href identity — shares the stylesheet dedupe namespace and
 * precedence-group ordering with link resources; the CSS ships as the tag's
 * text content and is NOT scoped (scoped CSS owns every other `<style>`).
 */
export function styleResource(
	attrs: Record<string, unknown> | null,
	css: string,
	development?: boolean,
): void {
	if (typeof document === 'undefined' || attrs == null) return;
	const href = attrs['href'];
	if (typeof href !== 'string' || href === '' || resourceState().sheets.has(href)) return;
	requestResourceElement(commitStyleResource, [attrs, css, development]);
}

function commitStyleResource([attrs, css, development]: [
	Record<string, unknown>,
	string,
	boolean | undefined,
]): void {
	const href = attrs['href'] as string;
	const state = resourceState();
	if (state.sheets.has(href)) return;
	if (
		process.env.NODE_ENV !== 'production' &&
		development === true &&
		hasHeadHint('preload:style:' + href)
	) {
		console.error(
			'A <style> resource with href "' +
				href +
				'" follows a stylesheet preload for the same href. ' +
				'Inline styles cannot consume a stylesheet preload; remove the preload or use a stylesheet link.',
		);
	}
	const precedence = attrs['precedence'] == null ? '' : String(attrs['precedence']);
	// textContent makes any CSS safe to insert client-side, but the SSR twin
	// must fail closed on "</style" (raw-text serialization) — surface the same
	// authoring diagnostic here so SPA-only development still sees it.
	if (process.env.NODE_ENV !== 'production' && /<\/style/i.test(css)) {
		console.error(
			'A <style href precedence> resource contains "</style"; server rendering will skip it. ' +
				'Load it as a stylesheet link instead.',
		);
	}
	const s = document.createElement('style');
	s.setAttribute('data-precedence', precedence);
	s.setAttribute('data-href', href);
	applyResourceAttrs(s, attrs);
	s.textContent = css;
	insertPrecedenced(state, s, precedence);
	state.sheets.add(href);
}

/**
 * TEST-ONLY: forget all Float resource identity (this repo's test isolation).
 * Resources are page-global by contract — a real page never resets them.
 */
export function resetFloatResourceState(): void {
	_resourceState = null;
	_preloadTransfer = null;
	// The streamed-resource registrar closes over the discarded state.
	if (typeof window !== 'undefined') delete (window as any).$OCTFR;
}

/** Compiler target for `<script async src>` resources (React Float). */
export function scriptResource(attrs: Record<string, unknown> | null): void {
	if (typeof document === 'undefined' || attrs == null) return;
	const src = attrs['src'];
	if (typeof src !== 'string' || src === '' || resourceState().scripts.has(src)) return;
	requestResourceElement(commitScriptResource, attrs);
}

function commitScriptResource(attrs: Record<string, unknown>): void {
	const src = attrs['src'] as string;
	const state = resourceState();
	if (state.scripts.has(src)) return;
	document.head.appendChild(asyncScript(src, attrs));
	state.scripts.add(src);
}
