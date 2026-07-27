// The merge decides precedence, and precedence is the whole reason this package
// exists: the platform takes the FIRST duplicate in tree order, while authoring
// order puts layout defaults first, so without this the generic value wins.
import { describe, it, expect } from 'vitest';
import {
	applyConfig,
	expandSeo,
	formatRobots,
	jsonLdDescriptor,
	linkKey,
	mergeDescriptors,
	metaKey,
	resolveUrl,
	type SeoDescriptor,
} from '@octanejs/seo';

const meta = (attrs: Record<string, string>, text?: string): SeoDescriptor => ({
	tag: 'meta',
	key: metaKey(attrs),
	attrs,
	text,
});

describe('mergeDescriptors', () => {
	it('lets the last registration win per identity', () => {
		const merged = mergeDescriptors([
			{ tag: 'title', key: 'title', attrs: {}, text: 'layout' },
			{ tag: 'title', key: 'title', attrs: {}, text: 'page' },
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0].text).toBe('page');
	});

	it('keeps the position of a replaced descriptor', () => {
		// Order must not depend on when a value was overridden, or the server and
		// client could emit different sequences and hydration adoption would drift.
		const merged = mergeDescriptors([
			{ tag: 'title', key: 'title', attrs: {}, text: 'layout' },
			meta({ name: 'description', content: 'layout' }),
			{ tag: 'title', key: 'title', attrs: {}, text: 'page' },
		]);
		expect(merged.map((d) => d.key)).toEqual(['title', 'meta:name=description']);
		expect(merged[0].text).toBe('page');
	});

	it('is idempotent, so an SSR suspense re-pass cannot duplicate anything', () => {
		const once = [
			{ tag: 'title' as const, key: 'title', attrs: {}, text: 'x' },
			meta({ name: 'description', content: 'y' }),
		];
		expect(mergeDescriptors([...once, ...once])).toEqual(mergeDescriptors(once));
	});

	it('keeps distinct naming channels apart', () => {
		const merged = mergeDescriptors([
			meta({ name: 'og:title', content: 'by-name' }),
			meta({ property: 'og:title', content: 'by-property' }),
			meta({ 'http-equiv': 'og:title', content: 'by-http-equiv' }),
		]);
		expect(merged).toHaveLength(3);
	});

	it('does not collapse unrelated meta tags that carry no naming attribute', () => {
		const merged = mergeDescriptors([meta({ content: 'a' }), meta({ content: 'b' })]);
		expect(merged).toHaveLength(2);
	});
});

describe('link identity', () => {
	it('collapses rels that must be unique', () => {
		expect(linkKey({ rel: 'canonical', href: '/a' })).toBe(
			linkKey({ rel: 'canonical', href: '/b' }),
		);
	});

	it('keeps repeatable rels distinct by what distinguishes them', () => {
		const de = linkKey({ rel: 'alternate', hreflang: 'de', href: '/de' });
		const fr = linkKey({ rel: 'alternate', hreflang: 'fr', href: '/fr' });
		expect(de).not.toBe(fr);

		const small = linkKey({ rel: 'icon', sizes: '16x16', href: '/a.png' });
		const large = linkKey({ rel: 'icon', sizes: '32x32', href: '/b.png' });
		expect(small).not.toBe(large);
	});
});

describe('resolveUrl', () => {
	it('absolute-ises relative values against the site origin', () => {
		expect(resolveUrl('/a', 'https://x.dev')).toBe('https://x.dev/a');
		expect(resolveUrl('a', 'https://x.dev/')).toBe('https://x.dev/a');
	});

	it('leaves already-absolute and protocol-relative values alone', () => {
		expect(resolveUrl('https://y.dev/a', 'https://x.dev')).toBe('https://y.dev/a');
		expect(resolveUrl('//y.dev/a', 'https://x.dev')).toBe('//y.dev/a');
		expect(resolveUrl('/a', undefined)).toBe('/a');
	});
});

describe('formatRobots', () => {
	it('passes a string through and builds a directive list from an object', () => {
		expect(formatRobots('noindex')).toBe('noindex');
		expect(formatRobots({})).toBe('index, follow');
		expect(formatRobots({ index: false })).toBe('noindex, follow');
		expect(formatRobots({ follow: false, maxImagePreview: 'large' })).toBe(
			'index, nofollow, max-image-preview:large',
		);
	});
});

