// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useSyncRef.ts).
import type { RefObject } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from './useLayoutEffect';

interface ContextValue<T> {
	ref?: { current: T | null };
}

// Syncs ref from context with ref passed to hook
export function useSyncRef<T>(context?: ContextValue<T> | null, ref?: RefObject<T | null>): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSyncRef<T>(
	context: ContextValue<T> | null | undefined,
	ref: RefObject<T | null> | undefined,
	slot: symbol | undefined,
): void;
export function useSyncRef(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSyncRef');
	const context = user[0] as ContextValue<any> | null | undefined;
	const ref = user[1] as { current: any } | undefined;

	useLayoutEffect(
		() => {
			if (context && context.ref && ref) {
				context.ref.current = ref.current;
				return () => {
					if (context.ref) {
						context.ref.current = null;
					}
				};
			}
		},
		null,
		subSlot(slot, 'sync'),
	);
}
