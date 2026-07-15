import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseBarSeriesProps } from './private/BaseBarSeries.tsrx';
import BaseBarSeries from './private/BaseBarSeries.tsrx';
import AnimatedBars from './private/AnimatedBars.tsrx';

export default function AnimatedBarSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	colorAccessor,
	...props
}: Omit<BaseBarSeriesProps<XScale, YScale, Datum>, 'BarsComponent'>) {
	return <BaseBarSeries
		{...props}
		colorAccessor={colorAccessor as BaseBarSeriesProps<XScale, YScale, object>['colorAccessor']}
		BarsComponent={AnimatedBars}
	/>;
}
