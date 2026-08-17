import { createContext, useContext, type OctaneNode } from 'octane';
import type { Actor, ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';
import { splitSlot } from './internal';
import { useActorRef as useActorRefUnbound } from './useActorRef';
import { useSelector as useSelectorUnbound } from './useSelector';

export function createActorContext<TLogic extends AnyActorLogic>(
	actorLogic: TLogic,
	actorOptions?: ActorOptions<TLogic>,
) {
	const ActorContext = createContext<Actor<TLogic> | null>(null);

	function Provider(props: {
		children?: OctaneNode;
		options?: ActorOptions<TLogic>;
		/** @deprecated Use `logic` instead. */
		machine?: never;
		logic?: TLogic;
	}) {
		if (props.machine) {
			throw new Error('The "machine" prop has been deprecated. Please use "logic" instead.');
		}
		const actor = useActorRefUnbound(props.logic ?? actorLogic, {
			...actorOptions,
			...props.options,
		});
		return <ActorContext.Provider value={actor}>{props.children}</ActorContext.Provider>;
	}

	Provider.displayName = 'ActorProvider';

	function useActorRef(): Actor<TLogic> {
		const actor = useContext(ActorContext);
		if (!actor) {
			throw new Error('You used a hook from "ActorProvider" but it is not inside an <ActorProvider> component.');
		}
		return actor;
	}

	function useSelector<T>(
		selector: (snapshot: SnapshotFrom<TLogic>) => T,
		...rest: [compare?: (a: T, b: T) => boolean, slot?: symbol]
	): T {
		const [user, slot] = splitSlot(rest);
		const actor = useActorRef();
		return (useSelectorUnbound as (...args: any[]) => T)(
			actor,
			selector,
			user[0] as ((a: T, b: T) => boolean) | undefined,
			slot,
		);
	}

	return { Provider, useActorRef, useSelector };
}
