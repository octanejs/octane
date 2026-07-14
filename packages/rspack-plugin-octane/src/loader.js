import { isAbsolute, resolve } from 'node:path';
import remapping from '@jridgewell/remapping';
import { canonicalModuleId, createOctaneCompiler } from 'octane/compiler/bundler';
import { inferRspackEnvironment, normalizeLoaderOptions } from './shared.js';

function clearBuildInfo(module) {
	if (module?.buildInfo && typeof module.buildInfo === 'object') {
		delete module.buildInfo.octane;
	}
}

function setBuildInfo(module, value) {
	if (!module || typeof module !== 'object') return;
	if (!module.buildInfo || typeof module.buildInfo !== 'object') module.buildInfo = {};
	module.buildInfo.octane = value;
}

function registerDependencies(context, result) {
	for (const dependency of new Set(result.dependencies ?? [])) {
		context.addDependency?.(dependency);
	}
	for (const dependency of new Set(result.missingDependencies ?? [])) {
		context.addMissingDependency?.(dependency);
	}
}

function composeSourceMaps(outputMap, inputSourceMap) {
	if (!outputMap || !inputSourceMap) return outputMap ?? inputSourceMap;
	const input = typeof inputSourceMap === 'string' ? JSON.parse(inputSourceMap) : inputSourceMap;
	const chained = remapping([outputMap, input], () => null);
	return String(chained.mappings).length > 0 ? chained : outputMap;
}

/**
 * Rspack's ESM loader entry. A compiler instance is intentionally scoped to
 * one invocation: Rspack owns output caching and invalidates it from the file
 * and missing-file dependencies registered below, while a fresh neutral
 * compiler instance cannot retain stale manifest discovery across rebuilds.
 */
export default function octaneLoader(source, inputSourceMap) {
	this.cacheable?.(true);
	clearBuildInfo(this._module);

	try {
		const options = normalizeLoaderOptions(this.getOptions?.() ?? {});
		const loaderRoot = this.rootContext ?? process.cwd();
		const root = options.root
			? isAbsolute(options.root)
				? options.root
				: resolve(loaderRoot, options.root)
			: loaderRoot;
		const environment = options.environment ?? inferRspackEnvironment(this.target);
		const hmr =
			environment === 'client' && this.hot === true && options.hmr !== false ? 'webpack' : false;
		const dev =
			environment === 'client' &&
			(options.dev ?? (this.mode === undefined || this.mode !== 'production'));
		const compiler = createOctaneCompiler({
			root,
			...(options.exclude === undefined ? null : { exclude: options.exclude }),
			...(options.parallelUse === undefined ? null : { parallelUse: options.parallelUse }),
		});
		const id = this.resource ?? this.resourcePath;
		const result = compiler.transform(String(source), id, {
			environment,
			hmr,
			dev,
			...(options.parallelUse === undefined ? null : { parallelUse: options.parallelUse }),
		});

		if (result === null) {
			this.callback(null, source, this.sourceMap === false ? undefined : inputSourceMap);
			return;
		}

		registerDependencies(this, result);
		if (result.kind === 'none') {
			this.callback(null, source, this.sourceMap === false ? undefined : inputSourceMap);
			return;
		}
		setBuildInfo(this._module, {
			canonicalId: canonicalModuleId(id, root),
			transformKind: result.kind,
			serverRpc:
				result.kind === 'compile' &&
				(result.code.includes('_$__serverRpc(') ||
					result.code.includes('export const _$_server_$_')),
		});
		const sourceMap =
			this.sourceMap === false ? undefined : composeSourceMaps(result.map, inputSourceMap);
		this.callback(null, result.code, sourceMap);
	} catch (error) {
		this.callback(error instanceof Error ? error : new Error(String(error)));
	}
}
