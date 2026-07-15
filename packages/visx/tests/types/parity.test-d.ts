type Extends<Actual, Expected> = [Actual] extends [Expected] ? true : false;
type Equal<Left, Right> =
	Extends<Left, Right> extends true ? (Extends<Right, Left> extends true ? true : false) : false;
type Assert<Value extends true> = Value;

type Local = typeof import('@octanejs/visx');
type Upstream = typeof import('@visx/visx');

type _Annotation = Assert<
	Equal<
		Omit<Local['Annotation'], 'AnnotationContext'>,
		Omit<Upstream['Annotation'], 'AnnotationContext'>
	>
>;
type _Axis = Assert<Equal<Local['Axis'], Upstream['Axis']>>;
type _Bounds = Assert<
	Equal<Omit<Local['Bounds'], 'withBoundingRects'>, Omit<Upstream['Bounds'], 'withBoundingRects'>>
>;
type _FunctionalWithBoundingRects = Assert<
	Equal<
		Local['Bounds']['withBoundingRects'],
		<Props extends object = {}>(
			BaseComponent: import('react').ComponentType<Props>,
		) => import('react').ComponentType<Props>
	>
>;
type _ClipPath = Assert<Extends<Local['ClipPath'], Upstream['ClipPath']>>;
type _Curve = Assert<Equal<Local['Curve'], Upstream['Curve']>>;
type _Drag = Assert<Equal<Local['Drag'], Upstream['Drag']>>;
type _Event = Assert<Equal<Local['Event'], Upstream['Event']>>;
type _Geo = Assert<Equal<Local['Geo'], Upstream['Geo']>>;
type _Glyph = Assert<Equal<Local['Glyph'], Upstream['Glyph']>>;
type _Gradient = Assert<Extends<Local['Gradient'], Upstream['Gradient']>>;
type _Grid = Assert<Equal<Local['Grid'], Upstream['Grid']>>;
type _Group = Assert<Equal<Local['Group'], Upstream['Group']>>;
type _Heatmap = Assert<Equal<Local['Heatmap'], Upstream['Heatmap']>>;
type _Hierarchy = Assert<Equal<Local['Hierarchy'], Upstream['Hierarchy']>>;
type _Legend = Assert<Equal<Local['Legend'], Upstream['Legend']>>;
type _Marker = Assert<Extends<Local['Marker'], Upstream['Marker']>>;
type _MockData = Assert<Equal<Local['MockData'], Upstream['MockData']>>;
type _Network = Assert<Equal<Local['Network'], Upstream['Network']>>;
type _Pattern = Assert<Extends<Local['Pattern'], Upstream['Pattern']>>;
type _Point = Assert<Equal<Local['Point'], Upstream['Point']>>;
type _ResponsiveParentSize = Assert<
	Equal<Local['Responsive']['ParentSize'], Upstream['Responsive']['ParentSize']>
>;
type _ResponsiveScaleSvg = Assert<
	Equal<Local['Responsive']['ScaleSVG'], Upstream['Responsive']['ScaleSVG']>
>;
type _ResponsiveUseParentSize = Assert<
	Equal<Local['Responsive']['useParentSize'], Upstream['Responsive']['useParentSize']>
>;
type _ResponsiveUseScreenSize = Assert<
	Equal<Local['Responsive']['useScreenSize'], Upstream['Responsive']['useScreenSize']>
>;
type _ResponsiveDebounce = Assert<
	Equal<Local['Responsive']['debounce'], Upstream['Responsive']['debounce']>
>;
type _Scale = Assert<Equal<Local['Scale'], Upstream['Scale']>>;
type LocalReleasedShape = Omit<Local['Shape'], 'arcPath' | 'areaPath' | 'linePath'>;
type _Shape = Assert<Equal<LocalReleasedShape, Upstream['Shape']>>;
type _Text = Assert<Equal<Local['Text'], Upstream['Text']>>;
type _Threshold = Assert<Extends<Local['Threshold'], Upstream['Threshold']>>;
type _TooltipUse = Assert<Equal<Local['Tooltip']['useTooltip'], Upstream['Tooltip']['useTooltip']>>;
type _TooltipInPortal = Assert<
	Equal<Local['Tooltip']['useTooltipInPortal'], Upstream['Tooltip']['useTooltipInPortal']>
>;
type _TooltipPosition = Assert<
	Equal<Local['Tooltip']['useTooltipPosition'], Upstream['Tooltip']['useTooltipPosition']>
>;
type _TooltipStyles = Assert<
	Equal<Local['Tooltip']['defaultStyles'], Upstream['Tooltip']['defaultStyles']>
>;
type _TooltipWithBounds = Assert<
	Equal<Local['Tooltip']['TooltipWithBounds'], Upstream['Tooltip']['TooltipWithBounds']>
>;
type _Voronoi = Assert<Equal<Local['Voronoi'], Upstream['Voronoi']>>;
type _Wordcloud = Assert<Equal<Local['Wordcloud'], Upstream['Wordcloud']>>;
type _XYChart = Assert<
	Equal<
		Omit<
			Local['XYChart'],
			'DataContext' | 'EventEmitterContext' | 'ThemeContext' | 'TooltipContext'
		>,
		Omit<
			Upstream['XYChart'],
			'DataContext' | 'EventEmitterContext' | 'ThemeContext' | 'TooltipContext'
		>
	>
