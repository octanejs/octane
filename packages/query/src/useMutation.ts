// `useMutation` — reimplemented on octane's hooks, mirroring
// @tanstack/react-query: a MutationObserver subscribed via useSyncExternalStore,
// with a stable `mutate` callback. The single compiler-injected slot is split
// into distinct sub-slots for each internal base hook.
import { useState, useCallback, useSyncExternalStore, useEffect } from 'octane';
import { MutationObserver, noop, notifyManager, shouldThrowError } from '@tanstack/query-core';
import { resolveClient } from './context';

function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':om:' + tag) : undefined;
}

export function useMutation(options: any, ...rest: any[]): any {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const queryClient = typeof rest[0] !== 'symbol' ? rest[0] : undefined;
	const client = resolveClient(queryClient);

	const [observer] = useState(() => new MutationObserver(client, options), subSlot(slot, 'obs'));

	useEffect(
		() => {
			observer.setOptions(options);
		},
		[observer, options],
		subSlot(slot, 'eff'),
	);

	const result = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => observer.subscribe(notifyManager.batchCalls(onStoreChange)),
			[observer],
			subSlot(slot, 'cb'),
		),
		() => observer.getCurrentResult(),
		() => observer.getCurrentResult(),
		subSlot(slot, 'uses'),
	);

	const mutate = useCallback(
		(variables: any, mutateOptions: any) => {
			observer.mutate(variables, mutateOptions).catch(noop);
		},
		[observer],
		subSlot(slot, 'mut'),
	);

	if (result.error && shouldThrowError(observer.options.throwOnError, [result.error])) {
		throw result.error;
	}

	return { ...result, mutate, mutateAsync: result.mutate };
}
