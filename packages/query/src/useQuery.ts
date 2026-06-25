import { QueryObserver } from '@tanstack/query-core';
import { useBaseQuery } from './useBaseQuery';

export function useQuery(options: any, ...rest: any[]): any {
	// `[queryClient?, slot?]` — the slot (symbol) is the compiler-injected trailing
	// arg; an explicit client is the first non-symbol arg.
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const queryClient = typeof rest[0] !== 'symbol' ? rest[0] : undefined;
	return useBaseQuery(options, QueryObserver, queryClient, slot);
}
