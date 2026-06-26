// The selector hooks. Each is a thin slice over `useRouterState` (which subscribes
// to the router snapshot store). v1 reads params/search/loaderData off the matched
// route in the snapshot rather than a per-match store — correct, just slightly
// coarser-grained re-rendering; a per-match-store optimization can come later.
import { useRouterState } from './useRouterState';
import { useRouter } from './context';
import { splitSlot, subSlot } from './internal';

function matchFor(state: any, from?: string): any {
	const matches = state.matches ?? [];
	return from ? matches.find((m: any) => m.routeId === from) : matches[matches.length - 1];
}

export function useLocation(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useRouterState(
		{
			select: (s: any) => (opts.select ? opts.select(s.location) : s.location),
			router: opts.router,
		},
		subSlot(slot, 'loc'),
	);
}

export function useParams(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useRouterState(
		{
			select: (s: any) => {
				const params = matchFor(s, opts.from)?.params ?? {};
				return opts.select ? opts.select(params) : params;
			},
			router: opts.router,
		},
		subSlot(slot, 'params'),
	);
}

export function useSearch(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useRouterState(
		{
			select: (s: any) => {
				const search = matchFor(s, opts.from)?.search ?? {};
				return opts.select ? opts.select(search) : search;
			},
			router: opts.router,
		},
		subSlot(slot, 'search'),
	);
}

export function useLoaderData(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useRouterState(
		{
			select: (s: any) => {
				const data = matchFor(s, opts.from)?.loaderData;
				return opts.select ? opts.select(data) : data;
			},
			router: opts.router,
		},
		subSlot(slot, 'loader'),
	);
}

export function useMatches(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useRouterState(
		{ select: (s: any) => (opts.select ? opts.select(s.matches) : s.matches), router: opts.router },
		subSlot(slot, 'matches'),
	);
}

// Returns a navigate function. Reads the router from context (no base hooks, so no
// slot needed) and forwards to `router.navigate`.
export function useNavigate(...args: any[]): (to: any) => any {
	const [user] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter(opts.router ? { router: opts.router } : undefined);
	return (to: any) => router.navigate({ ...to, from: to?.from ?? opts.from });
}
