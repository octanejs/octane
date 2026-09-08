// Self-contained differential fixture: the SAME source runs on Octane (via
// @octanejs/xstate) AND on React (the setup rewrites `@octanejs/xstate` ->
// `@xstate/react` and `octane` -> `react`), and the rig asserts byte-identical
// innerHTML after each click.
//
// `xstate` itself is imported directly and is NOT rewritten — both sides drive
// the identical pinned actor core, so any difference in output is the binding's.
import { assign, createMachine, setup } from 'xstate';
import { createActorContext, useMachine, useSelector } from '@octanejs/xstate';

const toggleMachine = createMachine({
	id: 'toggle',
	initial: 'inactive',
	states: {
		inactive: { on: { TOGGLE: 'active' } },
		active: { on: { TOGGLE: 'inactive' } },
	},
});

export function Toggle() @{
	const [state, send] = useMachine(toggleMachine);

	<div>
		<span id="value">{state.value as string}</span>
		<button id="toggle" onClick={() => send({ type: 'TOGGLE' })}>
			toggle
		</button>
	</div>
}

const counterMachine = setup({
	types: {} as {
		context: { count: number; other: number };
		events: { type: 'INC' } | { type: 'INC_OTHER' } | { type: 'RESET' };
	},
}).createMachine({
	id: 'counter',
	context: { count: 0, other: 0 },
	initial: 'idle',
	states: {
		idle: {
			on: {
				INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
				INC_OTHER: { actions: assign({ other: ({ context }) => context.other + 1 }) },
				RESET: { target: 'done', actions: assign({ count: 0, other: 0 }) },
			},
		},
		done: { type: 'final' },
	},
});

const CounterContext = createActorContext(counterMachine);

function Readout() @{
	const count = CounterContext.useSelector((state) => state.context.count);
	const other = CounterContext.useSelector((state) => state.context.other);
	const status = CounterContext.useSelector((state) => state.value as string);

	<div>
		<span id="count">{count as string}</span>
		<span id="other">{other as string}</span>
		<span id="status">{status}</span>
	</div>
}

function Buttons() @{
	const actorRef = CounterContext.useActorRef();

	<div>
		<button id="inc" onClick={() => actorRef.send({ type: 'INC' })}>
			inc
		</button>
		<button id="inc-other" onClick={() => actorRef.send({ type: 'INC_OTHER' })}>
			incOther
		</button>
		<button id="reset" onClick={() => actorRef.send({ type: 'RESET' })}>
			reset
		</button>
	</div>
}

export function Counter() @{
	<CounterContext.Provider>
		<div>
			<Readout />
			<Buttons />
		</div>
	</CounterContext.Provider>
}

// A second, unbound reader over the same actor: `useSelector` reached directly
// rather than through the context factory.
function UnboundReadout() @{
	const actorRef = CounterContext.useActorRef();
	const doubled = useSelector(actorRef, (state) => state.context.count * 2);

	<span id="doubled">{doubled as string}</span>
}

export function Unbound() @{
	<CounterContext.Provider>
		<div>
			<UnboundReadout />
			<Buttons />
		</div>
	</CounterContext.Provider>
}
