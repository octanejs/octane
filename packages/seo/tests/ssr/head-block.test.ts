// `<Head>` groups tags for readability and nothing more: it does not own
// metadata, so where a block sits cannot change the result. These pin that.
import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import {
	AppLevelConfig,
	Bare,
	ConfiguredPage,
	Grouped,
	HostileMarkup,
	QuoteBreakout,
	HostileTitle,
	LinkOverride,
	Nested,
	OpenGraphWithoutOgTags,
	RawScript,
	SocialShell,
	TemplateOnPage,
} from '../_fixtures/head-block.tsrx';

async function render(Component: any) {
	const { html, head } = await prerender(Component, undefined, { headChannel: 'separate' });
	return { html, head: head ?? '' };
}

describe('<Head> grouping', () => {
	it('treats a <Head> block as grouping only, matching bare tags exactly', async () => {
		const grouped = await render(Grouped);
		// The same tags written directly under the provider, with no block.
		const bare = await render(Bare);
		expect(bare.head).toBe(grouped.head);
		expect(grouped.head).toContain('<title>Grouped</title>');
		expect(grouped.head).toContain('content="grouped description"');
		expect(grouped.head).toContain('rel="canonical"');
	});

	it('renders the grouped JSON-LD script', async () => {
		const { html } = await render(Grouped);
		expect(html).toContain('application/ld+json');
		expect(html).toContain('"headline":"Grouped"');
	});

	it('merges a page block with the app-level one, emitting a single set', async () => {
		const { head } = await render(Nested);
		// The page block renders later, so its title wins.
		expect(head).toContain('<title>Deep</title>');
		expect(head).not.toContain('Outer');
		// The app-level block's other tag is untouched.
		expect(head).toContain('content="outer"');
		// One merged set, not one per <Head>.
		expect(head.match(/<title/g)).toHaveLength(1);
		expect(head.match(/rel="canonical"/g)).toHaveLength(1);
	});

	it('renders a raw script body escaped by the renderer', async () => {
		const { html } = await render(RawScript);
		expect(html).toContain('type="text/plain"');
		expect(html).toContain('hello');
	});
});

describe('app-level site and titleTemplate', () => {
	it('reach a page that declares neither', async () => {
		// Both are set once near the root while the page names only its own title
		// and a relative canonical, which is how apps actually configure them.
		const { head } = await render(AppLevelConfig);
		expect(head).toContain('<title>Lisbon · Wayfinder</title>');
		expect(head).toContain('href="https://x.dev/trips/lisbon"');
		expect(head).toContain('content="https://x.dev/og/lisbon.png"');
	});

	it('applies the template exactly once', async () => {
		const { head } = await render(AppLevelConfig);
		expect(head.match(/· Wayfinder/g)).toHaveLength(1);
	});
});

describe('repeatable link overrides', () => {
	it('replaces a language alternate and an icon rather than duplicating them', async () => {
		const { head } = await render(LinkOverride);
		// The German alternate and the 32x32 icon moved; each must appear once, at
		// the page's URL.
		expect(head.match(/hreflang="de"/g)).toHaveLength(1);
		expect(head).toContain('href="/de/page"');
		expect(head).not.toContain('/de/layout');
		expect(head.match(/sizes="32x32"/g)).toHaveLength(1);
		expect(head).toContain('href="/new-icon.png"');
		expect(head).not.toContain('/old-icon.png');

		// Untouched slots survive.
		expect(head).toContain('href="/fr/layout"');
		expect(head).toContain('href="/small.png"');

		// Resource hints are keyed by target, so both font preloads remain.
		expect(head).toContain('href="/a.woff2"');
		expect(head).toContain('href="/b.woff2"');
	});
});

describe('titles carrying regex replacement patterns', () => {
	it('reach the served document title verbatim', async () => {
		const { head } = await render(HostileTitle);
		// Escaped for HTML, but not rewritten by `%s` substitution.
		expect(head).toContain("<title>Deals: 50% off $&amp; and $' plus $1 · Shop</title>");
	});
});

