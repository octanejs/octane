// Vendored verbatim from recharts@3.9.2 es6/zIndex/getZIndexFromUnknown.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { isWellBehavedNumber } from '../util/isWellBehavedNumber';
export function getZIndexFromUnknown(input, defaultZIndex) {
  if (input && typeof input === 'object' && 'zIndex' in input && typeof input.zIndex === 'number' && isWellBehavedNumber(input.zIndex)) {
    return input.zIndex;
  }
  return defaultZIndex;
}