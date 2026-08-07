// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
import type {
  Map,
  MapOptions,
  Marker,
  MarkerOptions,
  Popup,
  PopupOptions,
  AttributionControl,
  AttributionControlOptions,
  FullscreenControl,
  FullscreenControlOptions,
  GeolocateControl,
  GeolocateControlOptions,
  NavigationControl,
  NavigationControlOptions,
  ScaleControl,
  ScaleControlOptions
} from 'mapbox-gl';

export type {
  ControlPosition,
  IControl,
  Map as MapInstance,
  MapOptions,
  Marker as MarkerInstance,
  MarkerOptions,
  Popup as PopupInstance,
  PopupOptions,
  AttributionControl as AttributionControlInstance,
  AttributionControlOptions,
  FullscreenControl as FullscreenControlInstance,
  FullscreenControlOptions,
  GeolocateControl as GeolocateControlInstance,
  GeolocateControlOptions,
  NavigationControl as NavigationControlInstance,
  NavigationControlOptions,
  ScaleControl as ScaleControlInstance,
  ScaleControlOptions,
  CustomLayerInterface
} from 'mapbox-gl';

/**
 * A user-facing type that represents the minimal intersection between Mapbox and Maplibre
 * User provided `mapLib` is supposed to implement this interface
 * Only losely typed for compatibility
 */
export interface MapLib {
  supported?: (options: any) => boolean;

  Map: {new (options: MapOptions): Map};

  Marker: {new (options: MarkerOptions): Marker};

  Popup: {new (options: PopupOptions): Popup};

  AttributionControl: {new (options: AttributionControlOptions): AttributionControl};

  FullscreenControl: {new (options: FullscreenControlOptions): FullscreenControl};

  GeolocateControl: {new (options: GeolocateControlOptions): GeolocateControl};

  NavigationControl: {new (options: NavigationControlOptions): NavigationControl};

  ScaleControl: {new (options: ScaleControlOptions): ScaleControl};
}
