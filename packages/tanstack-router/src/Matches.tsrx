import { useLayoutEffect, useRef, Suspense } from 'octane';
import { setupScrollRestoration, rootRouteId } from '@tanstack/router-core';
import { isServer } from '@tanstack/router-core/isServer';
import type { AnyRouteMatch } from '@tanstack/router-core';
import type { RefObject } from 'octane';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { useTransitioner, settleOwner } from './Transitioner.tsrx';
import { Match, renderPending } from './Match.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export function Matches() @{
	const router = useRouter();
	const PendingComponent =
		router.routesById[rootRouteId]?.options.pendingComponent ??
			router.options.defaultPendingComponent;
	const pendingElement = renderPending(PendingComponent);
	const InnerWrap = router.options.InnerWrap ?? SafeFragment;
	const RootSuspense =
		(isServer ?? router.isServer) || router.ssr ? SafeFragment : Suspense;
	useLayoutEffect(() => {
		if (router.options.scrollRestoration) setupScrollRestoration(router);
	}, [router]);
	const committedMatches = useRef<Array<AnyRouteMatch> | undefined>(undefined);
	if (!(isServer ?? router.isServer)) useTransitioner(committedMatches);

	<InnerWrap>
		<RootSuspense fallback={pendingElement}>
			<MatchesInner committedMatches={committedMatches} />
		</RootSuspense>
	</InnerWrap>
}

function MatchesInner(props: { committedMatches: RefObject<Array<AnyRouteMatch> | undefined> }) @{
	const router = useRouter();
	const acknowledgement = router._rendered ??= [];
	const matches = useStore(router.stores.matches, (value) => acknowledgement[0] ?? value);
	const match = matches[0];
	const routeId = match?.routeId;
	const CatchWrap = router.options.disableGlobalCatchBoundary ? SafeFragment : CatchBoundary;
	useLayoutEffect(() => {
		props.committedMatches.current = matches;
		if (acknowledgement[0] === matches) settleOwner(acknowledgement, true);
	}, [acknowledgement, matches, props.committedMatches]);

	<matchContext.Provider value={routeId}>
		<CatchWrap getResetKey={() => match} errorComponent={ErrorComponent}>
			@if (routeId) {
				<Match routeId={routeId} />
			}
		</CatchWrap>
	</matchContext.Provider>
}
