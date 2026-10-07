import { analyzeCompiledModule, findVoidComponentImports } from 'octane/compiler/bundler';
import { sourceHash } from './module-graph.js';

// Only plain data crosses Rspack's worker boundary. The module graph and every
// proof decision stay with the main-thread controller for one compilation.
export const VOID_COMPONENT_CONTEXT_KEY = '__octaneVoidComponents';
export const VOID_COMPONENT_BUILD_INFO_KEY = 'octaneVoidComponents';

// Only a relative import can name a component the controller proves.
const RELATIVE_IMPORT = /\bfrom\s*['"]\.\.?\//;
// Outside compiled JSX, only a root from an imported Octane root factory can
// use a proof; a supplied proof makes the hook pass consult such a module.
const ROOT_FACTORY_IMPORT =
	/\bimport\s*\{[^}]*\b(?:createRoot|hydrateRoot)\b[^}]*\}\s*from\s*['"]octane['"]/;

export function voidImportKey(request, imported) {
	return `${request}\0${imported}`;
}

export function clearVoidComponentBuildInfo(module) {
	if (module?.buildInfo && typeof module.buildInfo === 'object') {
		delete module.buildInfo[VOID_COMPONENT_BUILD_INFO_KEY];
	}
}

/**
 * Prepare this exact authored loader input's void-component facts. Every build
 * the controller enables records its own void exports and candidate imports,
 * so cached modules carry the same facts in a watch and a one-shot build. Only
 * a one-shot build's proof pass supplies proven imports.
 */
export function prepareVoidComponents(context, source, id, options) {
	const data = context[VOID_COMPONENT_CONTEXT_KEY];
	if (
		data?.enabled !== true ||
		options.environment !== 'client' ||
		options.hmr ||
		options.dev ||
		options.profile ||
		context.mode !== 'production' ||
		context.hot === true
	) {
		return null;
	}
	const hash = data.proof == null ? null : sourceHash(source);
	const proven =
		hash !== null && data.proof.sourceHash === hash
			? new Set(data.proof.imports.map(({ request, imported }) => voidImportKey(request, imported)))
			: null;
	// A proof is a fact about other modules' final output, outside this module's
	// cache key. Output that may consume one is never cached.
	if (proven !== null) context.cacheable?.(false);
	const consumed = new Set();
	return {
		source,
		id,
		sourceHash: hash,
		consumed,
		transformOptions: {
			collectVoidComponentExports: true,
			...(proven === null
				? null
				: {
						isVoidComponentImport(request, imported) {
							const key = voidImportKey(request, imported);
							if (!proven.has(key)) return false;
							consumed.add(key);
							return true;
						},
					}),
		},
	};
}

/**
 * Publish this build's exports, candidate imports, and the proofs it consumed
 * with the import bindings Octane's output reads them through. Only a module
 * that can consume a proof pays for the scans.
 */
export function finishVoidComponents(context, prepared, result) {
	const module = context._module;
	if (prepared === null || !module) return;
	const compiled = result?.kind === 'compile';
	const exports =
		compiled && Array.isArray(result.voidComponentExports) ? result.voidComponentExports : [];
	const imports =
		RELATIVE_IMPORT.test(prepared.source) && (compiled || ROOT_FACTORY_IMPORT.test(prepared.source))
			? findVoidComponentImports(prepared.source, prepared.id)
			: [];
	if (exports.length === 0 && imports.length === 0) return;
	const consumed = [...prepared.consumed].sort();
	// null (unparseable output) can never match the final code's bindings.
	const bindings =
		consumed.length === 0
			? []
			: (analyzeCompiledModule(result?.code ?? prepared.source, prepared.id)?.importBindings.filter(
					({ request, imported }) => prepared.consumed.has(voidImportKey(request, imported)),
				) ?? null);
	if (!module.buildInfo || typeof module.buildInfo !== 'object') module.buildInfo = {};
	module.buildInfo[VOID_COMPONENT_BUILD_INFO_KEY] = {
		sourceHash: prepared.sourceHash ?? sourceHash(prepared.source),
		exports: [...exports],
		imports: imports.map(({ request, imported }) => ({ request, imported })),
		consumed,
		bindings,
	};
}
