import { routesManifestPlugin } from "../start-router-plugin/generator-plugins/routes-manifest-plugin.js";
import { prerenderRoutesPlugin } from "../start-router-plugin/generator-plugins/prerender-routes-plugin.js";
import { composeGeneratorPlugins } from "../start-router-plugin/generator-plugins/compose-generator-plugins.js";
import { buildRouteTreeFileFooterFromConfig } from "../start-router-plugin/route-tree-footer.js";
import { RSBUILD_ENVIRONMENT_NAMES } from "./planning.js";
import path from "pathe";
import { createRouterPluginContext } from "@tanstack/router-plugin/context";
import { TanStackRouterCodeSplitterRspack, TanStackRouterGeneratorRspack } from "@tanstack/router-plugin/rspack";
//#region src/rsbuild/start-router-plugin.ts
/**
* Registers the TanStack Router generator and code-splitter plugins
* as rspack plugins via `modifyRspackConfig`.
*
* The router-plugin package exports rspack-compatible unplugin wrappers:
* - TanStackRouterGeneratorRspack: file-based route generation
* - TanStackRouterCodeSplitterRspack: route code splitting
*/
function registerRouterPlugins(api, opts) {
	const routerPluginContext = createRouterPluginContext();
	api.modifyRspackConfig((config, utils) => {
		const envName = utils.environment.name;
		const { startConfig } = opts.getConfig();
		const routerConfig = startConfig.router;
		if (envName === RSBUILD_ENVIRONMENT_NAMES.client) {
			const generatorPlugin = TanStackRouterGeneratorRspack({
				...routerConfig,
				target: opts.corePluginOpts.framework,
				routeTreeFileFooter: () => {
					return buildRouteTreeFileFooterFromConfig({
						generatedRouteTreePath: path.resolve(routerConfig.generatedRouteTree),
						getConfig: opts.getConfig,
						corePluginOpts: opts.corePluginOpts
					});
				},
				plugins: composeGeneratorPlugins({
					frameworkPlugins: opts.corePluginOpts.routerGeneratorPlugins,
					userPlugins: routerConfig.plugins,
					builtInPlugins: [routesManifestPlugin(), ...opts.startPluginOpts.prerender?.enabled === true ? [prerenderRoutesPlugin()] : []]
				})
			}, routerPluginContext);
			utils.appendPlugins(generatorPlugin);
		}
		if (envName === RSBUILD_ENVIRONMENT_NAMES.client || envName === RSBUILD_ENVIRONMENT_NAMES.server) {
			const isClient = envName === RSBUILD_ENVIRONMENT_NAMES.client;
			const splitterPlugin = TanStackRouterCodeSplitterRspack({
				...routerConfig,
				target: opts.corePluginOpts.framework,
				codeSplittingOptions: {
					...routerConfig.codeSplittingOptions,
					deleteNodes: isClient ? [
						"ssr",
						"server",
						"headers"
					] : void 0,
					addHmr: isClient
				}
			}, routerPluginContext);
			utils.appendPlugins(splitterPlugin);
		}
	});
}
//#endregion
export { registerRouterPlugins };

//# sourceMappingURL=start-router-plugin.js.map