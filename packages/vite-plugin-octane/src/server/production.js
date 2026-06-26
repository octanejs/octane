/**
 * Production fetch-handler factory + config re-exports.
 *
 * PHASE 1 STUB. `createHandler` is the runtime entry the generated server
 * bundle calls in production; it is wired in Phase 2 (async render, adapter
 * `serve`, asset preload, RPC). Until then it throws a clear error. The
 * `./production` export path stays resolvable, and `resolveOctaneConfig` is
 * re-exported here because the generated server entry imports it from this
 * module (mirrors @ripple-ts/vite-plugin).
 */

export { resolveOctaneConfig } from '../load-config.js';

/**
 * Create the production fetch handler (Phase 2).
 *
 * @param {unknown} _manifest
 * @param {unknown} _deps
 * @returns {never}
 */
export function createHandler(_manifest, _deps) {
	throw new Error(
		'[@octanejs/vite-plugin] Production build (createHandler) is Phase 2 — not yet implemented. ' +
			'Dev SSR works via `vite dev`.',
	);
}
