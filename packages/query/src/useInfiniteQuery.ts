import { InfiniteQueryObserver } from '@tanstack/query-core';
import { useBaseQuery } from './useBaseQuery';
import { splitSlot } from './internal';

export function useInfiniteQuery(options: any, ...rest: any[]): any {
	const [user, slot] = splitSlot(rest);
	return useBaseQuery(options, InfiniteQueryObserver, user[0], slot);
}
