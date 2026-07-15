import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseAreaSeriesProps } from './private/BaseAreaSeries.tsrx';
import BaseAreaSeries from './private/BaseAreaSeries.tsrx';

export default function AreaSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: Omit<BaseAreaSeriesProps<XScale, YScale, Datum>, 'PathComponent'>) {
	return <BaseAreaSeries {...props} />;
}
