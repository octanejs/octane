import type { AxisScale } from '@octanejs/visx/axis';
import { Axis as VisxAxis } from '@octanejs/visx/axis';
import type { BaseAxisProps } from './BaseAxis.tsrx';
import BaseAxis from './BaseAxis.tsrx';

export type AxisProps<Scale extends AxisScale = AxisScale> =
	Omit<BaseAxisProps<Scale>, 'AxisComponent'>;

export default function Axis<Scale extends AxisScale = AxisScale>(props: AxisProps<Scale>) {
	return <BaseAxis AxisComponent={VisxAxis} {...props} />;
}
