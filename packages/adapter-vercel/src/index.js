// @ts-check
/**
 * @octanejs/adapter-vercel — Vercel adapter for octane apps.
 *
 * Usage (octane.config.ts):
 *
 *   import { vercel } from '@octanejs/adapter-vercel';
 *   export default defineConfig({
 *     adapter: vercel(),
 *     router: { … },
 *   });
 *
 * `vercel(options)` returns the shared adapter contract: after a production
 * build produces both bundles, the active integration calls `adapt(ctx)` and this
 * adapter restructures them into Vercel's Build Output API v3 under
 * `.vercel/output/` — no vercel.json rewrites, no hand-written api/ function.
 * The same contract shape (`{ name, adapt }`) is what a Cloudflare/Netlify
 * adapter implements to target other platforms.
 *
 * No `serve`/`runtime` overrides are provided: Vercel functions run on Node,
 * and the generated server entry's built-in Node defaults (AsyncLocalStorage
 * async context, sha-256 hash) are exactly right — `octane-preview` keeps
 * serving dist/server locally, untouched by the adapter.
 */

/** @import { VercelAdapterOptions } from '@octanejs/adapter-vercel' */
/** @import { OctaneAdapter } from '@octanejs/app-core' */

import { adapt } from './adapt.js';

export { adapt };

/**
 * @param {VercelAdapterOptions} [options]
 * @returns {OctaneAdapter}
 */
export function vercel(options = {}) {
	return {
		name: 'vercel',
		adapt: (ctx) => adapt(ctx, options),
	};
}
