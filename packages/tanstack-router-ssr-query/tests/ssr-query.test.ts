import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@octanejs/tanstack-query';
import { createMemoryHistory, createRootRoute, createRouter } from '@octanejs/tanstack-router';
import { attachRouterServerSsrUtils } from '@octanejs/tanstack-router/ssr/server';
import { setupRouterSsrQueryIntegration } from '@octanejs/tanstack-router-ssr-query';
import { renderToString } from 'octane/server';
import { makeSsrRouter } from '../../tanstack-router/tests/_fixtures/ssr.tsrx';
import { ExistingRouterWrapper, WrappedQueryReader } from './_fixtures/query-reader.tsrx';

const clients = new Set<QueryClient>();

function createCachedQueryClient(): QueryClient {
	const queryClient = new QueryClient();
	queryClient.setQueryData(['router-ssr-proof'], 'server-cached');
	clients.add(queryClient);
	return queryClient;
}

afterEach(() => {
	for (const queryClient of clients) {
		queryClient.clear();
	}
	clients.clear();
});

describe('@octanejs/tanstack-router-ssr-query', () => {
	it('provides the real router query client while server-rendering its wrapper', () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();

		setupRouterSsrQueryIntegration({ router, queryClient });

		const result = renderToString(WrappedQueryReader, { Wrap: router.options.Wrap! });

		expect(result.html).toContain('<output id="router-ssr-query">server-cached</output>');
	});

	it('preserves an existing router wrapper inside the query provider', () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();
		router.options.Wrap = ExistingRouterWrapper;

		setupRouterSsrQueryIntegration({ router, queryClient });

		const result = renderToString(WrappedQueryReader, { Wrap: router.options.Wrap! });

		expect(result.html).toContain('<section data-existing-router-wrapper="preserved">');
		expect(result.html).toContain('<output id="router-ssr-query">server-cached</output>');
	});

	it('keeps the existing wrapper when query-client wrapping is disabled', () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();
		router.options.Wrap = ExistingRouterWrapper;

		setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });

		expect(router.options.Wrap).toBe(ExistingRouterWrapper);
		expect(router.options.dehydrate).toEqual(expect.any(Function));
	});

	it('restores cached and streamed queries through the router hydration callbacks', async () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();

		setupRouterSsrQueryIntegration({ router, queryClient });
		attachRouterServerSsrUtils({ router, manifest: undefined });

		const restoredClient = new QueryClient();
		clients.add(restoredClient);
		const clientRouter = createRouter({
			routeTree: createRootRoute(),
			history: createMemoryHistory({ initialEntries: ['/'] }),
			isServer: false,
			origin: 'http://localhost',
		});
		setupRouterSsrQueryIntegration({ router: clientRouter, queryClient: restoredClient });
		try {
			expect(clientRouter.options.hydrate).toEqual(expect.any(Function));
			await clientRouter.options.hydrate!(await router.options.dehydrate?.());
			expect(restoredClient.getQueryData(['router-ssr-proof'])).toBe('server-cached');
			await queryClient.fetchQuery({ queryKey: ['late-query'], queryFn: async () => 'streamed' });
			await expect.poll(() => restoredClient.getQueryData(['late-query'])).toBe('streamed');
		} finally {
			router.serverSsr?.cleanup();
		}
		expect(queryClient.getQueryCache().getAll()).toEqual([]);
	});

	it('retains values produced by the original router dehydration callback', async () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();
		router.options.dehydrate = async () => ({ original: 'preserved' });

		setupRouterSsrQueryIntegration({ router, queryClient });
		attachRouterServerSsrUtils({ router, manifest: undefined });

		try {
			await expect(router.options.dehydrate?.()).resolves.toEqual(
				expect.objectContaining({ original: 'preserved' }),
			);
		} finally {
			router.serverSsr?.cleanup();
		}
	});
});
