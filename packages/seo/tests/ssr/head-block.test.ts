// `<Head>` groups tags for readability and nothing more: it does not own
// metadata, so where a block sits cannot change the result. These pin that.
import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import {
	AppLevelConfig,
	Bare,
	Grouped,
	HostileTitle,
	LinkOverride,
	Nested,
	OpenGraphWithoutOgTags,
	RawScript,
	SocialShell,
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
});
