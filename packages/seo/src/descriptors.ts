/**
 * Metadata descriptors and the merge that decides precedence.
 *
 * Renderer-free on purpose: server and client both merge with this exact code,
 * so the two emit the identical set and hydration adopts instead of duplicating.
 *
 * WHY A MERGE EXISTS AT ALL. The platform resolves duplicates by taking the
 * FIRST occurrence in tree order, `document.title` is defined as the first
 * `<title>` element in the document, and a crawler reads the first
 * `<meta name="description">`. Authoring order runs the other way: defaults come
 * from the outer layout and the specific value from the inner page, so appending
 * both would let the generic one win every time. Registrations are therefore
 * keyed by identity and the LAST one wins, which is the precedence every SEO
 * system uses and the one authors expect.
 */

export type MetaAttributes = Record<string, string | number | boolean | null | undefined>;

/** One head element to render, plus the identity that decides what it replaces. */
export interface SeoDescriptor {
	tag: 'title' | 'meta' | 'link' | 'script';
	/** Identity key: a later descriptor with the same key replaces this one. */
	key: string;
	attrs: MetaAttributes;
	/** Text content, for `<title>` and for script bodies. */
	text?: string;
}

/**
 * Settings that belong to the app rather than to one declaration. They are
 * registered like any other metadata and merged last-wins, so setting them once
 * near the root applies them to every page's title and URLs.
 */
export interface SeoConfig {
	/** Origin used to absolute-ise canonical, og:url, and image URLs. */
	site?: string;
	/** `%s` is replaced by the page title, e.g. `'%s · Acme'`. */
	titleTemplate?: string;
	/**
	 * Whether an `openGraph`/`twitter` block was declared. Opting in is about
	 * having asked for the family, not about which tags that produced:
	 * `openGraph: { publishedTime }` emits only `article:published_time`, which no
	 * `og:` prefix scan would recognise.
	 */
	declaredOpenGraph?: boolean;
	declaredTwitter?: boolean;
}

/**
 * `<link>` rels whose `href` is an ADDRESS rather than a subresource, so it
 * belongs to the canonical site and must be absolute.
 *
 * Everything else a `<link>` can point at, resource hints, stylesheets, icons,
 * the manifest, is fetched by the browser and has to resolve against the
 * document actually serving the response. Rewriting those to `site` would make a
 * preview or staging deploy pull fonts, CSS, and modules from production.
 */
const SITE_ABSOLUTE_LINK_RELS = new Set(['canonical', 'alternate']);

/**
 * The attribute holding a URL that a consumer will not resolve relative to the
 * page, so it is absolute-ised against the configured origin at emit time, once
 * the whole tree's config is known. Scrapers fetch `og:image` and read `og:url`
 * without a base, and crawlers expect absolute canonical and hreflang addresses.
 */
function urlAttribute(descriptor: SeoDescriptor): string | null {
	if (descriptor.tag === 'link') {
		const rel = descriptor.attrs.rel;
		return typeof rel === 'string' && SITE_ABSOLUTE_LINK_RELS.has(rel) ? 'href' : null;
	}
	if (descriptor.tag !== 'meta') return null;
	const property = descriptor.attrs.property;
	if (property === 'og:url' || property === 'og:image') return 'content';
	if (descriptor.attrs.name === 'twitter:image') return 'content';
	return null;
}

/**
 * Social tags that mirror a page value when the author has opted into that
 * family but has not named them. `og:type` without `og:title` produces a useless
 * card, and the page that owns the title is usually not the component that
 * declared the Open Graph shell.
 */
const SOCIAL_FILL: readonly {
	readonly key: string;
	readonly family: 'og' | 'twitter';
	readonly attrs: (value: string) => MetaAttributes;
	readonly source: 'title' | 'description' | 'canonical';
}[] = [
	{
		key: 'meta:property=og:title',
		family: 'og',
		attrs: (content) => ({ property: 'og:title', content }),
		source: 'title',
	},
	{
		key: 'meta:property=og:description',
		family: 'og',
		attrs: (content) => ({ property: 'og:description', content }),
		source: 'description',
	},
	{
		key: 'meta:property=og:url',
		family: 'og',
		attrs: (content) => ({ property: 'og:url', content }),
		source: 'canonical',
	},
	{
		key: 'meta:name=twitter:title',
		family: 'twitter',
		attrs: (content) => ({ name: 'twitter:title', content }),
		source: 'title',
	},
	{
		key: 'meta:name=twitter:description',
		family: 'twitter',
		attrs: (content) => ({ name: 'twitter:description', content }),
		source: 'description',
	},
];

