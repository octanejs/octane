/**
 * `<Source>` and `<Layer>` render no DOM of their own — they exist to make calls
 * into mapbox-gl. `StyleProbe` reads the resulting style back off the live map
 * and writes it into the page, so the DOM-level differential can compare what
 * each binding actually told the library to do.
 */
import { Layer, Map, Source, useMap } from '@octanejs/react-map-gl';
import { useState } from 'octane';

function StyleProbe() @{
	const [snapshot, setSnapshot] = useState('');
	const maps = useMap();

	<div>
		<button
			id="snap"
			onClick={() => {
				const map = maps.current;
				if (!map) return;
				const style = map.getStyle()!;
				setSnapshot(
					JSON.stringify({
						// `_data` is where the double records the latest `setData`, so an
						// update is visible here and not only the initial `addSource`.
						sources: Object.entries(style.sources).map(
							([id, source]: [string, any]) => ({
								id,
								type: source.type,
								data: source._data,
							}),
						),
						layers: (style.layers as any[]).map(
							(layer) => ({
								id: layer.id,
								source: layer.source,
								paint: layer.paint,
							}),
						),
					}),
				);
			}}
		>snap</button>
		<pre id="snapshot">{snapshot as string}</pre>
	</div>
}

export function SourceLayerDiff(props: any) @{
	const [radius, setRadius] = useState(10);
	const [pointCount, setPointCount] = useState(1);
	const [showLayer, setShowLayer] = useState(true);

	const data = {
		type: 'FeatureCollection' as const,
		features: Array.from(
			{ length: pointCount },
			(_unused, index) => ({
				type: 'Feature' as const,
				properties: {},
				geometry: { type: 'Point' as const, coordinates: [index, index] },
			}),
		),
	};

	<div>
		<button id="grow" onClick={() => setRadius(20)}>grow</button>
		<button id="add-point" onClick={() => setPointCount(2)}>add point</button>
		<button id="drop-layer" onClick={() => setShowLayer(false)}>drop layer</button>
		<Map
			mapLib={props.mapLib}
			mapboxAccessToken="test-token"
			initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
		>
			<StyleProbe />
			{/* The layer carries no `source` prop, so it can only reach the map with
    the id this Source hands it — by cloneElement upstream, by context
    here. For a direct child the two must be indistinguishable. */}
			<Source id="data" type="geojson" data={data}>
				@if (showLayer) {
					<Layer id="dots" type="circle" paint={{ 'circle-radius': radius }} />
				}
			</Source>
		</Map>
	</div>
}
