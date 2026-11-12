import { createElement, type OctaneNode } from 'octane';

function reactClassName(value: unknown) {
	if (
		value == null ||
		typeof value === 'boolean' ||
		typeof value === 'symbol' ||
		typeof value === 'function'
	)
		return undefined;
	return '' + value;
}

// Prepare static props once and create fresh elements for each mounted icon.
function prepareShape(node: StaticSvgNode, key: number): () => OctaneNode {
	const props = { ...node.attributes, key };
	if (node.tag !== 'g') return () => createElement(node.tag, props);
	const children = node.children.map(prepareShape);
	return () => createElement('g', { ...props, children: children.map((render) => render()) });
}

export function pathSvg(source: string) {
	const geometry = parseStaticSvg(source);
	if (!geometry) throw new Error('Expected a raw SVG containing only supported static geometry.');
	const children = geometry.children.map(prepareShape);
	return function PathSvg(props: {
		className?: unknown;
		'aria-hidden'?: string | boolean;
		[name: `data-${string}`]: string | undefined;
	}) {
		const attributes: Record<string, unknown> = {
			...geometry.root,
			className: reactClassName(props.className),
			'aria-hidden': props['aria-hidden'],
			children: children.map((render) => render()),
		};
		for (const name in props) {
			if (svgDataAttribute(name) && Object.prototype.hasOwnProperty.call(props, name)) {
				const value = props[name];
				if (typeof value === 'string') attributes[name] = value;
			}
		}
		return createElement('svg', attributes);
	};
}
