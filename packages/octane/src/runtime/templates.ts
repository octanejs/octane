// Templates
//
// DOM operation bootstrap, template parsing and cloning, binding bag factories,
// and the text helpers compiled templates call.

import { queueFrontier, usesFrontier, DETACHED_ROOT, BINDING_BAG_ARITY } from './commit.js';
import { hydrating, hydrationStarted } from '../hydration-flag.js';
import { HYDRATION_END } from '../constants.js';
import { describeTextareaChild, textareaChildText } from '../shared-value-helpers.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { FRAMEWORK_POLICY } from '../trusted-types.js';
import {
	HYDRATION_FOR_PREFIX,
	isRangeOpen,
	HYDRATION_FOR_ARM_INDEX,
} from '../hydration-protocol.js';
import { NativeAdoptionMiss } from '../signals/read-protocol.js';
import {
	type SignalHandle,
	SIGNAL_HANDLE,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
} from '../signals/types.js';
import type { Block, Scope } from './types.js';
import { type HydrationDriver, HYDRATION_DRIVER } from './drivers.js';
import type { TrackedThenable } from './use.js';
import { HYDRATION_PASS, CURSOR, type HydrationCapability } from './hydration.js';
import { BlockImpl } from './block.js';
import { CURRENT_SCOPE, ROOT_RENDER_TRANSACTION } from './render.js';
import { PRESENTATION_HYDRATION, preparePresentationOperation } from './hydration-presentation.js';
import { readSignalBinding } from './signal-bindings.js';
import { isSignalHandle } from '../signals/handle-protocol.js';
import {
	DANGER_HTML_ACTIVE,
	DANGER_HTML_STATIC_CHILD,
	DANGER_HTML_SPREAD_CHILD,
	SVG_NS,
	MATHML_NS,
	deoptChildNamespace,
} from './host-props.js';
import { isElementDescriptor } from './elements.js';
import { DEOPT_DESC } from './deopt.js';
import { DEFAULT_VALUE_BASELINE } from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ---------------------------------------------------------------------------
// DOM operations bootstrap (Svelte's operations.js technique, measured for
// octane on the js-framework / dbmon / news suites).
//
// Two independent tricks, both initialized lazily so importing the runtime in
// a DOM-less process (compiler tooling, node-only tests) stays safe:
//
// 1. `firstChild` / `nextSibling` reads on the runtime's SHARED helpers
//    (`child`, `sibling`, the hydration cursor walks, range clears) see every
//    DOM hidden class — element tags, Text, Comment — at ONE call site, so the
//    property access goes megamorphic. Calling the native accessor through a
//    cached function reference keeps those sites monomorphic: the C++ accessor
//    doesn't dispatch on the receiver's map. (Compiled template walks —
//    `_root.firstChild.nextSibling…` — stay raw property access on purpose:
//    each generated mount has its own per-template call sites, which V8 keeps
//    mono/polymorphic already.)
//
// 2. The runtime polls expando slots on nodes that mostly DON'T carry them —
//    `$o<type>` handler bundles + `$$portalParent` on every ancestor of every
//    delegated event, `$$portalEnd`/`$$deoptKey` in the de-opt child scans,
//    `$$ctrl`/`__oct_suppress` on form/hydration paths. A read of a property
//    the object does NOT have walks the whole prototype chain and cannot be
//    negatively cached as well as a hit. Pre-seeding the key as `undefined` on
//    the prototype turns every such miss into a fast constant proto hit.
//    Handler-slot keys are seeded per delegated event type at registration
//    (delegateEvents / delegateCaptureEvents), the fixed set here.
// ---------------------------------------------------------------------------

let firstChildGetter: ((this: Node) => ChildNode | null) | undefined;
export let nextSiblingGetter: ((this: Node) => ChildNode | null) | undefined;

export function getFirstChild(node: Node): ChildNode | null {
	// Fallback keeps DOM-less/uninitialized callers correct; the branch is a
	// single well-predicted check once initDomOperations has run.
	return firstChildGetter === undefined ? node.firstChild : firstChildGetter.call(node);
}

export function getNextSibling(node: Node): ChildNode | null {
	return nextSiblingGetter === undefined ? node.nextSibling : nextSiblingGetter.call(node);
}

/** Pre-seed one expando key on a prototype (see bootstrap comment, trick 2). */
export function seedExpando(proto: object, key: PropertyKey, enumerable = true): void {
	if (key in proto) return;
	if (enumerable) (proto as any)[key] = undefined;
	else Object.defineProperty(proto, key, { value: undefined, writable: true, configurable: true });
}

let domOperationsReady = false;

