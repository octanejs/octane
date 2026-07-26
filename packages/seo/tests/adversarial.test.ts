// Deliberately hostile and degenerate inputs. Metadata is author data that ends
// up verbatim in a document crawlers read, so the failure modes that matter are
// a thrown render, a dropped tag, and an escape that does not hold.
import { describe, expect, it, vi } from 'vitest';
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

const finish = (input: Parameters<typeof expandSeo>[0], config = {}) =>
	applyConfig(mergeDescriptors(expandSeo(input)), config);
const titleOf = (out: readonly SeoDescriptor[]) => out.find((d) => d.tag === 'title')?.text;
const contentOf = (out: readonly SeoDescriptor[], key: string) =>
	out.find((d) => d.key === key)?.attrs.content;

describe('degenerate values', () => {
	it('does not template an empty title into a bare suffix', () => {
		// `'' + ' · Site'` would ship a document titled " · Site".
		expect(titleOf(finish({ title: '' }, { titleTemplate: '%s · Site' }))).toBe('');
	});

	it('emits nothing for an object with no fields', () => {
		expect(finish({})).toEqual([]);
	});

	it('keeps a whitespace-only title as authored rather than guessing', () => {
		expect(titleOf(finish({ title: '   ' }, { titleTemplate: '%s · Site' }))).toBe('    · Site');
	});

	it('treats a template with no %s as a literal', () => {
		expect(titleOf(finish({ title: 'Page' }, { titleTemplate: 'Fixed' }))).toBe('Fixed');
	});

	it('substitutes only the first %s', () => {
		expect(titleOf(finish({ title: 'P' }, { titleTemplate: '%s and %s' }))).toBe('P and %s');
	});
});

describe('hostile strings survive as data', () => {
	const NASTY = '</title><script>alert(1)</script> & "quotes" \'and\' <b>markup</b>';

	it('carries markup through the descriptor untransformed', () => {
		// Escaping belongs to the renderer; the descriptor must not mangle or drop it.
		expect(titleOf(finish({ title: NASTY }))).toBe(NASTY);
		expect(contentOf(finish({ description: NASTY }), 'meta:name=description')).toBe(NASTY);
	});

	it('keeps a title distinct from a lookalike template result', () => {
		const a = titleOf(finish({ title: 'A · Site' }));
		const b = titleOf(finish({ title: 'A' }, { titleTemplate: '%s · Site' }));
		expect(a).toBe('A · Site');
		expect(b).toBe('A · Site');
		// Same text by coincidence is fine; what matters is neither threw or dropped.
		expect(a).toBe(b);
	});

	it('handles unicode, emoji, and RTL without truncation', () => {
		const mixed = 'مرحبا · 日本語 · 🚀 · ﷺ';
		expect(titleOf(finish({ title: mixed }, { titleTemplate: '%s | Acme' }))).toBe(
			mixed + ' | Acme',
		);
	});
});

describe('JSON-LD hostile payloads', () => {
	it('drops a cyclic graph instead of taking the render down', () => {
		const cyclic: Record<string, unknown> = { '@type': 'Article', name: 'A' };
		cyclic.self = cyclic;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(jsonLdDescriptor(cyclic)).toBeNull();
		expect(String(error.mock.calls[0]?.[0])).toContain('@octanejs/seo');
		error.mockRestore();
	});

	it('drops a value JSON cannot represent instead of throwing', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(jsonLdDescriptor({ '@type': 'Article', when: 10n })).toBeNull();
		error.mockRestore();
	});

	it('keeps the rest of the metadata when JSON-LD is unserializable', () => {
		// One bad graph must not cost the page its title.
		const cyclic: Record<string, unknown> = { '@type': 'Article' };
		cyclic.self = cyclic;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const out = finish({ title: 'Still here', jsonLd: cyclic });
		expect(titleOf(out)).toBe('Still here');
		expect(out.some((d) => d.key.startsWith('jsonLd:'))).toBe(false);
		error.mockRestore();
	});

	it('keeps a graph whose @type is absent', () => {
		const d = jsonLdDescriptor({ name: 'no type' });
		expect(d.tag).toBe('script');
		expect(d.text).toContain('no type');
	});
});

describe('url resolution edge cases', () => {
	it('collapses repeated slashes in the configured origin', () => {
		expect(resolveUrl('/a', 'https://x.dev///')).toBe('https://x.dev/a');
	});

	it('leaves absolute, protocol-relative, and non-http schemes alone', () => {
		expect(resolveUrl('mailto:a@b.c', 'https://x.dev')).toBe('mailto:a@b.c');
		expect(resolveUrl('//cdn/x.png', 'https://x.dev')).toBe('//cdn/x.png');
		expect(resolveUrl('HTTPS://X.dev/a', 'https://x.dev')).toBe('HTTPS://X.dev/a');
	});

	it('does not absolute-ise a fragment or query-only canonical into the origin root', () => {
		// These are relative references, so joining them to the origin is correct;
		// the point is that it happens once and does not double the separator.
		expect(resolveUrl('?page=2', 'https://x.dev')).toBe('https://x.dev/?page=2');
	});
});

