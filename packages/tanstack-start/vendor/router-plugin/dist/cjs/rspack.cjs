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
//#region src/rspack.ts
var defaultRouterPluginContext = require_router_plugin_context.createRouterPluginContext();
/**
* Rspack uses webpack-compatible `module.hot` / `import.meta.webpackHot` HMR.
* Force `plugin.hmr.style = 'webpack'` so the router HMR adapter emits
* `module.hot`-style accept/dispose code instead of Vite's callback-receive
* variant, regardless of what the user passes (or doesn't pass).
*/
function withWebpackHmrStyle(options) {
	const mergeHmrStyle = (config) => ({
		...config,
		plugin: {
			...config?.plugin,
			hmr: {
				...config?.plugin?.hmr,
				style: "webpack"
			}
		}
	});
	if (typeof options === "function") return () => mergeHmrStyle(options());
	return mergeHmrStyle(options);
}
/**
* @example
* ```ts
* export default defineConfig({
*   // ...
*   tools: {
*     rspack: {
*       plugins: [TanStackRouterGeneratorRspack()],
*     },
*   },
* })
* ```
*/
var TanStackRouterGeneratorRspack = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createRspackPlugin)((pluginOptions) => require_router_generator_plugin.createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
};
/**
* @example
* ```ts
* export default defineConfig({
*   // ...
*   tools: {
*     rspack: {
*       plugins: [TanStackRouterCodeSplitterRspack()],
*     },
*   },
* })
* ```
*/
var TanStackRouterCodeSplitterRspack = (options, routerPluginContext) => {
	const pluginContext = routerPluginContext ?? defaultRouterPluginContext;
	return (0, unplugin.createRspackPlugin)((pluginOptions) => require_router_code_splitter_plugin.createRouterCodeSplitterPlugin(withWebpackHmrStyle(pluginOptions), pluginContext))(options);
};
/**
* @example
* ```ts
* export default defineConfig({
*   // ...
*   tools: {
*     rspack: {
*       plugins: [tanstackRouter()],
*     },
*   },
* })
* ```
*/
var TanStackRouterRspack = /* @__PURE__ */ (0, unplugin.createRspackPlugin)((options, meta) => require_router_composed_plugin.unpluginRouterComposedFactory(withWebpackHmrStyle(options), meta));
var tanstackRouter = TanStackRouterRspack;
//#endregion
exports.TanStackRouterCodeSplitterRspack = TanStackRouterCodeSplitterRspack;
exports.TanStackRouterGeneratorRspack = TanStackRouterGeneratorRspack;
exports.TanStackRouterRspack = TanStackRouterRspack;
exports.default = TanStackRouterRspack;
exports.configSchema = require_config.configSchema;
exports.tanstackRouter = tanstackRouter;

//# sourceMappingURL=rspack.cjs.map