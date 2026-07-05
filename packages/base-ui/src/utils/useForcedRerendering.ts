// Ported from .base-ui/packages/utils/src/useForcedRerendering.ts.
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useState } from 'octane';
import { S, splitSlot, subSlot } from '../internal';

export function useForcedRerendering(...args: any[]): () => void {
	const [, slotArg] = splitSlot(['_', ...args]);
	const slot = slotArg ?? S('useForcedRerendering');
	const [, setState] = useState({}, subSlot(slot, 'state'));
	return useCallback(() => setState({}), [], subSlot(slot, 'cb'));
}
