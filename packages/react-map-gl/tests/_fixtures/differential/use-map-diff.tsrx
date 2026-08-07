/**
 * Driving the map imperatively from OUTSIDE it — a sidebar "fly to this" button,
 * which is the common shape and the easy one to get wrong.
 *
 * `useMap().current` is populated from the context the map itself provides, so
 * it is undefined for anything rendered outside `<Map>`. Reaching a map from
 * elsewhere in the tree is what `<MapProvider>` is for: the map registers under
 * its `id`. A binding that quietly returned an empty collection here would give
 * a button that silently does nothing.
 */
import { Map, MapProvider, useMap } from '@octanejs/react-map-gl';
import { useState } from 'octane';

function Toolbar() @{
	const [readout, setReadout] = useState('');
	const maps = useMap();

	<div>
		<button
			id="fly"
			onClick={() => {
				maps.demo?.flyTo({ center: [-9.1393, 38.7223], zoom: 12 });
			}}
		>fly</button>
		<button
			id="probe"
			onClick={() => {
				const map = maps.demo;
				setReadout(
					JSON.stringify({
						// Outside the map, `current` must be empty on both bindings.
						currentIsEmptyOutsideMap: maps.current === undefined,
						reachableById: Boolean(map),
						center: map
							? [Number(map.getCenter().lng.toFixed(3)), Number(map.getCenter().lat.toFixed(3))]
							: null,
						zoom: map ? Number(map.getZoom().toFixed(2)) : null,
					}),
				);
			}}
		>probe</button>
		<pre id="toolbar">{readout as string}</pre>
	</div>
}

export function UseMapDiff(props: any) @{
	<MapProvider>
		<div>
			<Toolbar />
			<Map
				id="demo"
				mapLib={props.mapLib}
				mapboxAccessToken="test-token"
				initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
			/>
		</div>
	</MapProvider>
}
