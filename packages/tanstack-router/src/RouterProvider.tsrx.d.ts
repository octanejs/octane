import type { AnyRouter, RegisteredRouter, RouterOptions } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
export type RouterProps<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
	RouterOptions<
		TRouter['routeTree'],
		NonNullable<TRouter['options']['trailingSlash']>,
		NonNullable<TRouter['options']['defaultStructuralSharing']>,
		TRouter['history'],
		TDehydrated
	>,
	'context'
> & {
	router: TRouter;
	context?: Partial<
		RouterOptions<
			TRouter['routeTree'],
			NonNullable<TRouter['options']['trailingSlash']>,
			NonNullable<TRouter['options']['defaultStructuralSharing']>,
			TRouter['history'],
			TDehydrated
		>['context']
	>;
};

export declare function RouterProvider<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated>): OctaneNode;
export declare function RouterContextProvider<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated> & { children?: OctaneNode }): OctaneNode;
