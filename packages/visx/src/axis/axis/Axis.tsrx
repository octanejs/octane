import cx from 'classnames';
import { createElement } from 'octane';
import { Group } from '@octanejs/visx/group';
import type { SharedAxisProps, AxisScale } from '../types';
import AxisRenderer from './AxisRenderer.tsrx';
import type { OrientationType } from '../constants/orientation';
import Orientation from '../constants/orientation';
import useAxis from '../react/useAxis.tsrx';

const renderAxis = (axis: Parameters<typeof AxisRenderer>[0]) => createElement(AxisRenderer, axis);

export type AxisProps<Scale extends AxisScale> = SharedAxisProps<Scale> & {
		orientation?: OrientationType;
	};

export default function Axis<Scale extends AxisScale>({
	children = renderAxis,
	axisClassName,
	hideAxisLine = false,
	hideTicks = false,
	hideZero = false,
	innerRef,
	left = 0,
	numTicks = 10,
	orientation = Orientation.bottom,
	rangePadding = 0,
	scale,
	tickFormat,
	tickLength = 8,
	tickValues,
	top = 0,
	...restProps
}: AxisProps<Scale>) {
	const axis = useAxis({
		...restProps,
		hideAxisLine,
		hideTicks,
		hideZero,
		numTicks,
		orientation,
		rangePadding,
		scale,
		tickFormat,
		tickLength,
		tickValues,
	});

	return <Group
		className={cx('visx-axis', axisClassName)}
		innerRef={innerRef}
		top={top}
		left={left}
	>{children(axis)}</Group>;
}
