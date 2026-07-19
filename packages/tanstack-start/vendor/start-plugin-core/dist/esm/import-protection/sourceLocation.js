import { getOrCreate, normalizeFilePath } from "./utils.js";
import { findOriginalUnsafeUsagePosFromResult, findPostCompileUsagePosFromResult, getImportSpecifierLocationFromResult } from "./analysis.js";
import * as path$1 from "pathe";
import { SourceMapConsumer } from "source-map";
//#region src/import-protection/sourceLocation.ts
function buildLineIndex(code) {
	const offsets = [0];
	for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) offsets.push(i + 1);
	return { offsets };
}
function upperBound(values, x) {
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = lo + hi >> 1;
		if (values[mid] <= x) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
function indexToLineColWithIndex(lineIndex, idx) {
	const offsets = lineIndex.offsets;
	const ub = upperBound(offsets, idx);
	const lineIdx = Math.max(0, ub - 1);
	const line = lineIdx + 1;
	const lineStart = offsets[lineIdx] ?? 0;
	return {
		line,
		column0: Math.max(0, idx - lineStart)
	};
}
function indexToLineColumn(lineIndex, idx) {
	const { line, column0 } = indexToLineColWithIndex(lineIndex, idx);
	return {
		line,
		column: column0 + 1
	};
}
function normalizeSourceMap(map) {
	if (!map) return;
	return {
		...map,
		version: Number(map.version),
		file: map.file ?? "",
		names: Array.isArray(map.names) ? map.names : [],
		sourcesContent: map.sourcesContent?.map((value) => value ?? "") ?? void 0
	};
}
/**
* Pick the most-likely original source text for `importerFile` from
* a sourcemap that may contain multiple sources.
*/
function pickOriginalCodeFromSourcesContent(map, importerFile, root) {
	if (!map?.sourcesContent || map.sources.length === 0) return;
	const file = normalizeFilePath(importerFile);
	const sourceRoot = map.sourceRoot;
	const fileSeg = file.split("/").filter(Boolean);
	const resolveBase = sourceRoot ? path$1.resolve(root, sourceRoot) : root;
	let bestIdx = -1;
	let bestScore = -1;
	for (let i = 0; i < map.sources.length; i++) {
		const content = map.sourcesContent[i];
		if (typeof content !== "string") continue;
		const src = map.sources[i] ?? "";
		const normalizedSrc = normalizeFilePath(src);
		if (normalizedSrc === file) return content;
		let resolved;
		if (!src) resolved = "";
		else if (path$1.isAbsolute(src)) resolved = normalizeFilePath(src);
		else resolved = normalizeFilePath(path$1.resolve(resolveBase, src));
		if (resolved === file) return content;
		const normalizedSrcSeg = normalizedSrc.split("/").filter(Boolean);
		const resolvedSeg = resolved !== normalizedSrc ? resolved.split("/").filter(Boolean) : normalizedSrcSeg;
		const score = Math.max(segmentSuffixScore(normalizedSrcSeg, fileSeg), segmentSuffixScore(resolvedSeg, fileSeg));
		if (score > bestScore) {
			bestScore = score;
			bestIdx = i;
		}
	}
	if (bestIdx !== -1 && bestScore >= 1) return map.sourcesContent[bestIdx] ?? void 0;
	return map.sourcesContent[0] ?? void 0;
}
/** Count matching path segments from the end of `aSeg` against `bSeg`. */
function segmentSuffixScore(aSeg, bSeg) {
	let score = 0;
	for (let i = aSeg.length - 1, j = bSeg.length - 1; i >= 0 && j >= 0; i--, j--) {
		if (aSeg[i] !== bSeg[j]) break;
		score++;
	}
	return score;
}
async function mapGeneratedToOriginal(map, generated, fallbackFile) {
	const fallback = {
		file: fallbackFile,
		line: generated.line,
		column: generated.column0 + 1
	};
	if (!map) return fallback;
	const consumer = await getSourceMapConsumer(map);
	if (!consumer) return fallback;
	try {
		const orig = consumer.originalPositionFor({
			line: generated.line,
			column: generated.column0
		});
		if (orig.line != null && orig.column != null) return {
			file: orig.source ? normalizeFilePath(orig.source) : fallbackFile,
			line: orig.line,
			column: orig.column + 1
		};
	} catch {}
	return fallback;
}
var consumerCache = /* @__PURE__ */ new WeakMap();
function getOriginalCode(result, importerFile, root) {
	if (result.originalCode === void 0 && importerFile && root) {
		const map = result.map;
		if (map?.sourcesContent) result.originalCode = pickOriginalCodeFromSourcesContent(map, importerFile, root);
	}
	return result.originalCode;
}
function toRawSourceMap(map) {
	return {
		...map,
		file: map.file ?? "",
		version: Number(map.version),
		sourcesContent: map.sourcesContent?.map((s) => s ?? "") ?? []
	};
}
async function getSourceMapConsumer(map) {
	const cached = consumerCache.get(map);
	if (cached) return cached;
	const promise = (async () => {
		try {
			return await new SourceMapConsumer(toRawSourceMap(map));
		} catch {
			return null;
		}
	})();
	consumerCache.set(map, promise);
	return promise;
}
/**
* Cache for import statement locations with reverse index for O(1)
* invalidation by file.  Keys: `${importerFile}::${source}`.
*/
var ImportLocCache = class {
	cache = /* @__PURE__ */ new Map();
	reverseIndex = /* @__PURE__ */ new Map();
	has(key) {
		return this.cache.has(key);
	}
	get(key) {
		return this.cache.get(key);
	}
	set(key, value) {
		this.cache.set(key, value);
		const file = key.slice(0, key.indexOf("::"));
		getOrCreate(this.reverseIndex, file, () => /* @__PURE__ */ new Set()).add(key);
	}
	clear() {
		this.cache.clear();
		this.reverseIndex.clear();
	}
	/** Remove all cache entries where the importer matches `file`. */
	deleteByFile(file) {
		const keys = this.reverseIndex.get(file);
		if (keys) {
			for (const key of keys) this.cache.delete(key);
			this.reverseIndex.delete(file);
		}
	}
};
function getOrCreateOriginalTransformResult(result, importerFile, root) {
	getOriginalCode(result, importerFile, root);
	if (!result.originalCode) return;
	if (!result.originalResult) {
		result.originalResult = {
			code: result.originalCode,
			filename: result.filename,
			map: void 0,
			originalCode: result.originalCode
		};
		if (result.perf) result.originalResult.perf = result.perf;
	}
	return result.originalResult;
}
function createImportSpecifierLocationIndex() {
	return { find(result, source) {
		if (!result.code.includes(source)) return -1;
		return getImportSpecifierLocationFromResult(result, source);
	} };
}
/**
* Find the location of an import statement in a transformed module
* by searching the post-transform code and mapping back via sourcemap.
* Results are cached in `importLocCache`.
*/
async function findImportStatementLocationFromTransformed(provider, importerId, source, importLocCache, findImportSpecifierLocationIndex) {
	const importerFile = normalizeFilePath(importerId);
	const cacheKey = `${importerFile}::${source}`;
	if (importLocCache.has(cacheKey)) return importLocCache.get(cacheKey) ?? void 0;
	try {
		const res = provider.getTransformResult(importerId);
		if (!res) {
			importLocCache.set(cacheKey, null);
			return;
		}
		const { map } = res;
		const lineIndex = res.lineIndex ?? (res.lineIndex = buildLineIndex(res.code));
		const idx = findImportSpecifierLocationIndex(res, source);
		if (idx === -1) {
			importLocCache.set(cacheKey, null);
			return;
		}
		const loc = await mapGeneratedToOriginal(map, indexToLineColWithIndex(lineIndex, idx), importerFile);
		importLocCache.set(cacheKey, loc);
		return loc;
	} catch {
		importLocCache.set(cacheKey, null);
		return;
	}
}
/**
* Find the first post-compile usage location for a denied import specifier.
* Best-effort: searches transformed code for non-import uses of imported
* bindings and maps back to original source via sourcemap.
*/
async function findPostCompileUsageLocation(provider, importerId, source) {
	try {
		const importerFile = normalizeFilePath(importerId);
		const res = provider.getTransformResult(importerId);
		if (!res) return void 0;
		const { code, map } = res;
		if (!res.lineIndex) res.lineIndex = buildLineIndex(code);
		const pos = findPostCompileUsagePosFromResult(res, source);
		if (!pos) return void 0;
		return await mapGeneratedToOriginal(map, pos, importerFile);
	} catch {
		return;
	}
}
/**
* Best-effort original-source usage lookup for cases where a later transform
* removes or rewrites the import from emitted code but preserves the original
* source in `sourcesContent`.
*/
function findOriginalUsageLocation(provider, importerId, source, envType, root) {
	try {
		const importerFile = normalizeFilePath(importerId);
		const res = provider.getTransformResult(importerId);
		if (!res) return void 0;
		const originalResult = getOrCreateOriginalTransformResult(res, importerFile, root);
		if (!originalResult) return void 0;
		const pos = envType ? findOriginalUnsafeUsagePosFromResult(originalResult, source, envType) : findPostCompileUsagePosFromResult(originalResult, source);
		if (!pos) return void 0;
		return {
			file: importerFile,
			line: pos.line,
			column: pos.column0 + 1
		};
	} catch {
		return;
	}
}
/**
* Annotate each trace hop with the location of the import that created the
* edge (file:line:col). Skips steps that already have a location.
*/
async function addTraceImportLocations(provider, trace, importLocCache, findImportSpecifierLocationIndex) {
	for (const step of trace) {
		if (!step.specifier) continue;
		if (step.line != null && step.column != null) continue;
		const loc = await findImportStatementLocationFromTransformed(provider, step.file, step.specifier, importLocCache, findImportSpecifierLocationIndex);
		if (!loc) continue;
		step.line = loc.line;
		step.column = loc.column;
	}
}
/**
* Build a vitest-style code snippet showing lines surrounding a location.
*
* Prefers `originalCode` from the sourcemap's sourcesContent; falls back
* to transformed code when unavailable.
*/
function buildCodeSnippet(provider, moduleId, loc, contextLines = 2, root) {
	try {
		const importerFile = normalizeFilePath(moduleId);
		const res = provider.getTransformResult(moduleId);
		if (!res) return void 0;
		const sourceCode = getOriginalCode(res, importerFile, root) ?? res.code;
		const targetLine = loc.line;
		const targetCol = loc.column;
		if (targetLine < 1) return void 0;
		const allLines = sourceCode.split("\n");
		for (let i = 0; i < allLines.length; i++) {
			const line = allLines[i];
			if (line.endsWith("\r")) allLines[i] = line.slice(0, -1);
		}
		const wantStart = Math.max(1, targetLine - contextLines);
		const wantEnd = Math.min(allLines.length, targetLine + contextLines);
		if (targetLine > allLines.length) return void 0;
		const lines = allLines.slice(wantStart - 1, wantEnd);
		const gutterWidth = String(wantEnd).length;
		const sourceFile = loc.file ?? importerFile;
		const snippetLines = [];
		for (let i = 0; i < lines.length; i++) {
			const ln = wantStart + i;
			const lineContent = lines[i];
			const lineNumStr = String(ln).padStart(gutterWidth, " ");
			const marker = ln === targetLine ? ">" : " ";
			snippetLines.push(`  ${marker} ${lineNumStr} | ${lineContent}`);
			if (ln === targetLine && targetCol > 0) {
				const padding = " ".repeat(targetCol - 1);
				snippetLines.push(`    ${" ".repeat(gutterWidth)} | ${padding}^`);
			}
		}
		return {
			lines: snippetLines,
			highlightLine: targetLine,
			location: `${sourceFile}:${targetLine}:${targetCol}`
		};
	} catch {
		return;
	}
}
//#endregion
export { ImportLocCache, addTraceImportLocations, buildCodeSnippet, buildLineIndex, createImportSpecifierLocationIndex, findImportStatementLocationFromTransformed, findOriginalUsageLocation, findPostCompileUsageLocation, getOrCreateOriginalTransformResult, indexToLineColumn, normalizeSourceMap, pickOriginalCodeFromSourcesContent };

//# sourceMappingURL=sourceLocation.js.map