/**
 * One-time client bootstrap. Called from every cold entry that precedes DOM
 * work — parseTemplate (first template mount), root creation/hydration, and
 * delegation-target registration — and a no-op everywhere without a DOM.
 */
export function initDomOperations(): void {
	if (domOperationsReady || typeof Element === 'undefined') return;
	domOperationsReady = true;
	const nodeProto = Node.prototype;
	firstChildGetter = Object.getOwnPropertyDescriptor(nodeProto, 'firstChild')?.get;
	nextSiblingGetter = Object.getOwnPropertyDescriptor(nodeProto, 'nextSibling')?.get;
	const elementProto = Element.prototype;
	if (Object.isExtensible(elementProto)) {
		// Polled on every delegated event's ancestor walk.
		seedExpando(elementProto, '$$portalParent');
		// De-opt child scans poll these on every owned child.
		seedExpando(elementProto, '$$portalEnd');
		seedExpando(elementProto, '$$deoptKey');
		// Controlled-form and hydration-suppression checks.
		seedExpando(elementProto, '$$ctrl');
		seedExpando(elementProto, '__oct_suppress');
		// clone()/drainFrag() fragment-wrapper discriminants.
		seedExpando(elementProto, '__oct_frag');
		seedExpando(elementProto, '__oct_vfrag');
		// Raw HTML ownership is polled by dynamic child slots after the first raw host.
		// New private keys must not appear in for...in walks over DOM elements.
		seedExpando(elementProto, DANGER_HTML_ACTIVE, false);
		seedExpando(elementProto, DANGER_HTML_STATIC_CHILD, false);
		seedExpando(elementProto, DANGER_HTML_SPREAD_CHILD, false);
		// De-opt child scans and uncontrolled form baselines also read absent symbols.
		seedExpando(elementProto, DEOPT_DESC, false);
		seedExpando(elementProto, DEFAULT_VALUE_BASELINE, false);
		if (process.env.NODE_ENV !== 'production') {
			seedExpando(elementProto, '__oct_loc');
		}
	}
	// The de-opt/portal scans also poll Text and Comment children (both inherit
	// from CharacterData).
	if (typeof CharacterData !== 'undefined' && Object.isExtensible(CharacterData.prototype)) {
		seedExpando(CharacterData.prototype, '$$portalEnd');
		seedExpando(CharacterData.prototype, '$$deoptKey');
		seedExpando(CharacterData.prototype, DEOPT_DESC, false);
	}
}

// ---------------------------------------------------------------------------
// Templates: inert module token → parse on first mount → clone per instance
// ---------------------------------------------------------------------------

// Namespace flags: 0 = HTML, 1 = SVG, 2 = MathML, 3 = opaque component
// destination. An opaque template is not parsed at module evaluation: ordinary
// component bodies and component children can be inserted under HTML, SVG, or
// MathML, so clone() resolves their concrete parser context from the render
// block's actual parent and caches one parsed template per destination.
export interface LazyTemplateRecord {
	html: string;
	ns: 0 | 1 | 2 | 3;
	/**
	 * Raw multi-root markup: the number of roots, as the compiler counts them.
	 * 0 = one root, or HTML roots already wrapped in `<octane-frag>`, which the
	 * compiler no longer emits.
	 */
	frag: number;
	parsed: Array<Node | null>;
	/**
	 * Lazily computed adoption-root descriptor for PROD hydration's parse-free
	 * root check (see HydrationCapability.cloneLazy): 0 = not computed yet, a
	 * string = the root element's tag as written in `html`, 3 / 8 = a text /
	 * comment-anchor root (nodeType-only match). Declared in the `template()`
	 * literal so the record's hidden class never transitions.
	 */
	root: string | 0 | 3 | 8;
}

const LAZY_TEMPLATE = Symbol('octane.lazy-template');

// The parser needs a wrapper to establish foreign-content namespaces and to
// retain HTML fragment roots. Transfer ordinary children once while caching
// the template; every later clone can insert the native fragment in one call.
// Custom elements keep the wrapper: their connectedCallback can synchronously
// inspect which earlier siblings have already joined the live parent.
function fragmentTemplate(wrapper: Element): Node {
	for (const descendant of wrapper.querySelectorAll('*')) {
		if (descendant.localName.includes('-') || descendant.hasAttribute('is')) {
			(wrapper as any).__oct_frag = true;
			return wrapper;
		}
	}
	const fragment = document.createDocumentFragment();
	let child: Node | null;
	while ((child = getFirstChild(wrapper)) !== null) fragment.appendChild(child);
	(fragment as any).__oct_frag = true;
	return fragment;
}

