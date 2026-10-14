import {
	CompiledOutlet as CompiledComponent,
	CompiledContext,
	useContext,
	useLayoutEffect,
	useRef,
} from 'octane';
import type { NotFoundError } from '@tanstack/router-core';
import { hasKeys, isNotFound, rootRouteId, setupScrollRestoration } from '@tanstack/router-core';
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import { isServer } from '@tanstack/router-core/isServer';
import { routerContext, matchContext, useRouter } from './bindings';
import { useStore } from '../useStore';
import { useTransitioner, settleOwner } from '../Transitioner.tsrx';
import { useHydrated } from '../ClientOnly.tsrx';
import { ErrorComponent } from '../CatchBoundary.tsrx';
import { createLazyRouteLoader } from '../lazyRouteLoader';
import type { RouterProps } from '../RouterProvider.tsrx';

export function CompiledRouterProvider(props: RouterProps) @{
	const { router, ...rest } = props;
	if (hasKeys(rest)) {
		router.update({
			...router.options,
			...rest,
			context: { ...router.options.context, ...rest.context },
		});
	}
	if (router.options.Wrap || router.options.InnerWrap) {
		throw new Error(
			'CompiledRouterProvider does not accept Wrap or InnerWrap. Use RouterProvider for renderable wrappers.',
		);
	}
	<CompiledContext context={routerContext} value={router}>
		<CompiledMatches />
	</CompiledContext>
}

function CompiledMatches() @{
	const router = useRouter();
	const rootRoute = (router.routesById as any)[rootRouteId];
	useLayoutEffect(() => {
		if (router.options.scrollRestoration) setupScrollRestoration(router);
	}, [router]);
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
	const acknowledgement: Array<any> = ((router as any)._rendered ??= []);
	const matches = useStore(router.stores.matches, (m: any) => acknowledgement[0] ?? m);
	const rootMatch = matches[0];
	useLayoutEffect(() => {
		if (acknowledgement[0] === matches) settleOwner(acknowledgement, true);
	}, [acknowledgement, matches]);
	@if (rootMatch) {
		<CompiledMatch routeId={rootMatch.routeId} />
	}
}

function CompiledMatch(props: { routeId: string }) @{
	const router = useRouter();
	const store = router.stores.getMatchStore(props.routeId);
	const ssr = useStore(store, (match: any) => match.ssr);
	const route = (router.routesById as Record<string, any>)[props.routeId];
	if (route.isRoot && route.options.shellComponent) {
		throw new Error(
			'CompiledRouterProvider does not accept shellComponent. Use RouterProvider for renderable document shells.',
		);
	}
	const pending = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	const errorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent;
	const noSsr = ssr === false || ssr === 'data-only';
	const hasSuspense =
		(!route.isRoot || route.options.wrapInSuspense || noSsr) &&
		((route.options.wrapInSuspense ?? pending ?? errorComponent?.preload) || noSsr);
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
		@if (route.parentRoute?.id === rootRouteId && router.options.scrollRestoration) {
			<CompiledScrollRestoration />
		}
	</CompiledContext>
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
	if (match.status === 'pending' && !props.noSsr && (router as any)._tx) {
		throw (router as any)._tx[5];
	}
	@if ((props.noSsr && !hydrated) || match.status === 'pending') {
		<CompiledPending route={route} />
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

function CompiledPending(props: { route?: any }) @{
	const router = useRouter();
	const Pending = props.route?.options.pendingComponent ?? router.options.defaultPendingComponent;
	@if (Pending) {
		<CompiledComponent component={Pending} props={{}} />
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

function CompiledFailure(props: { error: any; reset: () => void; route: any; global?: boolean }) @{
	const router = useRouter();
	const errorComponent = props.global
		? ErrorComponent
		: (props.route.options.errorComponent ?? router.options.defaultErrorComponent);
	const notFoundComponent = props.route.isRoot
		? (props.route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component)
		: props.route.options.notFoundComponent;
	const isMissing = isNotFound(props.error);
	if (isMissing) {
		const missing = props.error as NotFoundError;
		missing.routeId ??= props.route.id;
		if (!notFoundComponent || missing.routeId !== props.route.id) throw missing;
	} else if (!errorComponent) {
		throw props.error;
	}

	// Report an error only at the boundary that owns it and retry after its
	// TanStack match identity changes, just like the normal binding.
	const reported = useRef<unknown>(null);
	if (!isMissing && !props.global && reported.current !== props.error) {
		reported.current = props.error;
		const onCatch = props.route.options.onCatch ?? router.options.defaultOnCatch;
		onCatch?.(props.error, { componentStack: '' });
	}
	const store = router.stores.getMatchStore(props.route.id);
	const match = useStore(store, (m: any) => m);
	const firstMatch = useRef(match);
	useLayoutEffect(() => {
		if (firstMatch.current !== match) {
			firstMatch.current = match;
			props.reset();
		}
	}, [match]);

	@if (isMissing) {
		<CompiledComponent component={notFoundComponent} props={props.error} />
	} @else {
		<CompiledComponent
			component={errorComponent}
			props={{ error: props.error, reset: props.reset, info: { componentStack: '' } }}
		/>
	}
}

function CompiledScrollRestoration() @{
	const router = useRouter();
	const hydrated = useHydrated();
	const option = router.options.scrollRestoration;
	const script = getScrollRestorationScriptForRouter(router);
	const rendersScript = typeof option !== 'function' || option({ location: router.latestLocation });
	@if ((script !== null || rendersScript) && ((isServer ?? router.isServer) || !hydrated)) {
		<script
			nonce={router.options.ssr?.nonce}
			suppressHydrationWarning
			dangerouslySetInnerHTML={{ __html: script ?? '' }}
		/>
	}
}

export function lazyCompiledRouteComponent(importer: () => Promise<any>, exportName?: string) {
	const loader = createLazyRouteLoader(importer, exportName);
	function Lazy(props: any) @{
		<CompiledComponent component={loader.read()} props={props} />
	}
	Lazy.preload = loader.preload;
	return Lazy;
}
