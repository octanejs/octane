import { describe, it, expect, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from '../_helpers';
import { loadServerFixture } from '../_server-fixture.js';
import {
	SvgCamelAttrs,
	SvgKebabAttrs,
	SvgXmlAttrs,
	SvgXlinkClear,
	SvgPlainHref,
	SvgClassPath,
	SvgSpreadNamespaced,
	SvgSpreadDiagnosticAttributes,
	SvgDirectDiagnosticAttributes,
	SvgForeignObjectDiagnosticAttributes,
} from './_fixtures/svg-attributes.tsrx';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const PRODUCTION_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const server = loadServerFixture<{
	SvgSpreadDiagnosticAttributes: typeof SvgSpreadDiagnosticAttributes;
	SvgDirectDiagnosticAttributes: typeof SvgDirectDiagnosticAttributes;
	SvgForeignObjectDiagnosticAttributes: typeof SvgForeignObjectDiagnosticAttributes;
}>('packages/octane/tests/conformance/_fixtures/svg-attributes.tsrx', {
	compileOptions: { dev: true },
});

const SVG_CANONICAL_ATTRIBUTES = {
	preserveAspectRatio: 'xMidYMid meet',
	gradientTransform: 'rotate(45)',
	gradientUnits: 'userSpaceOnUse',
	clipPathUnits: 'userSpaceOnUse',
	patternUnits: 'userSpaceOnUse',
	markerWidth: '4',
	markerHeight: '5',
	markerUnits: 'strokeWidth',
	refX: '1',
	refY: '2',
	textLength: '40',
	'stroke-width': '2',
	'shape-rendering': 'crispEdges',
	'stroke-linecap': 'round',
	'font-size': '12',
	'stroke-dasharray': '4 2',
	'pointer-events': 'none',
};

// ============================================================================
// SVG attribute breadth + namespace decision (Audit Batch 2)
// ============================================================================
// Pins runtime attribute handling on SVG hosts: casing, kebab-case, namespaced
// attributes, xlink null-clear, modern plain href, and class routing.

describe('SVG attributes — camelCase preservation', () => {
	it('preserveAspectRatio camelCase is preserved on the DOM attribute name', () => {
		// Mirrors ReactDOMSVG-test.js — SVG attributes that REQUIRE camelCase
		// (preserveAspectRatio) must not be lowercased en route to the DOM.
		const r = mount(SvgCamelAttrs, {
			preserveAspectRatio: 'xMidYMid meet',
			gradientTransform: 'rotate(45)',
			gradientUnits: 'userSpaceOnUse',
			clipPathUnits: 'userSpaceOnUse',
			markerWidth: '4',
			patternUnits: 'userSpaceOnUse',
			textLength: '40',
		});
		const svg = r.find('#cam');
		expect(svg.namespaceURI).toBe(SVG_NS);
		expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
		// Lowercased form must NOT be present.
		expect(svg.hasAttribute('preserveaspectratio')).toBe(false);

		// Update path — re-render with a new value still preserves casing.
		r.update(SvgCamelAttrs, {
			preserveAspectRatio: 'xMinYMin slice',
			gradientTransform: 'rotate(90)',
			gradientUnits: 'objectBoundingBox',
			clipPathUnits: 'objectBoundingBox',
			markerWidth: '8',
			patternUnits: 'objectBoundingBox',
			textLength: '80',
		});
		expect(svg.getAttribute('preserveAspectRatio')).toBe('xMinYMin slice');
		expect(svg.hasAttribute('preserveaspectratio')).toBe(false);
		r.unmount();
	});

	it('gradientTransform, clipPathUnits, markerWidth, patternUnits, textLength, gradientUnits all preserve casing', () => {
		// Mirrors ReactDOMComponent-test.js — broad sweep across the camelCase
		// SVG attribute set; create + update both paths.
		const r = mount(SvgCamelAttrs, {
			preserveAspectRatio: 'xMidYMid meet',
			gradientTransform: 'rotate(45)',
			gradientUnits: 'userSpaceOnUse',
			clipPathUnits: 'userSpaceOnUse',
			markerWidth: '4',
			patternUnits: 'userSpaceOnUse',
			textLength: '40',
		});
		const lg = r.find('#lg');
		const cp = r.find('#cp');
		const mk = r.find('#mk');
		const pt = r.find('#pt');
		const tx = r.find('#tx');

		// create path — casing intact on each attribute.
		expect(lg.getAttribute('gradientTransform')).toBe('rotate(45)');
		expect(lg.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
		expect(cp.getAttribute('clipPathUnits')).toBe('userSpaceOnUse');
		expect(mk.getAttribute('markerWidth')).toBe('4');
		expect(pt.getAttribute('patternUnits')).toBe('userSpaceOnUse');
		expect(tx.getAttribute('textLength')).toBe('40');
		// The lowercased aliases must not have been set.
		expect(lg.hasAttribute('gradienttransform')).toBe(false);
		expect(cp.hasAttribute('clippathunits')).toBe(false);
		expect(mk.hasAttribute('markerwidth')).toBe(false);
		expect(pt.hasAttribute('patternunits')).toBe(false);
		expect(tx.hasAttribute('textlength')).toBe(false);
		expect(lg.hasAttribute('gradientunits')).toBe(false); // i.e. lower form absent — quick sanity (real attr present above)

		// update path — every camelCase attribute updates to a new value.
		r.update(SvgCamelAttrs, {
			preserveAspectRatio: 'none',
			gradientTransform: 'scale(2)',
			gradientUnits: 'objectBoundingBox',
			clipPathUnits: 'objectBoundingBox',
			markerWidth: '12',
			patternUnits: 'objectBoundingBox',
			textLength: '120',
		});
		expect(lg.getAttribute('gradientTransform')).toBe('scale(2)');
		expect(lg.getAttribute('gradientUnits')).toBe('objectBoundingBox');
		expect(cp.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
		expect(mk.getAttribute('markerWidth')).toBe('12');
		expect(pt.getAttribute('patternUnits')).toBe('objectBoundingBox');
		expect(tx.getAttribute('textLength')).toBe('120');
		r.unmount();
	});
});

describe('SVG attributes — namespace-aware property diagnostics', () => {
	it('accepts directly authored canonical SVG properties and native presentation aliases', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(SvgDirectDiagnosticAttributes, {
			frequency: '0.2',
			interpolation: 'linearRGB',
		});
		try {
			const element = root.find('#svg-direct-filter');
			expect(element.getAttribute('baseFrequency')).toBe('0.2');
			expect(element.getAttribute('color-interpolation')).toBe('linearRGB');
			expect(error.mock.calls).toEqual([]);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('accepts canonical SVG properties and native presentation aliases from a spread', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(SvgSpreadDiagnosticAttributes, { attrs: SVG_CANONICAL_ATTRIBUTES });
		try {
			const element = root.find('#svg-diagnostic-root');
			for (const [name, value] of Object.entries(SVG_CANONICAL_ATTRIBUTES)) {
				expect(element.getAttribute(name)).toBe(value);
			}
			expect(error.mock.calls).toEqual([]);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('suggests canonical spelling for a genuinely miscased SVG property', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(SvgSpreadDiagnosticAttributes, {
			attrs: { gradienttransform: 'rotate(45)' },
		});
		try {
			expect(root.find('#svg-diagnostic-root').getAttribute('gradienttransform')).toBe(
				'rotate(45)',
			);
			expect(error.mock.calls.map(([message]) => message)).toEqual(
				PRODUCTION_COMPILE
					? []
					: ['Invalid DOM property `gradienttransform`. Did you mean `gradientTransform`?'],
			);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('continues warning for unknown camelCase SVG properties', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(SvgSpreadDiagnosticAttributes, {
			attrs: { unknownSvgDiagnosticProperty: 'visible' },
		});
		try {
			expect(root.find('#svg-diagnostic-root').getAttribute('unknownSvgDiagnosticProperty')).toBe(
				'visible',
			);
			expect(error.mock.calls.map(([message]) => message)).toEqual(
				PRODUCTION_COMPILE
					? []
					: [
							'Octane does not recognize the `unknownSvgDiagnosticProperty` prop on a DOM element. ' +
								'If you intentionally want it to appear in the DOM as a custom attribute, ' +
								'spell it as lowercase `unknownsvgdiagnosticproperty` instead. ' +
								'If you accidentally passed it from a parent component, remove it from the DOM element.',
						],
			);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('preserves HTML spelling diagnostics inside an SVG foreignObject', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(SvgForeignObjectDiagnosticAttributes, {
			attrs: { 'word-spacing': '2' },
		});
		try {
			expect(root.find('#foreign-object-html-host').namespaceURI).toBe(
				'http://www.w3.org/1999/xhtml',
			);
			expect(error.mock.calls.map(([message]) => message)).toEqual(
				PRODUCTION_COMPILE
					? []
					: ['Invalid DOM property `word-spacing`. Did you mean `wordSpacing`?'],
			);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('serializes canonical SVG properties and native aliases without warnings', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const html = Server.renderToString(server.SvgSpreadDiagnosticAttributes, {
				attrs: SVG_CANONICAL_ATTRIBUTES,
			}).html;
			for (const [name, value] of Object.entries(SVG_CANONICAL_ATTRIBUTES)) {
				expect(html).toContain(`${name}="${value}"`);
			}
			expect(error.mock.calls).toEqual([]);
		} finally {
			error.mockRestore();
		}
	});

	it('serializes directly authored canonical SVG properties and native aliases without warnings', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const html = Server.renderToString(server.SvgDirectDiagnosticAttributes, {
				frequency: '0.2',
				interpolation: 'linearRGB',
			}).html;
			expect(html).toContain('baseFrequency="0.2"');
			expect(html).toContain('color-interpolation="linearRGB"');
			expect(error.mock.calls).toEqual([]);
		} finally {
			error.mockRestore();
		}
	});

	it('preserves server HTML diagnostics inside an SVG foreignObject', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const html = Server.renderToString(server.SvgForeignObjectDiagnosticAttributes, {
				attrs: { 'word-spacing': '2' },
			}).html;
			expect(html).toContain('word-spacing="2"');
			expect(error.mock.calls.map(([message]) => message)).toEqual([
				'Invalid DOM property `word-spacing`. Did you mean `wordSpacing`?',
			]);
		} finally {
			error.mockRestore();
		}
	});

	it('retains server spelling guidance for a genuinely miscased SVG property', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const html = Server.renderToString(server.SvgSpreadDiagnosticAttributes, {
				attrs: { gradienttransform: 'rotate(45)' },
			}).html;
			expect(html).toContain('gradienttransform="rotate(45)"');
			expect(error.mock.calls.map(([message]) => message)).toEqual([
				'Invalid DOM property `gradienttransform`. Did you mean `gradientTransform`?',
			]);
		} finally {
			error.mockRestore();
		}
	});

	it('adopts SVG nodes with canonical and native attributes without hydration warnings', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = Server.renderToString(server.SvgSpreadDiagnosticAttributes, {
			attrs: SVG_CANONICAL_ATTRIBUTES,
		}).html;
		const existing = container.querySelector('#svg-diagnostic-root');
		expect(error.mock.calls).toEqual([]);
		const root = hydrateRoot(container, SvgSpreadDiagnosticAttributes, {
			attrs: SVG_CANONICAL_ATTRIBUTES,
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#svg-diagnostic-root')).toBe(existing);
			expect(error.mock.calls).toEqual([]);
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});
});

describe('SVG attributes — kebab-case passthrough', () => {
	it('kebab-case stroke-* attributes are preserved as-is', () => {
		// Mirrors ReactDOMComponent-test.js — kebab attributes (stroke-width,
		// stroke-dasharray, fill-opacity, clip-path, stroke-linecap) must NOT be
		// auto-camelCased by the runtime; they are SVG presentation attrs that
		// require the kebab spelling on the DOM.
		const r = mount(SvgKebabAttrs, {
			strokeWidth: '2',
			strokeDasharray: '4 2',
			strokeLinecap: 'round',
			fillOpacity: '0.5',
			clipPath: 'url(#cp)',
		});
		const ln = r.find('#ln');
		const rc = r.find('#rc');
		expect(ln.getAttribute('stroke-width')).toBe('2');
		expect(ln.getAttribute('stroke-dasharray')).toBe('4 2');
		expect(ln.getAttribute('stroke-linecap')).toBe('round');
		expect(rc.getAttribute('fill-opacity')).toBe('0.5');
		expect(rc.getAttribute('clip-path')).toBe('url(#cp)');
		// CamelCased forms must NOT have been emitted.
		expect(ln.hasAttribute('strokeWidth')).toBe(false);
		expect(ln.hasAttribute('strokeDasharray')).toBe(false);
		expect(rc.hasAttribute('fillOpacity')).toBe(false);

		// update path — kebab spelling stays.
		r.update(SvgKebabAttrs, {
			strokeWidth: '5',
			strokeDasharray: '10 2 4',
			strokeLinecap: 'butt',
			fillOpacity: '0.9',
			clipPath: 'url(#cp2)',
		});
		expect(ln.getAttribute('stroke-width')).toBe('5');
		expect(ln.getAttribute('stroke-dasharray')).toBe('10 2 4');
		expect(ln.getAttribute('stroke-linecap')).toBe('butt');
		expect(rc.getAttribute('fill-opacity')).toBe('0.9');
		expect(rc.getAttribute('clip-path')).toBe('url(#cp2)');
		r.unmount();
	});
});

describe('SVG attributes — xml: namespaced attributes', () => {
	it('xml:lang and xml:space are accepted as namespaced attributes', () => {
		// Mirrors ReactDOMComponent-test.js (xml namespace tests) — `xml:lang`
		// and `xml:space` must be routed through setAttributeNS so the resulting
		// attribute carries the XML namespace, matching what the HTML5 parser
		// produces from a static SVG template.
		const XML_NS = 'http://www.w3.org/XML/1998/namespace';
		const r = mount(SvgXmlAttrs, { lang: 'en', space: 'preserve' });
		const svg = r.find('#xml');
		expect(svg.namespaceURI).toBe(SVG_NS);
		expect(svg.getAttribute('xml:lang')).toBe('en');
		expect(svg.getAttribute('xml:space')).toBe('preserve');
		expect(svg.getAttributeNode('xml:lang')!.namespaceURI).toBe(XML_NS);
		expect(svg.getAttributeNode('xml:space')!.namespaceURI).toBe(XML_NS);

		// update path — change the value, the qualified name + ns stay.
		r.update(SvgXmlAttrs, { lang: 'fr', space: 'default' });
		expect(svg.getAttribute('xml:lang')).toBe('fr');
		expect(svg.getAttribute('xml:space')).toBe('default');
		expect(svg.getAttributeNode('xml:lang')!.namespaceURI).toBe(XML_NS);

		// Clear path — null removes the attribute entirely.
		r.update(SvgXmlAttrs, { lang: null, space: null });
		expect(svg.hasAttribute('xml:lang')).toBe(false);
		expect(svg.hasAttribute('xml:space')).toBe(false);
		r.unmount();
	});
});

describe('SVG attributes — xlink:href null clear', () => {
	it('xlink:href={null} removes the attribute', () => {
		// Mirrors ReactDOMComponent-test.js — passing null/undefined for an
		// xlink:href clears the attribute. Pins CURRENT Ripple behavior: the
		// qualified name "xlink:href" is set/removed via plain setAttribute /
		// removeAttribute. namespaceURI of the resulting attribute is null in
		// Ripple (NOT the XLink namespace as React would produce via
		// setAttributeNS). See `notes` for divergence rationale.
		const r = mount(SvgXlinkClear, { href: '#sprite' });
		const use = r.find('#use-el');
		expect(use.namespaceURI).toBe(SVG_NS);
		expect(use.getAttribute('xlink:href')).toBe('#sprite');

		// React parity: the namespaced attribute MUST carry its proper
		// namespaceURI. `xlink:href={…}` is routed through `setAttributeNS` at
		// runtime so the resulting attribute matches a statically-parsed
		// `<use xlink:href="…"/>` from an SVG template — same DOM shape either
		// way. (This used to be pinned at `namespaceURI === null` as a known
		// divergence; the runtime fix in setAttribute closed it.)
		const node = use.getAttributeNode('xlink:href');
		expect(node).not.toBeNull();
		expect(node!.namespaceURI).toBe(XLINK_NS);

		// Re-render to a different href — update path still works through the
		// same qualified name.
		r.update(SvgXlinkClear, { href: '#other' });
		expect(use.getAttribute('xlink:href')).toBe('#other');

		// Null clear — attribute removed.
		r.update(SvgXlinkClear, { href: null });
		expect(use.hasAttribute('xlink:href')).toBe(false);

		// Re-add after clear — round-trip back through the create path.
		r.update(SvgXlinkClear, { href: '#third' });
		expect(use.getAttribute('xlink:href')).toBe('#third');
		r.unmount();
	});
});

describe('SVG attributes — plain href on SVG <a>', () => {
	it('plain href on SVG <a> sets the href attribute (no xlink namespace required)', () => {
		// Mirrors ReactDOMSVG-test.js — SVG2's modern <a href="..."> form should
		// pass through as a plain attribute, no xlink-namespace special-casing.
		const r = mount(SvgPlainHref, { href: '/foo' });
		const a = r.find('#alink');
		expect(a.namespaceURI).toBe(SVG_NS); // inherits parent <svg>'s namespace
		expect(a.getAttribute('href')).toBe('/foo');
		// No xlink:href shadow attribute should have been emitted.
		expect(a.hasAttribute('xlink:href')).toBe(false);

		// update path — change href, namespace stays.
		r.update(SvgPlainHref, { href: '/bar' });
		expect(a.getAttribute('href')).toBe('/bar');
		expect(a.hasAttribute('xlink:href')).toBe(false);

		// Null clear — href removed cleanly.
		r.update(SvgPlainHref, { href: null });
		expect(a.hasAttribute('href')).toBe(false);
		r.unmount();
	});
});

describe('SVG attributes — namespaced keys via spread', () => {
	it('xlink:href delivered via {...obj} routes through setAttributeNS too', () => {
		// The compiler lowers `{...obj}` to `setSpread(el, value, prev)`, which
		// calls the shared `setAttribute` helper per key. The runtime's prefix
		// detection ensures the spread path matches the direct emit path for
		// namespaced attribute names — no divergence between the two surfaces.
		const r = mount(SvgSpreadNamespaced, { attrs: { 'xlink:href': '#a', class: 'spread' } });
		const use = r.find('#spread-use');
		expect(use.namespaceURI).toBe(SVG_NS);
		expect(use.getAttribute('xlink:href')).toBe('#a');
		expect(use.getAttributeNode('xlink:href')!.namespaceURI).toBe(XLINK_NS);
		expect(use.getAttribute('class')).toBe('spread');

		// Update with a different namespaced value through the same spread.
		r.update(SvgSpreadNamespaced, { attrs: { 'xlink:href': '#b' } });
		expect(use.getAttribute('xlink:href')).toBe('#b');
		expect(use.getAttributeNode('xlink:href')!.namespaceURI).toBe(XLINK_NS);
		// `class` was in `prev` but not in the new spread → removed.
		expect(use.hasAttribute('class')).toBe(false);

		// Drop the xlink key entirely — must clear the namespaced attribute.
		r.update(SvgSpreadNamespaced, { attrs: {} });
		expect(use.hasAttribute('xlink:href')).toBe(false);
		r.unmount();
	});
});

describe('SVG attributes — class routing', () => {
	it('dynamic class on SVG element uses setAttribute path — className.baseVal reflects the change', () => {
		// Mirrors ReactDOMComponent-test.js (SVG className handling) — assigning
		// to .className on an SVGElement is a no-op in real browsers (the prop is
		// a read-only SVGAnimatedString). The runtime MUST route via
		// setAttribute(el,'class',...) instead. We verify by inspecting BOTH the
		// attribute AND the className.baseVal mirror — both must reflect the new
		// value on create AND update.
		const r = mount(SvgClassPath, { cls: 'a' });
		const c = r.find('#cls-c');
		expect(c.namespaceURI).toBe(SVG_NS);
		expect(c.getAttribute('class')).toBe('a');
		// baseVal is the live mirror of the class attribute in the DOM. If the
		// runtime had wrongly assigned to .className (the SVGAnimatedString), the
		// attribute would be empty and baseVal would be '' — fail.
		expect((c as any).className.baseVal).toBe('a');

		// update path — change class, both surfaces update.
		r.update(SvgClassPath, { cls: 'b c' });
		expect(c.getAttribute('class')).toBe('b c');
		expect((c as any).className.baseVal).toBe('b c');

		// Null clear — class attribute removed.
		r.update(SvgClassPath, { cls: null });
		expect(c.hasAttribute('class')).toBe(false);
		expect((c as any).className.baseVal).toBe('');
		r.unmount();
	});
});
