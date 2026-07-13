// The CLIENT router singleton (browser history + reactive stores). The client
// store factory commits matches inside a transition, so hydration must wait
// until they've landed — otherwise the first render sees an empty match tree
// and the adopt wipes the server DOM. The default export is the plugin's
// `router.preHydrate` hook (octane.config.ts): the generated hydrate entry
// imports this module and awaits the hook BEFORE calling hydrateRoot. Same
// match-commit wait as examples/hacker-news's entry-client.
import { makeRouter } from './router.ts';

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
