export interface TraceEdge {
    importer: string;
    specifier?: string;
}
/**
 * Per-environment reverse import graph.
 * Maps a resolved module id to the set of modules that import it.
 */
export declare class ImportGraph {
    /**
     * resolvedId -> Map<importer, specifier>
     *
     * We use a Map instead of a Set of objects so edges dedupe correctly.
     */
    readonly reverseEdges: Map<string, Map<string, string | undefined>>;
    /**
     * Forward-edge index: importer -> Set<resolvedId>.
     *
     * Maintained alongside reverseEdges so that {@link invalidate} can remove
     * all outgoing edges for a file in O(outgoing-edges) instead of scanning
     * every reverse-edge map in the graph.
     */
    private readonly forwardEdges;
    readonly entries: Set<string>;
    addEdge(resolved: string, importer: string, specifier?: string): void;
    /** Convenience for tests/debugging. */
    getEdges(resolved: string): Set<TraceEdge> | undefined;
    addEntry(id: string): void;
    clear(): void;
    invalidate(id: string): void;
}
export interface TraceStep {
    file: string;
    specifier?: string;
    line?: number;
    column?: number;
}
export interface Loc {
    file?: string;
    line: number;
    column: number;
}
/**
 * BFS from a node upward through reverse edges to find the shortest
 * path to an entry module.
 */
export declare function buildTrace(graph: ImportGraph, startNode: string, maxDepth?: number): Array<TraceStep>;
export interface ViolationInfo {
    env: string;
    envType: 'client' | 'server';
    type: 'specifier' | 'file' | 'marker';
    behavior: 'error' | 'mock';
    pattern?: string | RegExp;
    specifier: string;
    importer: string;
    importerLoc?: Loc;
    resolved?: string;
    trace: Array<TraceStep>;
    /** Vitest-style code snippet showing the offending usage in the leaf module. */
    snippet?: {
        lines: Array<string>;
        highlightLine: number;
        location: string;
    };
}
/**
 * Suggestion strings for server-only code leaking into client environments.
 * Used by both `formatViolation` (terminal) and runtime mock modules (browser).
 */
export declare const CLIENT_ENV_SUGGESTIONS: readonly ["Use createServerFn().handler(() => ...) to keep the logic on the server and call it from the client via an RPC bridge", "Use createServerOnlyFn(() => ...) to mark it as server-only (it will throw if accidentally called from the client)", "Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations", "Move the server-only import out of this file into a separate .server.ts module that is not imported by any client code"];
/**
 * Suggestion strings for client-only code leaking into server environments.
 * The JSX-specific suggestion is conditionally prepended by `formatViolation`.
 */
export declare const SERVER_ENV_SUGGESTIONS: readonly ["Use createClientOnlyFn(() => ...) to mark it as client-only (returns undefined on the server)", "Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations", "Move the client-only import out of this file into a separate .client.ts module that is not imported by any server code"];
export declare function formatViolation(info: ViolationInfo, root: string): string;
