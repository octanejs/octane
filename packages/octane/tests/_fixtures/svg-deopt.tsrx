import { createElement } from 'octane';

// Returns an SVG tree via createElement (VALUE position) so it renders through the
// runtime de-opt reconciler — exercising SVG-namespace creation outside the compiled
// template path.
export function SvgViaCreateElement() {
	return createElement(
		'svg',
		{ width: 10, height: 10, viewBox: '0 0 10 10', class: 'arrow' },
		createElement('path', { d: 'M0,0 H10', 'clip-path': 'url(#c)' }),
		createElement('clipPath', { id: 'c' }, createElement('rect', { width: 10, height: 10 })),
	);
}
