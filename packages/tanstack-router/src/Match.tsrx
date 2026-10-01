// Renders one route match — port of react-router's Match.tsx (MatchView +
// MatchInner). `Match` subscribes to the match's routeId, resolves the route's
// boundary components, and composes the pipeline exactly like upstream:
//
//   Shell > matchContext > Suspense? > CatchBoundary? > CatchNotFound? > MatchInner
//
// Each boundary is only present when the route (or router defaults) configured a
// component for it — otherwise `SafeFragment` passes through so suspensions and
// errors bubble to the nearest ancestor boundary (upstream's
// ResolvedSuspenseBoundary/ResolvedCatchBoundary/ResolvedNotFoundBoundary).
// `MatchInner` handles the match STATUS. router-core 1.171.34 owns the pending
// lifecycle (pendingMs/pendingMinMs, redirects, min-pending) and exposes a single
// in-flight transaction: a `pending` match suspends by throwing the transaction's
// promise (`router._tx[5]`) during a navigation, or renders the route's pending
// UI otherwise; `notFound` renders the route's not-found UI; `error` throws to the
// CatchBoundary (server renders the error component inline). Otherwise it renders
// the route component (or `<Outlet/>` for component-less layout routes) keyed by
// remountDeps. Per-match error-boundary reset keys off the match object identity
// (upstream dropped the global `loadedAt` store).
import { createElement, Suspense } from 'octane';
import { isNotFound, rootRouteId } from '@tanstack/router-core';
import type { NotFoundError, RootRouteOptions } from '@tanstack/router-core';
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

export function Match(props: { routeId: string }) @{
	const router = useRouter();
	// router-core 1.171.34 keys match stores by routeId (`byRoute`/`getMatchStore`),
	// not by match-instance id, and dropped the global `loadedAt` reset store —
	// upstream now resets each route's error boundary on its match object identity.
	const matchStore = router.stores.getMatchStore(props.routeId);
	const matchState = useStore(
		matchStore,
		(m: any) => ({
			routeId: m.routeId,
			ssr: m.ssr,
		}),
		(previous, next) => previous.routeId === next.routeId && previous.ssr === next.ssr,
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
		<MatchContext value={props.routeId}>
			<SuspenseWrap fallback={pendingElement}>
				<CatchWrap
					getResetKey={() => matchStore.get()}
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
						@if (resolvedNoSsr) {
							<ClientOnly fallback={pendingElement}>
								<MatchInner routeId={props.routeId} />
							</ClientOnly>
						} @else {
							<MatchInner routeId={props.routeId} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</MatchContext>
		@if (parentRouteId === rootRouteId && router.options.scrollRestoration) {
			<ScrollRestorationScript />
		}
	</ShellComponent>
}

function MatchInner(props: { routeId: string }) {
	const router = useRouter();
	const matchStore = router.stores.getMatchStore(props.routeId);
	const match = useStore(matchStore, (m: any) => m);
	const routeId = match.routeId as string;
	const route = (router.routesById as Record<string, any>)[routeId];

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
	const out =
		Comp ? createElement(Comp, key !== undefined ? { key } : {}) : createElement(Outlet, {});

	if (match.status === 'pending') {
		// router-core owns the pending lifecycle (pendingMs, pendingMinMs, redirects
		// and min-pending timing). During an in-flight navigation a pending match
		// suspends on the transaction's promise so the current page holds; outside a
		// transaction (e.g. an initial client load) it shows the route's pending UI.
		//
		// Octane-specific divergence from react-router: a client-only
		// (`ssr: false`/`data-only`) pending match renders its pending UI in place
		// inside <ClientOnly> rather than throwing to the outer Suspense. Octane's
		// Suspense keeps the suspended subtree's DOM hidden on fallback, so throwing
		// would leave the hidden <ClientOnly> fallback in the tree alongside the
		// visible Suspense fallback — two pending elements. React's <ClientOnly>
		// swaps fallback→children, so upstream can always throw.
		const resolvedNoSsr = match.ssr === false || match.ssr === 'data-only';
		const tx = (router as any)._tx;
		if (tx && !resolvedNoSsr) throw tx[5];
		return pendingElementFor(router, route);
	}

	if (match.status === 'notFound') {
		return createElement(RouteNotFound, { routeId, error: match.error });
	}

	if (match.status === 'error') {
		// On the server there is no CatchBoundary to catch a throw, so render the
		// error component inline (upstream MatchInner does the same); on the client
		// throw to the nearest CatchBoundary.
		if ((router as any).isServer) {
			const ErrorComp =
				(route.options.errorComponent ?? router.options.defaultErrorComponent) || ErrorComponent;
			return createElement(ErrorComp as any, {
				error: match.error,
				reset: undefined,
				info: { componentStack: '' },
			});
		}
		throw match.error;
	}

	return out;
}

function pendingElementFor(router: any, route: any) {
	const PendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	return PendingComponent ? createElement(PendingComponent, {}) : null;
}
