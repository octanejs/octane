// Fixtures for the binding's Octane-only conformance coverage. They exercise the
// three things the differential rig cannot see through `innerHTML`: per-call-site
// hook-slot independence, selector bail-out render counts, and actor lifecycle.
import { useState } from 'octane';
import { assign, createMachine, setup } from 'xstate';
import { createActorContext, useMachine, useSelector } from '@octanejs/xstate';

export const toggleMachine = createMachine({
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

export const counterMachine = setup({
	types: {} as {
		context: { count: number; other: number };
		events: { type: 'INC' } | { type: 'INC_OTHER' };
	},
}).createMachine({
	id: 'counter',
	context: { count: 0, other: 0 },
	on: {
		INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
		INC_OTHER: { actions: assign({ other: ({ context }) => context.other + 1 }) },
	},
});

export const CounterContext = createActorContext(counterMachine);

// Every participant records its render, so a targeted subscriber update can be
// told apart from a re-render cascading down from a parent.
export const renderLog: string[] = [];

export function Controls() @{
	const actorRef = CounterContext.useActorRef();

	renderLog.push('Controls');

	<div>
		<button id="inc" onClick={() => actorRef.send({ type: 'INC' })}>
			inc
		</button>
		<button id="inc-other" onClick={() => actorRef.send({ type: 'INC_OTHER' })}>
			incOther
		</button>
	</div>
}

// Two member-form `useSelector` call sites in ONE component. If the compiler did
// not give each its own slot — or the binding forwarded the wrong symbol — both
// would read the same hook cell and render the same number.
export function BothSlices() @{
	const count = CounterContext.useSelector((state) => state.context.count);
	const other = CounterContext.useSelector((state) => state.context.other);

	renderLog.push('BothSlices');

	<div>
		<span id="both-count">{count as string}</span>
		<span id="both-other">{other as string}</span>
	</div>
}

// Selects one slice only, so an unrelated slice change must not re-render it.
export function CountOnly() @{
	const count = CounterContext.useSelector((state) => state.context.count);

	renderLog.push('CountOnly');

	<span id="count">{count as string}</span>
}

export function OtherOnly() @{
	const other = CounterContext.useSelector((state) => state.context.other);

	renderLog.push('OtherOnly');

	<span id="other">{other as string}</span>
}

export function CounterApp() @{
	<CounterContext.Provider>
		<BothSlices />
		<CountOnly />
		<Controls />
	</CounterContext.Provider>
}

export function SiblingSelectorsApp() @{
	renderLog.push('SiblingSelectorsApp');

	<CounterContext.Provider>
		<OtherOnly />
		<CountOnly />
		<Controls />
	</CounterContext.Provider>
}

// The unbound `useSelector` over an actor ref taken from context: the same
// scenario as SiblingSelectorsApp, reached without the context-bound hook.
export function UnboundCount() @{
	const actorRef = CounterContext.useActorRef();
	const count = useSelector(actorRef, (state) => state.context.count);

	renderLog.push('UnboundCount');

	<span id="u-count">{count as string}</span>
}

export function UnboundOther() @{
	const actorRef = CounterContext.useActorRef();
	const other = useSelector(actorRef, (state) => state.context.other);

	renderLog.push('UnboundOther');

	<span id="u-other">{other as string}</span>
}

export function UnboundSiblingsApp() @{
	renderLog.push('UnboundSiblingsApp');

	<CounterContext.Provider>
		<UnboundOther />
		<UnboundCount />
		<Controls />
	</CounterContext.Provider>
}

// Identical to OtherOnly except for one ordinary identifier-form hook. This is
// the control that isolates the compiler behavior: a component whose hooks are
// ALL member-form custom-hook calls gets no update boundary of its own.
export function OtherOnlyWithState() @{
	const [n] = useState(0);
	const other = CounterContext.useSelector((state) => state.context.other);

	renderLog.push('OtherOnlyWithState:' + n as unknown as string);

	<span id="ws-other">{other as string}</span>
}

export function MixedSiblingsApp() @{
	renderLog.push('MixedSiblingsApp');

	<CounterContext.Provider>
		<OtherOnlyWithState />
		<CountOnly />
		<Controls />
	</CounterContext.Provider>
}
