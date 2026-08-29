import {
	tanstackRouter as tanstackRouterVite,
	tanStackRouterCodeSplitter,
	tanstackRouterGenerator,
	configSchema,
	getConfig,
} from './router-plugin/vite.js';
import { octaneRouteGeneratorPlugin } from './generator-plugin.js';

/**
 * @param {Partial<import('./router-plugin/core/config.js').Config> | (() => import('./router-plugin/core/config.js').Config) | undefined} options
 */
function withOctaneDefaults(options) {
	const resolved = typeof options === 'function' ? options() : (options ?? {});
	return {
		target: 'octane',
		...resolved,
		plugins: [octaneRouteGeneratorPlugin(), ...(resolved.plugins ?? [])],
	};
}

/**
 * TanStack Router's file-based route generation and route-level code
 * splitting, as a standalone Vite plugin — the octane counterpart to
 * upstream `@tanstack/router-plugin/vite`. Usable without
 * `@octanejs/tanstack-start`.
 *
 * `.tsrx` route source is masked by `octaneRouteGeneratorPlugin()` by
 * default so native `@{ }` template bodies survive the generator's
 * TypeScript-oriented parser; pass `plugins` to add more without losing it.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouter()],
 *   // ...
 * })
 * ```
 */
export function tanstackRouter(options, routerPluginContext) {
	return tanstackRouterVite(withOctaneDefaults(options), routerPluginContext);
}

export default tanstackRouter;
export { configSchema, getConfig, tanStackRouterCodeSplitter, tanstackRouterGenerator };
