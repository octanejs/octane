// Vendored verbatim from recharts@3.9.2 es6/util/getSliced.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export function getSliced(arr, startIndex, endIndex) {
  if (!Array.isArray(arr)) {
    return arr;
  }
  if (arr && startIndex + endIndex !== 0) {
    return arr.slice(startIndex, endIndex + 1);
  }
  return arr;
}