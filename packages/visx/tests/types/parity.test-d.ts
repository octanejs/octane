type Extends<Actual, Expected> = [Actual] extends [Expected] ? true : false;
type Equal<Left, Right> =
	Extends<Left, Right> extends true ? (Extends<Right, Left> extends true ? true : false) : false;
type Assert<Value extends true> = Value;

type Local = typeof import('@octanejs/visx');
type Upstream = typeof import('@visx/visx');

// OCTANE DIVERGENCE: props upstream types as `React.ReactNode` are octane
// renderables (`OctaneNode` = `unknown`) in this port — octane elements are
// nominal, so a ReactNode-typed prop would reject them. Prop positions are
// contravariant in a component's function type, so modules whose components
// carry renderable props assert `Extends<Local, Upstream>` (every upstream
// call site still type-checks against the local component); modules without
// renderable props keep exact `Equal`.
type _Annotation = Assert<
	Extends<
		Omit<Local['Annotation'], 'AnnotationContext'>,
		Omit<Upstream['Annotation'], 'AnnotationContext'>
	>
>;
// Some components take a render-prop (`children: (renderProps) => ReactNode`)
// whose renderProps THEMSELVES carry renderable members — the OctaneNode
// divergence then appears on both sides of the variance, so no single
// assignability direction can hold for the whole component. For those, compare
// props with every renderable hole collapsed on BOTH sides: members typed
// `ReactNode` (upstream) or `unknown` (local) normalize to `unknown`, function
// members normalize their return the same way and their props parameter
// recursively (multi-parameter render functions, e.g. Pie's `centroid`, keep
// their parameter tuple exact and collapse only the return); everything else
// must match exactly.
type ComponentProps<C> = C extends (props: infer P) => any ? P : never;
type IsUnknown<T> = unknown extends T ? ([T] extends [{}] ? false : true) : false;
type IsRenderable<T> = IsUnknown<T> extends true ? true : Equal<T, import('react').ReactNode>;
type NormalizeProp<T> =
	IsRenderable<T> extends true
		? unknown
		: T extends (props: infer P) => any
			? (props: NormalizeProps<P>) => unknown
			: T extends (...args: infer A) => any
				? (...args: A) => unknown
				: T;
type NormalizeProps<P> = { [K in keyof P]: NormalizeProp<P[K]> };
type RenderableNormalizedPropsEqual<LocalComponent, UpstreamComponent> = Equal<
	NormalizeProps<ComponentProps<LocalComponent>>,
	NormalizeProps<ComponentProps<UpstreamComponent>>
>;

// OCTANE DIVERGENCE: components whose rest props spread an octane attribute
// bag (`Octane.SVGProps` / `Octane.HTMLAttributes`, e.g. via `AddSVGProps`)
// diverge from upstream exactly where octane's JSX surface diverges from
// React's: `on*` handlers receive NATIVE DOM events (octane has no synthetic
// event layer; the handler NAMES are identical), `className` composes
// clsx-style (`ClassValue`), `style` additionally accepts a plain string,
// `ref` accepts (nested) ref arrays, and octane adds the native `class` /
// `for` attribute aliases. Compare those components' props with the bag
// divergences collapsed on BOTH sides — the octane-only `class` / `for` keys
// drop out and `on*` / `className` / `style` / `ref` members normalize to
// `unknown` — on top of the renderable normalization above; every remaining
// member must match exactly.
type OctaneOnlyAttributeKeys = 'class' | 'for';
type AttributeBagDivergentKeys = 'className' | 'style' | 'ref' | `on${string}`;
type NormalizeAttributeBagProps<P> = {
	[
		K in keyof P as K extends OctaneOnlyAttributeKeys ? never : K
	]: K extends AttributeBagDivergentKeys ? unknown : NormalizeProp<P[K]>;
};
type AttributeBagNormalizedPropsEqual<LocalComponent, UpstreamComponent> = Equal<
	NormalizeAttributeBagProps<ComponentProps<LocalComponent>>,
	NormalizeAttributeBagProps<ComponentProps<UpstreamComponent>>
>;
// Components that carry an attribute bag NESTED inside a non-bag member (a
// styles/lineStyle member or a render-prop argument) diverge on both sides of
// the variance at a depth the flat normalization cannot reach; like Drag,
// their props surface is pinned key-for-key instead.
type PropsShapeEqual<LocalComponent, UpstreamComponent> = Equal<
	keyof ComponentProps<LocalComponent>,
	keyof ComponentProps<UpstreamComponent>
>;

