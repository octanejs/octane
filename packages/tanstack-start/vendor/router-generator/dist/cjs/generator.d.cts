import { TargetTemplate } from './template.cjs';
import { GetRoutesByFileMapResult, HandleNodeAccumulator, RouteNode } from './types.cjs';
import { Config } from './config.cjs';
interface fs {
    stat: (filePath: string) => Promise<{
        mtimeMs: bigint;
        mode: number;
        uid: number;
        gid: number;
    }>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    readFile: (filePath: string) => Promise<{
        stat: {
            mtimeMs: bigint;
        };
        fileContent: string;
    } | 'file-not-existing'>;
    chmod: (filePath: string, mode: number) => Promise<void>;
    chown: (filePath: string, uid: number, gid: number) => Promise<void>;
}
export type FileEventType = 'create' | 'update' | 'delete';
export type FileEvent = {
    type: FileEventType;
    path: string;
};
export type GeneratorEvent = FileEvent | {
    type: 'rerun';
};
interface CrawlingResult {
    rootRouteNode: RouteNode;
    routeFileResult: Array<RouteNode>;
    acc: HandleNodeAccumulator;
}
export declare class Generator {
    /**
     * why do we have two caches for the route files?
     * During processing, we READ from the cache and WRITE to the shadow cache.
     *
     * After a route file is processed, we write to the shadow cache.
     * If during processing we bail out and re-run, we don't lose this modification
     * but still can track whether the file contributed changes and thus the route tree file needs to be regenerated.
     * After all files are processed, we swap the shadow cache with the main cache and initialize a new shadow cache.
     * That way we also ensure deleted/renamed files don't stay in the cache forever.
     */
    private routeNodeCache;
    private routeNodeShadowCache;
    private routeTreeFileCache;
    private crawlingResult;
    config: Config;
    targetTemplate: TargetTemplate;
    private root;
    private routesDirectoryPath;
    private sessionId?;
    private fs;
    private logger;
    private generatedRouteTreePath;
    private runPromise;
    private fileEventQueue;
    private plugins;
    private static routeGroupPatternRegex;
    private physicalDirectories;
    /**
     * Token regexes are pre-compiled once here and reused throughout route processing.
     * We need TWO types of regex for each token because they match against different inputs:
     *
     * 1. FILENAME regexes: Match token patterns within full file path strings.
     *    Example: For file "routes/dashboard.index.tsx", we want to detect ".index."
     *    Pattern: `[./](?:token)[.]` - matches token bounded by path separators/dots
     *    Used in: sorting route nodes by file path
     *
     * 2. SEGMENT regexes: Match token against a single logical route segment.
     *    Example: For segment "index" (extracted from path), match the whole segment
     *    Pattern: `^(?:token)$` - matches entire segment exactly
     *    Used in: route parsing, determining route types, escape detection
     *
     * We cannot reuse one for the other without false positives or missing matches.
     */
    private indexTokenFilenameRegex;
    private routeTokenFilenameRegex;
    private indexTokenSegmentRegex;
    private routeTokenSegmentRegex;
    private static componentPieceRegex;
    constructor(opts: {
        config: Config;
        root: string;
        fs?: fs;
    });
    private getGeneratedRouteTreePath;
    private getRoutesDirectoryPath;
    getRoutesByFileMap(): GetRoutesByFileMapResult;
    private fillRouteTemplate;
    private getParseSource;
    run(event?: GeneratorEvent): Promise<void>;
    private generatorInternal;
    private swapCaches;
    buildRouteTree(opts: {
        rootRouteNode: RouteNode;
        acc: HandleNodeAccumulator;
        routeFileResult: Array<RouteNode>;
        config?: Partial<Config>;
    }): {
        routeTreeContent: string;
        routeTree: RouteNode[];
        routeNodes: RouteNode[];
    };
    private processRouteNodeFile;
    private didRouteFileChangeComparedToCache;
    private didFileChangeComparedToCache;
    private safeFileWrite;
    private getTempFileName;
    private isRouteFileCacheFresh;
    private handleRootNode;
    getCrawlingResult(): Promise<CrawlingResult | undefined>;
    private static handleNode;
    private isFileRelevantForRouteTreeGeneration;
}
export {};
