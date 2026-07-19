import { configSchema, CodeSplittingOptions, Config } from './core/config.cjs';
import { RouterPluginContext } from './core/router-plugin-context.cjs';
type RspackRouterPluginOptions = Partial<Config> | (() => Partial<Config>);
/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [TanStackRouterGeneratorRspack()],
 *     },
 *   },
 * })
 * ```
 */
declare const TanStackRouterGeneratorRspack: (options?: RspackRouterPluginOptions, routerPluginContext?: RouterPluginContext) => import('unplugin').RspackPluginInstance;
/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [TanStackRouterCodeSplitterRspack()],
 *     },
 *   },
 * })
 * ```
 */
declare const TanStackRouterCodeSplitterRspack: (options?: RspackRouterPluginOptions, routerPluginContext?: RouterPluginContext) => import('unplugin').RspackPluginInstance;
/**
 * @example
 * ```ts
 * export default defineConfig({
 *   // ...
 *   tools: {
 *     rspack: {
 *       plugins: [tanstackRouter()],
 *     },
 *   },
 * })
 * ```
 */
declare const TanStackRouterRspack: (options?: unknown) => import('unplugin').RspackPluginInstance;
declare const tanstackRouter: (options?: unknown) => import('unplugin').RspackPluginInstance;
export default TanStackRouterRspack;
export { configSchema, TanStackRouterRspack, TanStackRouterGeneratorRspack, TanStackRouterCodeSplitterRspack, tanstackRouter, };
export type { Config, CodeSplittingOptions, RouterPluginContext };
