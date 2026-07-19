import { configSchema } from "./core/config.js";
import { createRouterPluginContext } from "./core/router-plugin-context.js";
import { createRouterCodeSplitterPlugin } from "./core/router-code-splitter-plugin.js";
import { createRouterGeneratorPlugin } from "./core/router-generator-plugin.js";
import { unpluginRouterComposedFactory } from "./core/router-composed-plugin.js";
import { createEsbuildPlugin } from "unplugin";
//#region src/esbuild.ts
var defaultRouterPluginContext = createRouterPluginContext();
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
	return createEsbuildPlugin((pluginOptions) => createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
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
	return createEsbuildPlugin((pluginOptions) => createRouterCodeSplitterPlugin(pluginOptions, pluginContext))(options);
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
var TanStackRouterEsbuild = createEsbuildPlugin(unpluginRouterComposedFactory);
var tanstackRouter = TanStackRouterEsbuild;
//#endregion
export { TanStackRouterCodeSplitterEsbuild, TanStackRouterEsbuild, TanStackRouterEsbuild as default, TanStackRouterGeneratorEsbuild, configSchema, tanstackRouter };

//# sourceMappingURL=esbuild.js.map