// Ported from @xstate/react@6.1.0 src/useActor.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// Upstream imports the plain `use-sync-external-store/shim`. Octane's
// `useSyncExternalStore` is a first-class runtime hook, so the shim is dropped
// and the native hook is called directly.
import { useCallback, useEffect, useSyncExternalStore } from 'octane';
import {
	Actor,
	ActorOptions,
	AnyActorLogic,
	Snapshot,
	SnapshotFrom,
	type ConditionalRequired,
	type IsNotNever,
	type RequiredActorOptionsKeys,
} from 'xstate';
import isDevelopment from './isDevelopment.ts';
import { splitSlot, subSlot } from './internal.ts';
import { stopRootWithRehydration } from './stopRootWithRehydration.ts';
import { useIdleActorRef } from './useActorRef.ts';

export function useActor<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: [
		...ConditionalRequired<
			[
				options?: ActorOptions<TLogic> & {
					[K in RequiredActorOptionsKeys<TLogic>]: unknown;
				},
			],
			IsNotNever<RequiredActorOptionsKeys<TLogic>>
		>,
		slot?: symbol,
	]
): [SnapshotFrom<TLogic>, Actor<TLogic>['send'], Actor<TLogic>] {
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	const options = userArgs[0] as ActorOptions<TLogic> | undefined;

	if (isDevelopment && !!logic && 'send' in logic && typeof logic.send === 'function') {
		throw new Error(
			`useActor() expects actor logic (e.g. a machine), but received an ActorRef. Use the useSelector(actorRef, ...) hook instead to read the ActorRef's snapshot.`,
		);
	}

	const actorRef = useIdleActorRef(logic, options, subSlot(slot, 'actor:idle'));

	const getSnapshot = useCallback(
		() => {
			return actorRef.getSnapshot();
		},
		[actorRef],
		subSlot(slot, 'actor:snapshot'),
	);

	const subscribe = useCallback(
		(handleStoreChange: () => void) => {
			const { unsubscribe } = actorRef.subscribe({
				next: handleStoreChange,
				error: handleStoreChange,
			});
			return unsubscribe;
		},
		[actorRef],
		subSlot(slot, 'actor:subscribe'),
	);

	const actorSnapshot = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
		subSlot(slot, 'actor:external-store'),
	);

	const snapshotWithStatus =
		'status' in (actorSnapshot as object) ? (actorSnapshot as Snapshot<unknown>) : undefined;
	if (snapshotWithStatus?.status === 'error') {
		throw snapshotWithStatus.error;
	}

	useEffect(
		() => {
			actorRef.start();

			return () => {
				stopRootWithRehydration(actorRef);
			};
		},
		[actorRef],
		subSlot(slot, 'actor:lifecycle'),
	);

	return [actorSnapshot as SnapshotFrom<TLogic>, actorRef.send, actorRef];
}
