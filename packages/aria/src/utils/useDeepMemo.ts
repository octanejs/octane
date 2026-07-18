// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useDeepMemo.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; otherwise verbatim.
import { useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export function useDeepMemo<T>(value: T, isEqual: (a: T, b: T) => boolean): T;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDeepMemo<T>(
	value: T,
	isEqual: (a: T, b: T) => boolean,
	slot: symbol | undefined,
): T;
export function useDeepMemo(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDeepMemo');
	let value = user[0];
	const isEqual = user[1] as (a: any, b: any) => boolean;

	// Using a ref during render is ok here because it's only an optimization – both values are equivalent.
	// If a render is thrown away, it'll still work the same no matter if the next render is the same or not.
	let lastValue = useRef<any>(null, subSlot(slot, 'last'));
	if (value && lastValue.current && isEqual(value, lastValue.current)) {
		value = lastValue.current;
	}

	lastValue.current = value;
	return value;
}
