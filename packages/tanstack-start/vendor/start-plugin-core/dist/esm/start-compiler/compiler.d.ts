import { DevServerFnModuleSpecifierEncoder, ServerFn } from './types.js';
import { ModuleInfoBinding } from '@tanstack/router-utils';
import { CompileStartFrameworkOptions, StartCompilerEnvironment, StartCompilerImportTransform, StartCompilerPlugin, StartCompilerTransformResult } from '../types.js';
type Binding = ModuleInfoBinding & {
    resolvedKind?: Kind;
};
type Kind = 'None' | `Root` | `Builder` | LookupKind;
export type BuiltInLookupKind = 'ServerFn' | 'Middleware' | 'IsomorphicFn' | 'ServerOnlyFn' | 'ClientOnlyFn' | 'ClientOnlyJSX';
export type ExternalLookupKind = `External:${string}`;
export type LookupKind = BuiltInLookupKind | ExternalLookupKind;
export declare function getExternalLookupKind(transform: StartCompilerImportTransform): ExternalLookupKind;
export declare function isCompilerTransformEnabledForEnv(transform: StartCompilerImportTransform, env: StartCompilerEnvironment): boolean;
export declare function isStartCompilerPluginEnabledForEnv(plugin: StartCompilerPlugin, env: StartCompilerEnvironment): boolean;
export declare const KindDetectionPatterns: Record<BuiltInLookupKind, RegExp>;
export declare const LookupKindsPerEnv: Record<'client' | 'server', Set<BuiltInLookupKind>>;
export declare function getLookupKindsForEnv(env: 'client' | 'server', opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
}): Set<LookupKind>;
/**
 * Detects which LookupKinds are present in the code using string matching.
 * This is a fast pre-scan before AST parsing to limit the work done during compilation.
 */
export declare function detectKindsInCode(code: string, env: 'client' | 'server', opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
}): Set<LookupKind>;
export type LookupConfig = {
    libName: string;
    rootExport: string;
    kind: LookupKind | 'Root';
};
interface ModuleInfo {
    id: string;
    bindings: Map<string, Binding>;
    exports: Map<string, string>;
    reExportAllSources: Array<string>;
}
export declare class StartCompiler {
    private options;
    private moduleCache;
    private initialized;
    private validLookupKinds;
    private externalTransformsByKind;
    private externalLookupSetup;
    private compilerPlugins;
    private externalDirectCallKindsBySource;
    private resolveIdCache;
    private exportResolutionCache;
    private knownRootImports;
    private entryIdToFunctionId;
    private functionIds;
    constructor(options: {
        env: 'client' | 'server';
        envName: string;
        root: string;
        lookupConfigurations: Array<LookupConfig>;
        lookupKinds: Set<LookupKind>;
        loadModule: (id: string) => Promise<void>;
        resolveId: (id: string, importer?: string) => Promise<string | null>;
        /**
         * In 'build' mode, resolution results are cached for performance.
         * In 'dev' mode (default), caching is disabled to avoid invalidation complexity with HMR.
         */
        mode?: 'dev' | 'build';
        /**
         * The framework being used (e.g., 'react', 'solid').
         */
        framework: CompileStartFrameworkOptions;
        /**
         * The Vite environment name for the server function provider.
         */
        providerEnvName: string;
        /**
         * Custom function ID generator (optional, defaults to hash-based).
         */
        generateFunctionId?: (opts: {
            filename: string;
            functionName: string;
        }) => string | undefined;
        /**
         * Callback when server functions are discovered.
         * Called after each file is compiled with its new functions.
         */
        onServerFnsById?: (d: Record<string, ServerFn>) => void;
        compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
        compilerPlugins?: Array<StartCompilerPlugin> | undefined;
        serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined;
        warn?: (message: string) => void;
        /**
         * Returns the currently known server functions from previous builds.
         * Used by server callers to look up canonical extracted filenames.
         */
        getKnownServerFns: () => Record<string, ServerFn>;
        devServerFnModuleSpecifierEncoder?: DevServerFnModuleSpecifierEncoder;
    });
    /**
     * Generates a unique function ID for a server function.
     * In dev mode, uses a base64-encoded JSON with file path and export name.
     * In build mode, uses SHA256 hash or custom generator.
     */
    private generateFunctionId;
    private get mode();
    private getExternalDirectCallCandidates;
    private resolveIdCached;
    private getExportResolutionCache;
    private init;
    /**
     * Extracts bindings and exports from an already-parsed AST.
     */
    private extractModuleInfo;
    ingestModule({ code, id, parserFilename, }: {
        code: string;
        id: string;
        parserFilename?: string;
    }): {
        info: ModuleInfo;
        ast: import('@tanstack/router-utils').ParseAstResult;
    };
    invalidateModule(id: string): boolean;
    invalidateModules(ids: Iterable<string>): Set<string>;
    getTransitiveImporters(ids: string | Iterable<string>): Promise<Set<string>>;
    compile({ code, id, parserFilename, detectedKinds, warn, }: {
        code: string;
        id: string;
        parserFilename?: string;
        /** Pre-detected kinds present in this file. If not provided, all valid kinds are checked. */
        detectedKinds?: Set<LookupKind>;
        warn?: (message: string) => void;
    }): Promise<StartCompilerTransformResult | null>;
    private generateResultFromAst;
    private getAstTransformPluginsForCode;
    private runAstTransforms;
    private runExternalTransforms;
    private resolveIdentifierKind;
    /**
     * Recursively find an export in a module, following `export * from` chains.
     * Returns the module info and binding if found, or undefined if not found.
     */
    private findExportInModule;
    private resolveBindingTarget;
    private resolveKnownImportKind;
    private resolveImportKind;
    private resolveBindingKind;
    private resolveExprKind;
    private resolveCalleeKind;
    private getModuleInfo;
}
export {};
