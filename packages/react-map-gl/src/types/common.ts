// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
import type {PaddingOptions} from 'mapbox-gl';

export type {
  Point,
  PointLike,
  LngLat,
  LngLatLike,
  LngLatBounds,
  LngLatBoundsLike,
  PaddingOptions,
  GeoJSONFeature as MapGeoJSONFeature
} from 'mapbox-gl';

/* Public */

/** Describes the camera's state */
export type ViewState = {
  /** Longitude at map center */
  longitude: number;
  /** Latitude at map center */
  latitude: number;
  /** Map zoom level */
  zoom: number;
  /** Map rotation bearing in degrees counter-clockwise from north */
  bearing: number;
  /** Map angle in degrees at which the camera is looking at the ground */
  pitch: number;
  /** Dimensions in pixels applied on each side of the viewport for shifting the vanishing point. */
  padding: PaddingOptions;
  /** Center elevation on terrain */
  elevation?: number;
};

export interface ImmutableLike<T> {
  toJS: () => T;
}
