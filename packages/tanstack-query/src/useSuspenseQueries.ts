// Bundlers replace this expression; no Node ambient types are required.
declare const process: { env: { NODE_ENV?: string } };
import { skipToken } from '@tanstack/query-core';
import type { QueryClient } from '@tanstack/query-core';
import { defaultThrowOnError } from './internal';
import { useQueries } from './useQueries';
import type {
	SuspenseQueriesOptions,
	SuspenseQueriesResults,
	GetUseSuspenseQueryOptions,
} from './suspense-queries-types';

// Signature matches @tanstack/react-query's useSuspenseQueries.ts.
export function useSuspenseQueries<
	T extends Array<any>,
	TCombinedResult = SuspenseQueriesResults<T>,
>(
	options: {
		queries:
			| readonly [...SuspenseQueriesOptions<T>]
			| readonly [...{ [K in keyof T]: GetUseSuspenseQueryOptions<T[K]> }];
		combine?: (result: SuspenseQueriesResults<T>) => TCombinedResult;
	},
	queryClient?: QueryClient,
): TCombinedResult;

export function useSuspenseQueries<
	T extends Array<any>,
	TCombinedResult = SuspenseQueriesResults<T>,
>(
	options: {
		queries: readonly [...SuspenseQueriesOptions<T>];
		combine?: (result: SuspenseQueriesResults<T>) => TCombinedResult;
	},
	queryClient?: QueryClient,
): TCombinedResult;

export function useSuspenseQueries(options: any, ...rest: any[]): any {
	return useQueries(
		{
			...options,
			queries: options.queries.map((query: any) => {
				if (process.env.NODE_ENV !== 'production' && query.queryFn === skipToken) {
					console.error('skipToken is not allowed for useSuspenseQueries');
				}
				return {
					...query,
					suspense: true,
					throwOnError: defaultThrowOnError,
					enabled: true,
					placeholderData: undefined,
				};
			}),
		},
		...rest,
	);
}
