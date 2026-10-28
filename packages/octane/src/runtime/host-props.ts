// Host props
//
// The low-level host writers: text, attributes and their coercion, namespaces,
// dangerouslySetInnerHTML, styles, class names, spread props and host prop
// sources.

import { pendingWrites, resolveSignalHostPropSources } from './signal-bindings.js';
import { hydrating } from '../hydration-flag.js';
import {
	// Read only on setAttribute's cold dangerouslySetInnerHTML arm.
	VOID_ELEMENTS,
	SVG_ONLY_TAGS,
	ATTRIBUTE_ALIASES,
	VALID_ATTR_NAME,
	isEnumeratedBooleanAttr,
	BOOLEAN_ATTR_PROPS,
	POSITIVE_NUMERIC_ATTR_PROPS,
	cssStyleValue,
} from '../constants.js';
import { hasOwnProp } from '../has-own.js';
import {
	isAriaAttributeName,
	ariaAttributeWarning,
	isUnknownAriaAttribute,
	unknownAriaAttributeWarning,
} from '../aria-diagnostics.js';
import {
	hostPropertyWarning,
	invalidHostPropertiesWarning,
	booleanAttributeStringWarning,
	unsupportedAttributeCoercionWarning,
	emptyResourceUrlWarning,
} from '../host-property-diagnostics.js';
import { unpatchedAttribute, unpatchedClass, unpatchedStyle } from '../hydration/dev-values.js';
import { sanitizeURLAttribute, sanitizeURL } from '../sanitize-url.js';
import { trustedOr } from '../trusted-types.js';
import { formatClientError } from '../error-codes.client.generated.js';
import {
	normalizeClass,
	styleName,
	devWarnStyleProperty,
	devWarnStyleCoercion,
	mergeClass,
} from '../css.js';
import type { Scope, Block, SlotNext, HostPropSource } from './types.js';
import { queueRefAttach, TRANSITION_JOURNAL, TRANSITION_JOURNAL_DEPTH } from './drivers.js';
import { queueRefDetach, attachRef } from './refs.js';
import { VIEW_TRANSITION_DRIVER, journalRootProperty, reportEffectError } from './engine.js';
import { HYDRATION_PASS, CURSOR } from './hydration.js';
import { hiddenTextWriter, hiddenStyleWriter } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
} from './render.js';
import { setEventHandler } from './hydration-presentation.js';
import { noteDeoptRef, markInputCheckedness } from './deopt.js';
import { bagRecord, journalBag } from './commit.js';
import { getFirstChild, coerceText } from './templates.js';
import { setFormAction, setFormActionAttribute } from './actions.js';
import {
	isEventKey,
	eventSlot,
	devEventListener,
	_delegated,
	_delegatedCapture,
	delegateEvents,
	delegateCaptureEvents,
} from './events.js';
import {
	setAutoFocus,
	queueDevFormDiagnostic,
	setNativeChangeDiagnosticMetadata,
	setValue,
	setChecked,
	setSelectValue,
	setDefaultValue,
	setDefaultChecked,
	applyFormControlValues,
	isControlledHostProp,
} from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ---------------------------------------------------------------------------
// Patch helpers — low-level writers apply values with their required coercion
// and DOM checks. Raw-value guards live in compiled/authored callers or the
// guarded scalar-binding and renderable-text wrappers.
// ---------------------------------------------------------------------------

export function updateTextValue(node: Text, value: string): void {
	if (hiddenTextWriter !== null && hiddenTextWriter(node, value)) return;
	const previous = node.nodeValue;
	if (previous !== value) {
		// A held window restores the bag that chose this write, not the DOM: a
		// render writes committed text only through its commit (#2043).
		if (TRANSITION_JOURNAL) journalBag();
		node.nodeValue = value;
	}
}

export function setText(node: Text | null, value: any, host?: Node): void {
	// Unconditional writer: explicit text bindings guard cached raw values inline;
	// textHoleUpdate and childTextHoleUpdate do the equivalent primitive check
	// before using a cached Text node. The cache stores the raw input, not its
	// coerced DOM string, so different raw values may still produce the same text.
	// Do not read nodeValue here: the binding paths already chose this write, and
	// a DOM text getter can materialize an extra string on every update.
	//
	// Older compiled modules retain only the host. htext creates its Text child
	// even for an empty value; preserve that calling convention on intact DOM.
	const target = node ?? (host!.firstChild as Text);
	// A hydrating render writes no adopted DOM (HydrationCapability.writeText).
	if (hydrating && HYDRATION_PASS?.writeText(target, coerceText(value)) === true) return;
	//
	// View-transition dirty tracking and the bag snapshot remain at this write
	// boundary. The optional driver marks the innermost boundary only during a
	// wrapped drain.
	if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.markDirty();
	if (TRANSITION_JOURNAL) journalBag();
	//
	// Write via `nodeValue` (a `Node`-level accessor) rather than `data` (which
	// lives on `CharacterData` one prototype hop deeper) — it's measurably faster
	// for the hot text-update path.
	const text = coerceText(value);
	if (hiddenTextWriter !== null && hiddenTextWriter(target, text)) return;
	target.nodeValue = text;
}

/**
 * A render's new text for a Text node the DOM shows (#2043). A root render that
 * may be dropped queues the write for its commit, as bagDone queues a template's
 * commit function; a Block that render discards whole, and a render nothing can
 * drop, write at once. Once a transaction queued a write to `node`, the DOM no
 * longer shows what render last asked for, so every later change queues too and
 * commit applies them in order.
 */
export function renderText(block: Block, node: Text, str: string): void {
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(block);
	if (transaction === null) {
		updateTextValue(node, str);
		return;
	}
	const queued = transaction.texts;
	if (queued === null || !queued.has(node)) {
		// A hidden Text keeps its value aside (hiddenTextWriter), so the DOM shows ''.
		if (hiddenTextWriter === null && node.nodeValue === str) return;
		(transaction.texts ??= new Set()).add(node);
	}
	if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.markDirty();
	transaction.ops.push(commitText, [node, str]);
}

function commitText(write: [Text, string]): void {
	updateTextValue(write[0], write[1]);
}

/**
 * setText from a render (#2043): a root render that may be dropped queues the
 * write for its commit. The caller's raw-value cache chose the write, so render
 * compares nothing, and a bag the caller publishes next is snapshotted first,
 * as setText does. Commit functions call setText itself.
 */
export function setRenderText(node: Text, value: any): void {
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction === null) return setText(node, value);
	if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.markDirty();
	if (TRANSITION_JOURNAL) journalBag();
	transaction.ops.push(commitSetText, [node, value]);
}

function commitSetText(write: [Text, unknown]): void {
	setText(write[0], write[1]);
}

/**
 * Compact compiler binding ABI. Evaluate the authored value first, compare its
 * raw identity, then call the ordinary writer. Returning only after that writer
 * succeeds keeps the caller's previous-value publication after coercion, errors,
 * and transition journaling. The binding bag and its direct field reads stay at
 * the call site; these helpers allocate nothing and never index a bag dynamically.
 * Controlled form properties deliberately do not use this identity guard.
 */
