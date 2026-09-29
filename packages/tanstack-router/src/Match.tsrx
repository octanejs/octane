// Renders one route match — port of react-router's Match.tsx (MatchView +
// MatchInner + OnRendered). `Match` subscribes to the match's routeId and the
// router's `loadedAt` (the error-boundary reset key), resolves the route's
// boundary components, and composes the pipeline exactly like upstream:
//
//   Shell > matchContext > Suspense? > CatchBoundary? > CatchNotFound? > MatchInner
//
// Each boundary is only present when the route (or router defaults) configured a
// component for it — otherwise `SafeFragment` passes through so suspensions and
// errors bubble to the nearest ancestor boundary (upstream's
// ResolvedSuspenseBoundary/ResolvedCatchBoundary/ResolvedNotFoundBoundary).
// `MatchInner` handles the match STATUS: it suspends (a thrown promise, as
// upstream) on pending/redirected/_displayPending/_forcePending, renders
// the route's not-found UI for `status === 'notFound'`, throws to the
// CatchBoundary for `status === 'error'`, and otherwise renders the route
// component (or `<Outlet/>` for component-less layout routes) keyed by
// remountDeps. `OnRendered` (rendered by the match directly below the root)
// emits the router's `onRendered` event after the subtree commits — scroll
// restoration restores on it.
import { useRef, useLayoutEffect, createElement, Suspense } from 'octane';
import {
	createControlledPromise,
	getLocationChangeInfo,
	isNotFound,
	rootRouteId,
} from '@tanstack/router-core';
import type { NotFoundError, ParsedLocation, RootRouteOptions } from '@tanstack/router-core';
import type { ErrorInfo, ErrorRouteComponent } from './route.ts';
import { useStore } from './useStore.ts';
import { useRouter, matchContext as MatchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { CatchNotFound } from './not-found.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';
import { ClientOnly } from './ClientOnly.tsrx';
import { ScrollRestorationScript } from './scroll-restoration.tsrx';

export function Match(props: { matchId: string }) @{
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId)!;
	const resetKey = useStore(router.stores.loadedAt, (l: any) => l as number | string);
	const matchState = useStore(
		matchStore,
		(m: any) => ({
			routeId: m.routeId,
			ssr: m.ssr,
			_displayPending: m._displayPending,
		}),
		(previous, next) =>
			previous.routeId === next.routeId && previous.ssr === next.ssr &&
				previous._displayPending === next._displayPending,
	);
	const routeId = matchState.routeId as string;
	const route = (router.routesById as Record<string, any>)[routeId];

	const PendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	const routeErrorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent;
	const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch;
	const routeNotFoundComponent = route.isRoot
		? route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component
		: route.options.notFoundComponent;
	const resolvedNoSsr = matchState.ssr === false || matchState.ssr === 'data-only';

	// Boundary presence, per upstream MatchView. The root route only gets a
	// Suspense boundary when explicitly opted in via wrapInSuspense.
	const suspenseSignal =
		route.options.wrapInSuspense ?? PendingComponent ??
			(routeErrorComponent as ErrorRouteComponent | undefined)?.preload;
	const SuspenseWrap =
		(!route.isRoot || route.options.wrapInSuspense || resolvedNoSsr) &&
		(suspenseSignal || resolvedNoSsr)
			? Suspense
			: SafeFragment;
	const CatchWrap = routeErrorComponent ? CatchBoundary : SafeFragment;
	const NotFoundWrap = routeNotFoundComponent ? CatchNotFound : SafeFragment;
	const ShellComponent = route.isRoot
		? (route.options as RootRouteOptions).shellComponent ?? SafeFragment
		: SafeFragment;

	const pendingElement =
		PendingComponent ? createElement(PendingComponent, {}) : null;
	const parentRouteId = route.parentRoute?.id;

	<ShellComponent>
		<MatchContext value={props.matchId}>
			<SuspenseWrap fallback={pendingElement}>
				<CatchWrap
					getResetKey={() => resetKey}
					errorComponent={routeErrorComponent || ErrorComponent}
					onCatch={(error: Error, errorInfo: ErrorInfo) => {
						if (isNotFound(error)) {
							(error as any).routeId ??= routeId;
							throw error;
						}
						if (routeOnCatch) routeOnCatch(error, errorInfo);
					}}
				>
					<NotFoundWrap
						fallback={(error: NotFoundError) => {
							(error as any).routeId ??= routeId;

							if (
								!routeNotFoundComponent || error.routeId && error.routeId !== routeId ||
									!error.routeId && !route.isRoot
							) {
								throw error;
							}
							return createElement(routeNotFoundComponent, error as any);
						}}
					>
						@if (resolvedNoSsr || matchState._displayPending) {
							<ClientOnly fallback={pendingElement}>
								<MatchInner matchId={props.matchId} />
							</ClientOnly>
						} @else {
							<MatchInner matchId={props.matchId} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</MatchContext>
		@if (parentRouteId === rootRouteId) {
			<>
				<OnRendered />
				@if (router.options.scrollRestoration) {
					<ScrollRestorationScript />
				}
			</>
		}
	</ShellComponent>
}

function MatchInner(props: { matchId: string }) {
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId)!;
	const match = useStore(matchStore, (m: any) => m);
	const routeId = match.routeId as string;
	const route = (router.routesById as Record<string, any>)[routeId];

	// The live match in the router (if still mounted there) wins over the
	// snapshot for promise lookups, per upstream getMatchPromise.
	const getMatchPromise = (key: 'displayPendingPromise' | 'minPendingPromise' | 'loadPromise') =>
		router.getMatch(match.id)?._nonReactive[key] ?? match._nonReactive[key];

	// Suspend by throwing, like upstream, not with `use()`. Each match state
	// waits on a different promise, and `use()` is positional: a replay that
	// finds the match in a new state would get the promise stored for the old
	// one. Router-core's promises settle to `status: 'resolved'`, which `use()`
	// reads as still pending, so that stored promise retries forever.
	if (match._displayPending) {
		throw getMatchPromise('displayPendingPromise')!;
	}

	if (match._forcePending) {
		throw getMatchPromise('minPendingPromise')!;
	}

	if (match.status === 'pending') {
		// Once pending UI shows, keep it up for at least pendingMinMs.
		const pendingMinMs = route.options.pendingMinMs ?? router.options.defaultPendingMinMs;
		if (pendingMinMs) {
			const routerMatch = router.getMatch(match.id);
			if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
				const minPendingPromise = createControlledPromise<void>();
				routerMatch._nonReactive.minPendingPromise = minPendingPromise;
				setTimeout(() => {
					minPendingPromise.resolve();
					routerMatch._nonReactive.minPendingPromise = undefined;
				}, pendingMinMs);
			}
		}
		throw getMatchPromise('loadPromise')!;
	}

	if (match.status === 'notFound') {
		return createElement(RouteNotFound, { routeId, error: match.error });
	}

	if (match.status === 'redirected') {
		// Observed mid-transition while a redirect is in flight — stay suspended so
		// this stale render is abandoned and the redirect completes.
		const atom = matchStore as unknown as Partial<MatchAtom>;
		throw typeof atom.subscribe === 'function'
			? nextMatchUpdate(atom as MatchAtom, match)
			: getMatchPromise('loadPromise')!;
	}

	if (match.status === 'error') {
		throw match.error;
	}

	const Comp = route.options.component ?? router.options.defaultComponent;
	const remountFn = route.options.remountDeps ?? router.options.defaultRemountDeps;
	const remountDeps =
		remountFn
			? remountFn({
					routeId,
					loaderDeps: match.loaderDeps,
					params: match._strictParams,
					search: match._strictSearch,
				})
			: undefined;
	const key =
		remountDeps ? JSON.stringify(remountDeps) : undefined;
	if (Comp) return createElement(Comp, key !== undefined ? { key } : {});
	return createElement(Outlet, {});
}

