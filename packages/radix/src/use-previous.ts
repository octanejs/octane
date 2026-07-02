// Ported from @radix-ui/react-use-previous (source:
// .radix-primitives/packages/react/use-previous/src/use-previous.tsx). Returns the
// value from the previous render in which `value` differed from the current one.
import { useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from './internal';

export function usePrevious<T>(...args: any[]): T {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePrevious');
	const value = user[0] as T;
	const ref = useRef({ value, previous: value }, subSlot(slot, 'ref'));

	// We compare values before making an update to ensure that
	// a change has been made. This ensures the previous value is
	// persisted correctly between renders.
	return useMemo(
		() => {
			if (ref.current.value !== value) {
				ref.current.previous = ref.current.value;
				ref.current.value = value;
			}
			return ref.current.previous;
		},
		[value],
		subSlot(slot, 'm'),
	);
}
