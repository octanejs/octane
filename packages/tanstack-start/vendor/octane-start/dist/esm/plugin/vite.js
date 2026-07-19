import { octaneStartDefaultEntryPaths } from "./shared.js";
import { validateOctaneCompilerOptions } from "./validate-options.js";
import { START_ENVIRONMENT_NAMES, tanStackStartVite } from "@tanstack/start-plugin-core/vite";
import { octaneRouteGeneratorPlugin } from "@tanstack/octane-router/generator-plugin";
import { octane } from "octane/compiler/vite";
//#region src/plugin/vite.ts
function tanstackStart(options) {
	const { octane: octaneOptions, ...startOptions } = options ?? {};
	validateOctaneCompilerOptions(octaneOptions);
	const corePluginOptions = {
		framework: "octane",
		defaultEntryPaths: octaneStartDefaultEntryPaths,
		providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
		ssrIsProvider: true,
		ssrResolverStrategy: { type: "default" },
		routerGeneratorPlugins: [octaneRouteGeneratorPlugin()]
	};
	return [
		octane(octaneOptions),
		{
			name: "tanstack-octane-start:config",
			configEnvironment(environmentName, options) {
				return { optimizeDeps: environmentName === START_ENVIRONMENT_NAMES.client || environmentName === START_ENVIRONMENT_NAMES.server && options.optimizeDeps?.noDiscovery === false ? { exclude: [
					"@tanstack/octane-start",
					"@tanstack/octane-router",
					"@tanstack/start-static-server-functions",
					"octane"
				] } : void 0 };
			}
		},
		tanStackStartVite(corePluginOptions, startOptions)
	];
}
//#endregion
export { tanstackStart };

//# sourceMappingURL=vite.js.map