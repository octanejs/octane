import { GetRoutesByFileMapResult } from '../../router-generator/index.js';
export type RouterPluginContext = {
	routesByFile: GetRoutesByFileMapResult;
};
export declare function createRouterPluginContext(): RouterPluginContext;
