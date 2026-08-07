/**
 * Overlays that already exist and then change: a popup whose options are edited
 * in place, and controls added to and removed from a live map. Both bindings
 * diff against the previous props and push the difference onto the library
 * instance, so this is where a diff that is too eager or too lazy shows up.
 */
import { Map, NavigationControl, Popup, ScaleControl } from '@octanejs/react-map-gl';
import { useRef, useState } from 'octane';

export function OverlayDiff(props: any) @{
	const [wide, setWide] = useState(false);
	const [showNav, setShowNav] = useState(true);
	const [showScale, setShowScale] = useState(false);
	const [options, setOptions] = useState('');
	const popupRef = useRef<any>(null);

	<div>
		<button id="widen" onClick={() => setWide(true)}>widen</button>
		<button id="drop-nav" onClick={() => setShowNav(false)}>drop nav</button>
		<button id="add-scale" onClick={() => setShowScale(true)}>add scale</button>
		<button
			id="read-options"
			onClick={() => setOptions(
				JSON.stringify({
					maxWidth: popupRef.current?.options?.maxWidth ?? null,
					offset: popupRef.current?.options?.offset ?? null,
				}),
			)}
		>read options</button>
		<pre id="popup-options">{options as string}</pre>
		<Map
			mapLib={props.mapLib}
			mapboxAccessToken="test-token"
			initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
		>
			@if (showNav) {
				<NavigationControl />
			}
			@if (showScale) {
				<ScaleControl />
			}
			<Popup
				ref={popupRef}
				longitude={-100}
				latitude={40}
				className={wide ? 'note wide' : 'note'}
				maxWidth={wide ? '320px' : '160px'}
				offset={wide ? 24 : 12}
			>
				<div class="popup-body">Here</div>
			</Popup>
		</Map>
	</div>
}
