import { StartCompiler } from './compiler.js';
import { CompileStartFrameworkOptions, StartCompilerImportTransform, StartCompilerPlugin, StartCompilerTransformResult, StartCompilerVirtualModuleContext } from '../types.js';
import { DevServerFnModuleSpecifierEncoder, GenerateFunctionIdFnOptional, ServerFn } from './types.js';
export interface CreateStartCompilerOptions {
    env: 'client' | 'server';
    envName: string;
    root: string;
    framework: CompileStartFrameworkOptions;
    providerEnvName: string;
    mode: 'dev' | 'build';
    generateFunctionId?: GenerateFunctionIdFnOptional;
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
    compilerPlugins?: Array<StartCompilerPlugin> | undefined;
    serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined;
    warn?: (message: string) => void;
    onServerFnsById?: (d: Record<string, ServerFn>) => void;
    getKnownServerFns: () => Record<string, ServerFn>;
    encodeModuleSpecifierInDev?: DevServerFnModuleSpecifierEncoder;
    loadModule: (id: string) => Promise<void>;
    resolveId: (id: string, importer?: string) => Promise<string | null>;
}
export declare function createStartCompiler(options: CreateStartCompilerOptions): StartCompiler;
export declare function mergeServerFnsById(current: Record<string, ServerFn>, next: Record<string, ServerFn>): void;
export declare function matchesCodeFilters(code: string, filters: ReadonlyArray<RegExp>): boolean;
export declare function createCompilerVirtualModuleIdPattern(compilerPlugins: ReadonlyArray<StartCompilerPlugin>): RegExp | undefined;
export declare function loadCompilerVirtualModule(compilerPlugins: ReadonlyArray<StartCompilerPlugin>, context: StartCompilerVirtualModuleContext): StartCompilerTransformResult | null;
