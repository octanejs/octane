import { resolve } from 'node:path';
import { compile } from 'octane/compiler';
import { octane } from 'octane/compiler/vite';
import { createRoot, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadServerFixture } from './_server-fixture';
import {
	Direct,
	CrossComponent,
	InvalidCrossComponentNestedListItem,
	InvalidNestedAnchor,
	InvalidNestedForm,
	InvalidNestedListItem,
	InvalidOptionChild,
	InvalidRootDescendant,
	InvalidStaticTableRowText,
	InvalidStaticTableWhitespace,
	InvalidTable,
	MathMlAnnotationHtml,
	MathMlAnnotationXml,
	MathMlNestedLinks,
	OptionComponentRoot,
	ParagraphComponentRoot,
	SelectComponentRoot,
	Valid,
	ValidAnchorScope,
	ValidCrossComponentListScope,
	ValidListItemScope,
	ValidMultipleCrossComponentListScopes,
	ValidParagraphScope,
} from './_fixtures/ssr-invalid-nesting.tsrx';

const fixture = resolve(__dirname, '_fixtures/ssr-invalid-nesting.tsrx');
const dev = loadServerFixture(fixture, { compileOptions: { dev: true } });
const prod = loadServerFixture(fixture, { compileOptions: { dev: false } });
const productionCompile = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function errors() {
	return vi.spyOn(console, 'error').mockImplementation(() => {});
}

