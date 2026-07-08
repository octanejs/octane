// Vendored verbatim from recharts@3.9.2 es6/state/selectors/combiners/combineAxisRangeWithReverse.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export var combineAxisRangeWithReverse = (axisSettings, axisRange) => {
	if (!axisSettings || !axisRange) {
		return undefined;
	}
	if (axisSettings !== null && axisSettings !== void 0 && axisSettings.reversed) {
		return [axisRange[1], axisRange[0]];
	}
	return axisRange;
};
