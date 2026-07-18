const require_runtime = require("../../../_virtual/_rolldown/runtime.cjs");
const require_utils = require("../../utils.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
let _babel_template = require("@babel/template");
_babel_template = require_runtime.__toESM(_babel_template, 1);
//#region src/core/code-splitter/plugins/octane-hmr-split-route-components.ts
var buildViteHmrStatements = _babel_template.statements(`
    const %%candidateIdent%% = %%hmrIdent%%(%%componentIdent%%)
    const %%hotIdent%% = import.meta.hot
    const %%hotDataIdent%% = %%hotIdent%% ? (%%hotIdent%%.data ??= {}) : undefined
    let %%stableIdent%% = %%candidateIdent%%
    if (%%hotDataIdent%%?.[%%hotDataKey%%]) {
      %%hotDataIdent%%[%%hotDataKey%%][%%hmrSymbolIdent%%].update(%%candidateIdent%%)
      %%stableIdent%% = %%hotDataIdent%%[%%hotDataKey%%]
    }
    %%stableIdent%%.$$singleRoot = %%componentIdent%%.$$singleRoot
    try { %%stableIdent%%.__oct_loc = %%componentIdent%%.__oct_loc } catch {}
    if (%%hotIdent%%) {
      %%hotDataIdent%%[%%hotDataKey%%] = %%stableIdent%%
      import.meta.hot.accept()
    }
  `, { syntacticPlaceholders: true });
var buildWebpackHmrStatements = _babel_template.statements(`
    const %%candidateIdent%% = %%hmrIdent%%(%%componentIdent%%)
    const %%hotIdent%% = import.meta.webpackHot
    let %%stableIdent%% = %%candidateIdent%%
    if (%%hotIdent%%?.data?.[%%hotDataKey%%]) {
      %%hotIdent%%.data[%%hotDataKey%%][%%hmrSymbolIdent%%].update(%%candidateIdent%%)
      %%stableIdent%% = %%hotIdent%%.data[%%hotDataKey%%]
    }
    %%stableIdent%%.$$singleRoot = %%componentIdent%%.$$singleRoot
    try { %%stableIdent%%.__oct_loc = %%componentIdent%%.__oct_loc } catch {}
    if (%%hotIdent%%) {
      %%hotIdent%%.dispose((data) => {
        data[%%hotDataKey%%] = %%stableIdent%%
      })
      %%hotIdent%%.accept()
    }
  `, { syntacticPlaceholders: true });
function capitalizeIdentifier(value) {
	return value[0].toUpperCase() + value.slice(1);
}
function createOctaneHmrSplitRouteComponentsPlugin(opts) {
	let hmrIdent;
	let hmrSymbolIdent;
	return {
		name: "octane-hmr-split-route-components",
		onExportSplitRouteProperty(ctx) {
			if (ctx.splitNodeMeta.splitStrategy !== "lazyRouteComponent") return;
			if (!hmrIdent || !hmrSymbolIdent) {
				hmrIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, "TSROctaneHmr");
				hmrSymbolIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, "TSROctaneHmrSymbol");
				ctx.programPath.unshiftContainer("body", _babel_types.importDeclaration([_babel_types.importSpecifier(hmrIdent, _babel_types.identifier("hmr")), _babel_types.importSpecifier(hmrSymbolIdent, _babel_types.identifier("HMR"))], _babel_types.stringLiteral("octane")));
			}
			const exportName = ctx.splitNodeMeta.exporterIdent;
			const name = capitalizeIdentifier(exportName);
			const componentIdent = _babel_types.identifier(ctx.localExporterIdent);
			const candidateIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSROctane${name}Candidate`);
			const stableIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSROctane${name}`);
			const hotIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSROctane${name}Hot`);
			const hotDataIdent = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSROctane${name}HotData`);
			const hotDataKey = _babel_types.stringLiteral(`tsr-octane-split-component:${exportName}`);
			const statements = opts.hmrStyle === "webpack" ? buildWebpackHmrStatements({
				candidateIdent,
				componentIdent,
				hmrIdent,
				hmrSymbolIdent,
				hotDataKey,
				hotIdent,
				stableIdent
			}) : buildViteHmrStatements({
				candidateIdent,
				componentIdent,
				hmrIdent,
				hmrSymbolIdent,
				hotDataIdent,
				hotDataKey,
				hotIdent,
				stableIdent
			});
			ctx.programPath.pushContainer("body", statements);
			return stableIdent;
		}
	};
}
//#endregion
exports.createOctaneHmrSplitRouteComponentsPlugin = createOctaneHmrSplitRouteComponentsPlugin;

//# sourceMappingURL=octane-hmr-split-route-components.cjs.map