type AxisComponents = 'Axis' | 'AxisBottom' | 'AxisLeft' | 'AxisRight' | 'AxisTop';
type _Axis = Assert<
	Extends<Omit<Local['Axis'], AxisComponents>, Omit<Upstream['Axis'], AxisComponents>>
>;
type _AxisProps = Assert<
	RenderableNormalizedPropsEqual<Local['Axis']['Axis'], Upstream['Axis']['Axis']>
>;
type _AxisBottomProps = Assert<
	RenderableNormalizedPropsEqual<Local['Axis']['AxisBottom'], Upstream['Axis']['AxisBottom']>
>;
type _AxisLeftProps = Assert<
	RenderableNormalizedPropsEqual<Local['Axis']['AxisLeft'], Upstream['Axis']['AxisLeft']>
>;
type _AxisRightProps = Assert<
	RenderableNormalizedPropsEqual<Local['Axis']['AxisRight'], Upstream['Axis']['AxisRight']>
>;
type _AxisTopProps = Assert<
	RenderableNormalizedPropsEqual<Local['Axis']['AxisTop'], Upstream['Axis']['AxisTop']>
>;
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
// OCTANE DIVERGENCE: drag handlers receive native DOM events (octane has no
// synthetic event layer), so `MouseTouchOrPointerEvent` is the native
// MouseEvent | TouchEvent | PointerEvent union where upstream's members are
// React's synthetic types. The two event-carrying exports diverge exactly
// there; their surface SHAPE is pinned key-for-key instead.
type _Drag = Assert<
	Extends<Omit<Local['Drag'], 'Drag' | 'useDrag'>, Omit<Upstream['Drag'], 'Drag' | 'useDrag'>>
>;
type _DragPropsShape = Assert<
	Equal<keyof ComponentProps<Local['Drag']['Drag']>, keyof ComponentProps<Upstream['Drag']['Drag']>>
>;
type _UseDragShape = Assert<
	Equal<
		| keyof NonNullable<Parameters<Local['Drag']['useDrag']>[0]>
		| keyof ReturnType<Local['Drag']['useDrag']>,
		| keyof NonNullable<Parameters<Upstream['Drag']['useDrag']>[0]>
		| keyof ReturnType<Upstream['Drag']['useDrag']>
	>
>;
type _Event = Assert<Equal<Local['Event'], Upstream['Event']>>;
type _Geo = Assert<Extends<Local['Geo'], Upstream['Geo']>>;
type _Glyph = Assert<Extends<Local['Glyph'], Upstream['Glyph']>>;
type _Gradient = Assert<Extends<Local['Gradient'], Upstream['Gradient']>>;
// Grid/Group components spread octane attribute bags — see the attribute-bag
// carve-out above.
type GridComponents =
	'Grid' | 'GridRows' | 'GridColumns' | 'GridAngle' | 'GridRadial' | 'GridPolar';
type _Grid = Assert<
	Extends<Omit<Local['Grid'], GridComponents>, Omit<Upstream['Grid'], GridComponents>>
>;
type _GridProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['Grid'], Upstream['Grid']['Grid']>
>;
type _GridRowsProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['GridRows'], Upstream['Grid']['GridRows']>
>;
type _GridColumnsProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['GridColumns'], Upstream['Grid']['GridColumns']>
>;
type _GridAngleProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['GridAngle'], Upstream['Grid']['GridAngle']>
>;
type _GridRadialProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['GridRadial'], Upstream['Grid']['GridRadial']>
>;
// GridPolar nests the bag inside `lineStyleAngle` / `lineStyleRadial`.
type _GridPolarPropsShape = Assert<
	PropsShapeEqual<Local['Grid']['GridPolar'], Upstream['Grid']['GridPolar']>
>;
type _Group = Assert<Extends<Omit<Local['Group'], 'Group'>, Omit<Upstream['Group'], 'Group'>>>;
type _GroupProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Group']['Group'], Upstream['Group']['Group']>
>;
type _Heatmap = Assert<Extends<Local['Heatmap'], Upstream['Heatmap']>>;
type _Hierarchy = Assert<Extends<Local['Hierarchy'], Upstream['Hierarchy']>>;
type _Legend = Assert<Extends<Local['Legend'], Upstream['Legend']>>;
type _Marker = Assert<Extends<Local['Marker'], Upstream['Marker']>>;
type _MockData = Assert<Equal<Local['MockData'], Upstream['MockData']>>;
type _Network = Assert<Equal<Local['Network'], Upstream['Network']>>;
type _Pattern = Assert<Extends<Local['Pattern'], Upstream['Pattern']>>;
type _Point = Assert<Equal<Local['Point'], Upstream['Point']>>;
// ParentSize spreads `Octane.HTMLAttributes` — see the attribute-bag
// carve-out above (`style` stays `CSSProperties` locally because ParentSize
// merges style objects; it collapses with the bag members either way).
type _ResponsiveParentSizeProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Responsive']['ParentSize'],
		Upstream['Responsive']['ParentSize']
	>
