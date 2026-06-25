import { InfiniteQueryObserver, QueryObserver } from '@tanstack/query-core';
import { useBaseQuery } from './useBaseQuery';
import { defaultThrowOnError, splitSlot } from './internal';

export function useSuspenseQuery(options: any, ...rest: any[]): any {
	const [user, slot] = splitSlot(rest);
	return useBaseQuery(
		{
			...options,
			enabled: true,
			suspense: true,
			throwOnError: defaultThrowOnError,
			placeholderData: undefined,
		},
		QueryObserver,
		user[0],
		slot,
	);
}

export function useSuspenseInfiniteQuery(options: any, ...rest: any[]): any {
	const [user, slot] = splitSlot(rest);
	return useBaseQuery(
		{ ...options, enabled: true, suspense: true, throwOnError: defaultThrowOnError },
		InfiniteQueryObserver,
		user[0],
		slot,
	);
}
