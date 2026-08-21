// SSR fixtures. On the server the binding must read its snapshot through
// `getServerSnapshot` and render the actor's initial state; effects never run
// there, so no actor is started by rendering.
import { useSyncExternalStore } from 'octane';
import { assign, setup } from 'xstate';
import { createActorContext, useActor, useSelector } from '@octanejs/xstate';
import type { ActorRefFrom } from 'xstate';

export const serverMachine = setup({
	types: {} as {
		context: { count: number };
		events: { type: 'INC' };
	},
}).createMachine({
	id: 'server',
	context: ({ input }: { input?: { count: number } }) => ({ count: input?.count ?? 0 }),
	initial: 'ready',
	states: {
		ready: {
			on: { INC: { actions: assign({ count: ({ context }) => context.count + 1 }) } },
		},
	},
});

// A machine whose entry action is an observable side effect: if server
// rendering ever started an actor, this log would gain an entry.
export const startLog: string[] = [];

export const loggingMachine = setup({
	types: {} as { context: Record<string, never>; events: { type: 'NOOP' } },
}).createMachine({
	id: 'logging',
	initial: 'ready',
	states: {
		ready: {
			entry: () => {
				startLog.push('entered');
			},
		},
	},
});

export const LoggingContext = createActorContext(loggingMachine);

function LoggingReadout() @{
	const status = LoggingContext.useSelector((state) => state.value as string);

	<span id="logging">{'state=' + status}</span>
}

export function ServerLoggingView() @{
	<LoggingContext.Provider>
		<LoggingReadout />
	</LoggingContext.Provider>
}

export const ServerContext = createActorContext(serverMachine);

function ContextReadout() @{
	const count = ServerContext.useSelector((state) => state.context.count);
	const status = ServerContext.useSelector((state) => state.value as string);

	<span id="context">{'count=' + count + ' state=' + status}</span>
}

export function ServerContextView() @{
	<ServerContext.Provider>
		<ContextReadout />
	</ServerContext.Provider>
}

export function ServerActorView() @{
	const [state] = useActor(serverMachine, { input: { count: 3 } });

	<span id="actor">{'count=' + state.context.count + ' state=' + state.value as string}</span>
}

export function ServerSelectorView(props: { actorRef: ActorRefFrom<typeof serverMachine> }) @{
	const count = useSelector(props.actorRef, (state) => state.context.count);

	<span id="selector">{'count=' + count}</span>
}

// A hand-rolled actor-like object: `getSnapshot` plus observer `subscribe`, the
// same two members the binding requires of an ActorRef, with no
// `getServerSnapshot` anywhere. `useActor` and `useSelector` both synthesize one
// from the bound `getSnapshot`, so reaching Octane's optional-server-snapshot
// behavior means wiring this straight to the native hook.
const handRolledSnapshot = { count: 7, value: 'ready' };

export const handRolledActor = {
	getSnapshot: () => handRolledSnapshot,
	subscribe: (_observer: { next: () => void }) => ({ unsubscribe: () => {} }),
};

function subscribeToHandRolledActor(onStoreChange: () => void) {
	return handRolledActor.subscribe({ next: onStoreChange }).unsubscribe;
}

export function ServerNoServerSnapshotView() @{
	const snapshot = useSyncExternalStore(
		subscribeToHandRolledActor,
		() => handRolledActor.getSnapshot(),
	);

	<span id="no-server-snapshot">{'count=' + snapshot.count + ' state=' + snapshot.value}</span>
}

export function ServerWithServerSnapshotView() @{
	const snapshot = useSyncExternalStore(
		subscribeToHandRolledActor,
		() => handRolledActor.getSnapshot(),
		() => ({ count: 42, value: 'from-server-snapshot' }),
	);

	<span id="with-server-snapshot">{'count=' + snapshot.count + ' state=' + snapshot.value}</span>
}
