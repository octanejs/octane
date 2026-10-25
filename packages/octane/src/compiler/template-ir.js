// ---------------------------------------------------------------------------
// Template IR + origin recording (`inspect: true`). Static template HTML is
// runtime DATA, not JavaScript syntax: the browser-facing `template(html)` ABI
// intentionally stays a string. The compiler represents that data as a
// structured tree of elements and typed data chunks until allocTemplate
// serializes the completed template exactly once. Child templates compose by
// transferring nodes, so no intermediate HTML is joined and no origin offsets
// need to be shifted during construction. Origin spans remain local to their
// chunk; the one serializer shifts them into final logical-HTML coordinates.
//
// Origin collection stays gated on `ctx.inspect`. The normal compile path pays
// for the template chunks (the structural representation replacing string
// concatenation) but not for source-span arrays.
// ---------------------------------------------------------------------------

import { RAW_TEXT_CONTENT } from '../dom-tables.js';

/**
 * @typedef {{ start: number, end: number, srcStart: number, srcEnd: number,
 *   kind: 'tag-open' | 'tag-close' | 'attr-name' | 'attr-value' | 'text' }} TemplateOrigin
 */

/**
 * @typedef {'syntax' | 'tag-open' | 'tag-close' | 'attribute' | 'text' |
 *   'anchor' | 'fragment-open' | 'fragment-close' | 'raw'} TemplatePartKind
 */

/**
 * @typedef {{
 *   type: 'TemplatePart',
 *   kind: TemplatePartKind,
 *   value: string,
 *   origins: TemplateOrigin[] | null,
 *   length: number,
 * }} TemplatePart
 */

/**
 * @typedef {{
 *   type: 'TemplateElement',
 *   tag: string,
 *   namespace: string,
 *   synthetic: boolean,
 *   opening: TemplatePart,
 *   attributes: TemplatePart[],
 *   openingEnd: TemplatePart,
 *   children: TemplateNode[],
 *   closing: TemplatePart | null,
 *   length: number,
 * }} TemplateElement
 */

/** @typedef {TemplatePart | TemplateElement} TemplateNode */

/**
 * @typedef {{
 *   type: 'Template',
 *   parts: TemplateNode[],
 *   length: number,
 * }} TemplateIR
 */

/** @returns {TemplateIR} */
export function createTemplateIr() {
	return { type: 'Template', parts: [], length: 0 };
}

/**
 * @param {string} value
 * @param {TemplatePartKind} [kind]
 * @param {TemplateOrigin[] | null} [origins]
 * @returns {TemplatePart}
 */
export function createTemplatePart(value, kind = 'raw', origins = null) {
	return { type: 'TemplatePart', kind, value, origins, length: value.length };
}

/** @param {TemplateIR} template @param {TemplateNode} node */
export function appendTemplateNode(template, node) {
	template.parts.push(node);
	template.length += node.length;
}

/**
 * @param {TemplateIR} template
 * @param {string} value
 * @param {TemplatePartKind} [kind]
 * @param {TemplateOrigin[] | null} [origins]
 */
export function appendTemplatePart(template, value, kind = 'raw', origins = null) {
	if (value === '') return;
	appendTemplateNode(template, createTemplatePart(value, kind, origins));
}

/** @param {TemplateIR} into @param {TemplateIR} child */
export function appendTemplateIr(into, child) {
	if (child.length === 0) return;
	for (const part of child.parts) into.parts.push(part);
	into.length += child.length;
}

/**
 * @param {string} value
 * @param {TemplatePartKind} [kind]
 * @param {TemplateOrigin[] | null} [origins]
 * @returns {TemplateIR}
 */
export function templatePart(value, kind = 'raw', origins = null) {
	const template = createTemplateIr();
	appendTemplatePart(template, value, kind, origins);
	return template;
}

/**
 * @param {string} tag
 * @param {string} namespace
 * @param {boolean} voidElement
 * @param {TemplateIR} attributes
 * @param {TemplateIR} children
 * @param {TemplateOrigin[] | null} openOrigins
 * @param {TemplateOrigin[] | null} closeOrigins
 * @param {boolean} [synthetic]
 * @returns {TemplateIR}
 */
export function templateElement(
	tag,
	namespace,
	voidElement,
	attributes,
	children,
	openOrigins,
	closeOrigins,
	synthetic = false,
) {
	const opening = createTemplatePart(`<${tag}`, 'tag-open', openOrigins);
	const openingEnd = createTemplatePart(voidElement ? '/>' : '>', 'syntax');
	const closing = voidElement ? null : createTemplatePart(`</${tag}>`, 'tag-close', closeOrigins);
	const node = {
		type: 'TemplateElement',
		tag,
		namespace,
		synthetic,
		opening,
		attributes: /** @type {TemplatePart[]} */ (attributes.parts),
		openingEnd,
		children: children.parts,
		closing,
		length:
			opening.value.length +
			attributes.length +
			openingEnd.value.length +
			children.length +
			(closing === null ? 0 : closing.value.length),
	};
	const template = createTemplateIr();
	appendTemplateNode(template, node);
	return template;
}

