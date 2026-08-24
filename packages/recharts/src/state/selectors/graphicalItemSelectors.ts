// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../store';
import { GraphicalItemId } from '../graphicalItemsSlice';
import { AxisId, defaultAxisId } from '../cartesianAxisSlice';

export function selectXAxisIdFromGraphicalItemId(
	state: RechartsRootState,
	id: GraphicalItemId,
): AxisId {
	return (
		state.graphicalItems.cartesianItems.find((item) => item.id === id)?.xAxisId ?? defaultAxisId
	);
}

export function selectYAxisIdFromGraphicalItemId(
	state: RechartsRootState,
	id: GraphicalItemId,
): AxisId {
	return (
		state.graphicalItems.cartesianItems.find((item) => item.id === id)?.yAxisId ?? defaultAxisId
	);
}
