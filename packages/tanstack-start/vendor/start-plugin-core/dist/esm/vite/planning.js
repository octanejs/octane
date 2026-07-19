import { DEV_CLIENT_ENTRY, ENTRY_POINTS, START_ENVIRONMENT_NAMES } from "../constants.js";
import { getBundlerOptions } from "../utils.js";
import { join } from "pathe";
import { normalizePath } from "vite";
import { escapePath } from "tinyglobby";
//#region src/vite/planning.ts
function createViteResolvedEntryAliases(opts) {
	const client = normalizePath(opts.entryPaths.client);
	const server = normalizePath(opts.entryPaths.server);
	const start = normalizePath(opts.entryPaths.start);
	const router = normalizePath(opts.entryPaths.router);
	return {
		client,
		server,
		start,
		router,
		alias: {
			[ENTRY_POINTS.client]: client,
			[ENTRY_POINTS.server]: server,
			[ENTRY_POINTS.start]: start,
			[ENTRY_POINTS.router]: router
		}
	};
}
function createViteConfigPlan(opts) {
	return {
		environments: {
			[START_ENVIRONMENT_NAMES.client]: {
				consumer: "client",
				build: (() => {
					const bundlerOptions = { input: { index: opts.command === "serve" ? DEV_CLIENT_ENTRY : ENTRY_POINTS.client } };
					return {
						rollupOptions: bundlerOptions,
						rolldownOptions: bundlerOptions,
						outDir: opts.clientOutputDirectory
					};
				})(),
				optimizeDeps: {
					exclude: opts.optimizeDepsExclude,
					entries: escapeEntries([opts.entryAliases.client, opts.entryAliases.router])
				}
			},
			[START_ENVIRONMENT_NAMES.server]: {
				consumer: "server",
				build: {
					ssr: true,
					...(() => {
						const bundlerOptions = { input: getBundlerOptions(opts.viteConfig.environments?.[START_ENVIRONMENT_NAMES.server]?.build)?.input ?? opts.entryAliases.server };
						return {
							rollupOptions: bundlerOptions,
							rolldownOptions: bundlerOptions
						};
					})(),
					outDir: opts.serverOutputDirectory,
					commonjsOptions: { include: [/node_modules/] },
					copyPublicDir: opts.viteConfig.environments?.[START_ENVIRONMENT_NAMES.server]?.build?.copyPublicDir ?? false
				},
				optimizeDeps: { entries: escapeEntries([
					opts.entryAliases.server,
					opts.entryAliases.start,
					opts.entryAliases.router
				]) }
			},
			...opts.serverFnProviderEnv !== START_ENVIRONMENT_NAMES.server && { [opts.serverFnProviderEnv]: {
				build: { outDir: join(opts.serverOutputDirectory, opts.serverFnProviderEnv) },
				optimizeDeps: { entries: escapeEntries([opts.entryAliases.router]) }
			} }
		},
		resolve: {
			noExternal: [
				"@tanstack/start**",
				`@tanstack/${opts.framework}-start**`,
				...opts.noExternal
			],
			alias: { ...opts.entryAliases.alias }
		}
	};
}
function createViteDefineConfig(opts) {
	return {
		...defineReplaceEnv("TSS_SERVER_FN_BASE", opts.serverFnBase),
		...defineReplaceEnv("TSS_ROUTER_BASEPATH", opts.routerBasepath),
		...opts.command === "serve" ? defineReplaceEnv("TSS_SHELL", opts.spaEnabled ? "true" : "false") : {},
		...defineReplaceEnv("TSS_DEV_SERVER", opts.command === "serve" ? "true" : "false"),
		...defineReplaceEnv("TSS_DEV_SSR_STYLES_ENABLED", opts.devSsrStylesEnabled ? "true" : "false"),
		...defineReplaceEnv("TSS_DEV_SSR_STYLES_BASEPATH", opts.devSsrStylesBasepath),
		...defineReplaceEnv("TSS_INLINE_CSS_ENABLED", opts.inlineCssEnabled ? "true" : "false"),
		...defineReplaceEnv("TSS_DISABLE_CSRF_MIDDLEWARE_WARNING", opts.disableCsrfMiddlewareWarning ? "true" : "false"),
		...opts.command === "build" && opts.staticNodeEnv ? { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || opts.mode || "production") } : {}
	};
}
async function buildStartViteEnvironments(opts) {
	const client = getRequiredBuilderEnvironment(opts.builder, START_ENVIRONMENT_NAMES.client, "Client environment not found");
	const server = getRequiredBuilderEnvironment(opts.builder, START_ENVIRONMENT_NAMES.server, "SSR environment not found");
	if (!client.isBuilt) await opts.builder.build(client);
	if (!server.isBuilt) await opts.builder.build(server);
	if (opts.ssrIsProvider) return;
	const providerEnv = getRequiredBuilderEnvironment(opts.builder, opts.providerEnvironmentName, `Provider environment "${opts.providerEnvironmentName}" not found`);
	if (!providerEnv.isBuilt) await opts.builder.build(providerEnv);
}
function escapeEntries(entries) {
	return entries.map((entry) => escapePath(entry));
}
function defineReplaceEnv(key, value) {
	return {
		[`process.env.${key}`]: JSON.stringify(value),
		[`import.meta.env.${key}`]: JSON.stringify(value)
	};
}
function getRequiredBuilderEnvironment(builder, environmentName, errorMessage) {
	const environment = builder.environments[environmentName];
	if (!environment) throw new Error(errorMessage);
	return environment;
}
//#endregion
export { buildStartViteEnvironments, createViteConfigPlan, createViteDefineConfig, createViteResolvedEntryAliases };

//# sourceMappingURL=planning.js.map