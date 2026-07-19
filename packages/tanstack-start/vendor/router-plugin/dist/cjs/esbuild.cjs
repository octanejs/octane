Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
const require_config = require("./core/config.cjs");
const require_router_plugin_context = require("./core/router-plugin-context.cjs");
const require_router_code_splitter_plugin = require("./core/router-code-splitter-plugin.cjs");
const require_router_generator_plugin = require("./core/router-generator-plugin.cjs");
const require_router_composed_plugin = require("./core/router-composed-plugin.cjs");
let unplugin = require("unplugin");
//#region src/esbuild.ts
var defaultRouterPluginContext = require_router_plugin_context.createRouterPluginContext();
/**
* @example
* ```ts
* export default {
*   plugins: [TanStackRouterGeneratorEsbuild()],
*   // ...
* }
* ```
*/
var TanStackRouterGeneratorEsbuild = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createEsbuildPlugin)((pluginOptions) => require_router_generator_plugin.createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default {
*  plugins: [TanStackRouterCodeSplitterEsbuild()],
*  // ...
* }
* ```
*/
var TanStackRouterCodeSplitterEsbuild = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createEsbuildPlugin)((pluginOptions) => require_router_code_splitter_plugin.createRouterCodeSplitterPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default {
*   plugins: [tanstackRouter()],
*   // ...
* }
* ```
*/
var TanStackRouterEsbuild = (0, unplugin.createEsbuildPlugin)(require_router_composed_plugin.unpluginRouterComposedFactory);
var tanstackRouter = TanStackRouterEsbuild;
//#endregion
exports.TanStackRouterCodeSplitterEsbuild = TanStackRouterCodeSplitterEsbuild;
exports.TanStackRouterEsbuild = TanStackRouterEsbuild;
exports.default = TanStackRouterEsbuild;
exports.TanStackRouterGeneratorEsbuild = TanStackRouterGeneratorEsbuild;
exports.configSchema = require_config.configSchema;
exports.tanstackRouter = tanstackRouter;

//# sourceMappingURL=esbuild.cjs.map