const require_runtime = require("../../../_virtual/_rolldown/runtime.cjs");
const require_utils = require("../../utils.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
let _babel_template = require("@babel/template");
_babel_template = require_runtime.__toESM(_babel_template, 1);
//#region src/core/code-splitter/plugins/react-stable-hmr-split-route-components.ts
function capitalizeIdentifier(str) {
	return str[0].toUpperCase() + str.slice(1);
}
function createHotDataKey(exportName) {
	return `tsr-split-component:${exportName}`;
}
var buildStableSplitComponentStatements = _babel_template.statements(`
    const %%stableComponentIdent%% = (() => {
      const hot = %%hotExpression%%
      const hotData = hot ? (hot.data ??= {}) : undefined
      return hotData?.[%%hotDataKey%%] ?? %%lazyRouteComponentIdent%%(%%localImporterIdent%%, %%exporterIdent%%)
    })()
    if (%%hotExpression%%) {
      ((%%hotExpression%%).data ??= {})[%%hotDataKey%%] = %%stableComponentIdent%%
    }
  `, { syntacticPlaceholders: true });
function hotExpressionAstFor(hmrStyle) {
	return _babel_template.expression.ast(hmrStyle === "webpack" ? "import.meta.webpackHot" : "import.meta.hot");
}
function createStableHmrSplitRouteComponentsPlugin(opts) {
	return {
		name: "react-stable-hmr-split-route-components",
		onSplitRouteProperty(ctx) {
			if (ctx.splitNodeMeta.splitStrategy !== "lazyRouteComponent") return;
			const stableComponentIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSRSplit${capitalizeIdentifier(ctx.splitNodeMeta.exporterIdent)}`);
			const hotDataKey = createHotDataKey(ctx.splitNodeMeta.exporterIdent);
			ctx.insertionPath.insertBefore(buildStableSplitComponentStatements({
				stableComponentIdent,
				hotDataKey: _babel_types.stringLiteral(hotDataKey),
				hotExpression: hotExpressionAstFor(opts.hmrStyle),
				lazyRouteComponentIdent: _babel_types.identifier(ctx.lazyRouteComponentIdent),
				localImporterIdent: _babel_types.identifier(ctx.splitNodeMeta.localImporterIdent),
				exporterIdent: _babel_types.stringLiteral(ctx.splitNodeMeta.exporterIdent)
			}));
			return _babel_types.identifier(stableComponentIdent.name);
		}
	};
}
//#endregion
exports.createStableHmrSplitRouteComponentsPlugin = createStableHmrSplitRouteComponentsPlugin;

//# sourceMappingURL=react-stable-hmr-split-route-components.cjs.map