interface MatchAtom {
	get: () => object;
	subscribe: (cb: () => void) => { unsubscribe: () => void };
}

const matchUpdates = new WeakMap<object, Promise<void>>();

// Settles on the first store update after `snapshot`. A redirected match waits
// on this, not on its loadPromise: router-core resolves that promise when it
// marks the redirect, and a settled promise retries on a microtask until the
// redirect target has loaded, starving the timers and network callbacks that
// load waits on. React's scheduler paces those retries; Octane's retry does
// not. Server atoms cannot subscribe, so the server keeps upstream's promise:
// a server redirect is answered before the app renders.
function nextMatchUpdate(store: MatchAtom, snapshot: object): Promise<void> {
	let update = matchUpdates.get(snapshot);
	if (update === undefined) {
		update = new Promise<void>((resolve) => {
			const subscription = store.subscribe(() => {
				subscription.unsubscribe();
				resolve();
			});
			// The store may have moved on between this render and the subscription.
			if (store.get() !== snapshot) {
				subscription.unsubscribe();
				resolve();
			}
		});
		matchUpdates.set(snapshot, update);
	}
	return update;
}

// Emits the router's `onRendered` event once the subtree below the root layout
// has committed (this component renders as a later sibling of the match content,
// so its layout effect runs after the subtree's). Tracks the previously-resolved
// location in a ref because by effect time Transitioner has already advanced
// `resolvedLocation` to the new location.
function OnRendered() @{
	const router = useRouter();
	const prevResolvedLocationRef = useRef<ParsedLocation<any> | undefined>(undefined);
	const renderedLocationKey = useStore(
		router.stores.resolvedLocation,
		(loc: ParsedLocation<any> | undefined) => loc?.state.__TSR_key,
	);

	useLayoutEffect(() => {
		const currentResolvedLocation = router.stores.resolvedLocation.get();
		const previousResolvedLocation = prevResolvedLocationRef.current;

		if (
			currentResolvedLocation &&
				(!previousResolvedLocation ||
					previousResolvedLocation.href !== currentResolvedLocation.href)
		) {
			router.emit({
				type: 'onRendered',
				...getLocationChangeInfo(
					router.stores.location.get(),
					previousResolvedLocation ?? currentResolvedLocation,
				),
			});
		}
		prevResolvedLocationRef.current = currentResolvedLocation;
	}, [renderedLocationKey, router]);

	<></>
}
