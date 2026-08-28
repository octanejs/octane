import { useCallback } from 'octane';
import { shallow } from '@octanejs/zustand/shallow';
import { isEdgeVisible } from '@xyflow/system';

import { useStore } from './useStore';
import { resolveHookSlot } from './slot';
import { type ReactFlowState } from '../types';

export function useVisibleEdgeIds(onlyRenderVisible: boolean, ...rest: [slot?: symbol]): string[] {
	const slot = resolveHookSlot(rest);
	const edgeIds = useStore(
		useCallback(
			function selectVisibleEdgeIds(s: ReactFlowState) {
				if (!onlyRenderVisible) {
					return s.edges.map(function mapEdgeId(edge) {
						return edge.id;
					});
				}

				const visibleEdgeIds: string[] = [];

				if (s.width && s.height) {
					for (const edge of s.edges) {
						const sourceNode = s.nodeLookup.get(edge.source);
						const targetNode = s.nodeLookup.get(edge.target);

						if (
							sourceNode &&
							targetNode &&
							isEdgeVisible({
								sourceNode,
								targetNode,
								width: s.width,
								height: s.height,
								transform: s.transform,
							})
						) {
							visibleEdgeIds.push(edge.id);
						}
					}
				}

				return visibleEdgeIds;
			},
			[onlyRenderVisible],
		),
		shallow,
		slot,
	);

	return edgeIds;
}
