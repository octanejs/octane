import { RsbuildPluginAPI } from '@rsbuild/core';
import { CompileStartFrameworkOptions, StartCompilerImportTransform, StartCompilerPlugin } from '../types.js';
import { GenerateFunctionIdFnOptional, ServerFn } from '../start-compiler/types.js';
type StartCompilerEnvironment = {
    name: string;
    type: 'client' | 'server';
};
export interface StartCompilerHostOptions {
    framework: CompileStartFrameworkOptions;
    root: string | (() => string);
    environments: Array<StartCompilerEnvironment>;
    providerEnvName: string;
    generateFunctionId?: GenerateFunctionIdFnOptional;
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
    compilerPlugins?: Array<StartCompilerPlugin> | undefined;
    serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined;
    serverFnsById?: Record<string, ServerFn>;
    onServerFnsByIdChange?: () => void;
}
/**
 * Registers the shared StartCompiler as rsbuild transforms for client + ssr environments.
 *
 * Uses `api.transform()` to hook into the rsbuild loader pipeline, and the
 * transform context's native `resolve()` for module resolution.
 */
export declare function registerStartCompilerTransforms(api: RsbuildPluginAPI, opts: StartCompilerHostOptions): {
    serverFnsById: Record<string, ServerFn>;
};
export {};