function messageAt(spy: ReturnType<typeof errors>, index = 0): string {
	return String(spy.mock.calls[index]?.[0]);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DEV SSR invalid HTML nesting', () => {
	it('leaves valid HTML unchanged and silent', () => {
		const spy = errors();
		const { html } = renderToString(dev.Valid);

		expect(html).toContain(
			'<main><p>valid</p><table><tbody><tr><td>cell</td></tr></tbody></table></main>',
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it('reports a direct parser-repaired relationship with both source locations', () => {
		const spy = errors();
		const { html } = renderToString(dev.Direct);

		expect(html).toContain('<p><div>direct</div></p>');
		expect(spy).toHaveBeenCalledTimes(1);
		const warning = messageAt(spy);
		expect(warning).toContain('Octane SSR invalid HTML nesting:');
		expect(warning).toContain('`<div>`');
		expect(warning).toContain('cannot be a child of `<p>`');
		expect(warning).toContain('The browser will repair this HTML before hydration');
		expect(warning.match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
	});

	it('treats a deferred hydration wrapper as a real HTML parent', () => {
		const spy = errors();
		const { html } = renderToString(dev.HydrateWrapper, {
			when: { _t: 'never' },
		});

		expect(html).toContain('<span>deferred</span>');
		expect(spy).toHaveBeenCalledTimes(1);
		const warning = messageAt(spy);
		expect(warning).toContain('`<div>`');
		expect(warning).toContain('cannot be a child of `<p>`');
	});

	it('tracks transparent component boundaries when checking ancestors', () => {
		const spy = errors();
		renderToString(dev.CrossComponent);

		expect(spy).toHaveBeenCalledTimes(1);
		const warning = messageAt(spy);
		expect(warning).toContain('`<button>`');
		expect(warning).toContain('cannot be a descendant of `<button>`');
		expect(warning.match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
	});

	it('reports table markup the HTML parser will repair', () => {
		const spy = errors();
		renderToString(dev.InvalidTable);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain('`<table>` only allows these children');
		expect(messageAt(spy)).toContain('Add a `<tbody>`, `<thead>`, or `<tfoot>`');
	});

	// Per validateDOMNesting-test.js:73 — parser scopes stop warnings at the
	// same object, button, and special-element boundaries as browser parsing.
	it.each([
		['an object-scoped nested anchor', 'ValidAnchorScope'],
		['a button-scoped nested paragraph', 'ValidParagraphScope'],
		['a section-scoped nested list item', 'ValidListItemScope'],
		['a list-scoped nested list item across components', 'ValidCrossComponentListScope'],
		['select, optgroup, and option children', 'ValidSelectChildren'],
	])('keeps %s silent', (_description, component) => {
		const spy = errors();
		renderToString(dev[component]);
		expect(spy).not.toHaveBeenCalled();
	});

	// Per validateDOMNesting-test.js:88 — plain wrappers do not reset the
	// autoclosing or form/anchor ancestor scopes.
	it.each([
		['a nested list item', 'InvalidNestedListItem', '`<li>`'],
		['a nested list item across components', 'InvalidCrossComponentNestedListItem', '`<li>`'],
		['a nested anchor', 'InvalidNestedAnchor', '`<a>`'],
		['a nested form', 'InvalidNestedForm', '`<form>`'],
	])('reports %s across transparent HTML wrappers', (_description, component, tag) => {
		const spy = errors();
		renderToString(dev[component]);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain(`cannot be a descendant of ${tag}`);
		expect(messageAt(spy).match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
	});

	// Per ReactDOMComponent-test.js:2274 — invalid select/option children are
	// consumed or rearranged by the browser's dedicated select parser mode.
	it.each([
		['a div in select', 'InvalidSelectChild', '`<select>`'],
		['a div in option', 'InvalidOptionChild', '`<option>`'],
	])('reports %s', (_description, component, parent) => {
		const spy = errors();
		renderToString(dev[component]);
		const warnings = spy.mock.calls
			.map((call) => String(call[0]))
			.filter((warning) => warning.includes('Octane SSR invalid HTML nesting:'));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(`cannot be a child of ${parent}`);
	});

	// Per ReactDOMComponent-test.js:2274/:2346 — whitespace and visible text
	// have separate actionable diagnostics, regardless of static/dynamic origin.
	it.each([
		['dynamic table whitespace', 'InvalidTableText', ' ', 'whitespace text nodes', '`<table>`'],
		['dynamic table text', 'InvalidTableText', 'text', 'text nodes', '`<table>`'],
		['dynamic row whitespace', 'InvalidTableRowText', ' ', 'whitespace text nodes', '`<tr>`'],
		['dynamic row text', 'InvalidTableRowText', 'text', 'text nodes', '`<tr>`'],
		[
			'authored table whitespace',
			'InvalidStaticTableWhitespace',
			undefined,
			'whitespace text nodes',
			'`<table>`',
		],
		['authored row text', 'InvalidStaticTableRowText', undefined, 'text nodes', '`<tr>`'],
	])('reports %s without changing SSR output', (_description, component, text, kind, parent) => {
		const spy = errors();
		const { html } = renderToString(dev[component], { text });
		expect(html).toContain(text ?? (component === 'InvalidStaticTableWhitespace' ? ' ' : 'text'));
		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain(`${kind} cannot be a child of ${parent}`);
		if (kind === 'whitespace text nodes') {
			expect(messageAt(spy)).toContain('extra whitespace between tags');
		}
		expect(messageAt(spy)).toContain('ssr-invalid-nesting.tsrx:');
	});

	it('does not report nullish or empty dynamic text in restricted table contexts', () => {
		const spy = errors();
		renderToString(dev.InvalidTableText, { text: null });
		renderToString(dev.InvalidTableText, { text: '' });
		expect(spy).not.toHaveBeenCalled();
	});

	it('respects custom-element and SVG parsing boundaries', () => {
		const spy = errors();
		renderToString(dev.CustomElementBoundary);
		renderToString(dev.SvgNestedLinks);

		expect(spy).not.toHaveBeenCalled();
	});

	it('resumes HTML validation inside SVG foreignObject', () => {
		const spy = errors();
		renderToString(dev.ForeignObjectHtml);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain('cannot be a child of `<p>`');
	});

	// MathML is foreign content unless annotation-xml explicitly opens an HTML
	// integration point; sibling XML annotations retain their own parser rules.
	it('respects MathML namespaces and annotation-xml HTML integration points', () => {
		const spy = errors();
		renderToString(dev.MathMlNestedLinks);
		renderToString(dev.MathMlAnnotationXml);
		expect(spy).not.toHaveBeenCalled();

		renderToString(dev.MathMlAnnotationHtml);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain('cannot be a child of `<p>`');
	});

	it('deduplicates a repeated authored relationship within one render', () => {
		const spy = errors();
		renderToString(dev.Repeat, { items: ['a', 'b', 'c'] });

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('uses a fresh warning set for each render', () => {
		const spy = errors();
		renderToString(dev.Direct);
		renderToString(dev.Direct);

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('restores the outer element context after a nested server render', () => {
		const spy = errors();
		renderToString(dev.NestedRenderIsolation, {
			renderNested: () => renderToString(dev.Direct).html,
		});

		expect(spy).toHaveBeenCalledTimes(2);
		const warnings = spy.mock.calls.map((call) => String(call[0]));
		expect(warnings.some((warning) => warning.includes('cannot be a child of `<p>`'))).toBe(true);
		expect(
			warnings.some((warning) => warning.includes('cannot be a descendant of `<button>`')),
		).toBe(true);
	});

	it('emits no validation call or warning when server DEV is disabled', () => {
		const spy = errors();
		const source = 'export function App() @{ <p><div>prod</div></p> }';
		const compiled = compile(source, 'App.tsrx', { mode: 'server', dev: false }).code;
		const clientCompiled = compile(source, 'App.tsrx', { dev: false }).code;

		expect(compiled).not.toContain('ssrElement');
		expect(compiled).not.toContain('ssrNestingText');
		expect(clientCompiled).not.toContain('devHtmlNesting');
		expect(renderToString(prod.Direct).html).toContain('<p><div>direct</div></p>');
		expect(renderToString(prod.InvalidStaticTableWhitespace).html).toContain('<table> ');
		expect(renderToString(prod.InvalidTableRowText, { text: 'text' }).html).toContain('<tr>text');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('Vite DEV SSR compiler gate', () => {
	async function transform(command: 'serve' | 'build'): Promise<string> {
		const plugin = octane({ ssr: true });
		const root = process.cwd();
		(plugin.config as any)({ root });
		(plugin.configResolved as any)({
			root,
			command,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			build: { ssr: true },
		});
		return (
			await (plugin.transform as any).call(
				{},
				'export function App() @{ <p><div>vite</div></p> }',
				resolve(root, 'src/App.tsrx'),
				{ ssr: true },
			)
		).code;
	}

	it('enables nesting instrumentation for serve and removes it for build', async () => {
		expect(await transform('serve')).toContain('ssrElement');
		expect(await transform('build')).not.toContain('ssrElement');
	});
});

describe('DEV client invalid HTML nesting', () => {
	function mount(component: any, rootTag = 'div'): { container: HTMLElement; root: any } {
		const container = document.createElement(rootTag);
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(component);
		} catch (error) {
			container.remove();
			throw error;
		}
		return { container, root };
	}

	function expectClientWarning(spy: ReturnType<typeof errors>, fragment: string): void {
		if (productionCompile) {
			expect(spy).not.toHaveBeenCalled();
			return;
		}
		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain(fragment);
		expect(messageAt(spy)).toContain('hydration mismatch');
	}

	it.each([
		['a div nested in a paragraph', Direct, 'cannot be a child of `<p>`'],
		['a nested anchor', InvalidNestedAnchor, 'cannot be a descendant of `<a>`'],
		['a nested form', InvalidNestedForm, 'cannot be a descendant of `<form>`'],
		['a nested list item', InvalidNestedListItem, 'cannot be a descendant of `<li>`'],
		['a div nested in an option', InvalidOptionChild, 'cannot be a child of `<option>`'],
		['a table row without its group', InvalidTable, 'Add a `<tbody>`'],
		['authored whitespace in a table', InvalidStaticTableWhitespace, 'whitespace text nodes'],
		['authored text in a row', InvalidStaticTableRowText, 'text nodes cannot be a child'],
	])('reports %s at render time', (_description, component, message) => {
		const spy = errors();
		const { container, root } = mount(component);
		try {
			expectClientWarning(spy, message);
			if (!productionCompile) {
				expect(messageAt(spy)).toContain('ssr-invalid-nesting.tsrx:');
			}
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it.each([
		['valid table and paragraph markup', Valid],
		['an object-scoped nested anchor', ValidAnchorScope],
		['a button-scoped nested paragraph', ValidParagraphScope],
		['a section-scoped nested list item', ValidListItemScope],
		['a list-scoped nested list item across components', ValidCrossComponentListScope],
		['nested MathML anchors', MathMlNestedLinks],
		['XML MathML annotations', MathMlAnnotationXml],
	])('keeps %s silent on the client', (_description, component) => {
		const spy = errors();
		const { container, root } = mount(component);
		try {
			expect(spy).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('hydrates a list-scoped nested list across components without an invalid nesting warning', () => {
		const spy = errors();
		const container = document.createElement('div');
		container.innerHTML = renderToString(dev.ValidCrossComponentListScope).html;
		document.body.appendChild(container);
		const existingItem = container.querySelector('li nav ul li');
		expect(existingItem?.textContent).toBe('scoped');
		expect(spy).not.toHaveBeenCalled();
		const root = hydrateRoot(container, ValidCrossComponentListScope);
		try {
			flushSync(() => {});
			expect(container.querySelector('li nav ul li')).toBe(existingItem);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('keeps nested keyed list rows silent when their captured dependencies update', () => {
		const spy = errors();
		const { container, root } = mount(ValidCrossComponentListScope);
		try {
			const existingItem = container.querySelector('li nav ul li');
			expect(existingItem?.getAttribute('data-active')).toBe(null);
			flushSync(() => root.render(ValidCrossComponentListScope, { active: 'scoped' }));
			expect(container.querySelector('li nav ul li')).toBe(existingItem);
			expect(existingItem?.getAttribute('data-active')).toBe('true');
			expect(spy).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('keeps independently updated nested lists free of false nesting diagnostics', () => {
		const spy = errors();
		const { container, root } = mount(ValidMultipleCrossComponentListScopes);
		try {
			const firstItem = container.querySelector('nav ul li');
			const secondItem = container.querySelector('nav ol li');
			expect(firstItem?.textContent).toBe('first');
			expect(secondItem?.textContent).toBe('second');

			flushSync(() => root.render(ValidMultipleCrossComponentListScopes, { active: 'first' }));
			expect(container.querySelector('nav ul li')).toBe(firstItem);
			expect(container.querySelector('nav ol li')).toBe(secondItem);
			expect(firstItem?.getAttribute('data-active')).toBe('true');
			expect(secondItem?.hasAttribute('data-active')).toBe(false);

			flushSync(() => root.render(ValidMultipleCrossComponentListScopes, { active: 'second' }));
			expect(container.querySelector('nav ul li')).toBe(firstItem);
			expect(container.querySelector('nav ol li')).toBe(secondItem);
			expect(firstItem?.hasAttribute('data-active')).toBe(false);
			expect(secondItem?.getAttribute('data-active')).toBe('true');
			expect(spy).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('restores HTML nesting validation inside MathML annotation integration points', () => {
		const spy = errors();
		const { container, root } = mount(MathMlAnnotationHtml);
		try {
			expectClientWarning(spy, 'cannot be a child of `<p>`');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	// Per ReactDOMComponent-test.js:2251 — the supported Element container is
	// an HTML ancestor even when the authored component root is transparent.
	it('reports an invalid descendant of the root container', () => {
		const spy = errors();
		const { container, root } = mount(InvalidRootDescendant, 'p');
		try {
			expectClientWarning(spy, 'cannot be a descendant of `<p>`');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('tracks nested elements through transparent component boundaries on the client', () => {
		const spy = errors();
		const { container, root } = mount(CrossComponent);
		try {
			expectClientWarning(spy, 'cannot be a descendant of `<button>`');
			if (!productionCompile) {
				expect(messageAt(spy).match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
			}
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('reports a nested list item across components without an intervening list scope', () => {
		const spy = errors();
		const { container, root } = mount(InvalidCrossComponentNestedListItem);
		try {
			expectClientWarning(spy, 'cannot be a descendant of `<li>`');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it.each([
		['a component-root div in a paragraph', ParagraphComponentRoot, '`<p>`'],
		['a component-root div in a select', SelectComponentRoot, '`<select>`'],
		['a component-root div in an option', OptionComponentRoot, '`<option>`'],
	])('reports %s through its transparent component boundary', (_description, component, parent) => {
		const spy = errors();
		const { container, root } = mount(component);
		try {
			expectClientWarning(spy, `cannot be a child of ${parent}`);
			if (!productionCompile) {
				expect(messageAt(spy).match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
			}
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('deduplicates identical client nesting diagnostics across repeated renders', () => {
		const spy = errors();
		const { container, root } = mount(Direct);
		try {
			flushSync(() => root.render(Direct));
			expectClientWarning(spy, 'cannot be a child of `<p>`');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
