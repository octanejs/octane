// Replaces @xstate/react@6.1.0's `use-isomorphic-layout-effect` dependency.
//
// The npm package is a bare `typeof document !== 'undefined' ? useLayoutEffect :
// useEffect` alias. That shape cannot be reused here: Octane hooks take a
// trailing compiler-assigned slot, and this package hand-forwards slots, so the
// helper has to be a real function that passes `(effect, deps, slot)` through.
// The DOM probe itself is upstream's, unchanged.
//
// A conditional hook call is legal in Octane — hooks are keyed by slot, not by
// call order — and `typeof document` is constant for the lifetime of a program,
// so a given call site resolves to one hook kind for every render.
import { useEffect, useLayoutEffect } from 'octane';

export function useIsomorphicLayoutEffect(
	effect: () => void | (() => void),
	deps: unknown[] | null | undefined,
	slot?: symbol,
): void {
	const hook = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
	hook(effect as never, deps as never, slot);
}
