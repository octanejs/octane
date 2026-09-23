import { useEffect, useRef } from 'octane';

import type { InternalNode } from '../../types';
import { useStoreApi } from '../../hooks/useStore';
import { resolveHookSlot, subSlot } from '../../hooks/slot';

/**
 * Hook to handle the resize observation + internal updates for the passed node.
 *
 * @internal
 * @returns nodeRef - reference to the node element
 */
export function useNodeObserver(
	{
		node,
		nodeType,
		hasDimensions,
		resizeObserver,
	}: {
		node: InternalNode;
		nodeType: string;
		hasDimensions: boolean;
		resizeObserver: ResizeObserver | null;
	},
	...rest: [slot?: symbol]
) {
	const slot = resolveHookSlot(rest);
	const store = useStoreApi(subSlot(slot, 'store'));
	const nodeRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'node'));
	const observedNode = useRef<HTMLDivElement | null>(null, subSlot(slot, 'observed-node'));
	const prevSourcePosition = useRef(node.sourcePosition, subSlot(slot, 'prev-source-position'));
	const prevTargetPosition = useRef(node.targetPosition, subSlot(slot, 'prev-target-position'));
	const prevType = useRef(nodeType, subSlot(slot, 'prev-type'));
	const isInitialized = hasDimensions && !!node.internals.handleBounds;

	useEffect(
		() => {
			if (
				nodeRef.current &&
				!node.hidden &&
				(!isInitialized || observedNode.current !== nodeRef.current)
			) {
				if (observedNode.current) {
					resizeObserver?.unobserve(observedNode.current);
				}
				resizeObserver?.observe(nodeRef.current);
				observedNode.current = nodeRef.current;
			}
		},
		[isInitialized, node.hidden],
		subSlot(slot, 'observe'),
	);

	useEffect(
		() => {
			return () => {
				if (observedNode.current) {
					resizeObserver?.unobserve(observedNode.current);
					observedNode.current = null;
				}
			};
		},
		[],
		subSlot(slot, 'unobserve'),
	);

	useEffect(
		() => {
			if (nodeRef.current) {
				/*
				 * when the user programmatically changes the source or handle position, we need to update the internals
				 * to make sure the edges are updated correctly
				 */
				const typeChanged = prevType.current !== nodeType;
				const sourcePosChanged = prevSourcePosition.current !== node.sourcePosition;
				const targetPosChanged = prevTargetPosition.current !== node.targetPosition;

				if (typeChanged || sourcePosChanged || targetPosChanged) {
					prevType.current = nodeType;
					prevSourcePosition.current = node.sourcePosition;
					prevTargetPosition.current = node.targetPosition;

					store
						.getState()
						.updateNodeInternals(
							new Map([[node.id, { id: node.id, nodeElement: nodeRef.current, force: true }]]),
						);
				}
			}
		},
		[node.id, nodeType, node.sourcePosition, node.targetPosition],
		subSlot(slot, 'update-internals'),
	);

	return nodeRef;
}
