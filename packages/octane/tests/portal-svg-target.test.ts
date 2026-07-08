// Portals whose TARGET is an SVG element (recharts' ZIndexLayer pattern:
// zIndex layers portal their children into redux-registered <g> nodes inside
// the chart's <svg>). Children rendered through such a portal must be created
// in the SVG namespace — an HTML-namespaced <rect> inside <svg> renders as an
// unknown element and paints nothing.
import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { SvgPortalApp } from './_fixtures/svg-portal.tsrx';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('createPortal into an SVG container', () => {
	it('creates portal children in the SVG namespace', async () => {
		const r = mount(SvgPortalApp);
		await flushEffects();
		const g = r.find('g.target') as SVGGElement;
		expect(g.namespaceURI).toBe(SVG_NS);
		const rect = g.querySelector('rect');
		expect(rect).toBeTruthy();
		expect(rect!.namespaceURI).toBe(SVG_NS);
		const nested = g.querySelector('g.nested circle');
		expect(nested).toBeTruthy();
		expect(nested!.namespaceURI).toBe(SVG_NS);
		r.unmount();
	});
});
