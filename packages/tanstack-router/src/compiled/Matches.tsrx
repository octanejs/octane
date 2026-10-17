'use strong';

import {
	CompiledOutlet as CompiledComponent,
	CompiledContext,
	Hydrate,
	trustHTML,
	useContext,
	useLayoutEffect,
} from 'octane';
import { never } from 'octane/hydration';
import type { AnyRouter, NotFoundError } from '@tanstack/router-core';
import { rootRouteId, setupScrollRestoration } from '@tanstack/router-core';
import { isServer } from '@tanstack/router-core/isServer';
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import { routerContext, matchContext, useRouter } from './bindings';
import { useStore } from '../useStore';
import { useTransitioner, usePresentedMatches } from '../Transitioner.tsrx';
import { useHydrated } from '../ClientOnly.tsrx';
import { ErrorComponent } from '../ErrorComponent.tsrx';
import { CompiledFailure, CompiledPending } from './MatchLifecycle.tsrx';

export function PreconfiguredRouterProvider(props: { router: AnyRouter }) @{
	const router = props.router;
	if (router.options.Wrap || router.options.InnerWrap) {
		throw new Error(
			'Compiled providers do not accept Wrap or InnerWrap. Use RouterProvider from @octanejs/tanstack-router for renderable wrappers.',
		);
	}
	<CompiledContext context={routerContext} value={router}>
		<CompiledMatches />
	</CompiledContext>
}

function setupRouterScrollRestoration(router: AnyRouter) {
	if (router.options.scrollRestoration) setupScrollRestoration(router);
}

function CompiledMatches() @{
	const router = useRouter();
	const rootRoute = (router.routesById as any)[rootRouteId];
	useLayoutEffect(() => setupRouterScrollRestoration(router));
	useTransitioner(router);
	@try {
		<CompiledMatchesInner />
	} @pending {
		<CompiledPending route={rootRoute} />
	} @catch (error, reset) {
		if (router.options.disableGlobalCatchBoundary) throw error;
		<CompiledFailure error={error} reset={reset} route={rootRoute} global={true} />
	}
}

function CompiledMatchesInner() @{
	const router = useRouter();
	const matches = usePresentedMatches(router);
	const rootMatch = matches[0];
	@if (rootMatch) {
		<CompiledContext context={matchContext} value={rootMatch.routeId}>
			<CompiledMatch routeId={rootMatch.routeId} />
		</CompiledContext>
	}
}

// Route IDs enter this tree from published match snapshots. Router-core has
// already created their stable presentation stores before notifying readers.
function CompiledWrap(props: { component?: any; children?: unknown }) @{
	@if (props.component) {
		<CompiledComponent component={props.component} props={{ children: props.children }} />
	} @else {
		<>{props.children}</>
	}
}

export function CompiledMatch(props: { routeId: string }) @{
	const router = useRouter();
	const store = router.stores.getMatchStore(props.routeId);
	const ssr = useStore(store, (match: any) => match.ssr);
	const route = (router.routesById as Record<string, any>)[props.routeId];
	const pending = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	const errorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent;
	const noSsr = ssr === false || ssr === 'data-only';
	const hasSuspense =
		(!route.isRoot || route.options.wrapInSuspense || noSsr) &&
		((route.options.wrapInSuspense ?? pending ?? errorComponent?.preload) || noSsr);
	<CompiledWrap component={route.isRoot ? route.options.shellComponent : undefined}>
		<CompiledContext context={matchContext} value={props.routeId}>
			@if (hasSuspense) {
				@try {
					<CompiledMatchContent route={route} routeId={props.routeId} noSsr={noSsr} />
				} @pending {
					<CompiledPending route={route} />
				}
			} @else {
				<CompiledMatchContent route={route} routeId={props.routeId} noSsr={noSsr} />
			}
		</CompiledContext>
		@if (route.parentRoute?.id === rootRouteId && router.options.scrollRestoration) {
			<CompiledScrollRestoration />
		}
	</CompiledWrap>
}

