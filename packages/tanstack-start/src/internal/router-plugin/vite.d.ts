import { configSchema, getConfig, CodeSplittingOptions, Config } from './core/config.js';
import { RouterPluginContext } from './core/router-plugin-context.js';
type RouterPluginOptions = Partial<Config | (() => Config)> | undefined;
/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanstackRouterGenerator()],
 *   // ...
 * })
 * ```
 */
declare const tanstackRouterGenerator: (
	options?: RouterPluginOptions,
	routerPluginContext?: RouterPluginContext,
) => import('vite').Plugin<any> | import('vite').Plugin<any>[];
/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [tanStackRouterCodeSplitter()],
 *   // ...
 * })
 * ```
 */
declare const tanStackRouterCodeSplitter: (
	options?: RouterPluginOptions,
	routerPluginContext?: RouterPluginContext,
) => import('vite').Plugin<any> | import('vite').Plugin<any>[];
/**
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
		| Partial<
				| {
						target: 'vue' | 'react' | 'solid' | 'octane';
						routeFileIgnorePrefix: string;
						routesDirectory: string;
						quoteStyle: 'single' | 'double';
						semicolons: boolean;
						disableLogging: boolean;
						routeTreeFileHeader: string[];
						indexToken:
							| string
							| RegExp
							| {
									regex: string;
									flags?: string | undefined;
							  };
						routeToken:
							| string
							| RegExp
							| {
									regex: string;
									flags?: string | undefined;
							  };
						generatedRouteTree: string;
						disableTypes: boolean;
						addExtensions: string | boolean;
						enableRouteTreeFormatting: boolean;
						tmpDir: string;
						importRoutesUsingAbsolutePaths: boolean;
						virtualRouteConfig?:
							string | import('@tanstack/virtual-file-routes').VirtualRootRoute | undefined;
						routeFilePrefix?: string | undefined;
						routeFileIgnorePattern?: string | undefined;
						pathParamsAllowedCharacters?:
							(':' | '$' | ';' | '@' | '&' | '=' | '+' | ',')[] | undefined;
						routeTreeFileFooter?: string[] | (() => Array<string>) | undefined;
						autoCodeSplitting?: boolean | undefined;
						customScaffolding?:
							| {
									routeTemplate?: string | undefined;
									lazyRouteTemplate?: string | undefined;
							  }
							| undefined;
						experimental?:
							| {
									enableCodeSplitting?: boolean | undefined;
							  }
							| undefined;
						plugins?: import('#tanstack-start/router-generator').GeneratorPlugin[] | undefined;
						enableRouteGeneration?: boolean | undefined;
						codeSplittingOptions?: CodeSplittingOptions | undefined;
						plugin?:
							| {
									hmr?:
										| {
												style?: 'vite' | 'webpack' | undefined;
										  }
										| undefined;
									vite?:
										| {
												environmentName?: string | undefined;
										  }
										| undefined;
							  }
							| undefined;
				  }
				| (() => Config)
		  >
		| undefined,
) => import('vite').Plugin<any> | import('vite').Plugin<any>[];
/**
 * @deprecated Use `tanstackRouter` instead.
 */
declare const TanStackRouterVite: (
	options?:
		| Partial<
				| {
						target: 'vue' | 'react' | 'solid' | 'octane';
						routeFileIgnorePrefix: string;
						routesDirectory: string;
						quoteStyle: 'single' | 'double';
						semicolons: boolean;
						disableLogging: boolean;
						routeTreeFileHeader: string[];
						indexToken:
							| string
							| RegExp
							| {
									regex: string;
									flags?: string | undefined;
							  };
						routeToken:
							| string
							| RegExp
							| {
									regex: string;
									flags?: string | undefined;
							  };
						generatedRouteTree: string;
						disableTypes: boolean;
						addExtensions: string | boolean;
						enableRouteTreeFormatting: boolean;
						tmpDir: string;
						importRoutesUsingAbsolutePaths: boolean;
						virtualRouteConfig?:
							string | import('@tanstack/virtual-file-routes').VirtualRootRoute | undefined;
						routeFilePrefix?: string | undefined;
						routeFileIgnorePattern?: string | undefined;
						pathParamsAllowedCharacters?:
							(':' | '$' | ';' | '@' | '&' | '=' | '+' | ',')[] | undefined;
						routeTreeFileFooter?: string[] | (() => Array<string>) | undefined;
						autoCodeSplitting?: boolean | undefined;
						customScaffolding?:
							| {
									routeTemplate?: string | undefined;
									lazyRouteTemplate?: string | undefined;
							  }
							| undefined;
						experimental?:
							| {
									enableCodeSplitting?: boolean | undefined;
							  }
							| undefined;
						plugins?: import('#tanstack-start/router-generator').GeneratorPlugin[] | undefined;
						enableRouteGeneration?: boolean | undefined;
						codeSplittingOptions?: CodeSplittingOptions | undefined;
						plugin?:
							| {
									hmr?:
										| {
												style?: 'vite' | 'webpack' | undefined;
										  }
										| undefined;
									vite?:
										| {
												environmentName?: string | undefined;
										  }
										| undefined;
							  }
							| undefined;
				  }
				| (() => Config)
		  >
		| undefined,
) => import('vite').Plugin<any> | import('vite').Plugin<any>[];
export default tanstackRouter;
export {
	configSchema,
	getConfig,
	tanStackRouterCodeSplitter,
	tanstackRouterGenerator,
	TanStackRouterVite,
	tanstackRouter,
};
export type { Config, CodeSplittingOptions, RouterPluginContext };