function parseTemplate(html: string, ns: 0 | 1 | 2, frag: number): Node {
	initDomOperations();
	const t = document.createElement('template');
	if (ns === 0) {
		// Parse roots in template context first: a synthetic HTML parent would
		// discard table sections, rows, and cells before they reach their host.
		t.innerHTML = FRAMEWORK_POLICY ? FRAMEWORK_POLICY.createHTML(html) : html;
		if (frag) {
			// Stay in the template's inert document so custom elements upgrade in
			// authored insertion order, rather than while assembling the cache.
			const owner = t.content.ownerDocument;
			const wrapper = owner.createElement('octane-frag');
			wrapper.appendChild(t.content);
			return fragmentTemplate(wrapper);
		}
		const root = getFirstChild(t.content) as Element;
		// Keep accepting older compiled markup with an explicit fragment wrapper.
		if (root.nodeType === 1 && root.localName === 'octane-frag') {
			return fragmentTemplate(root);
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
	const wrapped = `<${wrap}>${html}</${wrap}>`;
	t.innerHTML = FRAMEWORK_POLICY ? FRAMEWORK_POLICY.createHTML(wrapped) : wrapped;
	const wrapEl = getFirstChild(t.content) as Element;
	if (frag) {
		return fragmentTemplate(wrapEl);
	}
	return getFirstChild(wrapEl) as Element;
}

// Only a compiled module with an opaque template installs the destination
// lookup below (enableOpaqueTemplates), so a bundle whose templates all name
// their namespace keeps none of it.
let OPAQUE_TEMPLATES = false;
/** @internal */
export function enableOpaqueTemplates(): void {
	OPAQUE_TEMPLATES = true;
}

/* @__NO_SIDE_EFFECTS__ */
export function template(html: string, ns: number = 0, frag: number = 0): Element {
	return {
		[LAZY_TEMPLATE]: {
			html,
			ns: ns === 1 ? 1 : ns === 2 ? 2 : ns === 3 ? 3 : 0,
			frag,
			parsed: [null, null, null],
			root: 0,
		} satisfies LazyTemplateRecord,
	} as unknown as Element;
}

// Both arguments belong to the freshly parsed, detached template cache. A
// parser-created script stays inert when cloned, while a never-inserted script
// created in the live document gives each clone normal execution semantics.
function prepareOwnedTemplateScript(parsed: Element, parent: Node | null): Element {
	// Preserve opaque component destinations rather than creating HTML scripts
	// inside foreign content.
	const script = document.createElementNS(parsed.namespaceURI, 'script');
	for (const attr of parsed.attributes) {
		script.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
	}
	script.textContent = parsed.textContent;
	if (parent !== null) parent.replaceChild(script, parsed);
	return script;
}

/** Compiler-only cold preparation for scripts explicitly owned by a template mount. */
/* @__NO_SIDE_EFFECTS__ */
export function scriptTemplate(html: string, ns: number, frag: number, paths: number[][]): Element {
	const token = template(html, ns, frag);
	const lazy = (token as any)[LAZY_TEMPLATE] as LazyTemplateRecord;
	// Only script tokens install cold cache accessors. Ordinary template records
	// and their resolver stay unchanged, and parse-free adoption never reads the
	// parsed cache. Each namespace becomes a plain cached value after preparation.
	for (let namespace = 0; namespace < 3; namespace++) {
		Object.defineProperty(lazy.parsed, namespace, {
			configurable: true,
			enumerable: true,
			get() {
				let root = parseTemplate(html, namespace as 0 | 1 | 2, frag);
				for (const path of paths) {
					let node = root;
					for (const index of path) {
						node = getFirstChild(node)!;
						for (let i = 0; i < index; i++) node = getNextSibling(node)!;
					}
					const script = prepareOwnedTemplateScript(
						node as Element,
						node === root ? null : node.parentNode!,
					);
					if (node === root) root = script;
				}
				Object.defineProperty(lazy.parsed, namespace, {
					value: root,
					writable: true,
					configurable: true,
					enumerable: true,
				});
				return root;
			},
		});
	}
	return token;
}

/**
 * Cheap root scan of a template's HTML source — the HTML parser is never
 * involved. Returns the root element's tag name exactly as written (the
 * compiler emits HTML tags lowercase; SVG keeps its canonical casing, which is
 * also what the parser's case-adjustment produces on the server DOM), or the
 * root's nodeType for a text (3) or comment/`<!>`-anchor (8) root.
 */
function templateRootDescriptor(html: string, at: number = 0): string | 3 | 8 {
	if (html.charCodeAt(at) !== 60 /* < */) return 3;
	const c = html.charCodeAt(at + 1);
	if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90))) return 8;
	let i = at + 2;
	for (; i < html.length; i++) {
		const cc = html.charCodeAt(i);
		if (cc === 62 /* > */ || cc === 47 /* / */ || cc <= 32 /* whitespace */) break;
	}
	return html.slice(at + 1, i);
}

