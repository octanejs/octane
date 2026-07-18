import { SERVER_FN_LOOKUP } from '../../constants.js';
import { CompileStartFrameworkOptions, StartCompilerImportTransform, StartCompilerPlugin } from '../../types.js';
import { GenerateFunctionIdFnOptional } from '../../start-compiler/types.js';
import { PluginOption } from 'vite';
export { SERVER_FN_LOOKUP };
export interface StartCompilerPluginOptions {
    framework: CompileStartFrameworkOptions;
    environments: Array<{
        name: string;
        type: 'client' | 'server';
        getServerFnById?: string;
    }>;
    /**
     * Custom function ID generator (optional).
     */
    generateFunctionId?: GenerateFunctionIdFnOptional;
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
    compilerPlugins?: Array<StartCompilerPlugin> | undefined;
    serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined;
    /**
     * The Vite environment name for the server function provider.
     */
    providerEnvName: string;
}
export declare function startCompilerPlugin(opts: StartCompilerPluginOptions): PluginOption;
