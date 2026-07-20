import { configSchema, CodeSplittingOptions, Config } from './core/config.js';
import { RouterPluginContext } from './core/router-plugin-context.js';
type RouterPluginOptions = Partial<Config | (() => Config)> | undefined;
/**
 * @example
 * ```ts
 * export default {
 *   plugins: [TanStackRouterGeneratorEsbuild()],
 *   // ...
 * }
 * ```
 */
declare const TanStackRouterGeneratorEsbuild: (
	options?: RouterPluginOptions,
	routerPluginContext?: RouterPluginContext,
) => import('unplugin').EsbuildPlugin;
/**
 * @example
 * ```ts
 * export default {
 *  plugins: [TanStackRouterCodeSplitterEsbuild()],
 *  // ...
 * }
 * ```
 */
declare const TanStackRouterCodeSplitterEsbuild: (
	options?: RouterPluginOptions,
	routerPluginContext?: RouterPluginContext,
) => import('unplugin').EsbuildPlugin;
/**
 * @example
 * ```ts
 * export default {
 *   plugins: [tanstackRouter()],
 *   // ...
 * }
 * ```
 */
declare const TanStackRouterEsbuild: (
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
							| string
							| import('@tanstack/virtual-file-routes').VirtualRootRoute
							| undefined;
						routeFilePrefix?: string | undefined;
						routeFileIgnorePattern?: string | undefined;
						pathParamsAllowedCharacters?:
							| (':' | '$' | ';' | '@' | '&' | '=' | '+' | ',')[]
							| undefined;
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
) => import('unplugin').EsbuildPlugin;
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
							| string
							| import('@tanstack/virtual-file-routes').VirtualRootRoute
							| undefined;
						routeFilePrefix?: string | undefined;
						routeFileIgnorePattern?: string | undefined;
						pathParamsAllowedCharacters?:
							| (':' | '$' | ';' | '@' | '&' | '=' | '+' | ',')[]
							| undefined;
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
) => import('unplugin').EsbuildPlugin;
export default TanStackRouterEsbuild;
export {
	configSchema,
	TanStackRouterGeneratorEsbuild,
	TanStackRouterCodeSplitterEsbuild,
	TanStackRouterEsbuild,
	tanstackRouter,
};
export type { Config, CodeSplittingOptions, RouterPluginContext };
