import type { ReactNode, SVGProps } from 'react';
import BaseBrush from './BaseBrush.tsrx';
import type { BaseBrushProps, BaseBrushState } from './BaseBrush.tsrx';
import type { BrushHandleRenderProps } from './BrushHandle.tsrx';
import type {
	Bounds,
	PartialBrushStartEnd,
	MarginShape,
	Point,
	ResizeTriggerAreas,
	Scale,
} from './types';
import { scaleInvert, getDomainFromExtent } from './utils';

const SAFE_PIXEL = 2;
const DEFAULT_COLOR = 'steelblue';
const DEFAULT_MARGIN = { top: 0, left: 0, right: 0, bottom: 0 };
const DEFAULT_RESIZE_TRIGGER_AREAS: ResizeTriggerAreas[] = ['left', 'right'];
const DEFAULT_SELECTED_BOX_STYLE = {
	fill: DEFAULT_COLOR,
	fillOpacity: 0.2,
	stroke: DEFAULT_COLOR,
	strokeWidth: 1,
	strokeOpacity: 0.8,
};

export type BrushProps = {
	/** Style object for the Brush selection rect. */
	selectedBoxStyle: SVGProps<SVGRectElement>;
	/** x-coordinate scale. */
	xScale: Scale;
	/** y-coordinate scale. */
	yScale: Scale;
	/** Brush stage height. */
	height: number;
	/** Brush stage width. */
	width: number;
	/** Callback invoked on a change in Brush bounds. */
	onChange?: (bounds: Bounds | null) => void;
	/** Callback invoked on initialization of a Brush (not Brush move). */
	onBrushStart?: BaseBrushProps['onBrushStart'];
	/** Callback invoked on mouse up when a Brush size is being updated. */
	onBrushEnd?: (bounds: Bounds | null) => void;
	/** Callback invoked on mouse move in Brush stage when *not* dragging. */
	onMouseMove?: BaseBrushProps['onMouseMove'];
	/** Callback invoked on mouse leave from Brush stage when *not* dragging. */
	onMouseLeave?: BaseBrushProps['onMouseLeave'];
	/** Callback invoked on Brush stage click. */
	onClick?: BaseBrushProps['onClick'];
	/** Margin subtracted from Brush stage dimensions. */
	margin?: MarginShape;
	/** Allowed directions for Brush dimensional change. */
	brushDirection?: 'vertical' | 'horizontal' | 'both';
	/** Initial start and end position of the Brush. */
	initialBrushPosition?: PartialBrushStartEnd;
	/** Array of rect sides and corners which should be resizeable / can trigger a Brush size change. */
	resizeTriggerAreas?: ResizeTriggerAreas[];
	/** What is being brushed, used for margin subtraction. */
	brushRegion?: 'xAxis' | 'yAxis' | 'chart';
	/** Orientation of yAxis if `brushRegion=yAxis`. */
	yAxisOrientation?: 'left' | 'right';
	/** Orientation of xAxis if `brushRegion=xAxis`. */
	xAxisOrientation?: 'top' | 'bottom';
	/** Whether movement of Brush should be disabled. */
	disableDraggingSelection: boolean;
	/** Whether changing Brush size and position by clicking overlay should be disabled. */
	disableDraggingOverlay?: boolean;
	/** Whether to reset the Brush on drag end. */
	resetOnEnd?: boolean;
	/** Size of Brush handles, applies to all `resizeTriggerAreas`. */
	handleSize: number;
	/** Prevent drag end on mouse leaving from brush stage. */
	useWindowMoveEvents?: boolean;
	/** Render function for custom brush handles. */
	renderBrushHandle?: (props: BrushHandleRenderProps) => ReactNode;
};

