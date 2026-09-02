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
//
// Where a component needs comparing on its own, the renderable holes are
// collapsed on BOTH sides first: members typed `ReactNode` (upstream) or
// `unknown` (local) normalize to `unknown`, and function members normalize
// their return the same way (multi-parameter render functions, e.g. Pie's
// `centroid`, keep their parameter tuple exact and collapse only the return).
// Everything else must match exactly.
type ComponentProps<C> = C extends (props: infer P) => any
	? P
	: C extends new (props: infer P, ...args: any[]) => any
		? P
		: never;
type IsUnknown<T> = unknown extends T ? ([T] extends [{}] ? false : true) : false;
type IsRenderable<T> = IsUnknown<T> extends true ? true : Equal<T, import('react').ReactNode>;

// OCTANE DIVERGENCE: components whose rest props spread an octane attribute
// bag (`Octane.SVGProps` / `Octane.HTMLAttributes`, e.g. via `AddSVGProps`)
// diverge from upstream exactly where octane's JSX surface diverges from
// React's: shared `on*` handlers receive NATIVE DOM events (octane has no
// synthetic event layer), `className` composes
// clsx-style (`ClassValue`), `style` additionally accepts a plain string,
// `ref` accepts (nested) ref arrays, and octane adds the native `class` /
// `for` attribute aliases. Compare those components' props with the bag
// divergences collapsed on BOTH sides — the octane-only `class` / `for` keys
// drop out and `on*` / `className` / `style` / `ref` members normalize to
// `unknown` — on top of the renderable normalization above; every remaining
// member must match exactly.
//
// A bag reaches a component's surface in three shapes, so this normalization
// recurses through all of them: spread flat into the props, held by an
// object-typed member (`tickLabelProps`, `backgroundProps`, `lineProps`,
// `glyphStyle`, a `styles` record), or carried by a RENDER PROP'S ARGUMENT
// (Axis passes `AxisRendererProps` to `children`). A member is treated as a
// bag when it has a `className` key, which both octane's and React's bags do
// and ordinary data objects do not. Recursion only ever collapses more of the
// same divergence on both sides, so it cannot turn a passing comparison into a
// failing one — it just stops the surface from falling through to a key-only
// pin.
type OctaneOnlyAttributeKeys = 'class' | 'for';
type AttributeBagDivergentKeys = 'className' | 'style' | 'ref' | `on${string}`;
type NormalizeProp<T> =
	IsRenderable<T> extends true
		? unknown
		: T extends undefined
			? T
			: T extends null
				? T
				: T extends (props: infer P) => any
					? (props: NormalizeAttributeBagProps<P>) => unknown
					: T extends (...args: infer A) => any
						? (...args: A) => unknown
						: 'className' extends keyof T
							? NormalizeAttributeBagProps<T>
							: T;
type NormalizeAttributeBagProps<P> = {
	[
		K in keyof P as K extends OctaneOnlyAttributeKeys ? never : K
	]: K extends AttributeBagDivergentKeys ? unknown : NormalizeProp<P[K]>;
};
type AttributeBagNormalizedPropsEqual<LocalComponent, UpstreamComponent> = Equal<
	NormalizeAttributeBagProps<ComponentProps<LocalComponent>>,
	NormalizeAttributeBagProps<ComponentProps<UpstreamComponent>>
>;
// A few bag-spreading components additionally diverge where this port is
// deliberately MORE permissive than upstream: ClipPath, the gradients, and the
// markers generate a fallback id with `useStableId`, so `id` is optional here
// where upstream requires it. That is exactly the one-directional relationship
// the module-level `Extends` asserts describe, so those components keep that
// direction with the bag divergences collapsed — every upstream call site still
// type-checks against the local component. Props sit in a contravariant
// position, hence the flipped operands.
type AttributeBagNormalizedPropsExtends<LocalComponent, UpstreamComponent> = Extends<
	NormalizeAttributeBagProps<ComponentProps<UpstreamComponent>>,
	NormalizeAttributeBagProps<ComponentProps<LocalComponent>>
