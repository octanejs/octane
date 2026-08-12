import type { ComponentBody } from 'octane';
import { createElement as createOctaneElement } from 'octane';
import { prerender } from 'octane/static';
import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
		'> quote\n\n- one\n- two\n\n`code`',
		'![alt](javascript:alert(1) "title")',
		'<i>raw</i>',
	])('matches the pristine default renderer for %j', async (children) => {
		expect(await octaneHtml({ children })).toBe(reactHtml({ children }));
	});

	it('matches pristine plugin-created GFM output', async () => {
		const children = '~~delete~~\n\n| a | b |\n| - | - |\n| 1 | 2 |';
		expect(await octaneHtml({ children, remarkPlugins: [remarkGfm] })).toBe(
			reactHtml({ children, remarkPlugins: [remarkGfm] }),
		);
	});

	it('maps every upstream-covered intrinsic family with node and stable special keys', async () => {
		const expectedTags = ['h1', 'code', 'li', 'ol', 'ul', 'tr', 'td', 'th'];
		const calls: string[] = [];
		const components: Record<string, ComponentBody<Record<string, unknown> & ExtraProps>> = {};
		for (const tag of expectedTags) {
			components[tag] = (props) => {
				calls.push(props.node?.tagName || 'missing');
				expect(props).not.toHaveProperty('key');
				const { node: _node, ...intrinsicProps } = props;
				return createOctaneElement(tag, intrinsicProps);
			};
		}
		await octaneHtml({
			children: '# heading\n\n`code`\n\n1. item\n\n- loose\n\n| a | b |\n| - | - |\n| c | d |',
			remarkPlugins: [remarkGfm],
			components: components as Components,
		});
		expect(new Set(calls)).toEqual(new Set(expectedTags));
	});

	it.each([
		['ARIA and data', { ariaDescribedBy: ['a', 'b'], dataSource: 'plugin' }],
		['comma-separated', { accept: ['image/png', 'image/jpeg'] }],
		['style and vendor prefixes', { style: 'color: red; -webkit-line-clamp: 2' }],
	] as const)(
		'matches pristine projection for plugin-created %s properties',
		async (_name, properties) => {
			const plugin = () => () => ({
				type: 'root' as const,
				children: [
					{
						type: 'element' as const,
						tagName: 'div',
						properties,
						children: [{ type: 'text' as const, value: 'value' }],
					},
				],
			});
			const props = { children: 'ignored', rehypePlugins: [plugin] };
			expect(await octaneHtml(props)).toBe(reactHtml(props));
		},
	);

	it('matches pristine SVG, comments, and root replacement', async () => {
		const plugin = () => () => ({
			type: 'element' as const,
			tagName: 'svg',
			properties: { viewBox: '0 0 10 10' },
			children: [
				{ type: 'comment' as const, value: 'ignored' },
				{
					type: 'element' as const,
					tagName: 'circle',
					properties: { cx: 5, cy: 5, r: 4 },
					children: [],
				},
			],
		});
		const props = { children: 'ignored', rehypePlugins: [plugin] };
		expect(await octaneHtml(props)).toBe(reactHtml(props));
	});
});
