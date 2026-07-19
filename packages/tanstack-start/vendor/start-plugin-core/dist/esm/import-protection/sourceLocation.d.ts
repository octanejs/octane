import { ImportAnalysis } from './analysis.js';
import { Loc } from './trace.js';
import { ParseAstResult } from '@tanstack/router-utils';
/**
 * Minimal source-map shape used throughout the import-protection plugin.
 */
export interface SourceMapLike {
    file?: string;
    sourceRoot?: string;
    version: number | string;
    sources: Array<string>;
    names: Array<string>;
    sourcesContent?: Array<string | null>;
    mappings: string;
}
export interface ImportProtectionPerfRecorder {
    count: (name: string, value?: number) => void;
    time: (name: string, startedAt: number) => void;
}
export interface TransformResult {
    code: string;
    filename?: string;
    map: SourceMapLike | undefined;
    originalCode: string | undefined;
    originalResult?: TransformResult;
    /** Precomputed line index for `code` (index → line/col). */
    lineIndex?: LineIndex;
    parsedAst?: ParseAstResult;
    analysis?: ImportAnalysis;
    perf?: ImportProtectionPerfRecorder;
}
/**
 * Provides the transformed code and composed sourcemap for a module.
 *
 * Populated from a late-running transform hook. By the time `resolveId`
 * fires for an import, the importer has already been fully transformed.
 */
export interface TransformResultProvider {
    getTransformResult: (id: string) => TransformResult | undefined;
}
export interface ImportSpecifierLocationIndex {
    find: FindImportSpecifierLocationIndex;
}
export type LineIndex = {
    offsets: Array<number>;
};
export declare function buildLineIndex(code: string): LineIndex;
export declare function indexToLineColumn(lineIndex: LineIndex, idx: number): {
    line: number;
    column: number;
};
export declare function normalizeSourceMap(map: SourceMapLike | null | undefined): {
    version: number;
    file: string;
    sourceRoot?: string;
    sources: Array<string>;
    names: Array<string>;
    sourcesContent?: Array<string>;
    mappings: string;
} | undefined;
/**
 * Pick the most-likely original source text for `importerFile` from
 * a sourcemap that may contain multiple sources.
 */
export declare function pickOriginalCodeFromSourcesContent(map: SourceMapLike | undefined, importerFile: string, root: string): string | undefined;
export type ImportLocEntry = {
    file?: string;
    line: number;
    column: number;
};
/**
 * Cache for import statement locations with reverse index for O(1)
 * invalidation by file.  Keys: `${importerFile}::${source}`.
 */
export declare class ImportLocCache {
    private cache;
    private reverseIndex;
    has(key: string): boolean;
    get(key: string): ImportLocEntry | null | undefined;
    set(key: string, value: ImportLocEntry | null): void;
    clear(): void;
    /** Remove all cache entries where the importer matches `file`. */
    deleteByFile(file: string): void;
}
export type FindImportSpecifierLocationIndex = (result: TransformResult, source: string) => number;
export declare function getOrCreateOriginalTransformResult(result: TransformResult, importerFile?: string, root?: string): TransformResult | undefined;
export declare function createImportSpecifierLocationIndex(): ImportSpecifierLocationIndex;
/**
 * Find the location of an import statement in a transformed module
 * by searching the post-transform code and mapping back via sourcemap.
 * Results are cached in `importLocCache`.
 */
export declare function findImportStatementLocationFromTransformed(provider: TransformResultProvider, importerId: string, source: string, importLocCache: ImportLocCache, findImportSpecifierLocationIndex: FindImportSpecifierLocationIndex): Promise<Loc | undefined>;
/**
 * Find the first post-compile usage location for a denied import specifier.
 * Best-effort: searches transformed code for non-import uses of imported
 * bindings and maps back to original source via sourcemap.
 */
export declare function findPostCompileUsageLocation(provider: TransformResultProvider, importerId: string, source: string): Promise<Loc | undefined>;
/**
 * Best-effort original-source usage lookup for cases where a later transform
 * removes or rewrites the import from emitted code but preserves the original
 * source in `sourcesContent`.
 */
export declare function findOriginalUsageLocation(provider: TransformResultProvider, importerId: string, source: string, envType?: 'client' | 'server', root?: string): Loc | undefined;
/**
 * Annotate each trace hop with the location of the import that created the
 * edge (file:line:col). Skips steps that already have a location.
 */
export declare function addTraceImportLocations(provider: TransformResultProvider, trace: Array<{
    file: string;
    specifier?: string;
    line?: number;
    column?: number;
}>, importLocCache: ImportLocCache, findImportSpecifierLocationIndex: FindImportSpecifierLocationIndex): Promise<void>;
export interface CodeSnippet {
    /** Source lines with line numbers, e.g. `["  6 | import { getSecret } from './secret.server'", ...]` */
    lines: Array<string>;
    /** The highlighted line (1-indexed original line number) */
    highlightLine: number;
    /** Clickable file:line reference */
    location: string;
}
/**
 * Build a vitest-style code snippet showing lines surrounding a location.
 *
 * Prefers `originalCode` from the sourcemap's sourcesContent; falls back
 * to transformed code when unavailable.
 */
export declare function buildCodeSnippet(provider: TransformResultProvider, moduleId: string, loc: Loc, contextLines?: number, root?: string): CodeSnippet | undefined;
