/** @jsxImportSource octane */
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	DbClient,
	DbProvider,
	HydrationBoundary,
	useDbClient,
	useOptionalDbClient,
	useLiveQuery,
	useLiveInfiniteQuery,
	useLiveSuspenseQuery,
	useLiveQueryEffect,
	usePacedMutations,
} from '@octanejs/tanstack-db';
import type {
	DbProviderProps,
	HydrationBoundaryProps,
	UseLiveQueryStatus,
	LiveQueryKey,
	UseLiveQueryConfig,
	ConditionalUseLiveQueryConfig,
	UseLiveInfiniteQueryConfig,
	UseLiveInfiniteQueryReturn,
} from '@octanejs/tanstack-db';
import type * as Upstream from '@tanstack/react-db';
import type { Context } from '@tanstack/db';
import type { OctaneNode } from 'octane';

type Client = Assert<Equal<typeof DbClient, typeof Upstream.DbClient>>;
type Provider = Assert<
	Equal<Parameters<typeof DbProvider>[0], { client: Upstream.DbClient; children?: OctaneNode }>
>;
type Hydration = Assert<
	Equal<
		Parameters<typeof HydrationBoundary>[0],
		{ state: Upstream.DehydratedDbState; children?: OctaneNode }
	>
>;
type ProviderProps = Assert<
	Equal<DbProviderProps, { client: Upstream.DbClient; children?: OctaneNode }>
>;
type HydrationProps = Assert<
	Equal<HydrationBoundaryProps, { state: Upstream.DehydratedDbState; children?: OctaneNode }>
>;
type ClientHook = Assert<Equal<typeof useDbClient, typeof Upstream.useDbClient>>;
type OptionalClientHook = Assert<
	Equal<typeof useOptionalDbClient, typeof Upstream.useOptionalDbClient>
>;
type LiveQuery = Assert<Equal<typeof useLiveQuery, typeof Upstream.useLiveQuery>>;
type InfiniteQuery = Assert<
	Equal<typeof useLiveInfiniteQuery, typeof Upstream.useLiveInfiniteQuery>
>;
type SuspenseQuery = Assert<
	Equal<typeof useLiveSuspenseQuery, typeof Upstream.useLiveSuspenseQuery>
>;
type QueryEffect = Assert<Equal<typeof useLiveQueryEffect, typeof Upstream.useLiveQueryEffect>>;
type PacedMutations = Assert<Equal<typeof usePacedMutations, typeof Upstream.usePacedMutations>>;
type QueryStatus = Assert<Equal<UseLiveQueryStatus, Upstream.UseLiveQueryStatus>>;
type QueryKey = Assert<Equal<LiveQueryKey, Upstream.LiveQueryKey>>;
type QueryConfig = Assert<Equal<UseLiveQueryConfig<Context>, Upstream.UseLiveQueryConfig<Context>>>;
type ConditionalConfig = Assert<
	Equal<ConditionalUseLiveQueryConfig<Context>, Upstream.ConditionalUseLiveQueryConfig<Context>>
>;
type InfiniteConfig = Assert<
	Equal<UseLiveInfiniteQueryConfig<Context>, Upstream.UseLiveInfiniteQueryConfig<Context>>
>;
type InfiniteResult = Assert<
	Equal<UseLiveInfiniteQueryReturn<Context>, Upstream.UseLiveInfiniteQueryReturn<Context>>
>;
const client = new DbClient();
const provider = (
	<DbProvider client={client}>
		<span />
	</DbProvider>
);
void provider;
// @ts-expect-error A provider requires a DB client.
<DbProvider />;
// @ts-expect-error Hydration requires serialized collection state.
<HydrationBoundary state="invalid" />;
// @ts-expect-error Queries require a query, collection, or supported configuration.
useLiveQuery(123);

type ProviderKeys = Assert<Equal<keyof Parameters<typeof DbProvider>[0], 'client' | 'children'>>;
type HydrationKeys = Assert<
	Equal<keyof Parameters<typeof HydrationBoundary>[0], 'state' | 'children'>
>;
type ProviderPropKeys = Assert<Equal<keyof DbProviderProps, 'client' | 'children'>>;
type HydrationPropKeys = Assert<Equal<keyof HydrationBoundaryProps, 'state' | 'children'>>;
type ProviderChildren = Assert<Equal<DbProviderProps['children'], OctaneNode>>;
type HydrationChildren = Assert<Equal<HydrationBoundaryProps['children'], OctaneNode>>;
