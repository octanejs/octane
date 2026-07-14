export { DEFAULT_OUTDIR, ENTRY_FILENAME, OCTANE_NONCE_STATE_KEY } from './constants.js';
export { resolveOctaneConfig } from './resolve-config.js';
export { RenderRoute, ServerRoute } from './routes.js';

/**
 * Type-safe identity helper for `octane.config.ts`.
 *
 * @template {import('@octanejs/app-core').OctaneConfigOptions} T
 * @param {T} options
 * @returns {T}
 */
export function defineConfig(options) {
	return options;
}
