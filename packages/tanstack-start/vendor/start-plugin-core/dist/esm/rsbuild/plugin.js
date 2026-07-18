import { escapeRegExp, normalizePath } from "../utils.js";
import { createServerFnBasePath, normalizePublicBase } from "../planning.js";
import { applyResolvedBaseAndOutput, applyResolvedRouterBasepath, createStartConfigContext } from "../config-context.js";
import { RSBUILD_CLIENT_ASSETS_DIR, RSBUILD_ENVIRONMENT_NAMES, RSBUILD_RSC_LAYERS, createRsbuildEnvironmentPlan, createRsbuildResolvedEntryAliases, resolveRsbuildOutputDirectory } from "./planning.js";
import { parseStartConfig, rsbuildClientOutputSchema } from "./schema.js";
import { registerStartCompilerTransforms } from "./start-compiler-host.js";
import { registerImportProtection } from "./import-protection.js";
import { START_MANIFEST_PLACEHOLDER, registerVirtualModules } from "./virtual-modules.js";
import { createServerSetup } from "./server-middleware.js";
import { registerClientBuildCapture } from "./normalized-client-build.js";
import { registerRouterPlugins } from "./start-router-plugin.js";
import { postBuildWithRsbuild } from "./post-build.js";
import { enableSwcReactServerComponents } from "./swc-rsc.js";
import { dirname, join, resolve } from "node:path";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { joinURL } from "ufo";
//#region src/rsbuild/plugin.ts
var currentDir = dirname(fileURLToPath(import.meta.url));
var isInsideRouterMonoRepo = (() => {
	const candidate = resolve(currentDir, "../../../../");
	return candidate.endsWith("/packages") || candidate.endsWith("\\packages");
})();
function tanStackStartRsbuild(corePluginOpts, startPluginOpts = {}) {
	const rscOpts = corePluginOpts.rsc;
	const rscEnabled = Boolean(rscOpts);
	const configContext = createStartConfigContext({
		corePluginOpts,
		startPluginOpts,
		parseConfig: parseStartConfig
	});
	const { getConfig, resolvedStartConfig } = configContext;
	const serverFnProviderEnv = corePluginOpts.providerEnvironmentName;
	const ssrIsProvider = corePluginOpts.ssrIsProvider;
	const scriptFormat = rsbuildClientOutputSchema.parse(startPluginOpts.rsbuild?.client?.output ?? "module");
	let rscPlugins;
	let devServerRef = null;
	const serverFnsById = {};
	let updateServerFnResolver;
	return {
		name: "tanstack-start-rsbuild",
		setup(api) {
			const startCompilerEnvironments = [
				{
					name: RSBUILD_ENVIRONMENT_NAMES.client,
					type: "client"
				},
				{
					name: RSBUILD_ENVIRONMENT_NAMES.server,
					type: "server"
				},
				...serverFnProviderEnv !== RSBUILD_ENVIRONMENT_NAMES.server && !rscEnabled ? [{
					name: serverFnProviderEnv,
					type: "server"
				}] : []
			];
			const startCompilerServerEnvironmentNames = startCompilerEnvironments.filter((env) => env.type === "server").map((env) => env.name);
			api.modifyRsbuildConfig((rsbuildConfig, { mergeRsbuildConfig }) => {
				const root = typeof rsbuildConfig.root === "string" ? rsbuildConfig.root : process.cwd();
				const serverBase = rsbuildConfig.server?.base;
				const assetPrefix = rsbuildConfig.output?.assetPrefix;
				const publicBase = normalizePublicBase(typeof serverBase === "string" ? serverBase : typeof assetPrefix === "string" && assetPrefix !== "auto" ? assetPrefix : void 0);
				const rootDistPath = rsbuildConfig.output?.distPath;
				const clientDistPath = rsbuildConfig.environments?.[RSBUILD_ENVIRONMENT_NAMES.client]?.output?.distPath;
				const serverDistPath = rsbuildConfig.environments?.[RSBUILD_ENVIRONMENT_NAMES.server]?.output?.distPath;
				applyResolvedBaseAndOutput({
					resolvedStartConfig,
					root,
					publicBase,
					clientOutputDirectory: resolveRsbuildOutputDirectory({
						distPath: clientDistPath,
						rootDistPath,
						fallback: "dist/client",
						subdirectory: "client"
					}),
					serverOutputDirectory: resolveRsbuildOutputDirectory({
						distPath: serverDistPath,
						rootDistPath,
						fallback: "dist/server",
						subdirectory: "server"
					})
				});
				const { startConfig } = getConfig();
				const routerBasepath = applyResolvedRouterBasepath({
					resolvedStartConfig,
					startConfig
				});
				const resolvedEntryPlan = configContext.resolveEntries();
				const isDev = api.context.action === "dev";
				const isPreview = api.context.action === "preview";
				const environmentPlan = createRsbuildEnvironmentPlan({
					root,
					entryAliases: createRsbuildResolvedEntryAliases({ entryPaths: resolvedEntryPlan.entryPaths }),
					clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
					serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
					publicBase: resolvedStartConfig.basePaths.publicBase,
					serverFnProviderEnv,
					environmentOverrides: corePluginOpts.rsbuild?.environments,
					scriptFormat,
					rsc: rscOpts,
					dev: isDev
				});
				const serverFnBase = createServerFnBasePath({
					routerBasepath,
					serverFnBase: startConfig.serverFns.base
				});
				const inlineCssEnabled = !isDev && startConfig.server.build.inlineCss.enabled;
				return mergeRsbuildConfig(rsbuildConfig, {
					source: {
						...rscEnabled ? { include: [{ not: /[\\/]core-js[\\/]/ }] } : {},
						define: {
							"process.env.TSS_SERVER_FN_BASE": JSON.stringify(serverFnBase),
							"import.meta.env.TSS_SERVER_FN_BASE": JSON.stringify(serverFnBase),
							"process.env.TSS_ROUTER_BASEPATH": JSON.stringify(routerBasepath),
							"import.meta.env.TSS_ROUTER_BASEPATH": JSON.stringify(routerBasepath),
							"process.env.TSS_DEV_SERVER": JSON.stringify(isDev ? "true" : "false"),
							"import.meta.env.TSS_DEV_SERVER": JSON.stringify(isDev ? "true" : "false"),
							"process.env.TSS_DEV_SSR_STYLES_ENABLED": JSON.stringify("false"),
							"import.meta.env.TSS_DEV_SSR_STYLES_ENABLED": JSON.stringify("false"),
							"process.env.TSS_DEV_SSR_STYLES_BASEPATH": JSON.stringify(resolvedStartConfig.basePaths.publicBase),
							"import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH": JSON.stringify(resolvedStartConfig.basePaths.publicBase),
							"process.env.TSS_INLINE_CSS_ENABLED": JSON.stringify(inlineCssEnabled ? "true" : "false"),
							"import.meta.env.TSS_INLINE_CSS_ENABLED": JSON.stringify(inlineCssEnabled ? "true" : "false"),
							"process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": JSON.stringify(startConfig.serverFns.disableCsrfMiddlewareWarning ? "true" : "false"),
							"import.meta.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": JSON.stringify(startConfig.serverFns.disableCsrfMiddlewareWarning ? "true" : "false")
						}
					},
					server: {
						...rsbuildConfig.server?.printUrls === void 0 || rsbuildConfig.server.printUrls === true ? { printUrls: ({ urls }) => urls } : {},
						compress: false,
						htmlFallback: false,
						...isPreview || isDev && startPluginOpts.rsbuild?.installDevServerMiddleware !== false ? { setup: createServerSetup({
							serverFnBasePath: serverFnBase,
							serverOutputDirectory: resolvedStartConfig.outputDirectories.server,
							publicBase: resolvedStartConfig.basePaths.publicBase
						}) } : {}
					},
					...isDev ? { dev: {
						lazyCompilation: false,
						...rscEnabled ? { liveReload: false } : {}
					} } : {},
					environments: environmentPlan.environments,
					resolve: { alias: environmentPlan.alias }
				});
			});
			registerStartCompilerTransforms(api, {
				framework: corePluginOpts.framework,
				root: () => resolvedStartConfig.root || process.cwd(),
				environments: startCompilerEnvironments,
				providerEnvName: serverFnProviderEnv,
				generateFunctionId: startPluginOpts.serverFns?.generateFunctionId,
				compilerTransforms: corePluginOpts.compilerTransforms,
				serverFnProviderModuleDirectives: corePluginOpts.serverFnProviderModuleDirectives,
				serverFnsById,
				onServerFnsByIdChange: () => {
					updateServerFnResolver?.();
				}
			});
			registerImportProtection(api, {
				getConfig,
				framework: corePluginOpts.framework,
				environments: startCompilerEnvironments
			});
			const virtualModuleState = registerVirtualModules(api, {
				root: resolvedStartConfig.root || process.cwd(),
				getConfig,
				serverFnsById,
				providerEnvName: serverFnProviderEnv,
				ssrIsProvider,
				serializationAdapters: corePluginOpts.serializationAdapters,
				getDevClientEntryUrl: (publicBase) => joinURL(publicBase, RSBUILD_CLIENT_ASSETS_DIR, "js/index.js"),
				rscEnabled,
				scriptFormat
			});
			updateServerFnResolver = virtualModuleState.updateServerFnResolver;
			if (!rscEnabled) api.modifyRspackConfig((config, utils) => {
				if (!startCompilerServerEnvironmentNames.includes(utils.environment.name)) return;
				config.plugins.push({ apply(compiler) {
					compiler.hooks.finishMake.tapPromise({
						name: "TanStackStartServerFnResolverRebuild",
						stage: -10
					}, async (compilation) => {
						virtualModuleState.updateServerFnResolver();
						await rebuildModulesContaining(compilation, virtualModuleState.serverFnResolverPath);
					});
				} });
			});
			const { getClientBuild } = registerClientBuildCapture(api);
			if (api.context.action !== "dev") {
				const normalizedManifestPath = normalizePath(virtualModuleState.manifestPath);
				const matchesManifestPath = (id) => normalizePath(id) === normalizedManifestPath;
				api.transform({
					test: (id) => matchesManifestPath(id),
					environments: [RSBUILD_ENVIRONMENT_NAMES.server]
				}, ({ code }) => {
					const clientBuild = getClientBuild();
					if (clientBuild) return virtualModuleState.generateManifestContent(clientBuild);
					if (!rscEnabled) throw new Error("TanStack Start could not generate the rsbuild server manifest before the client build completed");
					return code;
				});
			}
			registerRouterPlugins(api, {
				getConfig,
				corePluginOpts,
				startPluginOpts
			});
			if (isInsideRouterMonoRepo && api.context.action === "dev") api.modifyRspackConfig((config) => {
				const workspaceDistRealpaths = resolveWorkspacePackageDistRealpaths();
				if (workspaceDistRealpaths.length === 0) return;
				const workspaceDistIgnored = new RegExp(workspaceDistRealpaths.map((path) => `^${escapeRegExp(path)}(?:[\\\\/]|$)`).join("|"));
				const ignored = config.watchOptions?.ignored;
				config.watchOptions = {
					...config.watchOptions ?? {},
					ignored: ignored == null ? new RegExp(`${defaultRspackWatchIgnored.source}|${workspaceDistIgnored.source}`) : typeof ignored === "string" ? [ignored, ...workspaceDistRealpaths] : Array.isArray(ignored) ? [...ignored, ...workspaceDistRealpaths] : new RegExp(`${ignored.source}|${workspaceDistIgnored.source}`)
				};
			});
			if (rscEnabled) {
				api.modifyRspackConfig((config, utils) => {
					const envName = utils.environment.name;
					const isServerEnv = envName === RSBUILD_ENVIRONMENT_NAMES.server;
					const isClientEnv = envName === RSBUILD_ENVIRONMENT_NAMES.client;
					if (!rscPlugins) rscPlugins = utils.rspack.experiments.rsc.createPlugins();
					if (isServerEnv) {
						const moduleRules = config.module.rules ??= [];
						const root = resolvedStartConfig.root || process.cwd();
						moduleRules.push({
							resourceQuery: /(?:^|[?&])tss-serverfn-split(?:&|$)/,
							layer: RSBUILD_RSC_LAYERS.rsc,
							resolve: { conditionNames: ["react-server", "..."] }
						});
						moduleRules.push({
							issuerLayer: RSBUILD_RSC_LAYERS.rsc,
							resourceQuery: { not: [/(?:^|[?&])tsr-split(?:=|&|$)/] },
							resolve: { conditionNames: ["react-server", "..."] }
						});
						seedResolveModules(config, [`${root}/node_modules`, "node_modules"]);
						config.plugins.push(new rscPlugins.ServerPlugin({
							cssLink: {
								precedence: false,
								props: { "data-rsc-css-href": "" }
							},
							onServerComponentChanges: () => {
								devServerRef?.sockWrite("custom", { event: "rsc:update" });
							}
						}));
						config.plugins.push({ apply(compiler) {
							compiler.hooks.finishMake.tapPromise({
								name: "TanStackStartRscServerFnResolverRebuild",
								stage: -10
							}, async (compilation) => {
								const resolverContent = virtualModuleState.generateCurrentResolverContent(true);
								virtualModuleState.tryUpdateServerFnResolver(resolverContent);
								await rebuildModulesContaining(compilation, virtualModuleState.serverFnResolverPath);
							});
						} });
						if (api.context.action !== "dev") config.plugins.push({ apply(compiler) {
							compiler.hooks.finishMake.tapPromise({
								name: "TanStackStartRscManifestRebuild",
								stage: 10
							}, async (compilation) => {
								const clientBuild = getClientBuild();
								if (!clientBuild) return;
								virtualModuleState.updateManifest(clientBuild);
								await rebuildModulesContaining(compilation, virtualModuleState.manifestPath);
							});
						} });
					}
					if (isClientEnv) config.plugins.push(new rscPlugins.ClientPlugin());
					if (isServerEnv) enableSwcReactServerComponents(config, "rsc-subtree");
					else if (isClientEnv) enableSwcReactServerComponents(config, "all");
				});
				if (api.context.action === "dev") api.onBeforeStartDevServer(({ server }) => {
					devServerRef = server;
				});
			}
			if (!rscEnabled) api.onAfterCreateCompiler(({ compiler }) => {
				if ("compilers" in compiler) for (const environmentName of startCompilerServerEnvironmentNames) {
					const serverCompiler = compiler.compilers.find((c) => c.name === environmentName);
					if (serverCompiler) {
						const dependencies = [RSBUILD_ENVIRONMENT_NAMES.client];
						if (environmentName === RSBUILD_ENVIRONMENT_NAMES.server && serverFnProviderEnv !== RSBUILD_ENVIRONMENT_NAMES.server) dependencies.push(serverFnProviderEnv);
						compiler.setDependencies(serverCompiler, dependencies);
					}
				}
			});
			if (api.context.action !== "dev" && rscEnabled) {
				const manifestPlaceholderLiteral = JSON.stringify(START_MANIFEST_PLACEHOLDER);
				api.modifyRspackConfig((config, utils) => {
					if (utils.environment.name !== RSBUILD_ENVIRONMENT_NAMES.server) return;
					config.plugins.push({ apply(compiler) {
						compiler.hooks.compilation.tap("TanStackStartManifestReplace", (compilation) => {
							compilation.hooks.processAssets.tap({
								name: "TanStackStartManifestReplace",
								stage: utils.rspack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE
							}, () => {
								let assetsWithPlaceholder;
								for (const asset of compilation.getAssets()) {
									if (!asset.name.endsWith(".js")) continue;
									const sourceStr = String(asset.source.source());
									if (!sourceStr.includes(manifestPlaceholderLiteral)) continue;
									if (!assetsWithPlaceholder) assetsWithPlaceholder = [];
									assetsWithPlaceholder.push({
										asset,
										sourceStr
									});
								}
								if (!assetsWithPlaceholder) return;
								const clientBuild = getClientBuild();
								if (!clientBuild) throw new Error("TanStack Start could not replace the rsbuild RSC server manifest placeholder because the client build was unavailable");
								const manifestValueLiteral = virtualModuleState.generateManifestValueLiteral(clientBuild);
								for (const { asset, sourceStr } of assetsWithPlaceholder) compilation.updateAsset(asset.name, new utils.rspack.sources.RawSource(sourceStr.replace(manifestPlaceholderLiteral, manifestValueLiteral)));
							});
						});
					} });
				});
			}
			api.onAfterEnvironmentCompile(({ environment }) => {
				if (environment.name !== RSBUILD_ENVIRONMENT_NAMES.client) return;
				virtualModuleState.updateServerFnResolver();
				const clientBuild = getClientBuild();
				if (clientBuild) virtualModuleState.updateManifest(clientBuild);
			});
			if (api.context.action === "build") api.onAfterBuild(async () => {
				const { startConfig } = getConfig();
				await postBuildWithRsbuild({
					startConfig,
					clientOutputDirectory: resolvedStartConfig.outputDirectories.client,
					serverOutputDirectory: resolvedStartConfig.outputDirectories.server
				});
			});
		}
	};
}
var defaultRspackWatchIgnored = /[\\/](?:\.git|node_modules)[\\/]/;
function seedResolveModules(config, entries) {
	const resolveModules = config.resolve.modules ??= [];
	for (const entry of entries) if (!resolveModules.includes(entry)) resolveModules.push(entry);
}
function rebuildModulesContaining(compilation, identifierFragment) {
	const rebuilds = [];
	for (const mod of compilation.modules) {
		if (!mod.identifier().includes(identifierFragment)) continue;
		rebuilds.push(new Promise((resolve, reject) => {
			compilation.rebuildModule(mod, (err) => {
				if (err) reject(err);
				else resolve();
			});
		}));
	}
	return rebuilds.length === 0 ? Promise.resolve() : Promise.all(rebuilds).then(() => void 0);
}
/**
* Return the realpath of every packages/<name>/dist directory in the
* TanStack Router monorepo. Only meaningful when called from inside the
* monorepo — in user apps, callers should guard with
* `isInsideRouterMonoRepo` before invoking this.
*/
function resolveWorkspacePackageDistRealpaths() {
	const packagesDir = resolve(currentDir, "../../../../");
	if (!existsSync(packagesDir)) return [];
	let entries;
	try {
		entries = readdirSync(packagesDir);
	} catch {
		return [];
	}
	const dists = [];
	for (const entry of entries) {
		const distPath = join(packagesDir, entry, "dist");
		try {
			if (!statSync(distPath).isDirectory()) continue;
		} catch {
			continue;
		}
		try {
			dists.push(realpathSync(distPath));
		} catch {
			dists.push(distPath);
		}
	}
	return dists;
}
//#endregion
export { tanStackStartRsbuild };

//# sourceMappingURL=plugin.js.map