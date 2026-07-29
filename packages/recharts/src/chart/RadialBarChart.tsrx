import { arrayTooltipSearcher } from '../state/optionsSlice';
import { PolarChartProps, TooltipEventType } from '../util/types';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { defaultPolarChartProps, PolarChart } from './PolarChart';

const allowedTooltipTypes: ReadonlyArray<TooltipEventType> = ['axis', 'item'];

export const defaultRadialBarChartProps = {
	...defaultPolarChartProps,
	layout: 'radial',
	startAngle: 0,
	endAngle: 360,
} as const satisfies Partial<PolarChartProps<never>>;

/**
 * @consumes ResponsiveContainerContext
 * @provides PolarViewBoxContext
 * @provides PolarChartContext
 */
export function RadialBarChart(props: PolarChartProps<unknown>) {
	const { ref, ...rest } = props;
	const propsWithDefaults = resolveDefaultProps(rest, defaultRadialBarChartProps);
	return <PolarChart
		chartName="RadialBarChart"
		defaultTooltipEventType="axis"
		validateTooltipEventTypes={allowedTooltipTypes}
		tooltipPayloadSearcher={arrayTooltipSearcher}
		categoricalChartProps={propsWithDefaults}
		ref={ref}
	/>;
}
