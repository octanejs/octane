// Provider reconfiguration and transition acknowledgement mutate the live router.
// Keep their lifecycle in compatibility mode while the match tree renders Strong.
import { CompiledOutlet as CompiledComponent, CompiledContext, useLayoutEffect } from 'octane';
import { hasKeys, rootRouteId, setupScrollRestoration } from '@tanstack/router-core';
import { routerContext, matchContext, useRouter } from './bindings';
import { useStore } from '../useStore';
import { useTransitioner, settleOwner } from '../Transitioner.tsrx';
import { createLazyRouteLoader } from '../lazyRouteLoader';
import type { RouterProps } from '../RouterProvider.tsrx';
import { CompiledMatch } from './Matches.tsrx';
import { CompiledFailure, CompiledPending } from './MatchLifecycle.tsrx';

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
	const expectedMatches = useTransitioner(router);
	@try {
		<CompiledMatchesInner expectedMatches={expectedMatches} />
	} @pending {
		<CompiledPending route={rootRoute} />
	} @catch (error, reset) {
		if (router.options.disableGlobalCatchBoundary) throw error;
		<CompiledFailure error={error} reset={reset} route={rootRoute} global={true} />
	}
}

function CompiledMatchesInner(props: { expectedMatches: unknown }) @{
	const router = useRouter();
	const acknowledgement: Array<any> = ((router as any)._rendered ??= []);
	const matches = useStore(router.stores.matches, (m: any) =>
		acknowledgement[0] === props.expectedMatches ? (props.expectedMatches ?? m) : m,
	) as any;
	const rootMatch = matches[0];
	useLayoutEffect(() => {
		if (acknowledgement[0] === matches) settleOwner(acknowledgement, true);
	}, [acknowledgement, matches]);
	@if (rootMatch) {
		<CompiledContext context={matchContext} value={rootMatch.routeId}>
			<CompiledMatch routeId={rootMatch.routeId} />
		</CompiledContext>
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
