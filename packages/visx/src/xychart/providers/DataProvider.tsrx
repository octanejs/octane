/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScaleConfig, ScaleConfigToD3Scale } from '@octanejs/visx/scale';
import { scaleLinear, scaleOrdinal as createOrdinalScale } from '@octanejs/visx/scale';
import { useContext, useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import type { AxisScaleOutput } from '@octanejs/visx/axis';
import type { ResizeObserverPolyfill } from '@octanejs/visx/responsive';

import type { AxisScale, DataContextType, XYChartTheme } from '../types';
import ThemeContext from '../context/ThemeContext.tsrx';
import DataContext from '../context/DataContext.tsrx';
import useDataRegistry from '../hooks/useDataRegistry.tsrx';
import type { Dimensions } from '../hooks/useDimensions.tsrx';
import useDimensions from '../hooks/useDimensions.tsrx';
import useScales from '../hooks/useScales.tsrx';
import isDiscreteScale from '../utils/isDiscreteScale';
import collectDataRegistryEntries from '../utils/collectDataRegistryEntries';

type ProviderScale<Config extends ScaleConfig<AxisScaleOutput>> =
	ScaleConfigToD3Scale<Config, AxisScaleOutput, any, any>;

/** Props that can be passed to initialize/update the provider config. */
export type DataProviderProps<XScaleConfig extends ScaleConfig<AxisScaleOutput, any, any>, YScaleConfig extends ScaleConfig<AxisScaleOutput, any, any>> = {
	/* Optionally define the initial dimensions. */
	/* Optionally define the initial dimensions. */
	/* Optionally define the initial dimensions. */
	/* Optionally define the initial dimensions. */
	initialDimensions?: Partial<Dimensions>;
	/* Optional chart theme provided by DataProvider, overrides any theme already available in context. */
	theme?: XYChartTheme;
	/* x-scale configuration whose shape depends on scale type. */
	xScale: XScaleConfig;
	/* y-scale configuration whose shape depends on scale type. */
	yScale: YScaleConfig;
	/* Any React children. */
	children: OctaneNode;
	/* Determines whether Series will be plotted horizontally (e.g., horizontal bars). By default this will try to be inferred based on scale types. */
	horizontal?: boolean | 'auto';
	/**
 * Optionally set the resizeObserverPolyfill context, which will be available to
 * ParentSize, Tooltip, and AnnotationLabel components.
 */
	resizeObserverPolyfill?: ResizeObserverPolyfill
};

export default function DataProvider<XScaleConfig extends ScaleConfig<AxisScaleOutput>, YScaleConfig extends ScaleConfig<AxisScaleOutput>, Datum extends object>({
	initialDimensions,
	theme: propsTheme,
	xScale: xScaleConfig,
	yScale: yScaleConfig,
	children,
	horizontal: initialHorizontal = 'auto',
	resizeObserverPolyfill,
}: DataProviderProps<XScaleConfig, YScaleConfig>) {
	// `DataProvider` provides a theme so that `ThemeProvider` is not strictly needed.
	// `props.theme` takes precedent over `context.theme`, which has a default even if
	// a ThemeProvider is not present.
	const contextTheme = useContext(ThemeContext);
	const theme = propsTheme || contextTheme;
	const [{ width, height, margin }, setDimensions] = useDimensions(initialDimensions);
	const innerWidth = Math.max(0, width - margin.left - margin.right);
	const innerHeight = Math.max(0, height - margin.top - margin.bottom);

	const horizontal =
		initialHorizontal === 'auto'
			? isDiscreteScale(yScaleConfig) || yScaleConfig.type === 'time' || yScaleConfig.type === 'utc'
			: initialHorizontal;
	const initialEntries = collectDataRegistryEntries<
		ProviderScale<XScaleConfig>,
		ProviderScale<YScaleConfig>,
		Datum
	>(children);
	const dataRegistry = useDataRegistry<
		ProviderScale<XScaleConfig>,
		ProviderScale<YScaleConfig>,
		Datum
	>(initialEntries);

	const {
		xScale,
		yScale,
	}: {
		xScale?: ProviderScale<XScaleConfig>;
		yScale?: ProviderScale<YScaleConfig>;
	} = useScales({
		dataRegistry,
		xScaleConfig,
		yScaleConfig,
		xRange: [margin.left, Math.max(0, width - margin.right)],
		yRange: [Math.max(0, height - margin.bottom), margin.top],
	});

	const registryKeys = dataRegistry.keys();

	const colorScale = useMemo(
		() => createOrdinalScale({
			domain: registryKeys,
			range: theme.colors,
		}),
		[registryKeys, theme.colors],
	);

	const value: DataContextType<AxisScale, AxisScale, Datum> = useMemo(
		() => ({
			dataRegistry,
			registerData: dataRegistry.registerData,
			unregisterData: dataRegistry.unregisterData,
			xScale: xScale || scaleLinear(),
			yScale: yScale || scaleLinear(),
			colorScale,
			theme,
			width,
			height,
			margin,
			innerWidth,
			innerHeight,
			setDimensions,
			horizontal,
			resizeObserverPolyfill,
		}),
		// everything here should be memoized between renders
		// to avoid child re-renders
		[
			colorScale,
			dataRegistry,
			height,
			horizontal,
			innerHeight,
			innerWidth,
			margin,
			setDimensions,
			theme,
			width,
			xScale,
			yScale,
			resizeObserverPolyfill,
		],
	);

	return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
