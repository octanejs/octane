// Ported from .base-ui/packages/utils/src/usePreviousValue.ts. Returns the argument's previous
// value (null before there is one). Linked state makes the previous committed value available
// on the same render the current one changes without publishing abandoned render history.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { type LinkedStatePrevious, useLinkedState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

function previousCommittedValue<Value>(
	_current: Value,
	previous: LinkedStatePrevious<Value, Value | null> | undefined,
): Value | null {
	return previous === undefined ? null : previous.source;
}

const PREVIOUS_VALUE_OPTIONS = {
	sourceEqual: <Value>(previous: Value, next: Value) => previous === next,
};

export function usePreviousValue<T>(...args: any[]): T | null {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePreviousValue');
	const value = user[0] as T;

	const [previous] = useLinkedState<T, T | null>(
		value,
		previousCommittedValue,
		PREVIOUS_VALUE_OPTIONS,
		subSlot(slot, 'st'),
	);
	return previous;
}
