// The read hooks — ports of react-router's useMatch.tsx / useParams / useSearch /
// useLoaderData / useLoaderDeps / useRouteContext / useNavigate / useCanGoBack /
// Matches.tsx (useMatches / useParentMatches / useChildMatches). Everything match-
// shaped funnels through `useMatch`, which subscribes to ONE match store:
//   - `from` given → `router.stores.getRouteMatchStore(from)` (a cached computed
//     that resolves a routeId to its current match);
//   - no `from` → the NEAREST match via `matchContext` (the match id the enclosing
//     `<Match>` provided) — NOT the leaf match.
// A missing match throws unless `shouldThrow: false` (upstream invariant).
// Selectors run through `useStructuralSharing` (replaceEqualDeep against the
// previous selection when `structuralSharing ?? defaultStructuralSharing`).
import { useContext, useRef, useCallback } from 'octane';
import { replaceEqualDeep } from '@tanstack/router-core';
import { useRouter, matchContext } from './context';
import { useStore } from './useStore';
import { splitSlot, subSlot } from './internal';

// Sentinel store + selection for "no match at this id" (upstream's dummyStore).
const dummyStore = {
	get() {},
	subscribe() {
		return { unsubscribe() {} };
	},
};

// Selector wrapper honoring structural sharing: when enabled, the selection is
// replaceEqualDeep'd against the previous one so deep-equal slices keep their
// reference (no re-render). Port of react-router's useStructuralSharing.
function useStructuralSharing(opts: any, router: any, slot: symbol | undefined) {
	const previousResult = useRef<any>(undefined, subSlot(slot, 'ss'));
	return (slice: any) => {
		const selected = opts?.select ? opts.select(slice) : slice;
		if (opts?.structuralSharing ?? router.options.defaultStructuralSharing) {
			return (previousResult.current = replaceEqualDeep(previousResult.current, selected));
		}
		return selected;
	};
}

export function useMatch(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	// octane has no rules of hooks, so the nearest-match context is read
	// unconditionally (upstream reads a dummy context when `from` is given).
	const nearestMatchId = useContext(matchContext);
	const matchStore = opts.from
		? router.stores.getRouteMatchStore(opts.from)
		: router.stores.matchStores.get(nearestMatchId as string);

	const selector = useStructuralSharing(opts, router, subSlot(slot, 'm'));
	const matchSelection = useStore(
		matchStore ?? dummyStore,
		(match: any) => (match ? selector(match) : dummyStore),
		undefined,
		subSlot(slot, 'm:us'),
	);

	if (matchSelection !== dummyStore) return matchSelection;
	if (opts.shouldThrow ?? true) {
		throw new Error(
			`Invariant failed: Could not find ${
				opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'
			}`,
		);
	}
	return undefined;
}

export function useParams(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatch(
		{
			from: opts.from,
			strict: opts.strict,
			shouldThrow: opts.shouldThrow,
			structuralSharing: opts.structuralSharing,
			select: (match: any) => {
				const params = opts.strict === false ? match.params : match._strictParams;
				return opts.select ? opts.select(params) : params;
			},
		},
		subSlot(slot, 'params'),
	);
}

export function useSearch(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatch(
		{
			from: opts.from,
			strict: opts.strict,
			shouldThrow: opts.shouldThrow,
			structuralSharing: opts.structuralSharing,
			select: (match: any) => (opts.select ? opts.select(match.search) : match.search),
		},
		subSlot(slot, 'search'),
	);
}

export function useLoaderData(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatch(
		{
			from: opts.from,
			strict: opts.strict,
			structuralSharing: opts.structuralSharing,
			select: (match: any) => (opts.select ? opts.select(match.loaderData) : match.loaderData),
		},
		subSlot(slot, 'loader'),
	);
}

export function useLoaderDeps(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const { select, ...rest } = opts;
	return useMatch(
		{
			...rest,
			select: (match: any) => (select ? select(match.loaderDeps) : match.loaderDeps),
		},
		subSlot(slot, 'deps'),
	);
}

export function useRouteContext(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatch(
		{
			...opts,
			select: (match: any) => (opts.select ? opts.select(match.context) : match.context),
		},
		subSlot(slot, 'ctx'),
	);
}

export function useLocation(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	return useStore(
		router.stores.location,
		useStructuralSharing(opts, router, subSlot(slot, 'loc')),
		undefined,
		subSlot(slot, 'loc:us'),
	);
}

export function useMatches(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	return useStore(
		router.stores.matches,
		useStructuralSharing(opts, router, subSlot(slot, 'matches')),
		undefined,
		subSlot(slot, 'matches:us'),
	);
}

export function useParentMatches(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const contextMatchId = useContext(matchContext);
	return useMatches(
		{
			select: (matches: any[]) => {
				matches = matches.slice(
					0,
					matches.findIndex((d: any) => d.id === contextMatchId),
				);
				return opts.select ? opts.select(matches) : matches;
			},
			structuralSharing: opts.structuralSharing,
		},
		subSlot(slot, 'parents'),
	);
}

export function useChildMatches(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const contextMatchId = useContext(matchContext);
	return useMatches(
		{
			select: (matches: any[]) => {
				matches = matches.slice(matches.findIndex((d: any) => d.id === contextMatchId) + 1);
				return opts.select ? opts.select(matches) : matches;
			},
			structuralSharing: opts.structuralSharing,
		},
		subSlot(slot, 'children'),
	);
}

// Returns a STABLE navigate function (upstream useCallback([from, router])) that
// forwards to `router.navigate`, defaulting `from` to the hook's option.
export function useNavigate(...args: any[]): (to: any) => any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter(opts.router ? { router: opts.router } : undefined);
	return useCallback(
		(options: any) => router.navigate({ ...options, from: options?.from ?? opts.from }),
		[opts.from, router],
		subSlot(slot, 'nav'),
	);
}

// True when the current history entry isn't the first (there is somewhere to go
// back to) — per upstream useCanGoBack (location.state.__TSR_index !== 0).
export function useCanGoBack(...args: any[]): boolean {
	const [, slot] = splitSlot(args);
	const router = useRouter();
	return useStore(
		router.stores.location,
		(location: any) => location.state.__TSR_index !== 0,
		undefined,
		subSlot(slot, 'back'),
	);
}
