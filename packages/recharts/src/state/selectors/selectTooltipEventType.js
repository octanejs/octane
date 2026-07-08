// Vendored verbatim from recharts@3.9.2 es6/state/selectors/selectTooltipEventType.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { useAppSelector } from '../hooks';
export var selectDefaultTooltipEventType = state => state.options.defaultTooltipEventType;
export var selectValidateTooltipEventTypes = state => state.options.validateTooltipEventTypes;
export function combineTooltipEventType(shared, defaultTooltipEventType, validateTooltipEventTypes) {
  if (shared == null) {
    return defaultTooltipEventType;
  }
  var eventType = shared ? 'axis' : 'item';
  if (validateTooltipEventTypes == null) {
    return defaultTooltipEventType;
  }
  return validateTooltipEventTypes.includes(eventType) ? eventType : defaultTooltipEventType;
}
export function selectTooltipEventType(state, shared) {
  var defaultTooltipEventType = selectDefaultTooltipEventType(state);
  var validateTooltipEventTypes = selectValidateTooltipEventTypes(state);
  return combineTooltipEventType(shared, defaultTooltipEventType, validateTooltipEventTypes);
}
export function useTooltipEventType(shared) {
  return useAppSelector(state => selectTooltipEventType(state, shared));
}