import type {
	AnyRouter,
	RegisteredRouter,
	ToSubOptionsProps,
	DeepPartial,
	MakeOptionalSearchParams,
	MakeOptionalPathParams,
	MaskOptions,
	MatchRouteOptions,
	Expand,
	ResolveRoute,
} from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
import type { OctaneRenderable } from './linkTypes';
export type UseMatchRouteOptions<
	TRouter extends AnyRouter = RegisteredRouter,
	TFrom extends string = string,
	TTo extends string | undefined = undefined,
	TMaskFrom extends string = TFrom,
	TMaskTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
	DeepPartial<MakeOptionalSearchParams<TRouter, TFrom, TTo>> &
	DeepPartial<MakeOptionalPathParams<TRouter, TFrom, TTo>> &
	MaskOptions<TRouter, TMaskFrom, TMaskTo> &
	MatchRouteOptions;

export type MakeMatchRouteOptions<
	TRouter extends AnyRouter = RegisteredRouter,
	TFrom extends string = string,
	TTo extends string | undefined = undefined,
	TMaskFrom extends string = TFrom,
	TMaskTo extends string = '',
> = UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
	// Keep the callback branch distinct: OctaneNode is opaque, so a direct union
	// with it would erase parameter inference for render-prop children.
	children?:
		| ((params?: Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']>) => OctaneNode)
		| OctaneRenderable;
};

export type MatchRouteMatcher<TRouter extends AnyRouter = RegisteredRouter> = <
	const TFrom extends string = string,
	const TTo extends string | undefined = undefined,
	const TMaskFrom extends string = TFrom,
	const TMaskTo extends string = '',
>(
	opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => false | Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']>;
