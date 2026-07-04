// Ported from .base-ui/packages/utils/src/useStableCallback.ts. Returns a stable
// (identity-constant) trampoline that always calls the LATEST callback — safe to pass as
// a memo/effect dependency without re-triggering. Base UI uses `useInsertionEffect` to
// swap the callback; octane has no insertion effect, so (like @octanejs/floating-ui's
// useEffectEvent) we refresh the ref synchronously each render. The dev "called during
// render" guard is dropped (dev-only surface).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export function useStableCallback<T extends (...args: any[]) => any>(...args: any[]): T {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useStableCallback');
	const callback = user[0] as T | undefined;

	const ref = useRef<T | undefined>(undefined, subSlot(slot, 'ref'));
	ref.current = callback;

	return useCallback(
		((...a: any[]) => (ref.current == null ? undefined : ref.current(...a))) as T,
		[],
		subSlot(slot, 'cb'),
	);
}
