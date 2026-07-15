import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseBarSeriesProps } from './private/BaseBarSeries.tsrx';
import BaseBarSeries from './private/BaseBarSeries.tsrx';
import Bars from './private/Bars.tsrx';

function BarSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	colorAccessor,
	...props
}: Omit<BaseBarSeriesProps<XScale, YScale, Datum>, 'BarsComponent'>) {
	return <BaseBarSeries {...props} colorAccessor={colorAccessor} BarsComponent={Bars} />;
}

export default BarSeries
