// Vendored verbatim from recharts@3.9.2 es6/state/reduxDevtoolsJsonStringifyReplacer.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export function reduxDevtoolsJsonStringifyReplacer(key, value) {
  if (value instanceof HTMLElement) {
    return "HTMLElement <".concat(value.tagName, " class=\"").concat(value.className, "\">");
  }
  if (value === window) {
    return 'global.window';
  }
  if (key === 'children' && typeof value === 'object' && value !== null) {
    return '<<CHILDREN>>';
  }
  return value;
}