import type { AxisScale } from '@octanejs/visx/axis';
import AnimatedPath from './private/AnimatedPath.tsrx';
import type { BaseAreaSeriesProps } from './private/BaseAreaSeries.tsrx';
import BaseAreaSeries from './private/BaseAreaSeries.tsrx';

export default function AnimatedAreaSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: Omit<BaseAreaSeriesProps<XScale, YScale, Datum>, 'PathComponent'>) {
	return <BaseAreaSeries {...props} PathComponent={AnimatedPath} />;
}
