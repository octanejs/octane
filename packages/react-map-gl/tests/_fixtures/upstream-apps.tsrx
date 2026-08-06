/**
 * `.tsrx` re-authorings of the component trees in
 * upstream/test/components/*.spec.jsx. Each fixture keeps the upstream prop
 * shape so the ported assertions stay comparable; the specs cite their origin.
 */
import {
	AttributionControl,
	FullscreenControl,
	GeolocateControl,
	Layer,
	Map,
	MapProvider,
	Marker,
	NavigationControl,
	Popup,
	ScaleControl,
	Source,
	useMap,
} from '@octanejs/react-map-gl';
import type { MapProps } from '@octanejs/react-map-gl';
import { useState } from 'octane';

export type MapFixtureProps = MapProps & Record<string, any>;

// ── map.spec.jsx ───────────────────────────────────────────────────────────

export function BareMap(props: MapFixtureProps) @{
	<Map {...props} />
}

/** Per upstream/test/components/map.spec.jsx:145 — settings arrive after load. */
export function DelayedSettingsMap(props: MapFixtureProps) @{
	const [settings, setSettings] = useState<{ maxPitch: number }>({ maxPitch: 85 });

	const onLoad = () => {
		setTimeout(() => setSettings({ maxPitch: 60 }), 0);
	};

	<Map {...props} {...settings} onLoad={onLoad} />
}

/** Per upstream/test/components/map.spec.jsx:203 — view state mirrored back. */
export function MirrorBackMap(props: MapFixtureProps) @{
	const [viewState, setViewState] = useState({ longitude: -100, latitude: 40, zoom: 4 });

	<Map
		{...props}
		{...viewState}
		onMove={(e: any) => {
			setViewState(e.viewState);
			props.onViewState?.(e.viewState);
		}}
	/>
}

// ── marker.spec.jsx ────────────────────────────────────────────────────────

export function MarkerMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Marker {...props.markerProps} />
	</Map>
}

export function MarkerWithContentMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Marker {...props.markerProps}>
			<div id="marker-content" />
		</Marker>
	</Map>
}

// ── popup.spec.jsx ─────────────────────────────────────────────────────────

/**
 * Upstream re-renders one tree with different popup props, so the popup instance
 * survives across updates. Content selection is a prop here rather than a second
 * component, because swapping the root component would remount the popup and the
 * "options are updated in place" assertions would silently pass against a fresh
 * instance.
 */
export function PopupMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Popup {...props.popupProps}>
			@if (props.richContent) {
				<div id="popup-content">You are here</div>
			} @else {
				{
					'You are here';
				}
			}
		</Popup>
	</Map>
}

/** A popup and a marker that can leave the tree while the map stays mounted. */
export function ToggleChildrenMap(props: MapFixtureProps) @{
	<Map {...props}>
		@if (props.showPopup) {
			<Popup longitude={-122} latitude={38}>
				<div id="popup-content">Here</div>
			</Popup>
		}
		@if (props.showMarker) {
			<Marker longitude={-122} latitude={38}>
				<span id="marker-content">Pin</span>
			</Marker>
		}
	</Map>
}

// ── source.spec.jsx / layer.spec.jsx ───────────────────────────────────────

export function SourceMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Source {...props.sourceProps} />
	</Map>
}

export function SourceLayerMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Source {...props.sourceProps}>
			<Layer {...props.layerProps} />
		</Source>
	</Map>
}

function LayerWrapper(props: MapFixtureProps) @{
	<>
		<Layer {...props.layerProps} />
	</>
}

/**
 * The layer sits below a wrapper component instead of being a direct child of
 * the source. This is the shape that separates the two id-injection models:
 * upstream's `cloneElement` only reaches direct children, so it would leave this
 * layer's source unset, while a context reaches any descendant.
 */
export function NestedLayerMap(props: MapFixtureProps) @{
	<Map {...props}>
		<Source {...props.sourceProps}>
			<LayerWrapper layerProps={props.layerProps} />
		</Source>
	</Map>
}

// ── controls.spec.jsx ──────────────────────────────────────────────────────

export function AttributionControlMap(props: MapFixtureProps) @{
	<Map {...props}>
		<AttributionControl />
	</Map>
}

export function FullscreenControlMap(props: MapFixtureProps) @{
	<Map {...props}>
		<FullscreenControl />
	</Map>
}

export function GeolocateControlMap(props: MapFixtureProps) @{
	<Map {...props}>
		<GeolocateControl ref={props.controlRef} />
	</Map>
}

export function NavigationControlMap(props: MapFixtureProps) @{
	<Map {...props}>
		<NavigationControl />
	</Map>
}

export function ScaleControlMap(props: MapFixtureProps) @{
	<Map {...props}>
		<ScaleControl {...props.scaleProps} />
	</Map>
}

// ── use-map.spec.jsx ───────────────────────────────────────────────────────

function MapCollectionProbe(props: { onMaps: (maps: any) => void }) {
	const maps = useMap();
	props.onMaps(maps);
	return null;
}

export function TwoMapsProvider(props: MapFixtureProps) @{
	<MapProvider>
		<Map id="mapA" {...props.mapA} />
		<Map id="mapB" {...props.mapB} />
		<MapCollectionProbe onMaps={props.onMaps} />
	</MapProvider>
}

export function OneMapProvider(props: MapFixtureProps) @{
	<MapProvider>
		<Map id="mapA" {...props.mapA} />
		<MapCollectionProbe onMaps={props.onMaps} />
	</MapProvider>
}

export function NoMapProvider(props: MapFixtureProps) @{
	<MapProvider>
		<MapCollectionProbe onMaps={props.onMaps} />
	</MapProvider>
}

/** The probe sits inside the map, so `useMap().current` resolves to it. */
export function EnclosingMapProbe(props: MapFixtureProps) @{
	<MapProvider>
		<Map id="mapA" {...props.mapA}>
			<MapCollectionProbe onMaps={props.onMaps} />
		</Map>
	</MapProvider>
}

/** Two maps registering under one id — a programming error, not a map failure. */
export function DuplicateIdProvider(props: MapFixtureProps) @{
	<MapProvider>
		<Map id="dup" {...props.mapA} />
		<Map id="dup" {...props.mapB} />
	</MapProvider>
}
