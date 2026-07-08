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

const CURVE_FACTORIES = {
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

const defined = (p) => isWellBehavedNumber(p.x) && isWellBehavedNumber(p.y);
const areaDefined = (d) => d.base != null && defined(d.base) && defined(d);
const getX = (p) => p.x;
const getY = (p) => p.y;

const getCurveFactory = (type, layout) => {
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
};

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
}) => {
	const curveFactory = getCurveFactory(type, layout);
	const formatPoints =
		connectNulls ? points.filter(defined) : points;

	// An area chart's array `baseLine` pairs each point with its baseline
	// counterpart FIRST, so the `defined` filter drops both sides together.
	if (Array.isArray(baseLine)) {
		const areaPoints = points.map((entry, index) => ({ ...entry, base: baseLine[index] }));
		let lineFunction;
		if (layout === 'vertical') {
			lineFunction = shapeArea().y(getY).x1(getX).x0((d) => d.base.x);
		} else {
			lineFunction = shapeArea().x(getX).y1(getY).y0((d) => d.base.y);
		}
		const nullableLineFunction = lineFunction.defined(areaDefined).curve(curveFactory);
		const finalPoints =
			connectNulls ? areaPoints.filter(areaDefined) : areaPoints;
		return nullableLineFunction(finalPoints);
	}
	let lineFunction;
	if (layout === 'vertical' && isNumber(baseLine)) {
		lineFunction = shapeArea().y(getY).x1(getX).x0(baseLine);
	} else if (isNumber(baseLine)) {
		lineFunction = shapeArea().x(getX).y1(getY).y0(baseLine);
	} else {
		lineFunction = shapeLine().x(getX).y(getY);
	}
	const nullableLineFunction = lineFunction.defined(defined).curve(curveFactory);
	return nullableLineFunction(formatPoints);
};

export function Curve(props) {
	const { className, points, path, pathRef } = props;
	const layout = useChartLayout();
	if ((!points || !points.length) && !path) {
		return null;
	}
	const getPathInput = {
		type: props.type,
		points: props.points,
		baseLine: props.baseLine,
		layout: props.layout || layout,
		connectNulls: props.connectNulls,
	};
	const realPath =
		points && points.length ? getPath(getPathInput) : path;
	return <path
		{...svgPropertiesNoEvents(props)}
		{...adaptEventHandlers(props)}
		className={clsx('recharts-curve', className)}
		d={realPath === null ? undefined : realPath}
		ref={pathRef}
	/>;
}
