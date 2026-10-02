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
import { useLayoutEffect, useState, startTransition } from 'octane';
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core';
import { useRouter } from './context.ts';

// Resolve the pending render acknowledgement with whether the expected matches
// rendered, then clear the slot. `owner` is `router._rendered`: `[expected, resolve]`.
export function settleOwner(owner: Array<any>, rendered: boolean) {
	const settle = owner[1] as ((rendered: boolean) => void) | undefined;
	owner.length = 0;
	settle?.(rendered);
}

export function useTransitioner() {
	const router = useRouter() as any;
	const [, forceRender] = useState<object>();

	const acknowledgement: Array<any> = (router._rendered ??= []);

	router.startTransition = (fn: () => void, expected: unknown) =>
		new Promise<boolean>((resolve) => {
			// A newer transition supersedes an unrendered older one.
			settleOwner(acknowledgement, false);
			acknowledgement.push(expected, resolve);
			// Force `MatchesInner` to re-read: it renders `acknowledgement[0]` and
			// settles this promise from a layout effect once that commit lands.
			forceRender({});
			startTransition(fn);
		});

	useLayoutEffect(() => {
		const unsub = router.history.subscribe(() => router.load());

		// octane has no StrictMode double-invoke, so this layout effect runs once per
		// mounted router and re-runs only when the router (or its history) is swapped
		// on a live provider — exactly when the new router needs its initial load.
		// Upstream guards this block with a dev-only `mounted` ref purely to absorb
		// React's StrictMode double-invoke; keeping that ref here would instead skip
		// the swapped-in router's load.
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
			// Already resolved (SSR hydration): emit `onRendered` for scroll
			// restoration and devtools. The match tree has already committed by the
			// time this layout effect runs (child effects fire before the parent's),
			// so emit directly rather than through the acknowledgement/settle path:
			// hydration acknowledges the matches already on screen, which — unlike a
			// navigation that commits the *next* matches — triggers no re-render for
			// `MatchesInner`'s settle effect to run on.
			router.emit({
				type: 'onRendered',
				...getLocationChangeInfo(resolvedLocation, resolvedLocation),
			});
		} else if (!router._tx) {
			router.load({ sync: true }).catch((err: unknown) => {
				console.error(err);
			});
		}
		return unsub;
	}, [router, router.history]);
}
