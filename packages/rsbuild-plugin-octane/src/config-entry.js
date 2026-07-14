// @ts-check
/**
 * Config-safe facade used while bundling the production server entry.
 *
 * `octane.config.ts` imports the integration's bare package name, but the real
 * entry also owns compiler/dev-server setup. Keep every app-core helper that is
 * valid in declarative config while preventing the toolchain from entering the
 * server bundle.
 */

export * from '@octanejs/app-core';

/** @returns {never} */
export function pluginOctane() {
	throw new Error(
		'[@octanejs/rsbuild-plugin] pluginOctane() is an Rsbuild plugin and cannot run inside the production server bundle.',
	);
}

export const octane = pluginOctane;
