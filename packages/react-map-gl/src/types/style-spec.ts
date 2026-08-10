// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
/*
 * Mapbox Style Specification types
 */
export type CanvasSourceSpecification = {
  type: 'canvas';
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  animate?: boolean;
  canvas: string | HTMLCanvasElement;
};

export type {
  // Layers
  LayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  CircleLayerSpecification,
  HeatmapLayerSpecification,
  FillExtrusionLayerSpecification,
  RasterLayerSpecification,
  RasterParticleLayerSpecification,
  HillshadeLayerSpecification,
  ModelLayerSpecification,
  BackgroundLayerSpecification,
  SkyLayerSpecification,
  SlotLayerSpecification,
  ClipLayerSpecification,

  // Sources
  SourceSpecification,
  VectorSourceSpecification,
  RasterSourceSpecification,
  RasterDEMSourceSpecification,
  RasterArraySourceSpecification,
  GeoJSONSourceSpecification,
  VideoSourceSpecification,
  ImageSourceSpecification,
  ModelSourceSpecification,

  // Style
  StyleSpecification,
  LightSpecification,
  FogSpecification,
  TerrainSpecification,
  ProjectionSpecification
} from 'mapbox-gl';
