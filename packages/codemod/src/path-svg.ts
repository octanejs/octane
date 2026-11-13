const space = /^[ \t\r\n]*$/;
const number = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const length = new RegExp('^' + number + '(?:px|em|rem|%)?$');
const extent = new RegExp('^(?!-)' + number + '(?:px|em|rem|%)?$');
const separator = '(?: *, *| +)';
const paint =
	/^(?:[a-zA-Z]+|#[\da-fA-F]{3,4}|#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|var\(--[A-Za-z_][A-Za-z0-9_-]*\))$/;
const opacity = /^(?:0|0?\.\d+|1)$/;
const nextNumber = '(?:' + separator + number + ')';
const operation =
	'(?:(?:scale|translate)\\(' +
	number +
	nextNumber +
	'?\\)|matrix\\(' +
	number +
	nextNumber +
	'{5}\\))';
const transform = new RegExp('^' + operation + '(?:' + separator + operation + ')*$');
const transformNumbers = new RegExp(number, 'g');
const localPaint = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;
const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;
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

export function svgLiteralRootOverride(name: string, value: string) {
	return (name === 'fill' || name === 'focusable') && rootAttributes[name].test(value);
}

const fillRule = /^(?:evenodd|nonzero)$/;
const referencedPaint = new RegExp(paint.source + '|' + localPaint.source);
const userSpace = /^userSpaceOnUse$/;
const bounds = { x: length, y: length, width: extent, height: extent };
const blur = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const presentation = {
	fill: referencedPaint,
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
	...bounds,
	rx: extent,
	ry: extent,
	transform,
};
const shapeAttributes = {
	path: pathAttributes,
	rect: rectAttributes,
	circle: { ...presentation, cx: length, cy: length, r: extent },
	g: { transform, 'clip-path': localPaint, mask: localPaint, filter: localPaint },
	defs: {},
	clipPath: { id: identifier },
	pattern: {
		id: identifier,
		width: tileSize,
		height: tileSize,
		patternUnits: userSpace,
	},
	linearGradient: {
		id: identifier,
		gradientUnits: userSpace,
		x1: length,
		y1: length,
		x2: length,
		y2: length,
	},
	stop: { offset: opacity, 'stop-color': paint, 'stop-opacity': opacity },
	mask: { id: identifier, ...bounds, maskUnits: userSpace, style: /^mask-type:alpha$/ },
	filter: {
		id: identifier,
		...bounds,
		filterUnits: userSpace,
		'color-interpolation-filters': /^(?:sRGB|linearRGB)$/,
	},
	feFlood: { 'flood-opacity': opacity, result: identifier },
	feBlend: { in: identifier, in2: identifier, mode: /^normal$/, result: identifier },
	feGaussianBlur: { stdDeviation: blur, result: identifier },
};

function attributes(text: string, allowed: Record<string, RegExp>, allowData = false) {
	const values: Record<string, string> = {};
	const field =
		/[ \t\r\n]+([A-Za-z][A-Za-z0-9-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"&<>\t\r\n]*)"|'([^'&<>\t\r\n]*)')/gy;
	let end = 0;
	for (let match; (match = field.exec(text)); end = field.lastIndex) {
		const name = match[1]!;
		let value = (match[2] ?? match[3])!;
		if (name in values) return null;
		const rule = Object.prototype.hasOwnProperty.call(allowed, name) ? allowed[name] : undefined;
		// SVG JSX loaders can normalize numeric strings or escape punctuation differently.
		if (
			rule
				? !rule.test(value)
				: !(
						allowData &&
						svgDataAttribute(name) &&
						/^(?:[a-z][a-z0-9_-]*(?: [a-z0-9_-]+)*)?$/.test(value)
					)
		)
			return null;
		// SVGR emits a numeric literal for a leading-dot opacity.
		if (rule === opacity && value.startsWith('.')) value = '0' + value;
		// SVG component loaders can emit a numeric literal for unitless lengths.
		if (
			rule === length ||
			rule === extent ||
			rule === opacity ||
			rule === tileSize ||
			rule === blur
		) {
			const n = Number(value);
			if (
				(!Number.isNaN(n) && String(n) !== value) ||
				((rule === extent || rule === blur) && !Number.isFinite(parseFloat(value)))
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
	tag: keyof typeof shapeAttributes;
	attributes: Record<string, string>;
	children: StaticSvgNode[];
};

type SvgTag = StaticSvgNode['tag'];
type SvgParent = 'svg' | SvgTag;
const containerTags = new Set<SvgTag>([
	'g',
	'defs',
	'clipPath',
	'pattern',
	'linearGradient',
	'mask',
	'filter',
]);
const definitionTags = new Set<SvgTag>(['clipPath', 'pattern', 'linearGradient', 'mask', 'filter']);
const filterPrimitives = new Set<SvgTag>(['feFlood', 'feBlend', 'feGaussianBlur']);
const geometryTags = new Set<SvgTag>(['path', 'rect', 'circle']);

function allowedChild(parent: SvgParent, child: SvgTag) {
	switch (parent) {
		case 'defs':
			return definitionTags.has(child) && child !== 'mask';
		case 'linearGradient':
			return child === 'stop';
		case 'filter':
			return filterPrimitives.has(child);
		case 'clipPath':
			return child === 'rect';
		case 'pattern':
			return child === 'path';
		case 'mask':
			return child === 'path' || child === 'rect';
		default:
			return (
				geometryTags.has(child) ||
				child === 'g' ||
				(parent === 'svg' && (child === 'defs' || child === 'mask'))
			);
	}
}

function closedContainer(tag: SvgParent, children: readonly StaticSvgNode[]) {
	if (tag === 'clipPath' || tag === 'pattern') return children.length === 1;
	if (tag === 'linearGradient') return children.length >= 2;
	if (tag !== 'filter') return (tag !== 'defs' && tag !== 'mask') || children.length > 0;
	const inputs = new Set(['SourceGraphic', 'SourceAlpha']);
	return (
		children.length > 0 &&
		children.every(({ tag, attributes }) => {
			const { in: input, in2, result, stdDeviation } = attributes;
			if (
				(tag === 'feBlend' && !(input && in2 && inputs.has(input) && inputs.has(in2))) ||
				(tag === 'feGaussianBlur' && stdDeviation === undefined) ||
				!result ||
				inputs.has(result)
			)
				return false;
			inputs.add(result);
			return true;
		})
	);
}

/** Read authored geometry with bounded local paint and effect definitions. */
export function parseStaticSvg(source: string) {
	if (typeof source !== 'string') return null;
	let root: Record<string, string> | null = null;
	const children: StaticSvgNode[] = [];
	const open: { tag: SvgParent; children: StaticSvgNode[] }[] = [];
	const definitions = new Map<string, SvgTag>();
	const references: { id: string; target: SvgTag; rootRect?: boolean }[] = [];
	let legacyDefinition = false;
	const token =
		/[ \t\r\n]*(?:<!--([\s\S]*?)-->|<\/([A-Za-z][A-Za-z0-9]*)[ \t\r\n]*>|<([A-Za-z][A-Za-z0-9]*)([^<>]*?)(\/?)>)/gy;
	let hasShape = false;
	let end = 0;
	for (let match; (match = token.exec(source)); end = token.lastIndex) {
		const [, comment, closing, tag, fields, selfClosing] = match;
		const parent = open[open.length - 1];
		if (comment !== undefined) {
			if (/--|-$|[^\t\r\n\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(comment))
				return null;
		} else if (closing) {
			if (!parent || closing !== parent.tag || !closedContainer(parent.tag, parent.children))
				return null;
			open.pop();
		} else if (tag === 'svg') {
			if (root || selfClosing) return null;
			root = attributes(fields!, rootAttributes, true);
			if (!root) return null;
			open.push({ tag, children });
		} else {
			if (!parent || !tag || !Object.prototype.hasOwnProperty.call(shapeAttributes, tag))
				return null;
			const name = tag as SvgTag;
			if (!allowedChild(parent.tag, name)) return null;
			if (name === 'defs' && children.some((node) => node.tag === 'defs')) return null;
			const container = containerTags.has(name);
			if (container ? selfClosing || open.length > 32 : !selfClosing) return null;
			const props = attributes(fields!, shapeAttributes[name]);
			if (
				!props ||
				(tag === 'path' && !props.d) ||
				(tag === 'rect' && !(props.width && props.height)) ||
				(tag === 'circle' && !props.r) ||
				(tag === 'stop' && !props['stop-color'])
			)
				return null;
			if (definitionTags.has(name)) {
				if (!props.id || definitions.has(props.id)) return null;
				legacyDefinition ||= name === 'clipPath' || name === 'pattern';
				definitions.set(props.id, name);
			}
			if (props['clip-path']) {
				if (parent.tag !== 'svg') return null;
				references.push({ id: props['clip-path'].slice(5, -1), target: 'clipPath' });
			}
			if (name === 'pattern' && !(props.width && props.height && props.patternUnits)) return null;
			if (
				name === 'linearGradient' &&
				!(props.gradientUnits && props.x1 && props.y1 && props.x2 && props.y2)
			)
				return null;
			if (
				(name === 'mask' && !(props.maskUnits && props.style && props.width && props.height)) ||
				(name === 'filter' && !(props.filterUnits && props.width && props.height))
			)
				return null;
			for (const target of ['mask', 'filter'] as const) {
				if (props[target]) references.push({ id: props[target].slice(5, -1), target });
			}
			if (props.fill?.startsWith('url(')) {
				if (parent.tag !== 'svg' && parent.tag !== 'g') return null;
				references.push({
					id: props.fill.slice(5, -1),
					target: 'linearGradient',
					rootRect: name === 'rect' && parent.tag === 'svg',
				});
			}
			const node: StaticSvgNode = { tag: name, attributes: props, children: [] };
			parent.children.push(node);
			if (container) open.push(node);
			else if (parent.tag === 'svg' || parent.tag === 'g') hasShape = true;
		}
	}
	return root &&
		hasShape &&
		!open.length &&
		(!legacyDefinition || definitions.size === 1) &&
		new Set(references.map(({ id }) => id)).size === definitions.size &&
		references.every(
			({ id, target, rootRect }) =>
				definitions.get(id) === target || (rootRect && definitions.get(id) === 'pattern'),
		) &&
		space.test(source.slice(end))
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
