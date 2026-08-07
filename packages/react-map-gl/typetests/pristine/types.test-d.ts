// Pristine side: the published @vis.gl/react-mapbox 8.1.2 typings, compiled
// with plain tsc. Assertion groups are listed in ../assertions.md and must stay
// one-for-one with ../adapted/types.test-d.ts.
import type { CSSProperties } from 'react';
import {
	Layer,
	Map,
	Marker,
	Source,
	useControl,
	useMap,
	type LayerProps,
	type MapProps,
	type MarkerProps,
	type SourceProps,
} from '@vis.gl/react-mapbox';

// 1. Map accepts view-state props and a container style.
const mapProps: MapProps = {
	longitude: -122,
	latitude: 38,
	zoom: 14,
	style: { height: 400 } satisfies CSSProperties,
};
void mapProps;
void Map;

// 2. Map rejects an unknown prop.
// @ts-expect-error unknown prop
const badMapProps: MapProps = { notAMapProp: true };
void badMapProps;

// 3. Marker requires longitude and latitude.
const markerProps: MarkerProps = { longitude: -122, latitude: 38 };
void markerProps;
void Marker;
// @ts-expect-error latitude is required
const missingLatitude: MarkerProps = { longitude: -122 };
void missingLatitude;

// 4. Marker rejects a string coordinate.
// @ts-expect-error longitude must be a number
const stringCoordinate: MarkerProps = { longitude: '-122', latitude: 38 };
void stringCoordinate;

// 5. Source requires a discriminated type.
const sourceProps: SourceProps = {
	id: 'a',
	type: 'geojson',
	data: { type: 'Point', coordinates: [0, 0] },
};
void sourceProps;
void Source;
// @ts-expect-error type is required
const untypedSource: SourceProps = { id: 'a' };
void untypedSource;

// 6. Layer accepts an omitted id.
const layerProps: LayerProps = { type: 'circle' };
void layerProps;
void Layer;

// 7. useControl returns the created control's type.
declare const control: { onAdd(): HTMLElement; onRemove(): void; marker: 'yes' };
const created = useControl(() => control);
const controlMarker: 'yes' = created.marker;
void controlMarker;

// 8. useMap returns a collection indexed by id.
declare function useMapProbe(): void;
void useMapProbe;
const maps = useMap();
void maps.current;
void maps['some-id'];
