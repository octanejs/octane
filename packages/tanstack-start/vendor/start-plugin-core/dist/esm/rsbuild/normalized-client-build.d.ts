import { RsbuildPluginAPI, Rspack } from '@rsbuild/core';
import { NormalizedClientBuild } from '../types.js';
type RspackCompilation = Rspack.Compilation;
/**
 * Normalize an rspack compilation into a NormalizedClientBuild.
 *
 * Iterates ALL chunks in the compilation (initial + async), not just
 * entrypoint chunks, to ensure route-split async chunks are included.
 */
export declare function normalizeRspackClientBuild(compilation: RspackCompilation): NormalizedClientBuild;
/**
 * Registers a processAssets hook to capture the client build stats
 * after compilation. Returns a getter for the captured build.
 */
export declare function registerClientBuildCapture(api: RsbuildPluginAPI): {
    getClientBuild: () => NormalizedClientBuild | undefined;
};
export {};
