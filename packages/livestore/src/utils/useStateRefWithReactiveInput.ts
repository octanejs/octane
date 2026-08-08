import { useCallback, useRef, useState } from 'octane';
import { subSlot } from '../internal';

type StateRef<T> = { current: T };
type StateUpdate<T> = T | ((previous: T) => T);

export function useStateRefWithReactiveInput<T>(
	inputState: T,
): [StateRef<T>, (newState: StateUpdate<T>) => void];
export function useStateRefWithReactiveInput<T>(
	inputState: T,
	slot: symbol,
): [StateRef<T>, (newState: StateUpdate<T>) => void];
export function useStateRefWithReactiveInput<T>(
	inputState: T,
	slot?: symbol,
): [StateRef<T>, (newState: StateUpdate<T>) => void] {
	const [, rerender] = useState(0, subSlot(slot, 'state-ref:render'));
	const lastKnownInputStateRef = useRef(inputState, subSlot(slot, 'state-ref:input'));
	const stateRef = useRef(inputState, subSlot(slot, 'state-ref:value')) as StateRef<T>;

	if (lastKnownInputStateRef.current !== inputState) {
		lastKnownInputStateRef.current = inputState;
		stateRef.current = inputState;
	}

	const setStateAndRerender = useCallback(
		(newState: StateUpdate<T>) => {
			const value =
				typeof newState === 'function'
					? (newState as (previous: T) => T)(stateRef.current)
					: newState;
			stateRef.current = value;
			rerender((count) => count + 1);
		},
		[],
		subSlot(slot, 'state-ref:set'),
	);

	return [stateRef, setStateAndRerender];
}
