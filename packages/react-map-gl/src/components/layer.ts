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

/* eslint-disable complexity, max-statements */
function updateLayer(map: MapInstance, id: string, props: LayerProps, prevProps: LayerProps) {
	assert(props.id === prevProps.id, 'layer id changed');
	assert(props.type === prevProps.type, 'layer type changed');

	if (props.type === 'custom' || prevProps.type === 'custom') {
		return;
	}

	// @ts-ignore filter does not exist in some Layer types
	const { layout = {}, paint = {}, filter, minzoom, maxzoom, beforeId } = props;

	if (beforeId !== prevProps.beforeId) {
		map.moveLayer(id, beforeId!);
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
}

function createLayer(map: MapInstance, id: string, props: LayerProps) {
	// @ts-ignore
	if (map.style && map.style._loaded && (!('source' in props) || map.getSource(props.source))) {
		const options: LayerProps = { ...props, id };
		delete options.beforeId;

		// @ts-ignore
		map.addLayer(options, props.beforeId);
	}
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
	if (layer) {
		try {
			updateLayer(map, id, layerProps, propsRef.current);
		} catch (error) {
			console.warn(error); // eslint-disable-line
		}
	} else {
		createLayer(map, id, layerProps);
	}

	// Store last rendered props
	propsRef.current = layerProps;

	return null;
}
