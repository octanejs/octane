import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import remapping from '@jridgewell/remapping';
import { canonicalModuleId, cleanModuleId, createOctaneCompiler } from 'octane/compiler/bundler';
import { resolveRendererForFile } from 'octane/compiler/renderers';
import {
	clearCssModuleBuildInfo,
	CSS_MODULE_CONTEXT_KEY,
	finishCssModuleConstants,
	prepareCssModuleConstants,
} from './css-module-data.js';
import {
	inferRspackEnvironment,
	normalizeLoaderOptions,
	selectLayerCompilerOptions,
} from './shared.js';
import { loadDescriptorChildrenImports } from './descriptor-children.js';
import { textTypeFactsForLoader } from './text-types.js';

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
	clearCssModuleBuildInfo(this._module);

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
		const compilerOptions =
			options.layerSpecializations === undefined
				? options
				: selectLayerCompilerOptions(options, this._module);
		const compiler = createOctaneCompiler({
			root,
			profile,
			...(options.strong === undefined ? null : { strong: options.strong }),
			...(options.exclude === undefined ? null : { exclude: options.exclude }),
			...(compilerOptions.renderers === undefined
				? null
				: { renderers: compilerOptions.renderers }),
			...(compilerOptions.universalRuntime === undefined
				? null
				: { universalRuntime: compilerOptions.universalRuntime }),
			...(options.requireDirective === undefined
				? null
				: { requireDirective: options.requireDirective }),
			// Ownership diagnostics surface through Rspack's own module warnings.
			warn: (message) => this.emitWarning?.(new Error(message)),
		});
		const id = realModuleId(this.resource ?? this.resourcePath);
		const authoredSource = String(source);
		const textTypeCandidate =
			options.textTypes !== undefined && this.mode === 'production' && !dev && this.hot !== true;
		let textTypeFilename;
		if (textTypeCandidate) {
			const file = cleanModuleId(id);
			if (
				/(?:\.tsrx|\.tsx)$/i.test(file) &&
				existsSync(file) &&
				compiler._isProjectOwnedSource(file)
			) {
				const canonical = compiler._canonicalModuleId(file);
				const pragmaOwned =
					file.endsWith('.tsx') && compiler._pragmaClaimsOwnership(authoredSource);
				if (compiler._passesOwnershipGate(file, canonical, pragmaOwned)) {
					const renderer = resolveRendererForFile(compiler.renderers, canonical);
					if (
						renderer.target === 'dom' &&
						!(environment === 'server' && renderer.server === 'client-only')
					) {
						textTypeFilename = canonical;
					}
				}
			}
		}
		if (textTypeFilename !== undefined) {
			// An imported type can change while this module's source stays the same.
			// Rspack's persistent module cache has no dependency edges to every TS
			// Program input. Production watches stay syntax-only but must not persist
			// their generic output for a later one-shot typed build either.
			this.cacheable?.(false);
		}
		const textTypes =
			textTypeFilename !== undefined &&
			this._compiler?.watchMode !== true &&
			this._compiler?.options?.watch !== true;
		const cssModuleConstants =
			this[CSS_MODULE_CONTEXT_KEY]?.enabled === true
				? prepareCssModuleConstants(this, compiler, authoredSource, id, {
						environment,
						hmr,
						dev,
					})
				: null;
		const finish = (clientOnlyImports, isDescriptorChildrenImport, textTypeFacts, callback) => {
			try {
				const result = compiler.transform(authoredSource, id, {
					environment,
					hmr,
					dev,
					profile,
					...(clientOnlyImports.length > 0 ? { clientOnlyImports } : null),
					...(isDescriptorChildrenImport === null ? null : { isDescriptorChildrenImport }),
					...(textTypeFacts === undefined ? null : { textTypeFacts }),
					...cssModuleConstants?.transformOptions,
				});

				if (result === null) {
					callback(null, source, this.sourceMap === false ? undefined : inputSourceMap);
					return;
				}

				registerDependencies(this, result);
				finishCssModuleConstants(this, cssModuleConstants, result);
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
					...(result.universalRuntime === undefined
						? null
						: { universalRuntime: result.universalRuntime }),
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
		const needsServerImports =
			environment === 'server' &&
			currentReference === null &&
			typeof this.getResolve === 'function';
		const requests = needsServerImports
			? compiler.findServerImportRequests(authoredSource, id)
			: [];
		const mayUseDescriptorImports =
			typeof this.getResolve === 'function' &&
			(environment !== 'server' || currentReference === null) &&
			/\.(?:tsrx|tsx)$/.test(cleanModuleId(id)) &&
			/<\s*[A-Z_$]/.test(authoredSource) &&
			authoredSource.includes('import');
		if (requests.length > 0 || mayUseDescriptorImports || textTypes) {
			const asyncCallback = this.async?.() ?? callback;
			Promise.all([
				requests.length > 0 ? resolveClientOnlyImports(this, compiler, authoredSource, id) : [],
				mayUseDescriptorImports ? loadDescriptorChildrenImports(this, authoredSource, id) : null,
				textTypes
					? textTypeFactsForLoader(
							this._compiler,
							options.textTypes.tsconfig,
							compilerOptions.renderers,
							cleanModuleId(id),
							authoredSource,
						).then((facts) => ({
							...facts,
							// The neutral compiler uses a project-relative module identity;
							// the checker necessarily reads the real filesystem filename.
							filename: textTypeFilename,
						}))
					: undefined,
			]).then(
				([imports, descriptorImport, textTypeFacts]) =>
					finish(imports, descriptorImport, textTypeFacts, asyncCallback),
				(error) => asyncCallback(error instanceof Error ? error : new Error(String(error))),
			);
			return;
		}
		finish([], null, undefined, callback);
	} catch (error) {
		this.callback(error instanceof Error ? error : new Error(String(error)));
	}
}
