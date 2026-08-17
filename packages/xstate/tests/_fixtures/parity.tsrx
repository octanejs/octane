import { createActorContext, useMachine } from '@octanejs/xstate';
import { assign, setup } from 'xstate';

const machine = setup({
	types: {
		context: {} as { count: number },
		events: {} as { type: 'increment' } | { type: 'reset' },
	},
}).createMachine({
	initial: 'active',
	context: { count: 0 },
	states: {
		active: {
			on: {
				increment: { actions: assign({ count: ({ context }) => context.count + 1 }) },
				reset: { actions: assign({ count: 0 }) },
			},
		},
	},
});

const MachineContext = createActorContext(machine);

function ContextCount() @{
	const count = MachineContext.useSelector((snapshot) => snapshot.context.count);
	const actor = MachineContext.useActorRef();
	<button id="context-increment" onClick={() => actor.send({ type: 'increment' })}>
		context:{count as string}
	</button>
}

export function XStateParity() @{
	const [snapshot, send] = useMachine(machine);
	<div>
		<span id="count">{snapshot.context.count as string}</span>
		<button id="increment" onClick={() => send({ type: 'increment' })}>increment</button>
		<button id="reset" onClick={() => send({ type: 'reset' })}>reset</button>
		<MachineContext.Provider>
			<ContextCount />
		</MachineContext.Provider>
	</div>
}
