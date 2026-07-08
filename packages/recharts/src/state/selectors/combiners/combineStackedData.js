// Vendored verbatim from recharts@3.9.2 es6/state/selectors/combiners/combineStackedData.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { getStackSeriesIdentifier } from '../../../util/stacks/getStackSeriesIdentifier';
export var combineStackedData = (stackGroups, barSettings) => {
	var stackSeriesIdentifier = getStackSeriesIdentifier(barSettings);
	if (!stackGroups || stackSeriesIdentifier == null || barSettings == null) {
		return undefined;
	}
	var stackId = barSettings.stackId;
	if (stackId == null) {
		return undefined;
	}
	var stackGroup = stackGroups[stackId];
	if (!stackGroup) {
		return undefined;
	}
	var stackedData = stackGroup.stackedData;
	if (!stackedData) {
		return undefined;
	}
	return stackedData.find((sd) => sd.key === stackSeriesIdentifier);
};
