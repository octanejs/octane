import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseLineSeriesProps } from './private/BaseLineSeries.tsrx';
import BaseLineSeries from './private/BaseLineSeries.tsrx';
import AnimatedPath from './private/AnimatedPath.tsrx';

export default function AnimatedLineSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: Omit<BaseLineSeriesProps<XScale, YScale, Datum>, 'PathComponent'>) {
	return <BaseLineSeries {...props} PathComponent={AnimatedPath} />;
}
