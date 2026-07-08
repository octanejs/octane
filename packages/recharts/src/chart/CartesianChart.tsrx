// Port of chart/CartesianChart.tsx — the store provider + reporter components
// every cartesian chart (BarChart, LineChart, …) shares.
import { RechartsStoreProvider } from '../state/RechartsStoreProvider.tsrx';
import { ChartDataContextProvider } from '../context/chartDataContext.ts';
import { ReportMainChartProps } from '../state/ReportMainChartProps';
import { ReportChartProps } from '../state/ReportChartProps';
import { ReportEventSettings } from '../state/ReportEventSettings';
import { CategoricalChart } from './CategoricalChart.tsrx';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { initialEventSettingsState } from '../state/eventSettingsSlice';

const defaultMargin = { top: 5, right: 5, bottom: 5, left: 5 };

export const defaultCartesianChartProps = {
	accessibilityLayer: true,
	barCategoryGap: '10%',
	barGap: 4,
	layout: 'horizontal',
	margin: defaultMargin,
	responsive: false,
	reverseStackOrder: false,
	stackOffset: 'none',
	syncMethod: 'index',
	...initialEventSettingsState,
};

/**
 * One-time, immutable options deciding chart behavior — usually filled in by
 * the convenience wrappers (BarChart, LineChart, …).
 */
export function CartesianChart(props) @{
	const rootChartProps = resolveDefaultProps(
		props.categoricalChartProps,
		defaultCartesianChartProps,
	);
	const {
		chartName,
		defaultTooltipEventType,
		validateTooltipEventTypes,
		tooltipPayloadSearcher,
		categoricalChartProps,
		ref,
	} = props;
	const options = {
		chartName,
		defaultTooltipEventType,
		validateTooltipEventTypes,
		tooltipPayloadSearcher,
		eventEmitter: undefined,
	};
	<RechartsStoreProvider
		preloadedState={{ options }}
		reduxStoreName={categoricalChartProps.id ?? chartName}
	>
		<ChartDataContextProvider chartData={categoricalChartProps.data} />
		<ReportMainChartProps layout={rootChartProps.layout} margin={rootChartProps.margin} />
		<ReportEventSettings
			throttleDelay={rootChartProps.throttleDelay}
			throttledEvents={rootChartProps.throttledEvents}
		/>
		<ReportChartProps
			baseValue={rootChartProps.baseValue}
			accessibilityLayer={rootChartProps.accessibilityLayer}
			barCategoryGap={rootChartProps.barCategoryGap}
			maxBarSize={rootChartProps.maxBarSize}
			stackOffset={rootChartProps.stackOffset}
			barGap={rootChartProps.barGap}
			barSize={rootChartProps.barSize}
			syncId={rootChartProps.syncId}
			syncMethod={rootChartProps.syncMethod}
			className={rootChartProps.className}
			reverseStackOrder={rootChartProps.reverseStackOrder}
		/>
		<CategoricalChart {...rootChartProps} ref={ref} />
	</RechartsStoreProvider>
}
