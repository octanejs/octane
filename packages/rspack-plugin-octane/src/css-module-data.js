import { createHash } from 'node:crypto';

// Only plain data crosses Rspack's worker boundary. The provider callback and
// native module graph stay on the main thread for the current compilation.
export const CSS_MODULE_CONTEXT_KEY = '__octaneCssModuleConstants';
export const CSS_MODULE_BUILD_INFO_KEY = 'octaneCssModuleConstants';

export function cssModuleSourceHash(source) {
	return createHash('sha256').update(String(source)).digest('hex');
}

export function clearCssModuleBuildInfo(module) {
	if (module?.buildInfo && typeof module.buildInfo === 'object') {
		delete module.buildInfo[CSS_MODULE_BUILD_INFO_KEY];
	}
}

/** Prepare a proof for this exact authored loader input, never a previous build. */
export function prepareCssModuleConstants(context, compiler, source, id, options) {
	const data = context[CSS_MODULE_CONTEXT_KEY];
	if (
		data?.enabled !== true ||
		context.mode !== 'production' ||
		context.hot === true ||
		options.dev ||
		options.hmr
	) {
		return null;
	}
	const requests = compiler.findCssModuleImportRequests(source, id, options.environment);
	if (requests.length === 0) return null;
	// A host callback may close over configuration outside Rspack's cache key.
	// Only eligible CSS consumers pay for the conservative one-shot rebuild.
	if (data.discoverOnly !== true) context.cacheable?.(false);
	const sourceHash = cssModuleSourceHash(source);
	const requested = new Set(requests);
	const imports = new Map();
	if (data.discoverOnly !== true && data.proof?.sourceHash === sourceHash) {
		for (const entry of data.proof.imports) {
			if (!requested.has(entry.request)) continue;
			imports.set(entry.request, {
				...entry,
				named: new Map(entry.named),
				default: new Map(entry.default),
			});
		}
	}
	const transformOptions =
		imports.size === 0
			? null
			: {
					resolveCssModuleConstant(request, imported, property) {
						const entry = imports.get(request);
						if (entry === undefined) return undefined;
						if (property === null) return entry.named.get(imported);
						if (imported === 'default') {
							return entry.default.get(property);
						}
						if (imported === '*') {
							return entry.named.get(property);
						}
						return undefined;
					},
					// Keep each retained template's ordinary stylesheet ownership edge.
					preserveCssModuleReferences: [...imports.keys()],
				};
	return { sourceHash, requests, imports, transformOptions };
}

/** Publish only committed folds and their real loader dependencies. */
export function finishCssModuleConstants(context, prepared, result) {
	if (prepared === null || result?.kind !== 'compile' || !context._module) return;
	const consumed = [...new Set(result.cssModuleConstantImports ?? [])].filter((request) =>
		prepared.imports.has(request),
	);
	for (const request of consumed) {
		const dependencies = prepared.imports.get(request).dependencies;
		for (const file of dependencies.files) context.addDependency?.(file);
		for (const directory of dependencies.contexts) context.addContextDependency?.(directory);
		for (const file of dependencies.missing) context.addMissingDependency?.(file);
		for (const file of dependencies.build) context.addBuildDependency?.(file);
	}
	const module = context._module;
	if (!module.buildInfo || typeof module.buildInfo !== 'object') module.buildInfo = {};
	module.buildInfo[CSS_MODULE_BUILD_INFO_KEY] = {
		sourceHash: prepared.sourceHash,
		requests: [...prepared.requests],
		consumed,
	};
}
