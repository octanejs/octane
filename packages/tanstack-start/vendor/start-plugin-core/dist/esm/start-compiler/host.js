import { StartCompiler, getLookupKindsForEnv } from "./compiler.js";
import { getLookupConfigurationsForEnv } from "./config.js";
//#region src/start-compiler/host.ts
function createStartCompiler(options) {
	return new StartCompiler({
		env: options.env,
		envName: options.envName,
		root: options.root,
		lookupKinds: getLookupKindsForEnv(options.env, { compilerTransforms: options.compilerTransforms }),
		lookupConfigurations: getLookupConfigurationsForEnv(options.env, options.framework, { compilerTransforms: options.compilerTransforms }),
		mode: options.mode,
		framework: options.framework,
		providerEnvName: options.providerEnvName,
		generateFunctionId: options.generateFunctionId,
		onServerFnsById: options.onServerFnsById,
		compilerTransforms: options.compilerTransforms,
		compilerPlugins: options.compilerPlugins,
		serverFnProviderModuleDirectives: options.serverFnProviderModuleDirectives,
		warn: options.warn,
		getKnownServerFns: options.getKnownServerFns,
		devServerFnModuleSpecifierEncoder: options.encodeModuleSpecifierInDev,
		loadModule: options.loadModule,
		resolveId: options.resolveId
	});
}
function mergeServerFnsById(current, next) {
	for (const [id, fn] of Object.entries(next)) {
		const existing = current[id];
		if (existing) {
			current[id] = {
				...fn,
				isClientReferenced: existing.isClientReferenced || fn.isClientReferenced
			};
			continue;
		}
		current[id] = fn;
	}
}
function matchesCodeFilters(code, filters) {
	for (const pattern of filters) {
		pattern.lastIndex = 0;
		if (pattern.test(code)) return true;
	}
	return false;
}
function createCompilerVirtualModuleIdPattern(compilerPlugins) {
	const patterns = compilerPlugins.map((plugin) => plugin.virtualModuleIdPattern).filter((pattern) => !!pattern);
	if (patterns.length === 0) return;
	return new RegExp(patterns.map((pattern) => `(?:${pattern.source})`).join("|"));
}
function loadCompilerVirtualModule(compilerPlugins, context) {
	for (const compilerPlugin of compilerPlugins) {
		const pattern = compilerPlugin.virtualModuleIdPattern;
		if (!pattern) continue;
		pattern.lastIndex = 0;
		if (!pattern.test(context.id)) continue;
		const result = compilerPlugin.loadVirtualModule?.(context);
		if (result) return result;
	}
	return null;
}
//#endregion
export { createCompilerVirtualModuleIdPattern, createStartCompiler, loadCompilerVirtualModule, matchesCodeFilters, mergeServerFnsById };

//# sourceMappingURL=host.js.map