import {
	createActorContext,
	shallowEqual,
	useActor,
	useActorRef,
	useSelector,
} from '@octanejs/xstate';
import { Activity } from 'octane';
import { assign, createActor, setup, type AnyActorRef } from 'xstate';

export const lifecycle = { starts: 0, stops: 0 };
export const renders = { selected: 0 };

export const counterMachine = setup({
	types: {
		context: {} as { count: number; ignored: number },
		events: {} as { type: 'increment' } | { type: 'ignore' } | { type: 'set'; count: number },
	},
}).createMachine({
	id: 'counter',
	initial: 'active',
	context: { count: 0, ignored: 0 },
	entry: () => lifecycle.starts++,
	exit: () => lifecycle.stops++,
	states: {
		active: {
			on: {
				increment: { actions: assign({ count: ({ context }) => context.count + 1 }) },
				ignore: { actions: assign({ ignored: ({ context }) => context.ignored + 1 }) },
				set: { actions: assign({ count: ({ event }) => event.count }) },
			},
		},
	},
});

export const replacementMachine = setup({
	types: {
		context: {} as { count: number; ignored: number },
		events: {} as { type: 'increment' } | { type: 'ignore' } | { type: 'set'; count: number },
	},
}).createMachine({
	id: 'replacement-counter',
	initial: 'active',
	context: { count: 0, ignored: 0 },
	entry: () => lifecycle.starts++,
	states: {
		active: {
			on: {
				increment: { actions: assign({ count: ({ context }) => context.count + 1 }) },
				ignore: { actions: assign({ ignored: ({ context }) => context.ignored + 1 }) },
				set: { actions: assign({ count: ({ event }) => event.count }) },
			},
		},
	},
});

export const CounterContext = createActorContext(counterMachine);

export function ActorApp() @{
	const [snapshot, send, actorRef] = useActor(counterMachine);
	const selected = useSelector(actorRef, (state) => ({ count: state.context.count }), shallowEqual);
	<div>
		<span id="actor-count">{snapshot.context.count as string}</span>
		<span id="selected-count">{selected.count as string}</span>
		<button id="increment" onClick={() => send({ type: 'increment' })}>increment</button>
		<button id="ignore" onClick={() => send({ type: 'ignore' })}>ignore</button>
	</div>
}

export function ActivityActorApp(props: { mode: 'visible' | 'hidden' }) @{
	<Activity mode={props.mode}>
		<ActorApp />
	</Activity>
}

export function SelectedExternalActorApp(props: {
	actor: ReturnType<typeof createActor>;
}) @{
	const selected = useSelector(
		props.actor,
		(state) => ({ count: state.context.count }),
		shallowEqual,
	);
	renders.selected++;
	<span id="selected-external-count">{selected.count as string}</span>
}

export function RefApp(props: { capture: (actor: AnyActorRef) => void }) @{
	const actorRef = useActorRef(counterMachine);
	props.capture(actorRef);
	const count = useSelector(actorRef, (state) => state.context.count);
	<button
		id="ref-count"
		onClick={() => actorRef.send({ type: 'increment' })}
	>{count as string}</button>
}

export function ReplacementApp(props: {
	logic: typeof counterMachine;
	capture: (actor: AnyActorRef) => void;
	observe: (snapshot: unknown) => void;
}) @{
	const actorRef = useActorRef(props.logic, undefined, props.observe);
	props.capture(actorRef);
	const count = useSelector(actorRef, (state) => state.context.count);
	<button
		id="replacement-count"
		onClick={() => actorRef.send({ type: 'increment' })}
	>{count as string}</button>
}

export function TwoActorsApp() @{
	const [left, sendLeft] = useActor(counterMachine);
	const [right, sendRight] = useActor(counterMachine);
	<div>
		<button
			id="left"
			onClick={() => sendLeft({ type: 'increment' })}
		>{left.context.count as string}</button>
		<button
			id="right"
			onClick={() => sendRight({ type: 'increment' })}
		>{right.context.count as string}</button>
	</div>
}

function ContextConsumer() @{
	const count = CounterContext.useSelector((state) => state.context.count);
	const actorRef = CounterContext.useActorRef();
	<button
		id="context-count"
		onClick={() => actorRef.send({ type: 'increment' })}
	>{count as string}</button>
}

export function ContextApp() @{
	<CounterContext.Provider>
		<ContextConsumer />
	</CounterContext.Provider>
}

export function MissingContextApp() @{
	<ContextConsumer />
}

export function ExternalActorApp(props: { actor: ReturnType<typeof createActor> }) @{
	const count = useSelector(props.actor, (state) => state.context.count);
	<span id="external-count">{count as string}</span>
}
