// Host attribute identity, scalar coercion and development diagnostics. Prepare and commit remain owned by the renderer.
declare const process: { env: { NODE_ENV?: string } };

import {
	SVG_ONLY_TAGS,
	isEnumeratedBooleanAttr,
	BOOLEAN_ATTR_PROPS,
	POSITIVE_NUMERIC_ATTR_PROPS,
} from '../constants.js';
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

export function attrNamespace(name: string): string | null {
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

// React's `warnedProperties` cache is module-global and keyed by prop name: once
// one root reports a host-property problem, later roots using the same property
// stay quiet too. Allocate lazily only after a development-compiled host reaches
// a warning branch; every call site is build-time guarded, so optimized bundles
// remove the cache and helper in full.
let DEV_ATTRIBUTE_WARNINGS: Set<string> | null = null;

export function devWarnAttributeOnce(_el: Element, name: string, message: string): void {
	const warned = (DEV_ATTRIBUTE_WARNINGS ??= new Set());
	if (warned.has(name)) return;
	warned.add(name);
	console.error(message);
}

export function devValidateAriaProps(el: Element, props: Record<string, unknown>): void {
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

export function devValidateHostProps(el: Element, props: Record<string, unknown>): void {
	if ((el as any).__oct_loc === undefined || isHtmlCustomElement(el)) return;
	const customized = typeof props.is === 'string';
	(el as any).__oct_custom_is = customized ? props.is : undefined;
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

export function formActionAttributeName(el: Element, name: string): string | null {
	if (name === 'action' && el.localName === 'form') return 'action';
	if (
		(name === 'formAction' || name === 'formaction') &&
		(el.localName === 'button' || el.localName === 'input')
	)
		return 'formaction';
	return null;
}