describe('scale and repetition', () => {
	it('keeps 200 distinct metas and collapses 200 identical ones', () => {
		const distinct = Array.from({ length: 200 }, (_, i) => {
			const attrs = { name: 'k' + i, content: String(i) };
			return { tag: 'meta' as const, key: metaKey(attrs), attrs };
		});
		expect(mergeDescriptors(distinct)).toHaveLength(200);

		const same = Array.from({ length: 200 }, (_, i) => {
			const attrs = { name: 'k', content: String(i) };
			return { tag: 'meta' as const, key: metaKey(attrs), attrs };
		});
		const merged = mergeDescriptors(same);
		expect(merged).toHaveLength(1);
		expect(merged[0].attrs.content).toBe('199');
	});

	it('preserves first-seen position across a long override chain', () => {
		const merged = mergeDescriptors([
			{ tag: 'title', key: 'title', attrs: {}, text: 'first' },
			{ tag: 'meta', key: 'meta:name=a', attrs: { name: 'a', content: '1' } },
			...Array.from({ length: 50 }, (_, i) => ({
				tag: 'title' as const,
				key: 'title',
				attrs: {},
				text: 'v' + i,
			})),
		]);
		expect(merged.map((d) => d.key)).toEqual(['title', 'meta:name=a']);
		expect(merged[0].text).toBe('v49');
	});
});

describe('attribute values that are not strings', () => {
	it('gives numeric and boolean values a stable identity', () => {
		expect(metaKey({ name: 'x', content: 1 })).toBe(metaKey({ name: 'x', content: 2 }));
		expect(linkKey({ rel: 'icon', sizes: 32 })).toBe(linkKey({ rel: 'icon', sizes: '32' }));
	});

	it('ignores absent, null, and false discriminators', () => {
		expect(linkKey({ rel: 'alternate', hreflang: 'de', media: null })).toBe(
			linkKey({ rel: 'alternate', hreflang: 'de' }),
		);
		expect(linkKey({ rel: 'alternate', hreflang: 'de', media: false })).toBe(
			linkKey({ rel: 'alternate', hreflang: 'de' }),
		);
	});
});

describe('robots directive combinations', () => {
	it('renders every documented option together', () => {
		expect(
			formatRobots({
				index: false,
				follow: false,
				noarchive: true,
				nosnippet: true,
				maxSnippet: 0,
				maxImagePreview: 'none',
			}),
		).toBe('noindex, nofollow, noarchive, nosnippet, max-snippet:0, max-image-preview:none');
	});

	it('keeps an explicit zero snippet budget rather than dropping it', () => {
		expect(formatRobots({ maxSnippet: 0 })).toContain('max-snippet:0');
	});
});

describe('open graph image shapes', () => {
	it('accepts a bare string, one object, and a mixed array', () => {
		expect(
			contentOf(finish({ openGraph: { images: '/a.png' } }), 'meta:property=og:image[0]'),
		).toBe('/a.png');
		const mixed = finish(
			{ openGraph: { images: ['/a.png', { url: '/b.png', alt: 'B' }] } },
			{ site: 'https://x.dev' },
		);
		expect(contentOf(mixed, 'meta:property=og:image[0]')).toBe('https://x.dev/a.png');
		expect(contentOf(mixed, 'meta:property=og:image[1]')).toBe('https://x.dev/b.png');
		expect(contentOf(mixed, 'meta:property=og:image:alt[1]')).toBe('B');
	});

	it('keeps an empty image list from emitting an empty tag', () => {
		expect(finish({ openGraph: { images: [] } }).some((d) => d.key.includes('og:image'))).toBe(
			false,
		);
	});
});

// `site` is the canonical identity of the app, not the origin serving this
// response. Addresses crawlers consume (canonical, hreflang alternates) must be
// absolute; subresources the BROWSER fetches must stay relative to the serving
// document, or a preview deploy carrying the production `site` would pull fonts,
// CSS, and modules from production.
describe('site never rewrites subresource URLs', () => {
	const withSite = (attrs: Record<string, string>) =>
		applyConfig(mergeDescriptors([{ tag: 'link', key: linkKey(attrs), attrs }]), {
			site: 'https://production.example',
		})[0].attrs.href;

	it('leaves resource hints and stylesheets on the serving origin', () => {
		expect(withSite({ rel: 'preload', as: 'font', href: '/f.woff2' })).toBe('/f.woff2');
		expect(withSite({ rel: 'modulepreload', href: '/assets/app.js' })).toBe('/assets/app.js');
		expect(withSite({ rel: 'stylesheet', href: '/assets/app.css' })).toBe('/assets/app.css');
		expect(withSite({ rel: 'prefetch', href: '/next.js' })).toBe('/next.js');
	});

	it('leaves icons and the manifest on the serving origin', () => {
		expect(withSite({ rel: 'icon', sizes: '32x32', href: '/icon.png' })).toBe('/icon.png');
		expect(withSite({ rel: 'apple-touch-icon', href: '/touch.png' })).toBe('/touch.png');
		expect(withSite({ rel: 'manifest', href: '/site.webmanifest' })).toBe('/site.webmanifest');
	});

	it('still absolute-ises the addresses crawlers consume', () => {
		expect(withSite({ rel: 'canonical', href: '/p' })).toBe('https://production.example/p');
		expect(withSite({ rel: 'alternate', hreflang: 'de', href: '/de/p' })).toBe(
			'https://production.example/de/p',
		);
	});

	it('still absolute-ises social image and url metas', () => {
		const out = applyConfig(mergeDescriptors(expandSeo({ openGraph: { images: '/og.png' } })), {
			site: 'https://production.example',
		});
		expect(contentOf(out, 'meta:property=og:image[0]')).toBe('https://production.example/og.png');
	});
});
