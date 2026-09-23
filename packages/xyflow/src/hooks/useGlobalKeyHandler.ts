import { useEffect } from 'octane';
import { resolveHookSlot, subSlot } from './slot';
import type { KeyCode } from '@xyflow/system';

import { useStoreApi } from '../hooks/useStore';
import { useKeyPress } from './useKeyPress';
import { useReactFlow } from './useReactFlow';
import { Edge, Node } from '../types';

const selected = (item: Node | Edge) => item.selected;

const win = typeof window !== 'undefined' ? window : undefined;

/**
 * Hook for handling global key events.
 *
 * @internal
 */
export function useGlobalKeyHandler(
	{
		deleteKeyCode,
		multiSelectionKeyCode,
	}: {
		deleteKeyCode: KeyCode | null;
		multiSelectionKeyCode: KeyCode | null;
	},
	...rest: [slot?: symbol]
): void {
	const slot = resolveHookSlot(rest);
	const store = useStoreApi(subSlot(slot, 'store'));
	const { deleteElements } = useReactFlow(subSlot(slot, 'flow'));

	const deleteKeyPressed = useKeyPress(
		deleteKeyCode,
		{ actInsideInputWithModifier: false },
		subSlot(slot, 'delete-key'),
	);
	const multiSelectionKeyPressed = useKeyPress(
		multiSelectionKeyCode,
		{ target: win },
		subSlot(slot, 'multi-selection-key'),
	);

	useEffect(
		function handleDeleteKey() {
			if (deleteKeyPressed) {
				const { edges, nodes } = store.getState();
				deleteElements({ nodes: nodes.filter(selected), edges: edges.filter(selected) });
				store.setState({ nodesSelectionActive: false });
			}
		},
		[deleteKeyPressed],
		subSlot(slot, 'delete-effect'),
	);

	useEffect(
		function handleMultiSelectionKey() {
			store.setState({ multiSelectionActive: multiSelectionKeyPressed });
		},
		[multiSelectionKeyPressed],
		subSlot(slot, 'multi-selection-effect'),
	);
}
