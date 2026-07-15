import { useState } from 'octane';
import { withBoundingRects } from '@octanejs/visx/bounds';
import { Brush } from '@octanejs/visx/brush';
import { Drag } from '@octanejs/visx/drag';
import { Zoom } from '@octanejs/visx/zoom';
import { ParentSize, withParentSize, withScreenSize } from '@octanejs/visx/responsive';
import { useChartA11y } from '@octanejs/visx/a11y/react';
import { useAxis } from '@octanejs/visx/axis/react';
import { useChartDimensions } from '@octanejs/visx/chart';
import { useStableId } from '@octanejs/visx/kernel';
import { useScale } from '@octanejs/visx/scale/react';
import { scaleLinear } from '@octanejs/visx/scale';
import { usePie } from '@octanejs/visx/shape/react';
import { ThemeProvider, useTheme } from '@octanejs/visx/theme/react';
import { useTooltip, useTooltipInPortal } from '@octanejs/visx/tooltip';
import { useFloatingTooltip } from '@octanejs/visx/tooltip/floating';
import { useVoronoi } from '@octanejs/visx/voronoi/react';
import useMeasure from '../../src/internal/useMeasure.tsrx';

const points = [
	{ x: 10, y: 20, value: 1 },
	{ x: 40, y: 50, value: 2 },
];

export function DragFixture() {
	const [nativeEvent, setNativeEvent] = useState(false);
	return <svg width={160} height={100}>
		<Drag
			width={160}
			height={100}
			restrict={{ xMin: 0, xMax: 100, yMin: 0, yMax: 80 }}
			onDragMove={({ event }) => setNativeEvent(
				event instanceof Event && !('nativeEvent' in event),
			)}
		>
			{(drag) =>
				<circle
					id="drag-target"
					cx={(drag.x ?? 0) + drag.dx}
					cy={(drag.y ?? 0) + drag.dy}
					r={8}
					data-dx={drag.dx}
					data-dy={drag.dy}
					data-dragging={drag.isDragging}
					data-native={nativeEvent}
					onPointerDown={drag.dragStart}
					onPointerMove={drag.dragMove}
					onPointerUp={drag.dragEnd}
				/>}
		</Drag>
	</svg>;
}
export function ZoomFixture() {
	return <Zoom width={200} height={120}>
		{(zoom) => <svg
			id="zoom-target"
			ref={zoom.containerRef}
			width={200}
			height={120}
			data-transform={zoom.toString()}
			data-dragging={zoom.isDragging}
		>
			<rect width={200} height={120} />
		</svg>}
	</Zoom>;
}

export function ResponsiveFixture({ ResizeObserverImpl }) {
	return <ParentSize
		data-testid="responsive-parent"
		initialSize={{ width: 120, height: 80 }}
		debounceTime={0}
		resizeObserverPolyfill={ResizeObserverImpl}
	>
		{({ width, height }) => <output data-testid="responsive-output">{`${width}x${height}`}</output>}
	</ParentSize>;
}

function ParentSizeEnhancerProbe({ parentWidth, parentHeight }) {
	return <output id="parent-size-enhancer">{`${parentWidth}x${parentHeight}`}</output>;
}

function ScreenSizeEnhancerProbe({ screenWidth, screenHeight }) {
	return <output id="screen-size-enhancer">{`${screenWidth}x${screenHeight}`}</output>;
}

const ScreenSizeEnhancer = withScreenSize(ScreenSizeEnhancerProbe);

export function ResponsiveEnhancersFixture({ ResizeObserverImpl }) {
	const ParentSizeEnhancer = withParentSize(ParentSizeEnhancerProbe, ResizeObserverImpl);
	return <section>
		<ParentSizeEnhancer initialWidth={90} initialHeight={45} debounceTime={0} />
		<ScreenSizeEnhancer debounceTime={0} />
	</section>;
}

export function MeasureLifecycleFixture({ ResizeObserverImpl }) {
	const [showTarget, setShowTarget] = useState(true);
	const [measureRef, bounds] = useMeasure({
		polyfill: ResizeObserverImpl,
		scroll: true,
	});

	return <section>
		<button id="toggle-measure-target" onClick={() => setShowTarget((show) => !show)}>Toggle</button>
		{showTarget && <div id="measure-target" ref={measureRef} />}
		<output id="measure-width">{bounds.width as string}</output>
	</section>;
}

