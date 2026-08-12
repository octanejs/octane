import type { QueryClient, UseQueryResult } from '@octanejs/tanstack-query';
import { queryOptions, useQuery } from '@octanejs/tanstack-query';

const options = queryOptions({
	queryKey: ['user', 1] as const,
	queryFn: async () => ({ id: 1, name: 'Ada' }),
});

const result: UseQueryResult<{ id: number; name: string }, Error> = useQuery(options);
result.data?.name satisfies string | undefined;

declare const client: QueryClient;
client.getQueryData(options.queryKey) satisfies { id: number; name: string } | undefined;

// @ts-expect-error query data is inferred as an object, not a string
const invalid: string = result.data;