/** The first element child of a parsed template's root, if any. */
export function firstElementChild(template: Node): Node | null {
	let child = getFirstChild(template);
	while (child !== null && child.nodeType !== 1) child = getNextSibling(child);
	return child;
}

/**
 * Whether a parsed template's root leads with an element child, or, when
 * `anywhere`, holds one (rootWalkMisses).
 */
function templateRootHolds(template: Node, anywhere: boolean): boolean {
	return anywhere ? firstElementChild(template) !== null : getFirstChild(template)?.nodeType === 1;
}

/**
 * templateRootHolds read off a lazy template's source, without the parse:
 * after the root's start tag, whose quoted attribute values are skipped, any
 * element start tag is a descendant of the root. A raw text root holds text,
 * and a `<template>` root's content is not its children.
 */
function lazyRootHolds(lazy: LazyTemplateRecord, anywhere: boolean): boolean {
	const root = lazyRootDescriptor(lazy);
	if (
		typeof root !== 'string' ||
		/^(?:script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|plaintext|template)$/.test(
			root,
		)
	)
		return false;
	const html = lazy.html;
	let quote = 0;
	let i = root.length + 1;
	for (; i < html.length; i++) {
		const c = html.charCodeAt(i);
		if (quote !== 0) {
			if (c === quote) quote = 0;
		} else if (c === 34 /* " */ || c === 39 /* ' */) quote = c;
		else if (c === 62 /* > */) break;
	}
	for (i++; i < html.length - 1; i++) {
		if (html.charCodeAt(i) === 60 /* < */) {
			const c = html.charCodeAt(i + 1);
			if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90)) return true;
		}
		if (!anywhere) return false;
	}
	return false;
}

/**
 * Whether an adopted template root's compiled walk would find no element
 * where the template root has one: the server root `server` is empty while
 * the template root holds an element, or its first child is not an element
 * while the template root's is. Only the root's own children are read, never
 * their static content (production adopts that wholesale), and only when the
 * server's first child is not an element.
 */
export function rootWalkMisses(
	server: Node,
	template: Node | null,
	lazy: LazyTemplateRecord | null,
): boolean {
	const first = getFirstChild(server);
	if (first !== null && first.nodeType === 1) return false;
	return template !== null
		? templateRootHolds(template, first === null)
		: lazyRootHolds(lazy!, first === null);
}

function lazyRootDescriptor(lazy: LazyTemplateRecord): string | 3 | 8 {
	const root = lazy.root;
	if (root !== 0) return root;
	return (lazy.root = templateRootDescriptor(lazy.html));
}

/**
 * Is this lazy template a multi-root fragment? Compiled fragments carry `frag`;
 * HTML roots already wrapped in `<octane-frag>` with frag=0 are discriminated
 * by the wrapper tag (mirrors parseTemplate's `__oct_frag` stamping of the
 * parsed root).
 */
export function isLazyFragment(lazy: LazyTemplateRecord): boolean {
	return lazy.frag !== 0 || lazyRootDescriptor(lazy) === 'octane-frag';
}

/**
 * How many roots a multi-root template has. The compiler passes the count as
 * `frag`; a parsed template, or markup already wrapped in `<octane-frag>`,
 * counts its children.
 */
export function templateRootCount(template: Node | LazyTemplateRecord): number {
	let parsed: Node;
	if ((template as Node).nodeType === undefined) {
		const lazy = template as LazyTemplateRecord;
		if (lazy.frag !== 0) return lazy.frag;
		parsed = resolveLazyTemplate(lazy);
	} else parsed = template as Node;
	let count = 0;
	for (let child = getFirstChild(parsed); child !== null; child = getNextSibling(child)) count++;
	return count;
}

/**
 * PROD hydration's adoption-root check — hydrationNodeMatches (nodeType +
 * localName only) answered straight off the template SOURCE so the happy
 * adoption path never forces the template parse.
 */
export function lazyRootMatches(server: Node, lazy: LazyTemplateRecord): boolean {
	const root = lazyRootDescriptor(lazy);
	if (typeof root === 'number') return server.nodeType === root;
	if (server.nodeType !== 1) return false;
	// EXACT compare only — for every valid pairing the parser canonicalizes the
	// server node's localName to the source spelling (HTML/MathML sources are
	// lowercase; SVG camelCase is restored by the parser's case-adjustment), so
	// a difference means a different branch. No case-folding or `<image>`→`img`
	// fallback: those "matches" only arise from INVALID markup (an SVG-only root
	// misplaced in an HTML parent parses lowercased/rewritten) where adopting the
	// wrong-namespace node would be a correctness break. A false mismatch fails
	// safe, exactly as the parsed-template compare does: the nearest boundary,
	// or the root, renders on the client.
	return (server as Element).localName === root;
}

