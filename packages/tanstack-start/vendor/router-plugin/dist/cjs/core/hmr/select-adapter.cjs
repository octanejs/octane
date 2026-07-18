const require_vite_adapter = require("./vite-adapter.cjs");
const require_webpack_adapter = require("./webpack-adapter.cjs");
//#region src/core/hmr/select-adapter.ts
/**
* Dispatches to the configured HMR adapter. `hmrStyle` is set explicitly by
* the bundler-specific plugin entry (e.g. `rspack.ts` → `'webpack'`), so there
* is no runtime inference based on config string shapes.
*/
function createRouteHmrStatement(stableRouteOptionKeys, opts) {
	const routeId = opts.routeId === "/__root" ? "__root__" : opts.routeId;
	if (opts.hmrStyle === "webpack") return require_webpack_adapter.createWebpackHmrStatement(stableRouteOptionKeys, {
		targetFramework: opts.targetFramework,
		routeId,
		routeSignature: opts.routeSignature
	});
	return require_vite_adapter.createViteHmrStatement(stableRouteOptionKeys, {
		targetFramework: opts.targetFramework,
		routeId,
		routeSignature: opts.routeSignature
	});
}
//#endregion
exports.createRouteHmrStatement = createRouteHmrStatement;

//# sourceMappingURL=select-adapter.cjs.map