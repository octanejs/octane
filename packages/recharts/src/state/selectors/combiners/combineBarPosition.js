// Vendored verbatim from recharts@3.9.2 es6/state/selectors/combiners/combineBarPosition.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export var combineBarPosition = (allBarPositions, barSettings) => {
	if (allBarPositions == null || barSettings == null) {
		return undefined;
	}
	var position = allBarPositions.find(
		(p) =>
			p.stackId === barSettings.stackId &&
			barSettings.dataKey != null &&
			p.dataKeys.includes(barSettings.dataKey),
	);
	if (position == null) {
		return undefined;
	}
	return position.position;
};
