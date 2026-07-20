// @ts-check
/**
 * @octanejs/adapter-cloudflare — Cloudflare Workers adapter for Octane apps.
 *
 * The production integrations see `serverTarget: 'webworker'` and emit a
 * template-free Worker bundle. After both bundles exist, adapt() embeds the
 * built HTML template in `dist/server/worker.js`, the module Worker entry that
 * a user-owned wrangler.jsonc deploys beside `dist/client` static assets.
 */

/** @import { AdaptContext, OctaneAdapter } from '@octanejs/app-core' */

import { emitCloudflareWorker } from './adapt.js';
import { runtime } from './runtime.js';

/**
 * Emit the Cloudflare module Worker entry after an Octane production build.
 * @param {AdaptContext} ctx
 * @returns {Promise<void>}
 */
export async function adapt(ctx) {
	await emitCloudflareWorker(ctx);
}

/**
 * @returns {OctaneAdapter}
 */
export function cloudflare() {
	return {
		name: 'cloudflare',
		serverTarget: 'webworker',
		runtime,
		adapt,
	};
}
