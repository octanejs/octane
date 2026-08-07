// Small hook utilities ported from react-router's utils.tsx. Plain-`.ts` hooks
// forward the caller's compiler-injected slot (see internal.ts).
import { type LinkedStatePrevious, useLinkedState } from 'octane';
import { splitSlot, subSlot } from './internal';

function previousCommittedValue<Value>(
	_current: Value,
	previous: LinkedStatePrevious<Value, Value | null> | undefined,
): Value | null {
	return previous === undefined ? null : previous.source;
}

const PREVIOUS_VALUE_OPTIONS = {
	sourceEqual: <Value>(previous: Value, next: Value) => previous === next,
};

// Returns the value from the previous render (null on first render). Ported from
// react-router's usePrevious — linked state advances only when a changed value commits,
// keeping abandoned Suspense attempts out of the previous-distinct history.
export function usePrevious(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const value = user[0];
	const [previous] = useLinkedState(
		value,
		previousCommittedValue,
		PREVIOUS_VALUE_OPTIONS,
		subSlot(slot, 'prev'),
	);
	return previous;
}
