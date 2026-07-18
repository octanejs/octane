import { configSchema } from "./core/config.js";
import { createRouterPluginContext } from "./core/router-plugin-context.js";
import { createRouterCodeSplitterPlugin } from "./core/router-code-splitter-plugin.js";
import { createRouterGeneratorPlugin } from "./core/router-generator-plugin.js";
import { unpluginRouterComposedFactory } from "./core/router-composed-plugin.js";
import { createRspackPlugin } from "unplugin";
//#region src/rspack.ts
var defaultRouterPluginContext = createRouterPluginContext();
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
	return createRspackPlugin((pluginOptions) => createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
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
	return createRspackPlugin((pluginOptions) => createRouterCodeSplitterPlugin(withWebpackHmrStyle(pluginOptions), pluginContext))(options);
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
var TanStackRouterRspack = /* @__PURE__ */ createRspackPlugin((options, meta) => unpluginRouterComposedFactory(withWebpackHmrStyle(options), meta));
var tanstackRouter = TanStackRouterRspack;
//#endregion
export { TanStackRouterCodeSplitterRspack, TanStackRouterGeneratorRspack, TanStackRouterRspack, TanStackRouterRspack as default, configSchema, tanstackRouter };

//# sourceMappingURL=rspack.js.map