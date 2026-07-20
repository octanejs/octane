// @ts-check
/**
 * Runtime-only facade selected while bundling for a browser/Worker target.
 * Build-time filesystem emission stays in the default Node export.
 */

/** @import { AdaptContext, OctaneAdapter } from '@octanejs/app-core' */

import { runtime } from './runtime.js';

/**
 * This facade is bundled into the deployed Worker; adaptation only runs in the
 * parent Node build, so reaching it here indicates a build integration bug.
 * @param {AdaptContext} _ctx
 * @returns {Promise<void>}
 */
export async function adapt(_ctx) {
	throw new Error('[octane] Cloudflare adapt() is only available during the Node build.');
}

/** @returns {OctaneAdapter} */
export function cloudflare() {
	return {
		name: 'cloudflare',
		serverTarget: 'webworker',
		runtime,
		adapt,
	};
}
