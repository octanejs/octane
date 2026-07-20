import { createViteHmrStatement } from './vite-adapter.js';
import { createWebpackHmrStatement } from './webpack-adapter.js';
//#region src/core/hmr/select-adapter.ts
/**
 * Dispatches to the configured HMR adapter. `hmrStyle` is set explicitly by
 * the bundler-specific plugin entry (e.g. `rspack.ts` → `'webpack'`), so there
 * is no runtime inference based on config string shapes.
 */
function createRouteHmrStatement(stableRouteOptionKeys, opts) {
	const routeId = opts.routeId === '/__root' ? '__root__' : opts.routeId;
	if (opts.hmrStyle === 'webpack')
		return createWebpackHmrStatement(stableRouteOptionKeys, {
			targetFramework: opts.targetFramework,
			routeId,
			routeSignature: opts.routeSignature,
		});
	return createViteHmrStatement(stableRouteOptionKeys, {
		targetFramework: opts.targetFramework,
		routeId,
		routeSignature: opts.routeSignature,
	});
}
//#endregion
export { createRouteHmrStatement };
