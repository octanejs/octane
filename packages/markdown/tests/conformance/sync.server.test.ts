import type { Element, Root } from 'hast';
import type { ComponentBody } from 'octane';
import { createElement as createOctaneElement } from 'octane';
import { prerender } from 'octane/static';
import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkToc from 'remark-toc';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import Markdown, { type Components, type ExtraProps } from '../../src/index';

async function octaneHtml(props: Parameters<typeof Markdown>[0]): Promise<string> {
	return (await prerender(Markdown as ComponentBody<typeof props>, props)).html
		.replace(/<!--\[-->|<!--\]-->/g, '')
		.replace(/ checked(?=\/?>)/g, ' checked=""')
		.replace(/style="([^"]*);"/g, 'style="$1"');
}

function reactHtml(props: Record<string, unknown>): string {
	return renderToStaticMarkup(createReactElement(ReactMarkdown, props)).replace(
		/<link rel="preload" as="image" href="[^"]*"\/>/g,
		'',
	);
}

describe('synchronous public projection', () => {
	it.each([
		'# heading\n\nA [safe](https://example.com) link.',
	])('matches the pristine default renderer for %j', async (children) => {
		expect(await octaneHtml({ children })).toBe(reactHtml({ children }));
	});

	it.each([
		['block quote', '> a', undefined],
		['break', 'a\\\nb', undefined],
		['indented code', '    a', undefined],
		['fenced code', '```js\na\n```', undefined],
		['delete', '~a~', [remarkGfm]],
		['emphasis', '*a*', undefined],
		['footnote', 'a[^x]\n\n[^x]: y', [remarkGfm]],
		['heading', '# a', undefined],
		['raw HTML', '<i>a</i>', undefined],
		['image', '![a](b)', undefined],
		['image title', '![a](b (c))', undefined],
		['image reference', '![a]\n\n[a]: b', undefined],
		['inline code', '`a`', undefined],
		['link', '[a](b)', undefined],
		['link title', '[a](b (c))', undefined],
		['link reference', '[a]\n\n[a]: b', undefined],
		[
			'prototype-polluting definitions',
			'[][__proto__] [][constructor]\n\n[__proto__]: a\n[constructor]: b',
			undefined,
		],
		['duplicate definitions', '[a][]\n\n[a]: b\n[a]: c', undefined],
		['unordered list', '* a', undefined],
		['ordered list', '1. a', undefined],
		['paragraph', 'a', undefined],
		['strong', '**a**', undefined],
		['table', '| a |\n| - |\n| b |', [remarkGfm]],
		['aligned table', '| a | b | c | d |\n| :- | :-: | -: | - |', [remarkGfm]],
		['thematic break', '***', undefined],
		['absolute path', '[](/a)', undefined],
		['absolute URL', '[](http://a.com)', undefined],
		['uppercase protocol', '[](HTTPS://A.COM)', undefined],
		['javascript URL', '[](javascript:alert(1))', undefined],
		['vbscript URL', '[](vbscript:alert(1))', undefined],
		['uppercase vbscript URL', '[](VBSCRIPT:alert(1))', undefined],
		['file URL', '[](file:///etc/passwd)', undefined],
		['empty URL', '[]()', undefined],
		['query URL', '[](a?javascript:alert(1))', undefined],
		['ampersand URL', '[](a?b&c=d)', undefined],
		['hash URL', '[](a#javascript:alert(1))', undefined],
	] as const)('matches pristine sync identity: %s', async (_name, children, remarkPlugins) => {
		const props = { children, remarkPlugins };
		expect(await octaneHtml(props)).toBe(reactHtml(props));
	});

	it('matches pristine rehype-raw behavior', async () => {
		const props = { children: '<i>a</i>', rehypePlugins: [rehypeRaw] };
		expect(await octaneHtml(props)).toBe(reactHtml(props));
	});

	it('matches the exact upstream allowedElements drop fixture', async () => {
		const props = { children: '# *a*\n* b', allowedElements: ['h1', 'li', 'ul'] };
		const expected = '<h1></h1>\n<ul>\n<li>b</li>\n</ul>';
		expect(reactHtml(props)).toBe(expected);
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('matches the exact upstream unwrapDisallowed with allowedElements fixture', async () => {
		const props = { children: '# *a*', unwrapDisallowed: true, allowedElements: ['h1'] };
		expect(reactHtml(props)).toBe('<h1>a</h1>');
		expect(await octaneHtml(props)).toBe('<h1>a</h1>');
	});

	it('matches the exact upstream disallowedElements fixture without unwrap', async () => {
		const props = { children: '# *a*\n* b', disallowedElements: ['em'] };
		const expected = '<h1></h1>\n<ul>\n<li>b</li>\n</ul>';
		expect(reactHtml(props)).toBe(expected);
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('matches the exact upstream remarkRehypeOptions clobberPrefix footnote output', async () => {
		const props = {
			children: '[^x]\n\n[^x]: a\n\n',
			remarkPlugins: [remarkGfm],
			remarkRehypeOptions: { clobberPrefix: 'b-' },
		};
		const expected = reactHtml(props);
		expect(expected).toContain('href="#b-fn-x" id="b-fnref-x"');
		expect(expected).toContain('<li id="b-fn-x">');
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('matches the exact upstream GFM aligned table cell with merged plugin style', async () => {
		const plugin = () => (tree: Root) =>
			visit(tree, 'element', (node) => {
				if (node.tagName === 'th') node.properties = { ...node.properties, style: 'color: red' };
			});
		const props = {
			children: '| a  |\n| :- |',
			remarkPlugins: [remarkGfm],
			rehypePlugins: [plugin],
		};
		const expected =
			'<table><thead><tr><th style="color:red;text-align:left">a</th></tr></thead></table>';
		expect(reactHtml(props)).toBe(expected);
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('matches the exact upstream href urlTransform public-render fixture', async () => {
		const calls: unknown[][] = [];
		const props = {
			children: "[a](https://b.com 'c')",
			urlTransform(url: string, key: string, node: Element) {
				calls.push([url, key, node.tagName]);
				return '';
			},
		};
		expect(await octaneHtml(props)).toBe('<p><a href="" title="c">a</a></p>');
		expect(calls).toEqual([['https://b.com', 'href', 'a']]);
	});

	it('matches the exact upstream image src urlTransform returning null fixture', async () => {
		const calls: unknown[][] = [];
		const props = {
			children: "![a](https://b.com 'c')",
			urlTransform(url: string, key: string, node: Element) {
				calls.push([url, key, node.tagName]);
				return null;
			},
		};
		expect(await octaneHtml(props)).toBe('<p><img alt="a" title="c"/></p>');
		expect(calls).toEqual([['https://b.com', 'src', 'img']]);
	});

	it('matches the exact upstream remark-gfm single-tilde fixture', async () => {
		const props = { children: 'a ~b~ c', remarkPlugins: [remarkGfm] };
		expect(reactHtml(props)).toBe('<p>a <del>b</del> c</p>');
		expect(await octaneHtml(props)).toBe('<p>a <del>b</del> c</p>');
	});

	it('publicly renders exact unwrapDisallowed with disallowedElements fixture', async () => {
		const props = { children: '# *a*', unwrapDisallowed: true, disallowedElements: ['em'] };
		expect(reactHtml(props)).toBe('<h1>a</h1>');
		expect(await octaneHtml(props)).toBe('<h1>a</h1>');
	});

	it('matches pristine remark-toc output for the upstream fixture', async () => {
		const children = '# a\n## Contents\n## b\n### c\n## d';
		const props = { children, remarkPlugins: [remarkToc] };
		const expected = `<h1>a</h1>
<h2>Contents</h2>
<ul>
<li><a href="#b">b</a>
<ul>
<li><a href="#c">c</a></li>
</ul>
</li>
<li><a href="#d">d</a></li>
</ul>
<h2>b</h2>
<h3>c</h3>
<h2>d</h2>`;
		expect(reactHtml(props)).toBe(expected);
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('passes complete intrinsic props and node while keeping key special', async () => {
		let captured: (Record<string, unknown> & ExtraProps) | undefined;
		const Heading: ComponentBody<Record<string, unknown> & ExtraProps> = (props) => {
			captured = props;
			return createOctaneElement('section', {
				id: String(props.id),
				className: props.className,
				style: props.style,
				children: props.children,
			});
		};
		const decorate = () => (tree: Root) => {
			const heading = tree.children[0] as Element;
			heading.properties = {
				id: 'mapped',
				className: ['alpha', 'beta'],
				ariaLabel: 'label',
				dataSource: 'plugin',
				style: 'color: red; broken',
			};
		};

		const html = await octaneHtml({
			children: '# child',
			rehypePlugins: [decorate],
			components: { h1: Heading },
		});
		expect(html).toContain('<section id="mapped" class="alpha beta"');
		expect(html).toContain('>child</section>');
		expect(captured).toMatchObject({
			id: 'mapped',
			className: 'alpha beta',
			'aria-label': 'label',
			'data-source': 'plugin',
			children: 'child',
			node: { type: 'element', tagName: 'h1' },
		});
		expect(captured).not.toHaveProperty('key');
	});

	it('supports intrinsic remapping, null components, and fragments', async () => {
		expect(await octaneHtml({ children: '# title', components: { h1: 'h2' } })).toBe(
			'<h2>title</h2>',
		);
		const NullParagraph = (() => null) as unknown as ComponentBody<Record<string, unknown>>;
		expect(
			await octaneHtml({
				children: 'hidden\n\n## shown',
				components: { p: NullParagraph },
			}),
		).toBe('\n<h2>shown</h2>');
		expect(await octaneHtml({ children: '# one\n\n## two' })).toBe('<h1>one</h1>\n<h2>two</h2>');
	});

	it('preserves sibling projection and rejects invalid mappings', async () => {
		expect(await octaneHtml({ children: '- a\n- b\n- c' })).toBe(
			'<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>',
		);
		await expect(
			octaneHtml({ children: '# bad', components: { h1: 42 as never } }),
		).rejects.toThrow(/component|function|element/i);
	});

	it.each([
		['headings', '# a\n## b', ['h1', 'h2'], undefined, 2],
		['code', '```\na\n```\n\n\tb\n\n`c`', ['code'], undefined, 3],
		['li', '* [x] a\n1. b', ['li'], [remarkGfm], 2],
		['ol', '1. a', ['ol'], undefined, 1],
		['ul', '* a', ['ul'], undefined, 1],
		['tr', '|a|\n|-|\n|b|', ['tr'], [remarkGfm], 2],
		['td and th', '|a|\n|-|\n|b|', ['td', 'th'], [remarkGfm], 2],
	] as const)(
		'matches the upstream components (%s) fixture, output, node tags, and call count',
		async (_scenario, children, tags, remarkPlugins, expectedCalls) => {
			let calls = 0;
			const components: Record<string, ComponentBody<Record<string, unknown> & ExtraProps>> = {};
			for (const tag of tags) {
				components[tag] = (props) => {
					expect(props.node?.tagName).toBe(tag);
					calls++;
					const { node: _node, ...rest } = props;
					return createOctaneElement(tag, rest);
				};
			}
			const plain = { children, remarkPlugins };
			const expected = reactHtml(plain);
			expect(await octaneHtml({ ...plain, components: components as Components })).toBe(expected);
			expect(calls).toBe(expectedCalls);
		},
	);

	it.each([
		['ARIA', 'c', 'input', { id: 'a', ariaDescribedBy: 'b', required: true }],
		['data', 'b', 'i', { dataWhatever: 'a', dataIgnoreThis: undefined }],
		['comma-separated', 'c', 'i', { accept: ['a', 'b'] }],
		['style', 'a', 'i', { style: 'color: red; font-weight: bold' }],
		['vendor-prefixed style', 'a', 'i', { style: '-ms-b: 1; -webkit-c: 2' }],
		['broken style', 'a', 'i', { style: 'broken' }],
	] as const)(
		'matches the exact upstream plugin-created %s property fixture',
		async (_scenario, children, tagName, properties) => {
			const plugin = () => (tree: Root) => {
				tree.children.unshift({ type: 'element', tagName, properties, children: [] });
			};
			const props = { children, rehypePlugins: [plugin] };
			expect(await octaneHtml(props)).toBe(reactHtml(props));
		},
	);

	it('matches the exact upstream SVG projection fixture', async () => {
		const plugin = () => (tree: Root) => {
			tree.children.unshift({
				type: 'element',
				tagName: 'svg',
				properties: { viewBox: '0 0 500 500', xmlns: 'http://www.w3.org/2000/svg' },
				children: [
					{
						type: 'element',
						tagName: 'title',
						properties: {},
						children: [{ type: 'text', value: 'SVG `<circle>` element' }],
					},
					{
						type: 'element',
						tagName: 'circle',
						properties: { cx: 120, cy: 120, r: 100 },
						children: [],
					},
					{ type: 'element', tagName: 'path', properties: { strokeMiterLimit: -1 }, children: [] },
				],
			});
		};
		const props = { children: 'a', rehypePlugins: [plugin] };
		const expected =
			'<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg"><title>SVG `&lt;circle&gt;` element</title><circle cx="120" cy="120" r="100"></circle><path stroke-miterlimit="-1"></path></svg><p>a</p>';
		expect(reactHtml(props)).toBe(expected);
		expect(await octaneHtml(props)).toBe(expected);
	});

	it('ignores the exact upstream root comment while preserving the paragraph', async () => {
		const plugin = () => (tree: Root) => {
			tree.children.unshift({ type: 'comment', value: 'things!' });
		};
		const props = { children: 'a', rehypePlugins: [plugin] };
		expect(reactHtml(props)).toBe('<p>a</p>');
		expect(await octaneHtml(props)).toBe('<p>a</p>');
	});

	it('matches the exact upstream root-replaced-by-comment empty output', async () => {
		const plugin = () => () => ({ type: 'comment' as const, value: 'things!' });
		const props = { children: 'a', rehypePlugins: [plugin] };
		expect(reactHtml(props)).toBe('');
		expect(await octaneHtml(props)).toBe('');
	});

	it('passes the complete upstream HAST node including child and source positions', async () => {
		let captured: Element | undefined;
		const Em: ComponentBody<Record<string, unknown> & ExtraProps> = (props) => {
			captured = props.node;
			const { node: _node, ...rest } = props;
			return createOctaneElement('em', rest);
		};
		expect(await octaneHtml({ children: '*a*', components: { em: Em } })).toBe('<p><em>a</em></p>');
		expect(captured).toEqual({
			type: 'element',
			tagName: 'em',
			properties: {},
			children: [
				{
					type: 'text',
					value: 'a',
					position: {
						start: { line: 1, column: 2, offset: 1 },
						end: { line: 1, column: 3, offset: 2 },
					},
				},
			],
			position: {
				start: { line: 1, column: 1, offset: 0 },
				end: { line: 1, column: 4, offset: 3 },
			},
		});
	});
});
