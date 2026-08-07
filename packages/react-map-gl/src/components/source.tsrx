import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'octane';
import { MapContext } from './map.tsrx';
import assert from '../utils/assert';
import { deepEqual } from '../utils/deep-equal';

import type {
	SourceSpecification,
	CanvasSourceSpecification,
	ImageSourceSpecification,
	VectorSourceSpecification,
} from '../types/style-spec';
import type { MapInstance } from '../types/lib';
import type {
	GeoJSONSourceImplementation,
	ImageSourceImplementation,
	AnySourceImplementation,
} from '../types/internal';
import type { MapChildren } from '../types/octane';

export type SourceProps =
	(SourceSpecification | CanvasSourceSpecification) & {
		id?: string;
		children?: MapChildren;
	};

/**
 * OCTANE DIVERGENCE[react-map-gl-source-id-by-context][ported:source-layer:3]: upstream delivers this source's id to child layers with
 * `Children.map(children, child => cloneElement(child, {source: id}))`. Octane
 * lowers a `.tsrx` parent's children to a render function, which cannot be
 * cloned, so the id travels by context instead and `Layer` reads it.
 *
 * Two observable consequences, both pinned by tests:
 *  - the id reaches any descendant `Layer`, not only a direct child;
 *  - as with upstream's cloneElement, the enclosing source still overrides a
 *    `source` prop set explicitly on the layer.
 */
export const SourceContext = createContext<string | null>(null);

let sourceCounter = 0;

function createSource(map: MapInstance, id: string, props: SourceProps) {
	// @ts-ignore
	if (map.style && map.style._loaded) {
		const options = { ...props };
		delete options.id;
		delete options.children;
		map.addSource(id, options as unknown as SourceSpecification);
		return map.getSource(id);
	}
	return null;
}

/* eslint-disable complexity */
function updateSource(source: AnySourceImplementation, props: SourceProps, prevProps: SourceProps) {
	assert(props.id === prevProps.id, 'source id changed');
	assert(props.type === prevProps.type, 'source type changed');

	let changedKey = '';
	let changedKeyCount = 0;

	const nextValues = props as unknown as Record<string, unknown>;
	const prevValues = prevProps as unknown as Record<string, unknown>;
	for (const key in props) {
		if (key !== 'children' && key !== 'id' && !deepEqual(prevValues[key], nextValues[key])) {
			changedKey = key;
			changedKeyCount++;
		}
	}

	if (!changedKeyCount) {
		return;
	}

	const type = props.type;

	if (type === 'geojson') {
		(source as GeoJSONSourceImplementation).setData(props.data!);
	} else if (type === 'image') {
		(source as ImageSourceImplementation).updateImage({
			url: props.url!,
			coordinates: props.coordinates,
		});
	} else if ('setCoordinates' in source && changedKeyCount === 1 && changedKey === 'coordinates') {
		source.setCoordinates((props as unknown as ImageSourceSpecification).coordinates);
	} else if ('setUrl' in source && changedKey === 'url') {
		source.setUrl((props as VectorSourceSpecification).url!);
	} else if ('setTiles' in source && changedKey === 'tiles') {
		source.setTiles((props as VectorSourceSpecification).tiles!);
	} else {
		// eslint-disable-next-line
		console.warn(`Unable to update <Source> prop: ${changedKey}`);
	}
}
/* eslint-enable complexity */

export function Source(props: SourceProps) @{
	const map = useContext(MapContext).map.getMap();
	const propsRef = useRef(props);
	const [, setStyleLoaded] = useState(0);

	const id = useMemo(() => props.id || `jsx-source-${sourceCounter++}`, []);

	useEffect(() => {
		if (map) {
			/* global setTimeout */
			const forceUpdate = () => setTimeout(() => setStyleLoaded((version) => version + 1), 0);
			map.on('styledata', forceUpdate);
			forceUpdate();

			return () => {
				map.off('styledata', forceUpdate);
				// @ts-ignore
				if (map.style && map.style._loaded && map.getSource(id)) {
					// Parent effects are destroyed before child ones, see
					// https://github.com/facebook/react/issues/16728
					// Source can only be removed after all child layers are removed
					const allLayers = map.getStyle()?.layers;
					if (allLayers) {
						for (const layer of allLayers) {
							// @ts-ignore (2339) source does not exist on all layer types
							if (layer.source === id) {
								map.removeLayer(layer.id);
							}
						}
					}
					map.removeSource(id);
				}
			};
		}
		return undefined;
	}, [map]);

	let source = (map && map.style && map.getSource(id)) as AnySourceImplementation | null;
	if (source) {
		updateSource(source, props, propsRef.current);
	} else {
		source = createSource(map, id, props) as AnySourceImplementation | null;
	}
	propsRef.current = props;

	<>
		@if (source) {
			<SourceContext.Provider value={id}>{props.children}</SourceContext.Provider>
		}
	</>
}
