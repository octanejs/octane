// Vendored verbatim from recharts@3.9.2 es6/util/stacks/getStackSeriesIdentifier.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
/**
 * Returns identifier for stack series which is one individual graphical item in the stack.
 * @param graphicalItem - The graphical item representing the series in the stack.
 * @return The identifier for the series in the stack
 */
export function getStackSeriesIdentifier(graphicalItem) {
  return graphicalItem === null || graphicalItem === void 0 ? void 0 : graphicalItem.id;
}