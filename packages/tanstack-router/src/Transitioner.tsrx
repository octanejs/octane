'use strong';

// The navigation engine — port of react-router's Transitioner. It runs as a hook
// because a rendered sibling would place an SSR marker before a root route's
// document-level <html> node and outside the #__app hydration range.
//
// router-core 1.171.34 owns the navigation lifecycle end to end: `load` drives
// `startViewTransition` → `startTransition(commit, matches)`, awaits the render
// acknowledgement, then emits `onLoad`/`onBeforeRouteMount`/`onResolved`/
// `onRendered` and commits `status`/`resolvedLocation` itself. The binding's only
// remaining jobs are:
//   1. Supply `router.startTransition(fn, expected)` as that render
//      ACKNOWLEDGEMENT — a promise router-core awaits that resolves `true` only
//      once `MatchesInner` has rendered the `expected` matches (via `settleOwner`).
//      Running `fn` inside an octane transition is what lets the current page hold
//      while the next route suspends.
//   2. Subscribe to history so back/forward and `Link` clicks reload; replace a
//      non-canonical mounted URL (mirrors the server-side check in beforeLoad);
//      and kick off the initial load — or, when hydrating an already-resolved SSR
//      location, acknowledge the first render so `onRendered` consumers (scroll
//      restoration, devtools) fire.
import { useInsertionEffect, useLayoutEffect, startTransition } from 'octane';
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core';
import type { AnyRouteMatch, AnyRouter } from '@tanstack/router-core';
import { useStore } from './useStore';

// Resolve the pending render acknowledgement with whether the expected matches
// rendered, then clear the slot. `owner` is `router._rendered`: `[expected, resolve]`.
function settleOwner(owner: NonNullable<AnyRouter['_rendered']>, rendered: boolean) {
	const settle = owner[1];
	owner.length = 0;
	settle?.(rendered);
}

function installTransitioner(router: AnyRouter) {
	const acknowledgement = (router._rendered ??= []);
	const previous = router.startTransition;
	const owned: AnyRouter['startTransition'] = (fn, expected) =>
		new Promise<boolean>((resolve) => {
			settleOwner(acknowledgement, false);
			acknowledgement[0] = expected;
			acknowledgement[1] = resolve;
			startTransition(fn);
		});
	router.startTransition = owned;
	return () => {
		if (router.startTransition === owned) {
			router.startTransition = previous;
			settleOwner(acknowledgement, false);
		}
	};
}

function subscribeToHistory(router: AnyRouter, history: AnyRouter['history']) {
	const unsub = history.subscribe(() => router.load());

	// Re-run for a replacement router or history so the new instance loads.
	router.updateLatestLocation?.();
	const location = router.latestLocation;
	const nextLocation = router.buildLocation({
		to: location.pathname,
		search: true,
		params: true,
		hash: true,
		state: true,
		_includeValidateSearch: true,
	} as any);
	if (trimPathRight(location.publicHref) !== trimPathRight(nextLocation.publicHref)) {
		router.commitLocation({ ...nextLocation, replace: true, ignoreBlocker: true });
		return unsub;
	}

	const resolvedLocation = router.stores.resolvedLocation.get();
	if (
		resolvedLocation?.href === location.href &&
		resolvedLocation.state.__TSR_key === location.state.__TSR_key
	) {
		// Hydration acknowledges the already-committed tree, which does not trigger
		// another render for the navigation acknowledgement effect to observe.
		router.emit({
			type: 'onRendered',
			...getLocationChangeInfo(resolvedLocation, resolvedLocation),
			fromLocation: resolvedLocation,
		});
	} else if (!router._tx) {
		router.load({ sync: true }).catch((err: unknown) => {
			console.error(err);
		});
	}
	return unsub;
}

export function useTransitioner(router: AnyRouter) {
	const history = router.history;
	// Install before descendant layout effects can navigate, without mutating the
	// router during render or placing a sibling before a document-level route.
	useInsertionEffect(() => installTransitioner(router));
	useLayoutEffect(() => subscribeToHistory(router, history));
}

function acknowledgeRenderedMatches(router: AnyRouter, matches: Array<AnyRouteMatch>) {
	const owner = router._rendered;
	if (owner && owner[0] === matches) settleOwner(owner, true);
}

// The store may reconstruct its match array, so a navigation must present the
// exact snapshot offered by router-core until that tree commits. The live owner
// is observed only by the store snapshot and by the commit acknowledgement.
// Mirroring it in component state would entangle that update with an async action
// awaiting navigation, leaving both the action and its render acknowledgement pending.
export function usePresentedMatches(router: AnyRouter) {
	const matches = useStore(router.stores.matches, (current) => router._rendered?.[0] ?? current);
	useLayoutEffect(() => acknowledgeRenderedMatches(router, matches));
	return matches;
}