/**
 * lazyRootMatches for a nested fragment's FIRST logical root, read from the
 * template source. A raw fragment's cached descriptor is that root; markup
 * already wrapped in `<octane-frag>` has it after the wrapper. A
 * leading `<!>` is a dynamic hole whose server form (text, a marker range, or
 * nothing) cannot decide a mismatch, so the first static element root after
 * the leading holes decides, as in fragmentRootMatches.
 */
export function lazyFragmentRootMatches(
	server: Node,
	lazy: LazyTemplateRecord,
	hydration: HydrationCapability,
): boolean {
	// A fixed-HTML fragment's roots follow its `<octane-frag>` wrapper.
	const start = lazy.frag !== 0 ? 0 : 13;
	let root = start === 0 ? lazyRootDescriptor(lazy) : templateRootDescriptor(lazy.html, start);
	if (root === 3) return server.nodeType === 3;
	if (root !== 8) return server.nodeType === 1 && (server as Element).localName === root;
	if (hydration.passthroughRoot) return true;
	const html = lazy.html;
	let at = start;
	while (html.startsWith('<!>', at)) at += 3;
	// Past the last root, the descriptor is a number too.
	root = templateRootDescriptor(html, at);
	if (typeof root === 'number') return true;
	const node = hydration.sibling(server, (at - start) / 3);
	return node !== null && node.nodeType === 1 && (node as Element).localName === root;
}

/**
 * Resolve a lazy compiler template token to its parsed (and per-namespace
 * cached) root for the namespace in effect at the current render site.
 */
export function resolveLazyTemplate(lazy: LazyTemplateRecord): Node {
	let ns: 0 | 1 | 2;
	if (lazy.ns === 3) {
		const inherited =
			OPAQUE_TEMPLATES && CURRENT_SCOPE !== null
				? deoptChildNamespace(CURRENT_SCOPE.block.parentNode)
				: undefined;
		ns = inherited === SVG_NS ? 1 : inherited === MATHML_NS ? 2 : 0;
	} else {
		ns = lazy.ns;
	}
	let parsed = lazy.parsed[ns];
	if (parsed === null) {
		parsed = parseTemplate(lazy.html, ns, lazy.frag);
		lazy.parsed[ns] = parsed;
	}
	return parsed;
}

export function clone<T extends Node>(node: T, loc?: string, partialStyles?: string): T {
	// Compiler templates are inert module-scope tokens. Parse each concrete
	// namespace on its first real mount, then clone the cached node thereafter.
	// Non-compiler callers can still hand clone() an ordinary DOM Node directly.
	const lazy =
		(node as any).nodeType === undefined
			? ((node as any)[LAZY_TEMPLATE] as LazyTemplateRecord | undefined)
			: undefined;
	if (lazy !== undefined) {
		const hydration = hydrating ? CURSOR : null;
		// PROD hydration validates adoption roots by nodeType + localName only
		// (hydrationNodeMatches' prod narrowing), answered straight off the
		// template SOURCE: the happy path adopts the server DOM without ever
		// parsing the template. Parsing then happens only on a mismatch and on
		// genuine client-side mounts — both cold during hydration.
		if (process.env.NODE_ENV === 'production' && hydration !== null) {
			return hydration.cloneLazy(lazy, loc) as unknown as T;
		}
		const parsed = resolveLazyTemplate(lazy);
		if (hydration !== null) return hydration.clone(parsed, loc, partialStyles) as T;
		// A template the client render after a deferred mismatch clones (adoptOrDefer).
		if (hydrating && HYDRATION_PASS!.deferred != null) HYDRATION_PASS!.claimBefore(parsed);
		return parsed.cloneNode(true) as T;
	}
	const hydration = hydrating ? HYDRATION_PASS : null;
	if (hydration !== null) {
		if (hydration.depth === 0) return hydration.clone(node, loc, partialStyles);
		if (hydration.deferred !== null) hydration.claimBefore(node);
	}
	return node.cloneNode(true) as T;
}

/** Whether a template starts with a host, an element or text, rather than a hole. */
export function startsWithHost(template: Node): boolean {
	const first = (template as any).__oct_frag === true ? getFirstChild(template) : template;
	return first !== null && first.nodeType !== 8;
}

