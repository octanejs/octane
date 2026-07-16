import { Dexie } from 'dexie';
import { useSuspendingObservable } from './useSuspendingObservable';

export function useSuspendingLiveQuery<T>(
	querier: () => Promise<T> | T,
	cacheKey: readonly unknown[],
): T;
export function useSuspendingLiveQuery<T>(
	querier: () => Promise<T> | T,
	...rest: [readonly unknown[], symbol?]
): T {
	const [args, slot] =
		typeof rest[rest.length - 1] === 'symbol'
			? [rest.slice(0, -1), rest[rest.length - 1] as symbol]
			: [rest, undefined];
	return useSuspendingObservable(
		() => Dexie.liveQuery(querier),
		['dexie', ...(args[0] as readonly unknown[])],
		slot,
	);
}
