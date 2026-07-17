// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/utils/useControlledState.ts).
// octane adaptations: React's SetStateAction type is declared locally; octane always has
// `useInsertionEffect`, so upstream's React-17 layout-effect fallback collapses away; the
// dev-only controlled↔uncontrolled switch warning (and the ref that only fed it) is not ported.

import { useCallback, useInsertionEffect, useReducer, useState, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';

export type SetStateAction<S> = S | ((prevState: S) => S);

// Use the earliest effect possible to reset the ref below.
const useEarlyEffect: typeof useInsertionEffect =
	typeof document !== 'undefined' ? useInsertionEffect : ((() => {}) as any);

export function useControlledState<T, C = T>(
	value: Exclude<T, undefined>,
	defaultValue: Exclude<T, undefined> | undefined,
	onChange?: (v: C, ...args: any[]) => void,
): [T, (value: SetStateAction<T>, ...args: any[]) => void];
export function useControlledState<T, C = T>(
	value: Exclude<T, undefined> | undefined,
	defaultValue: Exclude<T, undefined>,
	onChange?: (v: C, ...args: any[]) => void,
): [T, (value: SetStateAction<T>, ...args: any[]) => void];
export function useControlledState(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useControlledState');
	const value = user[0];
	const defaultValue = user[1];
	const onChange = user[2] as ((v: any, ...onChangeArgs: any[]) => void) | undefined;

	// Store the value in both state and a ref. The state value will only be used when uncontrolled.
	// The ref is used to track the most current value, which is passed to the function setState callback.
	let [stateValue, setStateValue] = useState(value || defaultValue, subSlot(slot, 'state'));
	let valueRef = useRef(stateValue, subSlot(slot, 'valueRef'));

	let isControlled = value !== undefined;

	// After each render, update the ref to the current value.
	// This ensures that the setState callback argument is reset.
	// Note: the effect should not have any dependencies so that controlled values always reset.
	let currentValue = isControlled ? value : stateValue;
	useEarlyEffect(
		() => {
			valueRef.current = currentValue;
		},
		null,
		subSlot(slot, 'sync'),
	);

	let [, forceUpdate] = useReducer<object, void>(() => ({}), {}, subSlot(slot, 'force'));
	let setValue = useCallback(
		(value: any, ...setterArgs: any[]) => {
			let newValue = typeof value === 'function' ? value(valueRef.current) : value;
			if (!Object.is(valueRef.current, newValue)) {
				// Update the ref so that the next setState callback has the most recent value.
				valueRef.current = newValue;

				setStateValue(newValue);

				// Always trigger a re-render, even when controlled, so that the layout effect above runs to reset the value.
				forceUpdate();

				// Trigger onChange. Note that if setState is called multiple times in a single event,
				// onChange will be called for each one instead of only once.
				onChange?.(newValue, ...setterArgs);
			}
		},
		[onChange],
		subSlot(slot, 'set'),
	);

	return [currentValue, setValue];
}
