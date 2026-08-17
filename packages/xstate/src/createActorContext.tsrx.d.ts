import type { ComponentBody, OctaneNode } from 'octane';
import type { Actor, ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';

export function createActorContext<TLogic extends AnyActorLogic>(
	actorLogic: TLogic,
	actorOptions?: ActorOptions<TLogic>,
): {
	useSelector: <T>(
		selector: (snapshot: SnapshotFrom<TLogic>) => T,
		compare?: (a: T, b: T) => boolean,
	) => T;
	useActorRef: () => Actor<TLogic>;
	Provider: ComponentBody<{
		children?: OctaneNode;
		options?: ActorOptions<TLogic>;
		/** @deprecated Use `logic` instead. */
		machine?: never;
		logic?: TLogic;
	}>;
};
