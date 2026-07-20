import { hydrateStart as hydrateStartCore } from '@tanstack/start-client-core/client';

/**
 * Octane batches router store writes in a transition. The core hydration
 * promise can therefore settle before hydrated matches are observable to the
 * first render. Wait for that commit so hydration never adopts the server
 * document with an empty match tree.
 */
export function waitForRouterMatches(router) {
	const matchesId = router.stores.matchesId;
	if (matchesId.get().length > 0) return Promise.resolve();

	return new Promise((resolve) => {
		let resolved = false;
		const finish = () => {
			if (resolved || matchesId.get().length === 0) return;
			resolved = true;
			subscription.unsubscribe();
			resolve();
		};
		const subscription = matchesId.subscribe(finish);
		finish();
	});
}

export async function hydrateStart() {
	const router = await hydrateStartCore();
	await waitForRouterMatches(router);
	return router;
}
