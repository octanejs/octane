// Vendored verbatim from recharts@3.9.2 es6/state/selectors/touchSelectors.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createSelector } from 'reselect';
import { selectTooltipState } from './selectTooltipState';
var selectAllTooltipPayloadConfiguration = createSelector([selectTooltipState], tooltipState => tooltipState.tooltipItemPayloads);
export var selectTooltipCoordinate = createSelector([selectAllTooltipPayloadConfiguration, (_state, tooltipIndex) => tooltipIndex, (_state, _tooltipIndex, graphicalItemId) => graphicalItemId], (allTooltipConfigurations, tooltipIndex, graphicalItemId) => {
  if (tooltipIndex == null) {
    return undefined;
  }
  var mostRelevantTooltipConfiguration = allTooltipConfigurations.find(tooltipConfiguration => {
    return tooltipConfiguration.settings.graphicalItemId === graphicalItemId;
  });
  if (mostRelevantTooltipConfiguration == null) {
    return undefined;
  }
  var getPosition = mostRelevantTooltipConfiguration.getPosition;
  if (getPosition == null) {
    return undefined;
  }
  return getPosition(tooltipIndex);
});