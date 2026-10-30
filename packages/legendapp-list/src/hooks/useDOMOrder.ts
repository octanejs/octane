import { useEffect, useMemo, useRef, useState } from 'octane';

import { Platform } from '../platform/Platform.ts';
import { listen$, peek$, type StateContext, useStateContext } from '../state/state.ts';

// OCTANE DIVERGENCE[dom-order][differential:legendapp-list-row-hooks]: upstream sorts the container elements with insertBefore 500ms
// after the last position change, so DOM order follows item order. Octane tracks
// each component's DOM as a range between comment markers, and a node moved behind
// its back leaves those ranges. This hook keeps the same debounce and the same
// ordering, but returns the order: Containers renders its slots keyed by container
// id in this order, and Octane's keyed reconciler moves the elements.
export function useDOMOrder(numContainers: number): number[] {
	const ctx = useStateContext();
	const debounceRef = useRef<number | undefined>(undefined);
	const [order, setOrder] = useState<number[]>([]);

	useEffect(() => {
		if (Platform.OS !== 'web') {
			return;
		}

		const unsubscribe = listen$(ctx, 'lastPositionUpdate', () => {
			// Clear existing timeout
			if (debounceRef.current !== undefined) {
				clearTimeout(debounceRef.current);
			}

			// Schedule reordering to run 500ms after the last position change
			debounceRef.current = setTimeout(() => {
				debounceRef.current = undefined;
				setOrder((previous) => sortContainerIds(ctx, previous));
			}, 500) as unknown as number;
		});

		return () => {
			unsubscribe();
			if (debounceRef.current !== undefined) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [ctx]);

	// New containers append after the sorted ones, where React places a new last child.
	return useMemo(() => withAllContainers(order, numContainers), [order, numContainers]);
}

function withAllContainers(order: number[], numContainers: number) {
	const ids = order.filter((id) => id < numContainers);
	const seen = new Set(ids);
	for (let id = 0; id < numContainers; id++) {
		if (!seen.has(id)) {
			ids.push(id);
		}
	}
	return ids;
}

function sortContainerIds(ctx: StateContext, previous: number[]) {
	const ids = withAllContainers(previous, peek$(ctx, 'numContainersPooled') ?? 0);
	const indexById = new Map<number, number | null>();
	for (const id of ids) {
		const element = ctx.viewRefs.get(id)?.current as HTMLElement | null | undefined;
		const index = peek$(ctx, `containerItemIndex${id}`);
		indexById.set(id, element && index !== undefined ? index : null);
	}
	// Containers without a rendered item keep their relative order after the placed ones.
	const sorted = [...ids].sort((a, b) => {
		const aKey = indexById.get(a)!;
		const bKey = indexById.get(b)!;
		if (aKey === null) {
			return bKey === null ? 0 : 1;
		}
		if (bKey === null) {
			return -1;
		}
		return aKey - bKey;
	});
	return sorted.every((id, index) => id === previous[index]) && sorted.length === previous.length
		? previous
		: sorted;
}