describe('expandSeo', () => {
	it('falls back to the page title and description for social tags', () => {
		const out = expandSeo({
			title: 'Hello',
			description: 'Desc',
			openGraph: { type: 'article' },
			twitter: { card: 'summary' },
		});
		const content = (key: string) => out.find((d) => d.key === key)?.attrs.content;
		expect(content('meta:property=og:title')).toBe('Hello');
		expect(content('meta:property=og:description')).toBe('Desc');
		expect(content('meta:name=twitter:title')).toBe('Hello');
	});

	it('lets an explicit social value override the fallback', () => {
		const out = expandSeo({
			title: 'Hello',
			openGraph: { title: 'Social title' },
		});
		expect(out.find((d) => d.key === 'meta:property=og:title')?.attrs.content).toBe('Social title');
	});

	it('leaves the title raw, since the template is applied after the merge', () => {
		// Templating at expand time would leak the suffix into the social mirror,
		// which reads the title before `applyConfig` templates it.
		const out = expandSeo({ title: 'Hello', titleTemplate: '%s · Site', description: 'Desc' });
		expect(out.find((d) => d.tag === 'title')?.text).toBe('Hello');
		expect(
			applyConfig(out, { titleTemplate: '%s · Site' }).find((d) => d.tag === 'title')?.text,
		).toBe('Hello · Site');
	});

	it('leaves image urls as authored, for applyConfig to absolute-ise', () => {
		// One place decides which origin applies, so a page's relative URL and the
		// app's `site` cannot disagree.
		const out = expandSeo({
			openGraph: { images: [{ url: '/og.png', alt: 'A', width: 1200, height: 630 }] },
		});
		expect(out.find((d) => d.key === 'meta:property=og:image[0]')?.attrs.content).toBe('/og.png');
		expect(out.find((d) => d.key === 'meta:property=og:image:alt[0]')?.attrs.content).toBe('A');
		const resolved = applyConfig(mergeDescriptors(out), { site: 'https://x.dev' });
		expect(resolved.find((d) => d.key === 'meta:property=og:image[0]')?.attrs.content).toBe(
			'https://x.dev/og.png',
		);
	});

	it('keeps multiple images rather than collapsing them', () => {
		const out = expandSeo({ openGraph: { images: ['/a.png', '/b.png'] } });
		const merged = mergeDescriptors(out);
		const images = merged.filter((d) => d.attrs.property === 'og:image');
		expect(images.map((d) => d.attrs.content)).toEqual(['/a.png', '/b.png']);
	});

	it('gives JSON-LD an identity per @type so different graphs coexist', () => {
		const article = expandSeo({ jsonLd: { '@type': 'Article', headline: 'A' } });
		const crumbs = expandSeo({ jsonLd: { '@type': 'BreadcrumbList' } });
		const merged = mergeDescriptors([...article, ...crumbs]);
		expect(merged.filter((d) => d.key.startsWith('jsonLd:'))).toHaveLength(2);

		const replaced = mergeDescriptors([
			...expandSeo({ jsonLd: { '@type': 'Article', headline: 'A' } }),
			...expandSeo({ jsonLd: { '@type': 'Article', headline: 'B' } }),
		]);
		expect(replaced.filter((d) => d.key.startsWith('jsonLd:'))).toHaveLength(1);
		expect(replaced[0].text).toContain('"headline":"B"');
	});
});

