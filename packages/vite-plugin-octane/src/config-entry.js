/**
 * Config-surface facade for the PRODUCTION server bundle.
 *
 * octane.config.ts imports `RenderRoute` / `ServerRoute` / `defineConfig` from
 * '@octanejs/vite-plugin'. The real package entry (`src/index.js`) also pulls
 * in the octane compiler, the dev-SSR middleware, and a dynamic `import('vite')`
 * — none of which belong in dist/server/entry.js. The SSR sub-build therefore
 * aliases the BARE '@octanejs/vite-plugin' specifier to this module, which
 * re-exports only what a config file can legitimately use. Subpath imports
 * ('@octanejs/vite-plugin/production', '/node') are not affected by the alias.
 */

export { RenderRoute, ServerRoute } from './routes.js';
export { resolveOctaneConfig } from './resolve-config.js';

// Mirrors src/index.js — enforce types / DX only.
export function defineConfig(/** @type {any} */ options) {
	return options;
}

/**
 * The plugin factory must never run inside the built server: the sub-build
 * aliases it away precisely because it drags the compiler + vite along.
 * @returns {never}
 */
export function octane() {
	throw new Error(
		'[@octanejs/vite-plugin] octane() is a Vite plugin — it cannot run inside the production server bundle.',
	);
}
