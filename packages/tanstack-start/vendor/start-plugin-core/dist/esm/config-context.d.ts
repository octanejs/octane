import { resolveStartEntryPlan } from './planning.js';
import { TanStackStartOutputConfig } from './schema.js';
import { GetConfigFn, ResolvedStartConfig, TanStackStartCoreOptions } from './types.js';
export interface StartConfigContext {
    resolvedStartConfig: ResolvedStartConfig;
    getConfig: GetConfigFn;
    resolveEntries: () => ReturnType<typeof resolveStartEntryPlan>;
}
export declare function createStartConfigContext<TInputConfig>(opts: {
    corePluginOpts: TanStackStartCoreOptions;
    startPluginOpts: TInputConfig | undefined;
    parseConfig: (opts: TInputConfig | undefined, core: {
        framework: TanStackStartCoreOptions['framework'];
    }, root: string) => TanStackStartOutputConfig;
}): StartConfigContext;
export declare function applyResolvedBaseAndOutput(opts: {
    resolvedStartConfig: ResolvedStartConfig;
    root: string;
    publicBase: string;
    clientOutputDirectory: string;
    serverOutputDirectory: string;
}): void;
export declare function applyResolvedRouterBasepath(opts: {
    resolvedStartConfig: ResolvedStartConfig;
    startConfig: TanStackStartOutputConfig;
}): string;
