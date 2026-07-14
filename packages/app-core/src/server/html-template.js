// @ts-check

import { OCTANE_NONCE_STATE_KEY } from '../constants.js';

const HEAD_MARKER = '<!--ssr-head-->';
const BODY_MARKER = '<!--ssr-body-->';
export const HYDRATION_NONCE_PLACEHOLDER = '__OCTANE_REQUEST_NONCE__';
// A real (hidden) element survives bundler HTML module-script rewrites, unlike
// attributes on the script itself and empty template/comment sentinels. It is
// removed per request before the document is served.
const HYDRATION_MARKER = '<div hidden data-octane-hydrate-marker></div>';

/** @param {string} value */
function escapeAttribute(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Validate the structural contract needed by SSR and hydration.
 * @param {string} html
 */
export function validateSsrTemplate(html) {
	const headMarkerCount = html.split(HEAD_MARKER).length - 1;
	if (headMarkerCount !== 1) {
		throw new Error(
			`[octane] index.html must contain exactly one ${HEAD_MARKER}; found ${headMarkerCount}.`,
		);
	}
	validateSsrBodyContract(html);
}

/** @param {string} html */
function validateSsrBodyContract(html) {
	const markerCount = html.split(BODY_MARKER).length - 1;
	if (markerCount !== 1) {
		throw new Error(
			`[octane] index.html must contain exactly one ${BODY_MARKER}; found ${markerCount}.`,
		);
	}
	const bodyCloseCount = html.match(/<\/body\s*>/gi)?.length ?? 0;
	if (bodyCloseCount !== 1) {
		throw new Error(
			`[octane] index.html must contain exactly one closing </body> tag for hydration injection; found ${bodyCloseCount}.`,
		);
	}
}

/**
 * @param {string} html
 * @param {string} source
 * @param {string | null} nonce
 */
export function injectHydrationEntry(html, source, nonce) {
	validateSsrTemplate(html);
	const nonceAttr = nonce === null ? '' : ` nonce="${escapeAttribute(nonce)}"`;
	const script = `<script type="module" data-octane-hydrate src="${escapeAttribute(source)}"${nonceAttr}></script>`;
	const marker = nonce === HYDRATION_NONCE_PLACEHOLDER ? HYDRATION_MARKER : '';
	return html.replace(/<\/body\s*>/i, `${marker}${script}\n</body>`);
}

/**
 * Split a validated template around its one SSR body marker.
 * @param {string} html
 */
export function splitSsrTemplate(html) {
	// The head marker has already been replaced with request data at this point.
	validateSsrBodyContract(html);
	const at = html.indexOf(BODY_MARKER);
	return [html.slice(0, at), html.slice(at + BODY_MARKER.length)];
}

/**
 * Add the request nonce to the production hydrate script the integration built. The
 * data attribute is inserted before build so this remains robust after the
 * script src is hashed/reordered.
 * @param {string} html
 * @param {string | null} nonce
 */
export function applyHydrationNonce(html, nonce) {
	const tags = html.match(/<script\b[^>]*>/gi) ?? [];
	let hydrationTags = tags.filter(
		(tag) => /\bdata-octane-hydrate\b/i.test(tag) || tag.includes(HYDRATION_NONCE_PLACEHOLDER),
	);
	const markerCount = html.split(HYDRATION_MARKER).length - 1;
	if (hydrationTags.length === 0 && markerCount === 1) {
		// Bundlers may coalesce/hoist HTML module entries into the head, so the hydrate
		// module may no longer be adjacent to its marker (and may share an entry
		// chunk with user scripts). Nonce every built module-entry tag: they all
		// participate in the same CSP-protected bootstrap graph.
		hydrationTags = tags.filter((tag) => /\btype\s*=\s*(?:"module"|'module'|module)/i.test(tag));
	}
	const invalidMarkerContract =
		markerCount > 0 ? markerCount !== 1 || hydrationTags.length === 0 : hydrationTags.length !== 1;
	if (invalidMarkerContract) {
		throw new Error(
			`[octane] Built SSR template must identify its hydration module script; found ${hydrationTags.length}.`,
		);
	}
	let output = html.replace(HYDRATION_MARKER, '');
	for (const oldTag of hydrationTags) {
		let nextTag = oldTag.replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
		if (!/\bdata-octane-hydrate\b/i.test(nextTag)) {
			nextTag = nextTag.replace(/^<script\b/i, '<script data-octane-hydrate');
		}
		if (nonce !== null) {
			nextTag = nextTag.replace(/^<script\b/i, `<script nonce="${escapeAttribute(nonce)}"`);
		}
		output = output.replace(oldTag, nextTag);
	}
	return output;
}

/** @param {string | null} nonce */
export function nonceAttribute(nonce) {
	return nonce === null ? '' : ` nonce="${escapeAttribute(nonce)}"`;
}

/**
 * Read and validate the documented middleware state key.
 * @param {{ state: Map<string, unknown> }} context
 * @returns {string | null}
 */
export function getContextNonce(context) {
	const value = context.state.get(OCTANE_NONCE_STATE_KEY);
	if (value === undefined) return null;
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(
			`[octane] Context.state.get('${OCTANE_NONCE_STATE_KEY}') must be a non-empty string.`,
		);
	}
	return value;
}
