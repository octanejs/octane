// Ported from @radix-ui/react-use-previous (source:
// .radix-primitives/packages/react/use-previous/src/use-previous.tsx). Returns the
// value from the previous render in which `value` differed from the current one.
import { type LinkedStatePrevious, useLinkedState } from 'octane';

import { S, splitSlot, subSlot } from './internal';

function previousCommittedValue<Value>(
	current: Value,
	previous: LinkedStatePrevious<Value, Value> | undefined,
): Value {
	return previous === undefined ? current : previous.source;
}

const PREVIOUS_VALUE_OPTIONS = {
	sourceEqual: <Value>(previous: Value, next: Value) => previous === next,
};

export function usePrevious<T>(...args: any[]): T {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePrevious');
	const value = user[0] as T;
	const [previous] = useLinkedState<T, T>(
		value,
		previousCommittedValue,
		PREVIOUS_VALUE_OPTIONS,
		subSlot(slot, 'previous'),
	);
	return previous;
}
