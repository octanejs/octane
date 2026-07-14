// @ts-check
/**
 * Config validation + defaults — `resolveOctaneConfig` and its validators.
 *
 * Kept in a module with NO heavy imports (no bundler or octane/compiler) because
 * it is part of the PRODUCTION server bundle's graph: the generated server
 * entry re-resolves octane.config.ts through it at boot, and the whole
 * `@octanejs/app-core/production` graph is bundled into dist/server/entry.js.
 * The file-loading half (`loadOctaneConfig`) lives in
 * `load-config.js` and re-exports everything here.
 */

/** @import { OctaneConfigOptions, ResolvedOctaneConfig } from '@octanejs/app-core' */

import { DEFAULT_OUTDIR } from './constants.js';

/**
 * @param {unknown} route
 * @returns {void}
 */
function validate_render_route(route) {
	if (
		!route ||
		typeof route !== 'object' ||
		/** @type {{ type?: unknown }} */ (route).type !== 'render'
	) {
		return;
	}

	const render_route = /** @type {{ entry?: unknown, layout?: unknown }} */ (route);
	const has_entry =
		typeof render_route.entry === 'string' ||
		(Array.isArray(render_route.entry) &&
			render_route.entry.length === 2 &&
			typeof render_route.entry[0] === 'string' &&
			typeof render_route.entry[1] === 'string');

	if (!has_entry) {
		throw new Error('[octane] RenderRoute requires a string/tuple `entry`.');
	}

	if (render_route.layout !== undefined && typeof render_route.layout !== 'string') {
		throw new Error('[octane] RenderRoute `layout` must be a string path.');
	}

	const status = /** @type {{ status?: unknown }} */ (route).status;
	if (status !== undefined && (typeof status !== 'number' || !Number.isInteger(status))) {
		throw new Error('[octane] RenderRoute `status` must be an integer.');
	}
}

/**
 * @param {unknown} rootBoundary
 * @returns {void}
 */
function validate_root_boundary(rootBoundary) {
	if (rootBoundary === undefined) {
		return;
	}
	if (!rootBoundary || typeof rootBoundary !== 'object') {
		throw new Error('[octane] rootBoundary must be an object when provided.');
	}

	const boundary = /** @type {{ pending?: unknown, catch?: unknown }} */ (rootBoundary);
	for (const name of ['pending', 'catch']) {
		const entry = boundary[/** @type {'pending' | 'catch'} */ (name)];
		if (entry === undefined) continue;
		const valid =
			(typeof entry === 'string' && entry.startsWith('/')) ||
			(Array.isArray(entry) &&
				entry.length === 2 &&
				typeof entry[0] === 'string' &&
				typeof entry[1] === 'string' &&
				entry[1].startsWith('/'));
		if (!valid) {
			throw new Error(
				`[octane] rootBoundary.${name} must be a project-root component module ID or [exportName, moduleId] tuple.`,
			);
		}
	}
}

/**
 * Validate a raw octane config and apply all defaults.
 *
 * After this function returns every optional field carries its default
 * value so callers never need to use `??` / `||` fallbacks.
 *
 * The function is idempotent — passing an already-resolved config
 * through it again is safe and produces the same result.
 *
 * @param {OctaneConfigOptions} raw - The user-provided config (from octane.config.ts)
 * @param {{ requireAdapter?: boolean }} [options]
 * @returns {ResolvedOctaneConfig}
 */
export function resolveOctaneConfig(raw, options = {}) {
	const { requireAdapter = false } = options;

	// ------------------------------------------------------------------
	// Validate
	// ------------------------------------------------------------------
	if (!raw) {
		throw new Error('[octane] octane.config.ts must export a default config object.');
	}

	if (requireAdapter && !raw.adapter) {
		throw new Error(
			'[octane] This build requires an `adapter` in octane.config.ts. ' +
				'Install an adapter package (e.g. @octanejs/adapter-vercel) and set the `adapter` property.',
		);
	}

	if (raw.adapter !== undefined) {
		if (typeof raw.adapter !== 'object' || raw.adapter === null) {
			throw new Error('[octane] adapter must be an adapter object (e.g. `adapter: vercel()`).');
		}
		if (raw.adapter.adapt !== undefined && typeof raw.adapter.adapt !== 'function') {
			throw new Error('[octane] adapter.adapt must be a function.');
		}
		if (raw.adapter.serve !== undefined && typeof raw.adapter.serve !== 'function') {
			throw new Error('[octane] adapter.serve must be a function.');
		}
	}

	if (raw.router?.routes !== undefined && !Array.isArray(raw.router.routes)) {
		throw new Error('[octane] router.routes must be an array.');
	}

	if (raw.router?.preHydrate !== undefined) {
		// A project-root module ID: the client hydrate entry dynamic-imports it in
		// the browser, so it must be root-absolute ('/src/…'), not relative or fs.
		if (typeof raw.router.preHydrate !== 'string' || !raw.router.preHydrate.startsWith('/')) {
			throw new Error(
				"[octane] router.preHydrate must be a project-root module ID (e.g. '/src/pre-hydrate.ts').",
			);
		}
	}

	for (const route of raw.router?.routes ?? []) {
		validate_render_route(route);
	}

	validate_root_boundary(raw.rootBoundary);

	if (
		raw.server?.render !== undefined &&
		raw.server.render !== 'streaming' &&
		raw.server.render !== 'buffered'
	) {
		throw new Error("[octane] server.render must be 'streaming' or 'buffered'.");
	}

	// ------------------------------------------------------------------
	// Apply defaults
	// ------------------------------------------------------------------
	return {
		build: {
			outDir: raw.build?.outDir ?? DEFAULT_OUTDIR,
			minify: raw.build?.minify,
			target: raw.build?.target,
		},
		adapter: raw.adapter,
		router: {
			routes: raw.router?.routes ?? [],
			preHydrate: raw.router?.preHydrate,
		},
		rootBoundary: raw.rootBoundary ?? {},
		middlewares: raw.middlewares ?? [],
		platform: {
			env: raw.platform?.env ?? {},
		},
		server: {
			trustProxy: raw.server?.trustProxy ?? false,
			render: raw.server?.render ?? 'streaming',
		},
	};
}
