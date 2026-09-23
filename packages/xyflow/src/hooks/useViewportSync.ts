import { useEffect } from 'octane';
import { resolveHookSlot, subSlot, withoutSlot } from './slot';
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
export function useViewportSync(viewportArg?: Viewport | symbol, ...rest: [slot?: symbol]) {
	const slot = resolveHookSlot(rest) ?? (typeof viewportArg === 'symbol' ? viewportArg : undefined);
	const viewport = withoutSlot(viewportArg);
	const syncViewport = useStore(selector, undefined, subSlot(slot, 'sync'));
	const store = useStoreApi(subSlot(slot, 'store'));

	useEffect(
		function syncViewportEffect() {
			if (viewport) {
				syncViewport?.(viewport);
				store.setState({ transform: [viewport.x, viewport.y, viewport.zoom] });
			}
		},
		[viewport, syncViewport],
		subSlot(slot, 'effect'),
	);

	return null;
}
