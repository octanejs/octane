import { afterEach, describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import {
	DirectReturnedSvgTitle,
	LexicalSvgTitles,
	ReturnedDirectiveTitles,
	ReturnedMixedTitles,
	TemplateHtmlTitle,
	TemplateSvgTitle,
} from './_fixtures/svg-title-hoist.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/svg-title-hoist.tsrx';
const server = loadServerFixture(FIXTURE);

afterEach(() => {
	for (const node of document.head.querySelectorAll(
		'[data-opaque-boundary-document-title], [data-lexical-document-title], [data-opaque-boundary-html-title], [data-directive-document-title]',
	)) {
		node.remove();
	}
});

describe('title placement across HTML and SVG namespaces', () => {
	it('keeps a lexically nested SVG title inline while hoisting its HTML sibling', () => {
		const mounted = mount(LexicalSvgTitles as any, {
			documentTitle: 'Chart dashboard',
			svgTitle: 'Chart tooltip',
		});
		const svg = mounted.find('#lexical-svg-title-boundary');
		const path = mounted.find('#lexical-svg-title-boundary path');
		const svgTitle = mounted.find('[data-lexical-svg-title]');
		const documentTitle = document.head.querySelector('[data-lexical-document-title]');

		expect(svg.contains(path)).toBe(true);
		expect(path.contains(svgTitle)).toBe(true);
		expect(svgTitle.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svgTitle.textContent).toBe('Chart tooltip');
		expect(documentTitle?.textContent).toBe('Chart dashboard');
		expect(mounted.container.querySelector('[data-lexical-document-title]')).toBeNull();
		mounted.unmount();
	});

	it('keeps an SVG title inside the component-chosen namespace while hoisting an HTML title', () => {
		const mounted = mount(ReturnedMixedTitles as any, {
			documentTitle: 'Mailbox dashboard',
			svgTitle: 'Warning icon',
		});
		const svg = mounted.find('#nested-svg-title-boundary') as SVGSVGElement;
		const svgTitle = mounted.find('[data-opaque-boundary-svg-title="nested"]') as SVGTitleElement;
		const documentTitle = document.head.querySelector(
			'[data-opaque-boundary-document-title]',
		) as HTMLTitleElement | null;

		expect(svg.contains(svgTitle)).toBe(true);
		expect(svgTitle.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svgTitle.textContent).toBe('Warning icon');
		expect(documentTitle?.textContent).toBe('Mailbox dashboard');
		expect(document.head.querySelector('[data-opaque-boundary-svg-title="nested"]')).toBeNull();
		expect(mounted.container.querySelector('[data-opaque-boundary-document-title]')).toBeNull();

		mounted.update(ReturnedMixedTitles as any, {
			documentTitle: 'Updated dashboard',
			svgTitle: 'Updated warning',
		});
		expect(mounted.find('#nested-svg-title-boundary')).toBe(svg);
		expect(mounted.find('[data-opaque-boundary-svg-title="nested"]')).toBe(svgTitle);
		expect(document.head.querySelector('[data-opaque-boundary-document-title]')).toBe(
			documentTitle,
		);
		expect(svgTitle.textContent).toBe('Updated warning');
		expect(documentTitle?.textContent).toBe('Updated dashboard');

		mounted.unmount();
		expect(document.head.querySelector('[data-opaque-boundary-document-title]')).toBeNull();
	});

	it('keeps an SVG title in a directly returned component root', () => {
		const mounted = mount(DirectReturnedSvgTitle as any, { svgTitle: 'Direct warning' });
		const svg = mounted.find('#direct-svg-title-boundary');
		const title = mounted.find('[data-opaque-boundary-svg-title="direct"]') as SVGTitleElement;

		expect(svg.contains(title)).toBe(true);
		expect(title.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(title.textContent).toBe('Direct warning');
		expect(document.head.querySelector('[data-opaque-boundary-svg-title="direct"]')).toBeNull();
		mounted.unmount();
	});

	it('resolves template-form children from the compiled SVG host and evaluates spreads once', () => {
		let spreadReads = 0;
		const titleRef = { current: null as SVGTitleElement | null };
		const props: any = {
			svgTitle: 'Template warning',
			titleKey: undefined,
			titleRef,
			titleClass: 'tooltip-title',
		};
		Object.defineProperty(props, 'titleProps', {
			enumerable: true,
			get() {
				spreadReads++;
				return { key: 'spread-key', 'data-template-svg-title': 'true' };
			},
		});

		const mounted = mount(TemplateSvgTitle as any, props);
		const svg = mounted.find('#template-svg-title-boundary');
		const title = mounted.find('[data-template-svg-title]') as SVGTitleElement;
		expect(spreadReads).toBe(1);
		expect(svg.contains(title)).toBe(true);
		expect(title.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(title.getAttribute('class')).toBe('tooltip-title');
		expect(titleRef.current).toBe(title);

		let updateSpreadReads = 0;
		const updateProps: any = { ...props, svgTitle: 'Updated template warning' };
		Object.defineProperty(updateProps, 'titleProps', {
			enumerable: true,
			get() {
				updateSpreadReads++;
				return { key: 'spread-key', 'data-template-svg-title': 'updated' };
			},
		});
		mounted.update(TemplateSvgTitle as any, updateProps);
		expect(updateSpreadReads).toBe(1);
		expect(mounted.find('[data-template-svg-title]')).toBe(title);
		expect(title.getAttribute('data-template-svg-title')).toBe('updated');
		expect(title.textContent).toBe('Updated template warning');

		mounted.unmount();
		expect(titleRef.current).toBeNull();
	});

	it('preserves head hoisting when an opaque component chooses HTML', () => {
		const mounted = mount(TemplateHtmlTitle as any, { documentTitle: 'Opaque HTML title' });
		const section = mounted.find('#template-html-title-boundary');
		const title = document.head.querySelector(
			'[data-opaque-boundary-html-title]',
		) as HTMLTitleElement;

		expect(title.textContent).toBe('Opaque HTML title');
		expect(section.querySelector('[data-opaque-boundary-html-title]')).toBeNull();
		mounted.update(TemplateHtmlTitle as any, { documentTitle: 'Updated opaque HTML title' });
		expect(document.head.querySelector('[data-opaque-boundary-html-title]')).toBe(title);
		expect(title.textContent).toBe('Updated opaque HTML title');
		mounted.unmount();
		expect(document.head.querySelector('[data-opaque-boundary-html-title]')).toBeNull();
	});

	it('keeps directive-forced returned children in the component-selected SVG namespace', () => {
		const mounted = mount(ReturnedDirectiveTitles as any, {
			documentTitle: 'Directive dashboard',
			svgTitle: 'Directive tooltip',
			show: true,
		});
		const documentTitle = document.head.querySelector(
			'[data-directive-document-title]',
		) as HTMLTitleElement;
		const svg = mounted.find('#directive-svg-title-boundary');
		const svgTitle = mounted.find('[data-directive-svg-title]');
		expect(svg.contains(svgTitle)).toBe(true);
		expect(svgTitle.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(documentTitle.textContent).toBe('Directive dashboard');

		mounted.update(ReturnedDirectiveTitles as any, {
			documentTitle: 'Directive hidden',
			svgTitle: 'Unused',
			show: false,
		});
		expect(mounted.container.querySelector('#directive-svg-title-boundary')).toBeNull();
		expect(mounted.find('#directive-title-hidden').textContent).toBe('Hidden');
		expect(document.head.querySelector('[data-directive-document-title]')).toBe(documentTitle);
		expect(documentTitle.textContent).toBe('Directive hidden');
		mounted.unmount();
	});

	it('serializes document and SVG titles to their distinct destinations', () => {
		const lexical = ServerRT.renderToString(server.LexicalSvgTitles, {
			documentTitle: 'Server chart',
			svgTitle: 'Server tooltip',
		});
		const lexicalMarkup = document.createElement('template');
		lexicalMarkup.innerHTML = lexical.html;
		const lexicalDocumentTitle = lexicalMarkup.content.querySelector(
			'[data-lexical-document-title]',
		);
		const lexicalPath = lexicalMarkup.content.querySelector('#lexical-svg-title-boundary path');
		const lexicalSvgTitle = lexicalMarkup.content.querySelector('[data-lexical-svg-title]');
		expect(lexicalDocumentTitle?.textContent).toBe('Server chart');
		expect(lexicalPath?.contains(lexicalSvgTitle)).toBe(true);
		expect(lexicalSvgTitle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(lexicalSvgTitle?.textContent).toBe('Server tooltip');

		const mixed = ServerRT.renderToString(server.ReturnedMixedTitles, {
			documentTitle: 'Server dashboard',
			svgTitle: 'Server warning',
		});
		const mixedMarkup = document.createElement('template');
		mixedMarkup.innerHTML = mixed.html;
		const documentTitle = mixedMarkup.content.querySelector(
			'[data-opaque-boundary-document-title]',
		);
		const svg = mixedMarkup.content.querySelector('#nested-svg-title-boundary');
		const svgTitle = mixedMarkup.content.querySelector('[data-opaque-boundary-svg-title="nested"]');

		expect(documentTitle?.textContent).toBe('Server dashboard');
		expect(svg?.contains(svgTitle)).toBe(true);
		expect(
			mixedMarkup.content.querySelectorAll('[data-opaque-boundary-svg-title="nested"]'),
		).toHaveLength(1);
		expect(svgTitle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svgTitle?.textContent).toBe('Server warning');

		const direct = ServerRT.renderToString(server.DirectReturnedSvgTitle, {
			svgTitle: 'Direct server warning',
		});
		const directMarkup = document.createElement('template');
		directMarkup.innerHTML = direct.html;
		const directSvg = directMarkup.content.querySelector('#direct-svg-title-boundary');
		const directTitle = directMarkup.content.querySelector(
			'[data-opaque-boundary-svg-title="direct"]',
		);
		expect(directSvg?.contains(directTitle)).toBe(true);
		expect(directTitle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(directTitle?.textContent).toBe('Direct server warning');

		let spreadReads = 0;
		const templateProps: any = {
			svgTitle: 'Template server warning',
			titleKey: undefined,
			titleRef: null,
			titleClass: 'server-title',
		};
		Object.defineProperty(templateProps, 'titleProps', {
			enumerable: true,
			get() {
				spreadReads++;
				return { key: 'server-spread-key', 'data-template-svg-title': 'server' };
			},
		});
		const template = ServerRT.renderToString(server.TemplateSvgTitle, templateProps);
		const templateMarkup = document.createElement('template');
		templateMarkup.innerHTML = template.html;
		const templateSvg = templateMarkup.content.querySelector('#template-svg-title-boundary');
		const templateTitle = templateMarkup.content.querySelector('[data-template-svg-title]');
		expect(spreadReads).toBe(1);
		expect(templateSvg?.contains(templateTitle)).toBe(true);
		expect(templateTitle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(templateTitle?.textContent).toBe('Template server warning');

		const html = ServerRT.renderToString(server.TemplateHtmlTitle, {
			documentTitle: 'Opaque HTML server title',
		});
		const htmlMarkup = document.createElement('template');
		htmlMarkup.innerHTML = html.html;
		expect(htmlMarkup.content.querySelector('[data-opaque-boundary-html-title]')?.textContent).toBe(
			'Opaque HTML server title',
		);
		expect(
			htmlMarkup.content
				.querySelector('#template-html-title-boundary')
				?.querySelector('[data-opaque-boundary-html-title]'),
		).toBeNull();

		const directive = ServerRT.renderToString(server.ReturnedDirectiveTitles, {
			documentTitle: 'Directive server dashboard',
			svgTitle: 'Directive server tooltip',
			show: true,
		});
		const directiveMarkup = document.createElement('template');
		directiveMarkup.innerHTML = directive.html;
		const directiveSvg = directiveMarkup.content.querySelector('#directive-svg-title-boundary');
		const directiveSvgTitle = directiveMarkup.content.querySelector('[data-directive-svg-title]');
		expect(
			directiveMarkup.content.querySelector('[data-directive-document-title]')?.textContent,
		).toBe('Directive server dashboard');
		expect(directiveSvg?.contains(directiveSvgTitle)).toBe(true);
		expect(directiveSvgTitle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
	});

	it('hydrates both title destinations in place', () => {
		const props = { documentTitle: 'Hydrated dashboard', svgTitle: 'Hydrated warning' };
		const { html } = ServerRT.renderToString(server.ReturnedMixedTitles, props);
		const serverMarkup = document.createElement('template');
		serverMarkup.innerHTML = html;
		const documentTitle = serverMarkup.content.querySelector(
			'[data-opaque-boundary-document-title]',
		) as HTMLTitleElement;
		const adjacentServerNode = documentTitle.previousSibling;
		if (adjacentServerNode?.nodeType === Node.COMMENT_NODE) {
			document.head.append(adjacentServerNode);
		}
		document.head.append(documentTitle);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.append(serverMarkup.content);
		const section = container.querySelector('#mixed-title-boundaries');
		const svg = container.querySelector('#nested-svg-title-boundary');
		const svgTitle = container.querySelector('[data-opaque-boundary-svg-title="nested"]');

		const root = hydrateRoot(container, ReturnedMixedTitles, props);
		flushSync(() => {});
		expect(document.head.querySelector('[data-opaque-boundary-document-title]')).toBe(
			documentTitle,
		);
		expect(container.querySelector('#mixed-title-boundaries')).toBe(section);
		expect(container.querySelector('#nested-svg-title-boundary')).toBe(svg);
		expect(container.querySelector('[data-opaque-boundary-svg-title="nested"]')).toBe(svgTitle);

		root.render(ReturnedMixedTitles, {
			documentTitle: 'Updated hydrated dashboard',
			svgTitle: 'Updated hydrated warning',
		});
		flushSync(() => {});
		expect(document.head.querySelector('[data-opaque-boundary-document-title]')).toBe(
			documentTitle,
		);
		expect(container.querySelector('[data-opaque-boundary-svg-title="nested"]')).toBe(svgTitle);
		expect(documentTitle.textContent).toBe('Updated hydrated dashboard');
		expect(svgTitle?.textContent).toBe('Updated hydrated warning');

		root.unmount();
		expect(document.head.querySelector('[data-opaque-boundary-document-title]')).toBeNull();
		container.remove();
	});

	it('hydrates a deferred HTML title into the adopted document head', () => {
		const props = { documentTitle: 'Hydrated opaque HTML title' };
		const { html } = ServerRT.renderToString(server.TemplateHtmlTitle, props);
		const serverMarkup = document.createElement('template');
		serverMarkup.innerHTML = html;
		const documentTitle = serverMarkup.content.querySelector(
			'[data-opaque-boundary-html-title]',
		) as HTMLTitleElement;
		const adjacentServerNode = documentTitle.previousSibling;
		if (adjacentServerNode?.nodeType === Node.COMMENT_NODE) {
			document.head.append(adjacentServerNode);
		}
		document.head.append(documentTitle);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.append(serverMarkup.content);
		const section = container.querySelector('#template-html-title-boundary');
		const root = hydrateRoot(container, TemplateHtmlTitle, props);
		flushSync(() => {});

		expect(container.querySelector('#template-html-title-boundary')).toBe(section);
		expect(document.head.querySelector('[data-opaque-boundary-html-title]')).toBe(documentTitle);
		expect(documentTitle.textContent).toBe('Hydrated opaque HTML title');
		expect(container.querySelector('[data-opaque-boundary-html-title]')).toBeNull();

		root.render(TemplateHtmlTitle, { documentTitle: 'Updated hydrated opaque HTML title' });
		flushSync(() => {});
		expect(container.querySelector('#template-html-title-boundary')).toBe(section);
		expect(document.head.querySelector('[data-opaque-boundary-html-title]')).toBe(documentTitle);
		expect(documentTitle.textContent).toBe('Updated hydrated opaque HTML title');

		root.unmount();
		expect(document.head.querySelector('[data-opaque-boundary-html-title]')).toBeNull();
		container.remove();
	});

	it('hydrates directive-forced title destinations in place', () => {
		const props = {
			documentTitle: 'Hydrated directive dashboard',
			svgTitle: 'Hydrated directive tooltip',
			show: true,
		};
		const { html } = ServerRT.renderToString(server.ReturnedDirectiveTitles, props);
		const serverMarkup = document.createElement('template');
		serverMarkup.innerHTML = html;
		const documentTitle = serverMarkup.content.querySelector(
			'[data-directive-document-title]',
		) as HTMLTitleElement;
		const adjacentServerNode = documentTitle.previousSibling;
		if (adjacentServerNode?.nodeType === Node.COMMENT_NODE) {
			document.head.append(adjacentServerNode);
		}
		document.head.append(documentTitle);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.append(serverMarkup.content);
		const outer = container.querySelector('#directive-title-outer');
		const svg = container.querySelector('#directive-svg-title-boundary');
		const svgTitle = container.querySelector('[data-directive-svg-title]');

		const root = hydrateRoot(container, ReturnedDirectiveTitles, props);
		flushSync(() => {});
		expect(document.head.querySelector('[data-directive-document-title]')).toBe(documentTitle);
		expect(container.querySelector('#directive-title-outer')).toBe(outer);
		expect(container.querySelector('#directive-svg-title-boundary')).toBe(svg);
		expect(container.querySelector('[data-directive-svg-title]')).toBe(svgTitle);

		root.render(ReturnedDirectiveTitles, {
			documentTitle: 'Updated hydrated directive dashboard',
			svgTitle: 'Updated hydrated directive tooltip',
			show: true,
		});
		flushSync(() => {});
		expect(document.head.querySelector('[data-directive-document-title]')).toBe(documentTitle);
		expect(container.querySelector('[data-directive-svg-title]')).toBe(svgTitle);
		expect(documentTitle.textContent).toBe('Updated hydrated directive dashboard');
		expect(svgTitle?.textContent).toBe('Updated hydrated directive tooltip');

		root.unmount();
		expect(document.head.querySelector('[data-directive-document-title]')).toBeNull();
		container.remove();
	});
});
