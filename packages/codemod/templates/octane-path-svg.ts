import { createElement } from 'octane';

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

export function pathSvg(source: string) {
	const geometry = parsePathSvg(source);
	if (!geometry) throw new Error('Expected a raw SVG containing only supported path geometry.');
	const paths = geometry.paths.map((attributes, key) => ({ ...attributes, key }));
	return function PathSvg(props: { className?: unknown; 'aria-hidden'?: string | boolean }) {
		return createElement('svg', {
			...geometry.root,
			className: reactClassName(props.className),
			'aria-hidden': props['aria-hidden'],
			children: paths.map((attributes) => createElement('path', attributes)),
		});
	};
}
