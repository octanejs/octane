// Port of chart/BarChart.tsx.
import { arrayTooltipSearcher } from '../state/optionsSlice';
import { CartesianChart } from './CartesianChart.tsrx';

const allowedTooltipTypes = ['axis', 'item'];

/**
 * @consumes ResponsiveContainerContext
 * @provides CartesianViewBoxContext
 * @provides CartesianChartContext
 */
export function BarChart(props) {
	const { ref, ...rest } = props;
	return <CartesianChart
		chartName="BarChart"
		defaultTooltipEventType="axis"
		validateTooltipEventTypes={allowedTooltipTypes}
		tooltipPayloadSearcher={arrayTooltipSearcher}
		categoricalChartProps={rest}
		ref={ref}
	/>;
}
