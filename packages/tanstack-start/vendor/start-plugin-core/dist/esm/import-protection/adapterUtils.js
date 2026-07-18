import { isInsideDirectory, normalizeFilePath, relativizePath } from "./utils.js";
import { matchesAny } from "./matchers.js";
//#region src/import-protection/adapterUtils.ts
function getImportProtectionRelativePath(root, absolutePath) {
	return relativizePath(normalizeFilePath(absolutePath), root);
}
function getImportProtectionEnvType(config, envName) {
	return config.envTypeMap.get(envName) ?? "server";
}
function getImportProtectionRulesForEnvironment(config, envName) {
	return getImportProtectionEnvType(config, envName) === "client" ? config.compiledRules.client : config.compiledRules.server;
}
function shouldCheckImportProtectionImporter(config, importer, cache) {
	const normalizedImporter = normalizeFilePath(importer);
	if (cache) {
		const cached = cache.get(normalizedImporter);
		if (cached !== void 0) return cached;
	}
	const relativePath = relativizePath(normalizedImporter, config.root);
	let result;
	if (config.excludeMatchers.length > 0 && matchesAny(relativePath, config.excludeMatchers) || config.ignoreImporterMatchers.length > 0 && matchesAny(relativePath, config.ignoreImporterMatchers)) result = false;
	else if (config.includeMatchers.length > 0) result = !!matchesAny(relativePath, config.includeMatchers);
	else if (config.srcDirectory) result = isInsideDirectory(normalizedImporter, config.srcDirectory);
	else result = true;
	cache?.set(normalizedImporter, result);
	return result;
}
//#endregion
export { getImportProtectionEnvType, getImportProtectionRelativePath, getImportProtectionRulesForEnvironment, shouldCheckImportProtectionImporter };

//# sourceMappingURL=adapterUtils.js.map