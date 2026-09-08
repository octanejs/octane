// Ported from @xstate/react@6.1.0 src/useActorRef.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
import { useEffect, useState } from 'octane';
import {
	Actor,
	ActorOptions,
	AnyActorLogic,
	AnyStateMachine,
	Observer,
	SnapshotFrom,
	createActor,
	toObserver,
	type IsNotNever,
	type RequiredActorOptionsKeys,
} from 'xstate';
import { splitSlot, subSlot } from './internal.ts';
import { stopRootWithRehydration } from './stopRootWithRehydration.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';

// Upstream exports `useIdleActorRef` from this module but not from `index.ts`,
// and this package's `exports` map exposes only the barrel, so it is reachable
// solely from `useActorRef` and `useActor` here. It therefore takes a plain
// positional `(logic, options, slot)` signature instead of mirroring upstream's
// `ConditionalRequired` variadic tuple: the public hooks below already enforce
// that contract for consumers, and re-deriving it on an internal call would buy
// no type safety.
export function useIdleActorRef<TLogic extends AnyActorLogic>(
	logic: TLogic,
	options: ActorOptions<TLogic> | undefined,
	slot: symbol | undefined,
): Actor<TLogic> {
	// The "derive state from props" pattern: a render-phase update. When the
	// logic's config identity changes, a replacement actor is created and the
	// state setter is called from the render body, so this render is replayed
	// with the new actor before it commits. Octane implements React's semantics
	// here (render-phase updates render in the current pass, under the same
	// 25-attempt cap), which is what keeps the upstream re-render counts intact.
	//
	// Do NOT reach for Octane's `useLinkedState` here. It is the native
	// replacement for exactly this pattern, but it resolves the new value without
	// the replay, which would change the observable render count and break parity
	// with the pinned upstream release.
	let [[currentConfig, actorRef], setCurrent] = useState<[unknown, Actor<TLogic>]>(
		() => {
			const actorRef = createActor(logic, options);
			return [logic.config, actorRef];
		},
		subSlot(slot, 'idle:current'),
	);

	if (logic.config !== currentConfig) {
		const newActorRef = createActor(logic, {
			...options,
			snapshot: (actorRef.getPersistedSnapshot as any)({
				__unsafeAllowInlineActors: true,
			}),
		} as ActorOptions<TLogic>);
		setCurrent([logic.config, newActorRef]);
		actorRef = newActorRef;
	}

	// TODO: consider using `useAsapEffect` that would do this in `useInsertionEffect` is that's available
	//
	// Upstream passes no dependency array, which in React means "run after every
	// render". This package declares manual hook slots, so the compiler never
	// infers a dependency array for it; `null` is Octane's explicit spelling of
	// the same every-render behavior.
	useIsomorphicLayoutEffect(
		() => {
			(actorRef.logic as any as AnyStateMachine).implementations = (
				logic as any as AnyStateMachine
			).implementations;
		},
		null,
		subSlot(slot, 'idle:implementations'),
	);

	return actorRef;
}

export function useActorRef<TLogic extends AnyActorLogic>(
	machine: TLogic,
	...rest: [
		...(IsNotNever<RequiredActorOptionsKeys<TLogic>> extends true
			? [
					options: ActorOptions<TLogic> & {
						[K in RequiredActorOptionsKeys<TLogic>]: unknown;
					},
					observerOrListener?:
						Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void),
				]
			: [
					options?: ActorOptions<TLogic>,
					observerOrListener?:
						Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void),
				]),
		slot?: symbol,
	]
): Actor<TLogic> {
	// Both user arguments are optional in the common case, so the compiler-owned
	// trailing symbol cannot be located positionally.
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	const options = userArgs[0] as ActorOptions<TLogic> | undefined;
	const observerOrListener = userArgs[1] as
		Observer<SnapshotFrom<TLogic>> | ((value: SnapshotFrom<TLogic>) => void) | undefined;

	const actorRef = useIdleActorRef(machine, options, subSlot(slot, 'ref:idle'));

	// Upstream's dependency array is `[observerOrListener]` even though the effect
	// also closes over `actorRef`. Kept verbatim: an explicit array is never
	// rewritten by Octane, so this preserves the pinned release's subscription
	// lifetime exactly.
	useEffect(
		() => {
			if (!observerOrListener) {
				return;
			}
			const sub = actorRef.subscribe(toObserver(observerOrListener));
			return () => {
				sub.unsubscribe();
			};
		},
		[observerOrListener],
		subSlot(slot, 'ref:observer'),
	);

	useEffect(
		() => {
			actorRef.start();

			return () => {
				stopRootWithRehydration(actorRef);
			};
		},
		[actorRef],
		subSlot(slot, 'ref:lifecycle'),
	);

	return actorRef;
}
