// Ported from .base-ui/packages/utils/src/useValueAsRef.ts — untracks a value into a ref
// so an effect can read the latest without re-running on change. Base UI's `.next`/`.effect`
// indirection collapses to setting `ref.current = value` in a layout effect that runs every
// render — the same observable behavior, and the same shape as @octanejs/floating-ui's
// `useLatestRef`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export function useValueAsRef<T>(...args: any[]): { current: T } {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useValueAsRef');
	const value = user[0] as T;
	const ref = useRef(value, subSlot(slot, 'ref'));
	useLayoutEffect(
		() => {
			ref.current = value;
		},
		undefined,
		subSlot(slot, 'eff'),
	);
	return ref;
}
