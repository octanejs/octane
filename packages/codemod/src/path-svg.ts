const space = /^[ \t\r\n]*$/;
const number = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const length = new RegExp('^' + number + '(?:px|em|rem|%)?$');
const extent = new RegExp('^(?!-)' + number + '(?:px|em|rem|%)?$');
const separator = '(?: *, *| +)';
const paint =
	/^(?:[a-zA-Z]+|#[\da-fA-F]{3,4}|#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|var\(--[A-Za-z_][A-Za-z0-9_-]*\))$/;
const opacity = /^(?:0(?:\.\d+)?|1)$/;
const operation = '(?:scale|translate)\\(' + number + '(?:' + separator + number + ')?\\)';
const transform = new RegExp('^' + operation + '(?:' + separator + operation + ')*$');
const transformNumbers = new RegExp(number, 'g');
const localPaint = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;
const tileSize = /^[1-9]\d*$/;
const rootAttributes = {
	preserveAspectRatio: /^none$/,
	xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
	width: length,
	height: length,
	viewBox: new RegExp('^' + number + '(?:' + separator + number + '){3}$'),
	fill: paint,
	role: /^img$/,
	focusable: /^(?:true|false)$/,
};
const fillRule = /^(?:evenodd|nonzero)$/;
const presentation = {
	fill: paint,
	stroke: paint,
	'stroke-width': length,
	'stroke-linecap': /^(?:butt|round|square)$/,
	'stroke-linejoin': /^(?:miter|round|bevel)$/,
	opacity,
};
const pathAttributes = {
	...presentation,
	transform,
	d: /^[Mm] *[+\-.\d][MmLlHhVvCcSsQqTtAaZzEe0-9.,+\- ]+$/,
	'fill-rule': fillRule,
	'clip-rule': fillRule,
	'stroke-opacity': opacity,
};
const rectAttributes = {
	...presentation,
	fill: new RegExp(paint.source + '|' + localPaint.source),
	x: length,
	y: length,
	width: extent,
	height: extent,
	rx: extent,
	ry: extent,
};
const shapeAttributes = {
	path: pathAttributes,
	rect: rectAttributes,
	g: { transform },
	defs: {},
	pattern: {
		id: /^[A-Za-z_][A-Za-z0-9_-]*$/,
		width: tileSize,
		height: tileSize,
		patternUnits: /^userSpaceOnUse$/,
	},
};

function attributes(text: string, allowed: Record<string, RegExp>) {
	const values: Record<string, string> = {};
	const field =
		/[ \t\r\n]+([A-Za-z][A-Za-z-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"&<>\t\r\n]*)"|'([^'&<>\t\r\n]*)')/gy;
	let end = 0;
	for (let match; (match = field.exec(text)); end = field.lastIndex) {
		const name = match[1]!;
		const value = (match[2] ?? match[3])!;
		if (name in values || !Object.prototype.hasOwnProperty.call(allowed, name)) return null;
		const rule = allowed[name]!;
		if (!rule.test(value)) return null;
		// SVG component loaders can emit a numeric literal for unitless lengths.
		if (rule === length || rule === extent || rule === opacity || rule === tileSize) {
			const n = Number(value);
			if (
				(!Number.isNaN(n) && String(n) !== value) ||
				(rule === extent && !Number.isFinite(parseFloat(value)))
			)
				return null;
		}
		if (
			rule === transform &&
			value.match(transformNumbers)!.some((n) => !Number.isFinite(Number(n)))
		)
			return null;
		values[name] = value;
	}
	return space.test(text.slice(end)) ? values : null;
}

type StaticSvgNode = {
	tag: keyof typeof shapeAttributes;
	attributes: Record<string, string>;
	children: StaticSvgNode[];
};

/** Read authored geometry and validate a local paint reference without expanding XML. */
export function parseStaticSvg(source: string) {
	if (typeof source !== 'string') return null;
	let root: Record<string, string> | null = null;
	const children: StaticSvgNode[] = [];
	const open: { tag: 'svg' | StaticSvgNode['tag']; children: StaticSvgNode[] }[] = [];
	let patternId: string | undefined;
	let paintId: string | undefined;
	const token =
		/[ \t\r\n]*(?:<!--([\s\S]*?)-->|<\/(svg|g|defs|pattern)[ \t\r\n]*>|<(svg|g|rect|path|defs|pattern)([^<>]*?)(\/?)>)/gy;
	let hasShape = false;
	let end = 0;
	for (let match; (match = token.exec(source)); end = token.lastIndex) {
		const [, comment, closing, tag, fields, selfClosing] = match;
		const parent = open[open.length - 1];
		if (comment !== undefined) {
			if (/--|-$|[^\t\r\n\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(comment))
				return null;
		} else if (closing) {
			if (!parent || closing !== parent.tag) return null;
			if ((closing === 'defs' || closing === 'pattern') && parent.children.length !== 1)
				return null;
			open.pop();
		} else if (tag === 'svg') {
			if (root || selfClosing) return null;
			root = attributes(fields!, rootAttributes);
			if (!root) return null;
			open.push({ tag: 'svg', children });
		} else {
			if (!parent) return null;
			const name = tag as StaticSvgNode['tag'];
			if (
				(name === 'defs' && parent.tag !== 'svg') ||
				(name === 'pattern') !== (parent.tag === 'defs') ||
				(parent.tag === 'pattern' && name !== 'path')
			)
				return null;
			const container = name !== 'path' && name !== 'rect';
			if (container ? selfClosing || open.length > 32 : !selfClosing) return null;
			const props = attributes(fields!, shapeAttributes[name]);
			if (
				!props ||
				(tag === 'path' && !props.d) ||
				(tag === 'rect' && !(props.width && props.height))
			)
				return null;
			if (name === 'pattern') {
				if (
					patternId !== undefined ||
					!(props.id && props.width && props.height && props.patternUnits)
				)
					return null;
				patternId = props.id;
			}
			if (name === 'rect' && props.fill?.startsWith('url(')) {
				const id = props.fill.slice(5, -1);
				if (parent.tag !== 'svg' || (paintId !== undefined && paintId !== id)) return null;
				paintId = id;
			}
			const node: StaticSvgNode = { tag: name, attributes: props, children: [] };
			parent.children.push(node);
			if (container) open.push(node);
			else if (parent.tag !== 'pattern') hasShape = true;
		}
	}
	return root && hasShape && !open.length && patternId === paintId && space.test(source.slice(end))
		? { root, children }
		: null;
}

// Existing generated helpers expose this path-only result to their importers.
export function parsePathSvg(source: string) {
	const svg = parseStaticSvg(source);
	return svg && svg.children.every((node) => node.tag === 'path')
		? { root: svg.root, paths: svg.children.map((node) => node.attributes) }
		: null;
}
