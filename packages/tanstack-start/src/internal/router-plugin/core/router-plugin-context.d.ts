import { GetRoutesByFileMapResult } from '#tanstack-start/router-generator';
export type RouterPluginContext = {
	routesByFile: GetRoutesByFileMapResult;
};
export declare function createRouterPluginContext(): RouterPluginContext;
