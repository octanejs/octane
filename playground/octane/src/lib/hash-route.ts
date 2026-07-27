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
 */
export function useHashRoute(): [string, (route: string) => void] {
	const [route, setRoute] = useState(readRoute);

	useEffect(() => {
		const sync = () => setRoute(readRoute());
		window.addEventListener('hashchange', sync);
		return () => window.removeEventListener('hashchange', sync);
	}, []);

	// Writing the hash fires `hashchange`, which updates the state above — the
	// setter deliberately does not touch state itself, so the URL cannot drift
	// out of step with what is rendered.
	return [
		route,
		(next: string) => {
			window.location.hash = `#/${next}`;
		},
	];
}
