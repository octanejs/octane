// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { MaybeStackedGraphicalItem } from '../../types/StackedGraphicalItem';
import type { BarPositionPosition } from '../../../util/ChartUtils';
import type { BarWithPosition } from '../barSelectors';

export const combineBarPosition = (
	allBarPositions: ReadonlyArray<BarWithPosition> | undefined,
	barSettings: MaybeStackedGraphicalItem | undefined,
): BarPositionPosition | undefined => {
	if (allBarPositions == null || barSettings == null) {
		return undefined;
	}
	const position = allBarPositions.find(
		(p: BarWithPosition) =>
			p.stackId === barSettings.stackId &&
			barSettings.dataKey != null &&
			p.dataKeys.includes(barSettings.dataKey),
	);
	if (position == null) {
		return undefined;
	}
	return position.position;
};
