import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Resolved from the module's own path: a jsdom test environment replaces the
// global URL, which Node's fileURLToPath then rejects.
const FINALIZE_LOADER = join(dirname(fileURLToPath(import.meta.url)), 'finalize-loader.js');

export function voidImportKey(request, imported) {
	return `${request}\0${imported}`;
}

// A relative request never starts with these prefixes, so the keys cannot collide.
export function liteImportKey(request, imported) {
	return `lite\0${voidImportKey(request, imported)}`;
}

export function anchorlessImportKey(request, imported) {
	return `anchorless\0${voidImportKey(request, imported)}`;
}

/**
 * Lite is a fact about the body Octane emitted: it calls no hook and reads no
 * context or signal that an importer's lite edge would misplace. Only Octane's
 * own finalizer and SWC's syntax lowering may stand between that body and the
 * module's final code; any other later loader could add such a read.
 */
function lowersOnly(context) {
	return (
		context.loaders
			?.slice(0, context.loaderIndex)
			.every(({ path }) => path === FINALIZE_LOADER || path === 'builtin:swc-loader') === true
	);
}

export function clearVoidComponentBuildInfo(module) {
	if (module?.buildInfo && typeof module.buildInfo === 'object') {
		delete module.buildInfo[VOID_COMPONENT_BUILD_INFO_KEY];
	}
}

/**
 * Prepare this exact authored loader input's void-component facts. Every build
 * the controller enables records its own void, memo and lite exports and
 * candidate imports, so cached modules carry the same facts in a watch and a
 * one-shot build. Only a one-shot build's proof pass supplies proven imports,
 * lite proofs and memo hints.
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
	const lite = new Set(proven === null ? null : data.proof.lite);
	const anchorless = new Set(proven === null ? null : data.proof.anchorless);
	const memo = new Set(data.memo);
	// A proof or hint is a fact about other modules' output, outside this
	// module's cache key. Output that may consume one is never cached.
	if (proven !== null || memo.size > 0) context.cacheable?.(false);
	const consumed = new Set();
	return {
		source,
		id,
		sourceHash: hash,
		consumed,
		transformOptions: {
			collectVoidComponentExports: true,
			// Always answered, so an export over an unhinted import publishes no
			// memo proof of its own.
			isCompilerMemoImport: (request, imported) => memo.has(voidImportKey(request, imported)),
			...(proven === null
				? null
				: {
						isVoidComponentImport(request, imported) {
							const key = voidImportKey(request, imported);
							if (!proven.has(key)) return false;
							consumed.add(key);
							return true;
						},
						// A lite proof rests on the import's void proof, so it consumes both.
						isLiteComponentImport(request, imported) {
							const key = voidImportKey(request, imported);
							if (!lite.has(key)) return false;
							consumed.add(key);
							consumed.add(liteImportKey(request, imported));
							return true;
						},
						isAnchorlessComponentImport(request, imported) {
							const key = voidImportKey(request, imported);
							if (!anchorless.has(key)) return false;
							consumed.add(key);
							consumed.add(anchorlessImportKey(request, imported));
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
	const memoExports =
		compiled && Array.isArray(result.compilerMemoExports) ? result.compilerMemoExports : [];
	const lowered = compiled && lowersOnly(context);
	const lite =
		lowered && Array.isArray(result.liteComponentExports) ? result.liteComponentExports : [];
	const anchorless =
		lowered && Array.isArray(result.anchorlessComponentExports)
			? result.anchorlessComponentExports
			: [];
	const imports =
		RELATIVE_IMPORT.test(prepared.source) && (compiled || ROOT_FACTORY_IMPORT.test(prepared.source))
			? findVoidComponentImports(prepared.source, prepared.id)
			: [];
	if (exports.length === 0 && memoExports.length === 0 && imports.length === 0) return;
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
		memoExports: [...memoExports],
		lite: [...lite],
		anchorless: [...anchorless],
		imports: imports.map(({ request, imported }) => ({ request, imported })),
		consumed,
		bindings,
	};
}
