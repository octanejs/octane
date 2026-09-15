import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
import type { MatchRouteMatcher, MakeMatchRouteOptions } from './matchRouteTypes';

export type { UseMatchRouteOptions, MakeMatchRouteOptions } from './matchRouteTypes';
// useMatchRoute / MatchRoute — port of react-router's Matches.tsx matcher pair.
// The hook subscribes to `matchRouteDeps` (location href + resolved href +
// status) so the matcher re-evaluates per navigation, and returns
// `matchRoute(opts)` → false | matched params. The component renders its
// children when matched — a render-prop child ALWAYS renders, receiving the
// params (false when unmatched).
import { useCallback, isChildrenBlock } from 'octane';
import { useRouter } from './context.ts';
import { useStore } from './useStore.ts';

export function useMatchRoute<TRouter extends AnyRouter = RegisteredRouter>(): MatchRouteMatcher<
	TRouter
> {
	const router = useRouter<TRouter>();
	const locationHref = useStore(router.stores.location, (location) => location.href);
	const resolvedHref = useStore(router.stores.resolvedLocation, (location) => location?.href);
	const status = useStore(router.stores.status);
	return useCallback((opts: Record<string, any>) => {
		const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts;
		return router.matchRoute(rest as any, { pending, caseSensitive, fuzzy, includeSearch });
	}, [router, locationHref, resolvedHref, status]);
}

export function MatchRoute<
	TRouter extends AnyRouter = RegisteredRouter,
	TFrom extends string = string,
	TTo extends string | undefined = undefined,
	TMaskFrom extends string = TFrom,
	TMaskTo extends string = '',
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>) @{
	const matchRoute = useMatchRoute();
	const params = matchRoute(props as any);
	const out =
		typeof props.children === 'function' && !isChildrenBlock(props.children)
			? (props.children as (params: unknown) => OctaneNode)(params)
			: params
				? props.children
				: null;
	<>
		{out}
	</>
}
