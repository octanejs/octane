// Ported from @radix-ui/react-use-controllable-state (source:
// .radix-primitives/packages/react/use-controllable-state/src/use-controllable-state.tsx).
// A value that is either CONTROLLED (a `prop` is passed) or UNCONTROLLED (internal state
// seeded by `defaultProp`), always calling `onChange` on updates. This is a STATE-layer
// concept, so octane's no-controlled-DOM-inputs divergence doesn't apply. The dev-only
// controlled↔uncontrolled switch warning is intentionally not ported (repo policy:
// octane's warning surface differs; port the functional outcome only).
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from './internal';

type SetStateFn<T> = (next: T | ((prev: T) => T)) => void;

export function useControllableState<T>(...args: any[]): [T, SetStateFn<T>] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useControllableState');
	const { prop, defaultProp, onChange } = (user[0] as any) ?? {};

	const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState<T>(
		defaultProp,
		onChange,
		slot,
	);
	const isControlled = prop !== undefined;
	const value = (isControlled ? prop : uncontrolledProp) as T;

	const setValue = useCallback(
		((nextValue: any) => {
			if (isControlled) {
				const resolved = isFunction(nextValue) ? nextValue(prop) : nextValue;
				if (resolved !== prop) onChangeRef.current?.(resolved);
			} else {
				setUncontrolledProp(nextValue);
			}
		}) as SetStateFn<T>,
		[isControlled, prop, setUncontrolledProp],
		subSlot(slot, 'setValue'),
	);

	return [value, setValue];
}

// The uncontrolled half: plain state whose changes fire the LATEST onChange (synced pre-
// layout via useInsertionEffect, matching the source) from a post-commit effect.
function useUncontrolledState<T>(
	defaultProp: T,
	onChange: ((v: T) => void) | undefined,
	slot: symbol | undefined,
): [T, SetStateFn<T>, { current: ((v: T) => void) | undefined }] {
	const [value, setValue] = useState<T>(defaultProp, subSlot(slot, 'state'));
	const prevValueRef = useRef(value, subSlot(slot, 'prev'));

	const onChangeRef = useRef(onChange, subSlot(slot, 'onChangeRef'));
	useInsertionEffect(
		() => {
			onChangeRef.current = onChange;
		},
		[onChange],
		subSlot(slot, 'onChangeEffect'),
	);

	useEffect(
		() => {
			if (prevValueRef.current !== value) {
				onChangeRef.current?.(value);
				prevValueRef.current = value;
			}
		},
		[value],
		subSlot(slot, 'changeEffect'),
	);

	return [value, setValue, onChangeRef];
}

function isFunction(value: unknown): value is (...args: any[]) => any {
	return typeof value === 'function';
}
