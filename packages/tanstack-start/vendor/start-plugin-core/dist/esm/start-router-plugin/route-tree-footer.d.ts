import { GetConfigFn, TanStackStartCoreOptions } from '../types.js';
export declare function buildRouteTreeFileFooterFromConfig(opts: {
    generatedRouteTreePath: string;
    getConfig: GetConfigFn;
    corePluginOpts: TanStackStartCoreOptions;
}): Array<string>;
