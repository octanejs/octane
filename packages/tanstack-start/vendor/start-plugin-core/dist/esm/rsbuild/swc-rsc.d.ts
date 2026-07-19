import { ModifyRspackConfigFn } from '@rsbuild/core';
type RspackConfig = Parameters<ModifyRspackConfigFn>[0];
/**
 * Walk the rspack config's module.rules and inject
 * `rspackExperiments.reactServerComponents: true` into SWC loaders.
 *
 * Recurses into `oneOf` arrays because rsbuild nests the main SWC loader
 * inside a `oneOf` rule (e.g. separate branches for asset/source vs
 * javascript/auto). Without recursion, only the mimetype-based fallback
 * SWC rule gets the flag, leaving most .js/.ts files without RSC
 * directive detection.
 */
export declare function enableSwcReactServerComponents(config: RspackConfig, scope: 'all' | 'rsc-subtree'): void;
export {};