>;
// The last resort, for the three components the normalization above still
// cannot reconcile: SplitLinePath, whose `styles` members keep `className` a
// plain string locally so it can forward to LinePath, and the two area stacks,
// which take their children as `ReactElement<AreaSeriesProps>` — a React
// element type, not a renderable hole, so the bag inside its type argument is
// unreachable. Like Drag, whose divergence is the native event union rather
// than a bag, their props surface is pinned key-for-key. Such a pin must also
// ignore the common TOP-LEVEL bag additions `class`, `for`, `hidden`, and
// `tabindex` beside React's canonical camelCase props. Host-specific additions
// are listed only for the affected component below. These additions are
// optional, which is why the member-by-member comparisons above tolerate them
// without listing them.
type OctaneOnlyAttributeSurfaceKeys = OctaneOnlyAttributeKeys | 'hidden' | 'tabindex';
type PropsShapeEqual<
	LocalComponent,
	UpstreamComponent,
	AdditionalLocalKeys extends PropertyKey = never,
> = Equal<
	Exclude<
		keyof ComponentProps<LocalComponent>,
		OctaneOnlyAttributeSurfaceKeys | AdditionalLocalKeys
	>,
	Exclude<keyof ComponentProps<UpstreamComponent>, OctaneOnlyAttributeSurfaceKeys>
>;

type AnnotationCarveouts =
	| 'AnnotationContext'
	| 'CircleSubject'
	| 'Connector'
	| 'EditableAnnotation'
	| 'Label'
	| 'LineSubject';
type _Annotation = Assert<
	Extends<
		Omit<Local['Annotation'], AnnotationCarveouts>,
		Omit<Upstream['Annotation'], AnnotationCarveouts>
	>
>;
// CircleSubject and LineSubject spread an octane attribute bag; Connector,
// Label, and EditableAnnotation nest one inside `pathProps`,
// `backgroundProps`, and the two drag-handle prop members respectively.
type _AnnotationCircleSubjectProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Annotation']['CircleSubject'],
		Upstream['Annotation']['CircleSubject']
	>
>;
type _AnnotationLineSubjectProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Annotation']['LineSubject'],
		Upstream['Annotation']['LineSubject']
	>
>;
type _AnnotationConnectorProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Annotation']['Connector'],
		Upstream['Annotation']['Connector']
	>
>;
type _AnnotationLabelProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Annotation']['Label'], Upstream['Annotation']['Label']>
>;
type _AnnotationEditableProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Annotation']['EditableAnnotation'],
		Upstream['Annotation']['EditableAnnotation']
	>
>;
type AxisComponents = 'Axis' | 'AxisBottom' | 'AxisLeft' | 'AxisRight' | 'AxisTop';
type _Axis = Assert<
	Extends<Omit<Local['Axis'], AxisComponents>, Omit<Upstream['Axis'], AxisComponents>>
>;
// Axis takes `children` as a RENDER PROP, and its `AxisRendererProps` argument
// carries `tickLabelProps` / `tickLineProps` attribute bags — the render-prop
// argument case the normalization recurses through.
type _AxisProps = Assert<PropsShapeEqual<Local['Axis']['Axis'], Upstream['Axis']['Axis']>>;
type _AxisBottomProps = Assert<
	PropsShapeEqual<Local['Axis']['AxisBottom'], Upstream['Axis']['AxisBottom']>
>;
type _AxisLeftProps = Assert<
	PropsShapeEqual<Local['Axis']['AxisLeft'], Upstream['Axis']['AxisLeft']>
>;
type _AxisRightProps = Assert<
	PropsShapeEqual<Local['Axis']['AxisRight'], Upstream['Axis']['AxisRight']>
>;
type _AxisTopProps = Assert<PropsShapeEqual<Local['Axis']['AxisTop'], Upstream['Axis']['AxisTop']>>;
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
// Every clip-path component spreads an octane attribute bag AND generates its
// own `id`, so all three are asserted individually; the module assert stays as
// a guard for exports added later.
type ClipPathComponents = 'ClipPath' | 'CircleClipPath' | 'RectClipPath';
type _ClipPath = Assert<
	Extends<
		Omit<Local['ClipPath'], ClipPathComponents>,
		Omit<Upstream['ClipPath'], ClipPathComponents>
	>
