// Port of shape/Sector.tsx — the pie/radial-bar wedge (arc path with optional
// per-corner rounding). Path strings must be BYTE-IDENTICAL to upstream:
// recharts builds them with roundTemplateLiteral (every interpolated number
// rounded to 4dp, template whitespace/newlines preserved verbatim) — the
// template literals below reproduce upstream's exact strings including their
// embedded newlines and indentation.
import { clsx } from 'clsx';
import { polarToCartesian, RADIAN } from '../vendor/util/PolarUtils';
import { getPercentValue, mathSign } from '../vendor/util/DataUtils';
import { resolveDefaultProps } from '../vendor/util/resolveDefaultProps';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { roundTemplateLiteral } from '../vendor/util/round';

const getDeltaAngle = (startAngle, endAngle) => {
	const sign = mathSign(endAngle - startAngle);
	const deltaAngle = Math.min(Math.abs(endAngle - startAngle), 359.999);
	return sign * deltaAngle;
};

const getTangentCircle = ({
	cx,
	cy,
	radius,
	angle,
	sign,
	isExternal,
	cornerRadius,
	cornerIsExternal,
}) => {
	const centerRadius = cornerRadius * (isExternal ? 1 : -1) + radius;
	const theta = Math.asin(cornerRadius / centerRadius) / RADIAN;
	const centerAngle = cornerIsExternal ? angle : angle + sign * theta;
	const center = polarToCartesian(cx, cy, centerRadius, centerAngle);
	// The coordinate of point which is tangent to the circle
	const circleTangency = polarToCartesian(cx, cy, radius, centerAngle);
	// The coordinate of point which is tangent to the radius line
	const lineTangencyAngle = cornerIsExternal ? angle - sign * theta : angle;
	const lineTangency = polarToCartesian(
		cx,
		cy,
		centerRadius * Math.cos(theta * RADIAN),
		lineTangencyAngle,
	);
	return { center, circleTangency, lineTangency, theta };
};

const getSectorPath = ({ cx, cy, innerRadius, outerRadius, startAngle, endAngle }) => {
	const angle = getDeltaAngle(startAngle, endAngle);

	// When the angle of sector equals to 360, start point and end point coincide
	const tempEndAngle = startAngle + angle;
	const outerStartPoint = polarToCartesian(cx, cy, outerRadius, startAngle);
	const outerEndPoint = polarToCartesian(cx, cy, outerRadius, tempEndAngle);
	// Hoisted arc flags — inline `${+(…)}` expressions survive byte-identically
	// but prettier splays them across lines; the string chunks stay verbatim.
	const largeArc = +(Math.abs(angle) > 180);
	const outerSweep = +(startAngle > tempEndAngle);
	let path = roundTemplateLiteral`M ${outerStartPoint.x},${outerStartPoint.y}
    A ${outerRadius},${outerRadius},0,
    ${largeArc},${outerSweep},
    ${outerEndPoint.x},${outerEndPoint.y}
  `;
	if (innerRadius > 0) {
		const innerStartPoint = polarToCartesian(cx, cy, innerRadius, startAngle);
		const innerEndPoint = polarToCartesian(cx, cy, innerRadius, tempEndAngle);
		const innerSweep = +(startAngle <= tempEndAngle);
		path +=
			roundTemplateLiteral`L ${innerEndPoint.x},${innerEndPoint.y}
            A ${innerRadius},${innerRadius},0,
            ${largeArc},${innerSweep},
            ${innerStartPoint.x},${innerStartPoint.y} Z`;
	} else {
		path += roundTemplateLiteral`L ${cx},${cy} Z`;
	}
	return path;
};

