// Ported from @radix-ui/react-use-effect-event (source:
// .radix-primitives/packages/react/use-effect-event/src/use-effect-event.tsx). A stable
// function whose body always reads the latest render's callback — the
// `experimental_useEffectEvent` approximation. The ref updates in an insertion effect
// (before any layout/passive effect can call it), and calling during render throws.
import { useInsertionEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from './internal';

type AnyFunction = (...args: any[]) => any;

export function useEffectEvent<T extends AnyFunction>(...args: any[]): T {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useEffectEvent');
	const callback = user[0] as T | undefined;

	const ref = useRef<AnyFunction | undefined>(
		() => {
			throw new Error('Cannot call an event handler while rendering.');
		},
		subSlot(slot, 'ref'),
	);
	useInsertionEffect(
		() => {
			ref.current = callback;
		},
		undefined,
		subSlot(slot, 'e'),
	);

	return useMemo(
		() => ((...fnArgs: any[]) => ref.current?.(...fnArgs)) as T,
		[],
		subSlot(slot, 'm'),
	);
}
