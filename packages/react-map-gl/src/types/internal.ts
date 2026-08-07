// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
// Internal types
import type {Map} from 'mapbox-gl';

export type Transform = Map['transform'];

export type {
  GeoJSONSource as GeoJSONSourceImplementation,
  ImageSource as ImageSourceImplementation,
  CanvasSource as CanvasSourceImplementation,
  VectorTileSource as VectorSourceImplementation,
  RasterTileSource as RasterSourceImplementation,
  RasterDemTileSource as RasterDemSourceImplementation,
  VideoSource as VideoSourceImplementation,
  Source as AnySourceImplementation
} from 'mapbox-gl';