>;
type _ResponsiveScaleSvg = Assert<
	Extends<Local['Responsive']['ScaleSVG'], Upstream['Responsive']['ScaleSVG']>
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
// Shape components spread octane attribute bags (via `AddSVGProps`) — see the
// attribute-bag carve-out above.
type ShapeComponents =
	| 'Arc'
	| 'Pie'
	| 'Line'
	| 'LinePath'
	| 'LineRadial'
	| 'Area'
	| 'AreaClosed'
	| 'AreaStack'
	| 'Bar'
	| 'BarRounded'
	| 'BarGroup'
	| 'BarGroupHorizontal'
	| 'BarStack'
	| 'BarStackHorizontal'
	| 'Stack'
	| 'LinkHorizontal'
	| 'LinkVertical'
	| 'LinkRadial'
	| 'LinkHorizontalCurve'
	| 'LinkVerticalCurve'
	| 'LinkRadialCurve'
	| 'LinkHorizontalLine'
	| 'LinkVerticalLine'
	| 'LinkRadialLine'
	| 'LinkHorizontalStep'
	| 'LinkVerticalStep'
	| 'LinkRadialStep'
	| 'Polygon'
	| 'Circle'
	| 'SplitLinePath';
type LocalReleasedShape = Omit<Local['Shape'], 'arcPath' | 'areaPath' | 'linePath'>;
type _Shape = Assert<
	Extends<Omit<LocalReleasedShape, ShapeComponents>, Omit<Upstream['Shape'], ShapeComponents>>
>;
type _ArcProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Arc'], Upstream['Shape']['Arc']>
>;
type _PieProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Pie'], Upstream['Shape']['Pie']>
>;
type _LineProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Line'], Upstream['Shape']['Line']>
>;
type _LinePathProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['LinePath'], Upstream['Shape']['LinePath']>
>;
type _LineRadialProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['LineRadial'], Upstream['Shape']['LineRadial']>
>;
type _AreaProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Area'], Upstream['Shape']['Area']>
>;
type _AreaClosedProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['AreaClosed'], Upstream['Shape']['AreaClosed']>
>;
type _AreaStackProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['AreaStack'], Upstream['Shape']['AreaStack']>
>;
type _BarProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Bar'], Upstream['Shape']['Bar']>
>;
type _BarRoundedProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['BarRounded'], Upstream['Shape']['BarRounded']>
>;
type _BarGroupProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['BarGroup'], Upstream['Shape']['BarGroup']>
>;
type _BarGroupHorizontalProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['BarGroupHorizontal'],
		Upstream['Shape']['BarGroupHorizontal']
	>
>;
type _BarStackProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['BarStack'], Upstream['Shape']['BarStack']>
>;
type _BarStackHorizontalProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['BarStackHorizontal'],
		Upstream['Shape']['BarStackHorizontal']
	>
>;
type _StackProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Stack'], Upstream['Shape']['Stack']>
>;
type _LinkHorizontalProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkHorizontal'],
		Upstream['Shape']['LinkHorizontal']
	>
>;
type _LinkVerticalProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkVertical'],
		Upstream['Shape']['LinkVertical']
	>
>;
type _LinkRadialProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['LinkRadial'], Upstream['Shape']['LinkRadial']>
>;
type _LinkHorizontalCurveProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkHorizontalCurve'],
		Upstream['Shape']['LinkHorizontalCurve']
	>
>;
type _LinkVerticalCurveProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkVerticalCurve'],
		Upstream['Shape']['LinkVerticalCurve']
	>
>;
type _LinkRadialCurveProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkRadialCurve'],
		Upstream['Shape']['LinkRadialCurve']
	>
>;
type _LinkHorizontalLineProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkHorizontalLine'],
		Upstream['Shape']['LinkHorizontalLine']
	>
>;
type _LinkVerticalLineProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkVerticalLine'],
		Upstream['Shape']['LinkVerticalLine']
	>
>;
type _LinkRadialLineProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkRadialLine'],
		Upstream['Shape']['LinkRadialLine']
	>
