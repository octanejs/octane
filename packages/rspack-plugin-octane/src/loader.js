import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import remapping from '@jridgewell/remapping';
import { canonicalModuleId, cleanModuleId, createOctaneCompiler } from 'octane/compiler/bundler';
import { inferRspackEnvironment, normalizeLoaderOptions } from './shared.js';

function realRoot(path) {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function realModuleId(id) {
	const file = cleanModuleId(id);
	return realRoot(file) + id.slice(file.length);
}

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

async function resolveClientOnlyImports(context, compiler, source, id) {
	if (typeof context.getResolve !== 'function') return [];
	const requests = compiler.findServerImportRequests(String(source), id);
	if (requests.length === 0) return [];
	const resolver = context.getResolve({ dependencyType: 'esm' });
	const issuer = dirname(cleanModuleId(id));
	const classified = [];
	await Promise.all(
		requests.map(async (request) => {
			let resolved;
			try {
				resolved = await resolver(issuer, request);
			} catch {
				// Rspack's normal dependency factory reports unresolved imports with its
				// full request/issuer trace. Do not replace that diagnostic here.
				return;
			}
			if (typeof resolved !== 'string') return;
			const reference = compiler.clientReferenceForFile(resolved);
			if (reference !== null) classified.push({ request, resolvedId: resolved, reference });
		}),
	);
	return classified.sort((left, right) =>
		left.request < right.request ? -1 : left.request > right.request ? 1 : 0,
	);
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
		const root = realRoot(
			options.root
				? isAbsolute(options.root)
					? options.root
					: resolve(loaderRoot, options.root)
				: loaderRoot,
		);
		const environment = options.environment ?? inferRspackEnvironment(this.target);
		const hmr =
			environment === 'client' && this.hot === true && options.hmr !== false ? 'webpack' : false;
		const dev =
			environment === 'client' &&
			(options.dev ?? (this.mode === undefined || this.mode !== 'production'));
		const profile = environment === 'client' && options.profile === true;
		const compiler = createOctaneCompiler({
			root,
			profile,
			...(options.exclude === undefined ? null : { exclude: options.exclude }),
			...(options.renderers === undefined ? null : { renderers: options.renderers }),
		});
		const id = realModuleId(this.resource ?? this.resourcePath);
		const finish = (clientOnlyImports, callback) => {
			try {
				const result = compiler.transform(String(source), id, {
					environment,
					hmr,
					dev,
					profile,
					...(clientOnlyImports.length > 0 ? { clientOnlyImports } : null),
				});

				if (result === null) {
					callback(null, source, this.sourceMap === false ? undefined : inputSourceMap);
					return;
				}

				registerDependencies(this, result);
				if (result.kind === 'none') {
					callback(null, source, this.sourceMap === false ? undefined : inputSourceMap);
					return;
				}
				setBuildInfo(this._module, {
					canonicalId: canonicalModuleId(id, root),
					transformKind: result.kind,
					serverRpc:
						result.kind === 'compile' &&
						(result.code.includes('_$__serverRpc(') ||
							result.code.includes('export const _$_server_$_')),
					...(result.clientReference === undefined
						? null
						: { clientReference: { ...result.clientReference } }),
				});
				const sourceMap =
					this.sourceMap === false ? undefined : composeSourceMaps(result.map, inputSourceMap);
				callback(null, result.code, sourceMap);
			} catch (error) {
				callback(error instanceof Error ? error : new Error(String(error)));
			}
		};

		const callback = this.callback.bind(this);
		const currentReference =
			environment === 'server' && typeof compiler.clientReferenceForFile === 'function'
				? compiler.clientReferenceForFile(id)
				: null;
		if (
			environment === 'server' &&
			currentReference === null &&
			typeof this.getResolve === 'function'
		) {
			const requests = compiler.findServerImportRequests(String(source), id);
			if (requests.length > 0) {
				const asyncCallback = this.async?.() ?? callback;
				resolveClientOnlyImports(this, compiler, source, id).then(
					(imports) => finish(imports, asyncCallback),
					(error) => asyncCallback(error instanceof Error ? error : new Error(String(error))),
				);
				return;
			}
		}
		finish([], callback);
	} catch (error) {
		this.callback(error instanceof Error ? error : new Error(String(error)));
	}
}