>;
type _Zoom = Assert<Equal<Local['Zoom'], Upstream['Zoom']>>;

type _Chord = Assert<Equal<typeof import('@octanejs/visx/chord'), typeof import('@visx/chord')>>;
type _Delaunay = Assert<
	Equal<typeof import('@octanejs/visx/delaunay'), typeof import('@visx/delaunay')>
>;
type _ReactSpring = Assert<
	Equal<typeof import('@octanejs/visx/react-spring'), typeof import('@visx/react-spring')>
>;
type _Sankey = Assert<Equal<typeof import('@octanejs/visx/sankey'), typeof import('@visx/sankey')>>;
type _Stats = Assert<Equal<typeof import('@octanejs/visx/stats'), typeof import('@visx/stats')>>;

import type { AnnotationContextType as LocalAnnotationContextType } from '@octanejs/visx/annotation';
import type { AnnotationContextType as UpstreamAnnotationContextType } from '@visx/annotation';
import type { BrushProps as LocalBrushProps } from '@octanejs/visx/brush';
import type { BrushProps as UpstreamBrushProps } from '@visx/brush';
import type {
	TooltipPositionContextType as LocalTooltipPositionContextType,
	PortalProps as LocalPortalProps,
	TooltipProps as LocalTooltipProps,
	WithTooltipProvidedProps as LocalWithTooltipProvidedProps,
} from '@octanejs/visx/tooltip';
import type {
	TooltipPositionContextType as UpstreamTooltipPositionContextType,
	PortalProps as UpstreamPortalProps,
	TooltipProps as UpstreamTooltipProps,
	WithTooltipProvidedProps as UpstreamWithTooltipProvidedProps,
} from '@visx/tooltip';
import type { DataContextType as LocalDataContextType } from '@octanejs/visx/xychart';
import type { DataContextType as UpstreamDataContextType } from '@visx/xychart';

type _AnnotationContextValue = Assert<
	Equal<LocalAnnotationContextType, UpstreamAnnotationContextType>
>;
type _BrushProps = Assert<Equal<LocalBrushProps, Omit<UpstreamBrushProps, 'innerRef'>>>;
type _TooltipPositionContextValue = Assert<
	Equal<LocalTooltipPositionContextType, UpstreamTooltipPositionContextType>
>;
type _PortalProps = Assert<Equal<LocalPortalProps, UpstreamPortalProps>>;
type _TooltipProps = Assert<Equal<LocalTooltipProps, UpstreamTooltipProps>>;
type _WithTooltipProvidedProps = Assert<
	Equal<LocalWithTooltipProvidedProps<unknown>, UpstreamWithTooltipProvidedProps<unknown>>
>;
type _DataContextValue = Assert<
	Equal<LocalDataContextType<any, any, any>, UpstreamDataContextType<any, any, any>>
>;

// Current-master entries are not registry-published yet. These imports pin all
// value and type-bearing subpaths so declaration generation cannot silently
// drop their public types while runtime key parity is checked by exports.test.ts.
import type {
	ChartA11yConfig,
	ChartA11yKeyboardState,
	NormalizedChartA11yData,
} from '@octanejs/visx/a11y';
import type { UseChartA11yResult } from '@octanejs/visx/a11y/react';
import type { ChartA11ySeriesConfig } from '@octanejs/visx/a11y/server';
import type { UseAxisOptions } from '@octanejs/visx/axis/react';
import type { ChartConfig, ChartDimensions } from '@octanejs/visx/chart';
import type { Accessor, FormatNumberOptions, PathBuilder } from '@octanejs/visx/kernel';
import type { PieArcDatum, UsePieResult } from '@octanejs/visx/shape/react';
import type { ThemeScopeProps } from '@octanejs/visx/theme';
import type { ChartTheme } from '@octanejs/visx/chart';
import type { AxisStyleProps, ThemeProviderProps } from '@octanejs/visx/theme/react';
import type { ChartTooltipItem, UseChartTooltipReturn } from '@octanejs/visx/tooltip/floating';
import type { UseVoronoiOptions } from '@octanejs/visx/voronoi/react';

declare const typePins: [
	ChartA11yConfig<unknown>,
	ChartA11yKeyboardState,
	NormalizedChartA11yData<unknown>,
	UseChartA11yResult<unknown>,
	ChartA11ySeriesConfig<unknown>,
	UseAxisOptions<any>,
	ChartConfig,
	ChartDimensions,
	Accessor<unknown, unknown>,
	FormatNumberOptions,
	PathBuilder,
	PieArcDatum<unknown>,
	UsePieResult<unknown>,
	ChartTheme,
	ThemeScopeProps,
	AxisStyleProps,
	ThemeProviderProps,
	ChartTooltipItem,
	UseChartTooltipReturn,
	UseVoronoiOptions<unknown>,
];
void typePins;