/**
 * Finish the merged set: mirror page values into the social families the author
 * opted into, apply the title template, and absolute-ise URLs.
 *
 * All three are deferred to emit time for the same reason: a page registers its
 * title, description, and canonical without ever seeing the root's `site`,
 * `titleTemplate`, or Open Graph shell, and the root registers its shell without
 * seeing which page will render.
 *
 * Order matters, and this is the ONLY place the template is applied. The social
 * fill reads the title before that happens, because `og:site_name` already
 * carries the suffix a template adds; templating anywhere earlier would leak the
 * suffix into `og:title`. URL resolution runs last so an `og:url` mirrored from
 * the canonical is absolute-ised too.
 */
export function applyConfig(
	descriptors: readonly SeoDescriptor[],
	config: SeoConfig,
): SeoDescriptor[] {
	const { site, titleTemplate } = config;
	const present = new Set(descriptors.map((descriptor) => descriptor.key));
	const sources = {
		title: descriptors.find((d) => d.tag === 'title')?.text,
		description: stringAttr(descriptors, 'meta:name=description', 'content'),
		canonical: stringAttr(descriptors, 'link:canonical', 'href'),
	};
	// Opted in either by declaring the block through `<Seo>` or by hand-writing a
	// tag of that family. Nobody who never asked for Open Graph starts emitting it.
	const optedIn = {
		og: config.declaredOpenGraph === true,
		twitter: config.declaredTwitter === true,
	};
	for (const descriptor of descriptors) {
		if (descriptor.key.startsWith('meta:property=og:')) optedIn.og = true;
		else if (descriptor.key.startsWith('meta:name=twitter:')) optedIn.twitter = true;
	}

	const filled: SeoDescriptor[] = [...descriptors];
	for (const entry of SOCIAL_FILL) {
		if (!optedIn[entry.family] || present.has(entry.key)) continue;
		const value = sources[entry.source];
		if (value === undefined || value === '') continue;
		filled.push({ tag: 'meta', key: entry.key, attrs: entry.attrs(value) });
	}

	if (site === undefined && titleTemplate === undefined) return filled;
	return filled.map((descriptor) => {
		if (
			titleTemplate !== undefined &&
			descriptor.tag === 'title' &&
			descriptor.text !== undefined &&
			descriptor.text !== ''
		) {
			// Function replacement: the title is data, so its dollar patterns must not
			// expand against the `%s` match.
			return {
				...descriptor,
				text: titleTemplate.replace('%s', () => descriptor.text as string),
			};
		}
		const attr = site === undefined ? null : urlAttribute(descriptor);
		if (attr !== null) {
			const value = descriptor.attrs[attr];
			if (typeof value === 'string') {
				const resolved = resolveUrl(value, site);
				if (resolved !== value) {
					return { ...descriptor, attrs: { ...descriptor.attrs, [attr]: resolved } };
				}
			}
		}
		return descriptor;
	});
}

function stringAttr(
	descriptors: readonly SeoDescriptor[],
	key: string,
	attr: string,
): string | undefined {
	const value = descriptors.find((descriptor) => descriptor.key === key)?.attrs[attr];
	return typeof value === 'string' ? value : undefined;
}

/**
 * How a `<link>`'s identity is derived. It has to differ by `rel`, because
 * `href` is sometimes the value being set and sometimes the thing being
 * identified, and getting that backwards breaks overrides in one direction or
 * drops tags in the other.
 *
 * - **Singleton**: one per document, so `rel` alone is the identity.
 * - **Slot-keyed**: the listed attributes name a slot and `href` is its value.
 *   A page replacing a layout's German alternate, or the same-sized icon, must
 *   win, so `href` is deliberately NOT part of the key.
 * - **URL-keyed** (everything else): the target IS the identity, so two font
 *   preloads or two stylesheets coexist. Unknown rels default here on purpose,
 *   since dropping someone's tag is worse than emitting two.
 */
