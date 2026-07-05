// Ported from .base-ui/packages/utils/src/useRefWithInit.ts. A ref whose `.current` is
// lazily initialized once via `init(arg)` — avoids re-running the factory (and the
// allocation) on every render that a plain `useRef(init())` would incur.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

const UNSET: unique symbol = Symbol('base-ui.useRefWithInit.unset');

export function useRefWithInit<T, A = undefined>(...args: any[]): { current: T } {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRefWithInit');
	const init = user[0] as (arg?: A) => T;
	const arg = user[1] as A | undefined;

	const ref = useRef<T | typeof UNSET>(UNSET, subSlot(slot, 'ref'));
	if (ref.current === UNSET) {
		ref.current = init(arg);
	}
	return ref as { current: T };
}
