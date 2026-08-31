import { useEffect, useRef, useState } from 'octane';
import type { RefObject } from '../react-shim.js';
import { resolveHookSlot, subSlot } from './slot';
import { XYDrag, type XYDragInstance } from '@xyflow/system';

import { handleNodeClick } from '../components/Nodes/utils';
import { useStoreApi } from './useStore';

type UseDragParams = {
	nodeRef: RefObject<HTMLDivElement>;
	disabled?: boolean;
	noDragClassName?: string;
	handleSelector?: string;
	nodeId?: string;
	isSelectable?: boolean;
	nodeClickDistance?: number;
};

/**
 * Hook for calling XYDrag helper from @xyflow/system.
 *
 * @internal
 */
export function useDrag(
	{
		nodeRef,
		disabled = false,
		noDragClassName,
		handleSelector,
		nodeId,
		isSelectable,
		nodeClickDistance,
	}: UseDragParams,
	...rest: [slot?: symbol]
) {
	const slot = resolveHookSlot(rest);
	const store = useStoreApi(slot);
	const [dragging, setDragging] = useState<boolean>(false, subSlot(slot, 'dragging'));
	const xyDrag = useRef<XYDragInstance | undefined>(undefined, subSlot(slot, 'xyDrag'));

	useEffect(
		function setupDrag() {
			if (disabled) {
				return;
			}

			xyDrag.current = XYDrag({
				getStoreItems: function getStoreItems() {
					return store.getState();
				},
				onNodeMouseDown: function onNodeMouseDown(id: string) {
					handleNodeClick({
						id,
						store,
						nodeRef,
					});
				},
				onDragStart: function onDragStart() {
					setDragging(true);
				},
				onDragStop: function onDragStop() {
					setDragging(false);
				},
			});

			return function destroyDrag() {
				xyDrag.current?.destroy();
				xyDrag.current = undefined;
			};
		},
		[disabled, store, nodeRef],
		subSlot(slot, 'setup'),
	);

	useEffect(
		function updateDrag() {
			if (disabled || !nodeRef.current || !xyDrag.current) {
				return;
			}

			xyDrag.current.update({
				noDragClassName,
				handleSelector,
				domNode: nodeRef.current,
				isSelectable,
				nodeId,
				nodeClickDistance,
			});
		},
		[noDragClassName, handleSelector, disabled, isSelectable, nodeRef, nodeId, nodeClickDistance],
		subSlot(slot, 'update'),
	);

	return dragging;
}
