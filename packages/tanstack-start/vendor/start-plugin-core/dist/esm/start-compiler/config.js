import { KindDetectionPatterns, getExternalLookupKind, getLookupKindsForEnv, isCompilerTransformEnabledForEnv, isStartCompilerPluginEnabledForEnv } from "./compiler.js";
//#region src/start-compiler/config.ts
function getTransformCodeFilterForEnv(env, opts) {
	const validKinds = getLookupKindsForEnv(env, opts);
	const patterns = [];
	for (const [kind, pattern] of Object.entries(KindDetectionPatterns)) if (validKinds.has(kind)) patterns.push(pattern);
	for (const transform of opts?.compilerTransforms ?? []) if (isCompilerTransformEnabledForEnv(transform, env)) patterns.push(transform.detect);
	for (const plugin of opts?.compilerPlugins ?? []) if (plugin.detect && isStartCompilerPluginEnabledForEnv(plugin, env)) patterns.push(plugin.detect);
	return patterns;
}
function getLookupConfigurationsForEnv(env, framework, opts) {
	const commonConfigs = [
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createServerFn",
			kind: "Root"
		},
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createIsomorphicFn",
			kind: "IsomorphicFn"
		},
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createServerOnlyFn",
			kind: "ServerOnlyFn"
		},
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createClientOnlyFn",
			kind: "ClientOnlyFn"
		}
	];
	const externalConfigs = [];
	for (const transform of opts?.compilerTransforms ?? []) {
		if (!isCompilerTransformEnabledForEnv(transform, env)) continue;
		const kind = getExternalLookupKind(transform);
		for (const imported of transform.imports) externalConfigs.push({
			libName: imported.libName,
			rootExport: imported.rootExport,
			kind
		});
	}
	if (env === "client") return [
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createMiddleware",
			kind: "Root"
		},
		{
			libName: `@tanstack/${framework}-start`,
			rootExport: "createStart",
			kind: "Root"
		},
		...commonConfigs,
		...externalConfigs
	];
	return [...[...commonConfigs, {
		libName: `@tanstack/${framework}-router`,
		rootExport: "ClientOnly",
		kind: "ClientOnlyJSX"
	}], ...externalConfigs];
}
//#endregion
export { getLookupConfigurationsForEnv, getTransformCodeFilterForEnv };

//# sourceMappingURL=config.js.map