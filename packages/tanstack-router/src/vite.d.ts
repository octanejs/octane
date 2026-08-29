import {
	configSchema,
	getConfig,
	CodeSplittingOptions,
	Config,
} from './router-plugin/core/config.js';
import { RouterPluginContext } from './router-plugin/core/router-plugin-context.js';
import { tanStackRouterCodeSplitter, tanstackRouterGenerator } from './router-plugin/vite.js';

/**
 * TanStack Router's file-based route generation and route-level code
 * splitting, as a standalone Vite plugin. `target` defaults to `'octane'`
 * and `octaneRouteGeneratorPlugin()` is always included in `plugins` (ahead
 * of any plugins passed in `options`), so `.tsrx` route files work with no
 * extra configuration.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouter()],
 *   // ...
 * })
 * ```
 */
declare const tanstackRouter: (
	options?:
		Partial<Omit<Config, 'target'> & { target?: Config['target'] }> | (() => Config) | undefined,
	routerPluginContext?: RouterPluginContext,
) => import('vite').Plugin<any> | import('vite').Plugin<any>[];

export default tanstackRouter;
export {
	configSchema,
	getConfig,
	tanStackRouterCodeSplitter,
	tanstackRouterGenerator,
	tanstackRouter,
};
export type { Config, CodeSplittingOptions, RouterPluginContext };
