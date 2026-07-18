import { CompileStartFrameworkOptions, GetConfigFn, ResolvedStartConfig } from '../types.js';
import { PluginOption, ViteBuilder } from 'vite';
export declare function createDevClientEntryPlugin(opts: {
    framework: CompileStartFrameworkOptions;
    getClientEntry: () => string;
}): PluginOption;
export declare function createPostBuildPlugin(opts: {
    getConfig: GetConfigFn;
    postServerBuild: (opts: {
        startConfig: ReturnType<GetConfigFn>['startConfig'];
        builder: ViteBuilder;
    }) => Promise<void>;
}): PluginOption;
export declare function createDevBaseRewritePlugin(opts: {
    shouldRewriteDevBase: () => boolean;
    resolvedStartConfig: ResolvedStartConfig;
}): PluginOption;
