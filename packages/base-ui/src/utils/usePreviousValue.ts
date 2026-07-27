// Ported from .base-ui/packages/utils/src/usePreviousValue.ts. Returns the argument's previous
// value (null before there is one), updating during render rather than in an effect so the
// previous value is available on the same render the current one changes.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export function usePreviousValue<T>(...args: any[]): T | null {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePreviousValue');
	const value = user[0] as T;

	const [state, setState] = useState<{ current: T; previous: T | null }>(
		{ current: value, previous: null },
		subSlot(slot, 'st'),
	);

	if (value !== state.current) {
		setState({ current: value, previous: state.current });
	}

	return state.previous;
}
