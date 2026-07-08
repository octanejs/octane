// Vendored verbatim from recharts@3.9.2 es6/util/getClassNameFromUnknown.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export function getClassNameFromUnknown(u) {
  if (u && typeof u === 'object' && 'className' in u && typeof u.className === 'string') {
    return u.className;
  }
  return '';
}