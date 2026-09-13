import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
import type { MatchRouteMatcher, MakeMatchRouteOptions } from './matchRouteTypes';
export type { UseMatchRouteOptions, MakeMatchRouteOptions } from './matchRouteTypes';
export declare function useMatchRoute<
	TRouter extends AnyRouter = RegisteredRouter,
>(): MatchRouteMatcher<TRouter>;
export declare function MatchRoute<
	TRouter extends AnyRouter = RegisteredRouter,
	const TFrom extends string = string,
	const TTo extends string | undefined = undefined,
	const TMaskFrom extends string = TFrom,
	const TMaskTo extends string = '',
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): OctaneNode;
