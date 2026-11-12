// @ts-check
/**
 * Route seeds: text a server render hands to the browser, such as a data
 * store's loaded values, so the page hydrates from them instead of loading
 * them again.
 *
 * A seed is produced once the render has finished streaming, because the
 * values it carries load while the page renders. Each one is written as a
 * JSON script just before `</body>`, after the page's content, so a client
 * reads it once the document has been parsed. This module has no server
 * imports: the browser reads seeds through it too.
 */

const SEED_ID = '__octane_seed:';
const SEED_NAME = /^[\w.-]+$/;

/**
 * @typedef {{
 *   seeds: Map<string, () => unknown>,
 *   releases: Array<() => void>,
 *   ended: boolean,
 * }} RouteSeeds
 */

/** @type {WeakMap<object, RouteSeeds>} */
const routes = new WeakMap();

/** @param {object} context */
function routeOf(context) {
	let route = routes.get(context);
	if (!route) routes.set(context, (route = { seeds: new Map(), releases: [], ended: false }));
	return route;
}

/**
 * Hand the browser `produce()`'s text under `name`, read there with
 * `readRouteSeed(name)`. `produce` runs once the page has finished rendering,
 * and not at all when the render fails.
 *
 * @param {import('@octanejs/app-core').Context} context
 * @param {string} name
 * @param {() => string | Promise<string>} produce
 * @returns {void}
 */
export function routeSeed(context, name, produce) {
	if (!SEED_NAME.test(name)) {
		throw new TypeError(
			`[octane] A route seed's name may only use letters, digits, "_", "." and "-": ${JSON.stringify(name)}`,
		);
	}
	routeOf(context).seeds.set(name, produce);
}

/**
 * The text the server render seeded under `name`, or `null` when there is
 * none, such as on a page rendered only in the browser. Read it once the
 * document has been parsed.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function readRouteSeed(name) {
	const script = typeof document === 'undefined' ? null : document.getElementById(SEED_ID + name);
	return script === null ? null : JSON.parse(script.textContent ?? 'null');
}

/**
 * @internal Run `release` once the route's response has ended, however it
 * ends: completed, cancelled, or failed before it began.
 * @param {object} context
 * @param {() => void} release
 */
export function onRouteEnd(context, release) {
	const route = routeOf(context);
	if (route.ended) release();
	else route.releases.push(release);
}

/**
 * @internal The route's seed scripts, produced now that its render has
 * finished. A seed that fails to produce is left out, so the browser loads
 * what it would have carried.
 * @param {object} context
 * @param {string} nonceAttribute ` nonce="…"`, or empty
 * @returns {Promise<string>}
 */
export async function routeSeedScripts(context, nonceAttribute) {
	const route = routes.get(context);
	if (!route || route.seeds.size === 0) return '';
	let html = '';
	for (const [name, produce] of route.seeds) {
		let text;
		try {
			text = String(await produce());
		} catch (error) {
			console.error(`[octane] Route seed ${JSON.stringify(name)} failed:`, error);
			continue;
		}
		// A JSON string, escaped so no part of it can close the script element.
		const json = JSON.stringify(text).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
		html += `<script id="${SEED_ID}${name}" type="application/json"${nonceAttribute}>${json}</script>`;
	}
	return html;
}

/**
 * @internal End the route: run each release once.
 * @param {object} context
 */
export function endRoute(context) {
	const route = routes.get(context);
	if (!route || route.ended) return;
	route.ended = true;
	for (const release of route.releases.splice(0)) {
		try {
			release();
		} catch (error) {
			console.error('[octane] Releasing a route failed:', error);
		}
	}
}

/**
 * @internal Put `html` just before the document's last `</body>`, or at its
 * end when it has none.
 * @param {string} document
 * @param {string} html
 */
export function beforeBodyEnd(document, html) {
	if (html === '') return document;
	const at = document.toLowerCase().lastIndexOf('</body');
	return at === -1 ? document + html : document.slice(0, at) + html + document.slice(at);
}

/**
 * @internal The `composeHtmlStream` ending for a route: its seeds go before
 * `</body>`, and the route ends with the stream.
 * @param {object} context
 * @param {string} nonceAttribute
 */
export function routeEnding(context, nonceAttribute) {
	return {
		tail: async (/** @type {string} */ suffix) =>
			beforeBodyEnd(suffix, await routeSeedScripts(context, nonceAttribute)),
		end: () => endRoute(context),
	};
}
