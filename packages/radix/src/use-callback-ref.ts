// Ported from @radix-ui/react-use-callback-ref (source:
// .radix-primitives/packages/react/use-callback-ref/src/use-callback-ref.tsx).
// Converts a callback to a stable function reading the latest value — avoids
// re-renders when passed as a prop and re-executing effects when a dependency.
import { useEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from './internal';

export function useCallbackRef<T extends (...args: any[]) => any>(...args: any[]): T {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCallbackRef');
	const callback = user[0] as T | undefined;
	const callbackRef = useRef(callback, subSlot(slot, 'ref'));

	useEffect(
		() => {
			callbackRef.current = callback;
		},
		undefined,
		subSlot(slot, 'e'),
	);

	return useMemo(
		() => ((...fnArgs: any[]) => callbackRef.current?.(...fnArgs)) as T,
		[],
		subSlot(slot, 'm'),
	);
}