export default function Brush({
	xScale,
	yScale,
	height = 0,
	width = 0,
	onChange,
	onBrushStart,
	onBrushEnd,
	onMouseMove,
	onMouseLeave,
	onClick,
	margin = DEFAULT_MARGIN,
	brushDirection = 'horizontal',
	initialBrushPosition,
	resizeTriggerAreas = DEFAULT_RESIZE_TRIGGER_AREAS,
	brushRegion = 'chart',
	yAxisOrientation = 'right',
	xAxisOrientation = 'bottom',
	disableDraggingSelection = false,
	disableDraggingOverlay = false,
	resetOnEnd = false,
	handleSize = 4,
	selectedBoxStyle = DEFAULT_SELECTED_BOX_STYLE,
	useWindowMoveEvents = false,
	renderBrushHandle,
}: BrushProps) {
	function convertRangeToDomain(brush: BaseBrushState): Bounds {
		const { x0, x1, y0, y1 } = brush.extent;
		const xDomain = getDomainFromExtent(xScale, x0 || 0, x1 || 0, SAFE_PIXEL);
		const yDomain = getDomainFromExtent(yScale, y0 || 0, y1 || 0, SAFE_PIXEL);
		return {
			x0: xDomain.start || 0,
			x1: xDomain.end || 0,
			xValues: xDomain.values,
			y0: yDomain.start || 0,
			y1: yDomain.end || 0,
			yValues: yDomain.values,
		};
	}

	function handleChange(brush: BaseBrushState) {
		if (!onChange) return;
		const { x0 } = brush.extent;
		if (typeof x0 === 'undefined' || x0 < 0) {
			onChange(null);
			return;
		}
		onChange(convertRangeToDomain(brush));
	}

	function handleBrushStart(point: Point) {
		if (!onBrushStart) return;
		const invertedX = scaleInvert(xScale, point.x);
		const invertedY = scaleInvert(yScale, point.y);
		onBrushStart({
			x:
				'invert' in xScale && typeof xScale.invert !== 'undefined'
					? invertedX
					: xScale.domain()[invertedX],
			y:
				'invert' in yScale && typeof yScale.invert !== 'undefined'
					? invertedY
					: yScale.domain()[invertedY],
		});
	}

	function handleBrushEnd(brush: BaseBrushState) {
		if (!onBrushEnd) return;
		const { x0 } = brush.extent;
		if (typeof x0 === 'undefined' || x0 < 0) {
			onBrushEnd(null);
			return;
		}
		onBrushEnd(convertRangeToDomain(brush));
	}

	if (!xScale || !yScale) return null;

	let brushRegionWidth;
	let brushRegionHeight;
	let left;
	let top;
	const marginLeft = margin.left || 0;
	const marginTop = margin.top || 0;
	const marginRight = margin.right || 0;
	const marginBottom = margin.bottom || 0;

	if (brushRegion === 'chart') {
		left = 0;
		top = 0;
		brushRegionWidth = width;
		brushRegionHeight = height;
	} else if (brushRegion === 'yAxis') {
		top = 0;
		brushRegionHeight = height;
		if (yAxisOrientation === 'right') {
			left = width;
			brushRegionWidth = marginRight;
		} else {
			left = -marginLeft;
			brushRegionWidth = marginLeft;
		}
	} else {
		left = 0;
		brushRegionWidth = width;
		if (xAxisOrientation === 'bottom') {
			top = height;
			brushRegionHeight = marginBottom;
		} else {
			top = -marginTop;
			brushRegionHeight = marginTop;
		}
	}

	return (
		<BaseBrush
			width={brushRegionWidth}
			height={brushRegionHeight}
			left={left}
			top={top}
			brushDirection={brushDirection}
			disableDraggingSelection={disableDraggingSelection}
			disableDraggingOverlay={disableDraggingOverlay}
			handleSize={handleSize}
			inheritedMargin={margin}
			initialBrushPosition={initialBrushPosition}
			resetOnEnd={resetOnEnd}
			resizeTriggerAreas={resizeTriggerAreas}
			selectedBoxStyle={selectedBoxStyle}
			onBrushEnd={handleBrushEnd}
			onBrushStart={handleBrushStart}
			onChange={handleChange}
			onClick={onClick}
			onMouseLeave={onMouseLeave}
			onMouseMove={onMouseMove}
			useWindowMoveEvents={useWindowMoveEvents}
			renderBrushHandle={renderBrushHandle}
		/>
	);
}
