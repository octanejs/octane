import { createActorContext, useMachine } from '@octanejs/xstate';
import { createMachine } from 'xstate';

const machine = createMachine({
	context: { count: 7 },
	initial: 'active',
	states: { active: {} },
});

const MachineContext = createActorContext(machine);

function ContextCount() @{
	const count = MachineContext.useSelector((snapshot) => snapshot.context.count);
	<span id="context-count">{'context=' + count}</span>
}

export function ServerView() @{
	const [snapshot] = useMachine(machine);
	<MachineContext.Provider>
		<p id="server-value">{snapshot.context.count as string}</p>
		<ContextCount />
	</MachineContext.Provider>
}
