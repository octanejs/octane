// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { MaybeStackedGraphicalItem } from './StackedGraphicalItem';
import { BasePolarGraphicalItemSettings } from '../graphicalItemsSlice';

export interface RadialBarSettings
	extends BasePolarGraphicalItemSettings, MaybeStackedGraphicalItem {
	type: 'radialBar';
	minPointSize: number;
	maxBarSize: number | undefined;
}