const getSectorWithCorner = ({
	cx,
	cy,
	innerRadius,
	outerRadius,
	cornerRadius,
	forceCornerRadius,
	cornerIsExternal,
	startAngle,
	endAngle,
}) => {
	const sign = mathSign(endAngle - startAngle);
	const { circleTangency: soct, lineTangency: solt, theta: sot } = getTangentCircle({
		cx,
		cy,
		radius: outerRadius,
		angle: startAngle,
		sign,
		cornerRadius,
		cornerIsExternal,
	});
	const { circleTangency: eoct, lineTangency: eolt, theta: eot } = getTangentCircle({
		cx,
		cy,
		radius: outerRadius,
		angle: endAngle,
		sign: -sign,
		cornerRadius,
		cornerIsExternal,
	});
	const outerArcAngle =
		cornerIsExternal
			? Math.abs(startAngle - endAngle)
			: Math.abs(startAngle - endAngle) - sot - eot;
	if (outerArcAngle < 0) {
		if (forceCornerRadius) {
			const cornerDiameter = cornerRadius * 2;
			return roundTemplateLiteral`M ${solt.x},${solt.y}
        a${cornerRadius},${cornerRadius},0,0,1,${cornerDiameter},0
        a${cornerRadius},${cornerRadius},0,0,1,${-cornerDiameter},0
      `;
		}
		return getSectorPath({ cx, cy, innerRadius, outerRadius, startAngle, endAngle });
	}
	const sweep = +(sign < 0);
	const outerLargeArc = +(outerArcAngle > 180);
	let path = roundTemplateLiteral`M ${solt.x},${solt.y}
    A${cornerRadius},${cornerRadius},0,0,${sweep},${soct.x},${soct.y}
    A${outerRadius},${outerRadius},0,${outerLargeArc},${sweep},${eoct.x},${eoct.y}
    A${cornerRadius},${cornerRadius},0,0,${sweep},${eolt.x},${eolt.y}
  `;
	if (innerRadius > 0) {
		const { circleTangency: sict, lineTangency: silt, theta: sit } = getTangentCircle({
			cx,
			cy,
			radius: innerRadius,
			angle: startAngle,
			sign,
			isExternal: true,
			cornerRadius,
			cornerIsExternal,
		});
		const { circleTangency: eict, lineTangency: eilt, theta: eit } = getTangentCircle({
			cx,
			cy,
			radius: innerRadius,
			angle: endAngle,
			sign: -sign,
			isExternal: true,
			cornerRadius,
			cornerIsExternal,
		});
		const innerArcAngle =
			cornerIsExternal
				? Math.abs(startAngle - endAngle)
				: Math.abs(startAngle - endAngle) - sit - eit;
		if (innerArcAngle < 0 && cornerRadius === 0) {
			return path + 'L' + cx + ',' + cy + 'Z';
		}
		const innerLargeArc = +(innerArcAngle > 180);
		const innerSweep = +(sign > 0);
		path +=
			roundTemplateLiteral`L${eilt.x},${eilt.y}
      A${cornerRadius},${cornerRadius},0,0,${sweep},${eict.x},${eict.y}
      A${innerRadius},${innerRadius},0,${innerLargeArc},${innerSweep},${sict.x},${sict.y}
      A${cornerRadius},${cornerRadius},0,0,${sweep},${silt.x},${silt.y}Z`;
	} else {
		path += roundTemplateLiteral`L${cx},${cy}Z`;
	}
	return path;
};

export const defaultSectorProps = {
	cx: 0,
	cy: 0,
	innerRadius: 0,
	outerRadius: 0,
	startAngle: 0,
	endAngle: 0,
	cornerRadius: 0,
	forceCornerRadius: false,
	cornerIsExternal: false,
};

export function Sector(sectorProps) {
	const props = resolveDefaultProps(sectorProps, defaultSectorProps);
	const {
		cx,
		cy,
		innerRadius,
		outerRadius,
		cornerRadius,
		forceCornerRadius,
		cornerIsExternal,
		startAngle,
		endAngle,
		className,
	} = props;
	if (outerRadius < innerRadius || startAngle === endAngle) {
		return null;
	}
	const layerClass = clsx('recharts-sector', className);
	const deltaRadius = outerRadius - innerRadius;
	const cr = getPercentValue(cornerRadius, deltaRadius, 0, true);
	let path;
	if (cr > 0 && Math.abs(startAngle - endAngle) < 360) {
		path = getSectorWithCorner({
			cx,
			cy,
			innerRadius,
			outerRadius,
			cornerRadius: Math.min(cr, deltaRadius / 2),
			forceCornerRadius,
			cornerIsExternal,
			startAngle,
			endAngle,
		});
	} else {
		path = getSectorPath({ cx, cy, innerRadius, outerRadius, startAngle, endAngle });
	}
	return <path {...svgPropertiesAndEvents(props)} className={layerClass} d={path} />;
}
