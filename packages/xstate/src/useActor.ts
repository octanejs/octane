import { useCallback, useEffect, useSyncExternalStore } from 'octane';
import {
	type Actor,
	type ActorOptions,
	type AnyActorLogic,
	type ConditionalRequired,
	type IsNotNever,
	type RequiredActorOptionsKeys,
	type Snapshot,
	type SnapshotFrom,
} from 'xstate';
import { splitSlot, subSlot } from './internal';
import { stopRootWithRehydration } from './stopRootWithRehydration';
import { useIdleActorRef } from './useActorRef';

export function useActor<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: ConditionalRequired<
		[
			options?: ActorOptions<TLogic> & {
				[K in RequiredActorOptionsKeys<TLogic>]: unknown;
			},
		],
		IsNotNever<RequiredActorOptionsKeys<TLogic>>
	>
): [SnapshotFrom<TLogic>, Actor<TLogic>['send'], Actor<TLogic>];
export function useActor<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: [options?: ActorOptions<TLogic>, slot?: symbol]
): [SnapshotFrom<TLogic>, Actor<TLogic>['send'], Actor<TLogic>] {
	if (logic && 'send' in logic && typeof logic.send === 'function') {
		throw new Error(
			'useActor() expects actor logic (for example, a machine), but received an ActorRef. ' +
				'Use useSelector(actorRef, ...) to read an existing actor.',
		);
	}

	const [user, slot] = splitSlot(rest);
	const options = user[0] as ActorOptions<TLogic> | undefined;
	const actorRef = (useIdleActorRef as (...args: any[]) => Actor<TLogic>)(
		logic,
		options,
		subSlot(slot, 'actor:idle'),
	);
	const getSnapshot = useCallback(
		() => actorRef.getSnapshot(),
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
		subSlot(slot, 'actor:store'),
	);

	const snapshotWithStatus =
		'status' in actorSnapshot ? (actorSnapshot as Snapshot<unknown>) : undefined;
	if (snapshotWithStatus?.status === 'error') throw snapshotWithStatus.error;

	useEffect(
		() => {
			actorRef.start();
			return () => stopRootWithRehydration(actorRef);
		},
		[actorRef],
		subSlot(slot, 'actor:lifecycle'),
	);

	return [actorSnapshot, actorRef.send, actorRef];
}