export function BrushFixture() {
	const [bounds, setBounds] = useState('none');
	const xScale = scaleLinear({ domain: [0, 100], range: [0, 200] });
	const yScale = scaleLinear({ domain: [0, 50], range: [0, 100] });
	return <section>
		<svg width={200} height={100}>
			<Brush
				width={200}
				height={100}
				xScale={xScale}
				yScale={yScale}
				brushDirection="both"
				initialBrushPosition={{ start: { x: 20, y: 10 }, end: { x: 80, y: 50 } }}
				onChange={(next) => setBounds(
					next ? `${next.x0},${next.x1},${next.y0},${next.y1}` : 'none',
				)}
			/>
		</svg>
		<output id="brush-bounds">{bounds}</output>
	</section>;
}

function BoundsProbe({ nodeRef, rect, parentRect }) {
	return <div
		id="bounds-probe"
		ref={nodeRef}
		data-width={rect?.width ?? -1}
		data-parent-width={parentRect?.width ?? -1}
	/>;
}

const MeasuredBoundsProbe = withBoundingRects(BoundsProbe);

export function BoundsFixture() {
	return <div id="bounds-parent">
		<MeasuredBoundsProbe />
	</div>;
}

export function TooltipFixture() {
	const tooltip = useTooltip<string>();
	const { containerRef, TooltipInPortal } = useTooltipInPortal({
		detectBounds: false,
		zIndex: 17,
	});
	const floating = useFloatingTooltip<string>({
		defaultOpen: true,
		defaultData: 'floating-data',
		defaultAnchor: { type: 'point', x: 12, y: 18 },
		interactions: false,
		placement: 'right-start',
		whileElementsMounted: undefined,
	});
	return <section id="tooltip-container" ref={containerRef}>
		<button
			id="show-tooltip"
			onClick={() => tooltip.showTooltip({
				tooltipLeft: 12,
				tooltipTop: 18,
				tooltipData: 'classic-data',
			})}
		>
			Show
		</button>
		<button id="close-floating" onClick={floating.closeTooltip}>Close floating</button>
		<output
			id="floating-state"
			data-open={floating.open}
			data-side={floating.side}
			data-align={floating.align}
		>
			{floating.data ?? ''}
		</output>
		{tooltip.tooltipOpen &&
			<TooltipInPortal
				left={tooltip.tooltipLeft}
				top={tooltip.tooltipTop}
				data-testid="classic-tooltip"
			>{tooltip.tooltipData}</TooltipInPortal>}
	</section>;
}

export function AccessibilityFixture() {
	const a11y = useChartA11y({
		id: 'behavior-chart',
		title: 'Quarterly values',
		chartType: 'line',
		data: points,
		x: (point) => point.x,
		y: (point) => point.y,
		xLabel: 'Quarter',
		yLabel: 'Value',
	});
	return <section>
		<p id={a11y.descriptionId}>{a11y.description}</p>
		<svg id={a11y.id} {...a11y.svgProps}>{points.map(
			(point, index) =>
				<circle key={point.x} cx={point.x} cy={point.y} r={3} {...a11y.getPointProps(0, index)} />,
		)}</svg>
		<a11y.DataTable visible />
		<a11y.Announcer politeness="assertive" />
	</section>;
}

function ThemeProbe() {
	const theme = useTheme();
	return <output id="theme-probe">{`${theme.name}:${theme.colors.textPrimary}`}</output>;
}

export function HookFamiliesFixture() {
	const dimensions = useChartDimensions({
		width: 300,
		height: 200,
		margin: { top: 10, right: 20, bottom: 30, left: 40 },
	});
	const scale = useScale({ type: 'linear', domain: [0, 10], range: [0, 100] });
	const axis = useAxis({ scale, numTicks: 3 });
	const pie = usePie({ data: [1, 2, 3], pieValue: (value) => value, outerRadius: 40 });
	const voronoi = useVoronoi({ width: 100, height: 100, x: 'x', y: 'y' });
	const stableId = useStableId('behavior');
	const polygon = voronoi.polygons(points)[0];
	return <div
		id="hook-families"
		data-size={`${dimensions.innerWidth}x${dimensions.innerHeight}`}
		data-scale={scale(5)}
		data-ticks={axis.ticks.length}
		data-arcs={pie.arcs.length}
		data-polygon={polygon?.length ?? 0}
		data-stable-id={stableId}
	>
		<ThemeProvider theme="light">
			<ThemeProbe />
		</ThemeProvider>
	</div>;
}
