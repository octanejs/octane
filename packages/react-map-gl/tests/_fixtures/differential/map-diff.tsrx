/**
 * One tree exercised by both @octanejs/react-map-gl and the pinned upstream
 * @vis.gl/react-mapbox running on real React. Both sides receive the same
 * mapbox-gl double, so any DOM difference is a binding difference.
 */
import {
	AttributionControl,
	Layer,
	Map,
	Marker,
	NavigationControl,
	Popup,
	Source,
} from '@octanejs/react-map-gl';
import { useState } from 'octane';

export function MapDiff(props: any) @{
	const [markerLabel, setMarkerLabel] = useState('A');

	<div>
		<button id="relabel" onClick={() => setMarkerLabel('B')}>relabel</button>
		<Map
			mapLib={props.mapLib}
			mapboxAccessToken="test-token"
			initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
		>
			<AttributionControl />
			<NavigationControl />
			<Marker longitude={-122} latitude={38}>
				<span class="pin">{markerLabel as string}</span>
			</Marker>
			<Popup longitude={-100} latitude={40}>
				<div class="popup-body">Here</div>
			</Popup>
			<Source id="my-data" type="geojson" data={{ type: 'Point', coordinates: [0, 0] }}>
				<Layer id="my-layer" type="circle" paint={{ 'circle-radius': 10 }} />
			</Source>
		</Map>
	</div>
}
