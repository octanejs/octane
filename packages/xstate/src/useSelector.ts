import { useCallback } from 'octane';
import type { AnyActorRef } from 'xstate';
import { splitSlot, subSlot } from './internal';
import { useSyncExternalStoreWithSelector } from './useSyncExternalStoreWithSelector';

type SyncExternalStoreSubscribe = Parameters<typeof useSyncExternalStoreWithSelector>[0];

function defaultCompare<T>(a: T, b: T) {
	return a === b;
}

export function useSelector<
	TActor extends Pick<AnyActorRef, 'subscribe' | 'getSnapshot'> | undefined,
	T,
>(
	actor: TActor,
	selector: (
		snapshot: TActor extends { getSnapshot(): infer TSnapshot } ? TSnapshot : undefined,
	) => T,
	compare?: (a: T, b: T) => boolean,
): T;
export function useSelector<
	TActor extends Pick<AnyActorRef, 'subscribe' | 'getSnapshot'> | undefined,
	T,
>(
	actor: TActor,
	selector: (
		snapshot: TActor extends { getSnapshot(): infer TSnapshot } ? TSnapshot : undefined,
	) => T,
	...rest: [compare?: (a: T, b: T) => boolean, slot?: symbol]
): T {
	const [user, slot] = splitSlot(rest);
	const compare = (user[0] as ((a: T, b: T) => boolean) | undefined) ?? defaultCompare;
	const subscribe: SyncExternalStoreSubscribe = useCallback(
		(handleStoreChange) => {
			if (!actor) return () => {};
			const { unsubscribe } = actor.subscribe({
				next: handleStoreChange,
				error: handleStoreChange,
			});
			return unsubscribe;
		},
		[actor],
		subSlot(slot, 'useSelector:subscribe'),
	);

	const getSnapshot = useCallback(
		() => {
			const snapshot = actor?.getSnapshot();
			if (snapshot && 'status' in snapshot && snapshot.status === 'error') {
				throw snapshot.error;
			}
			return snapshot;
		},
		[actor],
		subSlot(slot, 'useSelector:snapshot'),
	);

	return useSyncExternalStoreWithSelector(
		subscribe,
		getSnapshot,
		getSnapshot,
		selector,
		compare,
		subSlot(slot, 'useSelector:store'),
	);
}
