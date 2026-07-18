const require_react_refresh_ignored_route_exports = require("./react-refresh-ignored-route-exports.cjs");
const require_react_refresh_route_components = require("./react-refresh-route-components.cjs");
const require_react_stable_hmr_split_route_components = require("./react-stable-hmr-split-route-components.cjs");
const require_octane_split_route_components = require("./octane-split-route-components.cjs");
const require_octane_hmr_split_route_components = require("./octane-hmr-split-route-components.cjs");
//#region src/core/code-splitter/plugins/framework-plugins.ts
function getReferenceRouteCompilerPlugins(opts) {
	switch (opts.targetFramework) {
		case "react":
			if (opts.addHmr) {
				const hmrStyle = opts.hmrStyle ?? "vite";
				return [
					...hmrStyle === "vite" ? [require_react_refresh_ignored_route_exports.createReactRefreshIgnoredRouteExportsPlugin()] : [],
					require_react_refresh_route_components.createReactRefreshRouteComponentsPlugin(),
					require_react_stable_hmr_split_route_components.createStableHmrSplitRouteComponentsPlugin({ hmrStyle })
				];
			}
			return;
		case "octane": return [require_octane_split_route_components.createOctaneSplitRouteComponentsPlugin(), ...opts.addHmr ? [require_react_stable_hmr_split_route_components.createStableHmrSplitRouteComponentsPlugin({ hmrStyle: opts.hmrStyle ?? "vite" })] : []];
		default: return;
	}
}
function getVirtualRouteCompilerPlugins(opts) {
	if (opts.targetFramework !== "octane" || !opts.addHmr) return;
	return [require_octane_hmr_split_route_components.createOctaneHmrSplitRouteComponentsPlugin({ hmrStyle: opts.hmrStyle ?? "vite" })];
}
//#endregion
exports.getReferenceRouteCompilerPlugins = getReferenceRouteCompilerPlugins;
exports.getVirtualRouteCompilerPlugins = getVirtualRouteCompilerPlugins;

//# sourceMappingURL=framework-plugins.cjs.map