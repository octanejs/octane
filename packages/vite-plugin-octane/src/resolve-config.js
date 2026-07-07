/**
 * Config validation + defaults — `resolveOctaneConfig` and its validators.
 *
 * Kept in a module with NO heavy imports (no vite, no octane/compiler) because
 * it is part of the PRODUCTION server bundle's graph: the generated server
 * entry re-resolves octane.config.ts through it at boot, and the whole
 * `@octanejs/vite-plugin/production` graph is bundled into dist/server/entry.js.
 * The file-loading half (`loadOctaneConfig`, which spins up Vite) lives in
 * `load-config.js` and re-exports everything here.
 */

/** @import { OctaneConfigOptions, ResolvedOctaneConfig } from '@octanejs/vite-plugin' */

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
		throw new Error('[@octanejs/vite-plugin] RenderRoute requires a string/tuple `entry`.');
	}

	if (render_route.layout !== undefined && typeof render_route.layout !== 'string') {
		throw new Error('[@octanejs/vite-plugin] RenderRoute `layout` must be a string path.');
	}

	const status = /** @type {{ status?: unknown }} */ (route).status;
	if (status !== undefined && (typeof status !== 'number' || !Number.isInteger(status))) {
		throw new Error('[@octanejs/vite-plugin] RenderRoute `status` must be an integer.');
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
		throw new Error('[@octanejs/vite-plugin] rootBoundary must be an object when provided.');
	}

	const boundary = /** @type {{ pending?: unknown, catch?: unknown }} */ (rootBoundary);
	if (boundary.pending !== undefined && typeof boundary.pending !== 'function') {
		throw new Error('[@octanejs/vite-plugin] rootBoundary.pending must be a component function.');
	}
	if (boundary.catch !== undefined && typeof boundary.catch !== 'function') {
		throw new Error('[@octanejs/vite-plugin] rootBoundary.catch must be a component function.');
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
		throw new Error(
			'[@octanejs/vite-plugin] octane.config.ts must export a default config object.',
		);
	}

	if (requireAdapter) {
		if (!raw.adapter) {
			throw new Error(
				'[@octanejs/vite-plugin] Production builds require an `adapter` in octane.config.ts. ' +
					'Install an adapter package (e.g. @ripple-ts/adapter-node) and set the `adapter` property.',
			);
		}

		if (!raw.adapter.runtime) {
			throw new Error(
				'[@octanejs/vite-plugin] The adapter in octane.config.ts is missing the `runtime` property. ' +
					'Make sure your adapter exports runtime primitives.',
			);
		}
	}

	if (raw.router?.routes !== undefined && !Array.isArray(raw.router.routes)) {
		throw new Error('[@octanejs/vite-plugin] router.routes must be an array.');
	}

	if (raw.router?.preHydrate !== undefined) {
		// A Vite-root module path: the client hydrate entry dynamic-imports it in
		// the browser, so it must be root-absolute ('/src/…'), not relative or fs.
		if (typeof raw.router.preHydrate !== 'string' || !raw.router.preHydrate.startsWith('/')) {
			throw new Error(
				"[@octanejs/vite-plugin] router.preHydrate must be a Vite-root module path (e.g. '/src/pre-hydrate.ts').",
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
		throw new Error("[@octanejs/vite-plugin] server.render must be 'streaming' or 'buffered'.");
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
