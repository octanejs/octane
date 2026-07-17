// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useSlot.ts).
// octane adaptations: React's `RefCallback` type is declared locally (octane refs are
// React-19-style callback refs passed as props); public-hook slot threading
// (splitSlot/subSlot) per the binding convention; the explicit `[]` dep arrays are
// preserved exactly.
import { useCallback, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useId } from './useId';
import { useLayoutEffect } from './useLayoutEffect';

type RefCallback<T> = (instance: T | null) => void;

export function useSlot(initialState?: boolean | (() => boolean)): [RefCallback<any>, boolean];
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSlot(
	initialState: boolean | (() => boolean) | undefined,
	slot: symbol | undefined,
): [RefCallback<any>, boolean];
export function useSlot(...args: any[]): [RefCallback<any>, boolean] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSlot');
	const initialState = (user[0] as boolean | (() => boolean) | undefined) ?? true;

	// Initial state is typically based on the parent having an aria-label or aria-labelledby.
	// If it does, this value should be false so that we don't update the state and cause a rerender when we go through the layoutEffect
	let [hasSlot, setHasSlot] = useState(initialState, subSlot(slot, 'hasSlot'));
	let hasRun = useRef(false, subSlot(slot, 'hasRun'));

	// A callback ref which will run when the slotted element mounts.
	// This should happen before the useLayoutEffect below.
	let ref = useCallback(
		(el: any) => {
			hasRun.current = true;
			setHasSlot(!!el);
		},
		[],
		subSlot(slot, 'ref'),
	);

	// If the callback hasn't been called, then reset to false.
	useLayoutEffect(
		() => {
			if (!hasRun.current) {
				setHasSlot(false);
			}
		},
		[],
		subSlot(slot, 'reset'),
	);

	return [ref, hasSlot];
}

interface SlotAria {
	id: string | undefined;
	ref: RefCallback<any>;
}

export function useSlotId2(initialState?: boolean | (() => boolean)): SlotAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSlotId2(
	initialState: boolean | (() => boolean) | undefined,
	slot: symbol | undefined,
): SlotAria;
export function useSlotId2(...args: any[]): SlotAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSlotId2');
	const initialState = (user[0] as boolean | (() => boolean) | undefined) ?? true;

	let id = useId(subSlot(slot, 'id'));
	let [ref, hasSlot] = useSlot(initialState, subSlot(slot, 'slot'));

	return {
		id: hasSlot ? id : undefined,
		ref,
	};
}
