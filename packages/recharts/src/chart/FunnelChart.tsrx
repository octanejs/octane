import type { Ref } from '../util/OctaneTypes.ts';

import { arrayTooltipSearcher } from '../state/optionsSlice';
import { CartesianChart } from './CartesianChart.tsrx';
import { CartesianChartProps, TooltipEventType } from '../util/types';

const allowedTooltipTypes: ReadonlyArray<TooltipEventType> = ['item'];

/**
 * @consumes ResponsiveContainerContext
 * @provides CartesianViewBoxContext
 * @provides CartesianChartContext
 */
export function FunnelChart<DataPointType = unknown>(props: CartesianChartProps<DataPointType> & {
	ref?: Ref<SVGSVGElement>;
}) {
	const { ref, ...rest } = props;
	return <CartesianChart
		chartName="FunnelChart"
		defaultTooltipEventType="item"
		validateTooltipEventTypes={allowedTooltipTypes}
		tooltipPayloadSearcher={arrayTooltipSearcher}
		categoricalChartProps={rest}
		ref={ref}
	/>;
}
