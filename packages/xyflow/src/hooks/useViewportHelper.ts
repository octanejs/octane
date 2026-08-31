import { useMemo } from 'octane';
import { resolveHookSlot, subSlot } from './slot';
import {
	pointToRendererPoint,
	getViewportForBounds,
	type XYPosition,
	rendererPointToPoint,
	SnapGrid,
} from '@xyflow/system';

import { useStoreApi } from '../hooks/useStore';
import type { ViewportHelperFunctions } from '../types';

const useViewportHelper = (...rest: [slot?: symbol]): ViewportHelperFunctions => {
	const slot = resolveHookSlot(rest);
	const store = useStoreApi(subSlot(slot, 'store'));

	return useMemo<ViewportHelperFunctions>(
		function buildViewportHelper() {
			return {
				zoomIn: async function zoomIn(options) {
					const { panZoom } = store.getState();
					return panZoom ? panZoom.scaleBy(1.2, options) : false;
				},
				zoomOut: async function zoomOut(options) {
					const { panZoom } = store.getState();
					return panZoom ? panZoom.scaleBy(1 / 1.2, options) : false;
				},
				zoomTo: async function zoomTo(zoomLevel, options) {
					const { panZoom } = store.getState();
					return panZoom ? panZoom.scaleTo(zoomLevel, options) : false;
				},
				getZoom: function getZoom() {
					return store.getState().transform[2];
				},
				setViewport: async function setViewport(viewport, options) {
					const {
						transform: [tX, tY, tZoom],
						panZoom,
					} = store.getState();
					if (!panZoom) return false;
					await panZoom.setViewport(
						{
							x: viewport.x ?? tX,
							y: viewport.y ?? tY,
							zoom: viewport.zoom ?? tZoom,
						},
						options,
					);
					return true;
				},
				getViewport: function getViewport() {
					const [x, y, zoom] = store.getState().transform;
					return { x, y, zoom };
				},
				setCenter: async function setCenter(x, y, options) {
					return store.getState().setCenter(x, y, options);
				},
				fitBounds: async function fitBounds(bounds, options) {
					const { width, height, minZoom, maxZoom, panZoom } = store.getState();
					const viewport = getViewportForBounds(
						bounds,
						width,
						height,
						minZoom,
						maxZoom,
						options?.padding ?? 0.1,
					);
					if (!panZoom) return false;
					await panZoom.setViewport(viewport, {
						duration: options?.duration,
						ease: options?.ease,
						interpolate: options?.interpolate,
					});
					return true;
				},
				screenToFlowPosition: function screenToFlowPosition(
					clientPosition: XYPosition,
					options: { snapToGrid?: boolean; snapGrid?: SnapGrid } = {},
				) {
					const { transform, snapGrid, snapToGrid, domNode } = store.getState();
					if (!domNode) return clientPosition;
					const { x: domX, y: domY } = domNode.getBoundingClientRect();
					const correctedPosition = { x: clientPosition.x - domX, y: clientPosition.y - domY };
					const _snapGrid = options.snapGrid ?? snapGrid;
					const _snapToGrid = options.snapToGrid ?? snapToGrid;
					return pointToRendererPoint(correctedPosition, transform, _snapToGrid, _snapGrid);
				},
				flowToScreenPosition: function flowToScreenPosition(flowPosition: XYPosition) {
					const { transform, domNode } = store.getState();
					if (!domNode) return flowPosition;
					const { x: domX, y: domY } = domNode.getBoundingClientRect();
					const rendererPosition = rendererPointToPoint(flowPosition, transform);
					return { x: rendererPosition.x + domX, y: rendererPosition.y + domY };
				},
			};
		},
		[store],
		subSlot(slot, 'helper'),
	);
};

export default useViewportHelper;
