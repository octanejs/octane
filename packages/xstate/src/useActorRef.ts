import { useEffect, useLayoutEffect, useState } from 'octane';
import {
	createActor,
	toObserver,
	type Actor,
	type ActorOptions,
	type AnyActorLogic,
	type AnyStateMachine,
	type ConditionalRequired,
	type IsNotNever,
	type Observer,
	type RequiredActorOptionsKeys,
	type SnapshotFrom,
} from 'xstate';
import { splitSlot, subSlot } from './internal';
import { stopRootWithRehydration } from './stopRootWithRehydration';

export function useIdleActorRef<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: ConditionalRequired<
		[
			options?: ActorOptions<TLogic> & {
				[K in RequiredActorOptionsKeys<TLogic>]: unknown;
			},
		],
		IsNotNever<RequiredActorOptionsKeys<TLogic>>
	>
): Actor<TLogic>;
export function useIdleActorRef<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: [options?: ActorOptions<TLogic>, slot?: symbol]
): Actor<TLogic> {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as ActorOptions<TLogic> | undefined;
	const [current, setCurrent] = useState(
		() => [logic.config, createActor(logic, options)] as const,
		subSlot(slot, 'idle:actor'),
	);
	let actorRef = current[1];

	if (logic.config !== current[0]) {
		actorRef = createActor(logic, {
			...options,
			snapshot: (actorRef.getPersistedSnapshot as any)({
				__unsafeAllowInlineActors: true,
			}),
		});
		setCurrent([logic.config, actorRef]);
	}

	useLayoutEffect(
		() => {
			(actorRef.logic as unknown as AnyStateMachine).implementations = (
				logic as unknown as AnyStateMachine
			).implementations;
		},
		null,
		subSlot(slot, 'idle:implementations'),
	);

	return actorRef;
}

export function useActorRef<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: IsNotNever<RequiredActorOptionsKeys<TLogic>> extends true
		? [
				options: ActorOptions<TLogic> & {
					[K in RequiredActorOptionsKeys<TLogic>]: unknown;
				},
				observerOrListener?:
					Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void),
			]
		: [
				options?: ActorOptions<TLogic>,
				observerOrListener?:
					Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void),
			]
): Actor<TLogic>;
export function useActorRef<TLogic extends AnyActorLogic>(
	logic: TLogic,
	...rest: [
		options?: ActorOptions<TLogic>,
		observerOrListener?: Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void),
		slot?: symbol,
	]
): Actor<TLogic> {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as ActorOptions<TLogic> | undefined;
	const observerOrListener = user[1] as
		Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void) | undefined;
	const actorRef = (useIdleActorRef as (...args: any[]) => Actor<TLogic>)(
		logic,
		options,
		subSlot(slot, 'ref:idle'),
	);

	useEffect(
		() => {
			if (!observerOrListener) return;
			const subscription = actorRef.subscribe(toObserver(observerOrListener));
			return () => subscription.unsubscribe();
		},
		[actorRef, observerOrListener],
		subSlot(slot, 'ref:observer'),
	);

	useEffect(
		() => {
			actorRef.start();
			return () => stopRootWithRehydration(actorRef);
		},
		[actorRef],
		subSlot(slot, 'ref:lifecycle'),
	);

	return actorRef;
}