>;
type _LinkHorizontalStepProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkHorizontalStep'],
		Upstream['Shape']['LinkHorizontalStep']
	>
>;
type _LinkVerticalStepProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkVerticalStep'],
		Upstream['Shape']['LinkVerticalStep']
	>
>;
type _LinkRadialStepProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Shape']['LinkRadialStep'],
		Upstream['Shape']['LinkRadialStep']
	>
>;
type _PolygonProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Polygon'], Upstream['Shape']['Polygon']>
>;
type _CircleProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Shape']['Circle'], Upstream['Shape']['Circle']>
>;
// SplitLinePath nests the bag inside its `styles` members and its render-prop
// argument (`styles.className` additionally stays a plain string locally so it
// can forward to LinePath's `className`).
type _SplitLinePathPropsShape = Assert<
	PropsShapeEqual<Local['Shape']['SplitLinePath'], Upstream['Shape']['SplitLinePath']>
>;
type _Text = Assert<Equal<Local['Text'], Upstream['Text']>>;
type _Threshold = Assert<Extends<Local['Threshold'], Upstream['Threshold']>>;
type _TooltipUse = Assert<Equal<Local['Tooltip']['useTooltip'], Upstream['Tooltip']['useTooltip']>>;
type _TooltipInPortal = Assert<
	Extends<Local['Tooltip']['useTooltipInPortal'], Upstream['Tooltip']['useTooltipInPortal']>
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
type _Voronoi = Assert<Extends<Local['Voronoi'], Upstream['Voronoi']>>;
type _Wordcloud = Assert<Extends<Local['Wordcloud'], Upstream['Wordcloud']>>;
type XYChartCarveouts =
	| 'DataContext'
	| 'EventEmitterContext'
	| 'ThemeContext'
	| 'TooltipContext'
	| 'AnimatedAxis'
	| 'Axis';
type _XYChart = Assert<
	Extends<Omit<Local['XYChart'], XYChartCarveouts>, Omit<Upstream['XYChart'], XYChartCarveouts>>
>;
type _XYChartAxisProps = Assert<
	RenderableNormalizedPropsEqual<Local['XYChart']['Axis'], Upstream['XYChart']['Axis']>
>;
type _XYChartAnimatedAxisProps = Assert<
	RenderableNormalizedPropsEqual<
		Local['XYChart']['AnimatedAxis'],
		Upstream['XYChart']['AnimatedAxis']
	>
>;
type _Zoom = Assert<Equal<Local['Zoom'], Upstream['Zoom']>>;

type _Chord = Assert<Extends<typeof import('@octanejs/visx/chord'), typeof import('@visx/chord')>>;
type _Delaunay = Assert<
	Extends<typeof import('@octanejs/visx/delaunay'), typeof import('@visx/delaunay')>
>;
type _ReactSpring = Assert<
	Extends<
		Omit<typeof import('@octanejs/visx/react-spring'), 'AnimatedAxis'>,
		Omit<typeof import('@visx/react-spring'), 'AnimatedAxis'>
	>
>;
type _ReactSpringAnimatedAxisProps = Assert<
	RenderableNormalizedPropsEqual<
		(typeof import('@octanejs/visx/react-spring'))['AnimatedAxis'],
		(typeof import('@visx/react-spring'))['AnimatedAxis']
	>
>;
type _Sankey = Assert<
	Extends<typeof import('@octanejs/visx/sankey'), typeof import('@visx/sankey')>
>;
type _Stats = Assert<Extends<typeof import('@octanejs/visx/stats'), typeof import('@visx/stats')>>;

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
// Props-type asserts stay exact `Equal`, with the OctaneNode divergence spelled
// out member-by-member on the upstream side (renderable holes are `unknown`).
type _BrushProps = Assert<
	Equal<
		LocalBrushProps,
		Omit<UpstreamBrushProps, 'innerRef' | 'renderBrushHandle'> & {
			renderBrushHandle?: (props: import('@visx/brush').BrushHandleRenderProps) => unknown;
		}
	>
>;
type _TooltipPositionContextValue = Assert<
	Equal<LocalTooltipPositionContextType, UpstreamTooltipPositionContextType>
>;
type _PortalProps = Assert<
	Equal<
		LocalPortalProps,
		Omit<UpstreamPortalProps, 'children'> & { children: NonNullable<unknown> }
	>
>;
type _TooltipProps = Assert<
	Equal<LocalTooltipProps, Omit<UpstreamTooltipProps, 'children'> & { children?: unknown }>
>;
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
