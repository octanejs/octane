// Ported from @xstate/react@6.1.0 src/useMachine.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// Deprecated upstream and retained here for the same reason: it is still a
// published export of the pinned release.
import {
	Actor,
	ActorOptions,
	AnyStateMachine,
	StateFrom,
	type ConditionalRequired,
	type IsNotNever,
	type RequiredActorOptionsKeys,
} from 'xstate';
import { splitSlot } from './internal.ts';
import { useActor } from './useActor.ts';

/** @alias useActor */
export function useMachine<TMachine extends AnyStateMachine>(
	machine: TMachine,
	...rest: [
		...ConditionalRequired<
			[
				options?: ActorOptions<TMachine> & {
					[K in RequiredActorOptionsKeys<TMachine>]: unknown;
				},
			],
			IsNotNever<RequiredActorOptionsKeys<TMachine>>
		>,
		slot?: symbol,
	]
): [StateFrom<TMachine>, Actor<TMachine>['send'], Actor<TMachine>] {
	// This hook composes no hook cells of its own, so the caller's slot is
	// forwarded unchanged: `useMachine(m)` and `useActor(m)` at one call site must
	// resolve to the same hook identities, exactly as the upstream alias does.
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	const options = userArgs[0] as ActorOptions<TMachine> | undefined;

	return useActor(machine as AnyStateMachine, options as never, slot) as [
		StateFrom<TMachine>,
		Actor<TMachine>['send'],
		Actor<TMachine>,
	];
}
