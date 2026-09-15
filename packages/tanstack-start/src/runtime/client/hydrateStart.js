import { hydrateStart as hydrateStartCore } from '@tanstack/start-client-core/client';

/**
 * The core hydration promise can settle before hydrated matches are observable to the
 * first render. Wait for that commit so hydration never adopts the server
 * document with an empty match tree.
 */
export function waitForRouterMatches(router) {
	const ids = router.stores.ids;
	if (ids.get().length > 0) return Promise.resolve();

	return new Promise((resolve) => {
		let resolved = false;
		const finish = () => {
			if (resolved || ids.get().length === 0) return;
			resolved = true;
			subscription.unsubscribe();
			resolve();
		};
		const subscription = ids.subscribe(finish);
		finish();
	});
}

export async function hydrateStart() {
	const router = await hydrateStartCore();
	await waitForRouterMatches(router);
	return router;
}
