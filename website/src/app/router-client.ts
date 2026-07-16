// The CLIENT router singleton (browser history + reactive stores). The client
// store factory commits matches inside a transition, so hydration must wait
// until they've landed — otherwise the first render sees an empty match tree
// and the adopt wipes the server DOM. The default export is the plugin's
// `router.preHydrate` hook (octane.config.ts): the generated hydrate entry
// imports this module and awaits the hook BEFORE calling hydrateRoot. Same
// match-commit wait as examples/hacker-news's entry-client.
import { makeRouter } from './router.ts';

// A new deployment purges the previous build's hashed chunks, so a tab still
// running the old bundle 404s when it lazy-imports a route chunk ("Failed to
// fetch dynamically imported module"). Vite surfaces those as
// `vite:preloadError` — reload so the stale client picks up the fresh
// deployment instead of stranding the navigation. The guard is TIME-bounded,
// not once-per-URL: a repeat failure on the same URL right after a reload
// means the chunk is genuinely broken, so the error surfaces instead of
// looping — while a long-lived tab that healed once can still recover from
// the next redeploy weeks later. Without storage (blocked cookies) reloads
// cannot be bounded, so the error surfaces there too.
if (typeof window !== 'undefined') {
	const RELOAD_RETRY_WINDOW_MS = 10_000;
	window.addEventListener('vite:preloadError', (event) => {
		const key = 'octane:preload-error-reload';
		const now = Date.now();
		try {
			const last = JSON.parse(sessionStorage.getItem(key) ?? 'null');
			if (last?.href === window.location.href && now - last.time < RELOAD_RETRY_WINDOW_MS) {
				return;
			}
			sessionStorage.setItem(key, JSON.stringify({ href: window.location.href, time: now }));
		} catch {
			return;
		}
		event.preventDefault();
		window.location.reload();
	});
}

export const clientRouter: any = typeof document === 'undefined' ? null : makeRouter();

export async function waitForRouterMatches(
	router: any,
	maxTimerTurns = 50,
	waitForTurn: () => Promise<unknown> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<void> {
	for (let turn = 0; turn < maxTimerTurns; turn++) {
		const matches = router.stores.matches.get?.() ?? router.stores.matches.value ?? [];
		if (matches.length > 0) return;
		await waitForTurn();
	}
	const href = router.latestLocation?.href ?? router.state?.location?.href ?? '<unknown URL>';
	throw new Error(
		`[octane website] Router load completed for ${href}, but no matches were committed after ${maxTimerTurns} timer turns. Hydration was stopped before it could erase the server tree.`,
	);
}

export async function ensureClientRouterReady(): Promise<void> {
	if (!clientRouter) return;
	await clientRouter.load();
	await waitForRouterMatches(clientRouter);
}

export default ensureClientRouterReady;
