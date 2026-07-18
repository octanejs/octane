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
//#region src/vite.ts
var defaultRouterPluginContext = require_router_plugin_context.createRouterPluginContext();
/**
* @example
* ```ts
* export default defineConfig({
*   plugins: [tanstackRouterGenerator()],
*   // ...
* })
* ```
*/
var tanstackRouterGenerator = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createVitePlugin)((pluginOptions) => require_router_generator_plugin.createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default defineConfig({
*   plugins: [tanStackRouterCodeSplitter()],
*   // ...
* })
* ```
*/
var tanStackRouterCodeSplitter = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createVitePlugin)((pluginOptions) => require_router_code_splitter_plugin.createRouterCodeSplitterPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default defineConfig({
*   plugins: [tanstackRouter()],
*   // ...
* })
* ```
*/
var tanstackRouter = (0, unplugin.createVitePlugin)(require_router_composed_plugin.unpluginRouterComposedFactory);
/**
* @deprecated Use `tanstackRouter` instead.
*/
var TanStackRouterVite = tanstackRouter;
//#endregion
exports.TanStackRouterVite = TanStackRouterVite;
exports.configSchema = require_config.configSchema;
exports.default = tanstackRouter;
exports.tanstackRouter = tanstackRouter;
exports.getConfig = require_config.getConfig;
exports.tanStackRouterCodeSplitter = tanStackRouterCodeSplitter;
exports.tanstackRouterGenerator = tanstackRouterGenerator;

//# sourceMappingURL=vite.cjs.map