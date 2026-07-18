const require_runtime = require("../../../_virtual/_rolldown/runtime.cjs");
const require_utils = require("../../utils.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
let _babel_template = require("@babel/template");
_babel_template = require_runtime.__toESM(_babel_template, 1);
//#region src/core/code-splitter/plugins/react-refresh-ignored-route-exports.ts
var buildReactRefreshIgnoredRouteExportsStatements = _babel_template.statements(`
const hot = import.meta.hot
if (hot && typeof window !== 'undefined') {
  hot.data ??= {}
  const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map()
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports

    window.__getReactRefreshIgnoredExports = (ctx) => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? []
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? []
      return [...ignoredExports, ...moduleIgnored]
    }

    return {
      ignoredExportsById,
    }
  })()

  tsrReactRefresh.ignoredExportsById.set(%%moduleId%%, ['Route'])
}
`, { syntacticPlaceholders: true });
/**
* A trivial component-shaped export that gives `@vitejs/plugin-react` a valid
* Fast Refresh boundary. Without at least one non-ignored component export,
* the module would be invalidated (full page reload) on every update even
* though our custom route HMR handler already manages the update.
*/
var buildRefreshAnchorStatement = _babel_template.statement(`export function %%anchorName%%() { return null }`, { syntacticPlaceholders: true });
function createReactRefreshIgnoredRouteExportsPlugin() {
	return {
		name: "react-refresh-ignored-route-exports",
		onAddHmr(ctx) {
			const anchorName = require_utils.getUniqueProgramIdentifier(ctx.programPath, "TSRFastRefreshAnchor");
			ctx.programPath.pushContainer("body", buildReactRefreshIgnoredRouteExportsStatements({ moduleId: _babel_types.stringLiteral(ctx.opts.id) }));
			ctx.programPath.pushContainer("body", buildRefreshAnchorStatement({ anchorName }));
			return { modified: true };
		}
	};
}
//#endregion
exports.createReactRefreshIgnoredRouteExportsPlugin = createReactRefreshIgnoredRouteExportsPlugin;

//# sourceMappingURL=react-refresh-ignored-route-exports.cjs.map