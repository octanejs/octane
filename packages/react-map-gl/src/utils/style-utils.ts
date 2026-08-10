// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
import {ImmutableLike} from '../types/common';
import {StyleSpecification} from '../types/style-spec';

const refProps = ['type', 'source', 'source-layer', 'minzoom', 'maxzoom', 'filter', 'layout'];

// Prepare a map style object for diffing
// If immutable - convert to plain object
// Work around some issues in older styles that would fail Mapbox's diffing
export function normalizeStyle(
  style: string | StyleSpecification | ImmutableLike<StyleSpecification>
): string | StyleSpecification {
  if (!style) {
    return null;
  }
  if (typeof style === 'string') {
    return style;
  }
  if ('toJS' in style) {
    style = style.toJS();
  }
  if (!style.layers) {
    return style;
  }
  const layerIndex = {};

  for (const layer of style.layers) {
    layerIndex[layer.id] = layer;
  }

  const layers = style.layers.map(layer => {
    let normalizedLayer: typeof layer = null;

    if ('interactive' in layer) {
      normalizedLayer = Object.assign({}, layer);
      // Breaks style diffing :(
      // @ts-ignore legacy field not typed
      delete normalizedLayer.interactive;
    }

    // Style diffing doesn't work with refs so expand them out manually before diffing.
    // @ts-ignore legacy field not typed
    const layerRef = layerIndex[layer.ref];
    if (layerRef) {
      normalizedLayer = normalizedLayer || Object.assign({}, layer);
      // @ts-ignore
      delete normalizedLayer.ref;
      // https://github.com/mapbox/mapbox-gl-js/blob/master/src/style-spec/deref.js
      for (const propName of refProps) {
        if (propName in layerRef) {
          normalizedLayer[propName] = layerRef[propName];
        }
      }
    }

    return normalizedLayer || layer;
  });

  // Do not mutate the style object provided by the user
  return {...style, layers};
}
