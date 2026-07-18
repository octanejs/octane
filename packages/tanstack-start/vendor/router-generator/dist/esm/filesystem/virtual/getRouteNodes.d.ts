import { VirtualRouteNode } from '@tanstack/virtual-file-routes';
import { GetRouteNodesResult, RouteNode } from '../../types.js';
import { Config } from '../../config.js';
import { TokenRegexBundle } from '../physical/getRouteNodes.js';
export declare function getRouteNodes(tsrConfig: Pick<Config, 'routesDirectory' | 'virtualRouteConfig' | 'routeFileIgnorePrefix' | 'disableLogging' | 'indexToken' | 'routeToken'>, root: string, tokenRegexes: TokenRegexBundle): Promise<GetRouteNodesResult>;
export declare function getRouteNodesRecursive(tsrConfig: Pick<Config, 'routesDirectory' | 'routeFileIgnorePrefix' | 'disableLogging' | 'indexToken' | 'routeToken'>, root: string, fullDir: string, nodes: Array<VirtualRouteNode> | undefined, tokenRegexes: TokenRegexBundle, parent?: RouteNode): Promise<{
    children: Array<RouteNode>;
    physicalDirectories: Array<string>;
}>;
