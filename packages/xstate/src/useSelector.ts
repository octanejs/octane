// Ported from @xstate/react@6.1.0 src/useSelector.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// Upstream imports `useSyncExternalStoreWithSelector` from
// `use-sync-external-store/shim/with-selector`. That shim is React-specific, so
// this package carries a local port of the same algorithm; see
// ./useSyncExternalStoreWithSelector.ts.
import { useCallback } from 'octane';
import { AnyActorRef } from 'xstate';
import { splitSlot, subSlot } from './internal.ts';
import { useSyncExternalStoreWithSelector } from './useSyncExternalStoreWithSelector.ts';

type SyncExternalStoreSubscribe = (onStoreChange: () => void) => () => void;

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
	...rest: [compare?: (a: T, b: T) => boolean, slot?: symbol]
): T {
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	const compare = (userArgs[0] as ((a: T, b: T) => boolean) | undefined) ?? defaultCompare;

	const subscribe: SyncExternalStoreSubscribe = useCallback(
		(handleStoreChange) => {
			if (!actor) {
				return () => {};
			}
			const { unsubscribe } = actor.subscribe({
				next: handleStoreChange,
				error: handleStoreChange,
			});
			return unsubscribe;
		},
		[actor],
		subSlot(slot, 'selector:subscribe'),
	);

	const boundGetSnapshot = useCallback(
		() => {
			const snapshot = actor?.getSnapshot();
			if (snapshot && 'status' in snapshot && snapshot.status === 'error') {
				throw snapshot.error;
			}
			return snapshot;
		},
		[actor],
		subSlot(slot, 'selector:snapshot'),
	);

	const selectedSnapshot = useSyncExternalStoreWithSelector(
		subscribe,
		boundGetSnapshot,
		boundGetSnapshot,
		selector as (snapshot: unknown) => T,
		compare,
		subSlot(slot, 'selector:external-store'),
	);

	return selectedSnapshot;
}
