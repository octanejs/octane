// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useValueEffect.ts).
import { useCallback, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from './useLayoutEffect';

type SetValueAction<S> = (prev: S) => Generator<any, void, unknown>;
type Dispatch<A> = (action: A) => void;

// This hook works like `useState`, but when setting the value, you pass a generator function
// that can yield multiple values. Each yielded value updates the state and waits for the next
// layout effect, then continues the generator. This allows sequential updates to state to be
// written linearly.
export function useValueEffect<S>(defaultValue: S | (() => S)): [S, Dispatch<SetValueAction<S>>];
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useValueEffect<S>(
	defaultValue: S | (() => S),
	slot: symbol | undefined,
): [S, Dispatch<SetValueAction<S>>];
export function useValueEffect(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useValueEffect');
	const defaultValue = user[0];

	let [value, setValue] = useState(defaultValue, subSlot(slot, 'value'));
	// Keep an up to date copy of value in a ref so we can access the current value in the generator.
	// This allows us to maintain a stable queue function.
	let currValue = useRef(value, subSlot(slot, 'curr'));
	let effect = useRef<Generator<any> | null>(null, subSlot(slot, 'effect'));

	// Store the function in a ref so we can always access the current version
	// which has the proper `value` in scope.
	let nextRef = useRef(
		() => {
			if (!effect.current) {
				return;
			}
			// Run the generator to the next yield.
			let newValue = effect.current.next();

			// If the generator is done, reset the effect.
			if (newValue.done) {
				effect.current = null;
				return;
			}

			// If the value is the same as the current value,
			// then continue to the next yield. Otherwise,
			// set the value in state and wait for the next layout effect.
			if (currValue.current === newValue.value) {
				nextRef.current();
			} else {
				setValue(newValue.value);
			}
		},
		subSlot(slot, 'next'),
	);

	useLayoutEffect(
		() => {
			currValue.current = value;
			// If there is an effect currently running, continue to the next yield.
			if (effect.current) {
				nextRef.current();
			}
		},
		null,
		subSlot(slot, 'advance'),
	);

	let queue = useCallback(
		(fn: any) => {
			effect.current = fn(currValue.current);
			nextRef.current();
		},
		[nextRef],
		subSlot(slot, 'queue'),
	);

	return [value, queue];
}