// An identical raw value needs no write, except a first `undefined` over an
// adopted server element: its cache slot has not yet reconciled the server
// attribute, which the writer removes. The direct-signal path does the same.
export function attributeUnchanged(previous: unknown, value: unknown): boolean {
	if (previous !== value) return false;
	if (value !== undefined) return true;
	const hydration = hydrating ? CURSOR : null;
	return hydration === null;
}

export function setAttributeIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setAttribute(el, name, value);
	return value;
}

export function setPlainAttributeIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setPlainAttribute(el, name, value);
	return value;
}

export function setURLAttributeIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setURLAttribute(el, name, value);
	return value;
}

export function setStringDataIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setStringData(el, name, value);
	return value;
}

export function setBooleanAttributeIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setBooleanAttribute(el, name, value);
	return value;
}

export function setAriaAttributeIfChanged(
	value: unknown,
	previous: unknown,
	el: Element,
	name: string,
): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setAriaAttribute(el, name, value);
	return value;
}

export function setClassNameIfChanged(value: unknown, previous: unknown, el: Element): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setClassName(el, value);
	return value;
}

export function setClassAttrIfChanged(value: unknown, previous: unknown, el: Element): unknown {
	if (attributeUnchanged(previous, value)) return previous;
	setClassAttr(el, value);
	return value;
}

// Compiler-only path for a fresh class literal: compare its composed value,
// while still evaluating its array/object entries on every render. Fresh
// literals are always truthy, so an empty result writes class="" rather than
// removing the attribute. The ordinary setter owns hydration and journaling.
export function updateFreshClassName(value: unknown, previous: unknown, el: Element): string {
	const next = normalizeClass(value);
	if (previous !== next) setClassName(el, next);
	return next;
}

export function updateFreshClassAttr(value: unknown, previous: unknown, el: Element): string {
	const next = normalizeClass(value);
	if (previous !== next) setClassAttr(el, next);
	return next;
}

/**
 * Set authored inline-script source without asking the HTML parser to interpret it.
 * This is the client half of the compiler's `<script dangerouslySetInnerHTML>`
 * specialization: strings containing `</script><script>...` remain one inert script
 * node instead of becoming sibling markup. Server serialization additionally escapes
 * closing/opening script tokens because it is concatenated into an HTML response.
 */
export function setScriptText(el: Element, value: any): void {
	const text = value == null ? '' : String(value);
	const raw = typeof value === 'object' ? trustedOr(value, text) : text;
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction !== null) {
		transaction.ops.push(commitScriptText, [el, raw]);
		return;
	}
	// An unchanged body writes nothing. A change goes through the script's own
	// text sink, never its existing Text node, so Trusted Types sees every write:
	// a TrustedScript reaches it, and an enforcing page rejects a string.
	const first = getFirstChild(el);
	if (first !== null && first === el.lastChild && first.nodeType === 3 && first.nodeValue === text)
		return;
	if (ROOT_RENDER_TRANSACTION !== null) journalBag();
	el.textContent = raw;
}

/**
 * React-compatible `dangerouslySetInnerHTML`. Hydration keeps an adopted
 * element's server content (HydrationCapability.adoptHTML) and accepts it as
 * the client's HTML, so only a changed string rewrites it, as in React 19.3.
 */
export function setHTML(el: Element, value: any): void {
	const next = value == null ? '' : String(value);
	const html = typeof value === 'object' ? trustedOr(value, next) : next;
	const host = el as any;
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) {
		hydration.adoptHTML(el, html);
		journalRootProperty(el, DANGER_HTML_VALUE, host[DANGER_HTML_VALUE]);
		host[DANGER_HTML_VALUE] = next;
		return;
	}
	if (el.localName === 'script') {
		setScriptText(el, html);
		return;
	}
	// Fresh wrappers must not replace identical children. Compare accepted authored
	// HTML, including successful hydration adoption.
	if (host[DANGER_HTML_VALUE] === next) return;
	journalRootProperty(el, DANGER_HTML_VALUE, host[DANGER_HTML_VALUE]);
	host[DANGER_HTML_VALUE] = next;
	// A render that may be dropped replaces the raw HTML at its commit, so a
	// dropped one leaves the committed nodes, and any input in them, untouched.
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction !== null) {
		journalBag();
		transaction.ops.push(commitHTML, [el, html]);
	} else el.innerHTML = html;
}

function commitHTML(write: [Element, string]): void {
	write[0].innerHTML = write[1];
}

function commitScriptText(write: [Element, string]): void {
	setScriptText(write[0], write[1]);
}

const DANGER_HTML_VALUE = /* @__PURE__ */ Symbol('octane.dangerHTMLValue');
export const DANGER_HTML_ACTIVE = '__oct_dangerHTML';
// Latched the first time any host actually takes ownership of its children via
// dangerouslySetInnerHTML. Every childSlot call has to ask whether raw HTML owns
// its parent; an app that never uses the feature skips the DOM read entirely.
let DANGER_HTML_EVER_ACTIVE = false;
export const DANGER_HTML_STATIC_CHILD = '__oct_dangerChild';
export const DANGER_HTML_SPREAD_CHILD = '__oct_dangerSpreadChild';
const DANGER_HTML_RESOLVED_VALUE = '__oct_dangerResolved';
const DANGER_HTML_RESOLVED_CHILD = '__oct_dangerResolvedChild';

export function dangerHtmlChildrenError(): Error {
	return new Error(formatClientError(5));
}

export function validateDangerouslySetInnerHTMLValue(value: unknown): void {
	if (value != null && (typeof value !== 'object' || !('__html' in value))) {
		throw new Error(formatClientError(6));
	}
}

/** Complete validated write used by direct, spread, and html-only compiler paths. */
export function setDangerouslySetInnerHTML(el: Element, value: any): void {
	validateDangerouslySetInnerHTMLValue(value);
	journalRootProperty(el, DANGER_HTML_ACTIVE, (el as any)[DANGER_HTML_ACTIVE]);
	const wasActive = (el as any)[DANGER_HTML_ACTIVE] === true;
	if (value == null) {
		(el as any)[DANGER_HTML_ACTIVE] = false;
		// A nullish writer on a never-raw host is semantically absent and must not
		// erase ordinary children. Transitioning away from an active writer clears
		// the raw content it owned.
		if (wasActive) {
			setHTML(el, null);
			const host = el as any;
			// Ordinary children can now replace the cached empty HTML.
			if (host[DANGER_HTML_VALUE] !== undefined) {
				journalRootProperty(el, DANGER_HTML_VALUE, host[DANGER_HTML_VALUE]);
				host[DANGER_HTML_VALUE] = undefined;
			}
		}
		return;
	}
	if (value != null && VOID_ELEMENTS.has(el.localName)) {
		throw new Error(formatClientError(7, el.localName));
	}
	if (
		value != null &&
		((el as any)[DANGER_HTML_STATIC_CHILD] === true ||
			(el as any)[DANGER_HTML_SPREAD_CHILD] != null)
	) {
		throw dangerHtmlChildrenError();
	}
	(el as any)[DANGER_HTML_ACTIVE] = true;
	DANGER_HTML_EVER_ACTIVE = true;
	setHTML(el, value.__html);
}

