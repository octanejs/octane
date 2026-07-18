// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useUpdateLayoutEffect.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim (they retain React's exact
// behavior in octane).
import { useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from './useLayoutEffect';

// React's EffectCallback shape (octane does not export the type alias).
type EffectCallback = () => void | (() => void);

// Like useLayoutEffect, but only called for updates after the initial render.
export function useUpdateLayoutEffect(effect: EffectCallback, dependencies: any[]): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useUpdateLayoutEffect(
	effect: EffectCallback,
	dependencies: any[],
	slot: symbol | undefined,
): void;
export function useUpdateLayoutEffect(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useUpdateLayoutEffect');
	const effect = user[0] as EffectCallback;
	const dependencies = user[1] as any[];

	const isInitialMount = useRef(true, subSlot(slot, 'initial'));
	const lastDeps = useRef<any[] | null>(null, subSlot(slot, 'lastDeps'));

	useLayoutEffect(
		() => {
			isInitialMount.current = true;
			return () => {
				isInitialMount.current = false;
			};
		},
		[],
		subSlot(slot, 'mountFlag'),
	);

	useLayoutEffect(
		() => {
			if (isInitialMount.current) {
				isInitialMount.current = false;
			} else if (
				!lastDeps.current ||
				// NOTE: `lastDeps[i]` (not `.current[i]`) is upstream's exact expression — kept verbatim.
				dependencies.some((dep, i) => !Object.is(dep, (lastDeps as any)[i]))
			) {
				effect();
			}
			lastDeps.current = dependencies;
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		dependencies,
		subSlot(slot, 'update'),
	);
}
