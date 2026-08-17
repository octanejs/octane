import type {
	Actor,
	ActorOptions,
	AnyStateMachine,
	ConditionalRequired,
	IsNotNever,
	RequiredActorOptionsKeys,
	StateFrom,
} from 'xstate';
import { useActor } from './useActor';

/** @alias useActor */
export function useMachine<TMachine extends AnyStateMachine>(
	machine: TMachine,
	...rest: ConditionalRequired<
		[
			options?: ActorOptions<TMachine> & {
				[K in RequiredActorOptionsKeys<TMachine>]: unknown;
			},
		],
		IsNotNever<RequiredActorOptionsKeys<TMachine>>
	>
): [StateFrom<TMachine>, Actor<TMachine>['send'], Actor<TMachine>];
export function useMachine<TMachine extends AnyStateMachine>(
	machine: TMachine,
	...rest: [options?: ActorOptions<TMachine>, slot?: symbol]
): [StateFrom<TMachine>, Actor<TMachine>['send'], Actor<TMachine>] {
	return (
		useActor as (...args: any[]) => [StateFrom<TMachine>, Actor<TMachine>['send'], Actor<TMachine>]
	)(machine, ...rest);
}
