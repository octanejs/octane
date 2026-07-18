const require_config = require("./config.cjs");
const require_select_adapter = require("./hmr/select-adapter.cjs");
const require_utils = require("./utils.cjs");
const require_compilers = require("./code-splitter/compilers.cjs");
const require_framework_plugins = require("./code-splitter/plugins/framework-plugins.cjs");
const require_framework_plugin_order = require("./framework-plugin-order.cjs");
let _tanstack_router_utils = require("@tanstack/router-utils");
//#region src/core/router-hmr-plugin.ts
/**
* This plugin adds HMR support for file routes.
* It is only added to the composed plugin in dev when autoCodeSplitting is disabled, since the code splitting plugin
* handles HMR for code-split routes itself.
*/
function createRouterHmrPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	const resolveUserConfig = () => {
		return require_config.getConfig(typeof options === "function" ? options() : options, ROOT);
	};
	let userConfig = resolveUserConfig();
	return {
		name: "tanstack-router:hmr",
		enforce: "pre",
		transform: {
			filter: {
				id: [/\.(m|c)?(j|t)sx?$/, /\.tsrx(?:$|\?)/],
				code: { include: require_utils.routeFactoryCallCodeFilter }
			},
			handler(code, id) {
				const normalizedId = require_utils.normalizePath(id);
				const routeEntry = routerPluginContext.routesByFile.get(normalizedId);
				if (!routeEntry) return null;
				if (require_utils.debug) console.info("Adding HMR handling to route ", normalizedId);
				const hmrStyle = userConfig.plugin?.hmr?.style ?? "vite";
				if (userConfig.target === "react") {
					const compilerPlugins = require_framework_plugins.getReferenceRouteCompilerPlugins({
						targetFramework: "react",
						addHmr: true,
						hmrStyle
					});
					const compiled = require_compilers.compileCodeSplitReferenceRoute({
						code,
						filename: normalizedId,
						id: normalizedId,
						addHmr: true,
						hmrStyle,
						hmrRouteId: routeEntry.routeId,
						codeSplitGroupings: [],
						targetFramework: "react",
						compilerPlugins
					});
					if (compiled) {
						if (require_utils.debug) {
							(0, _tanstack_router_utils.logDiff)(code, compiled.code);
							console.log("Output:\n", compiled.code + "\n\n");
						}
						return compiled;
					}
				}
				const ast = (0, _tanstack_router_utils.parseAst)({
					code,
					filename: normalizedId
				});
				ast.program.body.push(...require_select_adapter.createRouteHmrStatement([], {
					hmrStyle,
					targetFramework: userConfig.target,
					routeId: routeEntry.routeId
				}));
				const result = (0, _tanstack_router_utils.generateFromAst)(ast, {
					sourceMaps: true,
					filename: normalizedId,
					sourceFileName: normalizedId
				});
				if (require_utils.debug) {
					(0, _tanstack_router_utils.logDiff)(code, result.code);
					console.log("Output:\n", result.code + "\n\n");
				}
				return result;
			}
		},
		vite: {
			configResolved(config) {
				ROOT = config.root;
				userConfig = resolveUserConfig();
				require_framework_plugin_order.validateFrameworkPluginOrder({
					framework: userConfig.target,
					plugins: config.plugins,
					routerPluginName: "tanstack-router:hmr"
				});
			},
			applyToEnvironment(environment) {
				if (userConfig.plugin?.vite?.environmentName) return userConfig.plugin.vite.environmentName === environment.name;
				return true;
			}
		}
	};
}
//#endregion
exports.createRouterHmrPlugin = createRouterHmrPlugin;

//# sourceMappingURL=router-hmr-plugin.cjs.map