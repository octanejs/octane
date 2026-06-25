import { resolveClient } from './context';
import { splitSlot } from './internal';

export function usePrefetchQuery(options: any, ...rest: any[]): void {
	const [user] = splitSlot(rest);
	const client = resolveClient(user[0]);
	if (!client.getQueryState(options.queryKey)) {
		client.prefetchQuery(options);
	}
}

export function usePrefetchInfiniteQuery(options: any, ...rest: any[]): void {
	const [user] = splitSlot(rest);
	const client = resolveClient(user[0]);
	if (!client.getQueryState(options.queryKey)) {
		client.prefetchInfiniteQuery(options);
	}
}
