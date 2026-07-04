// Ported from .base-ui/packages/utils/src/useControlled.ts. The controlled/uncontrolled
// state hook: `controlled !== undefined` decides (once, at first render) whether the
// component is controlled; the setter only writes local state when uncontrolled. Base UI's
// dev warnings (switching controlled↔uncontrolled, changing the default) are dropped
// (dev-only surface).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export interface UseControlledProps<T = unknown> {
	controlled: T | undefined;
	default: T | undefined;
	name: string;
	state?: string;
}

export function useControlled<T = unknown>(
	...args: any[]
): [T, (newValue: T | ((prevValue: T) => T)) => void] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useControlled');
	const { controlled, default: defaultProp } = user[0] as UseControlledProps<T>;

	// `isControlled` never changes over the component's lifetime.
	const { current: isControlled } = useRef(controlled !== undefined, subSlot(slot, 'ctrl'));
	const [valueState, setValue] = useState(defaultProp, subSlot(slot, 'val'));
	const value = isControlled ? controlled : valueState;

	const setValueIfUncontrolled = useCallback(
		(newValue: T | ((prevValue: T) => T)) => {
			if (!isControlled) {
				setValue(newValue as any);
			}
		},
		[],
		subSlot(slot, 'set'),
	);

	return [value as T, setValueIfUncontrolled];
}