>;
type _ClipPathProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['ClipPath']['ClipPath'],
		Upstream['ClipPath']['ClipPath']
	>
>;
type _CircleClipPathProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['ClipPath']['CircleClipPath'],
		Upstream['ClipPath']['CircleClipPath']
	>
>;
type _RectClipPathProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['ClipPath']['RectClipPath'],
		Upstream['ClipPath']['RectClipPath']
	>
>;
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
// Graticule and the glyphs spread octane attribute bags.
type _Geo = Assert<Extends<Omit<Local['Geo'], 'Graticule'>, Omit<Upstream['Geo'], 'Graticule'>>>;
type _GeoGraticuleProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Geo']['Graticule'], Upstream['Geo']['Graticule']>
>;
type GlyphComponents =
	| 'GlyphCircle'
	| 'GlyphCross'
	| 'GlyphDiamond'
	| 'GlyphDot'
	| 'GlyphSquare'
	| 'GlyphStar'
	| 'GlyphTriangle'
	| 'GlyphWye';
type _Glyph = Assert<
	Extends<Omit<Local['Glyph'], GlyphComponents>, Omit<Upstream['Glyph'], GlyphComponents>>
>;
type _GlyphCircleProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphCircle'], Upstream['Glyph']['GlyphCircle']>
>;
type _GlyphCrossProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphCross'], Upstream['Glyph']['GlyphCross']>
>;
type _GlyphDiamondProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Glyph']['GlyphDiamond'],
		Upstream['Glyph']['GlyphDiamond']
	>
>;
type _GlyphDotProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphDot'], Upstream['Glyph']['GlyphDot']>
>;
type _GlyphSquareProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphSquare'], Upstream['Glyph']['GlyphSquare']>
>;
type _GlyphStarProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphStar'], Upstream['Glyph']['GlyphStar']>
>;
type _GlyphTriangleProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Glyph']['GlyphTriangle'],
		Upstream['Glyph']['GlyphTriangle']
	>
>;
type _GlyphWyeProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Glyph']['GlyphWye'], Upstream['Glyph']['GlyphWye']>
>;
// Every gradient spreads an octane attribute bag AND generates its own `id`,
// so all twelve are asserted individually; the module assert stays as a guard
// for exports added later.
type GradientComponents =
	| 'GradientDarkgreenGreen'
	| 'GradientLightgreenGreen'
	| 'GradientOrangeRed'
	| 'GradientPinkBlue'
	| 'GradientPinkRed'
	| 'GradientPurpleOrange'
	| 'GradientPurpleRed'
	| 'GradientPurpleTeal'
	| 'GradientSteelPurple'
	| 'GradientTealBlue'
	| 'LinearGradient'
	| 'RadialGradient';
type _Gradient = Assert<
	Extends<
		Omit<Local['Gradient'], GradientComponents>,
		Omit<Upstream['Gradient'], GradientComponents>
	>
>;
type _LinearGradientProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['LinearGradient'],
		Upstream['Gradient']['LinearGradient']
	>
>;
type _RadialGradientProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['RadialGradient'],
		Upstream['Gradient']['RadialGradient']
	>
>;
type _GradientDarkgreenGreenProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientDarkgreenGreen'],
		Upstream['Gradient']['GradientDarkgreenGreen']
	>
>;
type _GradientLightgreenGreenProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientLightgreenGreen'],
		Upstream['Gradient']['GradientLightgreenGreen']
	>
>;
type _GradientOrangeRedProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientOrangeRed'],
		Upstream['Gradient']['GradientOrangeRed']
	>
>;
type _GradientPinkBlueProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientPinkBlue'],
		Upstream['Gradient']['GradientPinkBlue']
	>
>;
type _GradientPinkRedProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientPinkRed'],
		Upstream['Gradient']['GradientPinkRed']
	>
>;
type _GradientPurpleOrangeProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientPurpleOrange'],
		Upstream['Gradient']['GradientPurpleOrange']
	>
>;
type _GradientPurpleRedProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientPurpleRed'],
		Upstream['Gradient']['GradientPurpleRed']
	>
>;
type _GradientPurpleTealProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientPurpleTeal'],
		Upstream['Gradient']['GradientPurpleTeal']
	>
