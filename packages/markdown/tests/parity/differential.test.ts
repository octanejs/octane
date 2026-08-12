import type { ComponentBody } from 'octane';
import { prerender } from 'octane/static';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { expect, test } from 'vitest';
import Markdown from '../../src/index';

function visibleOctaneHtml(html: string): string {
	return html.replace(/<!--\[-->|<!--\]-->/g, '');
}

// @parity-case react-markdown:differential:sync
test('sync Markdown output matches pristine React', async () => {
	const props = { children: '# parity\n\n[safe](/path)' };
	const octane = await prerender(Markdown as ComponentBody<typeof props>, props);
	const react = renderToStaticMarkup(createElement(ReactMarkdown, props));
	expect(visibleOctaneHtml(octane.html)).toBe(react);
});

// @parity-case react-markdown:differential:unsafe-url
test('unsafe URL filtering matches pristine React', async () => {
	const props = { children: '[unsafe](javascript:alert(1))' };
	const octane = await prerender(Markdown as ComponentBody<typeof props>, props);
	const react = renderToStaticMarkup(createElement(ReactMarkdown, props));
	expect(visibleOctaneHtml(octane.html)).toBe(react);
});

// @parity-case react-markdown:differential:image-preload
test('image markup matches apart from React framework preloading', async () => {
	// OCTANE DIVERGENCE[react-markdown-react-image-preload][react-markdown:differential:image-preload]
	const props = { children: '![alt](/image.png)' };
	const octane = visibleOctaneHtml(
		(await prerender(Markdown as ComponentBody<typeof props>, props)).html,
	);
	const react = renderToStaticMarkup(createElement(ReactMarkdown, props));
	expect(react).toContain('<link rel="preload" as="image" href="/image.png"/>');
	expect(octane).not.toContain('rel="preload"');
	expect(react.replace('<link rel="preload" as="image" href="/image.png"/>', '')).toBe(octane);
});
