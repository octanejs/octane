import { Config, HmrStyle } from '../config.js';
import type * as t from '@babel/types';
export type CreateRouteHmrStatementOpts = {
    hmrStyle: HmrStyle;
    targetFramework: Config['target'];
    routeId?: string;
    routeSignature?: string;
};
/**
 * Dispatches to the configured HMR adapter. `hmrStyle` is set explicitly by
 * the bundler-specific plugin entry (e.g. `rspack.ts` → `'webpack'`), so there
 * is no runtime inference based on config string shapes.
 */
export declare function createRouteHmrStatement(stableRouteOptionKeys: Array<string>, opts: CreateRouteHmrStatementOpts): Array<t.Statement>;