>;
type _GradientSteelPurpleProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientSteelPurple'],
		Upstream['Gradient']['GradientSteelPurple']
	>
>;
type _GradientTealBlueProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Gradient']['GradientTealBlue'],
		Upstream['Gradient']['GradientTealBlue']
	>
>;
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
type _GridPolarProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Grid']['GridPolar'], Upstream['Grid']['GridPolar']>
>;
type _Group = Assert<Extends<Omit<Local['Group'], 'Group'>, Omit<Upstream['Group'], 'Group'>>>;
type _GroupProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Group']['Group'], Upstream['Group']['Group']>
>;
// Both heatmaps spread an octane attribute bag; the module assert stays as a
// guard for exports added later.
type HeatmapComponents = 'HeatmapCircle' | 'HeatmapRect';
type _Heatmap = Assert<
	Extends<Omit<Local['Heatmap'], HeatmapComponents>, Omit<Upstream['Heatmap'], HeatmapComponents>>
>;
type _HeatmapCircleProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Heatmap']['HeatmapCircle'],
		Upstream['Heatmap']['HeatmapCircle']
	>
>;
type _HeatmapRectProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Heatmap']['HeatmapRect'],
		Upstream['Heatmap']['HeatmapRect']
	>
>;
type _Hierarchy = Assert<Extends<Local['Hierarchy'], Upstream['Hierarchy']>>;
type LegendCarveouts = 'LegendShape' | 'LegendItem' | 'LegendLabel';
type _Legend = Assert<
	Equal<
		Exclude<keyof Omit<Local['Legend'], LegendCarveouts>, never>,
		Exclude<keyof Omit<Upstream['Legend'], LegendCarveouts>, never>
	>
>;
// Every marker spreads an octane attribute bag AND generates its own `id`, so
// all six are asserted individually; the module assert stays as a guard for
// exports added later.
type MarkerComponents =
	'Marker' | 'MarkerArrow' | 'MarkerCircle' | 'MarkerCross' | 'MarkerLine' | 'MarkerX';
type _Marker = Assert<
	Extends<Omit<Local['Marker'], MarkerComponents>, Omit<Upstream['Marker'], MarkerComponents>>
>;
type _MarkerProps = Assert<
	AttributeBagNormalizedPropsExtends<Local['Marker']['Marker'], Upstream['Marker']['Marker']>
>;
type _MarkerArrowProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Marker']['MarkerArrow'],
		Upstream['Marker']['MarkerArrow']
	>
>;
type _MarkerCircleProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Marker']['MarkerCircle'],
		Upstream['Marker']['MarkerCircle']
	>
>;
type _MarkerCrossProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Marker']['MarkerCross'],
		Upstream['Marker']['MarkerCross']
	>
>;
type _MarkerLineProps = Assert<
	AttributeBagNormalizedPropsExtends<
		Local['Marker']['MarkerLine'],
		Upstream['Marker']['MarkerLine']
	>
>;
type _MarkerXProps = Assert<
	AttributeBagNormalizedPropsExtends<Local['Marker']['MarkerX'], Upstream['Marker']['MarkerX']>
>;
type _MockData = Assert<Equal<Local['MockData'], Upstream['MockData']>>;
// DefaultNode spreads an octane attribute bag. The rest of the module drops to
// `Extends` like its peers: Graph, Links, and Nodes RETURN octane elements,
// which are nominal, so the upstream-to-local direction cannot hold. Checking
// the generated `.tsrx.d.ts` hides this — the generator annotates the return as
// React's `JSX.Element` — but checking the published `.tsrx` sources, which is
// what a consumer's program does, does not.
type _Network = Assert<
	Extends<Omit<Local['Network'], 'DefaultNode'>, Omit<Upstream['Network'], 'DefaultNode'>>
>;
type _NetworkDefaultNodeProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Network']['DefaultNode'],
		Upstream['Network']['DefaultNode']
	>
