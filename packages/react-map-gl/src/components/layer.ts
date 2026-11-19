import { useContext, useEffect, useMemo, useRef, useState } from 'octane';
import { MapContext } from './map.tsrx';
import { SourceContext } from './source.tsrx';
import assert from '../utils/assert';
import { deepEqual } from '../utils/deep-equal';

import type { MapInstance, CustomLayerInterface } from '../types/lib';
import type { LayerSpecification } from '../types/style-spec';

// Omiting property from a union type, see
// https://github.com/microsoft/TypeScript/issues/39556#issuecomment-656925230
type OptionalId<T> = T extends { id: string } ? Omit<T, 'id'> & { id?: string } : T;
type OptionalSource<T> = T extends { source: string } ? Omit<T, 'source'> & { source?: string } : T;

export type LayerProps = (OptionalSource<OptionalId<LayerSpecification>> | CustomLayerInterface) & {
	/** If set, the layer will be inserted before the specified layer */
	beforeId?: string;
};

/**
 * OCTANE DIVERGENCE[react-map-gl-layer-missing-anchor][differential:7]: upstream
 * passes `beforeId` straight to `addLayer` and `moveLayer`. When it names a layer
 * the style does not hold yet, `Style#moveLayer` has already taken the layer out
 * of the draw order before it reports the missing anchor, so the layer stops
 * drawing while `getLayer` still returns it, and no later render repairs it.
 * Sibling layers anchored beneath the next one hit this whenever a layer is
 * added on top: the lower layer re-anchors before the new one is added. Here a
 * layer waits where it is (or is added on top) and keeps the anchor it last
 * applied; the `styledata` that follows the anchor's arrival re-renders it and
 * the move goes through.
 */
function anchorReady(map: MapInstance, beforeId: string | undefined): boolean {
	return beforeId === undefined || Boolean(map.getLayer(beforeId));
}

/* eslint-disable complexity, max-statements */
// Returns the `beforeId` the style now reflects.
function updateLayer(
	map: MapInstance,
	id: string,
	props: LayerProps,
	prevProps: LayerProps,
): string | undefined {
	assert(props.id === prevProps.id, 'layer id changed');
	assert(props.type === prevProps.type, 'layer type changed');

	if (props.type === 'custom' || prevProps.type === 'custom') {
		return prevProps.beforeId;
	}

	// @ts-ignore filter does not exist in some Layer types
	const { layout = {}, paint = {}, filter, minzoom, maxzoom, beforeId } = props;

	let appliedBeforeId = prevProps.beforeId;
	if (beforeId !== prevProps.beforeId && anchorReady(map, beforeId)) {
		map.moveLayer(id, beforeId!);
		appliedBeforeId = beforeId;
	}
	if (layout !== prevProps.layout) {
		const nextLayout = layout as Record<string, unknown>;
		const prevLayout = (prevProps.layout || {}) as Record<string, unknown>;
		for (const key in nextLayout) {
			if (!deepEqual(nextLayout[key], prevLayout[key])) {
				map.setLayoutProperty(id, key as any, nextLayout[key]);
			}
		}
		for (const key in prevLayout) {
			if (!nextLayout.hasOwnProperty(key)) {
				map.setLayoutProperty(id, key as any, undefined);
			}
		}
	}
	if (paint !== prevProps.paint) {
		const nextPaint = paint as Record<string, unknown>;
		const prevPaint = (prevProps.paint || {}) as Record<string, unknown>;
		for (const key in nextPaint) {
			if (!deepEqual(nextPaint[key], prevPaint[key])) {
				map.setPaintProperty(id, key as any, nextPaint[key]);
			}
		}
		for (const key in prevPaint) {
			if (!nextPaint.hasOwnProperty(key)) {
				map.setPaintProperty(id, key as any, undefined);
			}
		}
	}

	// @ts-ignore filter does not exist in some Layer types
	if (!deepEqual(filter, prevProps.filter)) {
		map.setFilter(id, filter);
	}
	if (minzoom !== prevProps.minzoom || maxzoom !== prevProps.maxzoom) {
		map.setLayerZoomRange(id, minzoom!, maxzoom!);
	}
	return appliedBeforeId;
}

// Returns the `beforeId` the new layer was added with.
function createLayer(map: MapInstance, id: string, props: LayerProps): string | undefined {
	// @ts-ignore
	if (map.style && map.style._loaded && (!('source' in props) || map.getSource(props.source))) {
		const options: LayerProps = { ...props, id };
		delete options.beforeId;
		const beforeId = anchorReady(map, props.beforeId) ? props.beforeId : undefined;

		// @ts-ignore
		map.addLayer(options, beforeId);
		return beforeId;
	}
	return props.beforeId;
}

/* eslint-enable complexity, max-statements */

let layerCounter = 0;

export function Layer(props: LayerProps) {
	const map = useContext(MapContext).map.getMap();
	// An enclosing <Source> publishes its id here. Upstream instead clones this
	// element with `{source: id}`, which likewise overrides an explicitly set
	// source prop — see the divergence note in source.tsrx.
	const inheritedSource = useContext(SourceContext);
	const propsRef = useRef(props);
	const [, setStyleLoaded] = useState(0);

	const id = useMemo(() => props.id || `jsx-layer-${layerCounter++}`, []);

	const layerProps: LayerProps =
		inheritedSource === null ? props : ({ ...props, source: inheritedSource } as LayerProps);

	useEffect(() => {
		if (map) {
			const forceUpdate = () => setStyleLoaded((version) => version + 1);
			map.on('styledata', forceUpdate);
			forceUpdate();

			return () => {
				map.off('styledata', forceUpdate);
				// @ts-ignore
				if (map.style && map.style._loaded && map.getLayer(id)) {
					map.removeLayer(id);
				}
			};
		}
		return undefined;
	}, [map]);

	// @ts-ignore
	const layer = map && map.style && map.getLayer(id);
	let appliedBeforeId = layerProps.beforeId;
	if (layer) {
		try {
			appliedBeforeId = updateLayer(map, id, layerProps, propsRef.current);
		} catch (error) {
			console.warn(error); // eslint-disable-line
		}
	} else {
		appliedBeforeId = createLayer(map, id, layerProps);
	}

	// Store last rendered props, with the anchor the style holds.
	propsRef.current =
		appliedBeforeId === layerProps.beforeId
			? layerProps
			: ({ ...layerProps, beforeId: appliedBeforeId } as LayerProps);

	return null;
}
