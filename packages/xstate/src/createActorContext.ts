// Ported from @xstate/react@6.1.0 src/createActorContext.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// This module stays plain `.ts` on purpose. The two hooks it returns must
// forward their CALLER's compiler-assigned slot to the unbound hooks they
// delegate to, and only an uncompiled module can do that: in a compiled `.tsrx`
// the compiler appends its own symbol AFTER any forwarded one, so every consumer
// call site would collapse onto a single hook cell — the selected values would
// still be right (the selector memo recomputes per component) but one
// subscriber's update would re-render all of them.
//
// The provider component, which owns its hooks instead of forwarding them, lives
// in ./ActorProvider.tsrx.
import { createContext, createElement, useContext } from 'octane';
import { Actor, ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';
import { ActorProvider } from './ActorProvider.tsrx';
import { splitSlot, subSlot } from './internal.ts';
import { useSelector as useSelectorUnbound } from './useSelector.ts';
import type { Context, OctaneNode } from 'octane';

export function createActorContext<TLogic extends AnyActorLogic>(
	actorLogic: TLogic,
	actorOptions?: ActorOptions<TLogic>,
): {
	useSelector: <T>(
		selector: (snapshot: SnapshotFrom<TLogic>) => T,
		...rest: [compare?: (a: T, b: T) => boolean, slot?: symbol]
	) => T;
	useActorRef: () => Actor<TLogic>;
	Provider: (props: {
		children?: OctaneNode;
		options?: ActorOptions<TLogic>;
		/** @deprecated Use `logic` instead. */
		machine?: never;
		logic?: TLogic;
	}) => unknown;
} {
	const ActorContext = createContext<Actor<TLogic> | null>(null);

	function Provider(props: {
		children?: OctaneNode;
		options?: ActorOptions<TLogic>;
		/** @deprecated Use `logic` instead. */
		machine?: never;
		logic?: TLogic;
	}) {
		if (props.machine) {
			throw new Error(`The "machine" prop has been deprecated. Please use "logic" instead.`);
		}

		return createElement(ActorProvider, {
			context: ActorContext as unknown as Context<Actor<AnyActorLogic> | null>,
			logic: props.logic ?? actorLogic,
			options: { ...actorOptions, ...props.options } as ActorOptions<AnyActorLogic>,
			children: props.children,
		});
	}

	// TODO: add properties to actor ref to make more descriptive
	//
	// Upstream reads `Provider.displayName` back out when building the
	// missing-provider error. The name is held in a local as well so the message
	// is identical without depending on the property's declared type.
	const displayName = `ActorProvider`;
	(Provider as typeof Provider & { displayName?: string }).displayName = displayName;

	function useActorContext(): Actor<TLogic> {
		// `useContext` is keyed by context identity rather than by a call-site
		// slot, so this hook needs none of the forwarding below. A consumer's
		// `SomeContext.useActorRef()` still compiles to a call with a trailing
		// symbol; the extra argument is simply ignored here.
		const actor = useContext(ActorContext);

		if (!actor) {
			throw new Error(
				`You used a hook from "${displayName}" but it's not inside a <${displayName}> component.`,
			);
		}

		return actor;
	}

	function useSelector<T>(
		selector: (snapshot: SnapshotFrom<TLogic>) => T,
		...rest: [compare?: (a: T, b: T) => boolean, slot?: symbol]
	): T {
		// Consumers reach this through the member form the upstream README and test
		// suite use — `SomeContext.useSelector(fn)` — which the compiler rewrites to
		// `withSlot(sym, () => SomeContext.useSelector(fn, sym))`. `sym` identifies
		// the CONSUMER's call site, so deriving the unbound hook's slot from it is
		// what keeps two selectors in one component, and the same selector in two
		// components, on independent hook cells.
		const [userArgs, slot] = splitSlot(rest as unknown[]);
		const compare = userArgs[0] as ((a: T, b: T) => boolean) | undefined;

		const actor = useActorContext();

		return useSelectorUnbound(
			actor,
			selector as never,
			compare as never,
			subSlot(slot, 'context:selector'),
		) as T;
	}

	return {
		Provider,
		useActorRef: useActorContext,
		useSelector,
	};
}
