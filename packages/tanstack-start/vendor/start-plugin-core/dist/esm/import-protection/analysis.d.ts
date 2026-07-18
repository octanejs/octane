import { LineIndex, TransformResult } from './sourceLocation.js';
import { ParseAstResult } from '@tanstack/router-utils';
export type UsagePos = {
    line: number;
    column0: number;
};
type BoundaryEnv = 'client' | 'server';
type ImportBindingInfo = {
    importedLocalNames: Set<string>;
};
type UsageCacheKey = `${BoundaryEnv | 'post'}::${string}`;
export type ImportAnalysis = {
    ast: ParseAstResult;
    lineIndex: LineIndex;
    importSourcesInOrder: Array<string>;
    importSpecifierLocationIndex: Map<string, number>;
    importBindingsBySource: Map<string, ImportBindingInfo>;
    mockExportNamesBySource: Map<string, Array<string>>;
    namedExports: Array<string>;
    usageByKey: Map<UsageCacheKey, UsagePos | null>;
};
export declare function isValidExportName(name: string): boolean;
export declare function getOrCreateImportAnalysis(result: TransformResult): ImportAnalysis;
export declare function getImportSourcesFromResult(result: TransformResult): Array<string>;
export declare function getImportSources(code: string, filename?: string, perf?: TransformResult['perf']): Array<string>;
export declare function getImportSpecifierLocationFromResult(result: TransformResult, source: string): number;
export declare function getMockExportNamesBySourceFromResult(result: TransformResult): Map<string, Array<string>>;
export declare function getMockExportNamesBySource(code: string, filename?: string, perf?: TransformResult['perf']): Map<string, Array<string>>;
export declare function getNamedExportsFromResult(result: TransformResult): Array<string>;
export declare function getNamedExports(code: string, filename?: string, perf?: TransformResult['perf']): Array<string>;
export declare function findPostCompileUsagePosFromResult(result: TransformResult, source: string): UsagePos | undefined;
export declare function findPostCompileUsagePos(code: string, source: string): UsagePos | undefined;
export declare function findOriginalUnsafeUsagePosFromResult(result: TransformResult, source: string, envType: BoundaryEnv): UsagePos | undefined;
export declare function findOriginalUnsafeUsagePos(code: string, source: string, envType: BoundaryEnv): UsagePos | undefined;
export {};
