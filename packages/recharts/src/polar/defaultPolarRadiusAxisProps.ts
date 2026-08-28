// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { Props } from './PolarRadiusAxis.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';

export const defaultPolarRadiusAxisProps = {
	allowDataOverflow: false,
	allowDecimals: false,
	allowDuplicatedCategory: true,
	angle: 0,
	axisLine: true,
	includeHidden: false,
	hide: false,
	niceTicks: 'auto',
	label: false,
	orientation: 'right',
	radiusAxisId: 0,
	reversed: false,
	scale: 'auto',
	stroke: '#ccc',
	tick: true,
	tickCount: 5,
	tickLine: true,
	type: 'auto',
	zIndex: DefaultZIndexes.axis,
} as const satisfies Props;
