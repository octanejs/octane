import { createReactRefreshIgnoredRouteExportsPlugin } from "./react-refresh-ignored-route-exports.js";
import { createReactRefreshRouteComponentsPlugin } from "./react-refresh-route-components.js";
import { createStableHmrSplitRouteComponentsPlugin } from "./react-stable-hmr-split-route-components.js";
import { createOctaneSplitRouteComponentsPlugin } from "./octane-split-route-components.js";
import { createOctaneHmrSplitRouteComponentsPlugin } from "./octane-hmr-split-route-components.js";
//#region src/core/code-splitter/plugins/framework-plugins.ts
function getReferenceRouteCompilerPlugins(opts) {
	switch (opts.targetFramework) {
		case "react":
			if (opts.addHmr) {
				const hmrStyle = opts.hmrStyle ?? "vite";
				return [
					...hmrStyle === "vite" ? [createReactRefreshIgnoredRouteExportsPlugin()] : [],
					createReactRefreshRouteComponentsPlugin(),
					createStableHmrSplitRouteComponentsPlugin({ hmrStyle })
				];
			}
			return;
		case "octane": return [createOctaneSplitRouteComponentsPlugin(), ...opts.addHmr ? [createStableHmrSplitRouteComponentsPlugin({ hmrStyle: opts.hmrStyle ?? "vite" })] : []];
		default: return;
	}
}
function getVirtualRouteCompilerPlugins(opts) {
	if (opts.targetFramework !== "octane" || !opts.addHmr) return;
	return [createOctaneHmrSplitRouteComponentsPlugin({ hmrStyle: opts.hmrStyle ?? "vite" })];
}
//#endregion
export { getReferenceRouteCompilerPlugins, getVirtualRouteCompilerPlugins };

//# sourceMappingURL=framework-plugins.js.map