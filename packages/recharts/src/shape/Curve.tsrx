import type { Ref, SVGProps } from '../util/OctaneTypes.ts';
import type {
	Area as D3AreaCurve,
	CurveFactory,
	Line as D3LineCurve,
} from 'victory-vendor/d3-shape';
import type {
	Coordinate,
	LayoutType,
	NullableCoordinate,
	PresentationAttributesWithProps,
	RechartsMouseEventHandler,
} from '../util/types';

interface CurveFactories {
	[index: string]: CurveFactory;
}
export type CurveType =
	| 'basis'
	| 'basisClosed'
	| 'basisOpen'
	| 'bumpX'
	| 'bumpY'
	| 'bump'
	| 'linear'
	| 'linearClosed'
	| 'natural'
	| 'monotoneX'
	| 'monotoneY'
	| 'monotone'
	| 'step'
	| 'stepBefore'
	| 'stepAfter'
	| CurveFactory;
type AreaPoint =
	Coordinate & {
		base: Coordinate;
	};
type NullableAreaPoint =
	NullableCoordinate & {
		base?: NullableCoordinate;
	};
export type BaseLineType = number | ReadonlyArray<NullableCoordinate>;
interface CurveProps {
	className?: SVGProps<SVGPathElement>['className'];
	type?: CurveType;
	layout?: LayoutType;
	baseLine?: BaseLineType;
	points?: ReadonlyArray<NullableCoordinate>;
	connectNulls?: boolean;
	path?: string;
	pathRef?: Ref<SVGPathElement>;
	strokeDasharray?: string | number;
}
export type CurveMouseEventHandler = RechartsMouseEventHandler<Props, SVGPathElement>;
type CurveMouseEvents = {
	onClick?: CurveMouseEventHandler;
	onMouseEnter?: CurveMouseEventHandler;
	onMouseLeave?: CurveMouseEventHandler;
	onMouseDown?: CurveMouseEventHandler;
	onMouseUp?: CurveMouseEventHandler;
	onMouseMove?: CurveMouseEventHandler;
	onMouseOver?: CurveMouseEventHandler;
	onMouseOut?: CurveMouseEventHandler;
};
export type Props =
	Omit<
		PresentationAttributesWithProps<CurveProps, SVGPathElement>,
		| 'type'
		| 'points'
		| 'onClick'
		| 'onMouseEnter'
		| 'onMouseLeave'
		| 'onMouseDown'
		| 'onMouseUp'
		| 'onMouseMove'
		| 'onMouseOver'
		| 'onMouseOut'
	> & CurveMouseEvents & CurveProps;
type GetPathProps = Pick<Props, 'type' | 'points' | 'baseLine' | 'layout' | 'connectNulls'>;
// Port of shape/Curve.tsx — the line/area path. The `d` string comes straight
// from victory-vendor's d3-shape line/area generators (same dependency, same
// version as upstream), so output is byte-identical by construction.
import {
	area as shapeArea,
	curveBasis,
	curveBasisClosed,
	curveBasisOpen,
	curveBumpX,
	curveBumpY,
	curveLinear,
	curveLinearClosed,
	curveMonotoneX,
	curveMonotoneY,
	curveNatural,
	curveStep,
	curveStepAfter,
	curveStepBefore,
	line as shapeLine,
} from 'victory-vendor/d3-shape';
import { clsx } from 'clsx';
import { adaptEventHandlers } from '../util/types.ts';
import { isNumber, upperFirst } from '../util/DataUtils';
import { isWellBehavedNumber } from '../util/isWellBehavedNumber';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import { useChartLayout } from '../context/chartLayoutContext.ts';

const CURVE_FACTORIES: CurveFactories = {
	curveBasisClosed,
	curveBasisOpen,
	curveBasis,
	curveBumpX,
	curveBumpY,
	curveLinearClosed,
	curveLinear,
	curveMonotoneX,
	curveMonotoneY,
	curveNatural,
	curveStep,
	curveStepAfter,
	curveStepBefore,
};