// A baked ` name="value"` chunk, and the values the HTML parser reads the same
// without quotes.
const QUOTED_ATTRIBUTE = /^ [^\s"'=<>`/]+="([^"]*)"$/;
const UNQUOTED_VALUE = /^[^\s"'=<>`]+$/;

/**
 * A static attribute chunk without what the parser restores: an empty value
 * becomes the bare name, and a value that needs no quotes loses them unless a
 * kept `/>` follows (`r=5/>` reads the value `5/`). Origins after the opening
 * quote move back with it.
 *
 * @param {TemplatePart} part
 * @param {boolean} quoted
 */
function compactAttribute(part, quoted) {
	const match = part.kind === 'attribute' ? QUOTED_ATTRIBUTE.exec(part.value) : null;
	if (match === null) return part;
	const value = match[1];
	const quote = part.value.length - value.length - 2;
	if (value === '')
		return createTemplatePart(part.value.slice(0, quote - 1), part.kind, part.origins);
	if (quoted || !UNQUOTED_VALUE.test(value)) return part;
	const shift = (at) => (at > quote ? at - 1 : at);
	return createTemplatePart(
		part.value.slice(0, quote) + value,
		part.kind,
		part.origins?.map((origin) => ({
			...origin,
			start: shift(origin.start),
			end: shift(origin.end),
		})) ?? null,
	);
}

/**
 * The client's `template()` markup without what the HTML parser restores on its
 * own: quotes a value does not need, an empty value, an HTML void element's
 * `/`, and the close tags that end the template. The parsed DOM is the same,
 * and the runtime's source scanners (templateRootDescriptor, lazyRootHolds)
 * read a start tag to its `>` or whitespace. Inspection keeps an omitted close
 * tag's origin on its element's opening name. `htmlParse`: the template parses
 * in HTML context (`template()` namespace 0), so a destination-opaque element
 * is an HTML one. Copy-on-write: the input is left as it was.
 *
 * @param {TemplateIR} template
 * @param {boolean} htmlParse
 * @returns {TemplateIR}
 */
export function compactTemplateIr(template, htmlParse) {
	/** @param {TemplateNode[]} nodes @param {boolean} last they end the template */
	const compactNodes = (nodes, last) =>
		nodes.map((node, i) =>
			node.type === 'TemplateElement' ? compactElement(node, last && i === nodes.length - 1) : node,
		);
	/** @param {TemplateElement} node @param {boolean} last its close tag can go */
	const compactElement = (node, last) => {
		// A void element keeps its `/` where the parser may be in foreign content.
		const html = node.namespace === 'html' || (htmlParse && node.namespace === 'opaque');
		const keepsSlash = node.openingEnd.value === '/>' && !html;
		const final = node.attributes.length - 1;
		const attributes = node.attributes.map((part, i) =>
			compactAttribute(part, keepsSlash && i === final),
		);
		const openingEnd =
			node.openingEnd.value === '/>' && !keepsSlash
				? createTemplatePart('>', 'syntax')
				: node.openingEnd;
		// A raw-text or RCDATA host reads its content as text, so it keeps every byte.
		const children = RAW_TEXT_CONTENT.has(node.tag)
			? node.children
			: compactNodes(node.children, last);
		const closing = last ? null : node.closing;
		// An omitted close tag's authored name resolves to the opening one, which
		// names the same element (`</` is one byte longer than `<`).
		const dropped = last ? node.closing?.origins : null;
		const opening = dropped
			? createTemplatePart(node.opening.value, node.opening.kind, [
					...(node.opening.origins ?? []),
					...dropped.map((origin) => ({ ...origin, start: origin.start - 1, end: origin.end - 1 })),
				])
			: node.opening;
		return {
			...node,
			opening,
			attributes,
			openingEnd,
			children,
			closing,
			length:
				node.opening.length +
				attributes.reduce((sum, part) => sum + part.length, 0) +
				openingEnd.length +
				children.reduce((sum, child) => sum + child.length, 0) +
				(closing === null ? 0 : closing.length),
		};
	};
	const parts = compactNodes(template.parts, true);
	return { type: 'Template', parts, length: parts.reduce((sum, node) => sum + node.length, 0) };
}

/**
 * Serialize the completed template once. The IR already contains the exact
 * runtime bytes; this pass only joins them and converts chunk-local origins to
 * final logical-HTML offsets.
 *
 * @param {TemplateIR} template
 */
export function serializeTemplateIr(template) {
	const values = [];
	let origins = null;
	let offset = 0;
	const appendPart = (part) => {
		values.push(part.value);
		if (part.origins !== null) {
			origins ??= [];
			for (const origin of part.origins) {
				origins.push({
					start: origin.start + offset,
					end: origin.end + offset,
					srcStart: origin.srcStart,
					srcEnd: origin.srcEnd,
					kind: origin.kind,
				});
			}
		}
		offset += part.value.length;
	};
	const visit = (node) => {
		if (node.type === 'TemplatePart') {
			appendPart(node);
			return;
		}
		appendPart(node.opening);
		for (const attribute of node.attributes) appendPart(attribute);
		appendPart(node.openingEnd);
		for (const child of node.children) visit(child);
		if (node.closing !== null) appendPart(node.closing);
	};
	for (const node of template.parts) {
		visit(node);
	}
	return { html: values.join(''), origins };
}
