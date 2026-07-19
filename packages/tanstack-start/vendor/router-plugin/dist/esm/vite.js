import { configSchema, getConfig } from "./core/config.js";
import { createRouterPluginContext } from "./core/router-plugin-context.js";
import { createRouterCodeSplitterPlugin } from "./core/router-code-splitter-plugin.js";
import { createRouterGeneratorPlugin } from "./core/router-generator-plugin.js";
import { unpluginRouterComposedFactory } from "./core/router-composed-plugin.js";
import { createVitePlugin } from "unplugin";
//#region src/vite.ts
var defaultRouterPluginContext = createRouterPluginContext();
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
	return createVitePlugin((pluginOptions) => createRouterGeneratorPlugin(pluginOptions, pluginContext))(options);
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
	return createVitePlugin((pluginOptions) => createRouterCodeSplitterPlugin(pluginOptions, pluginContext))(options);
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
var tanstackRouter = createVitePlugin(unpluginRouterComposedFactory);
/**
* @deprecated Use `tanstackRouter` instead.
*/
var TanStackRouterVite = tanstackRouter;
//#endregion
export { TanStackRouterVite, configSchema, tanstackRouter as default, tanstackRouter, getConfig, tanStackRouterCodeSplitter, tanstackRouterGenerator };

//# sourceMappingURL=vite.js.map