import { memo, useEffect, useImperativeHandle, useRef } from 'octane';
import { applyReactStyle } from '../utils/apply-react-style';
import { useControl } from './use-control';

import type {
	ControlPosition,
	GeolocateControlInstance,
	GeolocateControlOptions,
} from '../types/lib';
import type { GeolocateEvent, GeolocateResultEvent, GeolocateErrorEvent } from '../types/events';
import type { CSSProperties, Ref } from '../types/octane';

export type GeolocateControlProps = GeolocateControlOptions & {
	/** Placement of the control relative to the map. */
	position?: ControlPosition;
	/** CSS style override, applied to the control's container */
	style?: CSSProperties;

	/** Called on each Geolocation API position update that returned as success. */
	onGeolocate?: (e: GeolocateResultEvent) => void;
	/** Called on each Geolocation API position update that returned as an error. */
	onError?: (e: GeolocateErrorEvent) => void;
	/** Called on each Geolocation API position update that returned as success but user position
	 * is out of map `maxBounds`. */
	onOutOfMaxBounds?: (e: GeolocateResultEvent) => void;
	/** Called when the GeolocateControl changes to the active lock state. */
	onTrackUserLocationStart?: (e: GeolocateEvent) => void;
	/** Called when the GeolocateControl changes to the background state. */
	onTrackUserLocationEnd?: (e: GeolocateEvent) => void;
	/** Octane passes refs as ordinary props; there is no forwardRef. */
	ref?: Ref<GeolocateControlInstance>;
};

function _GeolocateControl(props: GeolocateControlProps) {
	const thisRef = useRef({ props });

	const ctrl = useControl(
		({ mapLib }) => {
			const gc = new mapLib.GeolocateControl(props);

			// Hack: fix GeolocateControl reuse
			// GeolocateControl's UI creation is asynchronous. Removing and adding it back
			// causes the UI to be initialized twice.
			//
			// Upstream reaches for this because React strict mode mounts the component
			// twice. Octane has no StrictMode double-invoke, so the guard is inert here;
			// it is kept because it is also correct for an ordinary remount, and deleting
			// upstream behavior on a technicality is how ports drift.
			const setupUI = gc._setupUI.bind(gc);
			gc._setupUI = (args) => {
				if (!gc._container.hasChildNodes()) {
					setupUI(args);
				}
			};

			gc.on('geolocate', (e) => {
				thisRef.current.props.onGeolocate?.(e as GeolocateResultEvent);
			});
			gc.on('error', (e) => {
				thisRef.current.props.onError?.(e as GeolocateErrorEvent);
			});
			gc.on('outofmaxbounds', (e) => {
				thisRef.current.props.onOutOfMaxBounds?.(e as GeolocateResultEvent);
			});
			gc.on('trackuserlocationstart', (e) => {
				thisRef.current.props.onTrackUserLocationStart?.(e as GeolocateEvent);
			});
			gc.on('trackuserlocationend', (e) => {
				thisRef.current.props.onTrackUserLocationEnd?.(e as GeolocateEvent);
			});

			return gc;
		},
		{ position: props.position },
	);

	thisRef.current.props = props;

	useImperativeHandle(props.ref, () => ctrl, []);

	useEffect(() => {
		applyReactStyle(ctrl._container, props.style);
	}, [props.style]);

	return null;
}

export const GeolocateControl = memo(_GeolocateControl);