/**
 * Compiler-emitted for a multi-root template's mount: drain the cloned
 * <octane-frag> wrapper's children into the live parent. While hydrating, the
 * "wrapper" is clone()'s virtual stand-in for server content that is ALREADY
 * in place — nothing to move.
 */
export function drainFrag(root: Node, parent: Node, anchor: Node | null): void {
	if (hydrating && CURSOR !== null && (root as any).__oct_vfrag === true) return;
	if (hydrationStarted && PRESENTATION_HYDRATION?.revision !== undefined)
		HYDRATION_DRIVER!.presentationMiss(false);
	// A committed Block's first mount (a resumed body's) lands at commit, as
	// commitBag's single root does.
	const transaction = ROOT_RENDER_TRANSACTION;
	const block = CURRENT_SCOPE?.block;
	if (
		transaction !== null &&
		block !== undefined &&
		block.createdStamp !== transaction.createdStamp &&
		block instanceof BlockImpl &&
		block.parentNode === parent &&
		usesFrontier(block, parent)
	) {
		parent = queueFrontier(block, parent, anchor);
		anchor = null;
	}
	if (root.nodeType === 11) {
		parent.insertBefore(root, anchor);
		return;
	}
	let c: Node | null;
	while ((c = getFirstChild(root)) !== null) parent.insertBefore(c, anchor);
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
 * literal (still real values, 1-char keys) through `bagOf`. A body with commit
 * cells passes their count and its commit function last (see "Commit
 * functions").
 */
function commitBag<T>(scope: Scope, root: Node | null, bag: T): T {
	const hydration = hydrating ? HYDRATION_PASS : null;
	// The body's holes ran after a deferred hydration mismatch (adoptOrDefer).
	if (hydration !== null && hydration.deferred !== null) hydration.claimAfterHoles();
	if (root !== null) {
		const block = scope.block;
		const end = block.endMarker;
		if (hydration !== null && hydration.depth === 0) hydration.insertRoot(root, block);
		else if (end !== null && end === DETACHED_ROOT) {
			// A committed list's fresh row: its root stays detached until commit. The
			// components of a sole-component row hand the row's end down, so each
			// takes the root up to the row; a lite stand-in has no range of its own.
			for (let b: Block | null = block; b !== null && b.endMarker === end; b = b.parentBlock) {
				b.endMarker =
					(b.startMarker as Node | null | undefined) === undefined ? null : (b.startMarker = root);
				if (b.forSlot) break;
			}
		} else {
			const parent = block.parentNode;
			const transaction = ROOT_RENDER_TRANSACTION;
			// A committed Block's first mount (a resumed body's) lands at commit.
			if (
				transaction !== null &&
				block.createdStamp !== transaction.createdStamp &&
				block instanceof BlockImpl &&
				(block.startMarker === null || block.startMarker !== end) &&
				usesFrontier(block, parent)
			)
				queueFrontier(block, parent, end).appendChild(root);
			else parent.insertBefore(root, end);
		}
	}
	scope.slots[0] = bag;
	return bag;
}

/* prettier-ignore */ export function bag0(s: Scope, r: Node | null, $ = 0, next: any = null): any { return commitBag(s, r, { __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 0 }); }
/* prettier-ignore */ export function bag1(s: Scope, r: Node | null, a: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 1 }); }
/* prettier-ignore */ export function bag2(s: Scope, r: Node | null, a: any, b: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 2 }); }
/* prettier-ignore */ export function bag3(s: Scope, r: Node | null, a: any, b: any, c: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 3 }); }
/* prettier-ignore */ export function bag4(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 4 }); }
/* prettier-ignore */ export function bag5(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 5 }); }
/* prettier-ignore */ export function bag6(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 6 }); }
/* prettier-ignore */ export function bag7(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 7 }); }
/* prettier-ignore */ export function bag8(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 8 }); }
/* prettier-ignore */ export function bag9(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 9 }); }
/* prettier-ignore */ export function bag10(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 10 }); }
/* prettier-ignore */ export function bag11(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 11 }); }
/* prettier-ignore */ export function bag12(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 12 }); }
/* prettier-ignore */ export function bag13(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 13 }); }
/* prettier-ignore */ export function bag14(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 14 }); }
/* prettier-ignore */ export function bag15(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any, o: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 15 }); }
/* prettier-ignore */ export function bag16(s: Scope, r: Node | null, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any, j: any, k: any, l: any, m: any, n: any, o: any, p: any, $ = 0, next: any = null): any { return commitBag(s, r, { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, __journalWindow: 0, $, next, [BINDING_BAG_ARITY]: 16 }); }
// Only a compiler-owned literal that caches its DOM parent opts into the spill brand;
// direct integrations retain their original object and generic journal path.
/* prettier-ignore */ export function bagOf(s: Scope, r: Node | null, bag: any, compilerOwned?: 1): any { if (compilerOwned) bag[BINDING_BAG_ARITY] = -1; return commitBag(s, r, bag); }

