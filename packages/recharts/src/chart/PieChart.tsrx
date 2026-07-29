import { arrayTooltipSearcher } from '../state/optionsSlice';
import { defaultPolarChartProps, PolarChart } from './PolarChart';
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
export function PieChart(props: PolarChartProps<unknown>) {
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
