/**
 * Expand the ergonomic `<Seo …>` object into the flat descriptor list the merge
 * engine works on. Kept renderer-free and pure so precedence, URL resolution,
 * and title templating are unit-testable without a render.
 */
import { linkKey, metaKey, resolveUrl, type SeoDescriptor } from './descriptors.js';

export interface OpenGraphImage {
	url: string;
	alt?: string;
	width?: number | string;
	height?: number | string;
	type?: string;
}

export interface OpenGraphInput {
	title?: string;
	description?: string;
	type?: string;
	url?: string;
	siteName?: string;
	locale?: string;
	images?: string | OpenGraphImage | Array<string | OpenGraphImage>;
	publishedTime?: string;
	modifiedTime?: string;
}

export interface TwitterInput {
	card?: 'summary' | 'summary_large_image' | 'app' | 'player';
	site?: string;
	creator?: string;
	title?: string;
	description?: string;
	image?: string;
	imageAlt?: string;
}

export interface RobotsInput {
	index?: boolean;
	follow?: boolean;
	noarchive?: boolean;
	nosnippet?: boolean;
	maxSnippet?: number;
	maxImagePreview?: 'none' | 'standard' | 'large';
}

export interface SeoInput {
	title?: string;
	/** `%s` is replaced by `title`. Applies only when `title` is present. */
	titleTemplate?: string;
	description?: string;
	canonical?: string;
	/** Origin used to absolute-ise canonical, og:url, and image URLs. */
	site?: string;
	robots?: string | RobotsInput;
	openGraph?: OpenGraphInput;
	twitter?: TwitterInput;
	/** `hreflang` alternates: language tag to URL. */
	languages?: Record<string, string>;
	jsonLd?: unknown;
}

/**
 * Substitute `%s` treating the title as DATA. A string replacement would expand
 * `$&`, `` $` ``, `$'` and `$1` in an author-controlled title against the match,
 * rewriting the served document title; a function replacement is inserted
 * verbatim.
 */