/** Resolve source-ordered direct/spread raw-HTML writers and apply only the winner. */
export function setDangerouslySetInnerHTMLSources(
	el: Element,
	sources: readonly (readonly [
		isSpread: boolean,
		sourceOrName: unknown,
		value?: unknown,
		merge?: boolean | undefined,
	])[],
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
		throw new Error(formatClientError(8, el.localName));
	}
	if (resolved !== null && resolvedChild != null) throw dangerHtmlChildrenError();
	validateDangerouslySetInnerHTMLValue(resolved);
	if (
		hasOwnProp.call(el, DANGER_HTML_RESOLVED_VALUE) &&
		Object.is((el as any)[DANGER_HTML_RESOLVED_VALUE], resolved) &&
		Object.is((el as any)[DANGER_HTML_RESOLVED_CHILD], resolvedChild)
	) {
		return;
	}
	// Stamp only the FINAL child source. Spread-local validation runs too early:
	// when a render transitions raw HTML -> ordinary children, the old raw-HTML
	// active bit is still present until this commit disables it.
	journalRootProperty(el, DANGER_HTML_SPREAD_CHILD, (el as any)[DANGER_HTML_SPREAD_CHILD]);
	journalRootProperty(el, DANGER_HTML_RESOLVED_VALUE, (el as any)[DANGER_HTML_RESOLVED_VALUE]);
	journalRootProperty(el, DANGER_HTML_RESOLVED_CHILD, (el as any)[DANGER_HTML_RESOLVED_CHILD]);
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
export function dangerouslySetInnerHTMLOwnsChild(parent: Node, value: unknown): boolean {
	if (!DANGER_HTML_EVER_ACTIVE) return false;
	if (parent.nodeType !== 1 || (parent as any)[DANGER_HTML_ACTIVE] !== true) return false;
	if (value !== null && value !== undefined) throw dangerHtmlChildrenError();
	return true;
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
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
export const HTML_NS = 'http://www.w3.org/1999/xhtml';

// A hyphen only marks a custom element in the HTML namespace. SVG contains
// native hyphenated tags (`font-face`, `missing-glyph`, …), which must keep the
// ordinary native alias/value tables instead of custom-element raw semantics.
export function isHtmlCustomElement(el: Element): boolean {
	return el.namespaceURI === HTML_NS && el.localName.indexOf('-') !== -1;
}

// Whether `el` is the element a host descriptor of `type` builds. HTML tag names
// are ASCII case-insensitive: createElement('DIV') builds a `div`, and the parser
// lowercases the server's `<DIV>`, so an HTML element matches any casing of its
// name. SVG and MathML names are case-sensitive (`foreignObject`), so a foreign
// element matches only its exact spelling. Canonical spellings match on the
// first comparison; the lowercase copy and namespace read run only on a miss.
export function isHostElementOfType(el: Element, type: string): boolean {
	const name = el.localName;
	return name === type || (name === type.toLowerCase() && el.namespaceURI === HTML_NS);
}

// Namespace for a de-opt host tag: `<svg>` always opens SVG; an SVG-ONLY tag
// (`g`, `rect`, `path`, … — SVG_ONLY_TAGS in constants.ts) implies SVG when no
// namespace was inherited (a component root, a value-position descriptor,
// portal children). Ambiguous names (`a`, `title`, `script`, `style`) keep the
// inherited namespace. Mirrors the compiler's nsForSelf so compiled templates
// and de-opt descriptors namespace identically.
export function inferTagNs(tag: string, inherited: string | undefined): string | undefined {
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
export function deoptChildNamespace(parent: Node): string | undefined {
	if (parent.nodeType !== 1) {
		// A frontier fragment builds content for its live parent.
		const next: SlotNext | undefined = (parent as any).$$next;
		return next === undefined ? undefined : deoptChildNamespace(next.parent!);
	}
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

/** Apply a custom element's native listener, returning whether the prop was consumed. */
export function setCustomElementListener(el: Element, name: string, value: unknown): boolean {
	if (typeof value !== 'function' && (el as any).$$ceListeners?.[name] === undefined) return false;
	// The full prop name distinguishes native capture from bubble registration.
	const capture = name.endsWith('Capture');
	const type = capture ? name.slice(2, -7) : name.slice(2);
	const map: Record<string, EventListener> = ((el as any).$$ceListeners ??= {});
	const previous = map[name];
	if (previous !== undefined && previous !== value) el.removeEventListener(type, previous, capture);
	if (typeof value === 'function') {
		if (previous !== value) el.addEventListener(type, value as EventListener, capture);
		map[name] = value as EventListener;
		el.removeAttribute(name);
		return true;
	}
	delete map[name];
	return false;
}

export function setAttribute(el: Element, name: string, value: any): void {
	if (name === 'innerText' || name === 'textContent') return;
	if (
		process.env.NODE_ENV !== 'production' &&
		(el as any).__oct_loc !== undefined &&
		!isHtmlCustomElement(el) &&
		typeof (el as any).__oct_custom_is !== 'string'
	) {
		const warning = isAriaAttributeName(name)
			? ariaAttributeWarning(name, el.localName)
			: hostPropertyWarning(name, value, el.localName, el.namespaceURI === SVG_NS);
		if (warning !== null) devWarnAttributeOnce(el, name, warning);
	}
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
				const next = value && typeof value !== 'function' && typeof value !== 'symbol';
				// Hydration adopts the user's pre-hydration selection, and an adopted
				// select keeps its server `multiple` like any server attribute. An
				// armed select value still reasserts through its controlled commit queue.
				if (hydrating && CURSOR !== null) {
					if (name === 'multiple') {
						CURSOR.adopts(el);
						if (process.env.NODE_ENV !== 'production')
							unpatchedAttribute(CURSOR, el, name, next ? '' : null);
					}
					return;
				}
				// mustUseProperty like `muted`. `multiple` reflects back to the
				// attribute; `selected` is live option state (the controlled
				// <select> projection owns it when a select value is armed).
				(el as any)[name] = next;
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
				devWarnAttributeOnce(
					el,
					name,
					'Invalid DOM property `autofocus`. Did you mean `autoFocus`?',
				);
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
				devWarnAttributeOnce(
					el,
					name,
					'Invalid DOM property `defaultvalue`. Did you mean `defaultValue`?',
				);
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
				devWarnAttributeOnce(
					el,
					name,
					'Invalid DOM property `defaultchecked`. Did you mean `defaultChecked`?',
				);
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
		isHtmlCustomElement(el)
	) {
		if (hydrating && CURSOR?.stageNativeEvent(el, name, value) === true) {
			if (typeof value === 'function') return;
		} else if (setCustomElementListener(el, name, value)) return;
		// Non-function values retain plain attribute semantics.
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
	// An adopted element keeps its server attribute; development compares it with the final
	// coerced value.
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	const ns = attrNamespace(name);
	if (TRANSITION_JOURNAL) journalBag();
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
			devWarnAttributeOnce(el, name, `Invalid attribute name: \`${name}\` (skipped).`);
		}
		return;
	}
	const raw = typeof value === 'object' ? trustedOr(value, next) : next;
	if (ns) el.setAttributeNS(ns, name, raw);
	else el.setAttribute(name, raw);
}

// React's `warnedProperties` cache is module-global and keyed by prop name: once
// one root reports a host-property problem, later roots using the same property
// stay quiet too. Allocate lazily only after a development-compiled host reaches
// a warning branch; every call site is build-time guarded, so optimized bundles
// remove the cache and helper in full.
let DEV_ATTRIBUTE_WARNINGS: Set<string> | null = null;

function devWarnAttributeOnce(_el: Element, name: string, message: string): void {
	const warned = (DEV_ATTRIBUTE_WARNINGS ??= new Set());
	if (warned.has(name)) return;
	warned.add(name);
	console.error(message);
}

function devValidateAriaProps(el: Element, props: Record<string, unknown>): void {
	if ((el as any).__oct_loc === undefined || isHtmlCustomElement(el)) return;
	let unknown: string[] | undefined;
	for (const name of Object.keys(props)) {
		if (!isAriaAttributeName(name)) continue;
		const warning = ariaAttributeWarning(name, el.localName);
		if (warning === null) continue;
		if (!isUnknownAriaAttribute(name)) {
			devWarnAttributeOnce(el, name, warning);
			continue;
		}
		if (DEV_ATTRIBUTE_WARNINGS?.has(name)) continue;
		(DEV_ATTRIBUTE_WARNINGS ??= new Set()).add(name);
		(unknown ??= []).push(name);
	}
	if (unknown !== undefined) {
		console.error(unknownAriaAttributeWarning(unknown, el.localName));
	}
}

function devValidateHostProps(el: Element, props: Record<string, unknown>): void {
	if ((el as any).__oct_loc === undefined || isHtmlCustomElement(el)) return;
	const customized = typeof props['is'] === 'string';
	(el as any).__oct_custom_is = customized ? props['is'] : undefined;
	if (customized) return;
	let invalid: string[] | undefined;
	for (const name of Object.keys(props)) {
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
		const value = props[name];
		if (name.length > 2 && name[0] === 'o' && name[1] === 'n') {
			if (typeof value === 'string') {
				const warning = hostPropertyWarning(name, value);
				if (warning !== null) devWarnAttributeOnce(el, name, warning);
			}
			continue;
		}
		const warning = hostPropertyWarning(name, value, el.localName, el.namespaceURI === SVG_NS);
		if (warning !== null) {
			devWarnAttributeOnce(el, name, warning);
			continue;
		}
		if (typeof value === 'function' && formActionAttributeName(el, name) !== null) continue;
		if (typeof value !== 'function' && typeof value !== 'symbol') continue;
		if (DEV_ATTRIBUTE_WARNINGS?.has(name)) continue;
		(DEV_ATTRIBUTE_WARNINGS ??= new Set()).add(name);
		(invalid ??= []).push(name);
	}
	if (invalid !== undefined) {
		console.error(invalidHostPropertiesWarning(invalid, el.localName));
	}
}

/**
 * Compiler-admitted native scalar attribute: the name is valid, already aliased,
 * unnamespaced and has no property/boolean/numeric/URL semantics. Keep the
 * generic development route even for production-compiled code loaded in dev.
 */
export function setPlainAttribute(el: Element, name: string, value: unknown): void {
	if (process.env.NODE_ENV !== 'production') return setAttribute(el, name, value);
	const type = typeof value;
	const next =
		value == null || type === 'boolean' || type === 'function' || type === 'symbol'
			? null
			: String(value);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, type === 'object' ? trustedOr(value as object, next) : next);
}

