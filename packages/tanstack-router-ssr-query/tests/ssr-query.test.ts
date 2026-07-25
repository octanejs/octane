import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@octanejs/tanstack-query';
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

	it('dehydrates real cached queries into the router server state', async () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();

		setupRouterSsrQueryIntegration({ router, queryClient });
		attachRouterServerSsrUtils({ router, manifest: undefined });

		const dehydrated = await router.options.dehydrate?.();

		expect(dehydrated).toEqual(
			expect.objectContaining({
				dehydratedQueryClient: expect.objectContaining({
					queries: expect.arrayContaining([
						expect.objectContaining({
							queryKey: ['router-ssr-proof'],
							state: expect.objectContaining({ data: 'server-cached' }),
						}),
					]),
				}),
				queryStream: expect.any(ReadableStream),
			}),
		);
	});

	it('retains values produced by the original router dehydration callback', async () => {
		const router = makeSsrRouter();
		const queryClient = createCachedQueryClient();
		router.options.dehydrate = async () => ({ original: 'preserved' });

		setupRouterSsrQueryIntegration({ router, queryClient });
		attachRouterServerSsrUtils({ router, manifest: undefined });

		await expect(router.options.dehydrate?.()).resolves.toEqual(
			expect.objectContaining({
				original: 'preserved',
				queryStream: expect.any(ReadableStream),
			}),
		);
	});
});
