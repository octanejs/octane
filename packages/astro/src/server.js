import { createElement, memo } from 'octane/server';
import { renderToString } from 'octane/server';
import opts from 'astro:octane:opts';
import { createFilter } from './create-filter.js';
import { nextIdentifierPrefix } from './context.js';
import { slotName } from './slot-name.js';
import { createStaticHtml } from './static-html.js';

const filter = opts?.include || opts?.exclude ? createFilter(opts.include, opts.exclude) : null;
const StaticHtml = createStaticHtml(createElement, memo);

/**
 * @param {any} Component
 * @param {Record<string, any>} props
 * @param {any} children
 * @param {import('astro').AstroComponentMetadata | undefined} metadata
 * @returns {Promise<boolean>}
 */
async function check(Component, props, children, metadata) {
	if (typeof Component !== 'function') return false;
	if (Component.name === 'QwikComponent') return false;

	if (filter && metadata?.componentUrl && !filter(metadata.componentUrl)) {
		return false;
	}

	try {
		const result = await renderToStaticMarkup.call(
			this,
			Component,
			props,
			children ?? {},
			undefined,
		);
		return typeof result?.html === 'string';
	} catch {
		return false;
	}
}

/**
 * @param {import('astro').AstroComponentMetadata | undefined} metadata
 */
function needsHydration(metadata) {
	return metadata?.astroStaticSlot ? !!metadata.hydrate : true;
}

/**
 * Astro renderer entry — name matches React/Preact (`renderToStaticMarkup`) but
 * the Octane call underneath is hydratable `renderToString` so islands keep
 * hydration markers. Octane's own `renderToStaticMarkup` is non-hydratable.
 *
 * @param {any} Component
 * @param {Record<string, any>} props
 * @param {Record<string, any>} slotted
 * @param {import('astro').AstroComponentMetadata | undefined} metadata
 * @returns {Promise<{ html: string; attrs: Record<string, string> }>}
 */
async function renderToStaticMarkup(Component, props, { default: children, ...slotted }, metadata) {
	let prefix = '';
	if (this?.result) {
		prefix = nextIdentifierPrefix(this.result);
	}

	/** @type {Record<string, string>} */
	const attrs = { prefix };

	const slots = {};
	for (const [key, value] of Object.entries(slotted)) {
		const name = slotName(key);
		slots[name] = createElement(StaticHtml, {
			hydrate: needsHydration(metadata),
			value,
			name,
		});
	}

	const newProps = {
		...props,
		...slots,
	};

	const newChildren = children ?? props.children;
	if (newChildren != null) {
		newProps.children = createElement(StaticHtml, {
			hydrate: needsHydration(metadata),
			value: newChildren,
		});
	}

	// Islands always buffer. `experimentalDisableStreaming` is reserved for a
	// future streaming path; v1 always uses hydratable `renderToString`.
	void opts?.experimentalDisableStreaming;

	// `headChannel: 'separate'` withholds hoisted `<title>`/`<meta>`/`<link>`
	// from the island HTML. Default fold would prepend them into the body,
	// and `hydrateRoot` only skips leading `data-octane` style tags — so that
	// head markup would become the adoption cursor and break hydration.
	// Astro owns document `<head>`; discard the separate channel (same as
	// app-core / docusaurus hosts that splice it themselves).
	const { html, css } = renderToString(Component, newProps, {
		identifierPrefix: prefix,
		headChannel: 'separate',
	});

	const cssBlock = typeof css === 'string' && css.length > 0 ? css : '';
	return { html: cssBlock + html, attrs };
}

/** @type {import('astro').NamedSSRLoadedRendererValue} */
const renderer = {
	name: 'octane',
	check,
	renderToStaticMarkup,
	supportsAstroStaticSlot: true,
};

export default renderer;