/**
 * Text-binding coercion, shared by htext / htextSwap / setText: null/undefined/
 * false render as '' and everything else stringifies (string fast path first —
 * `{x as string}` holes are overwhelmingly already strings). NOTE this is NOT
 * coerceChildText: a text *binding* renders `true` as "true", while a child
 * *slot* renders `true` as empty (React parity for renderable children).
 */
export function coerceText(value: unknown): string {
	if (process.env.NODE_ENV !== 'production' && isSignalHandle(value)) devWarnPlainTextHandle();
	return value == null || value === false ? '' : typeof value === 'string' ? value : String(value);
}

let DEV_PLAIN_TEXT_HANDLE_WARNED = false;

// Only a module with an import from `octane/signals` compiles opaque text holes
// as handle bindings; elsewhere just `$`-named expressions bind. A handle that
// reaches a plain hole would otherwise render as "[object Object]" silently.
function devWarnPlainTextHandle(): void {
	if (DEV_PLAIN_TEXT_HANDLE_WARNED) return;
	DEV_PLAIN_TEXT_HANDLE_WARNED = true;
	console.error(
		'Octane: a signal handle reached a text hole in a module that does not import ' +
			'`octane/signals`, so it rendered as a plain value. Type the prop with ' +
			"`import type { SignalHandle } from 'octane/signals'`, give it a `$` suffix, read it " +
			'with `.get()`, or enable the `opaqueSignalHandles` compiler option.',
	);
}

/**
 * Compiler-emitted for a single-text-child binding's mount. Reuses the cloned
 * template's text placeholder only when the compiler explicitly seeded one,
 * otherwise preserves baseline create/append semantics; while hydrating, ADOPTS the existing server
 * text node so the DOM isn't rebuilt. The prev-value the
 * compiler seeds alongside this makes the first update a no-op when the client
 * value matches the server text (avoiding a mismatch re-render).
 */
export function htext(el: Node, value: unknown, seeded: 1 | undefined = undefined): Text {
	// Coerce here (mirrors setText) rather than at every call site — keeps the
	// per-text-hole mount codegen to a bare `htext(el, _v)`. Mount-once, so folding
	// the coercion in costs nothing on the hot update path. A string needs none.
	const text = typeof value === 'string' ? value : coerceText(value);
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) return hydration.htext(el, text);
	if (seeded === 1) {
		const first = firstChildGetter === undefined ? el.firstChild : firstChildGetter.call(el);
		if (first !== null && first.nodeType === 3) {
			(first as Text).nodeValue = text;
			return first as Text;
		}
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
	const text = typeof value === 'string' ? value : coerceText(value);
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) return hydration.htextSwap(posNode, text);
	// Fresh mount: posNode is the `<!>` placeholder — replace it in place.
	const t = document.createTextNode(text);
	const parent = posNode!.parentNode!;
	parent.replaceChild(t, posNode!);
	return t;
}

export function rejectTextareaChild(child: unknown): never {
	throw new Error(formatClientError(336, describeTextareaChild(child, isElementDescriptor)));
}

// One part of a <textarea>'s folded children: a `{x as string}` hole keeps
// text-binding coercion, anything else is a renderable child that must be text.
function textareaPartText(part: unknown, textHole: boolean): string {
	return textHole ? coerceText(part) : textareaChildText(part, rejectTextareaChild);
}

function joinTextareaParts(
	parts: readonly unknown[],
	textHoles: string | undefined,
	read: (handle: SignalHandle<unknown>) => unknown,
): string {
	let text = '';
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		text += textareaPartText(
			isSignalHandle(part) ? read(part) : part,
			textHoles !== undefined && textHoles.charCodeAt(i) === 116, // 't'
		);
	}
	return text;
}

/**
 * @internal A <textarea>'s authored children, folded into the one string its
 * template binds as the host's only Text node. Textarea content is RCDATA, so
 * the compiler cannot give its holes `<!>` placeholders or let the server frame
 * them (the parser would keep either as literal text). `textHoles` marks the
 * `{x as string}` parts with a 't'. With a signal handle among the parts the
 * result is one derived handle over them, so the ordinary direct text binding
 * subscribes to every signal and rewrites the whole text when any changes.
 */
