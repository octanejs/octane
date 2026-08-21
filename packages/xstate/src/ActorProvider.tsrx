// Octane-only: the component half of `createActorContext`.
//
// Upstream builds its provider with `React.createElement(ReactContext.Provider,
// { value, children })` inside `createActorContext.ts`. Octane splits the two
// halves by file type, because that is what makes slots work: a `.tsrx` module
// is fully compiled and every hook call inside it receives a compiler-assigned
// call-site slot, while a plain `.ts` module in a package that declares
// `octane.hookSlots.manual` is left alone so it can forward slots by hand.
//
// The factory's hooks therefore stay in `createActorContext.ts` — a hook there
// must forward its CALLER's slot, which is impossible in a compiled module
// because the compiler appends its own symbol after the forwarded one — and only
// this component, which owns its hooks rather than forwarding them, lives here.
import { useActorRef } from './useActorRef.ts';
import type { Context, OctaneNode } from 'octane';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';

export function ActorProvider(props: {
	context: Context<Actor<AnyActorLogic> | null>;
	logic: AnyActorLogic;
	options?: ActorOptions<AnyActorLogic>;
	children?: OctaneNode;
}) @{
	// Held in a local so the template sees a stable component identity, the same
	// way @octanejs/redux's Provider resolves its context prop.
	const ActorContext = props.context;

	const actor = useActorRef(props.logic, props.options as never);

	<ActorContext.Provider value={actor}>{props.children}</ActorContext.Provider>
}
