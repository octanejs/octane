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
//#region src/webpack.ts
var defaultRouterPluginContext = require_router_plugin_context.createRouterPluginContext();
/**
* Webpack uses `module.hot` / `import.meta.webpackHot` HMR. Force
* `plugin.hmr.style = 'webpack'` so the router HMR adapter emits the correct
* accept/dispose shape regardless of user config.
*/
function withWebpackHmrStyle(options) {
	return {
		...options,
		plugin: {
			...options?.plugin,
			hmr: {
				...options?.plugin?.hmr,
				style: "webpack"
			}
		}
	};
}
/**
* @example
* ```ts
* export default {
*   // ...
*   plugins: [TanStackRouterGeneratorWebpack()],
* }
* ```
*/
var TanStackRouterGeneratorWebpack = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createWebpackPlugin)((pluginOptions) => require_router_generator_plugin.createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default {
*   // ...
*   plugins: [TanStackRouterCodeSplitterWebpack()],
* }
* ```
*/
var TanStackRouterCodeSplitterWebpack = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createWebpackPlugin)((pluginOptions) => require_router_code_splitter_plugin.createRouterCodeSplitterPlugin(withWebpackHmrStyle(pluginOptions), pluginContext))(options);
};
/**
* @example
* ```ts
* export default {
*   // ...
*   plugins: [tanstackRouter()],
* }
* ```
*/
var TanStackRouterWebpack = /* @__PURE__ */ (0, unplugin.createWebpackPlugin)((options, meta) => require_router_composed_plugin.unpluginRouterComposedFactory(withWebpackHmrStyle(options), meta));
var tanstackRouter = TanStackRouterWebpack;
//#endregion
exports.TanStackRouterCodeSplitterWebpack = TanStackRouterCodeSplitterWebpack;
exports.TanStackRouterGeneratorWebpack = TanStackRouterGeneratorWebpack;
exports.TanStackRouterWebpack = TanStackRouterWebpack;
exports.default = TanStackRouterWebpack;
exports.configSchema = require_config.configSchema;
exports.tanstackRouter = tanstackRouter;

//# sourceMappingURL=webpack.cjs.map