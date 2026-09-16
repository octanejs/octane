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