/** Same scalar contract for a statically proven, unnamespaced native URL sink. */
export function setURLAttribute(el: Element, name: string, value: unknown): void {
	if (process.env.NODE_ENV !== 'production') return setAttribute(el, name, value);
	const type = typeof value;
	let next =
		value == null || type === 'boolean' || type === 'function' || type === 'symbol'
			? null
			: String(value);
	if (next !== null) {
		if (
			next === '' &&
			(name === 'src' ||
				(name === 'href' && el.nodeName !== 'A' && el.nodeName !== 'AREA') ||
				(name === 'data' && el.nodeName === 'OBJECT'))
		)
			next = null;
		else next = sanitizeURL(next);
	}
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, type === 'object' ? trustedOr(value as object, next) : next);
}

/**
 * Compiler-only fast path for a statically named `data-*` attribute. Runtime values still
 * follow the generic data-attribute contract: nullish/function/symbol remove,
 * while booleans, numbers and objects stringify. This matters when an `as
 * string` assertion or an external typed value is inaccurate at runtime. The
 * compiler restricts this helper to lowercase data names, which are applied as
 * unnamespaced attributes in HTML, SVG, and MathML, so it needs none of the
 * generic attribute alias/property routing tables. Hydration still goes through
 * the capability boundary, so the server value and `suppressHydrationWarning`
 * behave as in setAttribute.
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
			devWarnAttributeOnce(
				el,
				name,
				`The provided \`${name}\` attribute is an object; it will stringify to ` +
					'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
			);
		}
		next = typeof value === 'string' ? value : String(value);
	}
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
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
	if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
		const warning = booleanAttributeStringWarning(name, value);
		if (warning !== null) devWarnAttributeOnce(el, name, warning);
	}
	const type = typeof value;
	const next = !value || type === 'function' || type === 'symbol' ? null : '';
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
	if (next === null) el.removeAttribute(name);
	else el.setAttribute(name, next);
}

/**
 * Compiler-only fast path for a valid, statically named lowercase `aria-*`
 * attribute. Booleans stringify; nullish, function, and symbol values remove.
 */
