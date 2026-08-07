import { Map, Marker } from '@octanejs/react-map-gl';
import type { MapProps } from '@octanejs/react-map-gl';
import { useEffect, useState } from 'octane';

export function PlainMap(props: MapProps) @{
	<Map {...props} />
}

/**
 * A marker child that is present from the first render but produces no DOM
 * until its own effect runs — the shape a spinner, a lazily resolved label, or
 * anything with an async first paint takes. Upstream sees a truthy child here
 * and gives the marker a binding-owned element regardless of what that child
 * renders, so this is the case where "did the block produce DOM yet?" and "does
 * this marker have children?" disagree.
 */
function LateContent() @{
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);
	}, []);

	<>
		@if (ready) {
			<span id="late-content">late</span>
		}
	</>
}

/** A marker whose content and class list are both driven from outside. */
export function ToggleContentMarkerMap(props: MapProps & Record<string, any>) @{
	<Map {...props}>
		<Marker longitude={-122} latitude={38} ref={props.markerRef} className={props.markerClassName}>
			@if (props.showContent) {
				<span id="toggled-content">here</span>
			}
		</Marker>
	</Map>
}

export function LateMarkerMap(props: MapProps & Record<string, any>) @{
	<Map {...props}>
		<Marker longitude={-122} latitude={38} ref={props.markerRef} onClick={props.onMarkerClick}>
			<LateContent />
		</Marker>
	</Map>
}
