// Port of cartesian/LineDrawShape.tsx — the default Line shape: the entrance
// animation progressively reveals the path via stroke-dasharray.
import { Curve } from '../shape/Curve.tsrx';

/**
 * Reads the total length of an SVG path element, returning 0 if the element
 * is null or the measurement fails (e.g. in JSDOM).
 */
function getTotalLength(path) {
	try {
		return path && path.getTotalLength && path.getTotalLength() || 0;
	} catch {
		return 0;
	}
}

// Uses `totalLength` as the gap (not totalLength - length) to dodge a
// float-serialization artifact that paints a phantom endpoint dot with
// round/square linecaps.
function generateSimpleStrokeDasharray(totalLength, length) {
	return length + 'px ' + totalLength + 'px';
}

// Odd-length stroke-dasharray values repeat once ("5" behaves like "5 5").
function normalizeDashPattern(lines) {
	return lines.length % 2 !== 0 ? [...lines, ...lines] : lines;
}

function repeat(lines, count) {
	const result = [];
	for (let i = 0; i < count; ++i) {
		result.push(...lines);
	}
	return result;
}

/**
 * Builds a dasharray that reveals exactly `length` pixels of the user's dash
 * pattern, followed by a `totalLength` gap hiding the rest.
 */
function getStrokeDasharray(length, totalLength, lines) {
	const normalizedLines = normalizeDashPattern(lines);
	const lineLength = normalizedLines.reduce((pre, next) => pre + next, 0);
	// if lineLength is 0 return the default when no strokeDasharray is provided
	if (!lineLength) {
		return generateSimpleStrokeDasharray(totalLength, length);
	}
	const count = Math.floor(length / lineLength);
	const remainLength = length % lineLength;
	let remainLines = [];
	for (let i = 0, sum = 0; i < normalizedLines.length; (sum += normalizedLines[i] ?? 0, ++i)) {
		const lineValue = normalizedLines[i];
		if (lineValue != null && sum + lineValue > remainLength) {
			remainLines = [...normalizedLines.slice(0, i), remainLength - sum];
			break;
		}
	}
	const emptyLines =
		remainLines.length % 2 === 0 ? [0, totalLength] : [totalLength];
	return [...repeat(normalizedLines, count), ...remainLines, ...emptyLines].map(
		(line) => line + 'px',
	).join(', ');
}

function computeAnimatedStrokeDasharray(userStrokeDasharray, totalLength, visibleLength) {
	if (userStrokeDasharray) {
		const lines = String(userStrokeDasharray).split(/[,\s]+/gim).map((num) => parseFloat(num));
		return getStrokeDasharray(visibleLength, totalLength, lines);
	}
	return generateSimpleStrokeDasharray(totalLength, visibleLength);
}

/**
 * The default shape for Line: the entrance animation reveals the path through
 * `strokeDasharray` as animationElapsedTime goes 0 → 1.
 * @since 3.9
 */
export function LineDrawShape(props) {
	const {
		animationElapsedTime,
		isAnimating,
		isEntrance,
		visibleLength,
		strokeDasharray: userStrokeDasharray,
		connectNulls,
		...curveProps
	} = props;
	const finalConnectNulls = connectNulls ?? false;
	let strokeDasharray;
	if (visibleLength != null) {
		const { pathRef } = curveProps;
		const totalLength = getTotalLength(pathRef?.current ?? null);
		strokeDasharray = computeAnimatedStrokeDasharray(
			userStrokeDasharray,
			totalLength,
			visibleLength,
		);
	} else if (userStrokeDasharray != null) {
		strokeDasharray = String(userStrokeDasharray);
	}
	return <Curve
		{...curveProps}
		connectNulls={finalConnectNulls}
		strokeDasharray={strokeDasharray}
	/>;
}