export function setAriaAttribute(el: Element, name: string, value: unknown): void {
	if (
		process.env.NODE_ENV !== 'production' &&
		(el as any).__oct_loc !== undefined &&
		!isHtmlCustomElement(el)
	) {
		const warning = ariaAttributeWarning(name, el.localName);
		if (warning !== null) devWarnAttributeOnce(el, name, warning);
	}
	const next =
		value == null || typeof value === 'function' || typeof value === 'symbol'
			? null
			: String(value);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedAttribute(CURSOR, el, name, next);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
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
export function coerceAttrValue(el: Element, name: string, value: any): string | null {
	// `aria-*` attributes are ENUMERATED (React parity): `false` renders as
	// "false" (NOT removed) and `true` as "true" (NOT ""). Invalid functions
	// and symbols are removed with nullish values.
	if (name.charCodeAt(0) === 97 /* a */ && name.startsWith('aria-')) {
		return value == null || typeof value === 'function' || typeof value === 'symbol'
			? null
			: String(value);
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
	if (t === 'function' || t === 'symbol') {
		if (
			process.env.NODE_ENV !== 'production' &&
			(el as any).__oct_loc !== undefined &&
			!isHtmlCustomElement(el)
		) {
			if (
				t === 'function' &&
				name.length > 2 &&
				name.charCodeAt(0) === 111 /* o */ &&
				name.charCodeAt(1) === 110 /* n */
			) {
				devWarnAttributeOnce(
					el,
					name,
					`Unknown event handler property \`${name}\` was dropped — did you mean ` +
						`\`on${name.charAt(2).toUpperCase()}${name.slice(3)}\`? (lowercase on* ` +
						'attributes never write; octane delegates camelCase handlers natively)',
				);
			} else {
				devWarnAttributeOnce(
					el,
					name,
					`Invalid value for prop \`${name}\` on <${el.localName}> tag. ` +
						'Either remove it from the element, or pass a string or number value to keep it in the DOM.',
				);
			}
		}
		return null;
	}
	// React's value-type tables — custom elements are exempt (raw semantics).
	if (!isHtmlCustomElement(el)) {
		const lower = name.toLowerCase();
		// React's boolean-attr table (constants.ts — REVERSES the 2026-06
		// native-write adjudication): ANY truthy value renders the canonical
		// `attr=""` presence form (`disabled="disabled"` → `disabled=""`),
		// falsy removes (`hidden={0}`, `inert=""` → absent).
		if (BOOLEAN_ATTR_PROPS.has(lower)) {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				const warning = booleanAttributeStringWarning(name, value);
				if (warning !== null) devWarnAttributeOnce(el, name, warning);
			}
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
				devWarnAttributeOnce(
					el,
					name,
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
		if ((lower === 'rowspan' || lower === 'start') && Number.isNaN(Number(value))) return null;
		// Unknown lowercase on* names never write on standard elements (an
		// event-ish name with a string payload is injection surface, not an
		// attribute); camelCase onX events compile to delegated bindings and
		// never reach setAttribute. Custom elements keep them (raw semantics).
		if (name.length > 2 && name.charCodeAt(0) === 111 /* o */ && name.charCodeAt(1) === 110) {
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
		devWarnAttributeOnce(
			el,
			name,
			`The provided \`${name}\` attribute is an object; it will stringify to ` +
				'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
		);
	}
	if (
		process.env.NODE_ENV !== 'production' &&
		t === 'number' &&
		Number.isNaN(value) &&
		(el as any).__oct_loc !== undefined
	) {
		devWarnAttributeOnce(
			el,
			name,
			`Received NaN for the \`${name}\` attribute. If this is expected, cast the value to a string.`,
		);
	}
	let v: string;
	if (
		process.env.NODE_ENV !== 'production' &&
		(el as any).__oct_loc !== undefined &&
		!isHtmlCustomElement(el)
	) {
		try {
			v = value === true ? '' : String(value);
		} catch (error) {
			devWarnAttributeOnce(el, name, unsupportedAttributeCoercionWarning(name, value));
			throw error;
		}
	} else {
		v = value === true ? '' : String(value);
	}
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
		if (
			process.env.NODE_ENV !== 'production' &&
			(el as any).__oct_loc !== undefined &&
			!isHtmlCustomElement(el)
		) {
			devWarnAttributeOnce(el, 'empty:' + name, emptyResourceUrlWarning(name));
		}
		return null;
	}
	return v;
}

export function setClassName(el: Element, value: unknown, foreign?: boolean): void {
	// clsx-compose first so arrays / objects become a class string (and the hydration
	// compare below sees the value we actually write). A string needs none.
	const cls = typeof value === 'string' ? value : normalizeClass(value);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedClass(CURSOR, el, cls, true);
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
	// A host of a Block the root attempt discards needs no undo (setEventHandler).
	if (
		TRANSITION_JOURNAL &&
		(foreign === true ||
			TRANSITION_JOURNAL_DEPTH !== 1 ||
			CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP)
	)
		journalBag();
	if (value == null || value === false) el.removeAttribute('class');
	else (el as any).className = cls;
}

// Attribute-based class setter: SVG/MathML compiled template bindings (where
// `className` is a read-only SVGAnimatedString) and direct class bindings.
// clsx-composes the value; a nullish/false value REMOVES the attribute (parity with
// the generic setAttribute this binding routed through before clsx composition
// existed).
export function setClassAttr(el: Element, value: unknown): void {
	const cls = value == null || value === false ? null : normalizeClass(value);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedClass(CURSOR, el, cls, false);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
	if (cls === null) el.removeAttribute('class');
	else el.setAttribute('class', cls);
}

// ---------------------------------------------------------------------------
// Style — object form (keys may be kebab-case `font-size` OR React-style
// camelCase `fontSize`; see styleName) or a full cssText string. `prev` is the
// previous value tracked by the compiler so we can diff object→object and only
// touch the properties that changed.
// ---------------------------------------------------------------------------

const IMPORTANT_SUFFIX = '!important';

/** Whether a grouped style must compare its complete value during hydration. @internal */
export function isHydratingStyle(): boolean {
	return hydrating ? CURSOR !== null : false;
}

/** Intrinsic prototype used to guard completion of fresh style spread snapshots. @internal */
export const styleObjectPrototype = Object.prototype;

/** Whether a spread prefix and its fixed trailing declarations can be diffed separately. @internal */
export function canSplitStyleProperties(): boolean {
	if (hydrating && CURSOR !== null) return false;
	// A native object spread copies own values, but the object style writer also
	// visits enumerable Object.prototype properties. Those must see the complete
	// object as their receiver and follow all of its own declarations.
	for (const _key in Object.prototype) return false;
	return true;
}

export function setStyle(el: HTMLElement | SVGElement, value: any, prev: any): void {
	const style = (el as HTMLElement).style;
	// An adopted element keeps its server style; development compares it with the
	// complete authored style.
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedStyle(CURSOR, el, expectedStyle(el, value));
		return;
	}
	if (hiddenStyleWriter !== null && hiddenStyleWriter(el, value, prev)) return;
	// A render writes only fresh DOM here (setRenderStyle stages the rest), so a
	// held window restores the bag that chose the write.
	if (TRANSITION_JOURNAL) journalBag();
	applyStyleValue(el, style, value, prev);
}

/**
 * Update one dynamic declaration after a compiler-baked static style prefix.
 * Hydration's comparison still covers the complete style, while aborted
 * transitions restore the entire attribute rather than only this declaration.
 * @internal
 */
export function setStyleProperty(
	el: HTMLElement | SVGElement,
	name: string,
	value: any,
	staticCss: string,
	previous: any,
	scope: Scope | null = CURRENT_SCOPE,
): void {
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production')
			unpatchedStyle(CURSOR, el, expectedStyle(el, { [name]: value }, staticCss));
		return;
	}
	const remove = value == null || typeof value === 'boolean';
	// The compiler seeds each binding with its private scope, distinguishing a
	// genuinely absent initial longhand from a preserved suspended-mount retry.
	// A commit function passes the rendering scope it recorded.
	if (remove && previous === scope) return;
	if (hiddenStyleWriter !== null && hiddenStyleWriter(el, value, previous, name)) return;
	if (TRANSITION_JOURNAL) journalBag();
	const style = (el as HTMLElement).style;
	if (remove) style.removeProperty(styleName(name));
	else applyStyleProperty(el, style, name, value);
}

/**
 * setStyle and setStyleProperty from a render (#2043): a spread style binding
 * diffs during render, and a root render that may be dropped queues each write
 * for its commit, as setRenderText does. The caller's caches chose the write.
 * A mount (no previous style) styles the host it has just built, at once.
 * @internal
 */
export function setRenderStyle(el: HTMLElement | SVGElement, value: any, prev: any): void {
	const transaction =
		prev === undefined || ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction === null) return setStyle(el, value, prev);
	if (TRANSITION_JOURNAL) journalBag();
	transaction.ops.push(commitStyle, [el, value, prev, CURRENT_SCOPE!]);
}

/** @internal */
export function setRenderStyleProperty(
	el: HTMLElement | SVGElement,
	name: string,
	value: any,
	staticCss: string,
	previous: any,
): void {
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction === null) return setStyleProperty(el, name, value, staticCss, previous);
	if (TRANSITION_JOURNAL) journalBag();
	transaction.ops.push(commitStyle, [el, value, previous, CURRENT_SCOPE!, name, staticCss]);
}

