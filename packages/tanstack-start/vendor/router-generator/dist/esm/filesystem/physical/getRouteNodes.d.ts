import { FsRouteType, GetRouteNodesResult } from '../../types.js';
import { Config } from '../../config.js';
/**
 * Pre-compiled segment regexes for matching token patterns against route segments.
 * These are created once (in Generator constructor) and passed through to avoid
 * repeated regex compilation during route crawling.
 */
export interface TokenRegexBundle {
    indexTokenSegmentRegex: RegExp;
    routeTokenSegmentRegex: RegExp;
}
export declare function isVirtualConfigFile(fileName: string): boolean;
export declare function getRouteNodes(config: Pick<Config, 'routesDirectory' | 'routeFilePrefix' | 'routeFileIgnorePrefix' | 'routeFileIgnorePattern' | 'disableLogging' | 'routeToken' | 'indexToken'>, root: string, tokenRegexes: TokenRegexBundle): Promise<GetRouteNodesResult>;
/**
 * Determines the metadata for a given route path based on the provided configuration.
 *
 * @param routePath - The determined initial routePath (with brackets removed).
 * @param originalRoutePath - The original route path (may contain brackets for escaped content).
 * @param tokenRegexes - Pre-compiled token regexes for matching.
 * @returns An object containing the type of the route and the variable name derived from the route path.
 */
export declare function getRouteMeta(routePath: string, originalRoutePath: string, tokenRegexes: TokenRegexBundle): {
    fsRouteType: Extract<FsRouteType, 'static' | 'layout' | 'api' | 'lazy' | 'loader' | 'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent'>;
    variableName: string;
};