export function textareaText(parts: unknown[], textHoles?: string): unknown {
	let handles: SignalHandle<unknown>[] | undefined;
	for (const part of parts) if (isSignalHandle(part)) (handles ??= []).push(part);
	if (handles === undefined) return joinTextareaParts(parts, textHoles, readSignalBinding);
	const signals = handles;
	return {
		[SIGNAL_HANDLE]: true,
		kind: 'derived',
		key: signals.map((handle) => handle.key).join('+'),
		[SIGNAL_BINDING_READ]: () => joinTextareaParts(parts, textHoles, readSignalBinding),
		get: () => joinTextareaParts(parts, textHoles, (handle) => handle.get()),
		[SIGNAL_BINDING_SUBSCRIBE](notify: () => void, onRetire?: () => void) {
			const stops = signals.map((handle) => handle[SIGNAL_BINDING_SUBSCRIBE](notify, onRetire));
			return () => {
				for (const stop of stops) stop();
			};
		},
	} as unknown as SignalHandle<string>;
}

/** @internal Text holes in authored binding views retain an addressable range, including when empty. */
export function bindingText(posNode: Node | null, value: unknown, marker: string): Text {
	const text = coerceText(value);
	const hydration = hydrating ? CURSOR : null;
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame?.revision !== undefined) {
		// Client signal bindings reach this text hole too: only the driver names
		// the range validator, so that client-only bundles drop it.
		const driver: HydrationDriver = HYDRATION_DRIVER!;
		const range = driver.presentationRange(frame, posNode, marker, 'text');
		const existing = getNextSibling(posNode!);
		if (existing === range.end) {
			const node = document.createTextNode(text);
			preparePresentationOperation(frame, posNode!, 'text', () =>
				range.end.parentNode!.insertBefore(node, range.end),
			);
			return node;
		}
		if (existing?.nodeType !== 3 || getNextSibling(existing) !== range.end)
			driver.presentationMiss();
		preparePresentationOperation(frame, existing, 'text', () => {
			if (existing.nodeValue !== text) existing.nodeValue = text;
		});
		return existing as Text;
	}
	// Only hydrateRoot constructs the capability, so client-only bundles drop the
	// range-marker validator that adoption needs.
	const adopted = hydration?.adoptBindingText(posNode, text);
	if (adopted) return adopted;
	const parent = posNode!.parentNode!;
	const close = document.createComment(HYDRATION_END);
	(posNode as Comment).data = marker;
	parent.insertBefore(close, getNextSibling(posNode!));
	const node = document.createTextNode(text);
	parent.insertBefore(node, close);
	return node;
}

/**
 * A Hydrate island's activation suspended on `thenable` outside any Suspense
 * arm inside it. As a dehydrated Suspense arm's attempt does, the island
 * discards the attempt, keeping its server DOM, and adopts afresh once
 * `thenable` settles. Like a mismatch, it passes every boundary inside the
 * island (isAdoptionControl).
 */
export class DeferredHydrationSuspension extends NativeAdoptionMiss {
	constructor(readonly thenable: TrackedThenable<unknown>) {
		super('', '');
		this.name = 'DeferredHydrationSuspension';
	}
}

/** -1 = not an @for open, 0 = server @empty, 1 = server items (a binding view's too). */
export function ssrForMarkerState(node: Node): -1 | 0 | 1 {
	if (node.nodeType !== 8) return -1;
	const data = (node as Comment).data;
	if (!data.startsWith(HYDRATION_FOR_PREFIX) || !isRangeOpen(data)) return -1;
	return data.charCodeAt(HYDRATION_FOR_ARM_INDEX) === 48 ? 0 : 1;
}

/** Logical index-0 child: `node.firstChild` for both client and hydration. */
export function child<T extends Node>(node: T): Node | null {
	// While hydrating, a multi-root clone() can hand back the virtual-fragment
	// stand-in — a plain object whose `firstChild` is a snapshot property (see
	// adopt()) — and the native accessor throws on a non-Node receiver. Keep the
	// plain read on the hydration branch; client mounts always hold a real Node.
	if (hydrating || firstChildGetter === undefined) return node.firstChild;
	return firstChildGetter.call(node);
}

/**
 * The n-th logical sibling after `node`. Client: plain `.nextSibling` × n.
 * Hydrating: a `<!--[-->…<!--]-->` block counts as ONE step (we jump past its
 * range), so an element/hole after a block resolves to the right server node.
 */
export function sibling(node: Node, n: number = 1): Node | null {
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) return hydration.sibling(node, n);
	let c: Node | null = node;
	for (let i = 0; i < n; i++) {
		// Over-walk (cursor already past the last node) → return null, don't throw.
		if (c === null) return null;
		c = nextSiblingGetter === undefined ? c.nextSibling : nextSiblingGetter.call(c);
	}
	return c;
}