const defined = (p: NullableCoordinate) => isWellBehavedNumber(p.x) && isWellBehavedNumber(p.y);
const areaDefined = (d: NullableAreaPoint) => d.base != null && defined(d.base) && defined(d);
const getX = (p: Coordinate) => p.x;
const getY = (p: Coordinate) => p.y;

const getCurveFactory = (type: CurveType, layout: LayoutType | undefined) => {
	if (typeof type === 'function') {
		return type;
	}
	const name = 'curve' + upperFirst(type);
	if ((name === 'curveMonotone' || name === 'curveBump') && layout) {
		const factory = CURVE_FACTORIES[name + (layout === 'vertical' ? 'Y' : 'X')];
		if (factory) {
			return factory;
		}
	}
	return CURVE_FACTORIES[name] || curveLinear;
};

export const defaultCurveProps = {
	connectNulls: false,
	type: 'linear',
} as const satisfies Partial<Props>;

/**
 * Calculate the path of curve. Returns null if points is an empty array.
 * @return path or null
 */
export const getPath = ({
	type = defaultCurveProps.type,
	points = [],
	baseLine,
	layout,
	connectNulls = defaultCurveProps.connectNulls,
}: GetPathProps): string | null => {
	const curveFactory = getCurveFactory(type, layout);
	const formatPoints: ReadonlyArray<NullableCoordinate> =
		connectNulls ? points.filter(defined) : points;

	// An area chart's array `baseLine` pairs each point with its baseline
	// counterpart FIRST, so the `defined` filter drops both sides together.
	if (Array.isArray(baseLine)) {
		const areaPoints: ReadonlyArray<NullableAreaPoint> = points.map(
			(entry, index) => ({ ...entry, base: baseLine[index] }),
		);
		let lineFunction: D3AreaCurve<AreaPoint>;
		if (layout === 'vertical') {
			lineFunction = shapeArea<AreaPoint>().y(getY).x1(getX).x0((d) => d.base.x);
		} else {
			lineFunction = shapeArea<AreaPoint>().x(getX).y1(getY).y0((d) => d.base.y);
		}
		// d3 runs the defined predicate before coordinate accessors; its single
		// generic cannot express the nullable inputs accepted after this guard.
		const nullableLineFunction = lineFunction.defined(areaDefined).curve(
			curveFactory,
		) as D3AreaCurve<NullableAreaPoint>;
		const finalPoints: ReadonlyArray<NullableAreaPoint> =
			connectNulls ? areaPoints.filter(areaDefined) : areaPoints;
		return nullableLineFunction(finalPoints);
	}
	let lineFunction: D3LineCurve<Coordinate> | D3AreaCurve<Coordinate>;
	if (layout === 'vertical' && isNumber(baseLine)) {
		lineFunction = shapeArea<Coordinate>().y(getY).x1(getX).x0(baseLine);
	} else if (isNumber(baseLine)) {
		lineFunction = shapeArea<Coordinate>().x(getX).y1(getY).y0(baseLine);
	} else {
		lineFunction = shapeLine<Coordinate>().x(getX).y(getY);
	}
	const nullableLineFunction = lineFunction.defined(defined).curve(curveFactory) as D3LineCurve<
		NullableCoordinate
	>;
	return nullableLineFunction(formatPoints);
};

export function Curve(props: Props) {
	const { className, points, path, pathRef } = props;
	const layout = useChartLayout();
	if ((!points || !points.length) && !path) {
		return null;
	}
	const getPathInput: GetPathProps = {
		type: props.type,
		points: props.points,
		baseLine: props.baseLine,
		layout: props.layout || layout,
		connectNulls: props.connectNulls,
	};
	const realPath: string | null | undefined =
		points && points.length ? getPath(getPathInput) : path;
	return <path
		{...svgPropertiesNoEvents(props)}
		{...adaptEventHandlers(props)}
		className={clsx('recharts-curve', className)}
		d={realPath === null ? undefined : realPath}
		ref={pathRef}
	/>;
}