>;
type _Pattern = Assert<Extends<Local['Pattern'], Upstream['Pattern']>>;
type _Point = Assert<Equal<Local['Point'], Upstream['Point']>>;
// ParentSize spreads `Octane.HTMLAttributes` — see the attribute-bag
// carve-out above (`style` stays `CSSProperties` locally because ParentSize
// merges style objects; it collapses with the bag members either way).
// Octane also supports xmlns and both phases of native dialog lifecycle events
// on HTML ancestors; React restricts xmlns to SVG and these handlers to dialogs.
// Normalize only those extra keys here, then pin the native handler surface.
type ParentSizeDialogLifecycleKeys = 'onCancel' | 'onCancelCapture' | 'onClose' | 'onCloseCapture';
type _ResponsiveParentSizeProps = Assert<
	PropsShapeEqual<
		Local['Responsive']['ParentSize'],
		Upstream['Responsive']['ParentSize'],
		'xmlns' | ParentSizeDialogLifecycleKeys
	>
>;
type _ResponsiveParentSizeNativeDialogEvents = Assert<
	Equal<
		Pick<ComponentProps<Local['Responsive']['ParentSize']>, ParentSizeDialogLifecycleKeys>,
		{
			[K in ParentSizeDialogLifecycleKeys]?: (
				event: Event & { currentTarget: HTMLDivElement },
			) => void;
		}
	>
>;
type ParentSizeDialogLifecycleEvent = Parameters<
	NonNullable<ComponentProps<Local['Responsive']['ParentSize']>[ParentSizeDialogLifecycleKeys]>
>[0];
// @ts-expect-error Dialog lifecycle handlers receive native events, not synthetic wrappers or any.
type _ResponsiveParentSizeDialogEventHasNoWrapper = ParentSizeDialogLifecycleEvent['nativeEvent'];
type _ResponsiveScaleSvg = Assert<
	Extends<Local['Responsive']['ScaleSVG'], Upstream['Responsive']['ScaleSVG']>
>;
type _ResponsiveUseParentSize = Assert<
	Equal<
		Exclude<keyof ReturnType<Local['Responsive']['useParentSize']>, never>,
		Exclude<keyof ReturnType<Upstream['Responsive']['useParentSize']>, never>
	>
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
type TextCarveouts = 'Text' | 'useText';
type _Text = Assert<
	Equal<Omit<Local['Text'], TextCarveouts>, Omit<Upstream['Text'], TextCarveouts>>
>;
type _TextProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Text']['Text'], Upstream['Text']['Text']>
>;
type _UseTextProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['Text']['useText'], Upstream['Text']['useText']>
>;
type _UseTextReturn = Assert<
	Equal<ReturnType<Local['Text']['useText']>, ReturnType<Upstream['Text']['useText']>>
>;
// Threshold nests the bag inside `aboveAreaProps` / `belowAreaProps` and, like
// the clip-paths above, generates a fallback `id`, so it holds one-directionally.
// It is the module's only component; the module assert stays as a guard for
// exports added later.
type _Threshold = Assert<
	Extends<Omit<Local['Threshold'], 'Threshold'>, Omit<Upstream['Threshold'], 'Threshold'>>
>;
type _ThresholdProps = Assert<
	PropsShapeEqual<Local['Threshold']['Threshold'], Upstream['Threshold']['Threshold']>
>;
type _TooltipUse = Assert<Equal<Local['Tooltip']['useTooltip'], Upstream['Tooltip']['useTooltip']>>;
type _TooltipInPortal = Assert<
	Equal<
		Exclude<keyof ReturnType<Local['Tooltip']['useTooltipInPortal']>, never>,
		Exclude<keyof ReturnType<Upstream['Tooltip']['useTooltipInPortal']>, never>
	>
>;
type _TooltipPosition = Assert<
	Equal<Local['Tooltip']['useTooltipPosition'], Upstream['Tooltip']['useTooltipPosition']>
>;
type _TooltipStyles = Assert<
	Equal<Local['Tooltip']['defaultStyles'], Upstream['Tooltip']['defaultStyles']>
>;
type _TooltipWithBoundsProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Tooltip']['TooltipWithBounds'],
		Upstream['Tooltip']['TooltipWithBounds']
	>
>;
type _TooltipWithBoundsReturn = Assert<
	Equal<ReturnType<Local['Tooltip']['TooltipWithBounds']>, import('octane').ElementDescriptor>
