import { hydrateRoot } from 'octane';
import { QueryClient, hydrate } from '@octanejs/tanstack-query';
import type { DehydratedState } from '@octanejs/tanstack-query';
import { createRootRoute, createRouter, createMemoryHistory } from '@octanejs/tanstack-router';
import { setupRouterSsrQueryIntegration } from '@octanejs/tanstack-router-ssr-query';
import { ExistingWrapper, ProviderHydration, queryKey } from './provider-hydration.tsrx';

export function mount(target: HTMLElement, portal: HTMLElement, state: DehydratedState) {
	const client = new QueryClient();
	hydrate(client, state);
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		Wrap: ExistingWrapper,
	});
	setupRouterSsrQueryIntegration({ router, queryClient: client });
	const root = hydrateRoot(target, ProviderHydration, { Wrap: router.options.Wrap!, portal });
	return {
		update(value: string) {
			client.setQueryData(queryKey, value);
		},
		observers() {
			return client.getQueryCache().find({ queryKey })?.getObserversCount() ?? 0;
		},
		unmount() {
			root.unmount();
		},
		clear() {
			client.clear();
		},
	};
}
