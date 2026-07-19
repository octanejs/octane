import { configSchema, CodeSplittingOptions, Config } from './core/config.cjs';
import { RouterPluginContext } from './core/router-plugin-context.cjs';
/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterGeneratorWebpack()],
 * }
 * ```
 */
declare const TanStackRouterGeneratorWebpack: (options?: Partial<Config>, routerPluginContext?: RouterPluginContext) => import('unplugin').WebpackPluginInstance;
/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [TanStackRouterCodeSplitterWebpack()],
 * }
 * ```
 */
declare const TanStackRouterCodeSplitterWebpack: (options?: Partial<Config>, routerPluginContext?: RouterPluginContext) => import('unplugin').WebpackPluginInstance;
/**
 * @example
 * ```ts
 * export default {
 *   // ...
 *   plugins: [tanstackRouter()],
 * }
 * ```
 */
declare const TanStackRouterWebpack: (options?: unknown) => import('unplugin').WebpackPluginInstance;
declare const tanstackRouter: (options?: unknown) => import('unplugin').WebpackPluginInstance;
export default TanStackRouterWebpack;
export { configSchema, TanStackRouterWebpack, TanStackRouterGeneratorWebpack, TanStackRouterCodeSplitterWebpack, tanstackRouter, };
export type { Config, CodeSplittingOptions, RouterPluginContext };