// A layout declares a language alternate or an icon and a page replaces it with
// a different URL. `href` is the VALUE being set, not part of the slot's
// identity, so folding it into the key would keep both and the platform would
// use the layout's.
describe('overriding a repeatable link', () => {
	it('replaces an hreflang alternate that differs only in href', () => {
		const merged = mergeDescriptors([
			{
				tag: 'link',
				key: linkKey({ rel: 'alternate', hreflang: 'de', href: '/de/layout' }),
				attrs: { rel: 'alternate', hreflang: 'de', href: '/de/layout' },
			},
			{
				tag: 'link',
				key: linkKey({ rel: 'alternate', hreflang: 'de', href: '/de/page' }),
				attrs: { rel: 'alternate', hreflang: 'de', href: '/de/page' },
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0].attrs.href).toBe('/de/page');
	});

	it('replaces an icon of the same size that differs only in href', () => {
		const merged = mergeDescriptors([
			{
				tag: 'link',
				key: linkKey({ rel: 'icon', sizes: '32x32', href: '/old.png' }),
				attrs: { rel: 'icon', sizes: '32x32', href: '/old.png' },
			},
			{
				tag: 'link',
				key: linkKey({ rel: 'icon', sizes: '32x32', href: '/new.png' }),
				attrs: { rel: 'icon', sizes: '32x32', href: '/new.png' },
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0].attrs.href).toBe('/new.png');
	});

	it('keeps resource hints with different targets, where the URL IS the identity', () => {
		// Two font preloads share rel and `as` and differ only in href. Collapsing
		// these would silently drop a preload.
		const a = linkKey({ rel: 'preload', as: 'font', href: '/a.woff2' });
		const b = linkKey({ rel: 'preload', as: 'font', href: '/b.woff2' });
		expect(a).not.toBe(b);
		const sheetA = linkKey({ rel: 'stylesheet', href: '/a.css' });
		const sheetB = linkKey({ rel: 'stylesheet', href: '/b.css' });
		expect(sheetA).not.toBe(sheetB);
	});

	it('keeps feed alternates distinct by type rather than href', () => {
		const rss = linkKey({ rel: 'alternate', type: 'application/rss+xml', href: '/rss' });
		const atom = linkKey({ rel: 'alternate', type: 'application/atom+xml', href: '/atom' });
		expect(rss).not.toBe(atom);
		const moved = linkKey({ rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' });
		expect(moved).toBe(rss);
	});
});

// `%s` substitution must treat the title as DATA. `String.replace` with a string
// replacement expands `$&`, `` $` ``, `$'` and `$1` against the match, so an
// author-controlled title could rewrite itself in the served document title.
describe('title templating treats the title as data', () => {
	const HOSTILE = "Deals: 50% off $& and $' and $` and $1";

	const titleOf = (title: string, template: string) =>
		applyConfig(mergeDescriptors(expandSeo({ title })), { titleTemplate: template }).find(
			(d) => d.tag === 'title',
		)?.text;

	it('preserves dollar patterns in the title', () => {
		expect(titleOf(HOSTILE, '%s · Shop')).toBe(HOSTILE + ' · Shop');
	});

	it('leaves dollar patterns in the template alone', () => {
		expect(titleOf('Widgets', '%s - $100 & up')).toBe('Widgets - $100 & up');
	});
});

// The fill mirrors page values into families the author opted into. Opting in
// means having declared at least one tag of that family; an app that never asked
// for Open Graph must not start emitting it.
describe('social fill-in opt-in boundary', () => {
	const page = () =>
		mergeDescriptors(expandSeo({ title: 'Page', description: 'Desc', canonical: '/p' }));

	it('adds nothing when no social family was declared', () => {
		const out = applyConfig(page(), {});
		expect(out.some((d) => d.key.startsWith('meta:property=og:'))).toBe(false);
		expect(out.some((d) => d.key.startsWith('meta:name=twitter:'))).toBe(false);
	});

	it('fills only the declared family', () => {
		const withOg = applyConfig(
			mergeDescriptors([...expandSeo({ openGraph: { type: 'website' } }), ...page()]),
			{},
		);
		expect(withOg.find((d) => d.key === 'meta:property=og:title')?.attrs.content).toBe('Page');
		expect(withOg.some((d) => d.key.startsWith('meta:name=twitter:'))).toBe(false);
	});

	it('never overrides a value the author named', () => {
		const out = applyConfig(
			mergeDescriptors([
				...expandSeo({ openGraph: { type: 'website', title: 'Explicit social' } }),
				...page(),
			]),
			{},
		);
		expect(out.find((d) => d.key === 'meta:property=og:title')?.attrs.content).toBe(
			'Explicit social',
		);
	});

	it('mirrors the raw title, not the templated one', () => {
		// og:site_name already carries the suffix a template adds.
		const out = applyConfig(
			mergeDescriptors([...expandSeo({ openGraph: { type: 'website' } }), ...page()]),
			{ titleTemplate: '%s · Site' },
		);
		expect(out.find((d) => d.tag === 'title')?.text).toBe('Page · Site');
		expect(out.find((d) => d.key === 'meta:property=og:title')?.attrs.content).toBe('Page');
	});

	it('absolute-ises an og:url it mirrored from the canonical', () => {
		const out = applyConfig(
			mergeDescriptors([...expandSeo({ openGraph: { type: 'website' } }), ...page()]),
			{ site: 'https://x.dev' },
		);
		expect(out.find((d) => d.key === 'meta:property=og:url')?.attrs.content).toBe(
			'https://x.dev/p',
		);
	});
});

// Keys are built by joining author-controlled attribute values with `|` and `=`.
// A value containing those delimiters must not be able to forge another tag's
// key, or one of the two is silently dropped from the document. Same class of
// bug as treating a title as a replacement pattern: data must stay data.
describe('identity keys cannot be forged through delimiters', () => {
	it('keeps a link whose attribute value contains the key delimiters', () => {
		const forged = linkKey({ rel: 'alternate', hreflang: 'de|type=x' });
		const real = linkKey({ rel: 'alternate', hreflang: 'de', type: 'x' });
		expect(forged).not.toBe(real);
	});

	it('keeps JSON-LD graphs whose @type and @id straddle the delimiter', () => {
		const forged = jsonLdDescriptor({ '@type': 'Article#x', '@id': 'y' });
		const real = jsonLdDescriptor({ '@type': 'Article', '@id': 'x#y' });
		expect(forged.key).not.toBe(real.key);
	});
});

// Opting into Open Graph is about having declared the family, not about which
// particular tags that produced. `openGraph: { publishedTime }` emits only
// `article:published_time`, which no `og:` sniff would recognise.
describe('social fill-in recognises every way of opting in', () => {
	it('still fills from hand-written og tags with no <Seo> involved', () => {
		const out = applyConfig(
			mergeDescriptors([
				{
					tag: 'meta',
					key: metaKey({ property: 'og:type' }),
					attrs: { property: 'og:type', content: 'website' },
				},
				...expandSeo({ title: 'Post' }),
			]),
			{},
		);
		expect(out.find((d) => d.key === 'meta:property=og:title')?.attrs.content).toBe('Post');
	});
});
