// The contract that matters to a crawler: what bytes land in <head>, and which
// declaration wins when two of them name the same thing.
import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import { Page, LayoutOnly, DynamicList } from '../_fixtures/pages.tsrx';

async function head(Component: any, props?: any): Promise<string> {
	const result = await prerender(Component, props, { headChannel: 'separate' });
	return result.head ?? '';
}

describe('server-rendered metadata', () => {
	it('emits the merged tags into the head channel, not the body', async () => {
		const result = await prerender(Page, { slug: 'hello' }, { headChannel: 'separate' });
		expect(result.head).toContain('<title>Post: hello</title>');
		expect(result.head).toContain('name="description"');
		expect(result.head).toContain('rel="canonical"');
		expect(result.html).not.toContain('<title');
		expect(result.html).toContain('<main>');
	});

	it('lets the inner page beat the outer layout (last wins)', async () => {
		// The layout sets a default title and description; the page overrides the
		// title. Without the merge the platform would keep the layout's, because
		// the first duplicate in tree order is the one that counts.
		const markup = await head(Page, { slug: 'hello' });
		expect(markup).toContain('<title>Post: hello</title>');
		expect(markup).not.toContain('Fallback title');
		// The layout's description survives: it was never overridden.
		expect(markup).toContain('content="layout description"');
		expect(markup.match(/<title/g)).toHaveLength(1);
		expect(markup.match(/name="description"/g)).toHaveLength(1);
	});

	it('keeps the layout defaults when a page overrides nothing', async () => {
		const markup = await head(LayoutOnly);
		expect(markup).toContain('<title>Fallback title</title>');
		expect(markup).toContain('content="layout description"');
	});

	it('keeps repeatable link rels distinct while collapsing canonical', async () => {
		const markup = await head(Page, { slug: 'hello' });
		expect(markup.match(/rel="canonical"/g)).toHaveLength(1);
		expect(markup).toContain('hreflang="de"');
		expect(markup).toContain('hreflang="fr"');
	});

	it('renders JSON-LD as an escaped script', async () => {
		const result = await prerender(Page, { slug: 'hello' }, { headChannel: 'separate' });
		const all = (result.head ?? '') + result.html;
		expect(all).toContain('application/ld+json');
		expect(all).toContain('"@type":"Article"');
	});

	it('renders a data-driven tag list', async () => {
		const markup = await head(DynamicList, {
			tags: [
				{ name: 'a', content: '1' },
				{ name: 'b', content: '2' },
				{ name: 'c', content: '3' },
			],
		});
		expect(markup).toContain('name="a"');
		expect(markup).toContain('name="b"');
		expect(markup).toContain('name="c"');
	});

	it('does not leak metadata between concurrent renders', async () => {
		const [a, b] = await Promise.all([
			head(Page, { slug: 'first' }),
			head(Page, { slug: 'second' }),
		]);
		expect(a).toContain('<title>Post: first</title>');
		expect(a).not.toContain('second');
		expect(b).toContain('<title>Post: second</title>');
		expect(b).not.toContain('first');
	});
});
