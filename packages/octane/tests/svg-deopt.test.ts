import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { SvgViaCreateElement } from './_fixtures/svg-deopt.tsrx';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('de-opt SVG namespace', () => {
	it('creates SVG-namespaced elements (incl. case-preserved clipPath) via createElement', () => {
		const r = mount(SvgViaCreateElement);
		const svg = r.container.querySelector('svg') as SVGSVGElement;
		expect(svg).not.toBe(null);
		expect(svg.namespaceURI).toBe(SVG_NS);
		expect(svg instanceof SVGElement).toBe(true);
		// SVG attributes (case-sensitive) survive.
		expect(svg.getAttribute('viewBox')).toBe('0 0 10 10');
		// Descendants inherit the SVG namespace.
		const path = svg.querySelector('path') as SVGPathElement;
		expect(path.namespaceURI).toBe(SVG_NS);
		// clipPath keeps its camelCase localName only when SVG-namespaced
		// (document.createElement would lowercase it to "clippath").
		const clip = svg.querySelector('clipPath');
		expect(clip).not.toBe(null);
		expect(clip!.localName).toBe('clipPath');
		expect((clip!.firstChild as Element).namespaceURI).toBe(SVG_NS);
		r.unmount();
	});
});
