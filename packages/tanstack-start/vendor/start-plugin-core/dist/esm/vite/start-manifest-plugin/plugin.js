import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from "../../constants.js";
import { createVirtualModule } from "../createVirtualModule.js";
import { buildStartManifest, createManifestAssetResolvers, serializeStartManifest } from "../../start-manifest-plugin/manifestBuilder.js";
import { normalizeViteClientBuild } from "./normalized-client-build.js";
import { rootRouteId } from "@tanstack/router-core";
import { VIRTUAL_MODULES } from "@tanstack/start-server-core";
import { joinURL } from "ufo";
//#region src/vite/start-manifest-plugin/plugin.ts
function startManifestPlugin(opts) {
	let clientBuild;
	let cssCodeSplitDisabledFileName;
	return [{
		name: "tanstack-start:start-manifest-capture-client-build",
		applyToEnvironment(environment) {
			return environment.name === START_ENVIRONMENT_NAMES.client;
		},
		enforce: "post",
		generateBundle(_options, bundle) {
			if (this.environment.name !== START_ENVIRONMENT_NAMES.client) throw new Error(`Unexpected environment for client build capture: ${this.environment.name}`);
			clientBuild = normalizeViteClientBuild(bundle);
			cssCodeSplitDisabledFileName = getAssetFileNameByName(bundle, "style.css");
		}
	}, createVirtualModule({
		name: "tanstack-start:start-manifest-plugin",
		moduleId: VIRTUAL_MODULES.startManifest,
		enforce: "pre",
		load() {
			const { resolvedStartConfig, startConfig } = opts.getConfig();
			const clientEntry = getDevClientEntry({
				basePath: resolvedStartConfig.basePaths.publicBase,
				bundledDev: isClientBundledDev(this.environment)
			});
			if (this.environment.name !== START_ENVIRONMENT_NAMES.server) return getEmptyStartManifestModule(clientEntry);
			if (this.environment.config.command === "serve") return getEmptyStartManifestModule(clientEntry);
			const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST;
			if (!clientBuild) return getEmptyStartManifestModule(clientEntry);
			return `export const tsrStartManifest = () => (${serializeStartManifest(buildStartManifest({
				clientBuild,
				routeTreeRoutes,
				basePath: resolvedStartConfig.basePaths.publicBase,
				inlineCss: startConfig.server.build.inlineCss,
				additionalRouteAssets: getViteAdditionalRouteAssets({
					cssCodeSplitDisabledFileName,
					basePath: resolvedStartConfig.basePaths.publicBase,
					cssCodeSplit: this.environment.config.build.cssCodeSplit
				})
			}))})`;
		}
	})];
}
function getViteAdditionalRouteAssets(options) {
	if (options.cssCodeSplit !== false) return;
	if (!options.cssCodeSplitDisabledFileName) throw new Error("TanStack Start could not find Vite's generated `style.css` manifest entry while `build.cssCodeSplit` is disabled");
	const { getStylesheetLink } = createManifestAssetResolvers(options.basePath);
	return { [rootRouteId]: [getStylesheetLink(options.cssCodeSplitDisabledFileName)] };
}
function getAssetFileNameByName(bundle, assetName) {
	for (const fileName in bundle) {
		const bundleEntry = bundle[fileName];
		if (bundleEntry.type !== "asset") continue;
		if (bundleEntry.name === assetName) return fileName;
		if ("names" in bundleEntry && bundleEntry.names.includes(assetName)) return fileName;
	}
}
function getEmptyStartManifestModule(clientEntry) {
	return `export const tsrStartManifest = () => ({
      routes: {
        __root__: {
          preloads: ['${clientEntry}'],
          scripts: [{ attrs: { type: 'module', async: true, src: '${clientEntry}' } }],
        },
      },
    })`;
}
function getDevClientEntry(opts) {
	if (opts.bundledDev) return joinURL(opts.basePath, "assets", "index.js");
	return joinURL(opts.basePath, "@id", DEV_CLIENT_ENTRY);
}
function isClientBundledDev(environment) {
	return environment.config.command === "serve" && environment.config.environments?.[START_ENVIRONMENT_NAMES.client]?.isBundled === true;
}
//#endregion
export { startManifestPlugin };

//# sourceMappingURL=plugin.js.map