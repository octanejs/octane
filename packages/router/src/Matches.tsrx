// Renders the navigation engine + the match tree root — port of react-router's
// Matches.tsx. Structure mirrors upstream:
//
//   InnerWrap? > Suspense(root pending) > Transitioner + MatchesInner
//   MatchesInner: matchContext(firstId) > global CatchBoundary? > Match(firstId)
//
// The root Suspense is ALWAYS present on the client (fallback is the root
// route's pendingComponent ?? defaultPendingComponent ?? null) — it's the
// already-revealed boundary that lets a navigation transition hold the current
// page when the next route suspends without a boundary of its own. The global
// CatchBoundary (opt out: `disableGlobalCatchBoundary`) renders the generic
// ErrorComponent for errors no route boundary caught, reset by `loadedAt`.
import { useLayoutEffect, createElement, Suspense } from 'octane';
import { setupScrollRestoration, rootRouteId } from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Transitioner } from './Transitioner.tsrx';
import { Match } from './Match.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export function Matches() @{
	const router = useRouter();
	const rootRoute = router.routesById[rootRouteId];
	const PendingComponent =
		rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent;
	const pendingElement =
		PendingComponent ? createElement(PendingComponent, {}) : null;
	const InnerWrap = router.options.InnerWrap ?? SafeFragment;

	// `createRouter({ scrollRestoration: true })` wires scroll save/restore here, so
	// it works without the (deprecated) <ScrollRestoration/> component.
	useLayoutEffect(() => {
		if (router.options.scrollRestoration) setupScrollRestoration(router);
	}, [router]);

	<InnerWrap>
		<Suspense fallback={pendingElement}>
			<Transitioner />
			<MatchesInner />
		</Suspense>
	</InnerWrap>
}

function MatchesInner() @{
	const router = useRouter();
	const matchId = useStore(router.stores.firstId, (id) => id);
	const resetKey = useStore(router.stores.loadedAt, (l) => l);
	const CatchWrap = router.options.disableGlobalCatchBoundary ? SafeFragment : CatchBoundary;

	<matchContext.Provider value={matchId}>
		<CatchWrap getResetKey={() => resetKey} errorComponent={ErrorComponent}>
			@if (matchId) {
				<Match matchId={matchId} />
			}
		</CatchWrap>
	</matchContext.Provider>
}
