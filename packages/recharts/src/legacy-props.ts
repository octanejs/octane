import type { OctaneNode } from 'octane';

type Render = OctaneNode | ((...args: any[]) => OctaneNode);
type Handler = (...args: any[]) => void;

/**
 * Legacy broad prop bag retained for source compatibility only.
 * @deprecated Use the specific exported component prop type instead.
 * No rendered component uses this interface as its props contract.
 */
export interface RechartsProps {
	accessibilityLayer?: boolean;
	allowDecimals?: boolean;
	activeBar?: Render | Record<string, unknown>;
	activeDot?: Render;
	activeIndex?: number;
	activeShape?: Render | Record<string, unknown>;
	angle?: number;
	animationBegin?: number;
	animationDuration?: number;
	animationEasing?: string;
	aspect?: number;
	axisLine?: boolean | Record<string, unknown>;
	barCategoryGap?: number | string;
	barGap?: number | string;
	barSize?: number | string;
	baseValue?: number | 'dataMin' | 'dataMax';
	background?: Render | Record<string, unknown>;
	children?: OctaneNode;
	className?: string;
	color?: string;
	connectNulls?: boolean;
	content?: Render | Record<string, unknown>;
	cursor?: Render | Record<string, unknown>;
	cx?: number | string;
	cy?: number | string;
	data?: readonly unknown[];
	dataKey?: string | number | ((entry: unknown) => unknown);
	debounce?: number;
	domain?: readonly unknown[];
	dot?: Render | Record<string, unknown>;
	dy?: number | string;
	endAngle?: number;
	fill?: string;
	fillOpacity?: number;
	fontFamily?: string;
	fontSize?: number | string;
	formatter?: (...args: any[]) => OctaneNode;
	height?: number | string;
	hide?: boolean;
	horizontal?: boolean;
	id?: string;
	innerRadius?: number | string;
	interval?: number | string;
	isAnimationActive?: boolean;
	label?: Render | Record<string, unknown>;
	labelLine?: boolean | Record<string, unknown>;
	labelFormatter?: (...args: any[]) => OctaneNode;
	layout?: 'horizontal' | 'vertical' | 'centric' | 'radial';
	legendType?: string;
	line?: boolean | Record<string, unknown>;
	link?: Render | Record<string, unknown>;
	linkCurvature?: number;
	margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
	maxBarSize?: number;
	maxHeight?: number;
	minTickGap?: number;
	minHeight?: number | string;
	minPointSize?: number | ((value: unknown) => number);
	minWidth?: number | string;
	name?: string | number;
	nameKey?: string | number | ((entry: unknown) => unknown);
	node?: Render | Record<string, unknown>;
	nodePadding?: number;
	nodeWidth?: number;
	onAnimationEnd?: Handler;
	onAnimationStart?: Handler;
	onClick?: Handler;
	onMouseEnter?: Handler;
	onMouseLeave?: Handler;
	onResize?: (width: number, height: number) => void;
	orientation?: string;
	outerRadius?: number | string;
	offset?: number;
	paddingAngle?: number;
	padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
	payload?: Record<string, any> | readonly Record<string, any>[];
	position?: string | { x?: number; y?: number };
	radius?: number | readonly number[];
	range?: readonly number[];
	ref?: unknown;
	reversed?: boolean;
	ringPadding?: number;
	scale?: string | ((value: unknown) => unknown);
	shape?: Render | Record<string, unknown>;
	stackId?: string | number;
	stackOffset?: string;
	startAngle?: number;
	stroke?: string;
	strokeDasharray?: string | number;
	strokeOpacity?: number;
	strokeWidth?: number;
	style?: object;
	syncId?: string | number;
	textAnchor?: string;
	textOptions?: Record<string, unknown>;
	tick?: Render | Record<string, unknown>;
	tickCount?: number;
	tickFormatter?: (value: any, index: number) => string;
	tickLine?: boolean | Record<string, unknown>;
	ticks?: readonly unknown[];
	tooltipType?: string;
	type?: string;
	unit?: string | number;
	valueKey?: string | number | ((entry: unknown) => unknown);
	vertical?: boolean;
	verticalAlign?: 'top' | 'middle' | 'bottom';
	iterations?: number;
	width?: number | string;
	xAxisId?: string | number;
	yAxisId?: string | number;
	zAxisId?: string | number;
}

/** @deprecated Brush is not implemented by the Octane runtime port. */
export type BrushProps = RechartsProps;

/** @deprecated Treemap is not implemented by the Octane runtime port. */
export type TreemapProps = RechartsProps;