const SINGLETON_LINK_RELS = new Set(['canonical', 'manifest', 'author', 'license', 'prev', 'next']);

const SLOT_KEYED_LINK_RELS = new Map<string, readonly string[]>([
	['alternate', ['hreflang', 'type', 'media', 'title']],
	['icon', ['sizes', 'type', 'media']],
	['shortcut icon', ['sizes', 'type']],
	['apple-touch-icon', ['sizes', 'type']],
	['apple-touch-icon-precomposed', ['sizes', 'type']],
	['mask-icon', ['color']],
	['search', ['type', 'title']],
]);

const URL_KEYED_LINK_ATTRS = ['href', 'as', 'media', 'type', 'hreflang', 'sizes'] as const;

/**
 * Escape a value before it becomes part of an identity key. Keys join
 * author-controlled values with `|` and `=`, so an unescaped value containing
 * those could forge another tag's key and one of the two would be silently
 * dropped from the document. Data stays data.
 */
function keyPart(value: string): string {
	return value.replace(/[\\|=#]/g, (character) => '\\' + character);
}

function attrString(attrs: MetaAttributes, name: string): string | null {
	const value = attrs[name];
	if (value === null || value === undefined || value === false) return null;
	return String(value);
}

/**
 * Identity for a `<meta>`: whichever naming attribute it uses. Open Graph uses
 * `property`, most others use `name`, and `http-equiv` is its own namespace, so
 * `og:title` and a `name="og:title"` never collide by accident.
 */
export function metaKey(attrs: MetaAttributes): string {
	if (attrs.charSet !== undefined || attrs.charset !== undefined) return 'meta:charset';
	for (const naming of ['name', 'property', 'http-equiv', 'httpEquiv', 'itemprop']) {
		const value = attrString(attrs, naming);
		if (value !== null) {
			const channel = naming === 'httpEquiv' ? 'http-equiv' : naming;
			return 'meta:' + channel + '=' + keyPart(value);
		}
	}
	// No naming attribute: keep every such tag by giving it a content-derived
	// identity rather than silently collapsing unrelated tags together.
	return 'meta:raw=' + JSON.stringify(attrs);
}

export function linkKey(attrs: MetaAttributes): string {
	const rel = attrString(attrs, 'rel') ?? '';
	if (SINGLETON_LINK_RELS.has(rel)) return 'link:' + rel;
	const slotAttrs = SLOT_KEYED_LINK_RELS.get(rel);
	let key = 'link:' + rel;
	if (slotAttrs !== undefined) {
		let named = false;
		for (const name of slotAttrs) {
			const value = attrString(attrs, name);
			if (value !== null) {
				key += '|' + name + '=' + keyPart(value);
				named = true;
			}
		}
		// A slot-keyed rel carrying none of its discriminators names no slot, so
		// fall through to the URL rather than collapsing unrelated tags together.
		if (named) return key;
	}
	for (const name of URL_KEYED_LINK_ATTRS) {
		const value = attrString(attrs, name);
		if (value !== null) key += '|' + name + '=' + keyPart(value);
	}
	return key;
}

/**
 * Merge registrations into the set to render, last-wins per identity.
 *
 * Insertion order is preserved for keys that survive: replacing a descriptor
 * updates it in place rather than moving it to the end, so server and client
 * produce the same order and hydration adoption stays positional. That also
 * makes the merge idempotent across SSR suspense passes, where the same
 * component re-registers the same key on every pass.
 */
export function mergeDescriptors(registrations: readonly SeoDescriptor[]): SeoDescriptor[] {
	const byKey = new Map<string, number>();
	const out: SeoDescriptor[] = [];
	for (const descriptor of registrations) {
		const at = byKey.get(descriptor.key);
		if (at === undefined) {
			byKey.set(descriptor.key, out.length);
			out.push(descriptor);
		} else {
			out[at] = descriptor;
		}
	}
	return out;
}

/** Absolute-ise a canonical/og:url style value against the configured site origin. */
export function resolveUrl(value: string, site: string | undefined): string {
	if (site === undefined || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
		return value;
	}
	return site.replace(/\/+$/, '') + (value.startsWith('/') ? value : '/' + value);
}
