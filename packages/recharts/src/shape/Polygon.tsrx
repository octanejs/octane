// Port of shape/Polygon.tsx — closed/segmented polygon paths (Radar,
// PolarGrid). Path strings mirror upstream's roundTemplateLiteral output.
import { clsx } from 'clsx';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { round } from '../util/round';

function isValidatePoint(point) {
	return point != null && point.x === +point.x && point.y === +point.y;
}

function getParsedPoints(points = []) {
	let segmentPoints = [[]];
	points.forEach((entry) => {
		const lastLink = segmentPoints[segmentPoints.length - 1];
		if (isValidatePoint(entry)) {
			if (lastLink) {
				lastLink.push(entry);
			}
		} else if (lastLink && lastLink.length > 0) {
			segmentPoints.push([]);
		}
	});
	const firstPoint = points[0];
	const lastLink = segmentPoints[segmentPoints.length - 1];
	if (isValidatePoint(firstPoint) && lastLink) {
		lastLink.push(firstPoint);
	}
	const finalLink = segmentPoints[segmentPoints.length - 1];
	if (finalLink && finalLink.length <= 0) {
		segmentPoints = segmentPoints.slice(0, -1);
	}
	return segmentPoints;
}

function getSinglePolygonPath(points, connectNulls) {
	let segmentPoints = getParsedPoints(points);
	if (connectNulls) {
		segmentPoints = [segmentPoints.reduce((res, segPoints) => [...res, ...segPoints], [])];
	}
	const polygonPath = segmentPoints.map(
		(segPoints) => segPoints.reduce(
			(path, point, index) => path + (index === 0 ? 'M' : 'L') + round(point.x) + ',' +
				round(point.y),
			'',
		),
	).join('');
	return segmentPoints.length === 1 ? polygonPath + 'Z' : polygonPath;
}

function getRanglePath(points, baseLinePoints, connectNulls) {
	const outerPath = getSinglePolygonPath(points, connectNulls);
	return (outerPath.slice(-1) === 'Z' ? outerPath.slice(0, -1) : outerPath) + 'L' +
		getSinglePolygonPath(Array.from(baseLinePoints).reverse(), connectNulls).slice(1);
}

export function Polygon(props) {
	const { points, className, baseLinePoints, connectNulls, ...others } = props;
	if (!points || !points.length) {
		return null;
	}
	const layerClass = clsx('recharts-polygon', className);
	if (baseLinePoints && baseLinePoints.length) {
		const hasStroke = others.stroke && others.stroke !== 'none';
		const rangePath = getRanglePath(points, baseLinePoints, connectNulls);
		return <g className={layerClass}>
			<path
				{...svgPropertiesAndEvents(others)}
				fill={rangePath.slice(-1) === 'Z' ? others.fill : 'none'}
				stroke="none"
				d={rangePath}
			/>
			{hasStroke
				? <path
						{...svgPropertiesAndEvents(others)}
						fill="none"
						d={getSinglePolygonPath(points, connectNulls)}
					/>
				: null}
			{hasStroke
				? <path
						{...svgPropertiesAndEvents(others)}
						fill="none"
						d={getSinglePolygonPath(baseLinePoints, connectNulls)}
					/>
				: null}
		</g>;
	}
	const singlePath = getSinglePolygonPath(points, connectNulls);
	return <path
		{...svgPropertiesAndEvents(others)}
		fill={singlePath.slice(-1) === 'Z' ? others.fill : 'none'}
		className={layerClass}
		d={singlePath}
	/>;
}
