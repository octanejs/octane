import { Dexie } from 'dexie';
import { useObservable } from './useObservable';

export function useLiveQuery<T>(querier: () => Promise<T> | T, deps?: unknown[]): T | undefined;
export function useLiveQuery<T, TDefault>(
	querier: () => Promise<T> | T,
	deps: unknown[],
	defaultResult: TDefault,
): T | TDefault;
export function useLiveQuery<T, TDefault>(
	querier: () => Promise<T> | T,
	...rest: [unknown?, unknown?, symbol?]
): T | TDefault | undefined {
	const slot = typeof rest[rest.length - 1] === 'symbol' ? rest.pop() : undefined;
	const deps = (rest[0] as unknown[] | undefined) ?? [];
	const defaultResult = rest[1] as TDefault | undefined;
	return useObservable(
		() => Dexie.liveQuery(querier) as any,
		deps,
		defaultResult,
		slot as symbol | undefined,
	) as T | TDefault | undefined;
}