/** A queued style write's error reaches its scope's boundary, as a commit function's does. */
function commitStyle([el, value, previous, scope, name, staticCss]: [
	HTMLElement | SVGElement,
	any,
	any,
	Scope,
	string?,
	string?,
]): void {
	try {
		if (name === undefined) setStyle(el, value, previous);
		else setStyleProperty(el, name, value, staticCss!, previous, scope);
	} catch (error) {
		reportEffectError(scope.block, error);
	}
}

/**
 * Apply ordered fixed-key declarations on mount. The compiler writes changed
 * values with scalar setters on updates; hydration compares the whole value.
 * @internal
 */
export function setStyleProperties(
	el: HTMLElement | SVGElement,
	entries: readonly unknown[],
	staticCss: string,
): void {
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production')
			unpatchedStyle(CURSOR, el, expectedStyle(el, null, staticCss, entries));
		return;
	}
	const style = (el as HTMLElement).style;
	if (TRANSITION_JOURNAL) journalBag();
	for (let i = 0; i < entries.length; i += 2) {
		const value = entries[i + 1];
		// No dynamic declaration exists yet. Removing a null or boolean value
		// could erase a longhand supplied by the baked static prefix.
		if (value == null || typeof value === 'boolean') continue;
		const name = entries[i] as string;
		if (hiddenStyleWriter !== null && hiddenStyleWriter(el, value, undefined, name)) continue;
		applyStyleProperty(el, style, name, value);
	}
}

export function applyStyleValue(
	el: HTMLElement | SVGElement,
	style: CSSStyleDeclaration,
	value: any,
	prev: any,
): void {
	if (value == null || value === false || value === '') {
		if (prev && typeof prev === 'object') {
			for (const key in prev) style.removeProperty(styleName(key));
		} else if (typeof prev === 'string') {
			style.cssText = '';
		}
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
			else applyStyleProperty(el, style, k, v);
		}
	} else {
		if (typeof prev === 'string') style.cssText = '';
		for (const k in value) {
			const v = value[k];
			if (v != null && typeof v !== 'boolean') applyStyleProperty(el, style, k, v);
		}
	}
}

export function applyStyleProperty(
	el: HTMLElement | SVGElement,
	style: CSSStyleDeclaration,
	name: string,
	value: any,
): void {
	const prop = styleName(name);
	// React parity: a bare number gets `px` unless it's 0, a custom prop, or unitless.
	let s: string;
	if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
		devWarnStyleProperty(name, value, false);
		try {
			s = cssStyleValue(name, value);
		} catch (error) {
			devWarnStyleCoercion(name, value);
			throw error;
		}
	} else {
		s = cssStyleValue(name, value);
	}
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

/**
 * The style a writer renders, on a detached declaration block, for hydration
 * to compare with the server's it keeps (setStyle and its siblings): the
 * complete style `value`, or the fixed declarations `entries`, after the
 * static declarations `staticCss`.
 */
function expectedStyle(
	el: HTMLElement | SVGElement,
	value: any,
	staticCss?: string,
	entries?: readonly unknown[],
): CSSStyleDeclaration {
	const expected = document.createElement('div').style;
	if (staticCss !== undefined) expected.cssText = staticCss;
	if (entries === undefined) applyStyleValue(el, expected, value, undefined);
	else {
		for (let i = 0; i < entries.length; i += 2) {
			const entry = entries[i + 1];
			if (entry != null && typeof entry !== 'boolean')
				applyStyleProperty(el, expected, entries[i] as string, entry);
		}
	}
	return expected;
}

// ---------------------------------------------------------------------------
// Spread attributes — `<div {...props}/>`. Iterates the spread object, routes
// each key to the appropriate setter (class / style / onXxx / attr / ref) and
// diffs against the previous spread object so keys that vanished get cleared.
// React 19 shape; only `key`, `ref`, `children` are special-cased.
// ---------------------------------------------------------------------------

