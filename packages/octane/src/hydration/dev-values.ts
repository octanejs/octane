// Development only. Hydration keeps the server's attributes, class, style and
// raw HTML on an element it adopts, as React does (runtime.ts, "Hydration VALUE
// differences"). This module compares them with the client's and collects the
// differences for the pass's one warning. Every caller sits behind a
// `process.env.NODE_ENV !== 'production'` check, so no production bundle
// includes it.
import { domBindingClaims } from '../dom-binding-claims.js';
import { HYDRATE_INPUT_ATTR, parserNormalizedMatch } from '../hydration-protocol.js';

interface PassValues {
	/** Each adopted element's class from its last writer, compared when the pass ends. */
	classes: Map<Element, { next: string | null; absentIsEmpty: boolean }>;
	/** The warning's lines, each with the node it belongs to. */
	lines: Map<string, Node>;
}

/** By hydration pass. */
const PASSES = new WeakMap<object, PassValues>();

function valuesOf(pass: object): PassValues {
	let values = PASSES.get(pass);
	if (values === undefined) PASSES.set(pass, (values = { classes: new Map(), lines: new Map() }));
	return values;
}

/**
 * List `el`'s kept server `what`, `server`, where the client renders `client`.
 * An element that suppresses hydration warnings is not listed, nor is one
 * compiled for production, which records no source location.
 */
function differs(pass: object, el: Element, what: string, server: unknown, client: unknown): void {
	const loc = (el as any).__oct_loc;
	if (loc === undefined || (el as any).__oct_suppress === true) return;
	valuesOf(pass).lines.set(
		`${loc}: ${what}: the server rendered ${JSON.stringify(server)}, ` +
			`the client ${JSON.stringify(client)}`,
		el,
	);
}

/**
 * An adopted element keeps its server attribute `name` where the client writes
 * `next`. Values the HTML parser normalized compare equal, and so does what an
 * early host binding published there.
 */
export function unpatchedAttribute(
	pass: object,
	el: Element,
	name: string,
	next: string | null,
): void {
	// Read through the prototype: a form's named control can shadow its method.
	const server = Element.prototype.getAttribute.call(el, name);
	if (
		server !== next &&
		domBindingClaims.get(el)?.get(name) !== server &&
		!(next !== null && parserNormalizedMatch(server, next))
	)
		differs(pass, el, `attribute \`${name}\``, server, next);
}

/**
 * An adopted element keeps its server class where a writer sets `next`
 * (`absentIsEmpty`: an absent class attribute reads as ''). A direct binding
 * and spreads can all write one element's class, and only the last writer's
 * value is the client's, so the comparison waits for the end of the pass.
 */
export function unpatchedClass(
	pass: object,
	el: Element,
	next: string | null,
	absentIsEmpty: boolean,
): void {
	valuesOf(pass).classes.set(el, { next, absentIsEmpty });
}

/**
 * An adopted element keeps its server style where the client renders
 * `expected`, a detached declaration block. Comparing canonical cssText treats
 * equivalent spellings (`#fff` and rgb(), compact whitespace) as equal, while
 * it still finds reordered, missing, added and empty declarations. What an
 * early host binding published there, single declarations or the whole style,
 * is the server's now.
 */
export function unpatchedStyle(
	pass: object,
	el: HTMLElement | SVGElement,
	expected: CSSStyleDeclaration,
): void {
	const style = el.style;
	const server = style.cssText;
	const claims = domBindingClaims.get(el);
	// Removing a published declaration can leave an empty style attribute
	// behind, so the attribute's presence is no longer the server's either.
	let removed = false;
	if (claims !== undefined) {
		for (const [channel, published] of claims) {
			if (!channel.startsWith('style:')) continue;
			const property = channel.slice(6);
			const value = style.getPropertyValue(property);
			const priority = style.getPropertyPriority(property);
			if ((value === '' ? null : value + (priority ? ' !important' : '')) !== published) continue;
			removed ||= value === '';
			// An empty value removes the declaration.
			expected.setProperty(property, value, priority);
		}
	}
	const client = expected.cssText;
	if (
		(server !== client || (!client && !removed && el.hasAttribute('style'))) &&
		claims?.get('style') !== server
	)
		differs(pass, el, 'style', server, client);
}

// SSR replaces only the `s` in case-insensitive opening/closing script tokens.
// The comparison uses that serialized spelling after the script-data input
// normalization applied to server markup.
const INLINE_SCRIPT_TOKEN = /(<\/|<)(s)(cript)/gi;
// Unlike ordinary HTML data, script data keeps character references such as
// `&amp;` verbatim. Only the input-stream transformations that affect a parsed
// script Text node apply: CRLF/CR become LF and NUL becomes U+FFFD.
const SCRIPT_DATA_NORMALIZATION = /\r\n?|\u0000/g;

/**
 * An adopted element keeps its server `dangerouslySetInnerHTML` content where
 * the client renders `next`. The client's HTML is parsed in the element's
 * context, so that spellings the parser canonicalizes, such as `<span/>` and
 * `<span></span>`, compare equal, as in React. `next` is the value setHTML
 * would write, so a Trusted Types object parses under an enforced policy.
 */
