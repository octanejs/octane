import { Map, Marker, Source, Layer, NavigationControl } from '@octanejs/react-map-gl';

export function ServerMap() @{
	<main>
		<h1>Map page</h1>
		<Map id="server-map" style={{ height: '400px' }}>
			<NavigationControl />
			<Marker longitude={-122} latitude={38}>
				<span class="pin">Pin</span>
			</Marker>
			<Source id="my-data" type="geojson" data={{ type: 'Point', coordinates: [0, 0] }}>
				<Layer id="my-layer" type="circle" />
			</Source>
		</Map>
	</main>
}
