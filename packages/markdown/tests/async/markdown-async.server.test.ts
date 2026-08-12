import { Writable } from 'node:stream';
import type { ComponentBody, ElementDescriptor } from 'octane';
import { prerender } from 'octane/static';
import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { MarkdownAsync as ReactMarkdownAsync } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import { describe, expect, it } from 'vitest';
import { MarkdownAsync } from '../../src/index';

function normalize(html: string): string {
	return html
		.replace(/<!--\[-->|<!--\]-->/g, '')
		.replace(/style="([^"]*);"/g, 'style="$1"')
		.replace(/<link rel="preload" as="image" href="[^"]*"\/>/g, '');
}

async function renderOctane(element: ElementDescriptor): Promise<string> {
	const Root = (() => element) as unknown as ComponentBody;
	return normalize((await prerender(Root, {})).html);
}

describe('MarkdownAsync', function () {
	it('documents the synchronous-render framework divergence with the upstream fixture', async function () {
		// OCTANE DIVERGENCE[react-markdown-async-sync-render][runtime:0c41907154f06242]
		// React's synchronous renderer throws when MarkdownAsync suspends; Octane returns an
		// awaitable ElementDescriptor from the same call site.
		expect(function () {
			renderToStaticMarkup(createReactElement(ReactMarkdownAsync, { children: 'a' }));
		}).toThrow(/A component suspended while responding to synchronous input/);
		const pending = MarkdownAsync({ children: 'a' });
		expect(pending).toBeInstanceOf(Promise);
		expect(await renderOctane(await pending)).toBe('<p>a</p>');
	});

	it('matches the upstream pipeable-stream output fixture', async () => {
		const react = await new Promise<string>((resolve, reject) => {
			let html = '';
			const stream = renderToPipeableStream(
				createReactElement(ReactMarkdownAsync, { children: 'a' }),
				{ onError: reject },
			);
			stream.pipe(
				new Writable({
					write(chunk, _encoding, callback) {
						html += chunk.toString();
						callback();
					},
					final(callback) {
						resolve(html);
						callback();
					},
				}),
			);
		});
		expect(react).toBe('<p>a</p>');
		expect(await renderOctane(await MarkdownAsync({ children: 'a' }))).toBe('<p>a</p>');
	});

	it('matches exact starry-night highlighted HTML for the upstream fixture', async () => {
		const props = {
			children: '```js\nconsole.log(3.14)',
			rehypePlugins: [rehypeStarryNight],
		};
		const expected =
			'<pre><code class="language-js"><span class="pl-en">console</span>.<span class="pl-c1">log</span>(<span class="pl-c1">3.14</span>)\n</code></pre>';
		expect(renderToStaticMarkup(await ReactMarkdownAsync(props))).toBe(expected);
		expect(await renderOctane(await MarkdownAsync(props))).toBe(expected);
	});
});
