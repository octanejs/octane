import type { CartesianChartProps } from '../util/types';
import type { Ref } from '../util/OctaneTypes.ts';
import type { TooltipEventType } from '../util/types';

// Port of chart/BarChart.tsx.
import { arrayTooltipSearcher } from '../state/optionsSlice';
import { CartesianChart } from './CartesianChart.tsrx';

const allowedTooltipTypes: ReadonlyArray<TooltipEventType> = ['axis', 'item'];

/**
 * @consumes ResponsiveContainerContext
 * @provides CartesianViewBoxContext
 * @provides CartesianChartContext
 */
export function BarChart<DataPointType = unknown>(props: CartesianChartProps<DataPointType> & {
	ref?: Ref<SVGSVGElement>;
}) {
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
