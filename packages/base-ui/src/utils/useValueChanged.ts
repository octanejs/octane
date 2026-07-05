// Ported from .base-ui/packages/react/src/internals/useValueChanged.ts. Calls `onChange`
// (with the previous value) in a layout effect whenever `value` changes.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useStableCallback } from './useStableCallback';

export function useValueChanged<T>(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useValueChanged');
	const value = user[0] as T;
	const onChange = user[1] as (previousValue: T) => void;

	const valueRef = useRef(value, subSlot(slot, 'ref'));
	const onChangeCallback = useStableCallback(onChange, subSlot(slot, 'cb'));

	useLayoutEffect(
		() => {
			if (valueRef.current === value) {
				return;
			}
			onChangeCallback(valueRef.current);
		},
		[value, onChangeCallback],
		subSlot(slot, 'e:change'),
	);

	useLayoutEffect(
		() => {
			valueRef.current = value;
		},
		[value],
		subSlot(slot, 'e:set'),
	);
}
