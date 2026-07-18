import { TRANSFORM_ID_REGEX } from "../constants.js";
import { cleanId } from "../start-compiler/utils.js";
import { detectKindsInCode } from "../start-compiler/compiler.js";
import { getTransformCodeFilterForEnv } from "../start-compiler/config.js";
import { createStartCompiler, loadCompilerVirtualModule, matchesCodeFilters, mergeServerFnsById } from "../start-compiler/host.js";
import { createHydrateCompilerPlugin } from "../hydrate-when-transform.js";
import { SERVER_FN_BUILD_INFO_CONTEXT_KEY, SERVER_FN_BUILD_INFO_FIELD } from "./start-compiler-metadata.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/rsbuild/start-compiler-host.ts
var serverFnSchema = z.object({
	functionName: z.string(),
	functionId: z.string(),
	extractedFilename: z.string(),
	filename: z.string(),
	isClientReferenced: z.boolean().optional()
});
var serverFnBuildInfoSchema = z.object({
	version: z.literal(1),
	serverFnsById: z.record(z.string(), serverFnSchema)
});
/**
* In Rsbuild dev, use file:// URLs for absolute server function paths.
* These are directly importable by Node's ESM VM runner without any bundler
* path conventions (unlike Vite's /@id/ prefix).
*/
var rsbuildDevServerFnModuleSpecifierEncoder = ({ extractedFilename }) => pathToFileURL(extractedFilename).href;
var currentDir = dirname(fileURLToPath(import.meta.url));
var metadataLoaderFilename = "start-compiler-metadata-loader.js";
var EMPTY_SERVER_FN_BUILD_INFO = {
	version: 1,
	serverFnsById: {}
};
function resolveMetadataLoader() {
	return resolve(currentDir, metadataLoaderFilename);
}
function readServerFnBuildInfo(module) {
	const result = serverFnBuildInfoSchema.safeParse(module.buildInfo[SERVER_FN_BUILD_INFO_FIELD]);
	if (!result.success) return null;
	return result.data.serverFnsById;
}
function setServerFnBuildInfoLoaderContext(loaderContext, module) {
	loaderContext[SERVER_FN_BUILD_INFO_CONTEXT_KEY] = (metadata) => {
		if (metadata) module.buildInfo[SERVER_FN_BUILD_INFO_FIELD] = metadata;
		else if (module.buildInfo["tanstack.start.serverFns"]) module.buildInfo[SERVER_FN_BUILD_INFO_FIELD] = EMPTY_SERVER_FN_BUILD_INFO;
	};
}
function warnTransformContext(ctx, message) {
	ctx.emitWarning?.(new Error(message));
}
/**
* Registers the shared StartCompiler as rsbuild transforms for client + ssr environments.
*
* Uses `api.transform()` to hook into the rsbuild loader pipeline, and the
* transform context's native `resolve()` for module resolution.
*/
function registerStartCompilerTransforms(api, opts) {
	const compilers = /* @__PURE__ */ new Map();
	const compilerQueues = /* @__PURE__ */ new Map();
	const inputFileSystems = /* @__PURE__ */ new Map();
	const transformContextStorage = new AsyncLocalStorage();
	const serverFnMetadataByEnvironment = /* @__PURE__ */ new Map();
	const serverFnsByEnvironment = /* @__PURE__ */ new Map();
	const serverFnsById = opts.serverFnsById ?? {};
	const getRoot = () => typeof opts.root === "function" ? opts.root() : opts.root;
	const getServerFnMetadata = (environmentName) => {
		let metadataById = serverFnMetadataByEnvironment.get(environmentName);
		if (!metadataById) {
			metadataById = /* @__PURE__ */ new Map();
			serverFnMetadataByEnvironment.set(environmentName, metadataById);
		}
		return metadataById;
	};
	const runCompilerTask = async (environmentName, task) => {
		const next = (compilerQueues.get(environmentName) ?? Promise.resolve()).catch(() => void 0).then(task);
		compilerQueues.set(environmentName, next.then(() => void 0, () => void 0));
		return next;
	};
	const replaceServerFnsByIdFromEnvironmentSnapshots = () => {
		const nextServerFnsById = {};
		for (const snapshot of serverFnsByEnvironment.values()) mergeServerFnsById(nextServerFnsById, snapshot);
		for (const key of Object.keys(serverFnsById)) delete serverFnsById[key];
		Object.assign(serverFnsById, nextServerFnsById);
		opts.onServerFnsByIdChange?.();
	};
	const compilerPlugins = [createHydrateCompilerPlugin(), ...opts.compilerPlugins ?? []];
	const isDev = api.context.action === "dev";
	const mode = isDev ? "dev" : "build";
	const metadataLoader = resolveMetadataLoader();
	const environments = opts.environments;
	api.modifyRspackConfig((config, utils) => {
		if (!environments.some((env) => env.name === utils.environment.name)) return;
		const rules = config.module.rules ?? [];
		rules.push({
			test: TRANSFORM_ID_REGEX[0],
			enforce: "post",
			use: [{
				loader: metadataLoader,
				options: { metadataById: getServerFnMetadata(utils.environment.name) }
			}]
		});
		config.module.rules = rules;
	});
	for (const env of environments) {
		const compilerTransforms = env.name === opts.providerEnvName ? opts.compilerTransforms : void 0;
		const envCodeFilters = getTransformCodeFilterForEnv(env.type, {
			compilerTransforms,
			compilerPlugins
		});
		const serverFnProviderModuleDirectives = env.name === opts.providerEnvName ? opts.serverFnProviderModuleDirectives : void 0;
		let activeServerFnMetadata;
		const onServerFnsById = (d) => {
			mergeServerFnsById(serverFnsById, d);
			if (activeServerFnMetadata) mergeServerFnsById(activeServerFnMetadata, d);
			opts.onServerFnsByIdChange?.();
		};
		api.transform({
			test: TRANSFORM_ID_REGEX[0],
			environments: [env.name],
			order: "pre"
		}, async (ctx) => {
			return transformContextStorage.run(ctx, async () => {
				const code = ctx.code;
				let nextCode = code;
				let previousResult = null;
				const id = ctx.resource;
				const root = getRoot();
				const virtualResult = loadCompilerVirtualModule(compilerPlugins, {
					code,
					id,
					root,
					env: env.type,
					envName: env.name
				});
				if (virtualResult) {
					nextCode = virtualResult.code;
					previousResult = {
						code: virtualResult.code,
						map: virtualResult.map ?? null
					};
				}
				if (!matchesCodeFilters(nextCode, envCodeFilters)) return previousResult ?? nextCode;
				let compiler = compilers.get(env.name);
				if (!compiler) {
					compiler = createStartCompiler({
						env: env.type,
						envName: env.name,
						root,
						mode,
						framework: opts.framework,
						providerEnvName: opts.providerEnvName,
						generateFunctionId: opts.generateFunctionId,
						compilerTransforms,
						compilerPlugins,
						serverFnProviderModuleDirectives,
						onServerFnsById,
						getKnownServerFns: () => serverFnsById,
						encodeModuleSpecifierInDev: isDev ? rsbuildDevServerFnModuleSpecifierEncoder : void 0,
						loadModule: async (moduleId) => {
							const activeCtx = transformContextStorage.getStore();
							if (!activeCtx) throw new Error(`could not load module ${moduleId}: missing active rsbuild transform context for ${env.name}`);
							const inputFileSystem = inputFileSystems.get(env.name);
							if (!inputFileSystem) throw new Error(`could not load module ${moduleId}: missing rspack input filesystem for ${env.name}`);
							const cleanedId = cleanId(moduleId);
							activeCtx.addDependency(cleanedId);
							const loaded = await readFileFromInputFileSystem(inputFileSystem, cleanedId);
							const moduleCode = Buffer.isBuffer(loaded) ? loaded.toString("utf8") : loaded;
							compiler.ingestModule({
								code: moduleCode,
								id: cleanedId
							});
						},
						resolveId: async (source, importer) => {
							const activeCtx = transformContextStorage.getStore();
							if (!activeCtx) throw new Error(`could not resolve ${source}: missing active rsbuild transform context for ${env.name}`);
							const context = importer ? importer.replace(/[/\\][^/\\]*$/, "") : getRoot();
							return await new Promise((resolve, reject) => {
								activeCtx.resolve(context, source, (error, resolved) => {
									if (error) {
										reject(error);
										return;
									}
									if (!resolved) {
										resolve(null);
										return;
									}
									resolve(cleanId(resolved));
								});
							});
						}
					});
					compilers.set(env.name, compiler);
				}
				const detectedKinds = detectKindsInCode(nextCode, env.type, { compilerTransforms });
				const discoveredServerFnsById = {};
				const result = await runCompilerTask(env.name, async () => {
					activeServerFnMetadata = discoveredServerFnsById;
					try {
						return await compiler.compile({
							id,
							code: nextCode,
							detectedKinds,
							warn: (message) => warnTransformContext(ctx, message)
						});
					} finally {
						activeServerFnMetadata = void 0;
					}
				});
				getServerFnMetadata(env.name).set(id, {
					version: 1,
					serverFnsById: discoveredServerFnsById
				});
				if (result) return {
					code: result.code,
					map: result.map ?? null
				};
				return previousResult ?? nextCode;
			});
		});
	}
	api.modifyRspackConfig((config, utils) => {
		if (!environments.some((env) => env.name === utils.environment.name)) return;
		config.plugins.push({ apply(compiler) {
			if (compiler.inputFileSystem) inputFileSystems.set(utils.environment.name, compiler.inputFileSystem);
			compiler.hooks.compilation.tap("TanStackStartCompilerMetadataLoaderContext", (compilation) => {
				utils.rspack.NormalModule.getCompilationHooks(compilation).loader.tap("TanStackStartCompilerMetadataLoaderContext", (loaderContext, module) => {
					setServerFnBuildInfoLoaderContext(loaderContext, module);
				});
			});
			compiler.hooks.compile.tap("TanStackStartCompilerMetadataCleanup", () => getServerFnMetadata(utils.environment.name).clear());
			compiler.hooks.finishMake.tap({
				name: "TanStackStartCompilerCachedServerFnMetadata",
				stage: -20
			}, (compilation) => {
				const restoredServerFnsById = {};
				for (const module of compilation.modules) {
					const metadata = readServerFnBuildInfo(module);
					if (!metadata) continue;
					mergeServerFnsById(restoredServerFnsById, metadata);
				}
				serverFnsByEnvironment.set(utils.environment.name, restoredServerFnsById);
				replaceServerFnsByIdFromEnvironmentSnapshots();
			});
			compiler.hooks.watchRun.tap("TanStackStartCompilerModuleInvalidation", (watchCompiler) => {
				const startCompiler = compilers.get(utils.environment.name);
				if (!startCompiler) return;
				for (const file of watchCompiler.modifiedFiles ?? []) startCompiler.invalidateModule(file);
				for (const file of watchCompiler.removedFiles ?? []) startCompiler.invalidateModule(file);
			});
		} });
	});
	return { serverFnsById };
}
function readFileFromInputFileSystem(inputFileSystem, file) {
	return new Promise((resolve, reject) => {
		inputFileSystem.readFile(file, (error, data) => {
			if (error) {
				reject(error);
				return;
			}
			if (data == null) {
				reject(/* @__PURE__ */ new Error(`could not read module source for ${file}`));
				return;
			}
			resolve(data);
		});
	});
}
//#endregion
export { registerStartCompilerTransforms };

//# sourceMappingURL=start-compiler-host.js.map