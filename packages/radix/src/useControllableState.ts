// Ported from @radix-ui/react-use-controllable-state. A value that is either CONTROLLED
// (a `prop` is passed) or UNCONTROLLED (internal `useState` seeded by `defaultProp`),
// always calling `onChange` on updates. This is a STATE-layer concept, so octane's
// no-controlled-DOM-inputs divergence doesn't apply — it's plain useState + a ref.
import { useCallback, useEffect, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from './internal';

type SetStateFn<T> = (next: T | ((prev: T) => T)) => void;

export function useControllableState<T>(...args: any[]): [T, SetStateFn<T>] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useControllableState');
	const { prop, defaultProp, onChange = () => {} } = (user[0] as any) ?? {};
	const isControlled = prop !== undefined;

	const [uncontrolled, setUncontrolled] = useState<T>(defaultProp, subSlot(slot, 'state'));
	const value = (isControlled ? prop : uncontrolled) as T;

	// Always call the LATEST onChange without re-subscribing effects.
	const onChangeRef = useRef<(v: T) => void>(onChange, subSlot(slot, 'onChangeRef'));
	useEffect(
		() => {
			onChangeRef.current = onChange;
		},
		[onChange],
		subSlot(slot, 'onChangeEffect'),
	);

	// Fire onChange when the UNCONTROLLED value changes (the controlled path fires in
	// setValue). Seeded to `value` so mounting doesn't fire.
	const prevRef = useRef<T>(value, subSlot(slot, 'prev'));
	useEffect(
		() => {
			if (!isControlled && prevRef.current !== uncontrolled) {
				onChangeRef.current?.(uncontrolled);
			}
			prevRef.current = uncontrolled;
		},
		[uncontrolled, isControlled],
		subSlot(slot, 'changeEffect'),
	);

	const setValue = useCallback(
		((next: any) => {
			if (isControlled) {
				const resolved = typeof next === 'function' ? next(prop) : next;
				if (resolved !== prop) onChangeRef.current?.(resolved);
			} else {
				setUncontrolled(next);
			}
		}) as SetStateFn<T>,
		[isControlled, prop],
		subSlot(slot, 'setValue'),
	);

	return [value, setValue];
}
