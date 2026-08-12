import { useCallback, useEffect, useMemo, useState } from 'octane';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { getSlot, subSlot } from '../../internal.js';
import { assert } from '../../utils/assert.js';
import { DATA_ATTRIBUTE_LIST_INDEX } from './List.js';
import type { DynamicRowHeight } from './types.js';

export function useDynamicRowHeight(options: {
	defaultRowHeight: number;
	key?: string | number;
}): DynamicRowHeight;
export function useDynamicRowHeight(
	{
		defaultRowHeight,
		key,
	}: {
		defaultRowHeight: number;
		key?: string | number;
	},
	...rest: unknown[]
): DynamicRowHeight {
	const slot = getSlot(rest);
	const [state, setState] = useState<{
		key: string | number | undefined;
		map: Map<number, number>;
	}>(
		{
			key,
			map: new Map(),
		},
		subSlot(slot, 'state'),
	);

	if (state.key !== key) {
		setState({
			key,
			map: new Map(),
		});
	}

	const { map } = state;

	const getAverageRowHeight = useCallback(
		() => {
			let totalHeight = 0;

			map.forEach((height) => {
				totalHeight += height;
			});

			if (totalHeight === 0) {
				return defaultRowHeight;
			}

			return totalHeight / map.size;
		},
		[defaultRowHeight, map],
		subSlot(slot, 'average'),
	);

	const getRowHeight = useCallback(
		(index: number) => {
			const measuredHeight = map.get(index);
			if (measuredHeight !== undefined) {
				return measuredHeight;
			}

			// Temporarily store default height in the cache map to avoid scroll jumps if rowProps change
			// Else rowProps changes can impact the average height, and cause rows to shift up or down within the list
			// see github.com/bvaughn/react-window/issues/863
			map.set(index, defaultRowHeight);

			return defaultRowHeight;
		},
		[defaultRowHeight, map],
		subSlot(slot, 'height'),
	);

	const setRowHeight = useCallback(
		(index: number, size: number) => {
			setState((prevState) => {
				if (prevState.map.get(index) === size) {
					return prevState;
				}

				const clonedMap = new Map(prevState.map);
				clonedMap.set(index, size);

				return {
					...prevState,
					map: clonedMap,
				};
			});
		},
		[],
		subSlot(slot, 'set-height'),
	);

	const resizeObserverCallback = useStableCallback(
		(entries: ResizeObserverEntry[]) => {
			if (entries.length === 0) {
				return;
			}

			entries.forEach((entry) => {
				const { borderBoxSize, target } = entry;

				const attribute = target.getAttribute(DATA_ATTRIBUTE_LIST_INDEX);
				assert(attribute !== null, `Invalid ${DATA_ATTRIBUTE_LIST_INDEX} attribute value`);

				const index = parseInt(attribute);

				const { blockSize: height } = borderBoxSize[0];
				if (!height) {
					// Ignore heights that have not yet been measured (e.g. <img> elements that have not yet loaded)
					return;
				}

				setRowHeight(index, height);
			});
		},
		subSlot(slot, 'resize-callback'),
	);

	const [resizeObserver] = useState(
		() => {
			if (typeof ResizeObserver !== 'undefined') {
				return new ResizeObserver(resizeObserverCallback);
			}
		},
		subSlot(slot, 'resize-observer'),
	);

	useEffect(
		() => {
			if (resizeObserver) {
				return () => {
					resizeObserver.disconnect();
				};
			}
		},
		[resizeObserver],
		subSlot(slot, 'cleanup'),
	);

	const observeRowElements = useCallback(
		(elements: Element[] | NodeListOf<Element>) => {
			if (resizeObserver) {
				elements.forEach((element) => resizeObserver.observe(element));
				return () => {
					elements.forEach((element) => resizeObserver.unobserve(element));
				};
			}
			return () => {};
		},
		[resizeObserver],
		subSlot(slot, 'observe-elements'),
	);

	return useMemo<DynamicRowHeight>(
		() => ({
			getAverageRowHeight,
			getRowHeight,
			setRowHeight,
			observeRowElements,
		}),
		[getAverageRowHeight, getRowHeight, setRowHeight, observeRowElements],
		subSlot(slot, 'result'),
	);
}
