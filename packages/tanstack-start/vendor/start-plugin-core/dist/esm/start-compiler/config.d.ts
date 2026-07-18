import { LookupConfig } from './compiler.js';
import { CompileStartFrameworkOptions, StartCompilerImportTransform, StartCompilerPlugin } from '../types.js';
export declare function getTransformCodeFilterForEnv(env: 'client' | 'server', opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
    compilerPlugins?: Array<StartCompilerPlugin> | undefined;
}): Array<RegExp>;
export declare function getLookupConfigurationsForEnv(env: 'client' | 'server', framework: CompileStartFrameworkOptions, opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined;
}): Array<LookupConfig>;
