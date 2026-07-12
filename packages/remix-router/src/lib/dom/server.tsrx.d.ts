// Type declaration for the .tsrx module (resolved by relative path).
import type { Location } from '../router/history';
import type { Router as DataRouter, StaticHandler, StaticHandlerContext } from '../router/router';
import type { RouteObject } from '../router/utils';

export declare const StaticRouter: (props: {
	basename?: string;
	children?: unknown;
	location?: Partial<Location> | string;
}) => unknown;

export declare const StaticRouterProvider: (props: {
	context: StaticHandlerContext;
	router: DataRouter;
	hydrate?: boolean;
	nonce?: string;
}) => unknown;

export declare function createStaticHandler(routes: RouteObject[], opts?: any): StaticHandler;

export declare function createStaticRouter(
	routes: RouteObject[],
	context: StaticHandlerContext,
	opts?: { branches?: any[]; future?: any },
): DataRouter;
