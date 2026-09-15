import type { DefaultError, InfiniteData, QueryClient, QueryKey } from '@tanstack/query-core';
import { noop } from '@tanstack/query-core';
import { resolveClient } from './context';
import { splitSlot } from './internal';
import type { UsePrefetchQueryOptions, UsePrefetchInfiniteQueryOptions } from './types';

// Signatures match @tanstack/react-query's usePrefetchQuery.tsx /
// usePrefetchInfiniteQuery.tsx.
export function usePrefetchQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: UsePrefetchQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
	queryClient?: QueryClient,
): void;

export function usePrefetchQuery(options: any, ...rest: any[]): void {
	const [user] = splitSlot(rest);
	const client = resolveClient(user[0]);
	if (!client.getQueryState(options.queryKey)) {
		void client.query(options).catch(noop);
	}
}

export function usePrefetchInfiniteQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: UsePrefetchInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	queryClient?: QueryClient,
): void;

export function usePrefetchInfiniteQuery(options: any, ...rest: any[]): void {
	const [user] = splitSlot(rest);
	const client = resolveClient(user[0]);
	if (!client.getQueryState(options.queryKey)) {
		void client.infiniteQuery(options).catch(noop);
	}
}
