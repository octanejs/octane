import type { ComponentBody } from 'octane';
import { createElement } from 'octane';
import { prerender } from 'octane/static';
import { describe, expect, it } from 'vitest';
import Markdown, { MarkdownAsync, MarkdownHooks } from '../../src/index';

describe('server execution', () => {
	it('renders sync deterministically without browser globals', async () => {
		const previous = (globalThis as { window?: unknown }).window;
		delete (globalThis as { window?: unknown }).window;
		try {
			const props = { children: '# server\n\n[link](/safe)' };
			const first = await prerender(Markdown as ComponentBody<typeof props>, props);
			const second = await prerender(Markdown as ComponentBody<typeof props>, props);
			expect(first.html).toBe(second.html);
			expect(first.html).toContain('<h1>server</h1>');
		} finally {
			if (previous !== undefined) (globalThis as { window?: unknown }).window = previous;
		}
	});

	it('renders awaited async deterministically without browser globals', async () => {
		const props = { children: '## async-server' };
		const first = await MarkdownAsync(props);
		const second = await MarkdownAsync(props);
		const FirstRoot = (() => first) as unknown as ComponentBody;
		const SecondRoot = (() => second) as unknown as ComponentBody;
		expect((await prerender(FirstRoot, {})).html).toBe((await prerender(SecondRoot, {})).html);
	});

	it('keeps MarkdownHooks on its pinned fallback during server rendering', async () => {
		const props = {
			children: '# deferred',
			fallback: createElement('span', { 'data-fallback': 'server', children: 'loading' }),
		};
		const result = await prerender(MarkdownHooks as ComponentBody<typeof props>, props);
		expect(result.html).toContain('<span data-fallback="server">loading</span>');
		expect(result.html).not.toContain('deferred');
	});
});
