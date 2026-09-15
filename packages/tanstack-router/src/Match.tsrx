declare const process: { env: { NODE_ENV?: string } };

// Stable route atoms publish a match generation. Core owns pending minimums and
// load promises; this component owns its native suspense/error/render lifecycle.
import { use, useMemo, memo, createElement, Suspense } from 'octane';
import { isNotFound, rootRouteId } from '@tanstack/router-core';
import { isServer } from '@tanstack/router-core/isServer';
import type {
	AnyRoute,
	AnyRouteMatch,
	AnyRouter,
	NotFoundError,
	RootRouteOptions,
} from '@tanstack/router-core';
import type { ErrorInfo, ErrorRouteComponent } from './route.ts';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { CatchNotFound } from './not-found.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';
import { ClientOnly } from './ClientOnly.tsrx';
import { ScrollRestorationScript } from './scroll-restoration.tsrx';
import { wrapInNonRouteComponentContext } from './nonRouteComponentContext.ts';

// Route options are mutable across lazy chunk resolution. Pass the selected
// component as the memoization input instead of the stable route/router objects.
export function renderPending(Pending: AnyRoute['options']['pendingComponent']) {
	if (!Pending) return null;
	const element = createElement(Pending, {});
	return process.env.NODE_ENV !== 'production'
		? wrapInNonRouteComponentContext(element, 'pendingComponent')
		: element;
}

function canWrapInSuspense(router: AnyRouter, route: AnyRoute, ssr: AnyRouteMatch['ssr']) {
	return !route.isRoot || (route.options as RootRouteOptions).shellComponent ||
		route.options.wrapInSuspense ||
		ssr === false ||
		ssr === 'data-only' ||
		!((isServer ?? router.isServer) || router.ssr);
}

export const Match = memo(MatchImpl);

function MatchImpl(props: { routeId: string }) @{
	const router = useRouter<AnyRouter>();
	const match = useStore(router.stores.getMatchStore(props.routeId))!;
	const routeId = match.routeId;
	const route = router.routesById[routeId];
	const PendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	const pendingElement = renderPending(PendingComponent);
	const routeErrorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent;
	const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch;
	const routeNotFoundComponent = route.isRoot
		? route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component
		: route.options.notFoundComponent;
	const resolvedNoSsr = match.ssr === false || match.ssr === 'data-only';
	const needsPendingBoundary =
		(route.options.errorComponent as ErrorRouteComponent | undefined)?.preload || resolvedNoSsr;
	const SuspenseWrap =
		canWrapInSuspense(router, route, match.ssr) &&
		(route.options.wrapInSuspense ?? pendingElement ?? needsPendingBoundary)
			? Suspense
			: SafeFragment;
	const CatchWrap = routeErrorComponent ? CatchBoundary : SafeFragment;
	const NotFoundWrap = routeNotFoundComponent ? CatchNotFound : SafeFragment;
	const ShellComponent = route.isRoot
		? (route.options as RootRouteOptions).shellComponent ?? SafeFragment
		: SafeFragment;

	<ShellComponent>
		<matchContext.Provider value={routeId}>
			<SuspenseWrap fallback={pendingElement}>
				<CatchWrap
					getResetKey={() => match}
					errorComponent={routeErrorComponent || ErrorComponent}
					onCatch={(error: unknown, errorInfo: ErrorInfo) => {
						if (isNotFound(error)) {
							error.routeId ??= routeId;
							throw error;
						}
						routeOnCatch?.(error, errorInfo);
					}}
				>
					<NotFoundWrap
						fallback={(error: NotFoundError) => {
							error.routeId ??= routeId;
							if (error.routeId !== routeId) throw error;
							const element = createElement(routeNotFoundComponent!, error as any);
							return process.env.NODE_ENV !== 'production'
								? wrapInNonRouteComponentContext(element, 'notFoundComponent')
								: element;
						}}
					>
						@if (resolvedNoSsr) {
							<ClientOnly fallback={pendingElement}>
								<MatchInner match={match} />
							</ClientOnly>
						} @else {
							<MatchInner match={match} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</matchContext.Provider>
		@if (route.parentRoute?.id === rootRouteId && router.options.scrollRestoration) {
			<ScrollRestorationScript />
		}
	</ShellComponent>
}

const MatchInner = memo(MatchInnerImpl);

function MatchInnerImpl(props: { match: AnyRouteMatch }) {
	const router = useRouter<AnyRouter>();
	const match = props.match;
	const routeId = match.routeId;
	const route = router.routesById[routeId];
	const Comp = route.options.component ?? router.options.defaultComponent;
	const remountFn = route.options.remountDeps ?? router.options.defaultRemountDeps;
	const remountDeps = remountFn?.({
		routeId,
		loaderDeps: match.loaderDeps,
		params: match._strictParams,
		search: match._strictSearch,
	});
	const key =
		remountDeps ? JSON.stringify(remountDeps) : undefined;
	const out = useMemo(
		() => Comp ? createElement(Comp, key !== undefined ? { key } : {}) : createElement(Outlet, {}),
		[Comp, key],
	);
	const PendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	if (match.status === 'pending' && !(router.ssr && !canWrapInSuspense(router, route, match.ssr))) {
		if (router._tx) use(router._tx[5]);
		return renderPending(PendingComponent);
	}
	if (match.status === 'notFound') return createElement(RouteNotFound, {
		routeId,
		error: match.error,
	});
	if (match.status === 'error') {
		if (isServer ?? router.isServer) {
			const ErrorComp =
				route.options.errorComponent ?? router.options.defaultErrorComponent ?? ErrorComponent;
			const element = createElement(ErrorComp, {
				error: match.error,
				reset: undefined,
				info: { componentStack: '' },
			});
			return process.env.NODE_ENV !== 'production'
				? wrapInNonRouteComponentContext(element, 'errorComponent')
				: element;
		}
		throw match.error;
	}
	return out;
}