>;
// VoronoiPolygon spreads an octane attribute bag.
type _Voronoi = Assert<
	Extends<Omit<Local['Voronoi'], 'VoronoiPolygon'>, Omit<Upstream['Voronoi'], 'VoronoiPolygon'>>
>;
type _VoronoiPolygonProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['Voronoi']['VoronoiPolygon'],
		Upstream['Voronoi']['VoronoiPolygon']
	>
>;
type _Wordcloud = Assert<Extends<Local['Wordcloud'], Upstream['Wordcloud']>>;
type XYChartCarveouts =
	| 'DataContext'
	| 'EventEmitterContext'
	| 'ThemeContext'
	| 'TooltipContext'
	| 'AnimatedAxis'
	| 'Axis'
	| 'AnimatedAreaSeries'
	| 'AnimatedAreaStack'
	| 'AnimatedLineSeries'
	| 'AnnotationConnector'
	| 'AnnotationLabel'
	| 'AnnotationLineSubject'
	| 'AreaSeries'
	| 'AreaStack'
	| 'BarGroup'
	| 'BarSeries'
	| 'BarStack'
	| 'GlyphSeries'
	| 'LineSeries'
	| 'AnimatedBarSeries'
	| 'AnimatedBarStack'
	| 'AnimatedBarGroup'
	| 'AnimatedGlyphSeries'
	| 'Tooltip'
	| 'useEventEmitter'
	| 'EventHandlerParams'
	| 'GlyphProps'
	| 'GlyphsProps'
	| 'SeriesProps'
	| 'SvgPathComponent'
	| 'HTMLTextStyles'
	| 'LineStyles'
	| 'DataProvider'
	| 'buildChartTheme'
	| 'lightTheme'
	| 'darkTheme';
type _XYChart = Assert<
	Equal<
		Exclude<keyof Omit<Local['XYChart'], XYChartCarveouts>, never>,
		Exclude<keyof Omit<Upstream['XYChart'], XYChartCarveouts>, never>
	>
>;
// Axis/AnimatedAxis take `children` as a render prop whose `AxisRendererProps`
// argument carries tick attribute bags — see the Axis module above.
type _XYChartAxisProps = Assert<
	PropsShapeEqual<Local['XYChart']['Axis'], Upstream['XYChart']['Axis']>
>;
type _XYChartAnimatedAxisProps = Assert<
	PropsShapeEqual<Local['XYChart']['AnimatedAxis'], Upstream['XYChart']['AnimatedAxis']>
>;
// The line series and AnnotationLineSubject spread an octane attribute bag.
type _XYChartLineSeriesProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['LineSeries'],
		Upstream['XYChart']['LineSeries']
	>
>;
type _XYChartAnimatedLineSeriesProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AnimatedLineSeries'],
		Upstream['XYChart']['AnimatedLineSeries']
	>
>;
type _XYChartAnnotationLineSubjectProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AnnotationLineSubject'],
		Upstream['XYChart']['AnnotationLineSubject']
	>
>;
// The area series nest a bag inside `lineProps` and `PathComponent`, the
// annotation components inherit annotation's nested
// `pathProps`/`backgroundProps`, and Tooltip nests one inside `glyphStyle` and
// the two crosshair style members. The two area STACKS take their children as
// `ReactElement<AreaSeriesProps>`, whose bag sits inside a React element type
// rather than a renderable hole, so they alone stay pinned key-for-key.
type _XYChartAreaSeriesProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AreaSeries'],
		Upstream['XYChart']['AreaSeries']
	>
>;
type _XYChartAnimatedAreaSeriesProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AnimatedAreaSeries'],
		Upstream['XYChart']['AnimatedAreaSeries']
	>
>;
type _XYChartAreaStackPropsShape = Assert<
	PropsShapeEqual<Local['XYChart']['AreaStack'], Upstream['XYChart']['AreaStack']>
>;
type _XYChartAnimatedAreaStackPropsShape = Assert<
	PropsShapeEqual<Local['XYChart']['AnimatedAreaStack'], Upstream['XYChart']['AnimatedAreaStack']>
>;
type _XYChartAnnotationConnectorProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AnnotationConnector'],
		Upstream['XYChart']['AnnotationConnector']
	>
