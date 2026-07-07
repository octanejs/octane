/**
 * Shared utility for loading and resolving octane.config.ts.
 *
 * `resolveOctaneConfig` is the single source of truth for all config
 * validation and default values. Every consumer should receive a
 * `ResolvedOctaneConfig` rather than applying ad-hoc defaults.
 *
 * `loadOctaneConfig` is the single entry point for loading the config
 * file.  It accepts an optional Vite dev server — when provided the
 * config is loaded via `ssrLoadModule` (no temp server overhead,
 * HMR-aware). Otherwise a temporary Vite server is spun up, used to
 * transpile the TypeScript config, and immediately shut down.
 *
 * Used by the Vite plugin (during dev + build), the preview CLI script,
 * and the generated production server entry.
 */

/** @import { OctaneConfigOptions, ResolvedOctaneConfig } from '@octanejs/vite-plugin' */

import path from 'node:path';
import fs from 'node:fs';
import { compile } from 'octane/compiler';
import { resolveOctaneConfig } from './resolve-config.js';

const OCTANE_EXTENSION_PATTERN = /\.tsrx$/;

// Validation + defaults live in resolve-config.js (a module with no vite /
// compiler imports) so the production server bundle can include it without
// dragging the toolchain along. Re-exported here for existing importers.
export { resolveOctaneConfig } from './resolve-config.js';

/**
 * Return the absolute path to octane.config.ts for the given project root.
 *
 * This is the single source of truth for the config file name / location.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {string}
 */
export function getOctaneConfigPath(projectRoot) {
	return path.join(projectRoot, 'octane.config.ts');
}

/**
 * Check whether a octane.config.ts file exists in the given root.
 *
 * Use this before calling `loadOctaneConfig` when the absence of a
 * config is a valid state (e.g. the Vite plugin running in SPA mode).
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {boolean}
 */
export function octaneConfigExists(projectRoot) {
	return fs.existsSync(getOctaneConfigPath(projectRoot));
}

/**
 * Load octane.config.ts, validate, and apply defaults via `resolveOctaneConfig`.
 *
 * When a Vite dev server is provided via `options.vite`, the config is loaded
 * through its `ssrLoadModule` — avoiding the cost of spinning up a temporary
 * server and enabling HMR-aware reloads.
 *
 * When no dev server is available (build / preview), a temporary Vite server
 * is created in middleware mode, used to transpile the config, then shut down.
 *
 * Throws if the config file does not exist or is invalid.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {{ vite?: import('vite').ViteDevServer, requireAdapter?: boolean }} [options]
 * @returns {Promise<ResolvedOctaneConfig>}
 */
export async function loadOctaneConfig(projectRoot, options = {}) {
	const { vite, requireAdapter } = options;
	const configPath = getOctaneConfigPath(projectRoot);

	if (!fs.existsSync(configPath)) {
		throw new Error(`[@octanejs/vite-plugin] octane.config.ts not found in ${projectRoot}`);
	}

	// When a running Vite dev server is available, use it directly.
	if (vite) {
		const configModule = await vite.ssrLoadModule(configPath);
		return resolveOctaneConfig(configModule.default, { requireAdapter });
	}

	// Otherwise spin up a temporary Vite server (build / preview).
	// The temp server only transpiles octane.config.ts (plain TypeScript) —
	// no .tsrx compilation plugin is needed beyond config-referenced helpers.
	const { createServer } = await import('vite');

	const tempVite = await createServer({
		root: projectRoot,
		configFile: false,
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [
			{
				name: 'octane-config-tsrx-loader',
				transform(source, id) {
					if (!OCTANE_EXTENSION_PATTERN.test(id)) return null;
					const filename = id.replace(projectRoot, '');
					return compile(source, filename, {
						mode: 'server',
						hmr: false,
					});
				},
			},
		],
		logLevel: 'silent',
	});

	try {
		const configModule = await tempVite.ssrLoadModule(configPath);
		return resolveOctaneConfig(configModule.default, { requireAdapter });
	} finally {
		await tempVite.close();
	}
}
