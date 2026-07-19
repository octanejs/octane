import { normalizePath } from "../utils.js";
import { IMPORT_PROTECTION_DEBUG, IMPORT_PROTECTION_DEBUG_FILTER, KNOWN_SOURCE_EXTENSIONS } from "./constants.js";
import { extname, isAbsolute, relative, resolve } from "node:path";
//#region src/import-protection/utils.ts
function dedupePatterns(patterns) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const p of patterns) {
		const key = typeof p === "string" ? `s:${p}` : `r:${p.toString()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}
function isFileExcluded(relativePath, matchers) {
	return matchers.excludeFiles.length > 0 && matchers.excludeFiles.some((matcher) => matcher.test(relativePath));
}
function checkFileDenial(relativePath, matchers) {
	if (isFileExcluded(relativePath, matchers)) return;
	return matchers.files.find((matcher) => matcher.test(relativePath));
}
function dedupeViolationKey(info) {
	return `${info.type}:${info.importer}:${info.specifier}:${info.resolved ?? ""}`;
}
/** Strip both `?query` and `#hash` from a module ID. */
function stripQueryAndHash(id) {
	const q = id.indexOf("?");
	const h = id.indexOf("#");
	if (q === -1 && h === -1) return id;
	if (q === -1) return id.slice(0, h);
	if (h === -1) return id.slice(0, q);
	return id.slice(0, Math.min(q, h));
}
/**
* Strip Vite query/hash parameters and normalize the path in one step.
*
* Results are memoized because the same module IDs are processed many
* times across resolveId, transform, and trace-building hooks.
*/
var normalizeFilePathCache = /* @__PURE__ */ new Map();
function normalizeFilePath(id) {
	let result = normalizeFilePathCache.get(id);
	if (result === void 0) {
		result = normalizePath(stripQueryAndHash(id));
		normalizeFilePathCache.set(id, result);
	}
	return result;
}
/** Clear the memoization cache (call from buildStart to bound growth). */
function clearNormalizeFilePathCache() {
	normalizeFilePathCache.clear();
}
/** Get a value from a Map, creating it with `factory` if absent. */
function getOrCreate(map, key, factory) {
	let value = map.get(key);
	if (value === void 0) {
		value = factory();
		map.set(key, value);
	}
	return value;
}
/** Make a path relative to `root`, keeping non-rooted paths as-is. */
function relativizePath(p, root) {
	if (!p.startsWith(root)) return p;
	const ch = p.charCodeAt(root.length);
	if (ch !== 47 && !Number.isNaN(ch)) return p;
	return ch === 47 ? p.slice(root.length + 1) : p.slice(root.length);
}
/** Log import-protection debug output when debug mode is enabled. */
function debugLog(...args) {
	if (!IMPORT_PROTECTION_DEBUG) return;
	console.warn("[import-protection:debug]", ...args);
}
/** Check if any value matches the configured debug filter (if present). */
function matchesDebugFilter(...values) {
	const debugFilter = IMPORT_PROTECTION_DEBUG_FILTER;
	if (!debugFilter) return true;
	return values.some((v) => v.includes(debugFilter));
}
/** Strip `?query` (but not `#hash`) from a module ID. */
function stripQuery(id) {
	const queryIndex = id.indexOf("?");
	return queryIndex === -1 ? id : id.slice(0, queryIndex);
}
function withoutKnownExtension(id) {
	const ext = extname(id);
	return KNOWN_SOURCE_EXTENSIONS.has(ext) ? id.slice(0, -ext.length) : id;
}
/**
* Check whether `filePath` is contained inside `directory` using a
* boundary-safe comparison.  A naïve `filePath.startsWith(directory)`
* would incorrectly treat `/app/src2/foo.ts` as inside `/app/src`.
*/
function isInsideDirectory(filePath, directory) {
	const rel = relative(resolve(directory), resolve(filePath));
	return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}
/**
* Decide whether a violation should be deferred for later verification
* rather than reported immediately.
*
* Build mode: always defer — generateBundle checks tree-shaking.
* Dev mock mode: always defer — edge-survival verifies whether the Start
*   compiler strips the import (factory-safe pattern).  All violation
*   types and specifier formats are handled uniformly by the
*   edge-survival mechanism in processPendingViolations.
* Dev error mode: never defer — throw immediately (no mock fallback).
*/
function shouldDeferViolation(opts) {
	return opts.isBuild || opts.isDevMock;
}
function buildSourceCandidates(source, resolved, root) {
	const candidates = /* @__PURE__ */ new Set();
	const push = (value) => {
		if (!value) return;
		candidates.add(value);
		candidates.add(stripQuery(value));
		candidates.add(withoutKnownExtension(stripQuery(value)));
	};
	push(source);
	if (resolved) {
		push(resolved);
		const relativeResolved = relativizePath(resolved, root);
		push(relativeResolved);
		push(`./${relativeResolved}`);
		push(`/${relativeResolved}`);
	}
	return candidates;
}
function buildResolutionCandidates(id) {
	const normalized = normalizeFilePath(id);
	const stripped = stripQuery(normalized);
	return [...new Set([
		id,
		normalized,
		stripped
	])];
}
function canonicalizeResolvedId(id, root, resolveExtensionlessAbsoluteId) {
	let normalized = normalizeFilePath(stripQuery(id));
	if (!isAbsolute(normalized) && !normalized.startsWith(".") && !normalized.startsWith("\0") && !/^[a-zA-Z]+:/.test(normalized)) normalized = normalizeFilePath(resolve(root, normalized));
	return resolveExtensionlessAbsoluteId(normalized);
}
//#endregion
export { buildResolutionCandidates, buildSourceCandidates, canonicalizeResolvedId, checkFileDenial, clearNormalizeFilePathCache, debugLog, dedupePatterns, dedupeViolationKey, getOrCreate, isFileExcluded, isInsideDirectory, matchesDebugFilter, normalizeFilePath, relativizePath, shouldDeferViolation };

//# sourceMappingURL=utils.js.map