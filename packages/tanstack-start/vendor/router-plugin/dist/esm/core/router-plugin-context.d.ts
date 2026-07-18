import { GetRoutesByFileMapResult } from '@tanstack/router-generator';
export type RouterPluginContext = {
    routesByFile: GetRoutesByFileMapResult;
};
export declare function createRouterPluginContext(): RouterPluginContext;
