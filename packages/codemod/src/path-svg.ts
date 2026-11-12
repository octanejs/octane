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
const rootAttributes = {
	xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
	width: length,
	height: length,
	viewBox: new RegExp('^' + number + '(?:' + separator + number + '){3}$'),
	fill: paint,
	role: /^img$/,
	focusable: /^(?:true|false)$/,
};

export function svgLiteralRootOverride(name: string, value: string) {
	return (name === 'fill' || name === 'focusable') && rootAttributes[name].test(value);
}

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
	d: /^[Mm] *[+\-.\d][MmLlHhVvCcSsQqTtAaZzEe0-9.,+\- ]+$/,
	'fill-rule': fillRule,
	'clip-rule': fillRule,
};
const rectAttributes = {
	...presentation,
	x: length,
	y: length,
	width: extent,
	height: extent,
	rx: extent,
	ry: extent,
};
const groupAttributes = { transform };

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
		if (rule === length || rule === extent || rule === opacity) {
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

// Hydration and React interop use reserved data attributes.
export function svgDataAttribute(name: string): name is `data-${string}` {
	return /^data-(?!oct(?:ane)?(?:-|$)|react-compat$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name);
}

type StaticSvgNode = {
	tag: 'path' | 'rect' | 'g';
	attributes: Record<string, string>;
	children: StaticSvgNode[];
};

/** Read authored geometry without expanding XML or resolving element references. */
export function parseStaticSvg(source: string) {
	if (typeof source !== 'string') return null;
	let root: Record<string, string> | null = null;
	const children: StaticSvgNode[] = [];
	const groups: StaticSvgNode[][] = [];
	const token =
		/[ \t\r\n]*(?:<!--([\s\S]*?)-->|<\/(svg|g)[ \t\r\n]*>|<(svg|g|rect|path)([^<>]*?)(\/?)>)/gy;
	let hasShape = false;
	let end = 0;
	for (let match; (match = token.exec(source)); end = token.lastIndex) {
		const [, comment, closing, tag, fields, selfClosing] = match;
		if (comment !== undefined) {
			if (/--|-$|[^\t\r\n\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(comment))
				return null;
		} else if (closing) {
			if (!groups.length || closing !== (groups.length === 1 ? 'svg' : 'g')) return null;
			groups.pop();
		} else if (tag === 'svg') {
			if (root || selfClosing) return null;
			root = attributes(fields!, rootAttributes);
			if (!root) return null;
			groups.push(children);
		} else {
			if (!groups.length) return null;
			const group = tag === 'g';
			if (group ? selfClosing || groups.length > 32 : !selfClosing) return null;
			const props = attributes(
				fields!,
				group ? groupAttributes : tag === 'path' ? pathAttributes : rectAttributes,
			);
			if (
				!props ||
				(tag === 'path' && !props.d) ||
				(tag === 'rect' && !(props.width && props.height))
			)
				return null;
			const node: StaticSvgNode = {
				tag: tag as StaticSvgNode['tag'],
				attributes: props,
				children: [],
			};
			groups[groups.length - 1]!.push(node);
			if (group) groups.push(node.children);
			else hasShape = true;
		}
	}
	return root && hasShape && !groups.length && space.test(source.slice(end))
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
