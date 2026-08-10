/**
 * Whether a `<Marker>` "has children" decides whether Mapbox draws its default
 * pin or the binding portals custom content into an element of its own. Upstream
 * answers that with `Children.forEach`, which sees through a falsy child; Octane
 * hands the binding an opaque children block that cannot be inspected without
 * evaluating it.
 *
 * The three markers below are the cases that distinguish a correct answer from
 * "any block counts as children".
 */
import { Map, Marker } from '@octanejs/react-map-gl';

export function MarkerChildrenDiff(props: any) @{
	<Map
		mapLib={props.mapLib}
		mapboxAccessToken="test-token"
		initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
	>
		{/* Renders nothing at mount: must fall back to Mapbox's default pin. */}
		<Marker longitude={-122} latitude={38} className="empty-block">
			@if (props.showPin) {
				<span>pin</span>
			}
		</Marker>

		{/* Renders content: the binding owns the element, no default pin. */}
		<Marker longitude={-100} latitude={40} className="filled-block">
			@if (props.showText) {
				<span>just text</span>
			}
		</Marker>

		{/* No children at all: the plain default-pin case. */}
		<Marker longitude={-90} latitude={35} className="no-children" />
	</Map>
}
