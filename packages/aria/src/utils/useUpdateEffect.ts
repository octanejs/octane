// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useUpdateEffect.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit dependency arrays (including the caller-supplied one) are
// preserved exactly.
import { useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useEffectEvent } from './useEffectEvent';

type EffectCallback = () => void | (() => void);

// Like useEffect, but only called for updates after the initial render.
export function useUpdateEffect(cb: EffectCallback, dependencies: any[]): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useUpdateEffect(
	cb: EffectCallback,
	dependencies: any[],
	slot: symbol | undefined,
): void;
export function useUpdateEffect(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useUpdateEffect');
	const cb = user[0] as EffectCallback;
	const dependencies = user[1] as any[];

	const isInitialMount = useRef(true, subSlot(slot, 'initialMount'));
	const lastDeps = useRef<any[] | null>(null, subSlot(slot, 'lastDeps'));
	let cbEvent = useEffectEvent(cb, subSlot(slot, 'cb'));

	useEffect(
		() => {
			isInitialMount.current = true;
			return () => {
				isInitialMount.current = false;
			};
		},
		[],
		subSlot(slot, 'mountFx'),
	);

	useEffect(
		() => {
			let prevDeps = lastDeps.current;
			if (isInitialMount.current) {
				isInitialMount.current = false;
			} else if (!prevDeps || dependencies.some((dep, i) => !Object.is(dep, prevDeps[i]))) {
				cbEvent();
			}
			lastDeps.current = dependencies;
		},
		dependencies,
		subSlot(slot, 'updateFx'),
	);
}
