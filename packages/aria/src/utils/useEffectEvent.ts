// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useEffectEvent.ts).
// react-aria's own effect-event (ref synced in the earliest effect phase + a stable
// wrapper) — ported as-is rather than aliased to octane's built-in `useEffectEvent`,
// so the sync timing matches upstream exactly. octane always has `useInsertionEffect`,
// so the React-17 layout-effect fallback collapses away.
import { useCallback, useInsertionEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export function useEffectEvent<T extends Function>(fn?: T): T;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useEffectEvent<T extends Function>(fn: T | undefined, slot: symbol | undefined): T;
export function useEffectEvent(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useEffectEvent');
	const fn = user[0] as Function | undefined;

	const ref = useRef<Function | null | undefined>(null, subSlot(slot, 'ref'));
	useInsertionEffect(
		() => {
			ref.current = fn;
		},
		[fn],
		subSlot(slot, 'sync'),
	);
	return useCallback(
		(...callArgs: any[]) => {
			const f = ref.current;
			return f?.(...callArgs);
		},
		[],
		subSlot(slot, 'wrapper'),
	);
}