>;
type _XYChartAnnotationLabelProps = Assert<
	AttributeBagNormalizedPropsEqual<
		Local['XYChart']['AnnotationLabel'],
		Upstream['XYChart']['AnnotationLabel']
	>
>;
type _XYChartTooltipProps = Assert<
	AttributeBagNormalizedPropsEqual<Local['XYChart']['Tooltip'], Upstream['XYChart']['Tooltip']>
>;
type _Zoom = Assert<
	Equal<Exclude<keyof Local['Zoom'], never>, Exclude<keyof Upstream['Zoom'], never>>
>;

// Ribbon and Polygon spread octane attribute bags.
type _Chord = Assert<
	Extends<
		Omit<typeof import('@octanejs/visx/chord'), 'Ribbon'>,
		Omit<typeof import('@visx/chord'), 'Ribbon'>
	>
>;
type _ChordRibbonProps = Assert<
	AttributeBagNormalizedPropsEqual<
		(typeof import('@octanejs/visx/chord'))['Ribbon'],
		(typeof import('@visx/chord'))['Ribbon']
	>
>;
type _Delaunay = Assert<
	Extends<
		Omit<typeof import('@octanejs/visx/delaunay'), 'Polygon'>,
		Omit<typeof import('@visx/delaunay'), 'Polygon'>
	>
>;
type _DelaunayPolygonProps = Assert<
	AttributeBagNormalizedPropsEqual<
		(typeof import('@octanejs/visx/delaunay'))['Polygon'],
		(typeof import('@visx/delaunay'))['Polygon']
	>
>;
// AnimatedTicks renders `TicksRendererProps`, which nests bags inside
// `tickLabelProps` and `tickLineProps`.
type ReactSpringCarveouts = 'AnimatedAxis' | 'AnimatedTicks';
type _ReactSpring = Assert<
	Extends<
		Omit<typeof import('@octanejs/visx/react-spring'), ReactSpringCarveouts>,
		Omit<typeof import('@visx/react-spring'), ReactSpringCarveouts>
	>
>;
type _ReactSpringAnimatedAxisProps = Assert<
	PropsShapeEqual<
		(typeof import('@octanejs/visx/react-spring'))['AnimatedAxis'],
		(typeof import('@visx/react-spring'))['AnimatedAxis']
	>
>;
type _ReactSpringAnimatedTicksProps = Assert<
	PropsShapeEqual<
		(typeof import('@octanejs/visx/react-spring'))['AnimatedTicks'],
		(typeof import('@visx/react-spring'))['AnimatedTicks']
	>
>;
type _Sankey = Assert<
	Extends<typeof import('@octanejs/visx/sankey'), typeof import('@visx/sankey')>
>;
// ViolinPlot spreads an octane attribute bag; BoxPlot nests one inside its
// per-part `*Props` members and its render-prop argument.
type StatsComponents = 'BoxPlot' | 'ViolinPlot';
type _Stats = Assert<
	Extends<
		Omit<typeof import('@octanejs/visx/stats'), StatsComponents>,
		Omit<typeof import('@visx/stats'), StatsComponents>
	>
>;
type _StatsViolinPlotProps = Assert<
	AttributeBagNormalizedPropsEqual<
		(typeof import('@octanejs/visx/stats'))['ViolinPlot'],
		(typeof import('@visx/stats'))['ViolinPlot']
	>
>;
type _StatsBoxPlotProps = Assert<
	AttributeBagNormalizedPropsEqual<
		(typeof import('@octanejs/visx/stats'))['BoxPlot'],
		(typeof import('@visx/stats'))['BoxPlot']
	>
>;

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
// `selectedBoxStyle` holds a whole attribute bag rather than spreading one, so
// it is spelled out the same way: octane's bag in the member's position.
type _BrushProps = Assert<
	Equal<
		Exclude<keyof LocalBrushProps, never>,
		Exclude<keyof Omit<UpstreamBrushProps, 'innerRef'>, never>
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
	Equal<
		Exclude<keyof LocalDataContextType<any, any, any>, never>,
		Exclude<keyof UpstreamDataContextType<any, any, any>, never>
	>
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
