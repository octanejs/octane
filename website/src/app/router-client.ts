// The CLIENT router singleton (browser history + reactive stores). The client
// store factory commits matches inside a transition, so hydration must wait
// until they've landed — otherwise the first render sees an empty match tree
// and the adopt wipes the server DOM. The default export is the plugin's
// `router.preHydrate` hook (octane.config.ts): the generated hydrate entry
// imports this module and awaits the hook BEFORE calling hydrateRoot. Same
// match-commit wait as examples/hacker-news's entry-client.
import { makeRouter } from './router.ts';

export const clientRouter: any = typeof document === 'undefined' ? null : makeRouter();

export async function ensureClientRouterReady(): Promise<void> {
	if (!clientRouter) return;
	await clientRouter.load();
	for (let i = 0; i < 50; i++) {
		const matches = clientRouter.stores.matches.get?.() ?? clientRouter.stores.matches.value ?? [];
		if (matches.length > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

export default ensureClientRouterReady;
