import { configSchema } from "./core/config.js";
import { createRouterPluginContext } from "./core/router-plugin-context.js";
import { createRouterCodeSplitterPlugin } from "./core/router-code-splitter-plugin.js";
import { createRouterGeneratorPlugin } from "./core/router-generator-plugin.js";
import { unpluginRouterComposedFactory } from "./core/router-composed-plugin.js";
import { createWebpackPlugin } from "unplugin";
//#region src/webpack.ts
var defaultRouterPluginContext = createRouterPluginContext();
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
	return createWebpackPlugin((pluginOptions) => createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
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
	return createWebpackPlugin((pluginOptions) => createRouterCodeSplitterPlugin(withWebpackHmrStyle(pluginOptions), pluginContext))(options);
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
var TanStackRouterWebpack = /* @__PURE__ */ createWebpackPlugin((options, meta) => unpluginRouterComposedFactory(withWebpackHmrStyle(options), meta));
var tanstackRouter = TanStackRouterWebpack;
//#endregion
export { TanStackRouterCodeSplitterWebpack, TanStackRouterGeneratorWebpack, TanStackRouterWebpack, TanStackRouterWebpack as default, configSchema, tanstackRouter };

//# sourceMappingURL=webpack.js.map