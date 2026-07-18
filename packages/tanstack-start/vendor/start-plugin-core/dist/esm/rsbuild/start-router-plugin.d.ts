import { RsbuildPluginAPI } from '@rsbuild/core';
import { GetConfigFn, TanStackStartCoreOptions } from '../types.js';
import { TanStackStartRsbuildInputConfig } from './schema.js';
/**
 * Registers the TanStack Router generator and code-splitter plugins
 * as rspack plugins via `modifyRspackConfig`.
 *
 * The router-plugin package exports rspack-compatible unplugin wrappers:
 * - TanStackRouterGeneratorRspack: file-based route generation
 * - TanStackRouterCodeSplitterRspack: route code splitting
 */
export declare function registerRouterPlugins(api: RsbuildPluginAPI, opts: {
    getConfig: GetConfigFn;
    corePluginOpts: TanStackStartCoreOptions;
    startPluginOpts: TanStackStartRsbuildInputConfig;
}): void;
