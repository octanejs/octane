// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useId.ts).
// The full id machinery ports as-is: `mergeIds` retroactively rewrites the id of every
// registered `useId` consumer (via the `idsUpdaterMap` ref registry + the run-every-render
// effect below), so two hooks that each generated an id converge on one after merging.
import { useEffect, useRef, useState, useCallback } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useSSRSafeId } from '../ssr/SSRProvider';
import { useLayoutEffect } from './useLayoutEffect';
import { useValueEffect } from './useValueEffect';

let canUseDOM = Boolean(
	typeof window !== 'undefined' && window.document && window.document.createElement,
);

export let idsUpdaterMap: Map<string, { current: string | null }[]> = new Map();
// This allows us to clean up the idsUpdaterMap when the id is no longer used.
// Map is a strong reference, so unused ids wouldn't be cleaned up otherwise.
// This can happen in suspended components where mount/unmount is not called.
let registry: FinalizationRegistry<string> | undefined;
if (typeof FinalizationRegistry !== 'undefined') {
	registry = new FinalizationRegistry<string>((heldValue) => {
		idsUpdaterMap.delete(heldValue);
	});
}

/**
 * If a default is not provided, generate an id.
 *
 * @param defaultId - Default component id.
 */
export function useId(defaultId?: string): string;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useId(slot: symbol | undefined): string;
export function useId(defaultId: string | undefined, slot: symbol | undefined): string;
export function useId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useId');
	const defaultId = user[0] as string | undefined;

	let [value, setValue] = useState(defaultId, subSlot(slot, 'value'));
	let nextId = useRef<string | null>(null, subSlot(slot, 'nextId'));

	let res = useSSRSafeId(value, subSlot(slot, 'ssrId'));
	let cleanupRef = useRef(null, subSlot(slot, 'cleanupToken'));

	if (registry) {
		registry.register(cleanupRef, res);
	}

	if (canUseDOM) {
		const cacheIdRef = idsUpdaterMap.get(res);
		if (cacheIdRef && !cacheIdRef.includes(nextId)) {
			cacheIdRef.push(nextId);
		} else {
			idsUpdaterMap.set(res, [nextId]);
		}
	}

	useLayoutEffect(
		() => {
			let r = res;
			return () => {
				// In Suspense, the cleanup function may be not called
				// when it is though, also remove it from the finalization registry.
				if (registry) {
					registry.unregister(cleanupRef);
				}
				idsUpdaterMap.delete(r);
			};
		},
		[res],
		subSlot(slot, 'unregister'),
	);

	// This cannot cause an infinite loop because the ref is always cleaned up.
	useEffect(
		() => {
			let newId = nextId.current;
			if (newId) {
				setValue(newId);
			}

			return () => {
				if (newId) {
					nextId.current = null;
				}
			};
		},
		null,
		subSlot(slot, 'apply'),
	);

	return res;
}

/**
 * Merges two ids.
 * Different ids will trigger a side-effect and re-render components hooked up with `useId`.
 */
export function mergeIds(idA: string, idB: string): string {
	if (idA === idB) {
		return idA;
	}

	let setIdsA = idsUpdaterMap.get(idA);
	if (setIdsA) {
		setIdsA.forEach((ref) => (ref.current = idB));
		return idB;
	}

	let setIdsB = idsUpdaterMap.get(idB);
	if (setIdsB) {
		setIdsB.forEach((ref) => (ref.current = idA));
		return idA;
	}

	return idB;
}

/**
 * Used to generate an id, and after render, check if that id is rendered so we know
 * if we can use it in places such as labelledby.
 *
 * @param depArray - When to recalculate if the id is in the DOM.
 */
export function useSlotId(depArray?: ReadonlyArray<any>): string;
export function useSlotId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSlotId');
	const depArray = (user[0] as ReadonlyArray<any> | undefined) ?? [];

	let id = useId(subSlot(slot, 'id'));
	let [resolvedId, setResolvedId] = useValueEffect(id, subSlot(slot, 'resolved'));
	let updateId = useCallback(
		() => {
			setResolvedId(function* () {
				yield id;

				yield document.getElementById(id) ? id : undefined;
			});
		},
		[id, setResolvedId],
		subSlot(slot, 'update'),
	);

	useLayoutEffect(updateId, [id, updateId, ...depArray], subSlot(slot, 'run'));

	return resolvedId as string;
}
