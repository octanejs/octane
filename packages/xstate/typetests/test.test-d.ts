import { expectTypeOf, test } from 'vitest';
import { createActor, setup, type ActorRefFrom, type StateFrom } from 'xstate';
import { createActorContext, useActor, useActorRef, useMachine, useSelector } from '../src';

const machine = setup({
	types: {
		context: {} as { count: number },
		events: {} as { type: 'increment' },
	},
}).createMachine({
	context: { count: 0 },
	initial: 'active',
	states: { active: {} },
});

test('actor hooks preserve machine snapshot, send, and ref inference', () => {
	const [snapshot, send, actorRef] = useActor(machine);
	const [machineSnapshot, machineSend, machineRef] = useMachine(machine);
	const idleRef = useActorRef(machine);

	expectTypeOf(snapshot).toEqualTypeOf<StateFrom<typeof machine>>();
	expectTypeOf(send).toEqualTypeOf<ActorRefFrom<typeof machine>['send']>();
	expectTypeOf(actorRef).toExtend<ActorRefFrom<typeof machine>>();
	expectTypeOf(machineSnapshot).toEqualTypeOf<StateFrom<typeof machine>>();
	expectTypeOf(machineSend).toEqualTypeOf<ActorRefFrom<typeof machine>['send']>();
	expectTypeOf(machineRef).toExtend<ActorRefFrom<typeof machine>>();
	expectTypeOf(idleRef).toExtend<ActorRefFrom<typeof machine>>();
});

test('useSelector infers the selected value from an actor snapshot', () => {
	const actor = createActor(machine);
	const count = useSelector(actor, (snapshot) => snapshot.context.count);
	expectTypeOf(count).toEqualTypeOf<number>();
});

test('createActorContext preserves actor and selector types', () => {
	const context = createActorContext(machine);
	const actor = context.useActorRef();
	const count = context.useSelector((snapshot) => snapshot.context.count);

	expectTypeOf(actor).toExtend<ActorRefFrom<typeof machine>>();
	expectTypeOf(count).toEqualTypeOf<number>();
});

test('actor input remains required when the actor logic requires it', () => {
	const inputMachine = setup({
		types: {
			context: {} as { name: string },
			input: {} as { name: string },
		},
	}).createMachine({
		context: ({ input }) => ({ name: input.name }),
	});

	// @ts-expect-error input is required by this machine
	useActor(inputMachine);
	useActor(inputMachine, { input: { name: 'Octane' } });

	// @ts-expect-error input is required by this machine
	useActorRef(inputMachine);
	useActorRef(inputMachine, { input: { name: 'Octane' } });
});
