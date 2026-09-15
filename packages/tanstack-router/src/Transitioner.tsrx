// Keep the navigation engine in a hook so it adds no SSR sibling before a
// route-owned <html>. Core owns load events and pending timing; the renderer
// acknowledges the exact match generation after its tree commits.
import { useLayoutEffect, useRef, useState, startTransition } from 'octane';
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core';
import type { AnyRouter, AnyRouteMatch } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import type { RefObject } from 'octane';

export function settleOwner(owner: NonNullable<AnyRouter['_rendered']>, rendered: boolean) {
	const settle = owner[1];
	owner.length = 0;
	settle?.(rendered);
}

export function useTransitioner(committedMatches: RefObject<Array<AnyRouteMatch> | undefined>) {
	const router = useRouter();
	const acknowledgement = router._rendered ??= [];
	const mounted = useRef<AnyRouter | undefined>(undefined);
	const [, publishInitialRouter] = useState<AnyRouter | undefined>(undefined);

	router.startTransition = (fn, expected) => new Promise((resolve) => {
		settleOwner(acknowledgement, false);
		acknowledgement.push(expected, resolve);
		publishInitialRouter(router);
		startTransition(fn);
	});

	useLayoutEffect(() => {
		const unsub = router.history.subscribe(router.load);
		if (mounted.current === router) return unsub;
		mounted.current = router;
		router.updateLatestLocation();
		const location = router.latestLocation;
		const nextLocation = router.buildLocation({
			to: location.pathname,
			search: true,
			params: true,
			hash: true,
			state: true,
			_includeValidateSearch: true,
		});
		if (trimPathRight(location.publicHref) !== trimPathRight(nextLocation.publicHref)) {
			router.commitLocation({ ...nextLocation, replace: true, ignoreBlocker: true });
			return unsub;
		}
		const resolvedLocation = router.stores.resolvedLocation.get();
		if (
			resolvedLocation?.href === location.href &&
				resolvedLocation.state.__TSR_key === location.state.__TSR_key
		) {
			acknowledgement.push(router.stores.matches.get(), (rendered) => {
				if (rendered) router.emit({
					type: 'onRendered',
					...getLocationChangeInfo(resolvedLocation, resolvedLocation),
				});
			});
			// Native child layout effects have already committed this generation.
			// A load settled before mounting does not publish another store update.
			if (acknowledgement[0] === committedMatches.current) settleOwner(acknowledgement, true);
		} else if (!router._tx) {
			router.load({ sync: true }).catch(console.error);
		}
		return unsub;
	}, [router, router.history, committedMatches]);
}
