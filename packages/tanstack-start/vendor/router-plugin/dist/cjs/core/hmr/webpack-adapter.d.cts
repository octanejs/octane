import { Config } from '../config.cjs';
import type * as t from '@babel/types';
/**
 * Emits HMR accept code for bundlers with webpack-compatible `module.hot`
 * semantics (classic webpack via `import.meta.webpackHot`, and Rspack).
 *
 * Unlike Vite's `hot.accept((newModule) => {...})` — where the callback receives
 * the freshly re-imported module — webpack re-executes the module factory on
 * accept, so our HMR logic must live at module top level and read the previous
 * `routeId` out of `hot.data`. `hot.dispose` stashes it for the next run, and
 * `hot.accept()` (no callback) enrolls us as a self-accepting boundary.
 *
 * Returns an array of statements that patches route definitions during HMR.
 */
export declare function createWebpackHmrStatement(stableRouteOptionKeys: Array<string>, opts: {
    targetFramework: Config['target'];
    routeId?: string;
    routeSignature?: string;
}): Array<t.Statement>;
