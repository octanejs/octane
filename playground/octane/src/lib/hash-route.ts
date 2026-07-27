// Hash routing for the playground.
//
// The URL is the single source of truth for which demo is on screen: navigation
// writes `location.hash` and the `hashchange` listener writes the state back, so
// there is no second copy to keep in sync and browser back/forward work without
// any extra bookkeeping. A hash (rather than a path) is deliberate — the
// playground is a static Vite app, so a path route would need a server rewrite
// to survive a reload.
import { useEffect, useState } from 'octane';

/** `#/counter` -> `counter`. Empty when there is no route. */
function readRoute(): string {
	return window.location.hash.replace(/^#\/?/, '');
}

/**
 * The current route, and a setter that navigates by writing the URL.
 *
 * Routes are a bare demo id rather than `group/id` so that regrouping the
 * catalog never breaks a shared link.
 *
 * `replace` swaps the current history entry instead of adding one. Correcting a
 * route the app cannot resolve must not leave a step in the history: pushing
 * one means Back returns to the bad hash, the correction fires again, and the
 * user can never leave the page.
 */
export function useHashRoute(): [string, (route: string, options?: { replace?: boolean }) => void] {
	const [route, setRoute] = useState(readRoute);

	useEffect(() => {
		const sync = () => setRoute(readRoute());
		window.addEventListener('hashchange', sync);
		return () => window.removeEventListener('hashchange', sync);
	}, []);

	return [
		route,
		(next: string, options?: { replace?: boolean }) => {
			if (options?.replace) {
				// replaceState does NOT emit `hashchange`, so the state has to be set
				// here — otherwise the caller's "is this route resolvable" test never
				// clears and it rewrites the URL on every render.
				window.history.replaceState(null, '', `#/${next}`);
				setRoute(next);
				return;
			}
			// A real navigation writes the URL and lets the listener above update the
			// state, so the URL stays the single source of truth.
			window.location.hash = `#/${next}`;
		},
	];
}
