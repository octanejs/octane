import { afterEach, describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import {
	DeoptNamespaceSlots,
	DescriptorNamespaceDocument,
	SvgViaCreateElement,
	TemplateNamespaceDestinations,
} from './_fixtures/svg-deopt.tsrx';
import { loadServerFixture } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const FIXTURE = 'packages/octane/tests/_fixtures/svg-deopt.tsrx';
const server = loadServerFixture(FIXTURE);

afterEach(() => {
	resetStreamRuntimeGlobals();
	document.querySelectorAll('[data-svg-deopt-stream-root]').forEach((node) => node.remove());
});

const TEMPLATE_SVG_SELECTORS = [
	'#template-svg-destination',
	'#template-svg-anchor',
	'#template-svg-anchor-text',
	'#template-svg-sibling',
	'#template-svg-component-anchor',
	'#template-svg-returned-component-anchor',
	'#template-svg-component-tree',
	'#template-svg-component-text',
	'#template-foreign-svg',
	'#template-foreign-object',
	'#template-fixed-svg',
	'#template-fixed-svg-anchor',
];

const TEMPLATE_MATH_SELECTORS = [
	'#template-math-destination',
	'#template-math-row',
	'#template-math-row-text',
	'#template-math-sibling',
	'#template-math-component-row',
	'#template-math-component-text',
	'#template-math-returned-component-row',
	'#template-fixed-math',
	'#template-fixed-math-row',
];

const TEMPLATE_HTML_SELECTORS = [
	'#template-namespace-destinations',
	'#template-html-destination',
	'#template-html-anchor',
	'#template-html-anchor-text',
	'#template-html-sibling',
	'#template-html-component-anchor',
	'#template-html-returned-component-anchor',
	'#template-foreign-anchor',
	'#template-foreign-anchor-text',
	'#template-foreign-sibling',
	'#template-foreign-component-anchor',
	'#template-foreign-returned-component-anchor',
	'#template-fixed-svg-host',
	'#template-fixed-math-host',
];

const TEMPLATE_IDENTITY_SELECTORS = [
	...TEMPLATE_SVG_SELECTORS,
	...TEMPLATE_MATH_SELECTORS,
	...TEMPLATE_HTML_SELECTORS,
];

function expectTemplateNamespaces(root: ParentNode): void {
	for (const selector of TEMPLATE_SVG_SELECTORS) {
		expect(root.querySelector(selector)?.namespaceURI, selector).toBe(SVG_NS);
	}
	for (const selector of TEMPLATE_MATH_SELECTORS) {
		expect(root.querySelector(selector)?.namespaceURI, selector).toBe(MATHML_NS);
	}
	for (const selector of TEMPLATE_HTML_SELECTORS) {
		expect(root.querySelector(selector)?.namespaceURI, selector).toBe(HTML_NS);
	}
}

function captureTemplateNodes(root: ParentNode): Map<string, Element> {
	return new Map(
		TEMPLATE_IDENTITY_SELECTORS.map((selector) => [selector, root.querySelector(selector)!]),
	);
}

function expectTemplateNodeIdentity(root: ParentNode, before: Map<string, Element>): void {
	for (const [selector, node] of before) {
		expect(root.querySelector(selector), selector).toBe(node);
	}
}

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

describe('createElement namespace inheritance through component and list boundaries', () => {
	it('uses the actual SVG, MathML, and foreignObject parents across mount and update', () => {
		const r = mount(DeoptNamespaceSlots, {
			label: 'first',
			enhanced: false,
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
			parts: { svgLink: 'a' },
		});

		const keyedA = r.find('#svg-key-a');
		const keyedB = r.find('#svg-key-b');
		const upgrading = r.find('#svg-upgrade');
		for (const selector of [
			'#svg-pure',
			'#svg-key-a',
			'#svg-key-b',
			'#svg-component-host',
			'#svg-component-anchor',
			'#svg-component-text',
			'#svg-string-tag',
			'#svg-string-text',
			'#svg-upgrade',
			'#svg-upgrade-text',
		]) {
			expect(r.find(selector).namespaceURI).toBe(SVG_NS);
		}
		expect(r.find('#foreign-html-anchor').namespaceURI).toBe(HTML_NS);
		expect(r.find('#math-component-host').namespaceURI).toBe(MATHML_NS);
		expect(r.find('#math-component-row').namespaceURI).toBe(MATHML_NS);
		expect(r.find('#math-component-text').namespaceURI).toBe(MATHML_NS);
		expect(r.find('#compiled-svg-ambiguous-child').namespaceURI).toBe(SVG_NS);
		expect(r.find('#compiled-math-child').namespaceURI).toBe(MATHML_NS);

		r.update(DeoptNamespaceSlots, {
			label: 'second',
			enhanced: true,
			items: [
				{ id: 'b', label: 'B2' },
				{ id: 'a', label: 'A2' },
				{ id: 'c', label: 'C' },
			],
			parts: { svgLink: 'a' },
		});

		expect(r.find('#svg-key-a')).toBe(keyedA);
		expect(r.find('#svg-key-b')).toBe(keyedB);
		expect(r.find('#svg-upgrade')).toBe(upgrading);
		expect(r.find('#svg-key-c').namespaceURI).toBe(SVG_NS);
		expect(r.find('#svg-upgrade-child').namespaceURI).toBe(SVG_NS);
		expect(r.find('#svg-upgrade-text').namespaceURI).toBe(SVG_NS);
		expect(r.find('#foreign-html-anchor').namespaceURI).toBe(HTML_NS);
		expect(r.find('#math-component-row').namespaceURI).toBe(MATHML_NS);
		expect(r.find('#compiled-svg-ambiguous-child').namespaceURI).toBe(SVG_NS);
		expect(r.find('#compiled-math-child').namespaceURI).toBe(MATHML_NS);
		expect(r.find('#svg-component-text').textContent).toBe('second');

		r.unmount();
	});
});

describe('component template namespace inheritance', () => {
	it('uses each component-selected HTML, SVG, MathML, and foreignObject destination', () => {
		const mounted = mount(TemplateNamespaceDestinations, { label: 'first label' });
		expectTemplateNamespaces(mounted.container);
		const before = captureTemplateNodes(mounted.container);

		mounted.update(TemplateNamespaceDestinations, { label: 'second label' });
		expectTemplateNamespaces(mounted.container);
		expectTemplateNodeIdentity(mounted.container, before);
		expect(mounted.find('#template-svg-anchor-text').textContent).toBe('second label');
		expect(mounted.find('#template-svg-component-text').textContent).toBe('second label');
		expect(mounted.find('#template-svg-returned-component-anchor').textContent).toBe(
			'second label',
		);
		expect(mounted.find('#template-math-row-text').textContent).toBe('second label');
		expect(mounted.find('#template-math-component-text').textContent).toBe('second label');
		expect(mounted.find('#template-math-returned-component-row').textContent).toBe('second label');
		expect(mounted.find('#template-html-anchor-text').textContent).toBe('second label');
		expect(mounted.find('#template-html-returned-component-anchor').textContent).toBe(
			'second label',
		);
		expect(mounted.find('#template-foreign-anchor-text').textContent).toBe('second label');
		expect(mounted.find('#template-foreign-returned-component-anchor').textContent).toBe(
			'second label',
		);

		mounted.unmount();
	});
});

describe('namespace inheritance across server rendering', () => {
	it('hydrates component-selected template namespaces in place with live updates', async () => {
		const props = { label: 'server label' };
		const { html } = await ServerRuntime.renderToString(
			server.TemplateNamespaceDestinations,
			props,
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		let root: ReturnType<typeof hydrateRoot> | null = null;
		try {
			container.innerHTML = html;
			expectTemplateNamespaces(container);
			const serverNodes = captureTemplateNodes(container);

			root = hydrateRoot(container, TemplateNamespaceDestinations, props);
			flushSync(() => {});
			expectTemplateNamespaces(container);
			expectTemplateNodeIdentity(container, serverNodes);

			flushSync(() => root!.render(TemplateNamespaceDestinations, { label: 'hydrated label' }));
			expectTemplateNamespaces(container);
			expectTemplateNodeIdentity(container, serverNodes);
			expect(container.querySelector('#template-svg-anchor-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-svg-component-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-svg-returned-component-anchor')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-math-row-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-math-component-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-math-returned-component-row')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-html-anchor-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-html-returned-component-anchor')?.textContent).toBe(
				'hydrated label',
			);
			expect(container.querySelector('#template-foreign-anchor-text')?.textContent).toBe(
				'hydrated label',
			);
			expect(
				container.querySelector('#template-foreign-returned-component-anchor')?.textContent,
			).toBe('hydrated label');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('hydrates descriptor-entered SVG, MathML, and foreignObject content with live updates', async () => {
		const props = { label: 'server label' };
		const { html } = await ServerRuntime.renderToString(server.DescriptorNamespaceDocument, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		let root: ReturnType<typeof hydrateRoot> | null = null;
		try {
			container.innerHTML = html;
			const documentRoot = container.querySelector('#descriptor-namespace-document')!;
			const svgAnchor = container.querySelector('#descriptor-svg-anchor')!;
			const mathRow = container.querySelector('#descriptor-math-row')!;
			const htmlAnchor = container.querySelector('#descriptor-html-anchor')!;

			expect(svgAnchor.namespaceURI).toBe(SVG_NS);
			expect(mathRow.namespaceURI).toBe(MATHML_NS);
			expect(htmlAnchor.namespaceURI).toBe(HTML_NS);

			root = hydrateRoot(container, DescriptorNamespaceDocument, props);
			flushSync(() => {});
			expect(container.querySelector('#descriptor-namespace-document')).toBe(documentRoot);
			const hydratedSvgAnchor = container.querySelector('#descriptor-svg-anchor')!;
			const hydratedMathRow = container.querySelector('#descriptor-math-row')!;
			const hydratedHtmlAnchor = container.querySelector('#descriptor-html-anchor')!;
			expect(hydratedSvgAnchor.namespaceURI).toBe(SVG_NS);
			expect(hydratedMathRow.namespaceURI).toBe(MATHML_NS);
			expect(hydratedHtmlAnchor.namespaceURI).toBe(HTML_NS);

			flushSync(() => root!.render(DescriptorNamespaceDocument, { label: 'updated label' }));
			expect(container.querySelector('#descriptor-svg-anchor')).toBe(hydratedSvgAnchor);
			expect(container.querySelector('#descriptor-math-row')).toBe(hydratedMathRow);
			expect(container.querySelector('#descriptor-html-anchor')).toBe(hydratedHtmlAnchor);
			expect(hydratedSvgAnchor.textContent).toBe('updated label');
			expect(hydratedMathRow.textContent).toBe('updated label');
			expect(hydratedHtmlAnchor.textContent).toBe('updated label');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('reveals descriptor-nested streams in their native parser contexts', async () => {
		const svg = deferred<string>();
		const math = deferred<string>();
		const html = deferred<string>();
		const collector = createPipeableCollector();
		const stream = ServerRuntime.renderToPipeableStream(server.StreamedDescriptorNamespaces, {
			svgPromise: svg.promise,
			mathPromise: math.promise,
			htmlPromise: html.promise,
		});
		stream.pipe(collector.destination);
		expect(collector.chunks.join('')).toContain('streamed-svg-fallback');
		expect(collector.chunks.join('')).toContain('streamed-math-fallback');
		expect(collector.chunks.join('')).toContain('streamed-html-fallback');

		svg.resolve('streamed-svg-ready');
		math.resolve('streamed-math-ready');
		html.resolve('streamed-html-ready');
		const container = document.createElement('div');
		container.dataset.svgDeoptStreamRoot = '';
		document.body.appendChild(container);
		container.innerHTML = await collector.ended;
		activateStreamedMarkup(container);

		expect(container.querySelector('#streamed-svg-ready')?.namespaceURI).toBe(SVG_NS);
		expect(container.querySelector('#streamed-math-ready')?.namespaceURI).toBe(MATHML_NS);
		expect(container.querySelector('#streamed-html-ready')?.namespaceURI).toBe(HTML_NS);
		expect(container.querySelector('#streamed-svg-fallback')).toBeNull();
		expect(container.querySelector('#streamed-math-fallback')).toBeNull();
		expect(container.querySelector('#streamed-html-fallback')).toBeNull();
	});
});
