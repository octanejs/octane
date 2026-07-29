// Ported from .base-ui/packages/utils/src/useOnMount.ts (v1.6.0), octane-adapted (slot-threaded).
// A `useEffect` that runs once on mount — the dependency array is a shared frozen empty, so the
// effect never re-runs even if `fn`'s identity changes.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { EMPTY_ARRAY } from './empty';

export function useOnMount(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOnMount');
	const fn = user[0] as () => void | (() => void);

	useEffect(fn, EMPTY_ARRAY, subSlot(slot, 'e'));
}
