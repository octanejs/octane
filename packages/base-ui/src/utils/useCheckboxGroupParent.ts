// Ported from .base-ui/packages/react/src/checkbox-group/useCheckboxGroupParent.ts. Drives a
// "select-all" parent checkbox for a CheckboxGroup: checked when all children are on,
// indeterminate when some are, and a 3-state toggle cycle honoring disabled children.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useMemo, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useBaseUiId } from './useBaseUiId';
import { useStableCallback } from './useStableCallback';

const EMPTY: string[] = [];

export interface UseCheckboxGroupParentParameters {
	allValues?: string[];
	value?: string[];
	onValueChange?: (value: string[], eventDetails: any) => void;
}

export function useCheckboxGroupParent(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCheckboxGroupParent');
	const {
		allValues = EMPTY,
		value = EMPTY,
		onValueChange: onValueChangeProp,
	} = (user[0] as UseCheckboxGroupParentParameters) ?? {};

	const uncontrolledStateRef = useRef(value, subSlot(slot, 'uncontrolled'));
	const disabledStatesRef = useRef(new Map<string, boolean>(), subSlot(slot, 'disabledStates'));

	const [status, setStatus] = useState<'on' | 'off' | 'mixed'>('mixed', subSlot(slot, 'status'));

	const id = useBaseUiId(undefined, subSlot(slot, 'id'));
	const checked = value.length === allValues.length;
	const indeterminate = value.length !== allValues.length && value.length > 0;

	const onValueChange = useStableCallback(onValueChangeProp, subSlot(slot, 'onValueChange'));

	const getParentProps = useCallback(
		() => ({
			id,
			indeterminate,
			checked,
			'aria-controls': allValues.map((v) => `${id}-${v}`).join(' '),
			onCheckedChange(_: boolean, eventDetails: any) {
				const uncontrolledState = uncontrolledStateRef.current;
				const none = allValues.filter(
					(v) => disabledStatesRef.current.get(v) && uncontrolledState.includes(v),
				);
				const all = allValues.filter(
					(v) =>
						!disabledStatesRef.current.get(v) ||
						(disabledStatesRef.current.get(v) && uncontrolledState.includes(v)),
				);
				const allOnOrOff =
					uncontrolledState.length === all.length || uncontrolledState.length === 0;

				if (allOnOrOff) {
					if (value.length === all.length) {
						onValueChange(none, eventDetails);
					} else {
						onValueChange(all, eventDetails);
					}
					return;
				}

				let nextStatus: 'on' | 'off' | 'mixed' = 'mixed';
				let nextValue = uncontrolledState;
				if (status === 'mixed') {
					nextStatus = 'on';
					nextValue = all;
				} else if (status === 'on') {
					nextStatus = 'off';
					nextValue = none;
				}
				onValueChange(nextValue, eventDetails);
				if (!eventDetails.isCanceled) {
					setStatus(nextStatus);
				}
			},
		}),
		[allValues, checked, id, indeterminate, onValueChange, status, value.length],
		subSlot(slot, 'getParentProps'),
	);

	const getChildProps = useCallback(
		(childValue: string) => ({
			checked: value.includes(childValue),
			onCheckedChange(nextChecked: boolean, eventDetails: any) {
				const newValue = value.slice();
				if (nextChecked) {
					newValue.push(childValue);
				} else {
					newValue.splice(newValue.indexOf(childValue), 1);
				}
				onValueChange(newValue, eventDetails);
				if (!eventDetails.isCanceled) {
					uncontrolledStateRef.current = newValue;
					setStatus('mixed');
				}
			},
		}),
		[onValueChange, value],
		subSlot(slot, 'getChildProps'),
	);

	return useMemo(
		() => ({ id, indeterminate, getParentProps, getChildProps, disabledStatesRef }),
		[id, indeterminate, getParentProps, getChildProps],
		subSlot(slot, 'return'),
	);
}