// Remove ONE host prop that was present last render and is gone this render. This is
// the single shared removal path for both prop-diff loops — setHostProps' (spreads and
// descriptor hosts) and applyHostProps' (persistent runtime hosts) — so removal stays
// symmetric with the corresponding SET path:
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
// `ref` is intentionally NOT handled here: each caller owns its ref lifecycle (both
// detach inline with the element as the cleanup target, and applyHostProps also clears
// `state.ref`) — see the call sites.
export function removeHostProp(el: Element, name: string, prevValue?: unknown): void {
	if (name === 'class' || name === 'className') {
		if (TRANSITION_JOURNAL) journalBag();
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
			setFormActionAttribute(el, actionName, null);
			return;
		}
		const ev = eventSlot(name, el);
		if (ev) setEventHandler(el, ev.key, null, true);
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

export interface HostPropWriter {
	name: string;
	value: unknown;
	firstOrder: number;
	lastOrder: number;
}

export function formActionAttributeName(el: Element, name: string): string | null {
	if (name === 'action' && el.localName === 'form') return 'action';
	if (
		(name === 'formAction' || name === 'formaction') &&
		(el.localName === 'button' || el.localName === 'input')
	)
		return 'formaction';
	return null;
}

export function isHostPropIdentityKey(name: string): boolean {
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

function normalizedHostProp(el: Element, rawName: string): string {
	if (rawName === 'class' || rawName === 'className') return 'class';
	const actionName = formActionAttributeName(el, rawName);
	if (actionName !== null) return actionName;
	return isHtmlCustomElement(el) ? rawName : (ATTRIBUTE_ALIASES.get(rawName) ?? rawName);
}

/**
 * Resolve a spread-bearing compiled host's complete prop set before touching
 * the DOM. JSX spread merging is last-writer-wins, but aliases such as
 * className/class, htmlFor/for, and xlinkHref/xlink:href target one native
 * property. Canonical identities ensure a vanished earlier source cannot
 * remove an unchanged later winner, and hydration compares only the final
 * client value against the final server value.
 *
 * A synthesized scope-hash class (4th tuple flag) is not an authored later
 * writer: after identity last-writer-wins, it composes onto the winning class
 * instead of replacing a spread's class. An authored `class` beside a spread
 * stays last-writer-wins because its hash is baked into that authored value
 * and carries no merge flag.
 */
export function resolveHostPropSources(
	el: Element,
	sources: readonly HostPropSource[],
	props: Map<string, HostPropWriter>,
	readStyle: ((value: unknown) => unknown) | undefined,
): Record<string, unknown> {
	let classMerges: Array<{ rawName: string; value: unknown; order: number }> | null = null;
	let sourceOrder = 0;
	function record(rawName: unknown, value: unknown): void {
		if (typeof rawName !== 'string') return;
		const order = sourceOrder++;
		const previous = props.get(rawName);
		if (previous !== undefined) {
			previous.value = value;
			previous.lastOrder = order;
		} else {
			props.set(rawName, { name: rawName, value, firstOrder: order, lastOrder: order });
		}
	}

	for (const source of sources) {
		if (!source[0]) {
			const rawName = source[1];
			if (
				source[3] === true &&
				typeof rawName === 'string' &&
				(rawName === 'class' || rawName === 'className')
			) {
				(classMerges ??= []).push({ rawName, value: source[2], order: sourceOrder++ });
				continue;
			}
			record(rawName, source[2]);
			continue;
		}
		const spread = source[1];
		if (spread == null || (typeof spread !== 'object' && typeof spread !== 'function')) continue;
		for (const name of Object.keys(Object(spread))) {
			record(name, (spread as Record<string, unknown>)[name]);
		}
	}

	// Source reads are complete. Reuse each raw writer as its normalized winner;
	// neither Map escapes this call, and no second per-key tuple is needed.
	const values = new Map<string, HostPropWriter>();
	const html = el.namespaceURI === 'http://www.w3.org/1999/xhtml';
	let needsWinningOrderSort = false;
	for (const writer of props.values()) {
		const rawName = writer.name;
		if (rawName === 'key') continue;
		const identityKey = isHostPropIdentityKey(rawName);
		const name = identityKey ? rawName : normalizedHostProp(el, rawName);
		const identity = html && !identityKey ? name.toLowerCase() : name;
		const previous = values.get(identity);
		if (previous !== undefined) {
			if (previous.lastOrder >= writer.lastOrder) continue;
			// A winning alias can have a later first insertion than this Map entry.
			needsWinningOrderSort = true;
		}
		writer.name =
			process.env.NODE_ENV !== 'production' && (rawName === 'tabIndex' || rawName === 'htmlFor')
				? rawName
				: name;
		values.set(identity, writer);
	}
	if (classMerges !== null) {
		for (const extra of classMerges) {
			const previous = values.get('class');
			if (previous !== undefined) {
				previous.value = mergeClass(previous.value, extra.value);
				previous.lastOrder = extra.order;
			} else {
				values.set('class', {
					name: 'class',
					value: extra.value,
					firstOrder: extra.order,
					lastOrder: extra.order,
				});
			}
		}
	}
	const resolved: Record<string, unknown> = Object.create(null);
	const ordered = needsWinningOrderSort
		? [...values.values()].sort((a, b) => a.firstOrder - b.firstOrder)
		: values.values();
	for (const { name, value } of ordered) resolved[name] = value;
	if (readStyle !== undefined && 'style' in resolved)
		resolved['style'] = readStyle(resolved['style']);
	return resolved;
}

export function setHostPropSources(
	el: Element,
	sources: readonly HostPropSource[],
	prev: Record<string, unknown> | undefined,
	scope: Scope,
	hasNestedChildren = false,
	readStyle?: (value: unknown) => unknown,
	deferControl = false,
): Record<string, unknown> {
	const props = new Map<string, HostPropWriter>();
	const resolved = resolveHostPropSources(el, sources, props, readStyle);
	const tag = el.localName;
	const formHost = tag === 'input' || tag === 'textarea' || tag === 'select';
	setSpread(el, resolved, prev, scope, true, formHost);
	setDangerouslySetInnerHTMLSources(el, sources, hasNestedChildren);
	// Form writers use the exact JSX spelling, independently of DOM aliases:
	// e.g. a later VALUE attribute must not replace the controlled value prop.
	// The raw writer Map already resolved source precedence and getter reads.
	if (formHost && !deferControl)
		applyFormControlValues(
			el,
			tag,
			props.get('value')?.value,
			props.get('defaultValue')?.value,
			props.get('checked')?.value,
			props.get('defaultChecked')?.value,
			props.get('multiple')?.value,
			hasNestedChildren || props.has('children'),
		);
	return resolved;
}

/**
 * Record a host's prop sources (bagRecord). Every render's sources reach the
 * commit function, which diffs them against the committed props
 * (commitHostSources). Raw-HTML ownership resolves here, so child holes see it
 * in this render; setHTML writes the HTML at commit. A pending or failed signal
 * source suspends or throws here, in render, and a native-read host reads its
 * winning style here, so this render observes it.
 */
export function bagRecordHost(
	s: Scope,
	next: any[] | null,
	cell: number,
	sources: readonly HostPropSource[],
	el: Element,
	hasNestedChildren: boolean,
	signals?: boolean,
	readStyle?: (value: unknown) => unknown,
): any[] {
	setDangerouslySetInnerHTMLSources(el, sources, hasNestedChildren);
	if (signals === true) resolveSignalHostPropSources(sources, readStyle);
	if (readStyle !== undefined) {
		let style: unknown;
		let found = false;
		for (const source of sources) {
			if (!source[0]) {
				if (source[1] === 'style') {
					style = source[2];
					found = true;
				}
			} else if (source[1] != null && isOwnEnumerable(source[1] as object, 'style')) {
				style = (source[1] as Record<string, unknown>)['style'];
				found = true;
			}
		}
		if (found) readStyle(style);
	}
	// Recorded every render: the bag is no committed value.
	return bagRecord(s, next, cell, sources, s.slots[0])!;
}

/**
 * A spread-bearing host's children for its child hole: the last writer among
 * the sources this render recorded, or the committed props on mount.
 */
export function hostSourceChildren(
	next: any[] | null,
	cell: number,
	committed: Record<string, unknown>,
): unknown {
	const sources = next === null ? null : next[cell];
	if (!Array.isArray(sources))
		return isOwnEnumerable(committed, 'children') ? committed['children'] : undefined;
	let children: unknown;
	for (const source of sources as HostPropSource[]) {
		const value = source[1] as any;
		if (!source[0]) {
			if (value === 'children') children = source[2];
		} else if (value != null && isOwnEnumerable(value, 'children')) children = value.children;
	}
	return children;
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
	// Spread-only capabilities stay out of descriptor-only bundles: a function
	// form action (descriptor factories install it themselves, see
	// DESCRIPTOR_FORM_ACTION) and the keys the host's own bindings write.
	DESCRIPTOR_FORM_ACTION = setFormAction;
	SKIP_SPREAD_KEY = skipSpreadKey;
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
	setHostProps(
		el,
		value,
		prev,
		mountScope,
		(skipDangerouslySetInnerHTML ? SKIP_RAW_HTML : 0) | (skipFormControls ? SKIP_FORM_CONTROLS : 0),
	);
}

// A spread copies own enumerable keys. Descriptor props are plain own objects.
function isOwnEnumerable(object: unknown, key: string): boolean {
	return Object.prototype.propertyIsEnumerable.call(object, key);
}

// setHostProps flags. A compiled spread skips the keys its host's own bindings
// write (raw HTML, aggregated form controls) through SKIP_SPREAD_KEY, which only
// setSpread installs. DESCRIPTOR_HOST marks an element descriptor's host.
const SKIP_RAW_HTML = 1;
const SKIP_FORM_CONTROLS = 2;
const SKIP_SPREAD_KEYS = SKIP_RAW_HTML | SKIP_FORM_CONTROLS;
export const DESCRIPTOR_HOST = 4;
let SKIP_SPREAD_KEY: typeof skipSpreadKey | null = null;
function skipSpreadKey(el: Element, k: string, flags: number): boolean {
	return (
		((flags & SKIP_RAW_HTML) !== 0 && k === 'dangerouslySetInnerHTML') ||
		((flags & SKIP_FORM_CONTROLS) !== 0 && isAggregatedFormControlProp(el, k))
	);
}

// Reuse normalized strings without revisiting retained user objects or keeping them alive.
const SPREAD_CLASS_VALUES = /* @__PURE__ */ new WeakMap<object, string | null>();

function previousSpreadClass(value: unknown): string | null | undefined {
	if (value == null || value === false) return null;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return normalizeClass(value);
	if ((typeof value === 'object' && value !== null) || typeof value === 'function')
		return SPREAD_CLASS_VALUES.get(value);
	return undefined;
}

// Fresh host props can normalize to the class already on a spread's element.
// Keep direct compiler class bindings on setClassAttr's write-only path.
function setHostPropClassAttr(el: Element, value: unknown, prevValue: unknown): void {
	const prevCls = previousSpreadClass(prevValue);
	const cls = value == null || value === false ? null : normalizeClass(value);
	if ((typeof value === 'object' && value !== null) || typeof value === 'function')
		SPREAD_CLASS_VALUES.set(value, cls);
	if (hydrating && CURSOR !== null) {
		CURSOR.adopts(el);
		if (process.env.NODE_ENV !== 'production') unpatchedClass(CURSOR, el, cls, false);
		return;
	}
	if (TRANSITION_JOURNAL) journalBag();
	// Compare the DOM only when the authored class could already match. Changed
	// values need a write, while a staged write must reassert its value at publish.
	// Reuse the previous snapshot's normalized result; its class object may contain
	// getters and must not be traversed again.
	if (ROOT_RENDER_TRANSACTION === null || pendingWrites(CURRENT_BLOCK) === null) {
		if (prevCls !== undefined && prevCls === cls && el.getAttribute('class') === cls) return;
	}
	if (cls === null) el.removeAttribute('class');
	else el.setAttribute('class', cls);
}

// The one generic host-prop writer, for spreads and element descriptors: it
// diffs `prev` → `value` (`prev` is undefined on mount) by identity, removing a
// vanished prop through the removal that mirrors its setter. Bindings whose
// names the compiler knows call the specialized setters instead. A descriptor
// host's scope is its owner Block: its children reconcile separately (and may be
// a scoped accessor that must not be read here), a stamped ref marks the owner
// for teardown, and a mounted input initializes its checkedness as React does.
export function setHostProps(
	el: Element,
	value: any,
	prev: any,
	mountScope: Scope | undefined,
	flags: number,
): void {
	const descriptor = (flags & DESCRIPTOR_HOST) !== 0;
	let needsCheckedInitialization = descriptor && prev === undefined && el.localName === 'input';
	if (process.env.NODE_ENV !== 'production' && value != null) {
		devValidateAriaProps(el, Object(value) as Record<string, unknown>);
		devValidateHostProps(el, Object(value) as Record<string, unknown>);
	}
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
		(el as any).__oct_suppress = value.suppressHydrationWarning === true;
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
	// Remove keys present in prev but absent in value (removeHostProp routes each to
	// the removal that mirrors its SET path — class, style, innerHTML, suppress flag,
	// event slot, aliased/namespaced attribute).
	if (prev) {
		for (const k in prev) {
			if (k === 'key' || k === 'children' || (!descriptor && !isOwnEnumerable(prev, k))) continue;
			if ((flags & SKIP_SPREAD_KEYS) !== 0 && SKIP_SPREAD_KEY!(el, k, flags)) continue;
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
			if (value != null && (descriptor ? k in value : isOwnEnumerable(value, k))) continue;
			removeHostProp(el, k, prev[k]);
		}
	}
	if (value == null) {
		if (needsCheckedInitialization) markInputCheckedness(el as HTMLInputElement);
		if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, mountScope);
		return;
	}
	// A fresh props cache is not a snapshot of attributes already present in SSR.
	const hydration = prev === undefined && hydrating ? CURSOR : null;
	const initialHydration = hydration !== null;
	for (const k in value) {
		if (k === 'key' || k === 'children' || (!descriptor && !isOwnEnumerable(value, k))) continue;
		if ((flags & SKIP_SPREAD_KEYS) !== 0 && SKIP_SPREAD_KEY!(el, k, flags)) continue;
		const v = value[k];
		const pv = prev ? prev[k] : undefined;
		if (needsCheckedInitialization && (k === 'defaultChecked' || (k === 'checked' && v != null)))
			needsCheckedInitialization = false;
		if (k === 'ref') {
			if (v === pv) continue;
			if (descriptor) {
				if (v == null) continue;
				noteDeoptRef(mountScope as Block);
			}
			// Route through attachRef for full parity: callback cleanup-return,
			// object `.current`, and array refs. The prior ref (if any) was queued
			// for detach in the removal loop above; queued detaches drain before
			// queued attaches at commit, so a swap cycles old → null → new even
			// across elements. Compiled callers pass their scope on BOTH mount and
			// update so the attach lands at commit (connected node, ordered after
			// all detaches); the scope-less inline fallback serves external callers.
			if (mountScope) queueRefAttach(mountScope, v, el);
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
			if (v === pv && !initialHydration) continue;
			// Hydration-aware + SVG-safe class write (suppress/warn parity with a
			// direct class binding); nullish/false removes the attribute.
			if (descriptor) setClassAttr(el, v);
			else setHostPropClassAttr(el, v, pv);
			continue;
		}
		if (k === 'style') {
			setStyle(el as HTMLElement, v, pv);
			continue;
		}
		// Presence matters for raw HTML: an own key whose value is undefined
		// explicitly disables an earlier JSX writer. It must not be identity-skipped
		// against the absent previous value on mount. A descriptor's raw HTML is the
		// element's whole content and, as in React, an unchanged object keeps it.
		if (k === 'dangerouslySetInnerHTML') {
			if (!descriptor || v !== pv) setDangerouslySetInnerHTML(el, v);
			continue;
		}
		const actionName = formActionAttributeName(el, k);
		if (actionName !== null) {
			if (v === pv && !initialHydration) continue;
			DESCRIPTOR_FORM_ACTION(el, actionName, v, pv);
			continue;
		}
		// Styles/raw HTML above still need their setters for stable object values.
		// Controlled fields reassert live DOM drift; other unchanged props need no
		// event-name parsing or custom-element routing.
		if (v === pv && !isControlledHostProp(el, k) && !initialHydration) continue;
		const ev = eventSlot(k, el);
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
			// A spread can be republished by a signal while another scope renders.
			setEventHandler(
				el,
				ev.key,
				process.env.NODE_ENV !== 'production' ? devEventListener(k, v) : v,
				true,
			);
			continue;
		}
		// React only honors autoFocus from the final props of the element's mount.
		// An absent initial spread must not turn a later update into a mount.
		if (prev !== undefined && k === 'autoFocus' && !isHtmlCustomElement(el)) continue;
		setAttribute(el, k, v);
	}
	if (needsCheckedInitialization) markInputCheckedness(el as HTMLInputElement);
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, mountScope);
}

// setHostProps receives a FUNCTION form action only from a spread or an element
// factory that could carry one: setSpread, public createElement, createElementAt,
// or cloneElement, or compiled JSX whose props name `action`/`formAction` or
// spread. Those install setFormAction here, so a bundle whose descriptors cannot
// carry a function action does not retain the submit driver and, through it, the
// transition engine.
export let DESCRIPTOR_FORM_ACTION: (el: any, name: string, value: unknown, prev: unknown) => void =
	setFormActionAttribute;

/** @internal Installed by every element factory that can carry a function form action. */
export function enableDescriptorFormActions(): void {
	DESCRIPTOR_FORM_ACTION = setFormAction;
}
