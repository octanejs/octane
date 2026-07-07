import { notifyManager } from '@tanstack/query-core';
import type { QueryClient, QueryFilters } from '@tanstack/query-core';
import { useSyncExternalStore, useCallback } from 'octane';
import { resolveClient } from './context';
import { splitSlot, subSlot } from './internal';

// Signature matches @tanstack/react-query's useIsFetching.ts.
export function useIsFetching(filters?: QueryFilters, queryClient?: QueryClient): number;

export function useIsFetching(...args: any[]): number {
	const [user, slot] = splitSlot(args);
	const filters = user[0];
	const client = resolveClient(user[1]);
	const queryCache = client.getQueryCache();
	return useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => queryCache.subscribe(notifyManager.batchCalls(onStoreChange)),
			[queryCache],
			subSlot(slot, 'if:cb'),
		),
		() => client.isFetching(filters),
		() => client.isFetching(filters),
		subSlot(slot, 'if:uses'),
	);
}
