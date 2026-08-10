/**
 * A realistic map page: content the server can render around a map it cannot.
 * The same module is rendered on the server and then hydrated on the client, so
 * anything the binding emits differently between the two shows up as a mismatch.
 */
import { Layer, Map, Marker, NavigationControl, Popup, Source } from '@octanejs/react-map-gl';
import { useState } from 'octane';
import type { MapLib } from '@octanejs/react-map-gl';

export type HydratePageProps = {
	/** Supplied on the client only; the server never loads a map library. */
	mapLib?: MapLib | Promise<MapLib>;
};

export function HydratePage(props: HydratePageProps) @{
	const [clicks, setClicks] = useState(0);

	<main id="page">
		<h1>Where we are</h1>
		<button id="counter" onClick={() => setClicks(clicks + 1)}>{'clicks: ' + clicks}</button>
		<Map
			id="hydrated-map"
			mapLib={props.mapLib}
			mapboxAccessToken="test-token"
			initialViewState={{ longitude: -122, latitude: 38, zoom: 4 }}
			style={{ height: '400px' }}
		>
			<NavigationControl />
			<Marker longitude={-122} latitude={38}>
				<span class="pin">Pin</span>
			</Marker>
			<Popup longitude={-122} latitude={38}>
				<div class="popup-body">Here</div>
			</Popup>
			<Source id="data" type="geojson" data={{ type: 'Point', coordinates: [0, 0] }}>
				<Layer id="dots" type="circle" paint={{ 'circle-radius': 10 }} />
			</Source>
		</Map>
	</main>
}
