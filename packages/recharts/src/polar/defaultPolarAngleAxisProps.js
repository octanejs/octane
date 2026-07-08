// Vendored verbatim from recharts@3.9.2 es6/polar/defaultPolarAngleAxisProps.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
export var defaultPolarAngleAxisProps = {
  allowDecimals: false,
  allowDuplicatedCategory: true,
  // if I set this to false then Tooltip synchronisation stops working in Radar, wtf
  allowDataOverflow: false,
  angle: 0,
  angleAxisId: 0,
  axisLine: true,
  axisLineType: 'polygon',
  cx: 0,
  cy: 0,
  hide: false,
  includeHidden: false,
  label: false,
  niceTicks: 'auto',
  orientation: 'outer',
  reversed: false,
  scale: 'auto',
  tick: true,
  tickLine: true,
  tickSize: 8,
  type: 'auto',
  zIndex: DefaultZIndexes.axis
};