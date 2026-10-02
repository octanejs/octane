// Runs the navigation engine and renders the match tree root — port of react-router's
// Matches.tsx. Structure mirrors upstream:
//
//   useTransitioner + InnerWrap? > Suspense(root pending) > MatchesInner
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
import { useRouter, matchContext as MatchContext } from './context.ts';
import { useTransitioner, settleOwner } from './Transitioner.tsrx';
import { Match } from './Match.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export function Matches() @{
	const router = useRouter();
	const rootRoute = (router.routesById as any)[rootRouteId];
	const PendingComponent =
		rootRoute.options.pendingComponent ?? router.options.defaultPendingComponent;
	const pendingElement = PendingComponent ? createElement(PendingComponent, {}) : null;
	const InnerWrap = router.options.InnerWrap ?? SafeFragment;

	// `createRouter({ scrollRestoration: true })` wires scroll save/restore here, so
	// it works without the (deprecated) <ScrollRestoration/> component.
	useLayoutEffect(() => {
		if (router.options.scrollRestoration) setupScrollRestoration(router);
	}, [router]);
	useTransitioner();

	<InnerWrap>
		<Suspense fallback={pendingElement}>
			<MatchesInner />
		</Suspense>
	</InnerWrap>
}

function MatchesInner() @{
	const router = useRouter();
	// router-core 1.171.34 dropped the `firstId`/`loadedAt` stores: the root match
	// is `matches[0]` and the global error boundary resets on its identity. While a
	// navigation transition is pending, render the matches router-core expects
	// (`acknowledgement[0]`) so the committed tree equals what it awaits, then
	// settle that render acknowledgement from a layout effect once it lands.
	const acknowledgement: Array<any> = ((router as any)._rendered ??= []);
	const matches = useStore(router.stores.matches, (m: any) => acknowledgement[0] ?? m);
	const rootMatch = matches[0];
	const routeId = rootMatch?.routeId as string | undefined;
	const CatchWrap = router.options.disableGlobalCatchBoundary ? SafeFragment : CatchBoundary;

	useLayoutEffect(() => {
		if (acknowledgement[0] === matches) settleOwner(acknowledgement, true);
	}, [acknowledgement, matches]);

	<MatchContext value={routeId}>
		<CatchWrap getResetKey={() => rootMatch} errorComponent={ErrorComponent}>
			@if (routeId) {
				<Match routeId={routeId} />
			}
		</CatchWrap>
	</MatchContext>
}
