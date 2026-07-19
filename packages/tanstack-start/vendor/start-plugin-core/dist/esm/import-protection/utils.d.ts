export type Pattern = string | RegExp;
export declare function dedupePatterns(patterns: Array<Pattern>): Array<Pattern>;
export interface FileMatchers {
    files: Array<{
        pattern: Pattern;
        test: (value: string) => boolean;
    }>;
    excludeFiles: Array<{
        pattern: Pattern;
        test: (value: string) => boolean;
    }>;
}
export declare function isFileExcluded(relativePath: string, matchers: Pick<FileMatchers, 'excludeFiles'>): boolean;
export declare function checkFileDenial(relativePath: string, matchers: FileMatchers): FileMatchers['files'][number] | undefined;
export declare function dedupeViolationKey(info: {
    type: string;
    importer: string;
    specifier: string;
    resolved?: string;
}): string;
/** Strip both `?query` and `#hash` from a module ID. */
export declare function stripQueryAndHash(id: string): string;
export declare function normalizeFilePath(id: string): string;
/** Clear the memoization cache (call from buildStart to bound growth). */
export declare function clearNormalizeFilePathCache(): void;
/** Get a value from a Map, creating it with `factory` if absent. */
export declare function getOrCreate<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, factory: () => TValue): TValue;
/** Make a path relative to `root`, keeping non-rooted paths as-is. */
export declare function relativizePath(p: string, root: string): string;
/** Log import-protection debug output when debug mode is enabled. */
export declare function debugLog(...args: Array<unknown>): void;
/** Check if any value matches the configured debug filter (if present). */
export declare function matchesDebugFilter(...values: Array<string>): boolean;
/** Strip `?query` (but not `#hash`) from a module ID. */
export declare function stripQuery(id: string): string;
export declare function withoutKnownExtension(id: string): string;
/**
 * Check whether `filePath` is contained inside `directory` using a
 * boundary-safe comparison.  A naïve `filePath.startsWith(directory)`
 * would incorrectly treat `/app/src2/foo.ts` as inside `/app/src`.
 */
export declare function isInsideDirectory(filePath: string, directory: string): boolean;
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
export declare function shouldDeferViolation(opts: {
    isBuild: boolean;
    isDevMock: boolean;
}): boolean;
export declare function buildSourceCandidates(source: string, resolved: string | undefined, root: string): Set<string>;
export declare function buildResolutionCandidates(id: string): Array<string>;
export declare function canonicalizeResolvedId(id: string, root: string, resolveExtensionlessAbsoluteId: (value: string) => string): string;
