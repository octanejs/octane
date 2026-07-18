import { START_ENVIRONMENT_NAMES } from "../constants.js";
import { createServerFnBasePath, normalizePublicBase, shouldRewriteDevBasepath } from "../planning.js";
import { applyResolvedBaseAndOutput, applyResolvedRouterBasepath, createStartConfigContext } from "../config-context.js";
import { importProtectionPlugin } from "./import-protection-plugin/plugin.js";
import { startCompilerPlugin } from "./start-compiler-plugin/plugin.js";
import { loadEnvPlugin } from "./load-env-plugin/plugin.js";
import { buildStartViteEnvironments, createViteConfigPlan, createViteDefineConfig, createViteResolvedEntryAliases } from "./planning.js";
import { devServerPlugin } from "./dev-server-plugin/plugin.js";
import { getClientOutputDirectory, getServerOutputDirectory } from "./output-directory.js";
import { previewServerPlugin } from "./preview-server-plugin/plugin.js";
import { createDevBaseRewritePlugin, createDevClientEntryPlugin, createPostBuildPlugin } from "./plugins.js";
import { parseStartConfig } from "./schema.js";
import { startManifestPlugin } from "./start-manifest-plugin/plugin.js";
import { tanStackStartRouter } from "./start-router-plugin/plugin.js";
import { postServerBuild } from "./post-server-build.js";
import { serializationAdaptersPlugin } from "./serialization-adapters-plugin.js";
import { crawlFrameworkPkgs } from "vitefu";
//#region src/vite/plugin.ts
function tanStackStartVite(corePluginOpts, startPluginOpts) {
	const normalizedStartPluginOpts = startPluginOpts ?? {};
	const configContext = createStartConfigContext({
		corePluginOpts,
		startPluginOpts: normalizedStartPluginOpts,
		parseConfig: parseStartConfig
	});
	const { getConfig, resolvedStartConfig } = configContext;
	const serverFnProviderEnv = corePluginOpts.providerEnvironmentName;
	const ssrIsProvider = corePluginOpts.ssrIsProvider;
	let needsDevBaseRewrite = false;
	const environments = [{
		name: START_ENVIRONMENT_NAMES.client,
		type: "client"
	}, {
		name: START_ENVIRONMENT_NAMES.server,
		type: "server",
		getServerFnById: corePluginOpts.ssrResolverStrategy.type === "vite-rsc-forward" ? createViteRscForwarder(corePluginOpts.ssrResolverStrategy) : void 0
	}];
	if (serverFnProviderEnv !== START_ENVIRONMENT_NAMES.server && !environments.find((e) => e.name === serverFnProviderEnv)) environments.push({
		name: serverFnProviderEnv,
		type: "server"
	});
	return [
		{
			name: "tanstack-start-core:config",
			enforce: "pre",
			async config(viteConfig, { command }) {
				const publicBase = normalizePublicBase(viteConfig.base);
				applyResolvedBaseAndOutput({
					resolvedStartConfig,
					root: viteConfig.root || process.cwd(),
					publicBase,
					clientOutputDirectory: getClientOutputDirectory(viteConfig),
					serverOutputDirectory: getServerOutputDirectory(viteConfig)
				});
				const { startConfig } = getConfig();
				const routerBasepath = applyResolvedRouterBasepath({
					resolvedStartConfig,
					startConfig
				});
				if (shouldRewriteDevBasepath({
					command,
					middlewareMode: Boolean(viteConfig.server?.middlewareMode),
					routerBasepath,
					publicBase: resolvedStartConfig.basePaths.publicBase
				})) needsDevBaseRewrite = true;
				const TSS_SERVER_FN_BASE = createServerFnBasePath({
					routerBasepath,
					serverFnBase: startConfig.serverFns.base
				});
				const entryAliases = createViteResolvedEntryAliases({ entryPaths: configContext.resolveEntries().entryPaths });
				const startPackageName = `@tanstack/${corePluginOpts.framework}-start`;
				const crawlFrameworkPkgsResult = await crawlFrameworkPkgs({
					root: process.cwd(),
					isBuild: command === "build",
					isFrameworkPkgByJson(pkgJson) {
						const peerDependencies = pkgJson["peerDependencies"];
						if (peerDependencies) {
							if (startPackageName in peerDependencies || "@tanstack/start-client-core" in peerDependencies) return true;
						}
						return false;
					}
				});
				const viteConfigPlan = createViteConfigPlan({
					viteConfig,
					command,
					framework: corePluginOpts.framework,
					entryAliases,
					clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
					serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
					serverFnProviderEnv,
					optimizeDepsExclude: crawlFrameworkPkgsResult.optimizeDeps.exclude,
					noExternal: crawlFrameworkPkgsResult.ssr.noExternal.sort()
				});
				return {
					appType: viteConfig.appType ?? "custom",
					environments: viteConfigPlan.environments,
					resolve: viteConfigPlan.resolve,
					define: createViteDefineConfig({
						command,
						mode: viteConfig.mode,
						serverFnBase: TSS_SERVER_FN_BASE,
						routerBasepath,
						spaEnabled: startConfig.spa?.enabled,
						devSsrStylesEnabled: startConfig.dev.ssrStyles.enabled,
						devSsrStylesBasepath: startConfig.dev.ssrStyles.basepath ?? resolvedStartConfig.basePaths.publicBase,
						inlineCssEnabled: command === "build" && startConfig.server.build.inlineCss.enabled,
						staticNodeEnv: startConfig.server.build.staticNodeEnv,
						disableCsrfMiddlewareWarning: startConfig.serverFns.disableCsrfMiddlewareWarning
					}),
					builder: {
						sharedPlugins: true,
						async buildApp(builder) {
							await buildStartViteEnvironments({
								builder,
								providerEnvironmentName: serverFnProviderEnv,
								ssrIsProvider
							});
						}
					}
				};
			}
		},
		createPostBuildPlugin({
			getConfig,
			postServerBuild
		}),
		startCompilerPlugin({
			framework: corePluginOpts.framework,
			environments,
			generateFunctionId: normalizedStartPluginOpts.serverFns?.generateFunctionId,
			compilerTransforms: corePluginOpts.compilerTransforms,
			serverFnProviderModuleDirectives: corePluginOpts.serverFnProviderModuleDirectives,
			providerEnvName: serverFnProviderEnv
		}),
		importProtectionPlugin({
			getConfig,
			framework: corePluginOpts.framework,
			environments,
			providerEnvName: serverFnProviderEnv
		}),
		tanStackStartRouter(normalizedStartPluginOpts, getConfig, corePluginOpts),
		loadEnvPlugin(),
		createDevClientEntryPlugin({
			framework: corePluginOpts.framework,
			getClientEntry: () => configContext.resolveEntries().entryPaths.client
		}),
		startManifestPlugin({ getConfig }),
		createDevBaseRewritePlugin({
			shouldRewriteDevBase: () => needsDevBaseRewrite,
			resolvedStartConfig
		}),
		devServerPlugin({
			getConfig,
			devSsrStylesEnabled: normalizedStartPluginOpts.dev?.ssrStyles?.enabled ?? true,
			installDevServerMiddleware: normalizedStartPluginOpts.vite?.installDevServerMiddleware
		}),
		previewServerPlugin(),
		...corePluginOpts.serializationAdapters?.length ? [serializationAdaptersPlugin({ adapters: corePluginOpts.serializationAdapters })] : []
	];
}
function createViteRscForwarder(strategy) {
	return `export async function getServerFnById(id, access) {
  const m = await import.meta.viteRsc.loadModule(${JSON.stringify(strategy.sourceEnvironmentName)}, ${JSON.stringify(strategy.sourceEntry)})
  return m[${JSON.stringify(strategy.exportName)}](id, access)
}`;
}
//#endregion
export { tanStackStartVite };

//# sourceMappingURL=plugin.js.map