function CompiledScrollRestoration() @{
	const router = useRouter();
	const hydrated = useHydrated();
	const option = router.options.scrollRestoration;
	const script = getScrollRestorationScriptForRouter(router);
	// Keep the location predicate live: the router identity survives location changes.
	let rendersScript = true;
	if (typeof option === 'function') rendersScript = option({ location: router.latestLocation });
	@if ((script !== null || rendersScript) && ((isServer ?? router.isServer) || !hydrated)) {
		<Hydrate split={false} when={never()}>
			<script nonce={router.options.ssr?.nonce} dangerouslySetInnerHTML={trustHTML(script ?? '')} />
		</Hydrate>
	}
}

// Without a configured Suspense boundary, both lazy imports and loader promises
// pass through to the next ancestor boundary. The match still owns its errors.
function CompiledMatchContent(props: { route: any; routeId: string; noSsr: boolean }) @{
	@try {
		<CompiledMatchInner routeId={props.routeId} noSsr={props.noSsr} />
	} @catch (error, reset) {
		<CompiledFailure error={error} reset={reset} route={props.route} />
	}
}

function CompiledMatchInner(props: { routeId: string; noSsr: boolean }) @{
	const router = useRouter();
	const match = useStore(router.stores.getMatchStore(props.routeId), (m: any) => m);
	const route = (router.routesById as Record<string, any>)[props.routeId];
	const hydrated = useHydrated();
	const Comp = route.options.component ?? router.options.defaultComponent;
	const remountFn = route.options.remountDeps ?? router.options.defaultRemountDeps;
	const remountDeps = remountFn?.({
		routeId: props.routeId,
		loaderDeps: match.loaderDeps,
		params: match._strictParams,
		search: match._strictSearch,
	});
	const key = remountDeps ? JSON.stringify(remountDeps) : undefined;
	@if ((props.noSsr && !hydrated) || match.status === 'pending') {
		<CompiledPending route={route} waitForTransition={match.status === 'pending' && !props.noSsr} />
	} @else if (match.status === 'notFound') {
		<CompiledNotFound route={route} error={match.error} />
	} @else if (match.status === 'error') {
		@if (isServer ?? (router as any).isServer) {
			<CompiledComponent
				component={
					route.options.errorComponent ?? router.options.defaultErrorComponent ?? ErrorComponent
				}
				props={{ error: match.error, reset: undefined, info: { componentStack: '' } }}
			/>
		} @else {
			throw match.error;
			<></>
		}
	} @else if (Comp) {
		<CompiledComponent key={key} component={Comp} props={{}} />
	} @else {
		<CompiledOutlet />
	}
}

// Reads exactly the next TanStack match, preserving nearest-match contexts and
// fuzzy/root not-found placement. This is distinct from octane's component outlet.
export function CompiledOutlet() @{
	const router = useRouter();
	const routeId = useContext(matchContext)!;
	const store = router.stores.getMatchStore(routeId);
	const notFound = useStore(
		store,
		(m: any) => ({ global: !!m?._notFound, error: m?.error }),
		(a, b) => a.global === b.global && a.error === b.error,
	);
	const childId = useStore(router.stores.ids, (ids: Array<string>) => {
		const i = ids.indexOf(routeId);
		return i >= 0 ? ids[i + 1] : undefined;
	});
	@if (notFound.global) {
		<CompiledNotFound route={(router.routesById as any)[routeId]} error={notFound.error} />
	} @else if (childId) {
		@if (routeId === rootRouteId) {
			@try {
				<CompiledMatch routeId={childId} />
			} @pending {
				<CompiledPending />
			}
		} @else {
			<CompiledMatch routeId={childId} />
		}
	}
}

function CompiledNotFound(props: { route: any; error?: NotFoundError }) @{
	const router = useRouter();
	const NotFound = props.route.options.notFoundComponent ?? router.options.defaultNotFoundComponent;
	@if (NotFound) {
		<CompiledComponent component={NotFound} props={props.error ?? {}} />
	} @else {
		<p>Not Found</p>
	}
}
