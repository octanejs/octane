import type { Ref } from '../util/OctaneTypes.ts';

import { arrayTooltipSearcher } from '../state/optionsSlice';
import { defaultPolarChartProps, PolarChart } from './PolarChart.tsrx';
import { PolarChartProps, TooltipEventType } from '../util/types';
import { resolveDefaultProps } from '../util/resolveDefaultProps';

const allowedTooltipTypes: ReadonlyArray<TooltipEventType> = ['item'];

export const defaultPieChartProps = {
	...defaultPolarChartProps,
	layout: 'centric',
	startAngle: 0,
	endAngle: 360,
} as const satisfies Partial<PolarChartProps<never>>;

/**
 * @consumes ResponsiveContainerContext
 * @provides PolarViewBoxContext
 * @provides PolarChartContext
 */
export function PieChart<DataPointType = unknown>(props: PolarChartProps<DataPointType> & {
	ref?: Ref<SVGSVGElement>;
}) {
	const { ref, ...rest } = props;
	const propsWithDefaults = resolveDefaultProps(rest, defaultPieChartProps);
	return <PolarChart
		chartName="PieChart"
		defaultTooltipEventType="item"
		validateTooltipEventTypes={allowedTooltipTypes}
		tooltipPayloadSearcher={arrayTooltipSearcher}
		categoricalChartProps={propsWithDefaults}
		ref={ref}
	/>;
}
