/**
 * Expand the ergonomic `<Seo …>` object into the flat descriptor list the merge
 * engine works on. Kept renderer-free and pure so precedence, URL resolution,
 * and title templating are unit-testable without a render.
 */
import { linkKey, metaKey, type SeoDescriptor } from './descriptors.js';

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
	/**
	 * `%s` is replaced by the page title. App-level: declaring it once applies it
	 * to whichever page renders, and it is applied after the merge, so social tags
	 * still mirror the untemplated title.
	 */
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
 * Escape a key component so a `@type` containing `#` cannot forge the key of a
 * different graph and silently replace it.
 */
function jsonLdKeyPart(value: string): string {
	return value.replace(/[\\#]/g, (character) => '\\' + character);
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

	// The RAW title. `titleTemplate` is app-level config applied after the merge,
	// so the social mirror always sees the untemplated value regardless of which
	// `<Seo>` declared the template.
	if (input.title !== undefined) {
		out.push({ tag: 'title', key: 'title', attrs: {}, text: input.title });
	}
	if (input.description !== undefined) {
		out.push(meta({ name: 'description', content: input.description }));
	}
	if (input.robots !== undefined) {
		out.push(meta({ name: 'robots', content: formatRobots(input.robots) }));
	}
	if (input.canonical !== undefined) {
		out.push(link({ rel: 'canonical', href: input.canonical }));
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
			out.push(meta({ property: 'og:url', content: ogUrl }));
		}
		if (og.locale !== undefined) out.push(meta({ property: 'og:locale', content: og.locale }));
		if (og.publishedTime !== undefined) {
			out.push(meta({ property: 'article:published_time', content: og.publishedTime }));
		}
		if (og.modifiedTime !== undefined) {
			out.push(meta({ property: 'article:modified_time', content: og.modifiedTime }));
		}
		// URLs stay as authored here. `applyConfig` absolute-ises them after the
		// merge, so one place decides which origin applies.
		const images = normalizeImages(og.images);
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const url = image.url;
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
			out.push(meta({ name: 'twitter:image', content: twitter.image }));
		}
		if (twitter.imageAlt !== undefined) {
			out.push(meta({ name: 'twitter:image:alt', content: twitter.imageAlt }));
		}
	}

	if (input.languages !== undefined) {
		for (const [hreflang, href] of Object.entries(input.languages)) {
			out.push(link({ rel: 'alternate', hreflang, href }));
		}
	}

	if (input.jsonLd !== undefined) {
		const descriptor = jsonLdDescriptor(input.jsonLd);
		if (descriptor !== null) out.push(descriptor);
	}

	return out;
}

/**
 * JSON-LD identity is its `@type` (plus `@id` when present), so a page-level
 * Article replaces a layout-level Article but coexists with a BreadcrumbList.
 */
export function jsonLdDescriptor(data: unknown, explicitKey?: string): SeoDescriptor | null {
	// Serialization is the one place author data can take the whole render down:
	// a cyclic graph or a BigInt makes JSON.stringify throw, and that would 500 a
	// page over one structured-data object. Degrade instead, loudly. A graph that
	// cannot serialize cannot be valid structured data either, so emitting nothing
	// is better than emitting something broken.
	let text: string;
	try {
		text = JSON.stringify(data);
	} catch (error) {
		console.error(
			'[@octanejs/seo] Could not serialize JSON-LD, so no structured data was ' +
				'emitted for it. Values such as cycles and BigInt cannot be represented: ' +
				(error instanceof Error ? error.message : String(error)),
		);
		return null;
	}
	if (text === undefined) return null;
	let key = explicitKey;
	if (key === undefined) {
		const record = (data ?? {}) as Record<string, unknown>;
		const type = typeof record['@type'] === 'string' ? (record['@type'] as string) : 'graph';
		const id = typeof record['@id'] === 'string' ? (record['@id'] as string) : '';
		key = jsonLdKeyPart(type) + '#' + jsonLdKeyPart(id);
	}
	return {
		tag: 'script',
		key: 'jsonLd:' + key,
		attrs: { type: 'application/ld+json' },
		text,
	};
}
