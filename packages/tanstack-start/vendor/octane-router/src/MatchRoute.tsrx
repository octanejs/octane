// useMatchRoute / MatchRoute — port of react-router's Matches.tsx matcher pair.
// The hook subscribes to `matchRouteDeps` (location href + resolved href +
// status) so the matcher re-evaluates per navigation, and returns
// `matchRoute(opts)` → false | matched params. The component renders its
// children when matched — a render-prop child ALWAYS renders, receiving the
// params (false when unmatched).
import { useCallback, isChildrenBlock } from 'octane';
import type { OctaneNode } from 'octane';
import { useRouter } from './context.ts';
import { useStore } from './useStore.ts';

// Loose octane-binding equivalents of upstream's generic option types — the
// type-safe MakeMatchRouteOptions/MatchRouteFn facade lives in
// MatchRoute.tsrx.d.ts (the surface plain-TS consumers resolve); tsrx-tsc
// resolves this implementation module, so the names are exported here too.
export type UseMatchRouteOptions = Record<string, any>;

export type MatchRouteFn = (opts: UseMatchRouteOptions) => any;

export type MakeMatchRouteOptions = UseMatchRouteOptions & {
	children?: OctaneNode | ((params: any) => OctaneNode);
};

export function useMatchRoute(): MatchRouteFn {
	const router = useRouter();
	useStore(router.stores.matchRouteDeps, (d) => d);
	return useCallback((opts: Record<string, any>) => {
		const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts;
		return router.matchRoute(rest, { pending, caseSensitive, fuzzy, includeSearch });
	}, [router]);
}

// Props are permissive (`Record<string, any>` + optional render-prop children) —
// upstream's MakeMatchRouteOptions generics are the type-safe facade the plain-TS
// surface (MatchRoute.tsrx.d.ts) exposes; the implementation keeps the loose
// shape (see Link).
export function MatchRoute(props: Record<string, any>) @{
	const matchRoute = useMatchRoute();
	const params = matchRoute(props);
	const out =
		typeof props.children === 'function' && !isChildrenBlock(props.children)
			? props.children(params)
			: params
				? props.children
				: null;
	<>
		{out}
	</>
}
