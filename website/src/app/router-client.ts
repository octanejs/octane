// The CLIENT router singleton (browser history + reactive stores). The client
// store factory commits matches inside a transition, so hydration must wait
// until they've landed — otherwise the first render sees an empty match tree
// and the adopt wipes the server DOM. `ensureClientRouterReady()` is awaited
// by AppEntry.ts's top-level await BEFORE @octanejs/vite-plugin's generated
// entry calls hydrateRoot (dynamic `import(entry)` resolves only after TLA
// settles). Same match-commit wait as examples/hacker-news's entry-client.
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