function jsonLdKeyPart(value: string): string {
	return value.replace(/[\\#]/g, (character) => '\\' + character);
}

export function applyTitleTemplate(template: string, title: string): string {
	return template.replace('%s', () => title);
}

function meta(attrs: Record<string, string>): SeoDescriptor {
	return { tag: 'meta', key: metaKey(attrs), attrs };
}

function link(attrs: Record<string, string>): SeoDescriptor {
	return { tag: 'link', key: linkKey(attrs), attrs };
}

export function formatRobots(robots: string | RobotsInput): string {
	if (typeof robots === 'string') return robots;
	const parts: string[] = [];
	parts.push(robots.index === false ? 'noindex' : 'index');
	parts.push(robots.follow === false ? 'nofollow' : 'follow');
	if (robots.noarchive) parts.push('noarchive');
	if (robots.nosnippet) parts.push('nosnippet');
	if (robots.maxSnippet !== undefined) parts.push('max-snippet:' + robots.maxSnippet);
	if (robots.maxImagePreview !== undefined) {
		parts.push('max-image-preview:' + robots.maxImagePreview);
	}
	return parts.join(', ');
}

function normalizeImages(images: OpenGraphInput['images']): OpenGraphImage[] {
	if (images === undefined) return [];
	const list = Array.isArray(images) ? images : [images];
	return list.map((image) => (typeof image === 'string' ? { url: image } : image));
}

export function expandSeo(input: SeoInput): SeoDescriptor[] {
	const out: SeoDescriptor[] = [];
	const site = input.site;

	if (input.title !== undefined) {
		const text =
			input.titleTemplate !== undefined
				? applyTitleTemplate(input.titleTemplate, input.title)
				: input.title;
		out.push({
			tag: 'title',
			key: 'title',
			attrs: {},
			text,
			templated: input.titleTemplate !== undefined,
		});
	}
	if (input.description !== undefined) {
		out.push(meta({ name: 'description', content: input.description }));
	}
	if (input.robots !== undefined) {
		out.push(meta({ name: 'robots', content: formatRobots(input.robots) }));
	}
	if (input.canonical !== undefined) {
		out.push(link({ rel: 'canonical', href: resolveUrl(input.canonical, site) }));
	}

	const og = input.openGraph;
	if (og !== undefined) {
		// Open Graph falls back to the page title/description so the common case
		// needs no duplication, while an explicit og value still overrides.
		const ogTitle = og.title ?? input.title;
		const ogDescription = og.description ?? input.description;
		const ogUrl = og.url ?? input.canonical;
		if (og.type !== undefined) out.push(meta({ property: 'og:type', content: og.type }));
		if (og.siteName !== undefined) {
			out.push(meta({ property: 'og:site_name', content: og.siteName }));
		}
		if (ogTitle !== undefined) out.push(meta({ property: 'og:title', content: ogTitle }));
		if (ogDescription !== undefined) {
			out.push(meta({ property: 'og:description', content: ogDescription }));
		}
		if (ogUrl !== undefined) {
			out.push(meta({ property: 'og:url', content: resolveUrl(ogUrl, site) }));
		}
		if (og.locale !== undefined) out.push(meta({ property: 'og:locale', content: og.locale }));
		if (og.publishedTime !== undefined) {
			out.push(meta({ property: 'article:published_time', content: og.publishedTime }));
		}
		if (og.modifiedTime !== undefined) {
			out.push(meta({ property: 'article:modified_time', content: og.modifiedTime }));
		}
		// Scrapers do not reliably resolve relative image URLs, so these are always
		// absolute-ised when a site origin is known.
		const images = normalizeImages(og.images);
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const url = resolveUrl(image.url, site);
			// Repeated og:image tags are legitimate, so each gets its own identity.
			out.push({
				tag: 'meta',
				key: 'meta:property=og:image[' + i + ']',
				attrs: { property: 'og:image', content: url },
			});
			if (image.alt !== undefined) {
				out.push({
					tag: 'meta',
					key: 'meta:property=og:image:alt[' + i + ']',
					attrs: { property: 'og:image:alt', content: image.alt },
				});
			}
			if (image.width !== undefined) {
				out.push({
					tag: 'meta',
					key: 'meta:property=og:image:width[' + i + ']',
					attrs: { property: 'og:image:width', content: String(image.width) },
				});
			}
			if (image.height !== undefined) {
				out.push({
					tag: 'meta',
					key: 'meta:property=og:image:height[' + i + ']',
					attrs: { property: 'og:image:height', content: String(image.height) },
				});
			}
			if (image.type !== undefined) {
				out.push({
					tag: 'meta',
					key: 'meta:property=og:image:type[' + i + ']',
					attrs: { property: 'og:image:type', content: image.type },
				});
			}
		}
	}

	const twitter = input.twitter;
	if (twitter !== undefined) {
		if (twitter.card !== undefined) out.push(meta({ name: 'twitter:card', content: twitter.card }));
		if (twitter.site !== undefined) out.push(meta({ name: 'twitter:site', content: twitter.site }));
		if (twitter.creator !== undefined) {
			out.push(meta({ name: 'twitter:creator', content: twitter.creator }));
		}
		const twitterTitle = twitter.title ?? input.title;
		const twitterDescription = twitter.description ?? input.description;
		if (twitterTitle !== undefined) {
			out.push(meta({ name: 'twitter:title', content: twitterTitle }));
		}
		if (twitterDescription !== undefined) {
			out.push(meta({ name: 'twitter:description', content: twitterDescription }));
		}
		if (twitter.image !== undefined) {
			out.push(meta({ name: 'twitter:image', content: resolveUrl(twitter.image, site) }));
		}
		if (twitter.imageAlt !== undefined) {
			out.push(meta({ name: 'twitter:image:alt', content: twitter.imageAlt }));
		}
	}

	if (input.languages !== undefined) {
		for (const [hreflang, href] of Object.entries(input.languages)) {
			out.push(link({ rel: 'alternate', hreflang, href: resolveUrl(href, site) }));
		}
	}

	if (input.jsonLd !== undefined) {
		out.push(jsonLdDescriptor(input.jsonLd));
	}

	return out;
}

/**
 * JSON-LD identity is its `@type` (plus `@id` when present), so a page-level
 * Article replaces a layout-level Article but coexists with a BreadcrumbList.
 */
export function jsonLdDescriptor(data: unknown, explicitKey?: string): SeoDescriptor {
	let key = explicitKey;
	if (key === undefined) {
		const record = (data ?? {}) as Record<string, unknown>;
		const type = typeof record['@type'] === 'string' ? (record['@type'] as string) : 'graph';
		const id = typeof record['@id'] === 'string' ? (record['@id'] as string) : '';
		// Escaped so a `@type` containing `#` cannot forge a different graph's key.
		key = jsonLdKeyPart(type) + '#' + jsonLdKeyPart(id);
	}
	return {
		tag: 'script',
		key: 'jsonLd:' + key,
		attrs: { type: 'application/ld+json' },
		text: JSON.stringify(data),
	};
}
