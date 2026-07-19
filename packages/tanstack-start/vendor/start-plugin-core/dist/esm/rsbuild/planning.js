import { ENTRY_POINTS } from "../constants.js";
import { join } from "pathe";
import { createRequire } from "node:module";
import { mergeRsbuildConfig } from "@rsbuild/core";
//#region src/rsbuild/planning.ts
var require = createRequire(import.meta.url);
var RSBUILD_ENVIRONMENT_NAMES = {
	client: "client",
	server: "ssr"
};
/**
* Rspack layer names for the rsbuild RSC layered model.
* These match the canonical names from `rspack.experiments.rsc.Layers`.
*/
var RSBUILD_RSC_LAYERS = {
	/** React Server Components layer — uses `react-server` resolve condition */
	rsc: "react-server-components",
	/** Server-Side Rendering layer — standard Node resolve */
	ssr: "server-side-rendering"
};
var RSBUILD_CLIENT_ASSETS_DIR = "assets";
function createRsbuildResolvedEntryAliases(opts) {
	const client = normalizeEntryPath(opts.entryPaths.client);
	const server = normalizeEntryPath(opts.entryPaths.server);
	const start = normalizeEntryPath(opts.entryPaths.start);
	const router = normalizeEntryPath(opts.entryPaths.router);
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
function createRsbuildEnvironmentPlan(opts) {
	const alias = {
		...opts.entryAliases.alias,
		...opts.rsc ? { "react-server-dom-rspack/server$": resolveFromRoot("react-server-dom-rspack/server.node", opts.root) } : {}
	};
	const environmentOverrides = opts.environmentOverrides ?? {};
	const clientOutputModule = (opts.scriptFormat ?? "module") === "module";
	const userClientOutputModule = environmentOverrides.client?.output?.module ?? environmentOverrides.all?.output?.module;
	if (typeof userClientOutputModule === "boolean" && userClientOutputModule !== clientOutputModule) throw new Error("TanStack Start rsbuild.client.output controls environments.client.output.module. Remove environments.client.output.module or set rsbuild.client.output to match it.");
	return {
		environments: {
			[RSBUILD_ENVIRONMENT_NAMES.client]: mergeRsbuildConfig({
				source: { entry: { index: {
					import: opts.entryAliases.client,
					html: false
				} } },
				output: {
					target: "web",
					module: clientOutputModule,
					distPath: {
						root: opts.clientOutputDirectory,
						js: `${RSBUILD_CLIENT_ASSETS_DIR}/js`,
						jsAsync: `${RSBUILD_CLIENT_ASSETS_DIR}/js/async`,
						css: `${RSBUILD_CLIENT_ASSETS_DIR}/css`,
						cssAsync: `${RSBUILD_CLIENT_ASSETS_DIR}/css/async`,
						svg: `${RSBUILD_CLIENT_ASSETS_DIR}/svg`,
						font: `${RSBUILD_CLIENT_ASSETS_DIR}/font`,
						wasm: `${RSBUILD_CLIENT_ASSETS_DIR}/wasm`,
						image: `${RSBUILD_CLIENT_ASSETS_DIR}/image`,
						media: `${RSBUILD_CLIENT_ASSETS_DIR}/media`,
						assets: `${RSBUILD_CLIENT_ASSETS_DIR}/assets`
					},
					assetPrefix: opts.publicBase
				},
				resolve: { alias },
				performance: { chunkSplit: {
					strategy: "custom",
					override: { chunks: "async" }
				} }
			}, environmentOverrides.all, environmentOverrides.client),
			[RSBUILD_ENVIRONMENT_NAMES.server]: mergeRsbuildConfig({
				source: { entry: { index: {
					import: opts.entryAliases.server,
					html: false,
					...opts.rsc ? { layer: RSBUILD_RSC_LAYERS.ssr } : {}
				} } },
				output: {
					target: "node",
					...opts.dev ? { module: false } : {},
					distPath: { root: opts.serverOutputDirectory }
				},
				resolve: { alias },
				...opts.rsc ? { splitChunks: { preset: "single-vendor" } } : {}
			}, environmentOverrides.all, environmentOverrides.server),
			...opts.serverFnProviderEnv !== RSBUILD_ENVIRONMENT_NAMES.server && !opts.rsc ? { [opts.serverFnProviderEnv]: mergeRsbuildConfig({
				source: { entry: { index: {
					import: opts.entryAliases.server,
					html: false
				} } },
				output: {
					target: "node",
					...opts.dev ? { module: false } : {},
					distPath: { root: `${opts.serverOutputDirectory}/${opts.serverFnProviderEnv}` }
				},
				resolve: { alias }
			}, environmentOverrides.all, environmentOverrides.provider) } : {}
		},
		alias
	};
}
function resolveRsbuildOutputDirectory(opts) {
	if (typeof opts.distPath === "string") return opts.distPath;
	if (typeof opts.distPath?.root === "string") return opts.distPath.root;
	if (typeof opts.rootDistPath === "string") return join(opts.rootDistPath, opts.subdirectory);
	if (typeof opts.rootDistPath?.root === "string") return join(opts.rootDistPath.root, opts.subdirectory);
	return opts.fallback;
}
function normalizeEntryPath(path) {
	return path.includes("\\") ? path.replaceAll("\\", "/") : path;
}
function resolveFromRoot(specifier, root) {
	return require.resolve(specifier, { paths: [root] });
}
//#endregion
export { RSBUILD_CLIENT_ASSETS_DIR, RSBUILD_ENVIRONMENT_NAMES, RSBUILD_RSC_LAYERS, createRsbuildEnvironmentPlan, createRsbuildResolvedEntryAliases, resolveRsbuildOutputDirectory };

//# sourceMappingURL=planning.js.map