// An app that declares the Open Graph and Twitter shell once, and pages that
// declare only their own title/description/canonical. The social tags must pick
// those up; a card with og:type but no og:title is useless.
describe('social fill-in across registrations', () => {
	it('fills og and twitter from the page title, description, and canonical', async () => {
		const { head } = await render(SocialShell);
		expect(head).toContain('property="og:title" content="Go somewhere, slowly"');
		expect(head).toContain('property="og:description" content="City breaks, slowly."');
		expect(head).toContain('property="og:url" content="https://x.dev/"');
		expect(head).toContain('name="twitter:title" content="Go somewhere, slowly"');
		expect(head).toContain('name="twitter:description" content="City breaks, slowly."');
	});

	it('fills from an openGraph block that emitted no og: tag of its own', async () => {
		// `openGraph: { publishedTime }` produces only `article:published_time`, so
		// scanning emitted keys for an `og:` prefix would miss the opt-in entirely.
		const { head } = await render(OpenGraphWithoutOgTags);
		expect(head).toContain('property="article:published_time"');
		expect(head).toContain('property="og:title" content="Post"');
	});

	it('mirrors the raw title even when the template sits on the same <Seo>', async () => {
		const { head } = await render(TemplateOnPage);
		expect(head).toContain('<title>Pricing · Acme</title>');
		expect(head).toContain('property="og:title" content="Pricing"');
		expect(head).toContain('name="twitter:title" content="Pricing"');
	});
});

describe('per-request isolation of app-level config', () => {
	it("does not let one render inherit another's site, template, or opt-in", async () => {
		const [a, b] = await Promise.all([
			prerender(
				ConfiguredPage,
				{ site: 'https://a.dev', suffix: ' · A', title: 'Alpha' },
				{ headChannel: 'separate' },
			),
			prerender(
				ConfiguredPage,
				{ site: 'https://b.dev', suffix: ' · B', title: 'Beta' },
				{ headChannel: 'separate' },
			),
		]);
		expect(a.head).toContain('<title>Alpha · A</title>');
		expect(a.head).toContain('href="https://a.dev/p"');
		expect(a.head).toContain('property="og:title" content="Alpha"');
		expect(a.head).not.toContain('b.dev');
		expect(a.head).not.toContain('Beta');

		expect(b.head).toContain('<title>Beta · B</title>');
		expect(b.head).toContain('href="https://b.dev/p"');
		expect(b.head).not.toContain('a.dev');
		expect(b.head).not.toContain('Alpha');
	});
});

describe('escaping in the served bytes', () => {
	it('cannot inject an element or a second attribute', async () => {
		const { head } = await render(HostileMarkup);
		// Parse the real bytes: string matching cannot tell a legitimate closing
		// tag from an injected one, and the DOM is the oracle that matters.
		const { JSDOM } = await import('jsdom');
		const dom = new JSDOM('<!doctype html><html><head>' + head + '</head><body></body></html>');
		const doc = dom.window.document;

		// Text content escaping: the title carries the markup as TEXT, and no
		// element was created from it.
		expect(doc.head.querySelectorAll('title')).toHaveLength(1);
		expect(doc.title).toBe('</title><script>alert(1)</script>');
		expect(doc.querySelectorAll('script')).toHaveLength(0);

		// Attribute escaping: the quote is neutralised, so no second attribute
		// appears and the value survives intact.
		const meta = doc.head.querySelector('meta[name="description"]')!;
		expect(meta.getAttribute('content')).toBe('a "quoted" & <b>bold</b> value');
		expect(meta.getAttributeNames().sort()).toEqual(['content', 'name']);
	});

	it('closes the attribute-breakout vector', async () => {
		// The classic vector: a value that tries to end the attribute and start an
		// event handler.
		const { head } = await render(QuoteBreakout);
		const { JSDOM } = await import('jsdom');
		const doc = new JSDOM('<!doctype html><html><head>' + head + '</head></html>').window.document;
		const meta = doc.head.querySelector('meta[name="description"]')!;
		expect(meta.getAttributeNames().sort()).toEqual(['content', 'name']);
		expect(meta.getAttribute('onload')).toBeNull();
		expect(meta.getAttribute('content')).toBe('x" onload="alert(1)');
	});
});
