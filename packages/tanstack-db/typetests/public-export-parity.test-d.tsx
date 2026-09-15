/** @jsxImportSource octane */
import { expectTypeOf } from 'vitest';
import * as Actual from '@octanejs/tanstack-db';
import * as Upstream from '@tanstack/react-db';
import type { OctaneNode } from 'octane';

expectTypeOf<keyof typeof Actual>().toEqualTypeOf<keyof typeof Upstream>();
expectTypeOf<Omit<typeof Actual, 'DbProvider' | 'HydrationBoundary'>>().toEqualTypeOf<
	Omit<typeof Upstream, 'DbProvider' | 'HydrationBoundary'>
>();
expectTypeOf<Parameters<typeof Actual.DbProvider>[0]>().toEqualTypeOf<{
	client: Actual.DbClient;
	children?: OctaneNode;
}>();
expectTypeOf<Parameters<typeof Actual.HydrationBoundary>[0]>().toEqualTypeOf<{
	state: Actual.DehydratedDbState;
	children?: OctaneNode;
}>();
expectTypeOf<Actual.DbProviderProps>().toEqualTypeOf<{
	client: Actual.DbClient;
	children?: OctaneNode;
}>();
expectTypeOf<Actual.HydrationBoundaryProps>().toEqualTypeOf<{
	state: Actual.DehydratedDbState;
	children?: OctaneNode;
}>();
expectTypeOf<Actual.UseLiveQueryStatus>().toEqualTypeOf<Upstream.UseLiveQueryStatus>();
expectTypeOf<Actual.LiveQueryKey>().toEqualTypeOf<Upstream.LiveQueryKey>();
expectTypeOf<Actual.UseLiveQueryConfig<Actual.Context>>().toEqualTypeOf<
	Upstream.UseLiveQueryConfig<Actual.Context>
>();
expectTypeOf<Actual.ConditionalUseLiveQueryConfig<Actual.Context>>().toEqualTypeOf<
	Upstream.ConditionalUseLiveQueryConfig<Actual.Context>
>();
expectTypeOf<Actual.UseLiveInfiniteQueryConfig<Actual.Context>>().toEqualTypeOf<
	Upstream.UseLiveInfiniteQueryConfig<Actual.Context>
>();
expectTypeOf<Actual.UseLiveInfiniteQueryReturn<Actual.Context>>().toEqualTypeOf<
	Upstream.UseLiveInfiniteQueryReturn<Actual.Context>
>();
const client = new Actual.DbClient();
const provider = (
	<Actual.DbProvider client={client}>
		<span />
	</Actual.DbProvider>
);
void provider;
// @ts-expect-error A provider requires a DB client.
<Actual.DbProvider />;
// @ts-expect-error Hydration requires serialized collection state.
<Actual.HydrationBoundary state="invalid" />;
// @ts-expect-error Queries require a query, collection, or supported configuration.
Actual.useLiveQuery(123);