export function unpatchedHTML(pass: object, el: Element, next: string): void {
	let server: string;
	let client: string;
	if (el.localName === 'script') {
		server = el.textContent ?? '';
		client = String(next)
			.replace(
				INLINE_SCRIPT_TOKEN,
				(_match, prefix: string, s: string, suffix: string) =>
					`${prefix}${s === 's' ? '\\u0073' : '\\u0053'}${suffix}`,
			)
			.replace(SCRIPT_DATA_NORMALIZATION, (match) => (match === '\u0000' ? '\uFFFD' : '\n'));
	} else {
		server = el.innerHTML;
		const ns = el.namespaceURI;
		const parsed =
			ns === 'http://www.w3.org/2000/svg' || ns === 'http://www.w3.org/1998/Math/MathML'
				? el.ownerDocument.createElementNS(ns, el.tagName)
				: el.ownerDocument.createElement(el.tagName);
		parsed.innerHTML = next;
		client = parsed.innerHTML;
	}
	if (server !== client) differs(pass, el, '`dangerouslySetInnerHTML` content', server, client);
}

/**
 * Whether an adopted node also matches the template's static attributes and
 * nested static element structure. A compiler-specialized mixed style bakes
 * only its static prefix; its exact template path is supplied so that one
 * style attribute waits for the complete-value check. The recursion treats a
 * comment (a `<!>` hole placeholder or marker) or a text/element shift as a
 * match, because template holes do not align 1:1 with server content.
 */
function staticsMatch(
	server: Node,
	template: Node,
	partialStyles: string | undefined,
	path: string,
): boolean {
	if (server.nodeType !== template.nodeType) return false;
	if (server.nodeType !== 1) return true;
	const s = server as Element;
	const t = template as Element;
	if (s.localName !== t.localName) return false;
	const tAttrs = t.attributes;
	for (let i = 0; i < tAttrs.length; i++) {
		const a = tAttrs[i];
		// This optional compiler marker is not authored static structure. Actual
		// writable bindings validate its identity before adopting their state.
		if (a.name === HYDRATE_INPUT_ATTR) continue;
		if (
			s.getAttribute(a.name) !== a.value &&
			!(
				a.name === 'style' &&
				partialStyles !== undefined &&
				partialStyles.includes('|' + path + '|')
			)
		)
			return false;
	}
	let sc = child(s, 'firstChild');
	let tc = child(t, 'firstChild');
	for (let childIndex = 0; sc !== null && tc !== null; childIndex++) {
		if (sc.nodeType === 8 || tc.nodeType === 8) return true; // hole / marker — stop comparing
		if (sc.nodeType !== tc.nodeType) return true; // text↔element shift — ambiguous, stop
		if (
			tc.nodeType === 1 &&
			!staticsMatch(
				sc,
				tc,
				partialStyles,
				partialStyles === undefined
					? ''
					: path === ''
						? String(childIndex)
						: path + '.' + childIndex,
			)
		)
			return false;
		sc = child(sc, 'nextSibling');
		tc = child(tc, 'nextSibling');
	}
	return true; // any leftover could be holes — assume a match
}

/** Read through the prototype: a form's named control can shadow the accessor. */
function child(node: Node, accessor: 'firstChild' | 'nextSibling'): ChildNode | null {
	return Object.getOwnPropertyDescriptor(Node.prototype, accessor)!.get!.call(node);
}

/**
 * `server`, adopted for the template root `template` (the root at index `path`
 * of a fragment template, or '' for a single root), keeps its static
 * attributes and markup. A difference is listed and never changes what is
 * adopted: hydration matches by node type and tag alone, in development and
 * production alike.
 */
export function unpatchedStatics(
	pass: object,
	server: Node,
	template: Node,
	loc: string | undefined,
	partialStyles: string | undefined,
	path: string,
): void {
	if (!staticsMatch(server, template, partialStyles, path))
		valuesOf(pass).lines.set(
			`${loc ? loc + ': ' : ''}static attributes or markup of the server's ` +
				`<${(server as Element).localName}>`,
			server,
		);
}

/**
 * The pass's warning lines once its writers are done, or null when nothing
 * differs. A boundary whose body adopted a node and then threw to its catch arm
 * has removed it from `root` since, and it is not listed.
 */
export function takeUnpatchedValues(pass: object, root: Node): string[] | null {
	const values = PASSES.get(pass);
	if (values === undefined) return null;
	for (const [el, { next, absentIsEmpty }] of values.classes) {
		// Read through the prototype: a form's named control can shadow its method.
		const raw = Element.prototype.getAttribute.call(el, 'class');
		const server = absentIsEmpty && raw === null ? '' : raw;
		if (server !== next && domBindingClaims.get(el)?.get('class') !== raw && root.contains(el))
			differs(pass, el, 'attribute `class`', server, next);
	}
	PASSES.delete(pass);
	const lines: string[] = [];
	for (const [line, node] of values.lines) if (root.contains(node)) lines.push(line);
	return lines.length === 0 ? null : lines;
}
