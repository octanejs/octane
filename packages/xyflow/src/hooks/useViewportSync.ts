import { useEffect } from 'octane';
import { resolveHookSlot } from './slot';
import type { Viewport } from '@xyflow/system';

import { useStore, useStoreApi } from './useStore';
import type { ReactFlowState } from '../types';

const selector = (state: ReactFlowState) => state.panZoom?.syncViewport;

/**
 * Hook for syncing the viewport with the panzoom instance.
 *
 * @internal
 * @param viewport
 */
export function useViewportSync(viewport?: Viewport, ...rest: [slot?: symbol]) {
	const slot = resolveHookSlot(rest);
	const syncViewport = useStore(selector, undefined, slot);
	const store = useStoreApi(slot);

	useEffect(
		function syncViewportEffect() {
			if (viewport) {
				syncViewport?.(viewport);
				store.setState({ transform: [viewport.x, viewport.y, viewport.zoom] });
			}
		},
		[viewport, syncViewport],
		slot,
	);

	return null;
}
