import {
	KindDetectionPatterns,
	getExternalLookupKind,
	getLookupKindsForEnv,
	isCompilerTransformEnabledForEnv,
	isStartCompilerPluginEnabledForEnv,
} from './compiler.js';
import { getRouterPackage, getStartPackage } from '#tanstack-start/package-names';
//#region src/start-compiler/config.ts
function getTransformCodeFilterForEnv(env, opts) {
	const validKinds = getLookupKindsForEnv(env, opts);
	const patterns = [];
	for (const [kind, pattern] of Object.entries(KindDetectionPatterns))
		if (validKinds.has(kind)) patterns.push(pattern);
	for (const transform of opts?.compilerTransforms ?? [])
		if (isCompilerTransformEnabledForEnv(transform, env)) patterns.push(transform.detect);
	for (const plugin of opts?.compilerPlugins ?? [])
		if (plugin.detect && isStartCompilerPluginEnabledForEnv(plugin, env))
			patterns.push(plugin.detect);
	return patterns;
}
function getLookupConfigurationsForEnv(env, framework, opts) {
	const commonConfigs = [
		{
			libName: getStartPackage(framework),
			rootExport: 'createServerFn',
			kind: 'Root',
		},
		{
			libName: getStartPackage(framework),
			rootExport: 'createIsomorphicFn',
			kind: 'IsomorphicFn',
		},
		{
			libName: getStartPackage(framework),
			rootExport: 'createServerOnlyFn',
			kind: 'ServerOnlyFn',
		},
		{
			libName: getStartPackage(framework),
			rootExport: 'createClientOnlyFn',
			kind: 'ClientOnlyFn',
		},
	];
	const externalConfigs = [];
	for (const transform of opts?.compilerTransforms ?? []) {
		if (!isCompilerTransformEnabledForEnv(transform, env)) continue;
		const kind = getExternalLookupKind(transform);
		for (const imported of transform.imports)
			externalConfigs.push({
				libName: imported.libName,
				rootExport: imported.rootExport,
				kind,
			});
	}
	if (env === 'client')
		return [
			{
				libName: getStartPackage(framework),
				rootExport: 'createMiddleware',
				kind: 'Root',
			},
			{
				libName: getStartPackage(framework),
				rootExport: 'createStart',
				kind: 'Root',
			},
			...commonConfigs,
			...externalConfigs,
		];
	return [
		...[
			...commonConfigs,
			{
				libName: getRouterPackage(framework),
				rootExport: 'ClientOnly',
				kind: 'ClientOnlyJSX',
			},
		],
		...externalConfigs,
	];
}
//#endregion
export { getLookupConfigurationsForEnv, getTransformCodeFilterForEnv };
