/**
 * `@octanejs/seo`, declarative document metadata for Octane.
 *
 * `<Head>` is the only component to learn. Wrap the app in one, then use it
 * again wherever metadata belongs, filled with `<Title>`, `<Meta>`, `<Link>`,
 * `<Script>`, `<JsonLd>`, or the all-in-one `<Seo>`. Blocks merge wherever they
 * sit, siblings included, last-wins per identity, so a page overrides a layout
 * simply by rendering later. Metadata is server-rendered into `<head>` and
 * adopted on hydration rather than duplicated.
 *
 * Why the merge matters: the platform takes the FIRST duplicate in tree order
 * (`document.title` is the first `<title>` in the document, and a crawler reads
 * the first `meta[name=description]`), while authoring order puts layout
 * defaults before page specifics. Appending both would let the generic value
 * win every time, so identity-keyed last-wins is applied before anything is
 * emitted.
 */
export { Head, Title, Meta, Link, Script, JsonLd, Seo } from './components.tsrx';
export { applyConfig, mergeDescriptors, metaKey, linkKey, resolveUrl } from './descriptors.js';
export type { SeoConfig, SeoDescriptor, MetaAttributes } from './descriptors.js';
export { expandSeo, formatRobots, jsonLdDescriptor } from './expand.js';
export type {
	SeoInput,
	OpenGraphInput,
	OpenGraphImage,
	TwitterInput,
	RobotsInput,
} from './expand.js';
export { createSeoRegistry } from './registry.js';
export type { SeoRegistry } from './registry.js';
export { SeoContext } from './context.js';
